import React, { Suspense, lazy, useMemo } from 'react';
import KentuLazySectionFallback from '../../components/KentuLazySectionFallback';
import MetabolicDiagnostics from '../../MetabolicDiagnostics';
import ProgressionScoreWidget from './components/ProgressionScoreWidget';
import { useHealthContext } from './hooks/useHealthContext';
import { useTrendHubHemisphere } from './hooks/useTrendHubHemisphere';
import { calculateProgressionScore } from './utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
} from './utils/saluteHistorySeries';
import { getTodayString } from '../../coreEngine';

/** Code-split: Salute solo quando l'emisfero è attivo. */
const SaluteView = lazy(() => import('./SaluteView'));

const HEMISPHERE_OPTIONS = [
  { value: 'progressione', label: 'Progressione' },
  { value: 'salute', label: 'Salute' },
];

/**
 * Fotografia dello stato attuale: Progressione (score + diagnostica) | Salute.
 * Nessun grafico storico (Bussola / Radar / Mappa).
 */
function ProgressioneSnapshot({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  userTargets = null,
  settingsBaseKcal = null,
  committedGhostGoal = 'maintain',
  committedGhostDeltaKcal = null,
  onApplyGhostSimGoal = null,
  activeCompensation = null,
  onConfirmCompensation = null,
  onClearCompensation = null,
  sleepEngineLiveLog = null,
  todayDate = '',
} = {}) {
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

  const progressionResult = useMemo(() => {
    const logs = buildProgressionLogsWindow({
      fullHistory,
      todayDate: progressionTodayIso,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: progressionTodayLiveLog,
    });
    return calculateProgressionScore(
      {
        days: logs.days,
        sleepAvgHours: logs.sleepAvgHours,
        workoutSessionsTotal: logs.workoutSessionsTotal,
      },
      userTargets || {},
    );
  }, [fullHistory, progressionTodayIso, progressionTodayLiveLog, userTargets]);

  return (
    <div className="snapshot-progressione-root">
      <div className="w-full shrink-0 px-1 pb-2 pt-1">
        <ProgressionScoreWidget
          score={progressionResult.finalScore}
          breakdown={progressionResult.breakdown}
          size={200}
        />
      </div>
      <MetabolicDiagnostics
        fourCylinder={fourCylinder}
        fullHistory={fullHistory}
        dailyLog={activeLog}
        activeDate={activeDate || progressionTodayIso}
        proteinTarget={userTargets?.prot ?? null}
        userTargets={userTargets}
        settingsBaseKcal={settingsBaseKcal}
        committedGhostGoal={committedGhostGoal}
        committedGhostDeltaKcal={committedGhostDeltaKcal}
        onApplyGhostSimGoal={onApplyGhostSimGoal}
        activeCompensation={activeCompensation}
        onConfirmCompensation={onConfirmCompensation}
        onClearCompensation={onClearCompensation}
      />
    </div>
  );
}

/**
 * Shell Fotografia — switch Progressione / Salute (ex emisferi TrendHub).
 */
export default function SnapshotHub({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  sleepEngineLiveLog = null,
  activeDate = null,
  userTargets = null,
  settingsBaseKcal = null,
  committedGhostGoal = 'maintain',
  committedGhostDeltaKcal = null,
  onApplyGhostSimGoal = null,
  activeCompensation = null,
  onConfirmCompensation = null,
  onClearCompensation = null,
  // —— Salute ——
  onSaveHealthBiometrics = null,
  healthTodayDate = '',
  healthDb = null,
  healthUid = null,
  foodDatabase = null,
  setFoodDb = null,
  fastingData = null,
  bodyMetricsHistory = [],
  profileHeightCm = null,
  enabled = true,
} = {}) {
  const { hemisphere, setHemisphere, isProgressione, isSalute } = useTrendHubHemisphere();

  const activeLogIsToday = useMemo(() => {
    const today = String(healthTodayDate || '').slice(0, 10);
    const logDate = String(activeDate || '').slice(0, 10);
    return Boolean(today) && today === logDate;
  }, [healthTodayDate, activeDate]);

  const healthContext = useHealthContext({
    fullHistory,
    foodDatabase,
    bodyMetricsHistory,
    todayDate: healthTodayDate,
  });

  const saluteProps = useMemo(
    () => ({
      recentBodyMetrics: healthContext.recentBodyMetrics,
      yesterdayLog: healthContext.yesterdayLog,
      analysisDate: healthContext.analysisDate,
      relevantFoodDatabase: healthContext.relevantFoodDatabase,
      onSaveBiometrics: onSaveHealthBiometrics,
      todayDate: healthTodayDate,
      db: healthDb,
      uid: healthUid,
      setFoodDb,
      enabled: isSalute && enabled,
      fastingData,
      fourCylinder,
      metabolicCompensationDeltaKcal: committedGhostDeltaKcal,
      activeLog,
      activeLogIsToday,
      sleepEngineLiveLog: Array.isArray(sleepEngineLiveLog) ? sleepEngineLiveLog : activeLog,
      fullHistory,
      heightCm: Number(profileHeightCm) > 0 ? Number(profileHeightCm) : 174,
    }),
    [
      healthContext,
      onSaveHealthBiometrics,
      healthTodayDate,
      healthDb,
      healthUid,
      setFoodDb,
      isSalute,
      enabled,
      fastingData,
      fourCylinder,
      committedGhostDeltaKcal,
      activeLog,
      activeLogIsToday,
      sleepEngineLiveLog,
      fullHistory,
      profileHeightCm,
    ],
  );

  const fallbackLabel = isProgressione
    ? 'Caricamento Progressione…'
    : 'Caricamento Salute…';

  return (
    <div className="trend-hub-root snapshot-hub-root">
      <div
        className="trend-hub-hemisphere-segmented"
        role="tablist"
        aria-label="Fotografia Progressione o Salute"
      >
        {HEMISPHERE_OPTIONS.map(({ value, label }) => {
          const active = hemisphere === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`trend-hub-hemisphere-segment${active ? ' trend-hub-hemisphere-segment--active' : ''}`}
              onClick={() => setHemisphere(value)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="trend-hub-stage snapshot-hub-stage">
        <Suspense fallback={<KentuLazySectionFallback label={fallbackLabel} />}>
          {isProgressione ? (
            <ProgressioneSnapshot
              fourCylinder={fourCylinder}
              fullHistory={fullHistory}
              activeLog={activeLog}
              activeDate={activeDate}
              userTargets={userTargets}
              settingsBaseKcal={settingsBaseKcal}
              committedGhostGoal={committedGhostGoal}
              committedGhostDeltaKcal={committedGhostDeltaKcal}
              onApplyGhostSimGoal={onApplyGhostSimGoal}
              activeCompensation={activeCompensation}
              onConfirmCompensation={onConfirmCompensation}
              onClearCompensation={onClearCompensation}
              sleepEngineLiveLog={Array.isArray(sleepEngineLiveLog) ? sleepEngineLiveLog : activeLog}
              todayDate={healthTodayDate}
            />
          ) : (
            <SaluteView {...saluteProps} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
