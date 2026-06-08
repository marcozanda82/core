/**
 * Delta calorico pianificato per un giorno da `weeklyBlockPlan` (Firebase RTDB).
 */
import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import {
  createEmptyWeeklyBlockPlan,
  isUserAssignedDayBlock,
  resolveBlockKcalTarget,
  sanitizeWeeklyBlockPlanFromFirebase,
} from '../features/weeklyBlocks/weeklyBlockSchema';
import { getWeekStartMondayKeyLocal } from '../weeklyPlanning';

/**
 * @param {object} params
 * @param {import('firebase/database').Database | null | undefined} params.db
 * @param {{ uid?: string } | null | undefined} params.user
 * @param {string | null | undefined} params.dateKey — ISO YYYY-MM-DD
 * @param {number} [params.profileKcal]
 * @param {boolean} [params.isSimulationMode]
 * @returns {{
 *   plannedDelta: number,
 *   hasPlannedBlock: boolean,
 *   plannedTargetKcal: number,
 *   todayPlanBlock: import('../features/weeklyBlocks/weeklyBlockSchema').DayBlock | null,
 *   isLoading: boolean,
 * }}
 */
export default function usePlannedDayDelta({
  db,
  user,
  dateKey,
  profileKcal = 2000,
  isSimulationMode = false,
}) {
  const [weeklyBlockPlan, setWeeklyBlockPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const weekStart = useMemo(
    () => getWeekStartMondayKeyLocal(dateKey || undefined),
    [dateKey]
  );
  const normalizedProfileKcal = Math.round(Number(profileKcal) || 2000);

  useEffect(() => {
    if (!db || !user?.uid || isSimulationMode || !dateKey) {
      setWeeklyBlockPlan(createEmptyWeeklyBlockPlan(weekStart));
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    const planRef = ref(db, `users/${user.uid}/weeklyBlockPlan/${weekStart}`);
    const unsub = onValue(
      planRef,
      (snap) => {
        setWeeklyBlockPlan(
          snap.exists()
            ? sanitizeWeeklyBlockPlanFromFirebase(snap.val(), weekStart)
            : createEmptyWeeklyBlockPlan(weekStart)
        );
        setIsLoading(false);
      },
      () => {
        setWeeklyBlockPlan(createEmptyWeeklyBlockPlan(weekStart));
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [db, user?.uid, weekStart, isSimulationMode, dateKey]);

  return useMemo(() => {
    const plan = weeklyBlockPlan ?? createEmptyWeeklyBlockPlan(weekStart);
    const block =
      dateKey && plan.blocks && typeof plan.blocks === 'object' ? plan.blocks[dateKey] : null;
    const hasPlannedBlock = isUserAssignedDayBlock(block);
    const plannedDelta = hasPlannedBlock
      ? Math.round(Number(block?.calorieStrategy?.deltaKcal) || 0)
      : 0;
    const plannedTargetKcal = hasPlannedBlock
      ? resolveBlockKcalTarget(block, normalizedProfileKcal)
      : normalizedProfileKcal;

    return {
      plannedDelta,
      hasPlannedBlock,
      plannedTargetKcal,
      todayPlanBlock: hasPlannedBlock ? block : null,
      isLoading,
    };
  }, [weeklyBlockPlan, weekStart, dateKey, normalizedProfileKcal, isLoading]);
}
