import React, { Suspense, lazy, useMemo } from 'react';
import KentuLazySectionFallback from '../../components/KentuLazySectionFallback';
import { useHealthContext } from './hooks/useHealthContext';
import { useTrendHubHemisphere } from './hooks/useTrendHubHemisphere';

/** Code-split: Salute / Progressione solo quando l'emisfero è attivo. */
const SaluteView = lazy(() => import('./SaluteView'));
const ProgressioneView = lazy(() => import('./ProgressioneView'));

const HEMISPHERE_OPTIONS = [
  { value: 'progressione', icon: '📈', label: 'Progressione' },
  { value: 'salute', icon: '🫀', label: 'Salute' },
];

/**
 * Shell Fotografia — Progressione (`ProgressioneView`) | Salute (`SaluteView`).
 * Da Home / Centro Analisi: `lockedHemisphere` + `hideHemisphereNav` → videata dedicata.
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
  effectiveGhostDeltaKcal = null,
  autoCompensationDelta = 0,
  rollingDebt = null,
  ghostAutoPilotEnabled = true,
  onToggleGhostAutoPilot = null,
  onApplyGhostSimGoal = null,
  activeCompensation = null,
  onConfirmCompensation = null,
  onClearCompensation = null,
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
  lockedHemisphere = null,
  hideHemisphereNav = false,
  longevityResult = null,
} = {}) {
  const { hemisphere, setHemisphere } = useTrendHubHemisphere();

  const effectiveHemisphere = useMemo(() => {
    const locked = String(lockedHemisphere || '').toLowerCase();
    if (locked === 'progressione' || locked === 'salute') return locked;
    return hemisphere === 'salute' ? 'salute' : 'progressione';
  }, [lockedHemisphere, hemisphere]);

  const isProgressione = effectiveHemisphere === 'progressione';
  const isSalute = effectiveHemisphere === 'salute';
  const showHemisphereNav = !hideHemisphereNav && !lockedHemisphere;

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
      userTargets,
      longevityResult,
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
      userTargets,
      longevityResult,
    ],
  );

  const fallbackLabel = isProgressione
    ? 'Caricamento Progressione…'
    : 'Caricamento Salute…';

  return (
    <div className="trend-hub-root snapshot-hub-root">
      {showHemisphereNav ? (
        <div
          className="trend-hub-hemisphere-segmented"
          role="tablist"
          aria-label="Fotografia Progressione o Salute"
        >
          {HEMISPHERE_OPTIONS.map(({ value, icon, label }) => {
            const active = effectiveHemisphere === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={label}
                title={label}
                className={`trend-hub-hemisphere-segment trend-hub-hemisphere-segment--icon${active ? ' trend-hub-hemisphere-segment--active' : ''}`}
                onClick={() => setHemisphere(value)}
              >
                <span className="trend-hub-hemisphere-segment__icon" aria-hidden>{icon}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="trend-hub-stage snapshot-hub-stage">
        <Suspense fallback={<KentuLazySectionFallback label={fallbackLabel} />}>
          {isProgressione ? (
            <ProgressioneView
              fourCylinder={fourCylinder}
              fullHistory={fullHistory}
              activeLog={activeLog}
              activeDate={activeDate}
              userTargets={userTargets}
              settingsBaseKcal={settingsBaseKcal}
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
