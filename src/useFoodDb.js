import { useEffect, useMemo, useState } from 'react';
import { loadKentuDatabases } from './foodLoader';
import { scheduleAfterPaint } from './utils/scheduleAfterPaint';

const EMPTY_DBS = {
  kentuItDb: {},
  globalDb: {},
  masterDb: {},
  offDb: {},
  unifiedDb: {},
  usdaDb: {},
};

/**
 * Loads the large Kentu master food JSON off the critical startup path.
 * Default: defer until after first paint (+ idle when available).
 * Pass `enabled: false` to skip until a feature needs the DB.
 */
export function useFoodDb({ enabled = true, defer = true } = {}) {
  const [masterDatabases, setMasterDatabases] = useState(EMPTY_DBS);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      setIsLoading(true);
      try {
        const data = await loadKentuDatabases();
        if (!cancelled) {
          const kentuItDb =
            data?.kentuItDb && typeof data.kentuItDb === 'object'
              ? data.kentuItDb
              : (data?.unifiedDb && typeof data.unifiedDb === 'object' ? data.unifiedDb : {});
          const globalDb =
            data?.globalDb && typeof data.globalDb === 'object'
              ? data.globalDb
              : (data?.usdaDb && typeof data.usdaDb === 'object' ? data.usdaDb : {});
          const offDb =
            data?.offDb && typeof data.offDb === 'object' ? data.offDb : {};

          setMasterDatabases({
            kentuItDb,
            globalDb,
            masterDb: globalDb,
            offDb,
            unifiedDb: kentuItDb,
            usdaDb: globalDb,
          });
        }
      } catch (error) {
        console.error('[useFoodDb] failed to load Kentu databases', error);
        if (!cancelled) {
          setMasterDatabases(EMPTY_DBS);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const cancelSchedule = defer
      ? scheduleAfterPaint(() => {
          void load();
        }, { timeout: 3500 })
      : (() => {
          void load();
          return () => {};
        })();

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [enabled, defer]);

  return useMemo(() => ({
    masterDatabases,
    kentuItDb: masterDatabases.kentuItDb,
    globalDb: masterDatabases.globalDb,
    masterDb: masterDatabases.masterDb,
    offDb: masterDatabases.offDb,
    unifiedDb: masterDatabases.unifiedDb,
    usdaDb: masterDatabases.usdaDb,
    isLoading,
  }), [masterDatabases, isLoading]);
}

export default useFoodDb;
