/**
 * Browser storage for the signed-in session and the portfolio cache.
 * Every access is guarded: storage can be unavailable or hold malformed data.
 */
import { Case, User } from '../types';

const TRACKED_CASES_KEY = 'lexicis_tracked_cases';
const SESSION_USER_KEY = 'lexicis_session_user';
const SESSION_TOKEN_KEY = 'lexicis_session_token';
const WELCOME_COACH_DISMISSED_KEY = 'lexicis_dismissed_welcome_coach';

/** Cached portfolio, or null when nothing has been cached yet. */
export function readTrackedCases(): Case[] | null {
  try {
    const raw = localStorage.getItem(TRACKED_CASES_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error reading tracked cases from localStorage", e);
    return [];
  }
}

export function writeTrackedCases(cases: Case[]) {
  try {
    localStorage.setItem(TRACKED_CASES_KEY, JSON.stringify(cases));
  } catch (e) {
    console.error("Error syncing to localStorage", e);
  }
}

export interface SessionToken {
  token: string;
  expiresAt: number;
}

export function readSessionUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Session restoration error", e);
    return null;
  }
}

export function writeSessionUser(user: User) {
  try {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error("Error saving session", e);
  }
}

/** The API session token, or null when missing or expired. */
export function readSessionToken(): SessionToken | null {
  try {
    const raw = localStorage.getItem(SESSION_TOKEN_KEY);
    const parsed: SessionToken | null = raw ? JSON.parse(raw) : null;
    return parsed && parsed.token && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSessionToken(session: SessionToken) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(session));
  } catch (e) {
    console.error("Error saving session", e);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (e) {
    console.error("Error clearing session", e);
  }
}

export function isWelcomeCoachDismissed(): boolean {
  try {
    return !!sessionStorage.getItem(WELCOME_COACH_DISMISSED_KEY);
  } catch {
    return false;
  }
}

export function dismissWelcomeCoach() {
  try {
    sessionStorage.setItem(WELCOME_COACH_DISMISSED_KEY, 'true');
  } catch {
    // Non-critical: the pop-up may simply reappear this session
  }
}
