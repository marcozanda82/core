import { useMemo } from 'react';

import { analyzeDailyCoach } from '@/features/salaComandi/engines/dailyCoachEngine';

export function useDailyCoach({
  sleepCoach,
  metabolicCoach,
  totali,
  energyAt20Percent,
  kentuDailyCalorieStrategy,
  aiDayCoach,
}) {
  return useMemo(() => {
    const input = {
      sleepCoach,
      metabolicCoach,
      dailyIndicators: {
        omega3: totali?.omega3 ?? null,
        energyAt20Percent: energyAt20Percent ?? null,
      },
      calorieStrategy: kentuDailyCalorieStrategy ?? null,
      nutritionTotals: totali ?? null,
      aiDayCoach: aiDayCoach ?? null,
    };

    return analyzeDailyCoach(input);
  }, [
    sleepCoach,
    metabolicCoach,
    totali?.omega3,
    energyAt20Percent,
    kentuDailyCalorieStrategy,
    aiDayCoach,
  ]);
}

