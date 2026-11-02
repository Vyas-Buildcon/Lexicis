/**
 * Helpers for pulling full details for cases that originate from the
 * Indian Kanoon or eCourts registries.
 */
import { Case } from '../../src/types';
import { db } from '../db/database';
import { IndianKanoonService } from './indianKanoonService';
import { EcourtService } from './ecourtService';

type CaseCheck = (c: Case) => boolean;

const always: CaseCheck = () => true;

export function isKanoonCase(c: Case): boolean {
  return c.source === 'Indian Kanoon' || !!c.kanoonDocId || c.id.startsWith('ik-');
}

export function isEcourtCase(c: Case): boolean {
  return c.source === 'eCourts' || !!c.cnrNumber || c.id.startsWith('ec-');
}

/** Kanoon search results lack bench, courtroom and counsel until the full document is read. */
export const kanoonMissingMetadata: CaseCheck = c =>
  !c.courtRoom || c.judge === "Hon'ble Bench" || !c.advocateName;

const REGISTRY_REFRESH_MS = 6 * 60 * 60 * 1000;

/** No orders yet, or orders stored by an older version without registry content tracking. */
export const ecourtNeedsRefresh: CaseCheck = c =>
  !c.orders || c.orders.length === 0 || c.orders.some(o => !o.contentStatus);

/** As above, or the record has not been refreshed from the registry for a while (new orders may exist). */
export const ecourtStale: CaseCheck = c =>
  ecourtNeedsRefresh(c) || !c.lastUpdated || Date.now() - Date.parse(c.lastUpdated) > REGISTRY_REFRESH_MS;

/**
 * Enriches a registry case when its check says details are missing, persists the
 * result and returns it. Failures are logged and the original case is returned.
 */
export async function enrichCase(
  c: Case,
  needs: { kanoon?: CaseCheck; ecourt?: CaseCheck } = {}
): Promise<Case> {
  try {
    if (isKanoonCase(c)) {
      if (!(needs.kanoon ?? always)(c)) return c;
      const enriched = await IndianKanoonService.enrichKanoonCase(c);
      db.updateCase(enriched);
      return enriched;
    }
    if (isEcourtCase(c)) {
      if (!(needs.ecourt ?? always)(c)) return c;
      const enriched = await EcourtService.enrichEcourtCase(c);
      db.updateCase(enriched);
      return enriched;
    }
  } catch (e) {
    console.warn(`Could not enrich case ${c.id}:`, e);
  }
  return c;
}

/** Looks a case up locally, fetching it from the originating registry on demand. */
export async function findOrFetchCase(id: string): Promise<Case | undefined> {
  const existing = db.getCaseById(id);
  if (existing) return existing;

  try {
    let fetched: Case | null = null;
    if (id.startsWith('ik-')) {
      fetched = await IndianKanoonService.fetchAndEnrichKanoonCase(id);
    } else if (id.startsWith('ec-') || /^[A-Z]{4}\d{12}$/i.test(id)) {
      fetched = await EcourtService.fetchAndEnrichEcourtCase(id);
    }
    if (fetched) {
      db.addGlobalCase(fetched);
      return fetched;
    }
  } catch (e) {
    console.warn(`Failed to fetch case ${id} on demand:`, e);
  }
  return undefined;
}
