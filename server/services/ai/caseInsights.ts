/**
 * Case-level AI analysis built from the complete record: every court order's
 * official text (oldest first), the hearing history and the case metadata,
 * compared against judgments on the same legal issues.
 */
import { Case, CaseAiInsight, CaseOrder, SimilarCase, isCaseDisposed } from '../../../src/types';
import { getAiClient, generateContentWithFallback } from './geminiClient';
import { cleanOrderText, collectIssueProfile, parseOrderAnalysis } from '../orderContentService';
import { buildPrecedentQueries, findPrecedentCandidates, PrecedentCandidate, rankPrecedents } from './precedentResearch';

// v3: ten related judgments per case from a wider candidate pool
export const INSIGHTS_VERSION = 3;

// Character budget for order text sent to the model
const DOSSIER_ORDER_BUDGET = 60000;

const get = (obj: any, path: string): any =>
  path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

function chronologicalOrders(c: Case): CaseOrder[] {
  return [...(c.orders || [])].sort((a, b) => String(a.orderDate).localeCompare(String(b.orderDate)));
}

/** Identifies the inputs an analysis was built from; a change means it is out of date. */
export function insightSignature(c: Case): string {
  const orders = c.orders || [];
  const loaded = orders.filter(o => o.contentStatus === 'loaded' || (!o.orderUrl && o.fullText)).length;
  const latest = chronologicalOrders(c).pop()?.orderDate || '';
  return [c.currentStatus, orders.length, loaded, latest, c.nextHearingDate || '', c.decisionDate || ''].join('|');
}

function trimMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.4);
  return `${text.slice(0, head)}\n[…]\n${text.slice(-(max - head))}`;
}

/** The complete case record as plain text for the model. */
function buildCaseDossier(c: Case, disposed: boolean): { text: string; ordersWithText: number } {
  const lines: string[] = [];
  lines.push('CASE RECORD');
  lines.push(`Title: ${c.title}`);
  lines.push(`Case number: ${c.caseNumber}${c.cnrNumber ? ` | CNR: ${c.cnrNumber}` : ''}`);
  lines.push(`Court: ${c.court}${c.courtRoom ? ` | ${c.courtRoom}` : ''}`);
  if (c.caseType) lines.push(`Case type: ${c.caseType}`);
  lines.push(`Subject / category: ${c.category}${c.actsAndSections ? ` | Acts: ${c.actsAndSections}` : ''}`);
  if (c.originCourt) lines.push(`Appeal / origin from: ${c.originCourt}`);
  lines.push(`Petitioner(s): ${(c.petitionersList || [c.petitioner]).join('; ')} — counsel: ${c.petitionerAdvocates?.join(', ') || c.advocateName || 'not recorded'}`);
  lines.push(`Respondent(s): ${(c.respondentsList || [c.respondent]).join('; ')} — counsel: ${c.respondentAdvocates?.join(', ') || 'not recorded'}`);
  lines.push(`Bench: ${c.judge}`);
  lines.push(`Filed: ${c.filingDate || 'n/a'}${c.registrationDate ? ` | Registered: ${c.registrationDate}` : ''}`);
  lines.push(`Current status: ${c.currentStatus}${c.stageOfCase ? ` | Stage: ${c.stageOfCase}` : ''} | Treated as: ${disposed ? 'DISPOSED / DECIDED' : 'PENDING'}`);
  if (c.decisionDate) lines.push(`Decision date: ${c.decisionDate}`);
  if (c.lastHearingDate) lines.push(`Last hearing: ${c.lastHearingDate}`);
  if (c.nextHearingDate) lines.push(`Next hearing: ${c.nextHearingDate}`);

  const hearings = (c.history || [])
    .filter(h => /^\d{4}-\d{2}-\d{2}/.test(h.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (hearings.length) {
    lines.push('', 'HEARING HISTORY (oldest first)');
    hearings.forEach(h => lines.push(`- ${h.date.slice(0, 10)}: ${h.title} — ${h.description}`));
  }

  const orders = chronologicalOrders(c);
  const withText = orders.filter(o => o.fullText && o.fullText.trim());
  const perOrderBudget = withText.length ? Math.max(1500, Math.floor(DOSSIER_ORDER_BUDGET / withText.length)) : 0;

  lines.push('', `COURT ORDERS (${orders.length} on record, oldest first; ${withText.length} with official text)`);
  orders.forEach((o, idx) => {
    lines.push('', `[ORDER ${idx + 1} | ${o.orderDate} | ${o.orderType}]`);
    const analysis = parseOrderAnalysis(o);
    const directions: string[] = get(analysis, 'foundational_metadata.procedural_details_from_order.specific_directions_given_by_court') || [];
    const nature = get(analysis, 'foundational_metadata.procedural_details_from_order.disposition_status_indicated');
    if (nature) lines.push(`Disposition: ${nature}`);
    if (Array.isArray(directions) && directions.length) lines.push(`Directions: ${directions.join(' | ')}`);
    if (o.fullText && o.fullText.trim()) {
      lines.push(`Official text:\n${trimMiddle(cleanOrderText(o.fullText), perOrderBudget)}`);
    } else {
      lines.push(`(Official text not available) ${o.summary}`);
    }
  });

  return { text: lines.join('\n'), ordersWithText: withText.length };
}

function buildPrompt(c: Case, dossier: string, disposed: boolean, precedents: SimilarCase[]): string {
  const precedentBlock = precedents.length
    ? precedents.map((p, i) => `[P${i + 1}] ${p.title} | ${p.court || ''}${typeof p.similarity === 'number' ? ` | relevance ${p.similarity}/100` : ''}\nOutcome: ${p.result}${p.takeaway ? `\nBearing on this case: ${p.takeaway}` : ''}`).join('\n\n')
    : '(no related judgments were found)';

  const stageRules = disposed
    ? `This case is DISPOSED. "precedentAnalysis.whatWillHappen" must explain the final outcome actually recorded in the orders and its practical effect (what the decision means now, any compliance, payment, execution or appeal window that follows). "precedentAnalysis.howToRecover" must explain how the party came out of the dispute and what it can still do (e.g. execution, appeal/review limitation, compliance), grounded in the final orders. "recoverySteps" must be an empty array. "resolutionSteps" must list 4-7 chronological steps describing how this case was actually resolved and how the party recovered, each tied to a dated order.`
    : `This case is PENDING. "precedentAnalysis.whatWillHappen" must give a realistic prognosis of the next stages, based on the latest orders, the stage of the case, and the outcomes of the relevant precedents. "precedentAnalysis.howToRecover" must give concrete actions to protect the party's position and move towards a favourable result. "recoverySteps" must list 5-7 specific, ordered actions for this case (what to file or prepare, before which date, and why — tied to the latest orders, pending directions and next hearing). "resolutionSteps" must be an empty array.`;

  const today = new Date().toISOString().slice(0, 10);
  return `You are a senior Indian litigation analyst. Analyse ONLY the record below. Never invent facts, amounts, dates, parties, statutes or citations; if something is not in the record, say it is not recorded.
Strict accuracy rules:
- Mention only dates and years that appear in the record.
- Do not say a direction was complied with (e.g. a deposit was made) unless an order records the compliance; otherwise say compliance is not recorded.
- Today is ${today}. If the recorded next hearing date is already past, say the registry shows no later listing after that date (do not describe it as upcoming).

${dossier}

RELATED JUDGMENTS FROM INDIAN KANOON (ranked by relevance to this case; rely mostly on the higher-relevance ones):
${precedentBlock}

TASKS
1. "summary": a complete summary of the case up to today in 3-5 short paragraphs: (a) what the dispute is and where it came from (including any lower court/tribunal), (b) how it progressed, walking through the court orders in date order with their dates and what each changed, (c) where it stands now (status, stage, last and next hearing, interim relief in force). Base every statement on the orders.
2. "legalMeritAnalysis": an objective 150-250 word assessment of each side's position, the decisive questions, and what the record shows so far.
3. ${stageRules}

Return JSON exactly in this shape:
{
  "summary": "...",
  "legalMeritAnalysis": "...",
  "precedentAnalysis": { "whatWillHappen": "...", "howToRecover": "..." },
  "recoverySteps": ["..."],
  "resolutionSteps": ["..."]
}`;
}

/** Analysis assembled from the registry's own per-order summaries, used when the AI service is unavailable. */
function buildRecordBasedInsights(c: Case, disposed: boolean, candidates: PrecedentCandidate[]): Omit<CaseAiInsight, 'similarCasesCount' | 'similarCases'> {
  const orders = chronologicalOrders(c);
  const latest = orders[orders.length - 1];
  const latestAnalysis = latest ? parseOrderAnalysis(latest) : null;
  const impact = get(latestAnalysis, 'intelligent_insights_analytics.order_significance_and_impact_assessment') || {};

  const intro = `${c.title} (${c.caseNumber}) is before the ${c.court}${c.originCourt ? `, arising from ${c.originCourt}` : ''}. Filed on ${c.filingDate || 'an unrecorded date'}, it is currently ${disposed ? 'disposed' : 'pending'} (status: ${c.currentStatus}${c.stageOfCase ? `, stage: ${c.stageOfCase}` : ''}).`;
  const progress = orders.length
    ? `Proceedings so far (${orders.length} order${orders.length === 1 ? '' : 's'}):\n${orders.map(o => `• ${o.orderDate} — ${o.orderType}: ${o.summary}`).join('\n')}`
    : 'No court orders are on record yet.';
  const now = disposed
    ? `The matter was decided${c.decisionDate ? ` on ${c.decisionDate}` : ''}.`
    : `${c.lastHearingDate ? `Last heard on ${c.lastHearingDate}. ` : ''}${c.nextHearingDate ? `Next listed on ${c.nextHearingDate}.` : 'No next date is recorded.'}`;

  const alerts: string[] = (impact.actionable_alerts_for_parties || [])
    .filter((a: any) => a?.action_required)
    .map((a: any) => `${a.action_required}${a.deadline ? ` (by ${a.deadline})` : ''}${a.responsible_party ? ` — ${a.responsible_party}` : ''}`);
  const risks: string[] = Array.isArray(impact.compliance_directives_or_risks_for_parties) ? impact.compliance_directives_or_risks_for_parties : [];

  return {
    summary: `${intro}\n\n${progress}\n\n${now}`,
    legalMeritAnalysis: 'A merit assessment needs the AI analysis service, which is not available right now. The summary above is compiled directly from the official orders on record; use "Re-Analyze Case" to try again.',
    precedentAnalysis: {
      whatWillHappen: impact.plain_language_summary_for_litigants_outcome_focused
        || (disposed ? `The case has been disposed${c.decisionDate ? ` (${c.decisionDate})` : ''}; the final order governs the parties' rights from here.` : now),
      howToRecover: [...alerts, ...risks].slice(0, 5).join('\n') || 'Review the latest order with counsel and prepare for the next listing.'
    },
    recoverySteps: disposed ? [] : [...alerts, ...risks].slice(0, 6),
    resolutionSteps: disposed ? orders.slice(-4).map(o => `${o.orderDate} — ${o.orderType}: ${o.summary}`) : [],
    caseStage: disposed ? 'disposed' : 'pending',
    ordersAnalyzed: orders.filter(o => o.fullText).length
  };
}

/** Writes 2-3 search queries describing the case's legal issues (used when the registry gives none). */
async function deriveSearchQueries(dossier: string): Promise<string[]> {
  const client = getAiClient();
  if (!client) return [];
  try {
    const response = await generateContentWithFallback(client, {
      contents: `From this Indian court case record, write 4 short keyword search queries (3-7 words each, no party names, no dates) that would find judgments deciding the same legal questions. Use the case type, the statute or act involved, and the subject of the dispute (e.g. "motor accident compensation insurer recovery owner", "section 138 negotiable instruments cheque dishonour"). Return JSON: {"queries": ["..."]}\n\n${dossier.slice(0, 12000)}`,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });
    const parsed = JSON.parse(response.text || '{}');
    return Array.isArray(parsed.queries) ? parsed.queries.filter((q: unknown) => typeof q === 'string') : [];
  } catch (e: any) {
    console.warn('[Insights] Could not derive search queries:', e?.message || e);
    return [];
  }
}

/** Generates the full analysis for a case whose orders have already been loaded. */
export async function generateCaseInsights(c: Case): Promise<CaseAiInsight> {
  const disposed = isCaseDisposed(c);
  const { text: dossier, ordersWithText } = buildCaseDossier(c, disposed);

  const profile = collectIssueProfile(c);
  // Few registry-identified issues (e.g. no order analysis): let the AI phrase searches from the record
  const extraQueries = profile.issues.length >= 2 ? [] : await deriveSearchQueries(dossier);
  const queries = buildPrecedentQueries(c, profile.issues, profile.statutes, extraQueries);
  console.log(`[Insights] ${c.id}: ${ordersWithText} order text(s); precedent queries: ${JSON.stringify(queries)}`);
  const candidates = queries.length ? await findPrecedentCandidates(c, queries) : [];
  console.log(`[Insights] ${c.id}: ${candidates.length} candidate judgment(s) read`);

  const ordersTotal = (c.orders || []).length;
  const missingReason = (c.orders || []).find(o => o.contentStatus === 'unavailable' && o.contentError)?.contentError;
  const registryNotice = ordersTotal > ordersWithText
    ? `${ordersTotal - ordersWithText} of ${ordersTotal} court order(s) could not be read${missingReason ? `: ${missingReason}` : '.'} The analysis below uses the remaining orders, hearing history and case details.`
    : undefined;

  const meta = {
    caseStage: (disposed ? 'disposed' : 'pending') as 'pending' | 'disposed',
    registryNotice,
    ordersAnalyzed: ordersWithText,
    generatedAt: new Date().toISOString(),
    sourceSignature: insightSignature(c),
    version: INSIGHTS_VERSION
  };

  // Score every candidate first, keep the best ten, then reason from those
  const similarCases = await rankPrecedents(dossier, candidates);
  console.log(`[Insights] ${c.id}: ${similarCases.length} related judgment(s) selected (relevance ${similarCases.map(s => s.similarity ?? '-').join(', ')})`);

  const client = getAiClient();
  if (client) {
    try {
      const response = await generateContentWithFallback(client, {
        contents: buildPrompt(c, dossier, disposed, similarCases),
        config: { responseMimeType: 'application/json', temperature: 0.2 }
      });
      const raw = response.text || '';
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
      const steps = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : []);

      return {
        summary: parsed.summary || buildRecordBasedInsights(c, disposed, candidates).summary,
        legalMeritAnalysis: parsed.legalMeritAnalysis || '',
        precedentAnalysis: parsed.precedentAnalysis?.whatWillHappen ? parsed.precedentAnalysis : undefined,
        recoverySteps: disposed ? [] : steps(parsed.recoverySteps),
        resolutionSteps: disposed ? steps(parsed.resolutionSteps) : [],
        similarCases,
        similarCasesCount: similarCases.length,
        ...meta
      };
    } catch (err: any) {
      console.warn(`[Insights] AI analysis failed for ${c.id}; using the order-based summary. (${String(err?.message || err).slice(0, 160)})`);
    }
  }

  return {
    ...buildRecordBasedInsights(c, disposed, candidates),
    similarCases,
    similarCasesCount: similarCases.length,
    ...meta
  };
}
