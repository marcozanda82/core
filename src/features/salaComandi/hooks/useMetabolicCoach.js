import { useMemo } from 'react';
import { buildMetabolicCoachInsight } from '../engines/metabolicCoachEngine';

/**
 * @param {{
 *   mapData: object | null | undefined,
 *   userTargets?: object | null,
 *   selectedTimeframe?: string,
 * }} props
 */
export default function useMetabolicCoach({ mapData, userTargets = null, selectedTimeframe = '7d' }) {
  return useMemo(
    () =>
      buildMetabolicCoachInsight({
        mapData,
        userTargets,
        selectedTimeframe,
      }),
    [mapData, userTargets, selectedTimeframe],
  );
}
