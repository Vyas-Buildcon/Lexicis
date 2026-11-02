/**
 * Finds judgments on the same legal questions as a tracked case and reads
 * enough of each to judge relevance and outcome.
 */
import { Case, SimilarCase } from '../../../src/types';
import { getAiClient, generateContentWithFallback } from './geminiClient';
import { IndianKanoonService } from '../indianKanoonService';

export interface PrecedentCandidate {
  docId: string;
  title: string;
  court: string;
  citation?: string;
  decisionDate?: string;
  docUrl: string;
  snippet: string;
  /** Opening and closing passages of the judgment (the closing part carries the outcome) */
  excerpt: string;
}

// Indian Kanoon "doctypes:" values for each High Court
const HIGH_COURT_DOCTYPES: [RegExp, string][] = [
  [/bombay|maharashtra|goa/i, 'bombay'],
  [/delhi/i, 'delhi'],
  [/madras|tamil\s*nadu|chennai/i, 'chennai'],
  [/karnataka|bengaluru|bangalore/i, 'karnataka'],
  [/kerala/i, 'kerala'],
  [/allahabad|uttar\s*pradesh|lucknow/i, 'allahabad'],
  [/calcutta|kolkata|west\s*bengal/i, 'kolkata'],
  [/gujarat/i, 'gujarat'],
  [/punjab|haryana|chandigarh/i, 'punjab'],
  [/rajasthan/i, 'rajasthan'],
  [/patna|bihar/i, 'patna'],
  [/orissa|odisha/i, 'orissa'],
  [/gauhati|assam/i, 'gauhati'],
  [/telangana|hyderabad/i, 'telangana'],
  [/andhra/i, 'andhra'],
  [/jharkhand/i, 'jharkhand'],
  [/chhattisgarh/i, 'chattisgarh'],
  [/madhya\s*pradesh|jabalpur/i, 'madhyapradesh'],
  [/uttarakhand|uttaranchal/i, 'uttaranchal'],
  [/himachal/i, 'himachal_pradesh'],
  [/jammu|kashmir/i, 'jammu']
];

const STOPWORDS = new Set(('a an and are as at be by for from in into is it of on or the to under with whether its their this that ' +
  'proper validity correctness determination appropriate matters matter cases case review decisions decision issue issues ' +
  'appellate application applications regarding relating related legal law court courts if applicable').split(' '));

function doctypesFor(c: Case): string {
  const where = `${c.court} ${c.state || ''} ${c.district || ''}`;
  const hc = HIGH_COURT_DOCTYPES.find(([pattern]) => pattern.test(where))?.[1];
  return hc ? `${hc},supremecourt` : 'supremecourt,highcourts';
}

/** Turns an issue phrase into a compact keyword query. */
function keywords(phrase: string, max = 6): string {
  const words = phrase
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  return [...new Set(words.map(w => w.toLowerCase()))].slice(0, max).join(' ');
}

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keyword queries (without court scope) from the case's legal issues, statutes and type. */
export function buildPrecedentQueries(c: Case, issues: string[], statutes: string[], extraQueries: string[] = []): string[] {
  const statute = statutes[0] ? keywords(statutes[0], 3) : '';
  const queries: string[] = [];

  if (issues[0]) queries.push(`${keywords(issues[0])} ${statute}`.trim());
  if (issues[1]) queries.push(keywords(issues[1]));
  if (issues[2]) queries.push(keywords(issues[2]));
  for (const q of extraQueries) queries.push(keywords(q, 8));
  if (statutes[1]) queries.push(`${keywords(issues[0] || c.category || '', 3)} ${keywords(statutes[1], 3)}`.trim());
  // Indian Kanoon cases carry placeholder category/type labels that make useless queries
  if (c.source !== 'Indian Kanoon') {
    const typeQuery = keywords(`${c.category || ''} ${c.caseType || ''} ${c.actsAndSections || ''}`, 7);
    if (typeQuery) queries.push(typeQuery);
  }

  const junk = /\b(not specified|unknown|precedent|reported judgment|case law)\b/i;
  return [...new Set(queries.filter(q => q.split(' ').length >= 2 && !junk.test(q)))].slice(0, 5);
}

function isSameMatter(candidate: Case, c: Case): boolean {
  if (c.kanoonDocId && String(candidate.kanoonDocId) === String(c.kanoonDocId)) return true;
  const title = (candidate.title || '').toLowerCase();
  const party = (c.petitioner || '').toLowerCase().replace(/pvt\.?|ltd\.?|limited|private|smt\.?|shri/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
  return party.length > 4 && title.includes(party);
}

// Judgment excerpts never change; keep them for the life of the process
const excerptCache = new Map<string, string>();

async function readExcerpt(docId: string): Promise<string> {
  const cached = excerptCache.get(docId);
  if (cached) return cached;
  const doc = await IndianKanoonService.getDocument(docId).catch(() => null);
  const text = stripHtml(doc?.doc || '');
  const excerpt = text.length <= 3600 ? text : `${text.slice(0, 1100)} … ${text.slice(-2500)}`;
  if (excerpt) excerptCache.set(docId, excerpt);
  return excerpt;
}

/** How many related judgments every analysis aims to show. */
export const TARGET_PRECEDENTS = 10;
// Candidates collected and read so the best TARGET_PRECEDENTS can be chosen
const CANDIDATE_POOL = 24;
const CANDIDATES_TO_READ = 18;

/**
 * Searches Indian Kanoon with each query (two result pages each, the case's own High Court
 * and the Supreme Court first, then all High Courts), removes the case itself and
 * duplicates, and reads the top candidates' judgment text.
 */
export async function findPrecedentCandidates(c: Case, queries: string[]): Promise<PrecedentCandidate[]> {
  const seen = new Set<string>();
  const hits: Case[] = [];
  const collect = (results: Case[]) => {
    for (const r of results) {
      const id = String(r.kanoonDocId || r.id.replace(/^ik-/, ''));
      if (!id || seen.has(id) || isSameMatter(r, c)) continue;
      seen.add(id);
      hits.push(r);
    }
  };

  const scopes = [doctypesFor(c), 'supremecourt,highcourts'];
  for (const scope of [...new Set(scopes)]) {
    for (const query of queries) {
      for (const pagenum of [0, 1]) {
        if (hits.length >= CANDIDATE_POOL) break;
        const results = await IndianKanoonService.searchCasesAsync(`${query} doctypes: ${scope}`, pagenum).catch(() => [] as Case[]);
        collect(results);
        if (results.length < 10) break;
      }
    }
    // The narrower scope found enough; no need to widen
    if (hits.length >= CANDIDATES_TO_READ) break;
  }

  const selected = hits.slice(0, CANDIDATES_TO_READ);
  const excerpts = new Map<string, string>();
  const queue = [...selected];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const id = String(item.kanoonDocId || item.id.replace(/^ik-/, ''));
      excerpts.set(id, await readExcerpt(id));
    }
  }));

  return selected.map(r => {
    const id = String(r.kanoonDocId || r.id.replace(/^ik-/, ''));
    return {
      docId: id,
      title: r.title,
      court: r.court,
      citation: r.citation,
      decisionDate: r.decisionDate && r.decisionDate !== 'Recent' ? r.decisionDate : undefined,
      docUrl: r.docUrl || `https://indiankanoon.org/doc/${id}/`,
      snippet: stripHtml(r.headlineSnippet || r.description || ''),
      excerpt: excerpts.get(id) || ''
    };
  });
}

// ==========================================
// Ranking
// ==========================================

const normalizeTitle = (title: string) =>
  title.toLowerCase().replace(/\s+on\s+\d{1,2}\s+\w+,?\s+\d{4}.*$/, '').replace(/[^a-z0-9]/g, '');

function unscored(p: PrecedentCandidate): SimilarCase {
  return {
    title: p.title,
    status: 'Decided',
    result: p.snippet || 'Open the judgment on Indian Kanoon to read the outcome.',
    citation: p.citation,
    court: p.court,
    decisionDate: p.decisionDate,
    source: 'Indian Kanoon',
    kanoonDocId: p.docId,
    docUrl: p.docUrl
  };
}

/** One AI call that scores every candidate; returns null when the response is unusable. */
async function scoreCandidates(subject: string, candidates: PrecedentCandidate[]): Promise<Map<number, any> | null> {
  const client = getAiClient();
  if (!client) return null;
  const list = candidates
    .map((p, i) => `[${i + 1}] ${p.title} | ${p.court}\n${(p.excerpt || p.snippet).slice(0, 2600)}`)
    .join('\n\n');

  const response = await generateContentWithFallback(client, {
    contents: `You rank Indian judgments by how closely they match a case. Read the case, then score EVERY numbered judgment.

CASE
${subject.slice(0, 9000)}

JUDGMENTS (opening … closing excerpts)
${list}

For each judgment return:
- "n": its number
- "relevance": 0-100. 80+ = decides the same legal question on similar facts; 50-79 = same legal question or statute; 20-49 = related area of law; below 20 = unrelated.
- "status": Allowed, Dismissed, Partly Allowed, Remanded, Disposed or Other
- "outcome": what the court actually decided, from the excerpt (or "Outcome not visible in excerpt")
- "takeaway": 1-2 sentences on how it helps or hurts the party in this case

Return JSON: {"rankings": [ {"n": 1, "relevance": 0, "status": "", "outcome": "", "takeaway": ""} ]} with exactly ${candidates.length} entries.`,
    config: { responseMimeType: 'application/json', temperature: 0.1 }
  });

  const parsed = JSON.parse(response.text || '{}');
  const scores = new Map<number, any>();
  for (const r of Array.isArray(parsed.rankings) ? parsed.rankings : []) {
    const n = Number(r?.n);
    const relevance = Number(r?.relevance);
    if (Number.isInteger(n) && n >= 1 && n <= candidates.length && r?.relevance !== null && Number.isFinite(relevance)) {
      scores.set(n, { ...r, relevance: Math.max(0, Math.min(100, Math.round(relevance))) });
    }
  }
  return scores;
}

/**
 * Scores every candidate and returns the TARGET_PRECEDENTS most relevant (titles de-duplicated).
 * Retries once if the model skipped many candidates; anything still unscored is ranked last.
 */
export async function rankPrecedents(subject: string, candidates: PrecedentCandidate[], limit = TARGET_PRECEDENTS): Promise<SimilarCase[]> {
  // Several entries of the same matter (e.g. successive orders) count once
  const seenTitles = new Set<string>();
  const unique = candidates.filter(p => {
    const key = normalizeTitle(p.title);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  if (unique.length === 0) return [];

  let scores: Map<number, any> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const next = await scoreCandidates(subject, unique);
      if (next && (!scores || next.size > scores.size)) scores = next;
      if (scores && scores.size >= unique.length * 0.8) break;
    } catch (e: any) {
      console.warn(`[Insights] Precedent ranking attempt ${attempt + 1} failed:`, String(e?.message || e).slice(0, 160));
    }
  }
  if (!scores || scores.size === 0) return unique.slice(0, limit).map(unscored);

  const scored = unique
    .map((p, i) => ({ p, s: scores!.get(i + 1) }))
    .sort((a, b) => (b.s?.relevance ?? -1) - (a.s?.relevance ?? -1));

  return scored.slice(0, limit).map(({ p, s }) => s ? {
    title: p.title,
    status: s.status || 'Decided',
    result: s.outcome || p.snippet,
    similarity: s.relevance,
    citation: p.citation,
    court: p.court,
    decisionDate: p.decisionDate,
    source: 'Indian Kanoon',
    takeaway: s.takeaway || undefined,
    kanoonDocId: p.docId,
    docUrl: p.docUrl,
    description: p.snippet || undefined
  } : unscored(p));
}
