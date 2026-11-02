/**
 * Typed wrappers for every backend endpoint the UI calls.
 * Each function throws an Error carrying the message the UI shows on failure.
 */
import {
  Case,
  CaseAiInsight,
  CaseOrder,
  EmailLog,
  FutureCaseStrategy,
  Hearing,
  StrategyRequestInput,
  SupabaseStatus,
  User
} from '../types';
import { readSessionToken, SessionToken, writeSessionToken } from '../lib/storage';

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Message used when the server does not provide one */
  fallbackError?: string;
  /** Message used regardless of what the server returns */
  errorMessage?: string;
}

/** Dispatched on window when the server rejects the session; the app signs out in response. */
export const SESSION_EXPIRED_EVENT = 'lexicis:session-expired';

function authHeaders(): Record<string, string> {
  const session = readSessionToken();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

/** fetch() with the session token attached; reports an expired session to the app. */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
  if (res.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return res;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, {
    method: options.method || 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok || !isJson) {
    throw new Error(options.errorMessage || data?.error || options.fallbackError || `Request to ${path} failed (${res.status})`);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
  request<T>(path, { ...options, method: 'POST', body });

// ---------- Auth & profile ----------

/** Signs in and stores the session token for subsequent requests. */
export async function login(email: string, password: string): Promise<User> {
  const data = await post<{ user: User } & SessionToken>('/api/auth/login', { email, password }, {
    fallbackError: "Authentication failed. Please check your credentials."
  });
  writeSessionToken({ token: data.token, expiresAt: data.expiresAt });
  return data.user;
}

export async function updateProfile(profile: {
  name: string;
  phone: string;
  address: string;
  firmName: string;
  profession: string;
}): Promise<User> {
  const data = await post<{ user: User }>('/api/user/update', profile, { fallbackError: "Failed to update profile" });
  return data.user;
}

/** Changes the password; the server issues a new session because older ones are revoked. */
export async function updatePassword(currentPassword: string, newPassword: string) {
  const data = await post<{ success: boolean; message: string } & SessionToken>('/api/user/password', { currentPassword, newPassword }, {
    fallbackError: "Failed to update password"
  });
  writeSessionToken({ token: data.token, expiresAt: data.expiresAt });
  return data;
}

// ---------- System ----------

export function getSupabaseStatus() {
  return request<SupabaseStatus>('/api/supabase/status');
}

export function retrySupabaseSync() {
  return post<{ success: boolean; status: SupabaseStatus }>('/api/supabase/retry', undefined);
}

export function getHearings() {
  return request<Hearing[]>('/api/hearings');
}

export function getEmailLogs() {
  return request<EmailLog[]>('/api/email-logs');
}

export function runScheduler() {
  return post<{ success: boolean; sentCount: number }>('/api/scheduler/run', undefined);
}

// ---------- Portfolio tracking ----------

export function getTrackedCases() {
  return request<Case[]>('/api/cases/tracked');
}

export function trackCase(caseData: Case) {
  return post<{ success: boolean; case: Case }>('/api/cases/track', { caseData });
}

export function trackCasesBulk(casesData: Case[]) {
  return post<{ success: boolean; addedCount: number }>('/api/cases/track-bulk', { casesData });
}

export function untrackCase(caseId: string) {
  return post<{ success: boolean }>('/api/cases/untrack', { caseId });
}

export function createCase(newCase: Case) {
  return post<{ success: boolean; case: Case }>('/api/cases/create', newCase);
}

// ---------- Registry search ----------

/** eCourts registry filters; empty values are not sent. */
export interface RegistryFilters {
  courtLevel?: string;
  stateCode?: string;
  districtCode?: string;
  courtCode?: string;
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
}

export interface CaseSearchParams {
  query: string;
  searchBy: string;
  page: number;
  source: string;
  filters: RegistryFilters;
}

export interface CaseSearchResponse {
  results: Case[];
  totalHits: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  /** Matching-case counts per filter value for this search, e.g. { caseStatus: { PENDING: 51 } } */
  facetCounts?: Record<string, Record<string, number>>;
  /** Set when the eCourts registry failed but other results (Indian Kanoon) are shown */
  registryError?: string;
}

export function searchCases(params: CaseSearchParams) {
  const qs = new URLSearchParams();
  if (params.query.trim()) qs.append('q', params.query.trim());
  qs.append('searchBy', params.searchBy);
  qs.append('source', params.source);
  qs.append('page', params.page.toString());
  for (const [key, value] of Object.entries(params.filters)) {
    if (value && value.trim()) qs.append(key, value.trim());
  }

  // The server's reason (e.g. registry credits exhausted) is shown when it gives one
  return request<CaseSearchResponse>(`/api/cases/search?${qs.toString()}`, {
    fallbackError: "Could not fetch search data from Court & Precedent Registries"
  });
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface SearchFilterOptions {
  states: FilterOption[];
  courtLevels: FilterOption[];
  caseTypes: FilterOption[];
  caseStatuses: FilterOption[];
  caseCategories: FilterOption[];
  judicialSections: FilterOption[];
  benchTypes: FilterOption[];
  yearRange: { min: number; max: number };
}

export function getSearchFilterOptions() {
  return request<SearchFilterOptions>('/api/cases/search-filters');
}

export function getDistricts(stateCode: string) {
  return request<FilterOption[]>(`/api/cases/search-filters/districts?state=${encodeURIComponent(stateCode)}`);
}

export function getCourts(stateCode: string, districtCode: string, courtLevel: string) {
  const qs = new URLSearchParams();
  if (stateCode) qs.append('state', stateCode);
  if (districtCode) qs.append('district', districtCode);
  if (courtLevel) qs.append('level', courtLevel);
  return request<FilterOption[]>(`/api/cases/search-filters/courts?${qs.toString()}`);
}

/** The case's court orders with official text (fetched from the registry on first request; can take a minute). */
export async function getCaseOrders(caseId: string): Promise<CaseOrder[]> {
  const data = await request<{ orders: CaseOrder[] }>(`/api/cases/${encodeURIComponent(caseId)}/orders`);
  return data.orders;
}

/** Full judgment text, or null when Indian Kanoon could not provide it. Throws only on network failure. */
export async function getKanoonDocument(docId: string | number): Promise<{ title?: string; doc?: string; url?: string } | null> {
  const res = await apiFetch(`/api/indiankanoon/doc/${docId}`);
  return res.ok ? res.json() : null;
}

// ---------- Case detail ----------

export function getCaseInsights(caseId: string, force = false) {
  return request<CaseAiInsight>(`/api/cases/insights?caseId=${encodeURIComponent(caseId)}${force ? '&refresh=true' : ''}`);
}

export async function askCaseCoach(
  caseId: string,
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> {
  const data = await post<{ reply: string }>('/api/cases/chat', { caseId, message, history });
  return data.reply;
}

export function simulateCaseUpdate(caseId: string, updatedBy: string) {
  return post<{ success: boolean; case: Case }>('/api/cases/simulate-update', { caseId, updatedBy });
}

/** Analysis of one order, plus the order itself (with official text once retrieved). */
export function getOrderAnalysis(caseId: string, orderId: string) {
  return request<{ analysis: any; order: CaseOrder }>(`/api/cases/${caseId}/order/${orderId}/analysis`);
}

export async function downloadOrderPdf(caseId: string, orderId: string): Promise<Blob> {
  const res = await apiFetch(`/api/cases/${caseId}/order/${orderId}/download-pdf`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "PDF download failed");
  }
  return res.blob();
}

// ---------- Legal strategy ----------

/** Follow-up question about a generated strategy, answered by the AI advisor. */
export async function askStrategyQuestion(
  input: StrategyRequestInput,
  strategy: FutureCaseStrategy,
  history: { role: 'user' | 'advisor'; text: string }[],
  question: string
): Promise<string> {
  const data = await post<{ reply: string }>('/api/legal/strategy-chat', { input, strategy, history, question }, {
    fallbackError: 'The AI advisor could not answer right now. Please try again.'
  });
  return data.reply;
}

export async function predictStrategy(input: StrategyRequestInput): Promise<FutureCaseStrategy> {
  const data = await post<{ success: boolean; strategy: FutureCaseStrategy; error?: string }>(
    '/api/legal/predict-strategy',
    input,
    { fallbackError: 'Failed to generate strategy plan.' }
  );
  if (!data.success) {
    throw new Error(data.error || 'Failed to generate strategy plan.');
  }
  return data.strategy;
}
