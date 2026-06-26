import { useEffect, useState } from 'react';
import { loadKentuDatabases } from './foodLoader';

const EMPTY_MASTER_DATABASES = {
  unifiedDb: {},
  usdaDb: {},
};

export function useFoodDb() {
  const [masterDatabases, setMasterDatabases] = useState(EMPTY_MASTER_DATABASES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await loadKentuDatabases();
        if (!cancelled) {
          setMasterDatabases({
            unifiedDb:
              data?.unifiedDb && typeof data.unifiedDb === 'object' ? data.unifiedDb : {},
            usdaDb: data?.usdaDb && typeof data.usdaDb === 'object' ? data.usdaDb : {},
          });
        }
      } catch (error) {
        console.error('[useFoodDb] failed to load Kentu master databases', error);
        if (!cancelled) {
          setMasterDatabases(EMPTY_MASTER_DATABASES);
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
    masterDatabases,
    unifiedDb: masterDatabases.unifiedDb,
    usdaDb: masterDatabases.usdaDb,
    isLoading,
  };
}

export default useFoodDb;
