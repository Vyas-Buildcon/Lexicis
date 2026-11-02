/**
 * eCourts India partner API client (https://webapi.ecourtsindia.com).
 *
 * Case detail, order text / AI analysis, original order PDFs, v2 case search
 * with the full filter set, and the filter (facet) catalog.
 */
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { Case, CaseOrder, CourtDocument, CaseHistoryEvent } from '../../src/types';
import { REAL_ECOURTS_CASES } from '../db/realCasesData';
import { config } from '../config';

const ECOURT_API_BASE_URL = config.ecourt.baseUrl;
const ECOURT_API_KEY = config.ecourt.apiKey;

const FACET_CACHE_FILE = path.join(config.dataDir, 'ecourts-facets.json');
const BUNDLED_FACET_FILE = path.join(config.bundledDataDir, 'ecourts-facets.json');
const FACET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const LEGACY_PLACEHOLDER_ACT = 'Code of Civil Procedure, 1908';

// ==========================================
// HTTP
// ==========================================

async function ecourtsFetch(apiPath: string, timeoutMs: number, accept = 'application/json'): Promise<Response | null> {
  if (!ECOURT_API_KEY) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${ECOURT_API_BASE_URL}${apiPath}`, {
      headers: {
        'Authorization': `Bearer ${ECOURT_API_KEY}`,
        'X-API-KEY': ECOURT_API_KEY,
        'Accept': accept
      },
      signal: controller.signal
    });
  } catch (err: any) {
    console.warn(`[ECOURT_PARTNER_API] ${apiPath} failed: ${err?.name === 'AbortError' ? 'timeout' : err?.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** The eCourts account has no credit left for a paid call (HTTP 402). Failed calls are not charged. */
export class EcourtsCreditsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcourtsCreditsError';
  }
}

async function throwIfOutOfCredits(res: Response) {
  if (res.status !== 402) return;
  const body = await res.json().catch(() => null);
  const detail = body?.error?.message || 'Insufficient credits.';
  throw new EcourtsCreditsError(`The eCourts API account is out of credits (${detail}). Top up the wallet at ecourtsindia.com to continue.`);
}

async function ecourtsJson(apiPath: string, timeoutMs: number): Promise<any | null> {
  const res = await ecourtsFetch(apiPath, timeoutMs);
  if (!res) return null;
  await throwIfOutOfCredits(res);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[ECOURT_PARTNER_API] ${apiPath} returned ${res.status}: ${body.slice(0, 160)}`);
    return null;
  }
  const json = await res.json().catch(() => null);
  return json?.data ?? json;
}

// Original order PDFs are kept on disk so each one is paid for once
const ORDER_PDF_DIR = path.join(config.dataDir, 'order-pdfs');
const BUNDLED_ORDER_PDF_DIR = path.join(config.bundledDataDir, 'order-pdfs');

function pdfRelativePath(cnr: string, filename: string): string {
  return path.join(cnr.replace(/[^A-Za-z0-9]/g, ''), filename.replace(/[^A-Za-z0-9._-]/g, '_'));
}

/** Where a downloaded order PDF is written. */
function cachedPdfPath(cnr: string, filename: string): string {
  return path.join(ORDER_PDF_DIR, pdfRelativePath(cnr, filename));
}

/** A previously downloaded copy, in the writable cache or shipped with the deployment. */
function existingPdfPath(cnr: string, filename: string): string | null {
  for (const dir of [ORDER_PDF_DIR, BUNDLED_ORDER_PDF_DIR]) {
    const candidate = path.join(dir, pdfRelativePath(cnr, filename));
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ==========================================
// Mapping helpers
// ==========================================

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(Boolean).map(String) : (v ? [String(v)] : []);

/** "Special Acts/Motor Accident Claims" or ["Special Acts","Motor Accident Claims"] -> "Motor Accident Claims" */
function categoryFrom(facetPath: unknown, fallback?: string): string {
  const parts = Array.isArray(facetPath) ? facetPath.map(String) : String(facetPath || '').split('/');
  const last = parts.map(p => p.trim()).filter(Boolean).pop();
  return last || fallback || 'Court Case';
}

function titleFrom(petitioners: string[], respondents: string[]): string {
  const pet = petitioners[0] || 'Petitioner';
  const resp = respondents.filter(r => !/^ors\.?$/i.test(r))[0] || 'Respondent';
  const others = respondents.length > 1 ? ' & Ors.' : '';
  return `${pet} vs. ${resp}${others}`;
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "View Farad order" -> "Farad Order"; judgments are always "Judgment". */
function orderTypeFrom(description: string | undefined, isJudgment: boolean): string {
  if (isJudgment) return 'Judgment';
  const cleaned = (description || '').replace(/^view\s+/i, '').trim();
  return cleaned ? cleaned.replace(/\b\w/g, ch => ch.toUpperCase()) : 'Interim Order';
}

/**
 * Builds the order list from the registry's interim orders and judgments (oldest first),
 * keeping text already retrieved for orders that were seen before.
 */
function mapOrders(cnr: string, cData: any, existing: CaseOrder[] = []): CaseOrder[] {
  const raw = [
    ...(cData.judgmentOrders || []).map((o: any) => ({ ...o, isJudgment: true })),
    ...(cData.interimOrders || []).map((o: any) => ({ ...o, isJudgment: false }))
  ].filter((o: any) => o.orderUrl || o.orderDate);

  raw.sort((a: any, b: any) => String(a.orderDate || '').localeCompare(String(b.orderDate || '')));

  return raw.map((o: any, idx: number): CaseOrder => {
    const orderType = orderTypeFrom(o.description, o.isJudgment);
    const orderDate = o.orderDate || 'Undated';
    const base = {
      id: `ord-${cnr}-${o.orderUrl || idx + 1}`,
      orderDate,
      orderNumber: `Order #${idx + 1}`,
      orderType,
      title: `${orderType} (${orderDate})`,
      orderUrl: o.orderUrl
    };
    const previous = existing.find(e => e.orderUrl && e.orderUrl === o.orderUrl && e.contentStatus === 'loaded');
    if (previous) {
      return { ...previous, ...base };
    }
    return {
      ...base,
      summary: `${orderType} dated ${formatDisplayDate(orderDate)}.`,
      contentStatus: 'pending'
    };
  });
}

function mapHistory(cnr: string, cData: any, fallbackJudge: string, status: string, existing: CaseHistoryEvent[]): CaseHistoryEvent[] {
  const history = existing.filter(h => !h.id.startsWith(`h-${cnr}-`));
  (cData.historyOfCaseHearings || []).forEach((h: any, idx: number) => {
    history.push({
      id: `h-${cnr}-${idx + 1}`,
      date: h.hearingDate || h.businessOnDate || 'Scheduled Hearing',
      title: h.purposeOfListing || 'Case Hearing',
      description: `Proceedings held before ${h.judge || fallbackJudge}. Business on date: ${h.businessOnDate || h.hearingDate || 'N/A'}. Purpose: ${h.purposeOfListing || 'Regular Hearing'}.`,
      status,
      updatedBy: 'E-Court Live Registry'
    });
  });
  return history;
}

function mapDocuments(cnr: string, cData: any, caseItem: Partial<Case>): CourtDocument[] {
  const documents: CourtDocument[] = [...(caseItem.documents || [])];
  (cData.filedDocuments || []).forEach((doc: any, idx: number) => {
    const docId = `doc-${cnr}-${idx + 1}`;
    if (!documents.some(d => d.id === docId)) {
      documents.push({
        id: docId,
        name: doc.documentTitle || doc.title || `Pleading Document #${idx + 1}`,
        category: doc.category || 'Pleadings / Application',
        uploadDate: doc.filingDate || caseItem.filingDate || 'Official',
        size: 'PDF / Verified Record',
        description: `Filed document on record: ${doc.documentTitle || 'Court Document'}.`,
        attorneyName: caseItem.advocateName || 'Counsel on Record'
      });
    }
  });
  (cData.notices || []).slice(0, 5).forEach((not: any, idx: number) => {
    const docId = `doc-notice-${cnr}-${idx + 1}`;
    if (!documents.some(d => d.id === docId)) {
      documents.push({
        id: docId,
        name: `Notice: ${not.noticeType || 'Judicial Process'} - ${not.name || 'Party'}`,
        category: 'Court Notice / Process',
        uploadDate: not.issueDate || 'Issued',
        size: 'Official Notice',
        description: `Issued notice to ${not.name || 'party'} in ${not.stateDistrict || 'Jurisdiction'}. Returnable: ${not.returnableDate || 'Per Registry'}.`,
        attorneyName: not.processId || 'Registry Process'
      });
    }
  });
  return documents;
}

/** Maps a case-detail response onto a Case, merging with what is already stored. */
function mapCaseDetail(cnr: string, detail: any, existing?: Case): Case {
  const cData = detail.courtCaseData || detail.tribunalCaseData || {};
  const lookup = detail.descriptions?.enumLookup || {};

  const petitioners = asArray(cData.petitioners || cData.petitioner);
  const respondents = asArray(cData.respondents || cData.respondent);
  const petitionerAdvocates = asArray(cData.petitionerAdvocates);
  const respondentAdvocates = asArray(cData.respondentAdvocates);
  const judges = asArray(cData.judges || cData.judge);

  const courtCode = cData.cnrCourtCode || cData.courtCode;
  const court = (courtCode && lookup.courtCode?.[courtCode]) || existing?.court || cData.courtName || 'High Court / District Court';
  const caseTypeLabel = (cData.caseType && lookup.caseType?.[cData.caseType]) || cData.caseType || existing?.caseType;
  const status = (cData.caseStatus && lookup.caseStatus?.[cData.caseStatus]) || cData.caseStatus || existing?.currentStatus || 'Pending';
  const judge = judges.join(', ') || existing?.judge || "Hon'ble Bench";

  const subordinate = cData.subordinateCourt;
  const originCourt = subordinate?.courtName
    ? `${subordinate.courtName}${subordinate.caseNumber ? ` — ${subordinate.caseNumber}` : ''}${subordinate.filingDate ? ` (filed ${subordinate.filingDate})` : ''}`
    : existing?.originCourt;

  const base: Case = existing ?? {
    id: cnr,
    caseNumber: '',
    title: '',
    petitioner: '',
    respondent: '',
    court: '',
    judge: '',
    currentStatus: '',
    category: '',
    lastUpdated: new Date().toISOString(),
    filingDate: '',
    description: `Official e-court record retrieved via Partner API (CNR: ${cnr}).`,
    documents: [],
    history: [],
    orders: [],
    source: 'eCourts'
  };

  const mapped: Case = {
    ...base,
    caseNumber: cData.registrationNumber ? `${cData.caseType || 'Case'} ${cData.registrationNumber}` : (base.caseNumber || cData.caseNumber || cnr),
    cnrNumber: cnr,
    caseType: caseTypeLabel,
    regNo: cData.registrationNumber || base.regNo,
    filingNo: cData.filingNumber || base.filingNo,
    registrationDate: cData.registrationDate || base.registrationDate,
    decisionDate: cData.decisionDate || base.decisionDate,
    judicialSection: (cData.judicialSection && lookup.judicialSection?.[cData.judicialSection]) || cData.judicialSectionRaw || base.judicialSection,
    // Earlier versions filled this placeholder in for every case without acts on record
    actsAndSections: asArray(cData.actsAndSections).join(', ')
      || (base.actsAndSections === LEGACY_PLACEHOLDER_ACT ? undefined : base.actsAndSections),
    title: petitioners.length ? titleFrom(petitioners, respondents) : base.title,
    petitioner: petitioners[0] || base.petitioner,
    respondent: respondents[0] || base.respondent,
    petitionersList: petitioners.length ? petitioners : base.petitionersList,
    respondentsList: respondents.length ? respondents : base.respondentsList,
    petitionerAdvocates: petitionerAdvocates.length ? petitionerAdvocates : base.petitionerAdvocates,
    respondentAdvocates: respondentAdvocates.length ? respondentAdvocates : base.respondentAdvocates,
    advocateName: petitionerAdvocates[0] || base.advocateName,
    court,
    // High Court records report state as "HC"
    state: base.state || (cData.state && cData.state !== 'HC' ? cData.state : undefined),
    district: cData.district ? cData.district.charAt(0) + cData.district.slice(1).toLowerCase() : base.district,
    judge,
    currentStatus: status,
    // "Civil Dispute" was a placeholder earlier versions assigned to every case
    category: categoryFrom(cData.caseCategoryFacetPath, (base.category && base.category !== 'Civil Dispute' ? base.category : undefined) || caseTypeLabel),
    nextHearingDate: cData.nextHearingDate || detail.entityInfo?.nextDateOfHearing?.slice(0, 10) || base.nextHearingDate,
    lastHearingDate: cData.lastHearingDate || base.lastHearingDate,
    filingDate: cData.filingDate || base.filingDate,
    courtRoom: base.courtRoom || (cData.courtNo ? `Court Hall ${cData.courtNo}` : undefined),
    stageOfCase: cData.stageOfCase || cData.stageOfCaseRaw || base.stageOfCase,
    originCourt,
    source: 'eCourts',
    lastUpdated: new Date().toISOString()
  };

  mapped.orders = mapOrders(cnr, cData, base.orders || []);
  mapped.history = mapHistory(cnr, cData, judge, status, base.history || []);
  mapped.documents = mapDocuments(cnr, cData, mapped);
  return mapped;
}

// ==========================================
// Filter (facet) catalog
// ==========================================

interface FacetOption {
  value: string;
  label: string;
  parents?: { stateCode?: string; districtCode?: string; courtLevel?: string };
}

interface FacetCatalog {
  fetchedAt: number;
  facets: Record<string, { label: string; options: FacetOption[]; range?: { min: number; max: number } }>;
}

let facetCatalog: FacetCatalog | null = null;
let facetCatalogLoading: Promise<FacetCatalog | null> | null = null;

function readFacetCacheFile(): FacetCatalog | null {
  for (const file of [FACET_CACHE_FILE, BUNDLED_FACET_FILE]) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as FacetCatalog;
      if (cached?.facets) return cached;
    } catch {
      // Not present or unreadable; try the next location
    }
  }
  return null;
}

async function loadFacetCatalog(): Promise<FacetCatalog | null> {
  if (facetCatalog && Date.now() - facetCatalog.fetchedAt < FACET_CACHE_TTL_MS) return facetCatalog;

  const fromDisk = readFacetCacheFile();
  if (fromDisk && Date.now() - fromDisk.fetchedAt < FACET_CACHE_TTL_MS) {
    facetCatalog = fromDisk;
    return facetCatalog;
  }

  if (!facetCatalogLoading) {
    facetCatalogLoading = (async () => {
      const data = await ecourtsJson('/api/partner/v2/facets/full', 60000);
      if (!Array.isArray(data?.facets)) return fromDisk || facetCatalog;
      const facets: FacetCatalog['facets'] = {};
      for (const f of data.facets) {
        facets[f.field] = {
          label: f.label,
          range: f.range,
          options: (f.options || []).map((o: any) => ({ value: String(o.value), label: o.label, parents: o.parents }))
        };
      }
      const catalog: FacetCatalog = { fetchedAt: Date.now(), facets };
      try {
        fs.mkdirSync(path.dirname(FACET_CACHE_FILE), { recursive: true });
        fs.writeFileSync(FACET_CACHE_FILE, JSON.stringify(catalog));
      } catch (e) {
        console.warn('[ECOURT_PARTNER_API] Could not cache facet catalog:', e);
      }
      return catalog;
    })().finally(() => { facetCatalogLoading = null; });
  }
  facetCatalog = await facetCatalogLoading;
  return facetCatalog;
}

const optionList = (catalog: FacetCatalog | null, field: string) =>
  (catalog?.facets[field]?.options || []).map(o => ({ value: o.value, label: o.label }));

function lookupLabel(catalog: FacetCatalog | null, field: string, value: unknown, parentState?: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const options = catalog?.facets[field]?.options || [];
  const match = options.find(o => o.value === String(value) && (!parentState || !o.parents?.stateCode || o.parents.stateCode === parentState));
  return match?.label;
}

// ==========================================
// Search
// ==========================================

export interface EcourtSearchParams {
  query?: string;
  searchBy?: string;
  stateCode?: string;
  districtCode?: string;
  courtCode?: string;
  courtLevel?: string;
  caseType?: string;
  caseStatus?: string;
  caseCategory?: string;
  judicialSection?: string;
  benchType?: string;
  filingYear?: string;
  decisionYear?: string;
  filingDateFrom?: string;
  filingDateTo?: string;
  decisionDateFrom?: string;
  decisionDateTo?: string;
  hasOrders?: string;
  hasJudgments?: string;
  petitioner?: string;
  respondent?: string;
  litigant?: string;
  advocate?: string;
  judge?: string;
  actsAndSections?: string;
  nameMatchMode?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

export interface EcourtSearchResult {
  results: Case[];
  totalHits: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  /** Result counts per filter value for this search, e.g. { caseStatus: { PENDING: 51, DISPOSED: 152 } } */
  facetCounts?: Record<string, Record<string, number>>;
}

/** The registry did not answer a filtered search (unfiltered stored results would be misleading). */
export class EcourtsUnavailableError extends Error {}

// Our parameter name -> v2 search query parameter
const FILTER_PARAMS: [keyof EcourtSearchParams, string][] = [
  ['stateCode', 'stateCodes'],
  ['districtCode', 'districtCodes'],
  ['courtCode', 'courtCodes'],
  ['courtLevel', 'courtLevels'],
  ['caseType', 'caseTypes'],
  ['caseStatus', 'caseStatuses'],
  ['caseCategory', 'caseCategories'],
  ['judicialSection', 'judicialSections'],
  ['benchType', 'benchTypes'],
  ['filingYear', 'filingYears'],
  ['decisionYear', 'decisionYears'],
  ['filingDateFrom', 'filingDateFrom'],
  ['filingDateTo', 'filingDateTo'],
  ['decisionDateFrom', 'decisionDateFrom'],
  ['decisionDateTo', 'decisionDateTo'],
  ['hasOrders', 'hasOrders'],
  ['hasJudgments', 'hasJudgments'],
  ['petitioner', 'petitioners'],
  ['respondent', 'respondents'],
  ['litigant', 'litigants'],
  ['advocate', 'advocates'],
  ['judge', 'judges'],
  ['actsAndSections', 'actsAndSections'],
  ['nameMatchMode', 'nameMatchMode'],
  ['sortBy', 'sortBy']
];

const CNR_PATTERN = /^[A-Z]{4}\d{12}$/i;

function mapSearchItem(item: any, lookup: any, catalog: FacetCatalog | null): Case {
  const petitioners = asArray(item.petitioners);
  const respondents = asArray(item.respondents);
  const petitionerAdvocates = asArray(item.petitionerAdvocates);
  const stateCode = item.stateCode ? String(item.stateCode) : undefined;
  const cnr = item.cnr || item.id;

  return {
    id: cnr,
    caseNumber: item.registrationNumber ? `${item.caseType || 'Case'} ${item.registrationNumber}` : (item.filingNumber ? `${item.caseType || 'Case'} ${item.filingNumber}` : cnr),
    cnrNumber: cnr,
    caseType: (item.caseType && lookup.caseType?.[item.caseType]) || item.caseType,
    regNo: item.registrationNumber,
    filingNo: item.filingNumber,
    registrationDate: item.registrationDate,
    decisionDate: item.decisionDate || undefined,
    judicialSection: (item.judicialSection && lookup.judicialSection?.[item.judicialSection]) || item.judicialSection || undefined,
    actsAndSections: asArray(item.actsAndSections).join(', ') || undefined,
    title: titleFrom(petitioners, respondents),
    petitioner: petitioners[0] || 'Petitioner',
    respondent: respondents[0] || 'Respondent',
    petitionersList: petitioners,
    respondentsList: respondents,
    petitionerAdvocates,
    respondentAdvocates: asArray(item.respondentAdvocates),
    advocateName: petitionerAdvocates[0],
    court: item.courtName || (item.courtCode && lookup.courtCode?.[item.courtCode]) || item.courtCode || 'Court',
    state: lookupLabel(catalog, 'stateCode', stateCode) || stateCode,
    // High Court records carry a bench code in districtCode, not a real district
    district: /^HC/i.test(item.courtCode || '') ? undefined : lookupLabel(catalog, 'districtCode', item.districtCode, stateCode),
    judge: asArray(item.judges).join(', ') || "Hon'ble Bench",
    currentStatus: (item.caseStatus && lookup.caseStatus?.[item.caseStatus]) || item.caseStatus || 'Pending',
    // Without a registry category, the case type (e.g. "Criminal Complaint Case") is the most accurate label
    category: categoryFrom(item.caseCategoryFacetPath,
      (item.caseCategory && lookup.caseCategory?.[item.caseCategory]) || (item.caseType && lookup.caseType?.[item.caseType]) || undefined),
    lastUpdated: new Date().toISOString(),
    nextHearingDate: item.nextHearingDate || undefined,
    lastHearingDate: item.lastHearingDate || undefined,
    filingDate: item.filingDate || '',
    description: `Official e-court record (${item.courtName || item.courtCode || 'eCourts'}). ${item.orderCount ? `${item.orderCount} order(s) on record.` : ''}`.trim(),
    aiKeywords: asArray(item.aiKeywords),
    documents: [],
    history: [],
    orders: [],
    source: 'eCourts'
  };
}

export class EcourtService {
  /** Official case detail by CNR from the partner API (null when unavailable). */
  static async getCaseDetailByCnr(cnr: string): Promise<any | null> {
    const cleanCnr = (cnr || '').trim();
    if (!cleanCnr || !CNR_PATTERN.test(cleanCnr)) return null;
    const detail = await ecourtsJson(`/api/partner/case/${encodeURIComponent(cleanCnr)}`, 20000);
    return detail?.courtCaseData || detail?.tribunalCaseData ? detail : null;
  }

  /** Refreshes a case with the registry's current record: parties, status, hearings and the full order list. */
  static async enrichEcourtCase(caseItem: Case): Promise<Case> {
    const cnr = caseItem.cnrNumber || caseItem.id;
    const detail = await EcourtService.getCaseDetailByCnr(cnr);
    if (!detail) return caseItem;
    return mapCaseDetail(cnr, detail, { ...caseItem, id: caseItem.id });
  }

  /** Fetches a case from the registry by CNR (or a stored copy when the registry is unreachable). */
  static async fetchAndEnrichEcourtCase(idOrCnr: string): Promise<Case | null> {
    const cleanCnr = idOrCnr.replace(/^ec-partner-/, '').trim();
    if (!cleanCnr) return null;

    const detail = await EcourtService.getCaseDetailByCnr(cleanCnr);
    if (detail) {
      return mapCaseDetail(cleanCnr, detail, undefined);
    }

    return REAL_ECOURTS_CASES.find(c => c.id === idOrCnr || c.cnrNumber === cleanCnr)
      || db.getGlobalCases().find(c => c.id === idOrCnr || c.cnrNumber === cleanCnr)
      || null;
  }

  /**
   * Official text of one order plus the registry's AI analysis of it.
   * The analysis can take up to a minute to produce on first request.
   */
  static async fetchOrderContent(cnr: string, filename: string): Promise<{ extractedText: string; aiAnalysis: any | null } | null> {
    const data = await ecourtsJson(`/api/partner/case/${encodeURIComponent(cnr)}/order-ai/${encodeURIComponent(filename)}`, 60000);
    if (!data || typeof data.extractedText !== 'string') return null;
    return { extractedText: data.extractedText, aiAnalysis: data.aiAnalysis || null };
  }

  static hasCachedOrderPdf(cnr: string, filename: string): boolean {
    return existingPdfPath(cnr, filename) !== null;
  }

  /**
   * The court's original order PDF (unwatermarked). Served from the local cache when
   * available; otherwise downloaded once (a paid call) and cached.
   * Throws EcourtsCreditsError when the account has no credit; returns null on other failures.
   */
  static async fetchOrderPdf(cnr: string, filename: string): Promise<Buffer | null> {
    const existing = existingPdfPath(cnr, filename);
    if (existing) return fs.readFileSync(existing);
    const cached = cachedPdfPath(cnr, filename);

    for (const signed of ['false', 'true']) {
      const res = await ecourtsFetch(
        `/api/partner/case/${encodeURIComponent(cnr)}/order/${encodeURIComponent(filename)}?signed=${signed}`,
        60000,
        'application/pdf'
      );
      if (!res) continue;
      await throwIfOutOfCredits(res);
      if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.subarray(0, 4).toString() === '%PDF') {
          try {
            fs.mkdirSync(path.dirname(cached), { recursive: true });
            fs.writeFileSync(cached, buffer);
          } catch (e) {
            console.warn('[ECOURT_PARTNER_API] Could not cache order PDF:', e);
          }
          return buffer;
        }
      }
    }
    return null;
  }

  /** Legacy: order text + analysis as returned by the registry. */
  static async downloadOrder(cnr: string, filename: string): Promise<any> {
    return ecourtsJson(`/api/partner/case/${encodeURIComponent(cnr)}/order-ai/${encodeURIComponent(filename)}`, 90000);
  }

  /** Filter options for the search screen; districts and courts are fetched per selection. */
  static async getSearchFilterOptions() {
    const catalog = await loadFacetCatalog();
    const years = catalog?.facets.filingYear?.range || { min: 1947, max: new Date().getFullYear() };
    return {
      states: optionList(catalog, 'stateCode'),
      courtLevels: optionList(catalog, 'courtLevel'),
      caseTypes: optionList(catalog, 'caseType'),
      caseStatuses: optionList(catalog, 'caseStatus'),
      caseCategories: optionList(catalog, 'caseCategory'),
      judicialSections: optionList(catalog, 'judicialSection'),
      benchTypes: optionList(catalog, 'benchType'),
      yearRange: years
    };
  }

  static async getDistricts(stateCode: string) {
    const catalog = await loadFacetCatalog();
    return (catalog?.facets.districtCode?.options || [])
      .filter(o => o.parents?.stateCode === stateCode)
      .map(o => ({ value: o.value, label: o.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  static async getCourts(stateCode?: string, districtCode?: string, courtLevel?: string) {
    const catalog = await loadFacetCatalog();
    return (catalog?.facets.courtCode?.options || [])
      .filter(o =>
        (!stateCode || o.parents?.stateCode === stateCode) &&
        (!districtCode || String(o.parents?.districtCode) === districtCode) &&
        (!courtLevel || o.parents?.courtLevel === courtLevel))
      .map(o => ({ value: o.value, label: o.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Local search over stored cases, used when the registry cannot be reached. */
  static searchCases(query?: string, searchBy?: string): Case[] {
    const tokens = (query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const normAlpha = (str: string) => str.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const by = (searchBy || 'all').toLowerCase();

    const pool: Case[] = [...db.getGlobalCases()];
    for (const rc of REAL_ECOURTS_CASES) {
      if (!pool.some(c => c.id === rc.id || c.cnrNumber === rc.cnrNumber)) pool.push(rc);
    }

    return pool.filter(c => {
      if (!c || c.source === 'Indian Kanoon') return false;
      if (!tokens.length) return true;
      const fields = by === 'cnr' ? [c.caseNumber, c.cnrNumber]
        : by === 'party' ? [c.petitioner, c.respondent, c.advocateName]
        : by === 'company' ? [c.companyName, c.petitioner, c.respondent]
        : by === 'name' ? [c.title, c.petitioner, c.respondent, c.companyName]
        : [c.caseNumber, c.cnrNumber, c.title, c.petitioner, c.respondent, c.companyName, c.advocateName, c.category, c.court, c.judge, c.state, c.district];
      const text = fields.filter(Boolean).join(' ').toLowerCase();
      const norm = normAlpha(text);
      return tokens.every(tok => text.includes(tok) || (normAlpha(tok).length >= 2 && norm.includes(normAlpha(tok))));
    });
  }

  /** Searches the eCourts registry (v2) with any combination of filters. */
  static async searchCasesV2(params: EcourtSearchParams): Promise<EcourtSearchResult> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize || 20));
    const q = (params.query || '').trim();
    const by = (params.searchBy || 'all').toLowerCase();

    // An exact CNR is resolved through the case-detail endpoint
    if (q && (by === 'cnr' || (by === 'all' && CNR_PATTERN.test(q)))) {
      const exact = await EcourtService.fetchAndEnrichEcourtCase(q.toUpperCase());
      if (exact) return { results: [exact], totalHits: 1, page: 1, totalPages: 1, hasNextPage: false };
      if (by === 'cnr') return { results: [], totalHits: 0, page: 1, totalPages: 0, hasNextPage: false };
    }

    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeFacetCounts: 'true' });
    if (q) {
      if (by === 'party' || by === 'company') qs.append('litigants', q);
      else qs.append('query', q);
    }
    for (const [key, apiParam] of FILTER_PARAMS) {
      const value = params[key];
      if (value !== undefined && value !== null && String(value).trim() !== '' && String(value) !== 'all') {
        qs.append(apiParam, String(value).trim());
      }
    }

    const NON_FILTER_KEYS = ['page', 'pageSize', 'sortBy', 'nameMatchMode', 'includeFacetCounts', 'query', 'litigants'];
    const hasFilters = [...qs.keys()].some(k => !NON_FILTER_KEYS.includes(k));
    if (!q && !hasFilters) {
      return { results: [], totalHits: 0, page, totalPages: 0, hasNextPage: false };
    }

    const [data, catalog] = await Promise.all([
      ecourtsJson(`/api/partner/v2/search?${qs.toString()}`, 45000),
      loadFacetCatalog()
    ]);

    if (!data || !Array.isArray(data.results)) {
      if (hasFilters) {
        throw new EcourtsUnavailableError('The eCourts registry did not respond to this filtered search. Please try again, or remove some filters.');
      }
      // Plain text search with the registry unreachable: stored cases are still a useful answer
      const local = q ? EcourtService.searchCases(q, by) : [];
      return { results: local, totalHits: local.length, page: 1, totalPages: local.length ? 1 : 0, hasNextPage: false };
    }

    const facetCounts: Record<string, Record<string, number>> = {};
    for (const [field, facet] of Object.entries<any>(data.facets || {})) {
      if (facet?.values && typeof facet.values === 'object') facetCounts[field] = facet.values;
    }

    const lookup = data.enumDescriptions?.enumLookup || {};
    return {
      results: data.results.map((item: any) => mapSearchItem(item, lookup, catalog)),
      totalHits: data.totalHits ?? data.results.length,
      page: data.page ?? page,
      totalPages: data.totalPages ?? 1,
      hasNextPage: !!data.hasNextPage,
      facetCounts
    };
  }
}

export default EcourtService;
