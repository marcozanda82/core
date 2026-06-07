/**
 * Hook Livella a Bolla Settimanale — collega fullHistory, weeklyBlockPlan (RTDB) e L4.
 * Solo calcoli ed estrazione dati; nessun componente UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import {
  buildWeeklyBubbleSnapshot,
  deriveWeeklyBalanceStatus,
} from '../features/energyBalance/buildWeeklyBubbleSnapshot';
import {
  createEmptyWeeklyBlockPlan,
  getWeekDateKeysLocal,
  sanitizeWeeklyBlockPlanFromFirebase,
} from '../features/weeklyBlocks/weeklyBlockSchema';
import { getTodayString } from '../coreEngine';
import { getWeekStartMondayKeyLocal } from '../weeklyPlanning';

/**
 * @param {object} params
 * @param {import('firebase/database').Database | null | undefined} params.db
 * @param {{ uid?: string } | null | undefined} params.user
 * @param {Record<string, unknown>} [params.fullHistory]
 * @param {{ kcal?: number } | null | undefined} [params.userTargets]
 * @param {string | null | undefined} [params.currentTrackerDate]
 * @param {boolean} [params.isSimulationMode]
 * @param {() => string} [params.getTodayString]
 * @param {boolean} [params.includeToday=true]
 * @returns {{
 *   weekBalance: number,
 *   weekTarget: number,
 *   weekIntake: number,
 *   bubbleTilt: number,
 *   daysAnalyzed: number,
 *   daysWithLog: number,
 *   status: 'surplus' | 'deficit' | 'inline',
 *   weekStart: string,
 *   isLoading: boolean,
 * }}
 */
export default function useWeeklyEnergyBalance({
  db,
  user,
  fullHistory,
  userTargets,
  currentTrackerDate,
  isSimulationMode = false,
  getTodayString: getTodayStringProp,
  includeToday = true,
}) {
  const [weeklyBlockPlan, setWeeklyBlockPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const todayStr = typeof getTodayStringProp === 'function' ? getTodayStringProp() : getTodayString();
  const anchorDate = currentTrackerDate || todayStr;
  const weekStart = useMemo(
    () => getWeekStartMondayKeyLocal(anchorDate),
    [anchorDate]
  );
  const weekDateKeys = useMemo(() => getWeekDateKeysLocal(weekStart), [weekStart]);
  const profileKcal = Number(userTargets?.kcal ?? 2000) || 2000;

  useEffect(() => {
    if (!db || !user?.uid || isSimulationMode) {
      setWeeklyBlockPlan(createEmptyWeeklyBlockPlan(weekStart));
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    const planRef = ref(db, `users/${user.uid}/weeklyBlockPlan/${weekStart}`);
    const unsub = onValue(planRef, (snap) => {
      if (snap.exists()) {
        setWeeklyBlockPlan(sanitizeWeeklyBlockPlanFromFirebase(snap.val(), weekStart));
      } else {
        setWeeklyBlockPlan(createEmptyWeeklyBlockPlan(weekStart));
      }
      setIsLoading(false);
    });

    return () => unsub();
  }, [db, user?.uid, weekStart, isSimulationMode]);

  const bubbleSnapshot = useMemo(() => {
    const plan = weeklyBlockPlan ?? createEmptyWeeklyBlockPlan(weekStart);
    return buildWeeklyBubbleSnapshot({
      fullHistory,
      weeklyBlockPlan: plan,
      profileKcal,
      weekDateKeys,
      includeToday,
      todayDate: todayStr,
    });
  }, [fullHistory, weeklyBlockPlan, profileKcal, weekDateKeys, weekStart, includeToday, todayStr]);

  const status = useMemo(
    () => deriveWeeklyBalanceStatus(bubbleSnapshot.weekBalance, bubbleSnapshot.bubbleTilt),
    [bubbleSnapshot.weekBalance, bubbleSnapshot.bubbleTilt]
  );

  return {
    weekBalance: bubbleSnapshot.weekBalance,
    weekTarget: bubbleSnapshot.weekTarget,
    weekIntake: bubbleSnapshot.weekIntake,
    bubbleTilt: bubbleSnapshot.bubbleTilt,
    daysAnalyzed: bubbleSnapshot.daysAnalyzed,
    daysWithLog: bubbleSnapshot.daysWithLog,
    status,
    weekStart,
    isLoading,
  };
}
