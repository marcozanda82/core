import { useEffect, useState } from 'react';
import { loadFoodDbFromCSV } from './foodLoader';

export function useFoodDb() {
  const [foodDb, setFoodDb] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await loadFoodDbFromCSV();
        if (!cancelled) {
          setFoodDb(data && typeof data === 'object' ? data : {});
        }
      } catch (error) {
        console.error('[useFoodDb] failed to load food DB', error);
        if (!cancelled) {
          setFoodDb({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { foodDb, loading };
}

export default useFoodDb;
