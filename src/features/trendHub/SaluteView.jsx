import React, { useMemo } from 'react';
import BiometricsHealthCard from './components/BiometricsHealthCard';
import SaluteClinicalInsight from './components/SaluteClinicalInsight';
import SaluteDashKpiCard from './components/SaluteDashKpiCard';
import SaluteGlycemicRiskBar from './components/SaluteGlycemicRiskBar';
import SaluteLongevityHero from './components/SaluteLongevityHero';
import SaluteSleepGhostCard from './components/SaluteSleepGhostCard';
import SleepTrackerWidget from './components/SleepTrackerWidget';
import { useHealthDailyReport } from './hooks/useHealthDailyReport';
import { useSleepLog } from './hooks/useSleepLog';
import { computeSleepEngineSnapshot } from '../../hooks/useSleepEngine';
import { buildBiometricsHealthSnapshot } from './utils/healthBiometrics';
import {
  averageMuscleResidual,
  calculateLongevityScore,
  buildGlycemicRiskBreakdown,
  computeGlycemicRiskPercent,
  formatCompensationDelta,
  formatFastingHoursLabel,
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight,
} from './utils/saluteDashboardMetrics';
import {
  buildSaluteLongevityWindow,
  buildUnifiedSleepSeries,
  computeGhostBaselineFromSeries,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
  SLEEP_GHOST_LOOKBACK_DAYS,
} from './utils/saluteHistorySeries';

function formatMetric(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

/**
 * Emisfero Salute — sonno SSOT = stesso diario dell'Arco Energetico
 * (`activeLog` / trackerStorico log, `computeSleepEngineSnapshot`).
 */
export default function SaluteView({
  recentBodyMetrics = [],
  yesterdayLog = [],
  analysisDate = '',
  relevantFoodDatabase = {},
  onSaveBiometrics = null,
  todayDate = '',
  db = null,
  uid = null,
  setFoodDb = null,
  enabled = true,
  fastingData = null,
  fourCylinder = null,
  metabolicCompensationDeltaKcal = null,
  longevityScoreOverride = null,
  activeLog = [],
  /** true quando activeLog è il log del giorno calendario di oggi (come Energy Arc) */
  activeLogIsToday = false,
  /** Log sonno live (activeLog + nap) — preferito per Ghost/Insight se oggi */
  sleepEngineLiveLog = null,
  fullHistory = null,
  heightCm = REFERENCE_HEIGHT_CM,
} = {}) {
  // Widget opzionale (scrive sleep_logs) — NON alimenta Ghost/Insight/Hero.
  const sleepWidget = useSleepLog({
    db,
    uid,
    date: todayDate,
    enabled,
  });

  const todayLiveLog = useMemo(() => {
    if (activeLogIsToday && Array.isArray(sleepEngineLiveLog)) {
      return sleepEngineLiveLog;
    }
    return selectTodayLog(fullHistory, todayDate, activeLog, activeLogIsToday);
  }, [fullHistory, todayDate, activeLog, activeLogIsToday, sleepEngineLiveLog]);

  // Speculare Energy Arc: stesso snapshot sul log diario di oggi
  const sleepEngineToday = useMemo(
    () => computeSleepEngineSnapshot(todayLiveLog),
    [todayLiveLog],
  );

  const morningSleep = useMemo(
    () => resolveMorningSleepForInsight(null, {
      todayDate,
      fullHistory,
      activeLog: activeLogIsToday && Array.isArray(sleepEngineLiveLog)
        ? sleepEngineLiveLog
        : activeLog,
      todayLog: todayLiveLog,
      activeLogIsToday,
    }),
    [todayDate, fullHistory, activeLog, sleepEngineLiveLog, todayLiveLog, activeLogIsToday],
  );

  const health = useHealthDailyReport({
    db,
    uid,
    enabled,
    todayDate,
    yesterdayLog,
    analysisDate,
    foodDatabase: relevantFoodDatabase,
    setFoodDb,
    morningSleepLog: morningSleep,
  });

  const biometrics = useMemo(
    () => buildBiometricsHealthSnapshot(recentBodyMetrics),
    [recentBodyMetrics],
  );

  const hoursFasted = Number.isFinite(Number(fastingData?.hoursFasted))
    ? Number(fastingData.hoursFasted)
    : null;

  const sleepSeries = useMemo(
    () => buildUnifiedSleepSeries({
      fullHistory,
      todayDate,
      lookbackDays: Math.max(SLEEP_GHOST_LOOKBACK_DAYS, LONGEVITY_WINDOW_DAYS),
      todayLiveLog,
    }),
    [fullHistory, todayDate, todayLiveLog],
  );

  const ghostBaseline = useMemo(
    () => computeGhostBaselineFromSeries(sleepSeries, todayDate),
    [sleepSeries, todayDate],
  );

  const longevityWindow = useMemo(
    () => buildSaluteLongevityWindow({
      fullHistory,
      bodyMetricsHistory: recentBodyMetrics,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog,
    }),
    [fullHistory, recentBodyMetrics, todayDate, todayLiveLog],
  );

  const tonightHours = useMemo(() => {
    if (sleepEngineToday.totalSleepHours > 0) {
      return Math.round(sleepEngineToday.totalSleepHours * 100) / 100;
    }
    if (morningSleep?.hours != null) return morningSleep.hours;
    return null;
  }, [morningSleep, sleepEngineToday]);

  const longevityResult = useMemo(() => {
    // Altezza profilo (TrendHub ← userProfile.height); fallback 174 solo se assente
    const resolvedHeightCm = Number(heightCm) > 0 ? Number(heightCm) : REFERENCE_HEIGHT_CM;
    const computed = calculateLongevityScore({
      cardioMinutesTotal: longevityWindow.cardioMinutesTotal,
      uniqueMuscleGroups: longevityWindow.uniqueMuscleGroups,
      pesiSessionCount: longevityWindow.pesiSessionCount,
      sleepAvgHours: longevityWindow.sleepAvgHours ?? tonightHours,
      waistCm: longevityWindow.waistCm ?? biometrics.waistCm,
      daysSampled: longevityWindow.daysSampled,
      sleepNights: longevityWindow.sleepNights,
      cardioDays: longevityWindow.cardioDays,
      pesiDays: longevityWindow.pesiDays,
      heightCm: resolvedHeightCm,
      windowDays: LONGEVITY_WINDOW_DAYS,
    });
    if (longevityScoreOverride != null && Number.isFinite(Number(longevityScoreOverride))) {
      return {
        ...computed,
        finalScore: Math.max(0, Math.min(100, Math.round(Number(longevityScoreOverride)))),
      };
    }
    return computed;
  }, [
    longevityScoreOverride,
    longevityWindow,
    tonightHours,
    biometrics.waistCm,
    heightCm,
  ]);

  const longevityScore = longevityResult.finalScore;
  const longevityBreakdown = longevityResult.breakdown;

  const glycemic = useMemo(
    () => computeGlycemicRiskPercent({
      hoursFasted,
      fourCylinder,
      waistCm: biometrics.waistCm ?? longevityWindow.waistCm,
      heightCm: heightCm || REFERENCE_HEIGHT_CM,
    }),
    [hoursFasted, fourCylinder, biometrics.waistCm, longevityWindow.waistCm, heightCm],
  );

  const glycemicBreakdown = useMemo(
    () => buildGlycemicRiskBreakdown({
      sleepAvgHours: longevityWindow.sleepAvgHours,
      cardioMinutesTotal: longevityWindow.cardioMinutesTotal,
      hoursFasted,
      activeLog,
      activeLogIsToday,
      todayDate,
      fullHistory,
      whtr: glycemic.whtr,
    }),
    [
      longevityWindow.sleepAvgHours,
      longevityWindow.cardioMinutesTotal,
      hoursFasted,
      activeLog,
      activeLogIsToday,
      todayDate,
      fullHistory,
      glycemic.whtr,
    ],
  );

  const muscleAvg = averageMuscleResidual(fourCylinder);
  const muscleLabel = muscleAvg == null ? 'n/d' : `${Math.round(muscleAvg * 100)}%`;
  const fastingLabel = fastingData?.timeString
    || formatFastingHoursLabel(hoursFasted);

  const compensationLabel = formatCompensationDelta(metabolicCompensationDeltaKcal);
  const compensationTrend =
    Number(metabolicCompensationDeltaKcal) > 0
      ? 'up'
      : Number(metabolicCompensationDeltaKcal) < 0
        ? 'down'
        : Number.isFinite(Number(metabolicCompensationDeltaKcal))
          ? 'flat'
          : 'none';

  const ghostLabel = ghostBaseline.sampleSize > 0 ? 'Media 7g' : 'Target';

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-1 [-webkit-overflow-scrolling:touch]"
      role="region"
      aria-label="Area Salute"
    >
      <SaluteLongevityHero score={longevityScore} breakdown={longevityBreakdown} />

      <SaluteGlycemicRiskBar
        riskPercent={glycemic.riskPercent}
        hoursFastedLabel={fastingLabel}
        muscleLabel={muscleLabel}
        whtr={glycemic.whtr}
        breakdown={glycemicBreakdown}
      />

      <div className="grid w-full min-w-0 grid-cols-2 gap-2.5">
        <SaluteDashKpiCard
          icon="⚖"
          title="Peso attuale"
          value={formatMetric(biometrics.weightKg)}
          unit="kg"
          trend={biometrics.weightDelta?.direction || 'none'}
        />
        <SaluteDashKpiCard
          icon="◎"
          title="Girovita"
          value={formatMetric(biometrics.waistCm)}
          unit="cm"
          trend={biometrics.waistDelta?.direction || 'none'}
        />
        <SaluteDashKpiCard
          icon="⏳"
          title="Finestra alimentare"
          value={hoursFasted != null ? formatMetric(hoursFasted, 1) : '—'}
          unit="h dig."
          trend={hoursFasted != null && hoursFasted >= 12 ? 'up' : hoursFasted != null ? 'flat' : 'none'}
          invertTrendColors
        />
        <SaluteDashKpiCard
          icon="⌬"
          title="Compensazione"
          value={compensationLabel === '—' ? '—' : compensationLabel.replace(' kcal', '')}
          unit={compensationLabel.includes('kcal') ? 'kcal' : ''}
          trend={compensationTrend}
          invertTrendColors
        />

        <SaluteSleepGhostCard
          hours={tonightHours}
          quality={morningSleep?.quality ?? null}
          ghostHours={ghostBaseline.ghostHours}
          ghostLabel={ghostLabel}
        />
      </div>

      <details className="w-full min-w-0 rounded-2xl border border-white/10 bg-slate-950/40">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 [&::-webkit-details-marker]:hidden">
          <span>Aggiorna metriche e sonno</span>
          <span className="text-cyan-400" aria-hidden>+</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-white/5 px-2.5 pb-3 pt-2">
          <BiometricsHealthCard
            recentBodyMetrics={recentBodyMetrics}
            onSaveBiometrics={onSaveBiometrics}
            todayDate={todayDate}
          />
          <p className="m-0 px-1 text-[11px] leading-snug text-slate-500">
            Il grafico Sonno e l&apos;Insight usano il diario della Timeline (stesso dato dell&apos;Arco Energetico).
            Registra il sonno dal diario / wearable, non solo da questo pannello.
          </p>
          <SleepTrackerWidget
            entry={sleepWidget.entry}
            hydrated={sleepWidget.hydrated}
            saving={sleepWidget.saving}
            errorMessage={sleepWidget.errorMessage}
            onSave={sleepWidget.save}
            onSaved={() => {
              void health.refresh();
            }}
          />
        </div>
      </details>

      <SaluteClinicalInsight
        report={health.report}
        analysisDate={health.analysisDate || analysisDate}
        status={health.status}
        errorMessage={health.errorMessage}
        isRefreshing={health.isRefreshing}
        onRefresh={health.refresh}
      />
    </div>
  );
}
