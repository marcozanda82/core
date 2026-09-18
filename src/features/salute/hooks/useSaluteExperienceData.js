import { useMemo } from 'react';
import { useCentroAnalisiReadStore } from '../../centroAnalisi/useCentroAnalisiReadStore';
import { useHealthSystemState } from '../../healthEngine/hooks/useHealthSystemState';
import {
  buildGlycemicRiskBreakdown,
  computeAverageDailyFastingWindow,
  computeGlycemicRiskPercent,
} from '../../trendHub/utils/saluteDashboardMetrics';
import { buildSleepTrendChartData } from '../../trendHub/utils/saluteHistorySeries';
import { buildBiometricsHealthSnapshot } from '../../trendHub/utils/healthBiometrics';
import { useLongevityScore } from '../../trendHub/hooks/useLongevityScore';
import { useSleepLog } from '../../trendHub/hooks/useSleepLog';
import { buildSaluteViewModel } from '../utils/buildSaluteViewModel';
import { useSaluteHealthReportRead } from './useSaluteHealthReportRead';
import { useSaluteSleepReference } from './useSaluteSleepReference';

function profileHeightCm(profile) {
  const n = Number(profile?.height ?? profile?.altezza);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function profileAgeYears(profile) {
  const n = Number(profile?.age ?? profile?.eta ?? profile?.età);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Bootstrap `/salute`.
 * Se `host` è passato (tab Stato in SalaComandi), riusa i dati già in memoria
 * e non rifà get() di tracker_data / useLongevityScore.
 */
export function useSaluteExperienceData({
  host = null,
  loadReports = false,
  loadSleepLog = false,
  loadSheetMetrics = false,
} = {}) {
  const isolatedEnabled = !host;
  const isolated = useCentroAnalisiReadStore({ enabled: isolatedEnabled });
  const store = host || isolated;
  const heightCm = profileHeightCm(store.userProfile);
  const ageYears = profileAgeYears(store.userProfile);
  const foodDatabase = store.fullHistory?.trackerFoodDatabase && typeof store.fullHistory.trackerFoodDatabase === 'object'
    ? store.fullHistory.trackerFoodDatabase
    : {};

  const reuseLongevity = Boolean(host?.longevityResult || host?.longevityWindow);
  const longevity = useLongevityScore({
    scoreDate: store.todayDate,
    fullHistory: store.fullHistory,
    bodyMetricsHistory: store.bodyMetricsHistory,
    activeLog: store.activeLog,
    activeLogIsToday: true,
    db: store.db,
    uid: store.uid,
    foodDatabase,
    userTargets: store.userTargets,
    heightCm,
    enabled: isolatedEnabled && store.ready && Boolean(store.uid) && !reuseLongevity,
    isProfileHydrated: isolatedEnabled ? store.ready : Boolean(host?.ready),
  });

  const healthSystem = useHealthSystemState({
    dailyLog: store.activeLog,
    fullHistory: store.fullHistory,
    fourCylinder: store.fourCylinder,
    userTargets: store.userTargets,
    dateStr: store.todayDate,
    hoursSinceLastMeal: Number.isFinite(Number(store.fastingData?.hoursFasted))
      ? Number(store.fastingData.hoursFasted)
      : null,
    metabolicPhaseId: store.fastingData?.phaseName || null,
    enabled: isolatedEnabled && store.ready,
    isHydrated: isolatedEnabled && store.ready,
  });

  const reportRead = useSaluteHealthReportRead({
    db: store.db,
    uid: store.uid,
    enabled: loadReports && Boolean(store.uid) && Boolean(store.db),
  });

  const sleepLog = useSleepLog({
    db: store.db,
    uid: store.uid,
    date: store.todayDate,
    enabled: loadSleepLog && Boolean(store.uid) && Boolean(store.db),
  });

  const sleepReference = useSaluteSleepReference({
    db: store.db,
    uid: store.uid,
    age: ageYears,
    enabled: Boolean(store.uid) && Boolean(store.db),
  });

  const fastingTrend = useMemo(
    () => {
      if (!loadSheetMetrics) return null;
      return computeAverageDailyFastingWindow({
        fullHistory: store.fullHistory,
        todayDate: store.todayDate,
        windowDays: 14,
      });
    },
    [loadSheetMetrics, store.fullHistory, store.todayDate],
  );

  const longevityWindow = host?.longevityWindow ?? longevity.longevityWindow;

  const glycemic = useMemo(() => {
    if (!loadSheetMetrics) return null;
    const hoursFasted = Number.isFinite(Number(store.fastingData?.hoursFasted))
      ? Number(store.fastingData.hoursFasted)
      : null;
    const waistCm = Number.isFinite(Number(longevityWindow?.waistCm))
      ? Number(longevityWindow.waistCm)
      : null;
    const resolvedHeight = heightCm;
    const percent = computeGlycemicRiskPercent({
      hoursFasted,
      fourCylinder: store.fourCylinder,
      waistCm,
      heightCm: resolvedHeight,
    });
    const whtr = waistCm != null && resolvedHeight
      ? waistCm / resolvedHeight
      : null;
    const breakdown = buildGlycemicRiskBreakdown({
      sleepAvgHours: longevityWindow?.sleepAvgHours,
      cardioMinutesTotal: longevityWindow?.cardioMinutesTotal,
      hoursFasted,
      activeLog: store.activeLog,
      activeLogIsToday: true,
      todayDate: store.todayDate,
      fullHistory: store.fullHistory,
      whtr,
      windowDays: 14,
    });
    return { percent, breakdown, hoursFasted };
  }, [
    loadSheetMetrics,
    store.fastingData,
    store.fourCylinder,
    store.activeLog,
    store.todayDate,
    store.fullHistory,
    longevityWindow,
    heightCm,
  ]);

  const sleepTrend = useMemo(
    () => {
      if (!loadSheetMetrics && !loadReports) {
        return { avg14Days: null, sampleDays: 0, sleepData: [] };
      }
      return buildSleepTrendChartData({
        sleepSeries: longevityWindow?.sleepSeries,
        todayDate: store.todayDate,
        days: 14,
      });
    },
    [loadSheetMetrics, loadReports, longevityWindow?.sleepSeries, store.todayDate],
  );

  const biometrics = useMemo(
    () => {
      if (!loadReports) return null;
      return buildBiometricsHealthSnapshot(store.bodyMetricsHistory);
    },
    [loadReports, store.bodyMetricsHistory],
  );

  const todayActionText = isolatedEnabled
    ? (String(healthSystem.healthState?.primaryAction?.text || '').trim() || null)
    : null;

  const longevityResult = host?.longevityResult
    ?? (longevity.isEngineReady
      ? longevity.longevityResult
      : (longevity.bootstrapSnapshot?.longevityResult ?? null));
  const longevityNutrition = host?.longevityNutrition
    ?? (longevity.isEngineReady
      ? longevity.longevityNutrition
      : (longevity.bootstrapSnapshot?.longevityNutrition ?? longevity.longevityNutrition ?? null));

  const viewModel = useMemo(
    () => buildSaluteViewModel({
      longevityResult,
      longevityWindow,
      longevityNutrition,
      profileHeightCm: heightCm,
      todayActionText,
    }),
    [
      longevityResult,
      longevityWindow,
      longevityNutrition,
      heightCm,
      todayActionText,
    ],
  );

  const scoreReady = Boolean(host?.longevityResult)
    || longevity.isEngineReady
    || Number.isFinite(Number(longevity.bootstrapSnapshot?.longevityResult?.finalScore));

  const loading = host
    ? !host.ready
    : (!isolated.ready || (Boolean(isolated.uid) && !scoreReady));

  return {
    loading,
    ready: host ? Boolean(host.ready) : isolated.ready,
    uid: store.uid,
    todayDate: store.todayDate,
    viewModel,
    longevityResult,
    longevityWindow,
    longevityNutrition,
    recentNutritionScores: host?.recentNutritionScores ?? longevity.recentNutritionScores,
    healthReportStatus: host?.healthReportStatus ?? longevity.healthReportStatus,
    fullHistory: store.fullHistory,
    activeLog: store.activeLog,
    fourCylinder: store.fourCylinder,
    fastingData: store.fastingData,
    fastingTrend,
    glycemic,
    sleepTrend,
    sleepReference,
    biometrics,
    reportRead,
    sleepLog,
    isDev: Boolean(import.meta.env.DEV),
  };
}

export default useSaluteExperienceData;
