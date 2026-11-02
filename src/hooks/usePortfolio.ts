import { useCallback, useEffect, useState } from 'react';
import { Case, EmailLog, Hearing } from '../types';
import * as api from '../api/client';
import { readTrackedCases, writeTrackedCases } from '../lib/storage';

/**
 * The cached portfolio is the source of truth for which cases are shown;
 * the server only refreshes details of cases already in it.
 */
function mergeWithCache(serverCases: Case[]): Case[] {
  const cached = readTrackedCases();
  if (cached === null) return serverCases;
  const serverMap = new Map(serverCases.map(c => [c.id, c]));
  return cached.map(c => serverMap.get(c.id) || c);
}

/** Portfolio state for the signed-in user: tracked cases, hearings, email log and the active case. */
export function usePortfolio(userId: string | undefined) {
  const [trackedCases, setTrackedCases] = useState<Case[]>(() => readTrackedCases() ?? []);
  const [allHearings, setAllHearings] = useState<Hearing[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  /** Applies a change to the portfolio and mirrors it to the browser cache. */
  const updateTracked = useCallback((change: (prev: Case[]) => Case[]) => {
    setTrackedCases(prev => {
      const next = change(prev);
      if (next !== prev) writeTrackedCases(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      await Promise.all([
        api.getTrackedCases().then(serverCases => {
          const merged = mergeWithCache(serverCases);
          writeTrackedCases(merged);
          setTrackedCases(merged);
          // Keep the active case current, or default to the first case in the portfolio
          setSelectedCase(prev => prev
            ? merged.find(c => c.id === prev.id) ?? null
            : merged[0] ?? null);
        }),
        api.getHearings().then(setAllHearings),
        api.getEmailLogs().then(setEmailLogs)
      ]);
    } catch (e) {
      console.error("Error loading full stack dashboard state", e);
    } finally {
      setIsInitialLoad(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      refresh();
    } else {
      // Clear data on logout (the browser cache is kept for the next sign-in)
      setTrackedCases([]);
      setAllHearings([]);
      setEmailLogs([]);
      setSelectedCase(null);
      setIsInitialLoad(true);
    }
  }, [userId, refresh]);

  const trackCase = useCallback(async (c: Case) => {
    if (!userId) return;
    updateTracked(prev => prev.some(sc => sc.id === c.id) ? prev : [...prev, c]);
    try {
      // The server returns the case enriched with full registry details
      const { case: enriched } = await api.trackCase(c);
      if (enriched) {
        updateTracked(prev => prev.map(sc => sc.id === enriched.id ? enriched : sc));
      }
    } catch (err) {
      console.error("Background track error:", err);
    }
  }, [userId, updateTracked]);

  /** Adds cases as-is (no registry enrichment), e.g. a bulk selection or a locally created file. */
  const trackCasesBulk = useCallback(async (cases: Case[]) => {
    if (!userId) return;
    updateTracked(prev => {
      const existingIds = new Set(prev.map(sc => sc.id));
      const newCases = cases.filter(sc => !existingIds.has(sc.id));
      return newCases.length === 0 ? prev : [...prev, ...newCases];
    });
    try {
      await api.trackCasesBulk(cases);
    } catch (err) {
      console.error("Background bulk track error:", err);
    }
  }, [userId, updateTracked]);

  const untrackCase = useCallback((caseId: string) => {
    updateTracked(prev => prev.filter(c => c.id !== caseId));
    setSelectedCase(prev => prev?.id === caseId ? null : prev);
    if (userId) {
      api.untrackCase(caseId).catch(err => console.error("Background untrack error:", err));
    }
  }, [userId, updateTracked]);

  return {
    trackedCases,
    allHearings,
    emailLogs,
    selectedCase,
    setSelectedCase,
    isInitialLoad,
    refresh,
    trackCase,
    trackCasesBulk,
    untrackCase
  };
}
