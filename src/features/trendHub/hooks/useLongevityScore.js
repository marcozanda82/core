import { useMemo } from 'react';
import { getTodayString } from '../../../coreEngine';
import { computeTotali } from '../../../useBiochimico';
import { computeSleepEngineSnapshot } from '../../../hooks/useSleepEngine';
import { useHealthContext } from './useHealthContext';
import { useHealthDailyReport } from './useHealthDailyReport';
import {
  calculateLongevityScore,
  computeAverageDailyFastingWindow,
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight,
  resolveProgressionNutritionTargets,
} from '../utils/saluteDashboardMetrics';
import {
  buildSaluteLongevityWindow,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
} from '../utils/saluteHistorySeries';

/**
 * SSOT punteggio Longevità (4×25 + Insight nutrizione AI).
 * Stessa formula di SaluteView — consumato da Home, header e Fotografia Salute.
 *
 * @param {{
 *   scoreDate?: string|null,
 *   fullHistory?: object|null,
 *   bodyMetricsHistory?: Array<Record<string, unknown>>,
 *   activeLog?: object[],
 *   sleepEngineLiveLog?: object[]|null,
 *   activeLogIsToday?: boolean,
 *   db?: import('firebase/database').Database|null,
 *   uid?: string|null,
 *   foodDatabase?: object|null,
 *   setFoodDb?: ((fn: (prev: object) => object) => void)|null,
 *   userTargets?: object|null,
 *   heightCm?: number|null,
 *   enabled?: boolean,
 * }} params
 */
export function useLongevityScore({
  scoreDate = null,
  fullHistory = null,
  bodyMetricsHistory = [],
  activeLog = [],
  sleepEngineLiveLog = null,
  activeLogIsToday = false,
  db = null,
  uid = null,
  foodDatabase = {},
  setFoodDb = null,
  userTargets = null,
  heightCm = null,
  enabled = true,
} = {}) {
  const resolvedScoreDate = String(scoreDate || getTodayString()).slice(0, 10);

  const healthContext = useHealthContext({
    fullHistory,
    foodDatabase,
    bodyMetricsHistory,
    todayDate: resolvedScoreDate,
  });

  const todayLiveLog = useMemo(() => {
    if (activeLogIsToday && Array.isArray(sleepEngineLiveLog)) {
      return sleepEngineLiveLog;
    }
    return selectTodayLog(fullHistory, resolvedScoreDate, activeLog, activeLogIsToday);
  }, [fullHistory, resolvedScoreDate, activeLog, activeLogIsToday, sleepEngineLiveLog]);

  const sleepEngineToday = useMemo(
    () => computeSleepEngineSnapshot(todayLiveLog),
    [todayLiveLog],
  );

  const morningSleep = useMemo(
    () => resolveMorningSleepForInsight(null, {
      todayDate: resolvedScoreDate,
      fullHistory,
      activeLog: activeLogIsToday && Array.isArray(sleepEngineLiveLog)
        ? sleepEngineLiveLog
        : activeLog,
      todayLog: todayLiveLog,
      activeLogIsToday,
    }),
    [resolvedScoreDate, fullHistory, activeLog, sleepEngineLiveLog, todayLiveLog, activeLogIsToday],
  );

  const healthReportEnabled = Boolean(enabled && db && uid);

  const health = useHealthDailyReport({
    db,
    uid,
    enabled: healthReportEnabled,
    todayDate: resolvedScoreDate,
    yesterdayLog: healthContext.yesterdayLog,
    analysisDate: healthContext.analysisDate,
    foodDatabase: healthContext.relevantFoodDatabase,
    setFoodDb,
    morningSleepLog: morningSleep,
  });

  const recentBodyMetrics = healthContext.recentBodyMetrics;

  const fastingTrend14d = useMemo(
    () => computeAverageDailyFastingWindow({
      fullHistory,
      todayDate: resolvedScoreDate,
      windowDays: LONGEVITY_WINDOW_DAYS,
    }),
    [fullHistory, resolvedScoreDate],
  );

  const longevityWindow = useMemo(
    () => buildSaluteLongevityWindow({
      fullHistory,
      bodyMetricsHistory: recentBodyMetrics,
      todayDate: resolvedScoreDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog,
    }),
    [fullHistory, recentBodyMetrics, resolvedScoreDate, todayLiveLog],
  );

  const tonightHours = useMemo(() => {
    if (sleepEngineToday.totalSleepHours > 0) {
      return Math.round(sleepEngineToday.totalSleepHours * 100) / 100;
    }
    if (morningSleep?.hours != null) return morningSleep.hours;
    return null;
  }, [morningSleep, sleepEngineToday]);

  const nutritionTargets = useMemo(
    () => resolveProgressionNutritionTargets(userTargets),
    [userTargets],
  );

  const todayProteinGrams = useMemo(() => {
    const totals = computeTotali(Array.isArray(todayLiveLog) ? todayLiveLog : []);
    const prot = Number(totals?.prot ?? totals?.pro);
    return Number.isFinite(prot) && prot > 0 ? Math.round(prot) : null;
  }, [todayLiveLog]);

  const longevityResult = useMemo(() => {
    const resolvedHeightCm = Number(heightCm) > 0 ? Number(heightCm) : REFERENCE_HEIGHT_CM;
    const yesterdayLog = healthContext.yesterdayLog;
    return calculateLongevityScore({
      cardioMinutesTotal: longevityWindow.cardioMinutesTotal,
      uniqueMuscleGroups: longevityWindow.uniqueMuscleGroups,
      muscleStimulusPillars: longevityWindow.muscleStimulusPillars,
      pesiSessionCount: longevityWindow.pesiSessionCount,
      sleepAvgHours: longevityWindow.sleepAvgHours ?? tonightHours,
      waistCm: longevityWindow.waistCm,
      daysSampled: longevityWindow.daysSampled,
      sleepNights: longevityWindow.sleepNights,
      cardioDays: longevityWindow.cardioDays,
      pesiDays: longevityWindow.pesiDays,
      heightCm: resolvedHeightCm,
      windowDays: LONGEVITY_WINDOW_DAYS,
      longevityNutrition: health.longevityNutrition,
      recentNutritionScores: health.recentNutritionScores,
      proteinGrams: todayProteinGrams,
      proteinTarget: nutritionTargets.prot,
      fastingHoursAvg: fastingTrend14d.averageHours,
      dayLog: yesterdayLog?.length ? yesterdayLog : todayLiveLog,
      foodDatabase: healthContext.relevantFoodDatabase,
    });
  }, [
    heightCm,
    longevityWindow,
    tonightHours,
    health.longevityNutrition,
    health.recentNutritionScores,
    todayProteinGrams,
    nutritionTargets.prot,
    fastingTrend14d.averageHours,
    healthContext.yesterdayLog,
    healthContext.relevantFoodDatabase,
    todayLiveLog,
  ]);

  return {
    scoreDate: resolvedScoreDate,
    longevityResult,
    longevityScore: longevityResult.finalScore,
    longevityBreakdown: longevityResult.breakdown,
    longevityNutrition: health.longevityNutrition,
    recentNutritionScores: health.recentNutritionScores,
    longevityWindow,
    healthReportStatus: health.status,
  };
}

export default useLongevityScore;
