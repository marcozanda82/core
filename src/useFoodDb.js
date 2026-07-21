import { useEffect, useState } from 'react';
import { loadKentuDatabases } from './foodLoader';
import { scheduleAfterPaint } from './utils/scheduleAfterPaint';

const EMPTY_DBS = {
  kentuItDb: {},
  globalDb: {},
  masterDb: {},
};

/**
 * Loads the large Kentu master food JSON off the critical startup path.
 * Default: defer until after first paint (+ idle when available).
 * Pass `enabled: false` to skip until a feature needs the DB.
 */
export function useFoodDb({ enabled = true, defer = true } = {}) {
  const [kentuItDb, setKentuItDb] = useState(EMPTY_DBS.kentuItDb);
  const [globalDb, setGlobalDb] = useState(EMPTY_DBS.globalDb);
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
          setKentuItDb(
            data?.kentuItDb && typeof data.kentuItDb === 'object' ? data.kentuItDb : {},
          );
          setGlobalDb(
            data?.globalDb && typeof data.globalDb === 'object' ? data.globalDb : {},
          );
        }
      } catch (error) {
        console.error('[useFoodDb] failed to load Kentu databases', error);
        if (!cancelled) {
          setKentuItDb(EMPTY_DBS.kentuItDb);
          setGlobalDb(EMPTY_DBS.globalDb);
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

  return {
    kentuItDb,
    globalDb,
    masterDb: globalDb,
    isLoading,
  };
}

export default useFoodDb;
