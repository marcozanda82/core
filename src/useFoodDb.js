import { useEffect, useMemo, useState } from 'react';
import {
  loadKentuDatabases,
  subscribeKentuDatabases,
  peekKentuDatabasesSnapshot,
} from './foodLoader';
import { scheduleAfterPaint } from './utils/scheduleAfterPaint';

const EMPTY_DBS = {
  kentuItDb: {},
  globalDb: {},
  masterDb: {},
  offDb: {},
  unifiedDb: {},
  usdaDb: {},
};

function dbNonEmpty(db) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) return false;
  for (const _k in db) return true;
  return false;
}

function normalizeCatalogPayload(data) {
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

  return {
    kentuItDb,
    globalDb,
    masterDb: globalDb,
    offDb,
    unifiedDb: kentuItDb,
    usdaDb: globalDb,
  };
}

/**
 * Loads Kentu master food JSON.
 * Core (CREA+USDA) sblocca isLoading; OFF arriva in background via subscribe.
 *
 * @param {{ enabled?: boolean, defer?: boolean }} [options]
 *   defer: solo per preload speculative. Se l’utente ha già aperto pasti, passare false.
 */
export function useFoodDb({ enabled = true, defer = true } = {}) {
  const [masterDatabases, setMasterDatabases] = useState(() => {
    const peek = peekKentuDatabasesSnapshot();
    return peek ? normalizeCatalogPayload(peek) : EMPTY_DBS;
  });
  const [isLoading, setIsLoading] = useState(Boolean(enabled) && !peekKentuDatabasesSnapshot()?.coreReady);
  const [offReady, setOffReady] = useState(() => dbNonEmpty(peekKentuDatabasesSnapshot()?.offDb));

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const openAt = typeof performance !== 'undefined' ? performance.now() : 0;

    const applySnapshot = (data) => {
      if (cancelled || !data) return;
      setMasterDatabases(normalizeCatalogPayload(data));
      const hasCore = Boolean(
        dbNonEmpty(data.kentuItDb)
        || dbNonEmpty(data.globalDb)
        || data.coreReady,
      );
      const hasOff = dbNonEmpty(data.offDb);
      if (hasCore) setIsLoading(false);
      setOffReady(hasOff);
      if (import.meta.env.DEV && hasCore) {
        // eslint-disable-next-line no-console
        console.info('[FoodDBPerf] useFoodDb:core-applied', {
          ms: typeof performance !== 'undefined' ? Math.round(performance.now() - openAt) : null,
          offReady: hasOff,
        });
      }
    };

    const unsub = subscribeKentuDatabases(applySnapshot);

    const load = async () => {
      if (cancelled) return;
      setIsLoading(true);
      try {
        const data = await loadKentuDatabases();
        applySnapshot(data);
      } catch (error) {
        console.error('[useFoodDb] failed to load Kentu databases', error);
        if (!cancelled) {
          setMasterDatabases(EMPTY_DBS);
          setIsLoading(false);
        }
      }
    };

    // Apertura pasti: defer:false. Preload idle: defer:true (timeout breve).
    const cancelSchedule = defer
      ? scheduleAfterPaint(() => {
          void load();
        }, { timeout: 1200 })
      : (() => {
          void load();
          return () => {};
        })();

    return () => {
      cancelled = true;
      cancelSchedule();
      unsub();
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
    offReady,
  }), [masterDatabases, isLoading, offReady]);
}

export default useFoodDb;
