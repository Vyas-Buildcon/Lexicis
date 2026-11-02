/**
 * Official court-order content: retrieves each order's text and the registry's
 * AI analysis once, stores it on the case, and shapes it for display.
 */
import { PDFParse } from 'pdf-parse';
import { Case, CaseOrder } from '../../src/types';
import { db } from '../db/database';
import { EcourtService, EcourtsCreditsError } from './ecourtService';
import { isEcourtCase, isKanoonCase } from './caseEnrichment';
import { getAiClient, generateContentWithFallback } from './ai/geminiClient';

const FETCH_CONCURRENCY = 4;
const inFlight = new Map<string, Promise<Case | undefined>>();

/** Text layer of a PDF ('' for scanned images without text). */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return (result.text || '').replace(/\n-- \d+ of \d+ --\n/g, '\n').trim();
  } catch (e: any) {
    console.warn('[Orders] PDF text extraction failed:', e?.message || e);
    return '';
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Official text for one order. The original PDF is used first: it is the cheaper registry
 * call and is cached for downloads too. The registry's text+analysis endpoint (which also
 * reads scanned orders) is used only when the PDF has no text layer.
 */
async function loadOrderContent(cnr: string, order: CaseOrder): Promise<Partial<CaseOrder>> {
  try {
    const pdf = await EcourtService.fetchOrderPdf(cnr, order.orderUrl!);
    const text = pdf ? await extractPdfText(pdf) : '';
    if (text.length > 40) {
      return { fullText: text, summary: summaryFor(text, null), contentStatus: 'loaded', contentError: undefined };
    }

    const content = await EcourtService.fetchOrderContent(cnr, order.orderUrl!);
    if (content && content.extractedText.trim()) {
      return {
        fullText: content.extractedText,
        aiAnalysis: content.aiAnalysis ? JSON.stringify(content.aiAnalysis) : undefined,
        summary: summaryFor(content.extractedText, content.aiAnalysis),
        judgeName: strings(get(content.aiAnalysis, 'foundational_metadata.core_case_identifiers.judge_names')).join(', ') || undefined,
        contentStatus: 'loaded',
        contentError: undefined
      };
    }
    return { contentStatus: 'unavailable', contentError: 'The eCourts registry did not return this order.' };
  } catch (err) {
    if (err instanceof EcourtsCreditsError) {
      return { contentStatus: 'unavailable', contentError: err.message };
    }
    console.warn(`[Orders] ${cnr}/${order.orderUrl} failed:`, err);
    return { contentStatus: 'unavailable', contentError: 'The order could not be retrieved from the eCourts registry.' };
  }
}

/** Gemini analysis of one order's official text, in the order dialog's display shape. */
async function analyzeOrderText(order: CaseOrder, c: Case): Promise<any | null> {
  const client = getAiClient();
  if (!client || !order.fullText) return null;
  try {
    const response = await generateContentWithFallback(client, {
      contents: `You are an Indian litigation analyst. Analyse this court order from ${c.title} (${c.caseNumber}, ${c.court}). Use ONLY the order text; never invent facts, dates or amounts.

ORDER (${order.orderType}, ${order.orderDate}):
"""
${cleanOrderText(order.fullText).slice(0, 20000)}
"""

Return JSON:
{
  "executiveSummary": "2-4 sentences: who passed the order, what was decided or directed, and its effect",
  "plainLanguageSummary": "2-3 sentences explaining what this means for the parties, in plain language",
  "operativeDirections": ["each direction the court gave, close to the order's wording"],
  "orderNature": "e.g. Interim / Procedural / Final judgment, plus disposition such as Adjourned / Allowed / Dismissed",
  "nextHearingDate": "YYYY-MM-DD if the order fixes one, else empty",
  "ratioDecidendi": "the legal principle applied, or empty for procedural orders",
  "actionItems": [{"action": "...", "deadline": "YYYY-MM-DD or empty", "party": "..."}],
  "complianceRisks": ["consequences of not complying, only if stated or clearly implied"]
}`,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });
    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.executiveSummary) return null;
    return {
      executiveSummary: parsed.executiveSummary,
      plainLanguageSummary: parsed.plainLanguageSummary || undefined,
      operativeDirectives: Array.isArray(parsed.operativeDirections) ? parsed.operativeDirections : [],
      orderNature: parsed.orderNature || undefined,
      nextHearingDate: parsed.nextHearingDate || undefined,
      ratioDecidendi: parsed.ratioDecidendi || undefined,
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((a: any) => a?.action) : [],
      complianceRisks: Array.isArray(parsed.complianceRisks) ? parsed.complianceRisks : []
    };
  } catch (e: any) {
    console.warn(`[Orders] AI analysis failed for ${order.id}:`, String(e?.message || e).slice(0, 160));
    return null;
  }
}

const get = (obj: any, path: string): any =>
  path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x?.name || x?.statement || '')).filter(Boolean) : [];

export function parseOrderAnalysis(order: CaseOrder): any | null {
  if (!order.aiAnalysis) return null;
  try {
    return JSON.parse(order.aiAnalysis);
  } catch {
    return null;
  }
}

/** Plain text of an order with markdown/heading noise removed. */
export function cleanOrderText(text: string): string {
  return (text || '')
    .replace(/\r/g, '')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/Digitally\s+signed\s+by[^\n]*/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The operative part of an order when no AI summary exists: text after "P.C." / "ORDER" / "JUDGMENT". */
function extractiveSummary(text: string): string {
  const clean = cleanOrderText(text);
  const marker = /(P\.\s?C\.\s*:?|ORAL\s+ORDER|ORDER\s*:|JUDGMENT\s*:|COMMON\s+ORDER)/i.exec(clean);
  const body = (marker ? clean.slice(marker.index + marker[0].length) : clean).replace(/\s+/g, ' ').trim();
  return body.length > 320 ? `${body.slice(0, 320).replace(/\s+\S*$/, '')}…` : body;
}

function summaryFor(text: string, analysis: any): string {
  return get(analysis, 'intelligent_insights_analytics.order_significance_and_impact_assessment.ai_generated_executive_summary')
    || get(analysis, 'search_and_user_friendly_teaser.teaser_content.short_summary_enticing')
    || extractiveSummary(text)
    || 'Official order text retrieved from the court registry.';
}

/** Loads order text for one case. Concurrent callers share the same work. */
export function hydrateCaseOrders(caseId: string): Promise<Case | undefined> {
  const running = inFlight.get(caseId);
  if (running) return running;

  const work = (async () => {
    const c = db.getCaseById(caseId);
    // Indian Kanoon judgments carry their text already; only eCourts orders are fetched
    if (!c || isKanoonCase(c) || !isEcourtCase(c)) return c;
    const cnr = c.cnrNumber || c.id;
    // Orders without text, plus loaded orders still missing an analysis
    const pending = (c.orders || []).filter(o => o.orderUrl && (o.contentStatus !== 'loaded' || !o.aiAnalysis));
    if (pending.length === 0) return c;

    console.log(`[Orders] Retrieving ${pending.length} order(s) for ${cnr}...`);
    const fetched = new Map<string, Partial<CaseOrder>>();
    const queue = [...pending];
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
      for (let order = queue.shift(); order; order = queue.shift()) {
        const content: Partial<CaseOrder> = order.contentStatus === 'loaded' ? {} : await loadOrderContent(cnr, order);
        const merged = { ...order, ...content };
        // Analyse orders whose text came from the PDF (registry-analysed orders already have one)
        if (merged.contentStatus === 'loaded' && merged.fullText && !merged.aiAnalysis) {
          const analysis = await analyzeOrderText(merged, c);
          if (analysis) {
            content.aiAnalysis = JSON.stringify(analysis);
            content.summary = analysis.executiveSummary;
          }
        }
        fetched.set(order.orderUrl!, content);
      }
    }));

    // Apply to the latest stored copy so concurrent edits are not lost
    const latest = db.getCaseById(caseId);
    if (!latest) return undefined;
    const updated: Case = {
      ...latest,
      orders: (latest.orders || []).map(o => (o.orderUrl && fetched.has(o.orderUrl) ? { ...o, ...fetched.get(o.orderUrl) } : o))
    };
    db.updateCase(updated);
    const loaded = [...fetched.values()].filter(f => f.contentStatus === 'loaded').length;
    console.log(`[Orders] ${cnr}: ${loaded}/${pending.length} order(s) retrieved.`);
    return updated;
  })().finally(() => inFlight.delete(caseId));

  inFlight.set(caseId, work);
  return work;
}

/** Shapes an order's analysis for the order-analysis dialog. */
export function buildOrderAnalysis(order: CaseOrder, c: Case) {
  const a = parseOrderAnalysis(order);

  // Analyses produced by this app are already in display form; fill in case-level details
  if (a && (a.executiveSummary || a.operativeDirectives)) {
    return {
      bench: order.judgeName || c.judge,
      courtroom: c.courtRoom,
      petitionerCounsel: c.petitionerAdvocates?.join(', ') || c.advocateName || 'Counsel on Record',
      respondentCounsel: c.respondentAdvocates?.join(', ') || 'Advocate on Record',
      court: c.court,
      caseNumber: c.caseNumber || c.title,
      ...a
    };
  }

  const impact = get(a, 'intelligent_insights_analytics.order_significance_and_impact_assessment') || {};
  const procedure = get(a, 'foundational_metadata.procedural_details_from_order') || {};
  const counsel = get(a, 'foundational_metadata.legal_representation') || {};
  const ratio: string | undefined = get(a, 'deep_legal_substance_context.arguments_and_reasoning_analysis.ratio_decidendi_extracted.statement');
  const judges = strings(get(a, 'foundational_metadata.core_case_identifiers.judge_names'));

  const directions = strings(procedure.specific_directions_given_by_court);
  const text = order.fullText ? cleanOrderText(order.fullText) : '';

  return {
    executiveSummary: impact.ai_generated_executive_summary || (text ? extractiveSummary(text) : order.summary),
    plainLanguageSummary: impact.plain_language_summary_for_litigants_outcome_focused || undefined,
    operativeDirectives: directions.length ? directions : (text ? [extractiveSummary(text)] : [order.summary]),
    orderNature: [procedure.order_nature, procedure.disposition_status_indicated].filter(Boolean).join(' • ') || undefined,
    nextHearingDate: get(a, 'foundational_metadata.core_case_identifiers.next_hearing_date_specified') || undefined,
    bench: judges.length ? judges.join(', ') : (order.judgeName || c.judge),
    courtroom: c.courtRoom,
    petitionerCounsel: strings(counsel.counsel_for_petitioner_side).join(', ') || c.petitionerAdvocates?.join(', ') || c.advocateName || 'Counsel on Record',
    respondentCounsel: strings(counsel.counsel_for_respondent_side).join(', ') || c.respondentAdvocates?.join(', ') || 'Advocate on Record',
    // Procedural orders carry no ratio; only show a real one
    ratioDecidendi: ratio && !/does not (establish|contain|lay down)|no ratio/i.test(ratio) ? ratio : undefined,
    actionItems: (impact.actionable_alerts_for_parties || [])
      .filter((x: any) => x?.action_required)
      .map((x: any) => ({ action: x.action_required, deadline: x.deadline, party: x.responsible_party })),
    complianceRisks: strings(impact.compliance_directives_or_risks_for_parties),
    court: c.court,
    caseNumber: c.caseNumber || c.title
  };
}

/** Legal issues and statutes the registry identified across a case's orders, most frequent first. */
export function collectIssueProfile(c: Case): { issues: string[]; statutes: string[]; facts: string[] } {
  const issueCounts = new Map<string, number>();
  const statuteCounts = new Map<string, number>();
  const facts: string[] = [];
  const bump = (map: Map<string, number>, value: string) => {
    const key = value.trim();
    if (key && !/if applicable|not specified|unknown/i.test(key)) map.set(key, (map.get(key) || 0) + 1);
  };

  for (const order of c.orders || []) {
    const a = parseOrderAnalysis(order);
    if (!a) continue;
    const indicators = get(a, 'actionable_outputs_user_tools.research_and_visualization_support_data.potential_similar_cases_indicators') || {};
    strings(indicators.key_issues_for_similarity_search).forEach(i => bump(issueCounts, i));
    strings(get(a, 'deep_legal_substance_context.core_legal_content_analysis.primary_legal_issues_identified')).forEach(i => bump(issueCounts, i));
    strings(indicators.key_statutes_for_similarity_search).forEach(s => bump(statuteCounts, s));
    const brief = get(a, 'deep_legal_substance_context.factual_matrix_from_order.brief_facts_summary_ai_generated');
    if (brief && facts.length < 2) facts.push(brief);
  }

  const ranked = (map: Map<string, number>) => [...map.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
  return { issues: ranked(issueCounts).slice(0, 8), statutes: ranked(statuteCounts).slice(0, 6), facts };
}
