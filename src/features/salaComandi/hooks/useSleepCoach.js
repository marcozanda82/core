import { useMemo } from 'react';

import {
  analyzeSleepCoach,
  buildSleepCoachInputFromDailyLog,
} from '@/features/salaComandi/engines/sleepCoachEngine';

/**
 * Orchestrazione sonno: log giornaliero + bilancio kcal → output del sleepCoachEngine.
 *
 * @param {{
 *   activeLog?: unknown[] | null,
 *   totali?: { kcal?: number } | null,
 *   dynamicDailyKcal?: number | null,
 *   userProfile?: unknown,
 * }} props
 */
export function useSleepCoach({
  activeLog,
  totali,
  dynamicDailyKcal,
  userProfile,
} = {}) {
  return useMemo(() => {
    const calorieBalance =
      typeof totali?.kcal === 'number' && typeof dynamicDailyKcal === 'number'
        ? Math.round(totali.kcal - dynamicDailyKcal)
        : null;

    const input = buildSleepCoachInputFromDailyLog(activeLog, {
      calorieBalanceApprox: calorieBalance,
      userProfile,
    });

    return analyzeSleepCoach(input);
  }, [activeLog, totali?.kcal, dynamicDailyKcal, userProfile]);
}
