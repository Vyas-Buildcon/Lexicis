import { useCallback, useEffect, useState } from 'react';
import { SupabaseStatus } from '../types';
import * as api from '../api/client';

/** Polls the cloud database sync status (while signed in) and exposes a manual retry. */
export function useSupabaseStatus(onSynced: () => void, enabled: boolean) {
  const [status, setStatus] = useState<SupabaseStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getSupabaseStatus());
    } catch (e) {
      console.warn("Notice checking Supabase status:", e);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(refresh, 2000);
    const interval = setInterval(refresh, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [refresh, enabled]);

  const retry = useCallback(async () => {
    try {
      const data = await api.retrySupabaseSync();
      if (data.success) {
        setStatus(data.status);
        // Reload cases and other records now that the cloud copy is in sync
        onSynced();
      }
    } catch (e) {
      console.warn("Notice triggering Supabase retry sync:", e);
    }
  }, [onSynced]);

  return { status, retry };
}
