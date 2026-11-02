import { db } from '../db/database';
import { createRouter } from '../http';
import { Case, CourtDocument, CaseHistoryEvent, Hearing } from '../../src/types';
import { EcourtService } from '../services/ecourtService';
import { IndianKanoonService } from '../services/indianKanoonService';
import { PdfService } from '../services/pdfService';
import { generateCaseInsights, insightSignature, INSIGHTS_VERSION } from '../services/ai/caseInsights';
import { buildOrderAnalysis, hydrateCaseOrders } from '../services/orderContentService';
import { EcourtSearchParams, EcourtSearchResult, EcourtsCreditsError, EcourtsUnavailableError } from '../services/ecourtService';
import { askCaseCoach } from '../services/ai/caseCoach';
import { findSimilarPrecedents } from '../services/ai/precedents';
import { simulateRegistryUpdate } from '../services/caseUpdateService';
import {
  attorneyUpdateDetails,
  documentDetails,
  newHearingDetails,
  notifyCaseFollowers
} from '../services/notificationService';
import {
  enrichCase,
  findOrFetchCase,
  isKanoonCase,
  isEcourtCase,
  kanoonMissingMetadata,
  ecourtNeedsRefresh,
  ecourtStale
} from '../services/caseEnrichment';

// Mounted behind requireAuth: req.user is always the signed-in user
export const caseRoutes = createRouter();

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`;

function queryString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  return value ? String(value) : fallback;
}

// ==========================================
// Search & lookup
// ==========================================

// Query parameters accepted by /search, passed through to the eCourts v2 search
const ECOURT_FILTER_KEYS: (keyof EcourtSearchParams)[] = [
  'stateCode', 'districtCode', 'courtCode', 'courtLevel', 'caseType', 'caseStatus', 'caseCategory',
  'judicialSection', 'benchType', 'filingYear', 'decisionYear', 'filingDateFrom', 'filingDateTo',
  'decisionDateFrom', 'decisionDateTo', 'hasOrders', 'hasJudgments', 'petitioner', 'respondent',
  'litigant', 'advocate', 'judge', 'actsAndSections', 'nameMatchMode', 'sortBy'
];

// Search eCourts (with the full registry filter set) and Indian Kanoon concurrently
caseRoutes.get('/search', async (req, res) => {
  const q = queryString(req.query.q).trim();
  const searchBy = queryString(req.query.searchBy, 'all');
  const page = Math.max(1, parseInt(queryString(req.query.page, '1'), 10) || 1);
  const source = queryString(req.query.source, 'all').toLowerCase();

  const params: EcourtSearchParams = { query: q, searchBy, page, pageSize: 20 };
  for (const key of ECOURT_FILTER_KEYS) {
    const value = queryString(req.query[key]).trim();
    if (value) (params as any)[key] = value;
  }
  const hasFilters = ECOURT_FILTER_KEYS.some(k => k !== 'sortBy' && k !== 'nameMatchMode' && params[k]);

  console.log(`[Search Registry API] query="${q}" source="${source}" page=${page} filters=${JSON.stringify(Object.fromEntries(ECOURT_FILTER_KEYS.filter(k => params[k]).map(k => [k, params[k]])))}`);

  const shouldFetchEcourt = source === 'all' || source === 'ecourts' || source === 'ecourt';
  // Indian Kanoon is a text search of reported judgments; registry filters do not apply to it
  const shouldFetchKanoon = (source === 'all' || source === 'kanoon' || source === 'indiankanoon') && q.length >= 2 && (!hasFilters || source !== 'all');

  // A registry problem is reported alongside any Indian Kanoon results instead of failing silently
  let registryError: string | undefined;
  const emptyRegistry: EcourtSearchResult = { results: [], totalHits: 0, page, totalPages: 0, hasNextPage: false };

  const [ecourt, kanoonResults] = await Promise.all([
    shouldFetchEcourt
      ? EcourtService.searchCasesV2(params).catch(err => {
          console.warn("[E-Courts API] Search error:", err.message);
          registryError = err instanceof EcourtsCreditsError || err instanceof EcourtsUnavailableError
            ? err.message
            : 'The eCourts registry search failed. Please try again.';
          return emptyRegistry;
        })
      : Promise.resolve(emptyRegistry),
    shouldFetchKanoon
      ? IndianKanoonService.searchCasesAsync(q, page - 1)
          .then(results => results.map(c => ({ ...c, source: 'Indian Kanoon' as const })))
          .catch(err => {
            console.warn("[Indian Kanoon API] Search error:", err.message);
            return [] as Case[];
          })
      : Promise.resolve([] as Case[])
  ]);

  // De-duplicate results
  const seenIds = new Set<string>();
  const results = [...ecourt.results, ...kanoonResults].filter(item => {
    if (!item?.id || seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });

  if (registryError && results.length === 0) {
    return res.status(502).json({ error: registryError });
  }

  res.json({
    results,
    totalHits: ecourt.totalHits + kanoonResults.length,
    ecourtsTotalHits: ecourt.totalHits,
    page,
    totalPages: Math.max(ecourt.totalPages, kanoonResults.length >= 10 ? page + 1 : page),
    hasNextPage: ecourt.hasNextPage || kanoonResults.length >= 10,
    facetCounts: ecourt.facetCounts || {},
    registryError
  });
});

// Filter options offered by the eCourts registry
caseRoutes.get('/search-filters', async (req, res) => {
  res.json(await EcourtService.getSearchFilterOptions());
});

caseRoutes.get('/search-filters/districts', async (req, res) => {
  const state = queryString(req.query.state).trim();
  res.json(state ? await EcourtService.getDistricts(state) : []);
});

caseRoutes.get('/search-filters/courts', async (req, res) => {
  const state = queryString(req.query.state).trim() || undefined;
  const district = queryString(req.query.district).trim() || undefined;
  const level = queryString(req.query.level).trim() || undefined;
  // Without a state or district the list would hold every court in India
  if (!state && !district && level !== 'SC' && level !== 'HC') return res.json([]);
  res.json(await EcourtService.getCourts(state, district, level));
});

// Tracked cases for a user, enriched with any missing registry details
caseRoutes.get('/tracked', async (req, res) => {
  const caseIds = db.getTrackedCaseIds(req.user!.id);
  const trackedCases = db.getGlobalCases().filter(c => caseIds.includes(c.id));

  const enrichedCases = await Promise.all(trackedCases.map(c =>
    enrichCase(c, { kanoon: kanoonMissingMetadata, ecourt: ecourtNeedsRefresh })
  ));

  res.json(enrichedCases);
});

// AI insights & suggestions for a case (Gemini, or the document-based fallback)
caseRoutes.get('/insights', async (req, res) => {
  const caseId = req.query.caseId as string;
  const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
  if (!caseId) {
    return res.status(400).json({ error: "caseId is required" });
  }

  let c = await findOrFetchCase(caseId);
  if (!c) {
    return res.status(404).json({ error: "Case not found" });
  }

  // The analysis covers the whole case: pick up new orders, then load every order's official text
  c = await enrichCase(c, {
    kanoon: x => !x.orders?.[0]?.fullText || !x.courtRoom || !x.judge || x.judge === "Hon'ble Bench",
    ecourt: ecourtStale
  });
  c = (await hydrateCaseOrders(c.id)) || c;

  // Stored analysis is reused only while it reflects the same orders and status
  const stored = c.aiInsights;
  if (stored && !forceRefresh && stored.version === INSIGHTS_VERSION && stored.sourceSignature === insightSignature(c)) {
    return res.json(stored);
  }

  try {
    const insights = await generateCaseInsights(c);
    const latest = db.getCaseById(c.id) || c;
    db.updateCase({ ...latest, aiInsights: insights });
    res.json(insights);
  } catch (err) {
    console.error("AI insights generation error:", err);
    res.status(500).json({ error: "Failed to generate AI legal insights." });
  }
});

// Find similar precedents for a free-text query & category
caseRoutes.get('/precedents-search', async (req, res) => {
  const q = (req.query.q as string) || '';
  const category = (req.query.category as string) || '';
  if (!q.trim()) {
    return res.status(400).json({ error: "Search query q is required." });
  }

  try {
    const results = await findSimilarPrecedents(q, category);
    res.json(results);
  } catch (err) {
    console.error("Precedents search failed:", err);
    res.status(500).json({ error: "Failed to search for similar legal precedents." });
  }
});

// ==========================================
// Portfolio tracking
// ==========================================

caseRoutes.post('/track', async (req, res) => {
  const userId = req.user!.id;
  let { caseData } = req.body;
  if (!caseData || !caseData.id) {
    return res.status(400).json({ error: "caseData is required" });
  }

  // Pull full registry details before storing the case
  caseData = await enrichCase(caseData);

  if (!db.getCaseById(caseData.id)) {
    db.addGlobalCase(caseData);
  } else {
    db.updateCase(caseData);
  }

  db.trackCase(userId, caseData.id);
  db.saveToMongo().catch(err => console.warn("Background Mongo save on track error:", err));
  res.json({ success: true, message: "Case added to system successfully", case: caseData });
});

caseRoutes.post('/track-bulk', async (req, res) => {
  const userId = req.user!.id;
  const { casesData } = req.body;
  if (!Array.isArray(casesData)) {
    return res.status(400).json({ error: "casesData array is required" });
  }

  const added: string[] = [];
  for (const caseData of casesData) {
    if (caseData && caseData.id) {
      if (!db.getCaseById(caseData.id)) {
        db.addGlobalCase(caseData);
      }
      db.trackCase(userId, caseData.id);
      added.push(caseData.id);
    }
  }

  db.saveToMongo().catch(err => console.warn("Background Mongo save on track-bulk error:", err));

  res.json({
    success: true,
    message: `Successfully added ${added.length} cases to dashboard`,
    addedCount: added.length
  });
});

caseRoutes.post('/untrack', async (req, res) => {
  const { caseId } = req.body;
  if (!caseId) {
    return res.status(400).json({ error: "caseId is required" });
  }

  db.untrackCase(req.user!.id, caseId);
  db.saveToMongo().catch(err => console.warn("Background Mongo save on untrack error:", err));
  res.json({ success: true, message: "Case untracked successfully" });
});

// ==========================================
// Case file changes
// ==========================================

// Create a brand new case file (used by the strategy predictor)
caseRoutes.post('/create', (req, res) => {
  const newCase = req.body;
  if (!newCase || !newCase.id || !newCase.caseNumber || !newCase.title) {
    return res.status(400).json({ error: "Invalid case data structure." });
  }
  if (db.getCaseById(newCase.id)) {
    return res.status(400).json({ error: "Case already exists." });
  }
  db.addGlobalCase(newCase);
  res.json({ success: true, case: newCase });
});

// Update case status & add history (attorney)
caseRoutes.post('/update', async (req, res) => {
  const { caseId, currentStatus, title, description, updatedBy } = req.body;
  if (!caseId || !currentStatus || !title || !description || !updatedBy) {
    return res.status(400).json({ error: "All update fields are required" });
  }

  const item = db.getCaseById(caseId);
  if (!item) {
    return res.status(404).json({ error: "Case not found" });
  }

  const newEvent: CaseHistoryEvent = {
    id: randomId('h'),
    date: new Date().toISOString(),
    title,
    description,
    status: currentStatus,
    updatedBy
  };

  const updatedCase: Case = {
    ...item,
    currentStatus,
    lastUpdated: new Date().toISOString(),
    history: [newEvent, ...item.history]
  };

  db.updateCase(updatedCase);

  await notifyCaseFollowers(updatedCase, {
    subject: `CASE STATUS UPDATE: ${updatedCase.caseNumber} - ${title}`,
    title: "Official Attorney Case Update",
    body: `Your assigned attorney, ${updatedBy}, has posted a legal update to your active tracked case.`,
    detailsHtml: attorneyUpdateDetails(title, currentStatus, description, updatedBy),
    type: 'alert'
  });

  res.json({ success: true, case: updatedCase });
});

// Add a court document (attorney)
caseRoutes.post('/add-document', async (req, res) => {
  const { caseId, docName, docCategory, docDescription, attorneyName } = req.body;
  if (!caseId || !docName || !docCategory || !docDescription || !attorneyName) {
    return res.status(400).json({ error: "All document fields are required" });
  }

  const item = db.getCaseById(caseId);
  if (!item) {
    return res.status(404).json({ error: "Case not found" });
  }

  const newDoc: CourtDocument = {
    id: randomId('doc'),
    name: docName,
    category: docCategory,
    uploadDate: new Date().toISOString().split('T')[0],
    size: `${(Math.random() * 3 + 1).toFixed(1)} MB`,
    description: docDescription,
    attorneyName
  };

  const updatedCase: Case = {
    ...item,
    documents: [newDoc, ...item.documents],
    lastUpdated: new Date().toISOString()
  };

  db.updateCase(updatedCase);

  await notifyCaseFollowers(updatedCase, {
    subject: `NEW DOCUMENT ADDED: ${updatedCase.caseNumber} - ${docName}`,
    title: "New Court Document Filed",
    body: `Your attorney ${attorneyName} has uploaded a new court document to your case file.`,
    detailsHtml: documentDetails(newDoc),
    type: 'alert'
  });

  res.json({ success: true, doc: newDoc, case: updatedCase });
});

// Schedule a hearing (attorney)
caseRoutes.post('/add-hearing', async (req, res) => {
  const { caseId, title, date, time, courtRoom, description } = req.body;
  if (!caseId || !title || !date || !time || !courtRoom) {
    return res.status(400).json({ error: "Case ID, hearing title, date, time, and courtroom are required" });
  }

  const item = db.getCaseById(caseId);
  if (!item) {
    return res.status(404).json({ error: "Case not found" });
  }

  const updatedCase: Case = {
    ...item,
    nextHearingDate: date,
    courtRoom,
    lastUpdated: new Date().toISOString()
  };
  db.updateCase(updatedCase);

  const newHearing: Hearing = {
    id: randomId('hearing'),
    caseId,
    caseTitle: item.title,
    title,
    date,
    time,
    courtRoom,
    description: description || "Regular scheduled review listing.",
    status: 'upcoming'
  };

  db.addHearing(newHearing);

  await notifyCaseFollowers(updatedCase, {
    subject: `NEW COURT HEARING LISTED: ${updatedCase.caseNumber} - ${title}`,
    title: "New Hearing Date Scheduled",
    body: `Your legal counsel has successfully scheduled and logged a new hearing listed by the court registrar.`,
    detailsHtml: newHearingDetails(title, date, time, courtRoom, description),
    type: 'hearing'
  });

  res.json({ success: true, hearing: newHearing, case: updatedCase });
});

// Simulate an automated real-time case update from the registry
caseRoutes.post('/simulate-update', async (req, res) => {
  const { caseId, updatedBy } = req.body;
  if (!caseId) {
    return res.status(400).json({ error: "caseId is required" });
  }

  const result = await simulateRegistryUpdate(caseId, updatedBy || "ECI Live Registry Daemon");
  if (!result) {
    return res.status(404).json({ error: "Case not found" });
  }

  res.json({ success: true, case: result });
});

// AI chat coach for a specific case
caseRoutes.post('/chat', async (req, res) => {
  const { caseId, message, history } = req.body;
  if (!caseId || !message) {
    return res.status(400).json({ error: "caseId and message are required" });
  }

  const c = db.getCaseById(caseId);
  if (!c) {
    return res.status(404).json({ error: "Case not found" });
  }

  try {
    const reply = await askCaseCoach(c, message, history);
    res.json({ reply });
  } catch (err: any) {
    console.error("Chat API error:", err);
    res.status(500).json({ error: "Failed to consult AI Legal Coach." });
  }
});

// ==========================================
// Orders
// ==========================================

// Store an AI analysis on an order
caseRoutes.post('/update-order-analysis', (req, res) => {
  const { caseId, orderId, analysis } = req.body;
  if (!caseId || !orderId || !analysis) {
    return res.status(400).json({ error: "caseId, orderId, and analysis are required" });
  }

  const item = db.getCaseById(caseId);
  if (!item) {
    return res.status(404).json({ error: "Case not found" });
  }

  const updatedCase: Case = {
    ...item,
    orders: (item.orders || []).map(o => o.id === orderId ? { ...o, aiAnalysis: analysis } : o)
  };

  db.updateCase(updatedCase);
  res.json({ success: true, case: updatedCase });
});

// Court orders with their official text (retrieved from the registry on first request)
caseRoutes.get('/:caseId/orders', async (req, res) => {
  let caseItem = db.getCaseById(req.params.caseId);
  if (!caseItem) {
    return res.status(404).json({ error: 'Case not found' });
  }
  if (!isKanoonCase(caseItem) && isEcourtCase(caseItem)) {
    caseItem = await enrichCase(caseItem, { ecourt: ecourtNeedsRefresh });
    caseItem = (await hydrateCaseOrders(caseItem.id)) || caseItem;
  }
  res.json({ orders: caseItem.orders || [] });
});

// Download a court order / judgment as PDF
caseRoutes.get('/:caseId/order/:orderId/download-pdf', async (req, res) => {
  try {
    const { caseId, orderId } = req.params;
    let caseItem = db.getCaseById(caseId);
    if (!caseItem) {
      return res.status(404).send('Case not found');
    }
    const cleanCaseNo = (caseItem.caseNumber || caseItem.id).replace(/[^a-zA-Z0-9_-]/g, '_');

    // eCourts orders: serve the court's original PDF, never a generated stand-in
    const registryOrder = (caseItem.orders || []).find(o => o.id === orderId);
    if (!isKanoonCase(caseItem) && isEcourtCase(caseItem) && registryOrder?.orderUrl) {
      let original: Buffer | null;
      try {
        original = await EcourtService.fetchOrderPdf(caseItem.cnrNumber || caseItem.id, registryOrder.orderUrl);
      } catch (err) {
        if (err instanceof EcourtsCreditsError) return res.status(402).json({ error: err.message });
        throw err;
      }
      if (!original) {
        return res.status(502).json({ error: "The court's order PDF could not be retrieved from the eCourts registry right now. Please try again shortly." });
      }
      const fileName = `Order_${cleanCaseNo}_${registryOrder.orderDate}_${registryOrder.orderUrl}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', original.length);
      return res.send(original);
    }

    // Indian Kanoon cases need the full official text for the PDF
    if (isKanoonCase(caseItem)) {
      caseItem = await enrichCase(caseItem);
    }

    const order = (caseItem.orders || []).find(o => o.id === orderId) || caseItem.orders?.[0] || {
      id: orderId,
      orderDate: caseItem.decisionDate || 'Official Record',
      orderType: 'Reported Judgment',
      title: caseItem.title,
      summary: caseItem.description || 'Record of court proceedings and operative directions.'
    };

    const pdfBuffer = await PdfService.generateCourtOrderPdf(caseItem, order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Order_${cleanCaseNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[PDF Download Error]', err);
    return res.status(500).json({ error: 'Failed to generate order PDF: ' + err.message });
  }
});

// Detailed AI analysis of an order
caseRoutes.get('/:caseId/order/:orderId/analysis', async (req, res) => {
  try {
    const { caseId, orderId } = req.params;
    let caseItem = db.getCaseById(caseId);
    if (!caseItem) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (isKanoonCase(caseItem)) {
      caseItem = await enrichCase(caseItem);
    } else if (isEcourtCase(caseItem)) {
      // Make sure this order's official text and the registry's analysis are loaded
      const wanted = (caseItem.orders || []).find(o => o.id === orderId);
      if (wanted?.orderUrl && wanted.contentStatus !== 'loaded') {
        caseItem = (await hydrateCaseOrders(caseItem.id)) || caseItem;
      }
    }

    const order = (caseItem.orders || []).find(o => o.id === orderId) || caseItem.orders?.[0];
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ success: true, analysis: buildOrderAnalysis(order, caseItem), order });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Download order & AI analysis by CNR (legacy eCourts endpoint)
caseRoutes.get('/:cnr/order/:filename', async (req, res) => {
  const { cnr, filename } = req.params;
  try {
    const orderData = await EcourtService.downloadOrder(cnr, filename);
    if (orderData) {
      res.json(orderData);
    } else {
      res.status(404).json({ error: "Order not found or API error" });
    }
  } catch (error) {
    console.error("Order download error", error);
    res.status(500).json({ error: "Failed to download order analysis" });
  }
});

// Single case detail (registered last so the named routes above take precedence)
caseRoutes.get('/:id', async (req, res) => {
  let caseItem = await findOrFetchCase(req.params.id);
  if (!caseItem) {
    return res.status(404).json({ error: "Case not found" });
  }

  caseItem = await enrichCase(caseItem, { kanoon: kanoonMissingMetadata, ecourt: ecourtNeedsRefresh });
  res.json(caseItem);
});
