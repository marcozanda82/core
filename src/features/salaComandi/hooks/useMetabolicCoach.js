import { useMemo } from 'react';
import { buildMetabolicCoachInsight } from '../engines/metabolicCoachEngine';

/**
 * @param {{
 *   mapData: object | null | undefined,
 *   userTargets?: object | null,
 *   selectedTimeframe?: string,
 *   dailyHistory?: Array<{ date?: string, sleepHours?: number | null }>,
 * }} props
 */
export default function useMetabolicCoach({
  mapData,
  userTargets = null,
  selectedTimeframe = '7d',
  dailyHistory = [],
} = {}) {
  return useMemo(
    () =>
      buildMetabolicCoachInsight({
        mapData,
        userTargets,
        selectedTimeframe,
        dailyHistory,
      }),
    [mapData, userTargets, selectedTimeframe, dailyHistory],
  );
}
