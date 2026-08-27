import React, { useMemo, useState } from 'react';
import { computeTotali } from '../../useBiochimico';
import ProgressioneHero from './components/ProgressioneHero';
import ProgressioneMacroPillarGrid from './components/ProgressioneMacroPillarGrid';
import ProgressioneMuscleTelemetry from './components/ProgressioneMuscleTelemetry';
import ProgressionePagellaCard from './components/ProgressionePagellaCard';
import ProgressioneTrendFooter from './components/ProgressioneTrendFooter';
import { calculateProgressionScore } from './utils/saluteDashboardMetrics';
import {
  buildMacroPillarInsights,
  buildProgressionPagellaInsight,
  buildProgressionTrendSnapshots,
} from './utils/progressionInsightGenerator';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
} from './utils/saluteHistorySeries';
import { getTodayString } from '../../coreEngine';

/**
 * Emisfero Progressione — gerarchia a cascata (stile SaluteView):
 * L1 Hero · L2 Pagella · L3 pilastri macro · telemetria muscolare · L4 trend.
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
} = {}) {
  const [activePillar, setActivePillar] = useState(null);

  const progressionTodayIso = String(todayDate || activeDate || getTodayString()).slice(0, 10);
  const progressionActiveLogIsToday = Boolean(progressionTodayIso)
    && progressionTodayIso === String(activeDate || '').slice(0, 10);

  const progressionTodayLiveLog = useMemo(() => {
    if (progressionActiveLogIsToday && Array.isArray(sleepEngineLiveLog) && sleepEngineLiveLog.length > 0) {
      return sleepEngineLiveLog;
    }
    return selectTodayLog(
      fullHistory,
      progressionTodayIso,
      Array.isArray(activeLog) ? activeLog : [],
      progressionActiveLogIsToday,
    );
  }, [
    progressionActiveLogIsToday,
    sleepEngineLiveLog,
    fullHistory,
    progressionTodayIso,
    activeLog,
  ]);

  const progressionLogs = useMemo(
    () => buildProgressionLogsWindow({
      fullHistory,
      todayDate: progressionTodayIso,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: progressionTodayLiveLog,
    }),
    [fullHistory, progressionTodayIso, progressionTodayLiveLog],
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

  const todayTotals = useMemo(
    () => computeTotali(Array.isArray(progressionTodayLiveLog) ? progressionTodayLiveLog : []),
    [progressionTodayLiveLog],
  );

  const macroPillars = useMemo(
    () => buildMacroPillarInsights(todayTotals, userTargets, settingsBaseKcal),
    [todayTotals, userTargets, settingsBaseKcal],
  );

  const pagellaInsight = useMemo(
    () => buildProgressionPagellaInsight(
      progressionResult.finalScore,
      progressionResult.breakdown,
      macroPillars,
    ),
    [progressionResult, macroPillars],
  );

  const trendSnapshots = useMemo(
    () => buildProgressionTrendSnapshots(progressionLogs.days, userTargets),
    [progressionLogs.days, userTargets],
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
      />

      <ProgressioneMacroPillarGrid
        pillars={macroPillars}
        activeId={activePillar}
        onSelect={setActivePillar}
      />

      <ProgressioneMuscleTelemetry
        fourCylinder={fourCylinder}
        fullHistory={fullHistory}
        activeLog={activeLog}
        activeDate={activeDate || progressionTodayIso}
      />

      <ProgressioneTrendFooter
        adherence7d={trendSnapshots.adherence7d}
        adherence14d={trendSnapshots.adherence14d}
        daysLogged={trendSnapshots.daysLogged}
        trainingPct={breakdown.trainingPct}
        sleepPct={breakdown.sleepPct}
      />
    </div>
  );
}
