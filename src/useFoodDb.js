import { useEffect, useState } from 'react';
import { loadKentuDatabases } from './foodLoader';

const EMPTY_DBS = {
  kentuItDb: {},
  globalDb: {},
  masterDb: {},
};

export function useFoodDb() {
  const [kentuItDb, setKentuItDb] = useState(EMPTY_DBS.kentuItDb);
  const [globalDb, setGlobalDb] = useState(EMPTY_DBS.globalDb);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
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

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    kentuItDb,
    globalDb,
    masterDb: globalDb,
    isLoading,
  };
}

export default useFoodDb;
