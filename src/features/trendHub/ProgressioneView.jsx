import React, { useMemo, useState } from 'react';
import { computeTotali } from '../../useBiochimico';
import ProgressioneHero from './components/ProgressioneHero';
import ProgressioneMacroPillarGrid from './components/ProgressioneMacroPillarGrid';
import MuscleTelemetryPreview from './components/MuscleTelemetryPreview';
import ProgressionePagellaCard from './components/ProgressionePagellaCard';
import { calculateProgressionScore } from './utils/saluteDashboardMetrics';
import {
  buildMacroPillarInsights,
  buildProgressionPagellaInsight,
  resolveProgressionDayEvaluationContext,
} from './utils/progressionInsightGenerator';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
} from './utils/saluteHistorySeries';
import { getTodayString } from '../../coreEngine';

/**
 * Emisfero Progressione — gerarchia a cascata (stile SaluteView):
 * L1 Hero · L2 Pagella · L3 pilastri macro · anteprima telemetria.
 */
export default function ProgressioneView({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  userTargets = null,
  settingsBaseKcal = null,
  sleepEngineLiveLog = null,
  todayDate = '',
  onOpenMuscleTelemetry = null,
} = {}) {
  const [activePillar, setActivePillar] = useState(null);

  const todayIso = String(todayDate || getTodayString()).slice(0, 10);
  const analyzedDateIso = String(activeDate || todayIso).slice(0, 10);
  const isAnalyzingToday = analyzedDateIso === todayIso;

  const analyzedLiveLog = useMemo(() => {
    if (isAnalyzingToday && Array.isArray(sleepEngineLiveLog) && sleepEngineLiveLog.length > 0) {
      return sleepEngineLiveLog;
    }
    return selectTodayLog(
      fullHistory,
      analyzedDateIso,
      Array.isArray(activeLog) ? activeLog : [],
      isAnalyzingToday,
    );
  }, [
    isAnalyzingToday,
    sleepEngineLiveLog,
    fullHistory,
    analyzedDateIso,
    activeLog,
  ]);

  const progressionLogs = useMemo(
    () => buildProgressionLogsWindow({
      fullHistory,
      todayDate: todayIso,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: isAnalyzingToday ? analyzedLiveLog : null,
    }),
    [fullHistory, todayIso, isAnalyzingToday, analyzedLiveLog],
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
      {
        fourCylinder,
        fullHistory,
        activeLog: analyzedLiveLog,
        activeDate: analyzedDateIso,
      },
    ),
    [progressionLogs, userTargets, fourCylinder, fullHistory, analyzedLiveLog, analyzedDateIso],
  );

  const analyzedTotals = useMemo(
    () => computeTotali(Array.isArray(analyzedLiveLog) ? analyzedLiveLog : []),
    [analyzedLiveLog],
  );

  const dayEvaluationContext = useMemo(
    () => resolveProgressionDayEvaluationContext({
      analyzedDateIso,
      todayIso,
      totals: analyzedTotals,
      targets: userTargets,
      dayLog: analyzedLiveLog,
    }),
    [analyzedDateIso, todayIso, analyzedTotals, userTargets, analyzedLiveLog],
  );

  const macroPillars = useMemo(
    () => buildMacroPillarInsights(
      analyzedTotals,
      userTargets,
      settingsBaseKcal,
      dayEvaluationContext,
    ),
    [analyzedTotals, userTargets, settingsBaseKcal, dayEvaluationContext],
  );

  const pagellaInsight = useMemo(
    () => buildProgressionPagellaInsight(
      progressionResult.finalScore,
      progressionResult.breakdown,
      macroPillars,
      dayEvaluationContext,
    ),
    [progressionResult, macroPillars, dayEvaluationContext],
  );

  const breakdown = progressionResult.breakdown || {};

  return (
    <div
      className="snapshot-progressione-root trend-progressione-view flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-28 pt-0.5 [-webkit-overflow-scrolling:touch]"
      role="region"
      aria-label="Area Progressione"
    >
      <div className="shrink-0">
        <ProgressioneHero
          score={progressionResult.finalScore}
          microLabel={pagellaInsight.microLabel}
          size={148}
        />
      </div>

      <ProgressionePagellaCard
        score={progressionResult.finalScore}
        breakdown={breakdown}
        macroPillars={macroPillars}
        dayEvaluationContext={dayEvaluationContext}
      />

      <ProgressioneMacroPillarGrid
        pillars={macroPillars}
        activeId={activePillar}
        onSelect={setActivePillar}
      />

      <MuscleTelemetryPreview
        fourCylinder={fourCylinder}
        fullHistory={fullHistory}
        activeLog={activeLog}
        activeDate={activeDate || analyzedDateIso}
        onOpenFullTelemetry={onOpenMuscleTelemetry}
      />
    </div>
  );
}
