import React, { Suspense, lazy, useEffect, useMemo } from 'react';
import KentuLazySectionFallback from '../../components/KentuLazySectionFallback';
import { useHealthContext } from './hooks/useHealthContext';
import { useTrendHubHemisphere } from './hooks/useTrendHubHemisphere';

/** Code-split: grafici Progressione solo quando l'emisfero è attivo. */
const MetabolicUnifiedView = lazy(() => import('../../MetabolicUnifiedView'));
/** Code-split: Salute + HealthAnalyzer/askAI solo quando serve. */
const SaluteView = lazy(() => import('./SaluteView'));

const HEMISPHERE_OPTIONS = [
  { value: 'progressione', label: 'Progressione' },
  { value: 'salute', label: 'Salute' },
];

/**
 * Shell a due emisferi per la tab Trend (bussola).
 *
 * Contratti props P1 (espliciti, niente pass-through cieco):
 * - Progressione → MetabolicUnifiedView (grafici + fullHistory dove serve ai tool)
 * - Salute → SaluteView (yesterdayLog + food slice + metriche recenti; no fullHistory)
 */
export default function TrendHub({
  // —— Progressione ——
  mapData = null,
  dailyHistory = [],
  bodyMetricsHistory = [],
  fullHistory = null,
  userTargets = null,
  projectionAnchorDate = null,
  selectedTimeframe,
  onTimeframeChange,
  fourCylinder = null,
  activeLog = null,
  activeDate = null,
  settingsBaseKcal = null,
  committedGhostGoal = 'maintain',
  committedGhostDeltaKcal = null,
  onApplyGhostSimGoal = null,
  activeCompensation = null,
  onConfirmCompensation = null,
  onClearCompensation = null,
  activeToolRequest = null,
  onActiveToolRequestHandled = null,
  compassScreenActive = true,
  // —— Salute ——
  onSaveHealthBiometrics = null,
  healthTodayDate = '',
  healthDb = null,
  healthUid = null,
  foodDatabase = null,
  setFoodDb = null,
} = {}) {
  const { hemisphere, setHemisphere, isProgressione, isSalute } = useTrendHubHemisphere();

  // Selettore snello: memoizzato sul nodo di ieri / chiavi food / history biometrica.
  const healthContext = useHealthContext({
    fullHistory,
    foodDatabase,
    bodyMetricsHistory,
    todayDate: healthTodayDate,
  });

  // Deep-link DIAG/tool: forza Progressione così MetabolicUnifiedView riceve la request.
  useEffect(() => {
    if (!compassScreenActive || !activeToolRequest) return undefined;
    if (hemisphere !== 'progressione') {
      setHemisphere('progressione');
    }
    return undefined;
  }, [activeToolRequest, compassScreenActive, hemisphere, setHemisphere]);

  const progressioneProps = useMemo(
    () => ({
      mapData,
      dailyHistory,
      bodyMetricsHistory,
      fullHistory,
      userTargets,
      projectionAnchorDate,
      selectedTimeframe,
      onTimeframeChange,
      fourCylinder,
      activeLog,
      activeDate,
      settingsBaseKcal,
      committedGhostGoal,
      committedGhostDeltaKcal,
      onApplyGhostSimGoal,
      activeCompensation,
      onConfirmCompensation,
      onClearCompensation,
      activeToolRequest,
      onActiveToolRequestHandled,
      compassScreenActive,
    }),
    [
      mapData,
      dailyHistory,
      bodyMetricsHistory,
      fullHistory,
      userTargets,
      projectionAnchorDate,
      selectedTimeframe,
      onTimeframeChange,
      fourCylinder,
      activeLog,
      activeDate,
      settingsBaseKcal,
      committedGhostGoal,
      committedGhostDeltaKcal,
      onApplyGhostSimGoal,
      activeCompensation,
      onConfirmCompensation,
      onClearCompensation,
      activeToolRequest,
      onActiveToolRequestHandled,
      compassScreenActive,
    ],
  );

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
      enabled: isSalute && compassScreenActive,
    }),
    [
      healthContext,
      onSaveHealthBiometrics,
      healthTodayDate,
      healthDb,
      healthUid,
      setFoodDb,
      isSalute,
      compassScreenActive,
    ],
  );

  const fallbackLabel = isProgressione
    ? 'Caricamento Progressione…'
    : 'Caricamento Salute…';

  return (
    <div className="trend-hub-root">
      <div
        className="trend-hub-hemisphere-segmented"
        role="tablist"
        aria-label="Emisfero Trend"
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

      <div className="trend-hub-stage">
        <Suspense fallback={<KentuLazySectionFallback label={fallbackLabel} />}>
          {isProgressione ? (
            <MetabolicUnifiedView {...progressioneProps} />
          ) : (
            <SaluteView {...saluteProps} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
