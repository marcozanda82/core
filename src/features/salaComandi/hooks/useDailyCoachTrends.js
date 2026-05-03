import { useMemo } from 'react';
import { analyzeDailyCoachTrends } from '@/features/salaComandi/engines/dailyCoachTrendsEngine';

export function useDailyCoachTrends({ dailyHistory, sleepHistory, nutritionHistory }) {
  return useMemo(() => {
    return analyzeDailyCoachTrends({
      dailyHistory,
      sleepHistory,
      nutritionHistory,
    });
  }, [dailyHistory, sleepHistory, nutritionHistory]);
}
