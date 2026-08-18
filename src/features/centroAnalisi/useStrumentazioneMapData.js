import { useMemo, useState } from 'react';
import { buildMetabolicCompassDailyHistory } from '../../metabolicCompassDailyHistory';
import useMetabolicMapEngine from '../salaComandi/hooks/useMetabolicMapEngine';

/**
 * Motore condiviso Strumentazione — stessi ingressi di Sala Comandi (read-only).
 */
export function useStrumentazioneMapData(store) {
  const {
    fullHistory,
    activeLog,
    userTargets,
    bodyMetricsHistory,
    fourCylinder,
    todayDate,
  } = store || {};

  const [selectedTimeframe, setSelectedTimeframe] = useState('1d');

  const dailyHistory = useMemo(
    () => buildMetabolicCompassDailyHistory(
      fullHistory,
      todayDate,
      userTargets,
    ),
    [fullHistory, todayDate, userTargets],
  );

  const mapData = useMetabolicMapEngine({
    dailyHistory,
    bodyMetricsHistory,
    fullHistory,
    userTargets,
    projectionAnchorDate: todayDate,
    selectedTimeframe,
    currentLog: activeLog,
    fourCylinder,
  });

  return {
    dailyHistory,
    mapData,
    selectedTimeframe,
    setSelectedTimeframe,
  };
}
