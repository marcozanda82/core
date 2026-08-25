/**
 * Bootstrap Food DB personale: cache locale, alias, porzioni RTDB, lazy cataloghi.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFoodDb } from '../../useFoodDb';
import {
  fetchUserPortionsDict,
  sanitizeUserPortionsDict,
} from '../../features/commandTerminal/conversation/userPortionsMemory.js';
import {
  fetchUserFoodAliasesDict,
  loadUserFoodAliasesFromCache,
  mergeUserFoodAliasesRemoteOverLocal,
  sanitizeUserFoodAliasesDict,
  saveUserFoodAliasesToCache,
} from '../../features/commandTerminal/conversation/userFoodAliases.js';
import {
  loadPersonalDbFromCache,
  mergePersonalDbRemoteOverLocal,
} from '../../utils/offlineCacheUtils';
import { runSanitizeHistoricalFoodDbWithKentuCatalogs } from '../../features/nutrition/sanitizeHistoricalFoodDb';

/**
 * @param {{
 *   userUid?: string|null,
 *   db?: object|null,
 *   auth?: object|null,
 *   isAuthenticated?: boolean,
 *   showFastLogger?: boolean,
 *   activeAction?: string|null,
 * }} params
 */
export function usePersonalFoodDbBootstrap({
  userUid = null,
  db = null,
  auth = null,
  isAuthenticated = false,
  showFastLogger = false,
  activeAction = null,
} = {}) {
  const [foodDb, setFoodDb] = useState(() => loadPersonalDbFromCache());
  const [userPortions, setUserPortions] = useState({});
  const userPortionsRef = useRef(userPortions);
  userPortionsRef.current = userPortions;

  const [userFoodAliases, setUserFoodAliases] = useState(() => loadUserFoodAliasesFromCache());
  const userFoodAliasesRef = useRef(userFoodAliases);
  userFoodAliasesRef.current = userFoodAliases;

  const [foodDbNeeded, setFoodDbNeeded] = useState(false);
  const {
    kentuItDb: kentuCatalogItDb,
    masterDb: csvFoodDb,
    offDb: offFoodDb,
    isLoading: csvFoodDbLoading,
  } = useFoodDb({ defer: true, enabled: foodDbNeeded });

  useEffect(() => {
    if (!userUid) return;
    const cached = loadPersonalDbFromCache(userUid);
    if (Object.keys(cached).length === 0) return;
    setFoodDb((prev) => mergePersonalDbRemoteOverLocal(prev, cached));
  }, [userUid]);

  useEffect(() => {
    if (!userUid) return;
    const cached = loadUserFoodAliasesFromCache(userUid);
    if (Object.keys(cached).length === 0) return;
    setUserFoodAliases((prev) => mergeUserFoodAliasesRemoteOverLocal(prev, cached));
  }, [userUid]);

  useEffect(() => {
    if (foodDbNeeded) return;
    if (showFastLogger || activeAction === 'ai_chat') setFoodDbNeeded(true);
  }, [showFastLogger, activeAction, foodDbNeeded]);

  const kentuCatalogItDbRef = useRef(kentuCatalogItDb);
  const csvFoodDbRef = useRef(csvFoodDb);
  const offFoodDbRef = useRef(offFoodDb);
  kentuCatalogItDbRef.current = kentuCatalogItDb;
  csvFoodDbRef.current = csvFoodDb;
  offFoodDbRef.current = offFoodDb;

  const runHistoricalFoodDbSanitize = useCallback(async ({ dryRun = false } = {}) => {
    const uid = userUid || auth?.currentUser?.uid;
    if (!uid) {
      console.warn('[sanitizeHistoricalFoodDb] nessun userId — login richiesto');
      return null;
    }
    console.log(`[sanitizeHistoricalFoodDb] avvio${dryRun ? ' (dryRun)' : ''}…`);
    const result = await runSanitizeHistoricalFoodDbWithKentuCatalogs(uid, { db, dryRun });
    if (!dryRun && result?.nextFoodDb) {
      setFoodDb(result.nextFoodDb);
    }
    console.log(
      `[sanitizeHistoricalFoodDb] fatto — re-sync ${result?.resynced ?? 0}, sterilizzati ${result?.sterilized ?? 0}, tags ${result?.tagStats?.total ?? 0} (${result?.tagStats?.masterMatched ?? 0} master, ${result?.tagStats?.heuristic ?? 0} euristici)`,
    );
    return result;
  }, [userUid, db, auth]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
    window.__KENTU_SANITIZE_FOOD_DB__ = runHistoricalFoodDbSanitize;
    window.__KENTU_FOOD_DB__ = foodDb;
    return () => {
      if (window.__KENTU_SANITIZE_FOOD_DB__ === runHistoricalFoodDbSanitize) {
        delete window.__KENTU_SANITIZE_FOOD_DB__;
      }
    };
  }, [runHistoricalFoodDbSanitize, foodDb]);

  useEffect(() => {
    if (!userUid || !db || !isAuthenticated) {
      setUserPortions({});
      return undefined;
    }
    let cancelled = false;
    fetchUserPortionsDict(db, userUid).then((dict) => {
      if (!cancelled) setUserPortions(sanitizeUserPortionsDict(dict));
    });
    return () => {
      cancelled = true;
    };
  }, [userUid, db, isAuthenticated]);

  useEffect(() => {
    if (!userUid || !db || !isAuthenticated) {
      setUserFoodAliases({});
      return undefined;
    }
    let cancelled = false;
    fetchUserFoodAliasesDict(db, userUid).then((dict) => {
      if (cancelled) return;
      const merged = sanitizeUserFoodAliasesDict(dict);
      setUserFoodAliases(merged);
      saveUserFoodAliasesToCache(merged, userUid);
    });
    return () => {
      cancelled = true;
    };
  }, [userUid, db, isAuthenticated]);

  return {
    foodDb,
    setFoodDb,
    userPortions,
    setUserPortions,
    userPortionsRef,
    userFoodAliases,
    setUserFoodAliases,
    userFoodAliasesRef,
    foodDbNeeded,
    setFoodDbNeeded,
    kentuCatalogItDb,
    csvFoodDb,
    offFoodDb,
    csvFoodDbLoading,
    kentuCatalogItDbRef,
    csvFoodDbRef,
    offFoodDbRef,
    runHistoricalFoodDbSanitize,
  };
}

export default usePersonalFoodDbBootstrap;
