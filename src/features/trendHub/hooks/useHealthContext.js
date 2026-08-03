import { useMemo } from 'react';
import {
  EMPTY_BODY_METRICS,
  EMPTY_DAY_LOG,
  EMPTY_FOOD_SLICE,
  HEALTH_RECENT_METRICS_LIMIT,
  collectFoodDbKeysFromDayLog,
  resolveHealthAnalysisDate,
  selectDayLogFromStoricoNode,
  selectRecentBodyMetrics,
  selectRelevantFoodSlice,
  selectStoricoDayNode,
} from '../utils/healthContextSelectors';

/**
 * Contesto snello per l’emisfero Salute.
 * Estrae solo: data analisi (ieri), yesterdayLog, food slice rilevante, metriche recenti.
 * Dipende dal *nodo* storico di ieri (non dall’intero fullHistory) per limitare i re-memo.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   foodDatabase?: object | null,
 *   bodyMetricsHistory?: Array<Record<string, unknown>>,
 *   todayDate?: string,
 * }} args
 */
export function useHealthContext({
  fullHistory = null,
  foodDatabase = null,
  bodyMetricsHistory = [],
  todayDate = '',
} = {}) {
  const analysisDate = useMemo(
    () => resolveHealthAnalysisDate(todayDate),
    [todayDate],
  );

  // Identity del giorno precedente: se cambia solo "oggi" nel tree, ieri resta stabile.
  const yesterdayNode = analysisDate
    ? selectStoricoDayNode(fullHistory, analysisDate)
    : null;

  const yesterdayLog = useMemo(
    () => selectDayLogFromStoricoNode(yesterdayNode),
    [yesterdayNode],
  );

  const foodDbKeys = useMemo(
    () => collectFoodDbKeysFromDayLog(yesterdayLog),
    [yesterdayLog],
  );

  const foodKeysSignature = useMemo(
    () => (foodDbKeys.length === 0 ? '' : foodDbKeys.slice().sort().join('|')),
    [foodDbKeys],
  );

  const relevantFoodDatabase = useMemo(() => {
    if (!foodKeysSignature) return EMPTY_FOOD_SLICE;
    return selectRelevantFoodSlice(foodDatabase, foodKeysSignature.split('|'));
  }, [foodDatabase, foodKeysSignature]);

  const recentBodyMetrics = useMemo(
    () => selectRecentBodyMetrics(bodyMetricsHistory, {
      maxEntries: HEALTH_RECENT_METRICS_LIMIT,
    }),
    [bodyMetricsHistory],
  );

  return useMemo(
    () => ({
      todayDate: String(todayDate || '').slice(0, 10),
      analysisDate,
      yesterdayLog: yesterdayLog === EMPTY_DAY_LOG ? EMPTY_DAY_LOG : yesterdayLog,
      relevantFoodDatabase,
      recentBodyMetrics: recentBodyMetrics === EMPTY_BODY_METRICS
        ? EMPTY_BODY_METRICS
        : recentBodyMetrics,
      foodDbKeyCount: foodDbKeys.length,
      hasYesterdayFoods: yesterdayLog !== EMPTY_DAY_LOG && yesterdayLog.length > 0,
    }),
    [
      todayDate,
      analysisDate,
      yesterdayLog,
      relevantFoodDatabase,
      recentBodyMetrics,
      foodDbKeys.length,
    ],
  );
}

export default useHealthContext;
