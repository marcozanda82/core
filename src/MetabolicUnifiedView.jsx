import React, { useEffect, useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { computeMetabolicMapCompassBundle } from './features/salaComandi/engines/metabolicMapEngine';
import MetabolicDataAudit from './MetabolicDataAudit';
import MetabolicCompass from './MetabolicCompass';
import MetabolicMap from './MetabolicMap';
import {
  calculateBodyComposition,
  calculateDynamicTarget,
  calculateMetabolicTrajectory,
} from './features/salaComandi/engines/adaptiveTDEEEngine';
import { generateCoachAdvice } from './features/salaComandi/engines/coachEngine';
import MetabolicCoachCompact from '@/features/salaComandi/components/MetabolicCoachCompact';
import useMetabolicCoach from './features/salaComandi/hooks/useMetabolicCoach';

const DEFAULT_TIMEFRAME = '7d';
const RADAR_TIMEFRAMES = [
  { value: 'AUTO', label: 'AUTO' },
  { value: '1D', label: 'IERI' },
  { value: '7D', label: '7G' },
  { value: '14D', label: '14G' },
  { value: '30D', label: '30G' },
];
const METABOLIC_GOALS = [
  { value: 'LONGEVITY', label: '🌱 Longevità (Equilibrio)' },
  { value: 'PERFORMANCE', label: '⚡ Performance (Massa)' },
  { value: 'DEFINITION', label: '🔪 Definizione (Estetica)' },
];

function metabolicGoalToRoute(metabolicGoal) {
  if (metabolicGoal === 'PERFORMANCE') return 'performance';
  if (metabolicGoal === 'DEFINITION') return 'definition';
  return 'longevity';
}

function metabolicGoalToCompassGoal(metabolicGoal) {
  if (metabolicGoal === 'PERFORMANCE') return METABOLIC_GOAL.MASSA;
  if (metabolicGoal === 'DEFINITION') return METABOLIC_GOAL.PERDITA_GRASSO;
  return METABOLIC_GOAL.RICOMPOSIZIONE;
}

const COMPASS_DEBUG_ALL_TIMEFRAMES = ['1d', '7d', '14d', '30d'];

/** `true` in dev: pannello raw/visual bussola e (opz.) audit espandibile. Produzione: sempre `false`. */
const SHOW_METABOLIC_DEBUG = false;

function CompassDebugPanel({ selectedTimeframe, mapData, compassDebugByTimeframe }) {
  const {
    rawVector,
    visualVector,
    compassDirection,
    rawMagnitude,
    compassSectorLabel,
    compassSignalStrength,
    compassDisplayLabel,
  } = mapData;

  return (
    <div style={{ marginTop: 16, fontSize: 12, color: '#aaa' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#888' }}>Compass debug</div>
      <div>selectedTimeframe: {String(selectedTimeframe)}</div>
      <div>mapData.rawVector.x: {rawVector != null ? String(rawVector.x) : '—'}</div>
      <div>mapData.rawVector.y: {rawVector != null ? String(rawVector.y) : '—'}</div>
      <div>
        |raw| (hypot):{' '}
        {rawVector != null
          ? String(Math.hypot(Number(rawVector.x) || 0, Number(rawVector.y) || 0))
          : '—'}
      </div>
      <div>mapData.visualVector.visualX: {visualVector != null ? String(visualVector.visualX) : '—'}</div>
      <div>mapData.visualVector.visualY: {visualVector != null ? String(visualVector.visualY) : '—'}</div>
      <div>
        |visual| (hypot):{' '}
        {visualVector != null
          ? String(
              Math.hypot(
                Number(visualVector.visualX) || 0,
                Number(visualVector.visualY) || 0
              )
            )
          : '—'}
      </div>
      <div>
        mapData.compassDirection.angleDeg:{' '}
        {compassDirection != null ? String(compassDirection.angleDeg) : '—'}
      </div>
      <div>mapData.rawMagnitude: {rawMagnitude != null ? String(rawMagnitude) : '—'}</div>
      <div>mapData.compassSectorLabel (raw): {compassSectorLabel != null ? String(compassSectorLabel) : '—'}</div>
      <div>mapData.compassSignalStrength: {compassSignalStrength != null ? String(compassSignalStrength) : '—'}</div>
      <div>mapData.compassDisplayLabel: {compassDisplayLabel != null ? String(compassDisplayLabel) : '—'}</div>
      <div style={{ marginTop: 12, marginBottom: 4, fontWeight: 600, color: '#888' }}>All timeframes</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', borderBottom: '1px solid #444' }}>
              Timeframe
            </th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>rawX</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>rawY</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>angle</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>
              sector (raw)
            </th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>display</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #444' }}>strength</th>
          </tr>
        </thead>
        <tbody>
          {compassDebugByTimeframe.map((row) => (
            <tr
              key={row.tf}
              style={{
                background:
                  row.tf === selectedTimeframe ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              <td style={{ padding: '4px 8px 4px 0', borderBottom: '1px solid #333' }}>{row.tf}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.rawX}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.rawY}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.angleDeg}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.sectorLabel}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.displayLabel}</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row.strength}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Bussola + mappa metabolica in un unico flusso: traiettoria storica, mini-freccia allineata alla bussola,
 * alone bezel dalla zona dell’ultimo giorno della finestra.
 *
 * @param {object} props
 * @param {object} props.mapData — risultato di {@link computeMetabolicMapCompassBundle} (hook `useMetabolicMapEngine`).
 */
export default function MetabolicUnifiedView({
  mapData,
  dailyHistory: dailyHistoryProp = [],
  bodyMetricsHistory: bodyMetricsHistoryProp = [],
  compassScreenActive = true,
  fullHistory = null,
  userTargets = null,
  projectionAnchorDate = null,
  selectedTimeframe: selectedTimeframeProp,
  onTimeframeChange,
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];
  const bodyMetricsHistory = Array.isArray(bodyMetricsHistoryProp) ? bodyMetricsHistoryProp : [];
  const [currentView, setCurrentView] = useState('MAP');
  const [timeframeInternal, setTimeframeInternal] = useState(DEFAULT_TIMEFRAME);
  const [radarTimeframe, setRadarTimeframe] = useState('AUTO');
  const [metabolicGoal, setMetabolicGoal] = useState('LONGEVITY');
  const [mapZoom, setMapZoom] = useState(1);

  const isTfControlled =
    selectedTimeframeProp !== undefined && typeof onTimeframeChange === 'function';
  const selectedTimeframe = isTfControlled ? selectedTimeframeProp : timeframeInternal;
  const setSelectedTimeframe = isTfControlled ? onTimeframeChange : setTimeframeInternal;

  const {
    metabolicMapInputs,
    metabolicMapRawDetails,
    baselineOffset,
    mapZoneColor,
    dailyMapPositions,
    projectedTrajectory,
  } = mapData;

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[CompassAmbientStyle:unified]', mapData?.compassAmbientStyle);
    }
  }, [mapData]);

  const compassDebugByTimeframe = useMemo(() => {
    if (!SHOW_METABOLIC_DEBUG) return [];
    const base = {
      dailyHistory,
      bodyMetricsHistory,
      fullHistory,
      userTargets,
      projectionAnchorDate,
    };
    return COMPASS_DEBUG_ALL_TIMEFRAMES.map((tf) => {
      const b = computeMetabolicMapCompassBundle({ ...base, selectedTimeframe: tf });
      return {
        tf,
        rawX: b.rawVector.x,
        rawY: b.rawVector.y,
        angleDeg: b.compassDirection.angleDeg,
        sectorLabel: b.compassSectorLabel,
        displayLabel: b.compassDisplayLabel,
        strength: b.compassSignalStrength,
      };
    });
  }, [dailyHistory, bodyMetricsHistory, fullHistory, userTargets, projectionAnchorDate]);

  const coachInsight = useMetabolicCoach({
    mapData,
    userTargets,
    selectedTimeframe,
    dailyHistory,
  });

  const targetWeight = useMemo(() => {
    const profileTarget = Number(userTargets?.weight);
    if (Number.isFinite(profileTarget) && profileTarget > 0) return profileTarget;
    const latestWeight = Number(bodyMetricsHistory?.[bodyMetricsHistory.length - 1]?.weight);
    if (Number.isFinite(latestWeight) && latestWeight > 0) return latestWeight;
    return 75;
  }, [userTargets, bodyMetricsHistory]);

  const targetBF = useMemo(() => {
    const profileBf = Number(userTargets?.bodyFat);
    if (Number.isFinite(profileBf) && profileBf >= 0) return profileBf;
    for (let i = bodyMetricsHistory.length - 1; i >= 0; i -= 1) {
      const bf = Number(bodyMetricsHistory[i]?.bodyFat);
      if (Number.isFinite(bf) && bf >= 0) return bf;
    }
    return 15;
  }, [userTargets, bodyMetricsHistory]);

  const { fatMassKg: targetFatKg, leanMassKg: targetLeanKg } = useMemo(
    () => calculateBodyComposition(targetWeight, targetBF),
    [targetWeight, targetBF],
  );

  const { expectedFatDelta: expectedFatDeltaKg, expectedLeanDelta: expectedLeanDeltaKg } = useMemo(() => {
    const parseDayMs = (day) => {
      if (!day || typeof day.date !== 'string') return NaN;
      return new Date(`${day.date.slice(0, 10)}T12:00:00`).getTime();
    };
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msDay = 86400000;

    const latestWeighDateMs = (() => {
      let best = NaN;
      for (let i = bodyMetricsHistory.length - 1; i >= 0; i -= 1) {
        const rawDate = typeof bodyMetricsHistory[i]?.date === 'string' ? bodyMetricsHistory[i].date.slice(0, 10) : '';
        if (!rawDate) continue;
        const t = new Date(`${rawDate}T12:00:00`).getTime();
        if (Number.isFinite(t)) {
          best = t;
          break;
        }
      }
      return best;
    })();

    const minDateMs = (() => {
      if (radarTimeframe === 'AUTO') {
        return Number.isFinite(latestWeighDateMs) ? latestWeighDateMs : todayMid - 10 * msDay;
      }
      if (radarTimeframe === '1D') return todayMid - 1 * msDay;
      if (radarTimeframe === '7D') return todayMid - 7 * msDay;
      if (radarTimeframe === '14D') return todayMid - 14 * msDay;
      if (radarTimeframe === '30D') return todayMid - 30 * msDay;
      return todayMid - 10 * msDay;
    })();

    const projectionWindow = dailyHistory.filter((day) => {
      const t = parseDayMs(day);
      return Number.isFinite(t) && t >= minDateMs;
    });

    const safeWindow = projectionWindow.length > 0 ? projectionWindow : dailyHistory.slice(-10);
    const cumulativeCaloricDelta = safeWindow.reduce(
      (sum, day) => sum + (Number(day?.kcalBalance) || 0),
      0,
    );
    const meanTrainingAxis =
      safeWindow.length > 0
        ? safeWindow.reduce((sum, day) => sum + (Number(day?.trainingLoad) || 0), 0) /
          safeWindow.length
        : Number(metabolicMapInputs?.trainingLoad);
    const trainingAxis = Number(meanTrainingAxis);
    const trainingStimulus =
      Number.isFinite(trainingAxis) ? Math.max(0, Math.min(1, (trainingAxis + 100) / 200)) : 1;
    return calculateMetabolicTrajectory(cumulativeCaloricDelta, 1, trainingStimulus);
  }, [dailyHistory, bodyMetricsHistory, radarTimeframe, metabolicMapInputs]);

  const currentMapPos = useMemo(() => {
    const history = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const weight = Number(history[i]?.weight);
      const bodyFat = Number(history[i]?.bodyFat);
      if (Number.isFinite(weight) && weight > 0 && Number.isFinite(bodyFat) && bodyFat >= 0) {
        return calculateBodyComposition(weight, bodyFat);
      }
    }
    return { fatMassKg: targetFatKg, leanMassKg: targetLeanKg };
  }, [bodyMetricsHistory, targetFatKg, targetLeanKg]);

  const routeForGoal = useMemo(() => metabolicGoalToRoute(metabolicGoal), [metabolicGoal]);

  const dynamicTarget = useMemo(
    () => calculateDynamicTarget('M', 174, routeForGoal),
    [routeForGoal],
  );

  const coachMessage = useMemo(
    () =>
      generateCoachAdvice(
        { fatMassKg: currentMapPos.fatMassKg, leanMassKg: currentMapPos.leanMassKg },
        dynamicTarget,
        { expectedFatDeltaKg, expectedLeanDeltaKg },
        routeForGoal,
      ),
    [currentMapPos, dynamicTarget, expectedFatDeltaKg, expectedLeanDeltaKg, routeForGoal],
  );

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compassGoal = useMemo(
    () => metabolicGoalToCompassGoal(metabolicGoal),
    [metabolicGoal],
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '10px',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(10, 12, 16, 0.74)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
      >
        <div
          role="tablist"
          aria-label="Vista principale"
          style={{
            display: 'flex',
            width: '100%',
            gap: 6,
          }}
        >
          {[
            { value: 'MAP', label: '🗺️ Mappa' },
            { value: 'COMPASS', label: '🧭 Bussola' },
          ].map(({ value, label }) => {
            const active = currentView === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCurrentView(value)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 999,
                  border: active
                    ? '1px solid rgba(148, 197, 255, 0.7)'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(148, 197, 255, 0.16)' : 'rgba(255,255,255,0.04)',
                  color: active ? 'rgba(241, 245, 249, 0.96)' : 'rgba(226,232,240,0.62)',
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                  transition: reducedMotion
                    ? 'none'
                    : 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label="Periodo ago predittivo"
          style={{
            display: 'flex',
            width: '100%',
            gap: 4,
            padding: 3,
            borderRadius: 11,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {RADAR_TIMEFRAMES.map(({ value, label }) => {
            const active = radarTimeframe === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRadarTimeframe(value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 5px',
                  borderRadius: 8,
                  border: 'none',
                  margin: 0,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 650,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                  color: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.42)',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  boxShadow: active ? '0 0 18px rgba(255,255,255,0.05)' : 'none',
                  transition:
                    'background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label="Obiettivo metabolico"
          style={{
            display: 'flex',
            width: '100%',
            gap: 6,
          }}
        >
          {METABOLIC_GOALS.map(({ value, label }) => {
            const active = metabolicGoal === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetabolicGoal(value)}
                style={{
                  flex: 1,
                  padding: '8px 9px',
                  borderRadius: 12,
                  border: active
                    ? '1px solid rgba(110, 231, 255, 0.56)'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.04)',
                  color: active ? 'rgba(248,250,252,0.96)' : 'rgba(203,213,225,0.7)',
                  fontSize: 11,
                  fontWeight: active ? 640 : 520,
                  cursor: 'pointer',
                  transition: reducedMotion
                    ? 'none'
                    : 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 16,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {currentView === 'MAP' ? (
            <div style={{ width: '100%', padding: 'clamp(0.75rem, 3vw, 1rem)', boxSizing: 'border-box' }}>
              <h3
                style={{
                  margin: '0 0 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.42)',
                  textAlign: 'center',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                Analisi Stato Metabolico
              </h3>
              <MetabolicMap
                energyBalance={metabolicMapInputs.energyBalance}
                trainingLoad={metabolicMapInputs.trainingLoad}
                sleepHours={metabolicMapInputs.sleepHours}
                glycemicInstability={metabolicMapInputs.glycemicInstability}
                realSleepDays={metabolicMapInputs.realSleepDays}
                totalWindowDays={metabolicMapInputs.totalWindowDays}
                selectedTimeframe={selectedTimeframe}
                baselineOffset={baselineOffset}
                bodyMetricsHistory={bodyMetricsHistory}
                zoomLevel={mapZoom}
                onZoomLevelChange={setMapZoom}
                dailyPositions={dailyMapPositions}
                currentPosition={dailyMapPositions[dailyMapPositions.length - 1] || null}
                mapPositionInertial={mapData.mapPositionInertial ?? null}
                projectedPosition={projectedTrajectory.projected}
                trajectoryVelocity={projectedTrajectory.velocity}
                mapSignalStrength={mapData.mapSignalStrength}
                persistFracOutsideDeadband={mapData.persistFracOutsideDeadband ?? null}
                mapPresentation={mapData.mapPresentation}
                targetFatKg={targetFatKg}
                targetLeanKg={targetLeanKg}
                expectedFatDeltaKg={expectedFatDeltaKg}
                expectedLeanDeltaKg={expectedLeanDeltaKg}
                metabolicGoal={metabolicGoal}
              />
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '8px',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>🧭</span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.7)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Navigatore di Rotta
                  </span>
                </div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)', lineHeight: '1.5' }}>
                  {coachMessage || 'In attesa di dati per calcolare la traiettoria...'}
                </div>
              </div>
              {SHOW_METABOLIC_DEBUG ? (
                <MetabolicDataAudit
                  rawDetails={metabolicMapRawDetails}
                  mapInputs={metabolicMapInputs}
                />
              ) : null}
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              <MetabolicCompass
                dailyHistory={dailyHistory}
                bodyMetricsHistory={bodyMetricsHistory}
                userTargets={userTargets}
                expectedFatDeltaKg={expectedFatDeltaKg}
                expectedLeanDeltaKg={expectedLeanDeltaKg}
                compassScreenActive={compassScreenActive}
                mapZoneColor={mapZoneColor}
                compassAmbientStyle={mapData.compassAmbientStyle}
                hideMetabolicMapSection
                goal={compassGoal}
                onGoalChange={() => {}}
                selectedTimeframe={selectedTimeframe}
                onTimeframeChange={setSelectedTimeframe}
                metabolicMapInputsFromBundle={mapData.metabolicMapInputs}
                mapSignalStrengthFromBundle={mapData.mapSignalStrength}
                hideGoalControls
              />
              {SHOW_METABOLIC_DEBUG && (
                <CompassDebugPanel
                  selectedTimeframe={selectedTimeframe}
                  mapData={mapData}
                  compassDebugByTimeframe={compassDebugByTimeframe}
                />
              )}
            </div>
          )}
        </div>

        {currentView === 'COMPASS' ? <MetabolicCoachCompact coach={coachInsight} /> : null}
      </div>
    </div>
  );
}
