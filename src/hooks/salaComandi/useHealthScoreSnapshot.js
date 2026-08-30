/**
 * Health Score giornaliero: assembla metriche e chiama calculateHealthScore.
 */

import { useMemo } from 'react';
import { calculateHealthScore, detectPrematureFastBreak } from '../../features/health/HealthScoreEngine.js';

/**
 * @param {{
 *   effectiveTargetsForCurrentDate?: object|null,
 *   userTargets?: object|null,
 *   profileTdeeKcal?: number|null,
 *   homeCalorieSplit?: object|null,
 *   dynamicDailyKcal?: number,
 *   userProfile?: object|null,
 *   metabolicTimelineMeals?: object|null,
 *   metabolicSnapshot?: object|null,
 *   fastingData?: object|null,
 *   totali?: object|null,
 *   sweetCoffeeMacros?: { kcal?: number, carb?: number },
 *   coffeeHealthSignals?: { fastingBrokenBySweetCoffee?: boolean, bitterCoffeeDuringFast?: boolean },
 *   hasPlannedBlock?: boolean, // ignorato: il calendario non pesa sullo score
 *   hasRealWorkoutInActiveLog?: boolean,
 * }} params
 */
export function useHealthScoreSnapshot({
  effectiveTargetsForCurrentDate = null,
  userTargets = null,
  profileTdeeKcal = null,
  homeCalorieSplit = null,
  dynamicDailyKcal = 0,
  userProfile = null,
  metabolicTimelineMeals = null,
  metabolicSnapshot = null,
  fastingData = null,
  totali = null,
  sweetCoffeeMacros = { kcal: 0, carb: 0 },
  coffeeHealthSignals = {},
  hasPlannedBlock: _hasPlannedBlock = false,
  hasRealWorkoutInActiveLog = false,
} = {}) {
  const healthScore = useMemo(() => {
    const proteinTarget = Number(
      effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot,
    ) || 0;
    const carbTarget = Number(
      effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb,
    ) || 0;
    const tdee = Math.round(
      Number(profileTdeeKcal)
      || Number(homeCalorieSplit?.baseKcal)
      || Number(dynamicDailyKcal)
      || Number(effectiveTargetsForCurrentDate?.kcal)
      || 0,
    );
    const bmrFromProfile = Number(userProfile?.bmr ?? userProfile?.BMR);
    const todayFirstMeal = Array.isArray(metabolicTimelineMeals?.todayMealTimes)
      && metabolicTimelineMeals.todayMealTimes.length > 0
      ? metabolicTimelineMeals.todayMealTimes[0]
      : null;
    const fastingBrokenPrematurely = detectPrematureFastBreak(
      metabolicTimelineMeals?.yesterdayLastMealTime,
      todayFirstMeal,
    );
    const hoursFasted = Number(
      metabolicSnapshot?.hoursSinceLastMeal ?? fastingData?.hoursFasted,
    );

    return calculateHealthScore(
      {
        proteinConsumed: Number(totali?.prot) || 0,
        proteinTarget,
        kcalConsumed: (Number(totali?.kcal) || 0) + (Number(sweetCoffeeMacros?.kcal) || 0),
        tdeeKcal: tdee,
        dailyKcalTarget: Number(homeCalorieSplit?.targetKcal) || tdee,
        bmrKcal: Number.isFinite(bmrFromProfile) && bmrFromProfile > 0
          ? bmrFromProfile
          : undefined,
        carbConsumed: (Number(totali?.carb) || 0) + (Number(sweetCoffeeMacros?.carb) || 0),
        carbTarget,
        hoursFasted: Number.isFinite(hoursFasted) ? hoursFasted : null,
        fastingBrokenPrematurely,
        fastingBrokenBySweetCoffee: coffeeHealthSignals?.fastingBrokenBySweetCoffee,
        bitterCoffeeDuringFast: coffeeHealthSignals?.bitterCoffeeDuringFast,
        metabolicPhaseId: metabolicSnapshot?.phase?.id ?? null,
        metabolicProgressInPhase: metabolicSnapshot?.progressInPhase ?? null,
        currentHour: new Date().getHours(),
      },
      Boolean(hasRealWorkoutInActiveLog),
    );
  }, [
    effectiveTargetsForCurrentDate?.prot,
    effectiveTargetsForCurrentDate?.carb,
    effectiveTargetsForCurrentDate?.kcal,
    userTargets?.prot,
    userTargets?.carb,
    profileTdeeKcal,
    homeCalorieSplit?.baseKcal,
    homeCalorieSplit?.targetKcal,
    dynamicDailyKcal,
    userProfile?.bmr,
    userProfile?.BMR,
    metabolicTimelineMeals,
    metabolicSnapshot?.hoursSinceLastMeal,
    metabolicSnapshot?.phase?.id,
    metabolicSnapshot?.progressInPhase,
    fastingData?.hoursFasted,
    totali?.prot,
    totali?.kcal,
    totali?.carb,
    sweetCoffeeMacros?.kcal,
    sweetCoffeeMacros?.carb,
    coffeeHealthSignals?.fastingBrokenBySweetCoffee,
    coffeeHealthSignals?.bitterCoffeeDuringFast,
    hasRealWorkoutInActiveLog,
  ]);

  return { healthScore };
}

export default useHealthScoreSnapshot;
