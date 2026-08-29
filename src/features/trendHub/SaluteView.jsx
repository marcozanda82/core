import React, { useMemo, useState } from 'react';
import BiometricsHealthCard from './components/BiometricsHealthCard';
import CardioAnalysisCard from './components/CardioAnalysisCard';
import MetabolicReportCard from './components/MetabolicReportCard';
import MuscleTelemetryHub from './components/MuscleTelemetryHub';
import SaluteClinicalInsight from './components/SaluteClinicalInsight';
import SaluteDashKpiCard from './components/SaluteDashKpiCard';
import SaluteFastingTrendCard from './components/SaluteFastingTrendCard';
import SaluteGlycemicRiskBar from './components/SaluteGlycemicRiskBar';
import SaluteLongevityHero from './components/SaluteLongevityHero';
import SalutePillarNavGrid from './components/SalutePillarNavGrid';
import SaluteSleepGhostCard from './components/SaluteSleepGhostCard';
import SleepTrackerWidget from './components/SleepTrackerWidget';
import { useHealthDailyReport } from './hooks/useHealthDailyReport';
import { useSleepLog } from './hooks/useSleepLog';
import { computeSleepEngineSnapshot } from '../../hooks/useSleepEngine';
import { buildBiometricsHealthSnapshot } from './utils/healthBiometrics';
import { computeTotali } from '../../useBiochimico';
import {
  averageMuscleResidual,
  calculateLongevityScore,
  calculateProgressionScore,
  buildGlycemicRiskBreakdown,
  computeAverageDailyFastingWindow,
  computeGlycemicRiskPercent,
  formatCompensationDelta,
  formatFastingHoursLabel,
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight,
  resolveProgressionNutritionTargets,
} from './utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  buildSaluteLongevityWindow,
  buildSleepTrendChartData,
  buildUnifiedSleepSeries,
  computeGhostBaselineFromSeries,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
  SLEEP_GHOST_LOOKBACK_DAYS,
} from './utils/saluteHistorySeries';
import { pillarPctFromLongevityScore } from './utils/longevityInsightGenerator';
import { buildProgressionTrendSnapshots } from './utils/progressionInsightGenerator';

function formatMetric(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

/**
 * Emisfero Salute — gerarchia a cascata:
 * L1 anello Longevità · L2 Pagella · L3 griglia 4 pilastri · L4 parametri strutturali.
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
  /** SSOT da useLongevityScore — se presente, salta il ricalcolo locale. */
  longevityResult: longevityResultProp = null,
  activeLog = [],
  activeLogIsToday = false,
  sleepEngineLiveLog = null,
  fullHistory = null,
  heightCm = REFERENCE_HEIGHT_CM,
  userTargets = null,
  todayBurnKcal = 0,
  initialOpenMuscleTelemetry = false,
} = {}) {
  const [activePillar, setActivePillar] = useState(null);
  const [showMuscleTelemetryHub, setShowMuscleTelemetryHub] = useState(
    () => Boolean(initialOpenMuscleTelemetry),
  );

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

  const fastingTrend14d = useMemo(
    () => computeAverageDailyFastingWindow({
      fullHistory,
      todayDate,
      windowDays: LONGEVITY_WINDOW_DAYS,
    }),
    [fullHistory, todayDate],
  );

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
    () => computeGhostBaselineFromSeries(sleepSeries, todayDate, undefined, {
      maxSampleDays: SLEEP_GHOST_LOOKBACK_DAYS,
    }),
    [sleepSeries, todayDate],
  );

  const sleepTrend14d = useMemo(
    () => buildSleepTrendChartData({
      sleepSeries,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
    }),
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

  const nutritionTargets = useMemo(
    () => resolveProgressionNutritionTargets(userTargets),
    [userTargets],
  );

  const todayProteinGrams = useMemo(() => {
    const totals = computeTotali(Array.isArray(todayLiveLog) ? todayLiveLog : []);
    const prot = Number(totals?.prot ?? totals?.pro);
    return Number.isFinite(prot) && prot > 0 ? Math.round(prot) : null;
  }, [todayLiveLog]);

  const longevityResultComputed = useMemo(() => {
    const resolvedHeightCm = Number(heightCm) > 0 ? Number(heightCm) : REFERENCE_HEIGHT_CM;
    const computed = calculateLongevityScore({
      cardioMinutesTotal: longevityWindow.cardioMinutesTotal,
      uniqueMuscleGroups: longevityWindow.uniqueMuscleGroups,
      muscleStimulusPillars: longevityWindow.muscleStimulusPillars,
      pesiSessionCount: longevityWindow.pesiSessionCount,
      sleepAvgHours: longevityWindow.sleepAvgHours ?? tonightHours,
      waistCm: longevityWindow.waistCm ?? biometrics.waistCm,
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
      foodDatabase: relevantFoodDatabase,
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
    health.longevityNutrition,
    health.recentNutritionScores,
    todayProteinGrams,
    nutritionTargets.prot,
    fastingTrend14d.averageHours,
    yesterdayLog,
    todayLiveLog,
    relevantFoodDatabase,
  ]);

  const longevityResult = longevityResultProp || longevityResultComputed;

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
  const fastingLabel = formatFastingHoursLabel(fastingTrend14d.averageHours);

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

  const pillarNavScores = useMemo(() => ({
    cardio: pillarPctFromLongevityScore(longevityBreakdown?.cardioScore),
    strength: pillarPctFromLongevityScore(longevityBreakdown?.weightsScore),
    sleep: pillarPctFromLongevityScore(longevityBreakdown?.sleepScore),
    nutrition: pillarPctFromLongevityScore(longevityBreakdown?.nutritionScore),
  }), [longevityBreakdown]);

  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(longevityBreakdown?.uniqueGroups) || 0)));
  const cardioMins = Math.round(Number(longevityBreakdown?.cardioMins) || 0);
  const whtrValue = Number.isFinite(Number(glycemic.whtr))
    ? Number(glycemic.whtr).toFixed(2)
    : '—';

  const progressionLogs = useMemo(
    () => buildProgressionLogsWindow({
      fullHistory,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLogIsToday ? todayLiveLog : null,
    }),
    [fullHistory, todayDate, activeLogIsToday, todayLiveLog],
  );

  const progressionResult = useMemo(
    () => calculateProgressionScore(
      {
        days: progressionLogs.days,
        todayDate: progressionLogs.todayDate,
        sleepAvgHours: progressionLogs.sleepAvgHours,
        workoutSessionsTotal: progressionLogs.workoutSessionsTotal,
      },
      userTargets || {},
    ),
    [progressionLogs, userTargets],
  );

  const trendSnapshots = useMemo(
    () => buildProgressionTrendSnapshots(progressionLogs.days, userTargets),
    [progressionLogs.days, userTargets],
  );

  if (showMuscleTelemetryHub) {
    return (
      <div
        className="snapshot-salute-root trend-salute-view flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-28 pt-0.5 [-webkit-overflow-scrolling:touch]"
        role="region"
        aria-label="Telemetria muscolare"
      >
        <MuscleTelemetryHub
          fourCylinder={fourCylinder}
          fullHistory={fullHistory}
          activeLog={activeLog}
          activeDate={todayDate}
          adherence7d={trendSnapshots.adherence7d}
          adherence14d={trendSnapshots.adherence14d}
          daysLogged={trendSnapshots.daysLogged}
          trainingPct={progressionResult.breakdown?.trainingPct}
          sleepPct={progressionResult.breakdown?.sleepPct}
          onBack={() => setShowMuscleTelemetryHub(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="snapshot-salute-root trend-salute-view flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-28 pt-0.5 [-webkit-overflow-scrolling:touch]"
      role="region"
      aria-label="Area Salute"
    >
      {/* L1 — Hero Longevità (compatto: focus sulla Pagella sotto) */}
      <div className="shrink-0">
        <SaluteLongevityHero score={longevityScore} size={148} />
      </div>

      {/* L2 — Pagella Metabolica (sempre espansa) */}
      <MetabolicReportCard score={longevityScore} breakdown={longevityBreakdown} />

      <CardioAnalysisCard
        fullHistory={fullHistory}
        activeLog={todayLiveLog}
        activeDate={todayDate}
        todayBurnKcal={todayBurnKcal}
      />

      <button
        type="button"
        onClick={() => setShowMuscleTelemetryHub(true)}
        className="flex w-full flex-col items-start gap-1 rounded-2xl border border-violet-500/35 bg-gradient-to-r from-violet-950/50 to-slate-950/90 px-3 py-3 text-left transition hover:border-violet-400/55 hover:shadow-[0_0_18px_rgba(167,139,250,0.18)]"
        aria-label="Apri telemetria muscolare e volume"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/90">
          Telemetria Muscolare &amp; Volume
        </span>
        <span className="text-[12px] leading-snug text-slate-300">
          Stato recupero distretti, fatica sistemica e curve a 14g/30g
        </span>
      </button>

      {/* L3 — Griglia 4 pilastri + pannello dettaglio */}
      <div className="shrink-0">
        <SalutePillarNavGrid
          activeId={activePillar}
          onSelect={setActivePillar}
          scores={pillarNavScores}
        />
      </div>

      {activePillar === 'cardio' ? (
        <section
          className="flex flex-col gap-2 rounded-2xl border border-rose-500/25 bg-rose-950/20 p-2.5"
          aria-label="Dettaglio Cardio e Mitocondri"
        >
          <p className="m-0 px-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-300/90">
            Cardio · {cardioMins} min / 14gg
          </p>
          <SaluteGlycemicRiskBar
            riskPercent={glycemic.riskPercent}
            hoursFastedLabel={fastingLabel}
            muscleLabel={muscleLabel}
            whtr={glycemic.whtr}
            breakdown={glycemicBreakdown}
          />
          <div className="grid grid-cols-2 gap-2">
            <SaluteFastingTrendCard
              value={fastingTrend14d.averageHours != null
                ? formatMetric(fastingTrend14d.averageHours, 1)
                : '—'}
              unit="h"
              trend={fastingTrend14d.trend}
              fastingHistory={fastingTrend14d.fastingHistory}
            />
            <SaluteDashKpiCard
              icon="⌬"
              title="Compensazione"
              value={compensationLabel === '—' ? '—' : compensationLabel.replace(' kcal', '')}
              unit={compensationLabel.includes('kcal') ? 'kcal' : ''}
              trend={compensationTrend}
              invertTrendColors
            />
          </div>
        </section>
      ) : null}

      {activePillar === 'strength' ? (
        <section
          className="flex flex-col gap-2 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-2.5"
          aria-label="Dettaglio Forza e Massa Magra"
        >
          <p className="m-0 px-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300/90">
            Forza · {uniqueGroups}/5 pilastri
          </p>
          <div className="grid grid-cols-2 gap-2">
            <SaluteDashKpiCard
              icon="🏋️"
              title="Pilastri stimolati"
              value={String(uniqueGroups)}
              unit="/5"
              trend={uniqueGroups >= 4 ? 'up' : uniqueGroups <= 1 ? 'down' : 'flat'}
              invertTrendColors
            />
            <SaluteDashKpiCard
              icon="◎"
              title="Residuo muscolare"
              value={muscleAvg == null ? '—' : String(Math.round(muscleAvg * 100))}
              unit="%"
              trend={muscleAvg == null ? 'none' : muscleAvg >= 0.55 ? 'up' : 'down'}
              invertTrendColors
            />
            <SaluteDashKpiCard
              icon="⚡"
              title="Sessioni pesi"
              value={String(Math.round(Number(longevityWindow.pesiSessionCount) || 0))}
              unit="14gg"
              trend="none"
            />
            <SaluteDashKpiCard
              icon="📅"
              title="Giorni pesi"
              value={String(Math.round(Number(longevityWindow.pesiDays) || 0))}
              unit="gg"
              trend="none"
            />
          </div>
        </section>
      ) : null}

      {activePillar === 'nutrition' ? (
        <section
          className="rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-1"
          aria-label="Insight Clinico Nutrizione"
        >
          <SaluteClinicalInsight
            report={health.report}
            analysisDate={health.analysisDate || analysisDate}
            todayDate={todayDate}
            status={health.status}
            errorMessage={health.errorMessage}
            isRefreshing={health.isRefreshing}
            isUpdatedToday={health.isUpdatedToday}
            onRefresh={health.refresh}
            defaultExpanded
          />
        </section>
      ) : null}

      {activePillar === 'sleep' ? (
        <section
          className="flex flex-col gap-2 rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-2.5"
          aria-label="Dettaglio Sonno e Recupero"
        >
          <SaluteSleepGhostCard
            hours={tonightHours}
            quality={morningSleep?.quality ?? null}
            ghostHours={ghostBaseline.ghostHours}
            ghostLabel={ghostLabel}
            sleepData={sleepTrend14d.sleepData}
            avg14Days={sleepTrend14d.avg14Days}
          />
          <details className="rounded-xl border border-white/10 bg-slate-950/50">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 [&::-webkit-details-marker]:hidden">
              <span>Registra sonno (opzionale)</span>
              <span className="text-cyan-400" aria-hidden>+</span>
            </summary>
            <div className="border-t border-white/5 px-2 pb-2.5 pt-2">
              <p className="m-0 mb-2 px-1 text-[11px] leading-snug text-slate-500">
                Preferisci il diario Timeline / wearable: stesso dato dell&apos;Arco Energetico.
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
        </section>
      ) : null}

      {/* L4 — Parametri strutturali & tool */}
      <section
        className="mt-0.5 shrink-0 rounded-2xl border border-white/10 bg-slate-950/45 px-2 py-2.5"
        aria-label="Parametri strutturali e tool"
      >
        <p className="m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Parametri strutturali &amp; tool
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <SaluteDashKpiCard
            compact
            icon="⚖"
            title="Peso"
            value={formatMetric(biometrics.weightKg)}
            unit="kg"
            trend={biometrics.weightDelta?.direction || 'none'}
          />
          <SaluteDashKpiCard
            compact
            icon="◎"
            title="Girovita"
            value={formatMetric(biometrics.waistCm)}
            unit="cm"
            trend={biometrics.waistDelta?.direction || 'none'}
          />
          <SaluteDashKpiCard
            compact
            icon="⌀"
            title="WHtR"
            value={whtrValue}
            unit=""
            trend="none"
          />
        </div>
        <details className="mt-2 rounded-xl border border-white/10 bg-slate-950/50">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 [&::-webkit-details-marker]:hidden">
            <span>Aggiorna misurazioni</span>
            <span className="text-cyan-400" aria-hidden>+</span>
          </summary>
          <div className="border-t border-white/5 px-2 pb-2.5 pt-2">
            <BiometricsHealthCard
              recentBodyMetrics={recentBodyMetrics}
              onSaveBiometrics={onSaveBiometrics}
              todayDate={todayDate}
            />
          </div>
        </details>
      </section>
    </div>
  );
}
