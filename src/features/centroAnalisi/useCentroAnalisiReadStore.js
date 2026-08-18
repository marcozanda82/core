import { useEffect, useMemo, useState } from 'react';
import { get, onValue, ref } from 'firebase/database';
import { useFirebase } from '../../useFirebase';
import {
  TRACKER_STORICO_KEY,
  applyMealTimes,
  getLogFromStoricoTree,
  getTodayString,
  normalizeLogData,
} from '../../coreEngine';
import { DEFAULT_TARGETS } from '../../useBiochimico';
import { mergeProfileNutritionFromServer } from '../../userNutritionGoals';
import { fourCylinderFromPhysiologyModel } from '../salaComandi/engines/fourCylinderEngine';
import { buildMetabolicFastingSnapshot } from '../salaComandi/utils/metabolicPhaseColors';

/**
 * Lettura RTDB in sola lettura per il Centro Analisi.
 * Stessi path di Sala Comandi: tracker_data, profile_targets, physiology_model, body_metrics.
 * Nessuna scrittura, nessun boot catch-up 4 cilindri.
 */
export function useCentroAnalisiReadStore() {
  const { db, user, authReady } = useFirebase();
  const [ready, setReady] = useState(false);
  const [fullHistory, setFullHistory] = useState({});
  const [activeLog, setActiveLog] = useState([]);
  const [userTargets, setUserTargets] = useState(() => ({ ...DEFAULT_TARGETS }));
  const [userProfile, setUserProfile] = useState({});
  const [fourCylinder, setFourCylinder] = useState(null);
  const [bodyMetricsHistory, setBodyMetricsHistory] = useState([]);

  useEffect(() => {
    if (!authReady) return undefined;
    if (!user) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let unsubToday = null;
    const uid = user.uid;
    const today = getTodayString();
    const basePath = `users/${uid}/tracker_data`;

    Promise.all([
      get(ref(db, basePath)),
      get(ref(db, `users/${uid}/profile_targets`)),
      get(ref(db, `users/${uid}/physiology_model`)),
      get(ref(db, `users/${uid}/body_metrics`)),
    ])
      .then(([trackerSnap, profileSnap, physSnap, metricsSnap]) => {
        if (cancelled) return;
        const tree = trackerSnap.exists() ? trackerSnap.val() : {};
        const safeTree = tree && typeof tree === 'object' ? tree : {};
        setFullHistory(safeTree);

        const todayNode = safeTree[TRACKER_STORICO_KEY(today)];
        const initialLog = getLogFromStoricoTree(safeTree, today) || [];
        const normalized = normalizeLogData(
          Array.isArray(initialLog) ? initialLog : Object.values(initialLog || {}),
        );
        setActiveLog(applyMealTimes(normalized, todayNode?.mealTimes ?? {}));

        if (profileSnap.exists()) {
          const data = profileSnap.val() || {};
          if (data.targets && typeof data.targets === 'object') {
            setUserTargets((prev) => ({ ...prev, ...data.targets }));
          }
          if (data.profile && typeof data.profile === 'object') {
            const merged = mergeProfileNutritionFromServer(data.profile);
            setUserProfile(merged);
            if (merged.targetCalories != null && Number.isFinite(Number(merged.targetCalories))) {
              setUserTargets((prev) => ({ ...prev, kcal: Math.round(Number(merged.targetCalories)) }));
            }
            if (merged.proteinTarget != null && merged.proteinTarget !== '') {
              setUserTargets((prev) => ({ ...prev, prot: Math.round(Number(merged.proteinTarget)) }));
            }
          }
        }

        if (physSnap.exists()) {
          setFourCylinder(fourCylinderFromPhysiologyModel(physSnap.val(), today));
        }

        if (metricsSnap.exists()) {
          const val = metricsSnap.val();
          const list = val && typeof val === 'object'
            ? Object.values(val).filter((row) => row && typeof row === 'object')
            : [];
          setBodyMetricsHistory(list);
        }

        setReady(true);

        unsubToday = onValue(
          ref(db, `${basePath}/${TRACKER_STORICO_KEY(today)}`),
          (liveSnap) => {
            if (cancelled || !liveSnap.exists()) return;
            const val = liveSnap.val() || {};
            const incomingLog = val.log ?? [];
            const liveNormalized = normalizeLogData(
              Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
            );
            setActiveLog(applyMealTimes(liveNormalized, val.mealTimes ?? {}));
          },
        );
      })
      .catch((error) => {
        console.warn('[centroAnalisi] read store failed', error);
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      unsubToday?.();
    };
  }, [authReady, user, db]);

  const fastingData = useMemo(
    () => buildMetabolicFastingSnapshot(activeLog, new Date().getHours(), {}),
    [activeLog],
  );

  return {
    authReady,
    isAuthenticated: Boolean(user),
    ready: authReady && ready,
    db,
    uid: user?.uid ?? null,
    todayDate: getTodayString(),
    fullHistory,
    activeLog,
    userTargets,
    userProfile,
    fourCylinder,
    bodyMetricsHistory,
    fastingData,
  };
}
