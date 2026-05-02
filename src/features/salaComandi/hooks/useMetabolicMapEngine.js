import { useMemo } from 'react';
import { historyFingerprint } from '../../../metabolicDirectionEngine';
import { computeMetabolicMapCompassBundle } from '../engines/metabolicMapEngine';

/**
 * Motore mappa + bussola (medie periodo, baseline, traiettoria, testo proiezione peso).
 * Stessi ingressi/uscite che prima erano calcolati in MetabolicUnifiedView.
 */
export default function useMetabolicMapEngine({
  dailyHistory,
  bodyMetricsHistory,
  fullHistory,
  userTargets,
  projectionAnchorDate,
  selectedTimeframe,
}) {
  const compassHistoryKey = useMemo(
    () => historyFingerprint(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  return useMemo(
    () =>
      computeMetabolicMapCompassBundle({
        dailyHistory,
        bodyMetricsHistory,
        fullHistory,
        userTargets,
        projectionAnchorDate,
        selectedTimeframe,
      }),
    [
      compassHistoryKey,
      bodyMetricsHistory,
      fullHistory,
      userTargets,
      projectionAnchorDate,
      selectedTimeframe,
    ]
  );
}
