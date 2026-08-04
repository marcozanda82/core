import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { computeSleepGhostBaseline } from '../utils/saluteDashboardMetrics';

/**
 * Subscribe all `sleep_logs` for ghost baseline (media settimana).
 */
export function useSleepLogsMap({
  db = null,
  uid = null,
  todayDate = '',
  enabled = true,
} = {}) {
  const [map, setMap] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || !db || !uid) {
      setMap(null);
      setHydrated(false);
      return undefined;
    }
    setHydrated(false);
    const unsub = onValue(ref(db, `users/${uid}/sleep_logs`), (snap) => {
      const val = snap.val();
      setMap(val && typeof val === 'object' ? val : {});
      setHydrated(true);
    });
    return () => unsub();
  }, [enabled, db, uid]);

  const baseline = useMemo(
    () => computeSleepGhostBaseline(map, todayDate, 7),
    [map, todayDate],
  );

  return {
    map,
    hydrated,
    averageHours: baseline.averageHours,
    sampleSize: baseline.sampleSize,
    targetHours: baseline.targetHours,
    ghostHours: baseline.averageHours ?? baseline.targetHours,
  };
}

export default useSleepLogsMap;
