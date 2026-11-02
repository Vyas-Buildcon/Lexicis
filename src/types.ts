/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'attorney' | 'client';

export interface DashboardStats {
  activeCases: number;
  upcomingHearings: number;
  criticalDeadlines: number;
  syncedDocuments: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  profession: string;
  address: string;
  firmName?: string; // for attorneys
}

export interface CaseHistoryEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  status: string;
  updatedBy: string;
}

export interface CourtDocument {
  id: string;
  name: string;
  category: string;
  uploadDate: string;
  size: string;
  description: string;
  attorneyName: string;
}

export interface CaseOrder {
  id: string;
  orderDate: string;
  orderNumber?: string;
  orderType: string;
  title: string;
  pdfUrl?: string;
  orderUrl?: string;
  judgeName?: string;
  summary: string;
  aiAnalysis?: string;
  fullText?: string;
  /** Whether the official order text has been retrieved from the court registry */
  contentStatus?: 'pending' | 'loaded' | 'unavailable';
  /** Why the official text could not be retrieved (e.g. registry credits exhausted) */
  contentError?: string;
}

export interface Case {
  id: string;
  caseNumber: string;
  cnrNumber?: string;
  caseType?: string;
  regNo?: string;
  filingNo?: string;
  registrationDate?: string;
  decisionDate?: string;
  judicialSection?: string;
  title: string;
  petitioner: string;
  respondent: string;
  petitionersList?: string[];
  respondentsList?: string[];
  petitionerAdvocates?: string[];
  respondentAdvocates?: string[];
  actsAndSections?: string;
  companyName?: string;
  court: string;
  state?: string;
  district?: string;
  judge: string;
  currentStatus: string;
  category: string;
  lastUpdated: string;
  nextHearingDate?: string;
  courtRoom?: string;
  filingDate: string;
  description: string;
  advocateName?: string;
  aiKeywords?: string[];
  isProposedHearing?: boolean;
  documents: CourtDocument[];
  history: CaseHistoryEvent[];
  orders?: CaseOrder[];
  aiInsights?: CaseAiInsight;
  source?: 'eCourts' | 'Indian Kanoon' | 'Local Database';
  kanoonDocId?: number | string;
  docUrl?: string;
  citation?: string;
  headlineSnippet?: string;
  /** Registry stage, e.g. "ADMITTED", "Final Hearing" */
  stageOfCase?: string;
  /** Lower court / tribunal the matter came from, for appeals */
  originCourt?: string;
  lastHearingDate?: string;
}

// Statuses after which a matter is no longer pending before the court
const CONCLUDED_STATUS_PATTERN = /\b(disposed|dismissed|allowed|decided|withdrawn|closed|abated|rejected|infructuous|rule absolute|judgment|partly allowed|lok adalat|settled|decreed|convicted|acquitted)\b/i;

/** True when the case has been finally decided or otherwise closed. */
export function isCaseDisposed(c: Pick<Case, 'currentStatus' | 'decisionDate'>): boolean {
  const status = (c.currentStatus || '').replace(/_/g, ' ');
  if (/\b(pending|admitted|hearing|reserved|stayed|part heard|for orders|for judgment|notice issued|service pending)\b/i.test(status)) {
    return false;
  }
  return CONCLUDED_STATUS_PATTERN.test(status) || !!c.decisionDate;
}

export function isProposedHearingDate(c: Case): boolean {
  if (c.isProposedHearing) return true;
  if (c.caseNumber?.startsWith('PRE-LIT')) return true;
  if (c.court?.toLowerCase().includes('pre-litigation')) return true;
  if (c.currentStatus?.toLowerCase().includes('pre-litigation')) return true;
  return false;
}

export interface SimilarCase {
  title: string;
  status: string;
  result: string;
  /** Relevance to the tracked case (0-100), judged from the precedent's text; absent when not assessed */
  similarity?: number;
  court?: string;
  decisionDate?: string;
  citation?: string;
  cnrNumber?: string;
  source?: string;
  takeaway?: string;
  kanoonDocId?: string | number;
  docUrl?: string;
  description?: string;
}

export interface CaseAiInsight {
  summary: string;
  similarCasesCount: number;
  similarCases: SimilarCase[];
  /** Next steps while the case is pending */
  recoverySteps: string[];
  /** For disposed cases: how the matter was resolved and how the party recovered */
  resolutionSteps?: string[];
  legalMeritAnalysis: string;
  precedentAnalysis?: {
    whatWillHappen: string;
    howToRecover: string;
  };
  caseStage?: 'pending' | 'disposed';
  /** Explains when some official orders could not be read (e.g. registry credits exhausted) */
  registryNotice?: string;
  /** Number of court orders whose text the analysis was based on */
  ordersAnalyzed?: number;
  generatedAt?: string;
  /** Changes when new orders or a status change arrive, so stale analysis is regenerated */
  sourceSignature?: string;
  version?: number;
}

export interface Hearing {
  id: string;
  caseId: string;
  caseTitle: string;
  title: string;
  date: string;
  time: string;
  courtRoom: string;
  description: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export interface EmailLog {
  id: string;
  recipient: string;
  subject: string;
  contentHtml: string;
  timestamp: string;
  type: 'alert' | 'hearing' | 'system';
}

export interface LegalChargeItem {
  actOrSection: string;
  description: string;
  bailable: boolean;
  bailableText: string;
  penaltyOrSentence: string;
}

export interface ImmediateActionItem {
  timeframe: string;
  title: string;
  actions: string[];
}

export interface LegalMitigationStep {
  stepNumber: number;
  title: string;
  description: string;
  legalRationale: string;
  recommendedDocumentOrActivity: string;
}

export interface OutOfCourtSettlementGuide {
  isSettlementRecommended: boolean;
  negotiationStrategy: string;
  recommendedDamagesFormula: string;
  keyTermsToIncludeInAgreement: string[];
  sampleAgreementTemplate?: string;
}

export interface TimelineStage {
  stage: string;
  estimatedTime: string;
  whatToExpect: string;
  howToRespond: string;
}

/** A time limit that matters for the user's position (limitation period, notice reply window, etc.) */
export interface KeyDeadline {
  deadline: string;
  action: string;
  consequenceIfMissed: string;
}

export interface AuthorityToApproach {
  authority: string;
  purpose: string;
}

export interface FutureCaseStrategy {
  incidentSummary: string;
  overallRiskLevel: 'Low' | 'Medium' | 'High' | 'Severe';
  riskScore: number;
  potentialLegalCharges: LegalChargeItem[];
  predictedCaseOutcome: {
    probabilityCriminalTrial: number;
    probabilityOutofCourtSettlement: number;
    probabilityCivilFineOnly: number;
    likelyVerdictSummary: string;
  };
  immediateActionPlan: ImmediateActionItem[];
  mitigationAndLegalSteps: LegalMitigationStep[];
  whatNotToDo: string[];
  outOfCourtSettlementGuide: OutOfCourtSettlementGuide;
  stepByStepTimeline: TimelineStage[];
  keyDeadlines?: KeyDeadline[];
  documentsChecklist?: string[];
  authoritiesToApproach?: AuthorityToApproach[];
  rightsAndProtections?: string[];
  /** Facts the user did not give that could change the analysis */
  questionsToClarify?: string[];
  /** Which kind of lawyer to consult, and how urgently */
  lawyerToConsult?: string;
  /** Which criminal code applies (BNS 2023 or IPC) given the incident date */
  applicableLawNote?: string;
  /** Judgments from Indian Kanoon on the same legal question */
  relevantJudgments?: SimilarCase[];
  /** True when the AI service was unavailable and a generic template was used */
  isFallback?: boolean;
}

export interface StrategyRequestInput {
  incidentType: string;
  userRole: string;
  incidentDetails: string;
  actionsTaken?: string;
  userGoals?: string;
  /** When the incident happened or the notice was received (YYYY-MM-DD) */
  incidentDate?: string;
  /** City / state, which decides the courts and police jurisdiction */
  location?: string;
}

export type AppTab = 'dashboard' | 'search' | 'insights' | 'outbox' | 'strategy';

export interface SupabaseStatus {
  configured: boolean;
  mode?: 'direct_postgres' | 'rest_api' | 'none';
  url: string;
  status: {
    status: 'connected' | 'disconnected' | 'error';
    error: string | null;
    url: string;
    mode?: string;
  };
  sql: string;
}
