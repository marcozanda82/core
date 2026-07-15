import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { computeMetabolicMapCompassBundle } from './features/salaComandi/engines/metabolicMapEngine';
import MetabolicDataAudit from './MetabolicDataAudit';
import MetabolicCompass from './MetabolicCompass';
import MetabolicMap from './MetabolicMap';
import {
  calculateBodyComposition,
  calculateMetabolicTrajectory,
} from './features/salaComandi/engines/adaptiveTDEEEngine';
import { mapBundleToPillars } from './features/metabolic/pillarsMapperLegacy';
import MetabolicPillarsTelemetry from './features/metabolic/components/MetabolicPillarsTelemetry';
import MetabolicBubbleRadar from './features/metabolic/components/MetabolicBubbleRadar';

const DEFAULT_TIMEFRAME = '1d';
const DEFAULT_ACTIVE_TOOL = 'COMPASS';
const TREND_TOOLS = [
  { value: 'COMPASS', label: '🧭 Bussola' },
  { value: 'RADAR', label: '🕸️ Radar' },
  { value: 'MAP', label: '🗺️ Mappa' },
];
const RADAR_TIMEFRAMES = [
  { value: 'AUTO', label: 'AUTO' },
  { value: '1D', label: 'IERI' },
  { value: '7D', label: '7G' },
  { value: '14D', label: '14G' },
  { value: '30D', label: '30G' },
];
const DEFAULT_METABOLIC_GOAL = 'LONGEVITY';

function TrendToolSegmentButton({ active, onClick, children, reducedMotion = false, ...rest }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`trend-tool-segment${active ? ' trend-tool-segment--active' : ''}`}
      style={{
        transition: reducedMotion ? 'none' : 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function metabolicGoalToCompassGoal(metabolicGoal) {
  if (metabolicGoal === 'PERFORMANCE') return METABOLIC_GOAL.MASSA;
  if (metabolicGoal === 'DEFINITION') return METABOLIC_GOAL.PERDITA_GRASSO;
  return METABOLIC_GOAL.RICOMPOSIZIONE;
}

const COMPASS_DEBUG_ALL_TIMEFRAMES = ['1d', '7d', '14d', '30d'];

/** Converte il valore UI del radar nel timeframe del motore (`1d` / `7d` / …). */
function radarTimeframeToEngine(radarValue) {
  const map = {
    '1D': '1d',
    '7D': '7d',
    '14D': '14d',
    '30D': '30d',
    AUTO: '7d',
  };
  return map[String(radarValue).toUpperCase()] || '7d';
}

/** Converte il timeframe motore nel tab radar attivo. */
function engineTimeframeToRadar(engineValue) {
  const map = {
    '1d': '1D',
    '7d': '7D',
    '14d': '14D',
    '30d': '30D',
  };
  return map[String(engineValue).toLowerCase()] || 'AUTO';
}

/** `true` in dev: pannello raw/visual bussola e (opz.) audit espandibile. Produzione: sempre `false`. */
const SHOW_METABOLIC_DEBUG = false;

/**
 * @param {{
 *   active: boolean,
 *   onClick: () => void,
 *   children: React.ReactNode,
 *   variant?: 'view' | 'timeframe' | 'goal',
 *   reducedMotion?: boolean,
 *   'aria-label'?: string,
 * }} props
 */
function MetabolicTabButton({
  active,
  onClick,
  children,
  variant = 'view',
  reducedMotion = false,
  ...rest
}) {
  const transition = reducedMotion
    ? 'none'
    : variant === 'timeframe'
      ? 'background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease'
      : 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease';

  const base = {
    flex: 1,
    margin: 0,
    cursor: 'pointer',
    transition,
    WebkitTapHighlightColor: 'transparent',
  };

  const variantStyle =
    variant === 'timeframe'
      ? {
          minWidth: 0,
          padding: '8px 5px',
          borderRadius: 8,
          border: 'none',
          fontSize: 10,
          fontWeight: 650,
          letterSpacing: '0.11em',
          textTransform: 'uppercase',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          color: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.42)',
          background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
          boxShadow: active ? '0 0 18px rgba(255,255,255,0.05)' : 'none',
        }
      : variant === 'goal'
        ? {
            padding: '8px 9px',
            borderRadius: 12,
            border: active
              ? '1px solid rgba(110, 231, 255, 0.56)'
              : '1px solid rgba(255,255,255,0.12)',
            background: active ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.04)',
            color: active ? 'rgba(248,250,252,0.96)' : 'rgba(203,213,225,0.7)',
            fontSize: 11,
            fontWeight: active ? 640 : 520,
          }
        : {
            padding: '8px 10px',
            borderRadius: 999,
            border: active
              ? '1px solid rgba(148, 197, 255, 0.7)'
              : '1px solid rgba(255,255,255,0.12)',
            background: active ? 'rgba(148, 197, 255, 0.16)' : 'rgba(255,255,255,0.04)',
            color: active ? 'rgba(241, 245, 249, 0.96)' : 'rgba(226,232,240,0.62)',
            fontSize: 12,
            fontWeight: 650,
          };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{ ...base, ...variantStyle }}
      {...rest}
    >
      {children}
    </button>
  );
}

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
  const [timeframeInternal, setTimeframeInternal] = useState(DEFAULT_TIMEFRAME);
  const [activeTool, setActiveTool] = useState(DEFAULT_ACTIVE_TOOL);
  const [radarTimeframe, setRadarTimeframe] = useState('1D');
  const [mapZoom, setMapZoom] = useState(1);
  const metabolicGoal = DEFAULT_METABOLIC_GOAL;

  const isTfControlled =
    selectedTimeframeProp !== undefined && typeof onTimeframeChange === 'function';
  const selectedTimeframe = isTfControlled ? selectedTimeframeProp : timeframeInternal;
  const setSelectedTimeframe = isTfControlled ? onTimeframeChange : setTimeframeInternal;

  useEffect(() => {
    if (selectedTimeframeProp !== undefined) {
      setRadarTimeframe(engineTimeframeToRadar(selectedTimeframeProp));
    }
  }, [selectedTimeframeProp]);

  const handleRadarTimeframeChange = useCallback(
    (radarValue) => {
      setRadarTimeframe(radarValue);
      setSelectedTimeframe(radarTimeframeToEngine(radarValue));
    },
    [setSelectedTimeframe],
  );

  const {
    metabolicMapInputs,
    metabolicMapRawDetails,
    baselineOffset,
    mapZoneColor,
    dailyMapPositions = [],
    projectedTrajectory,
  } = mapData ?? {};

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

  const pillarTelemetry = useMemo(() => mapBundleToPillars(mapData), [mapData]);

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

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compassGoal = useMemo(
    () => metabolicGoalToCompassGoal(metabolicGoal),
    [metabolicGoal],
  );

  const compassVisible = compassScreenActive && activeTool === 'COMPASS';

  return (
    <div className="trend-unified-root">
      <div className="trend-sticky-controls">
        <div
          role="tablist"
          aria-label="Periodo ago predittivo"
          className="trend-timeframe-tablist"
        >
          {RADAR_TIMEFRAMES.map(({ value, label }) => (
            <MetabolicTabButton
              key={value}
              active={radarTimeframe === value}
              onClick={() => handleRadarTimeframeChange(value)}
              variant="timeframe"
              reducedMotion={reducedMotion}
            >
              {label}
            </MetabolicTabButton>
          ))}
        </div>

        <div
          role="tablist"
          aria-label="Strumento metabolico"
          className="trend-tool-segmented"
        >
          {TREND_TOOLS.map(({ value, label }) => (
            <TrendToolSegmentButton
              key={value}
              active={activeTool === value}
              onClick={() => setActiveTool(value)}
              reducedMotion={reducedMotion}
              aria-label={label}
            >
              {label}
            </TrendToolSegmentButton>
          ))}
        </div>
      </div>

      <div className="trend-tool-stage">
        {activeTool === 'COMPASS' ? (
          <>
            <MetabolicCompass
              dailyHistory={dailyHistory}
              bodyMetricsHistory={bodyMetricsHistory}
              userTargets={userTargets}
              expectedFatDeltaKg={expectedFatDeltaKg}
              expectedLeanDeltaKg={expectedLeanDeltaKg}
              compassScreenActive={compassVisible}
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
            {SHOW_METABOLIC_DEBUG ? (
              <CompassDebugPanel
                selectedTimeframe={selectedTimeframe}
                mapData={mapData}
                compassDebugByTimeframe={compassDebugByTimeframe}
              />
            ) : null}
          </>
        ) : null}

        {activeTool === 'RADAR' ? (
          <div className="trend-radar-panel">
            <MetabolicPillarsTelemetry pillars={pillarTelemetry} />
            <div className="trend-radar-shell">
              <MetabolicBubbleRadar
                pillars={pillarTelemetry}
                dailyHistory={dailyHistory}
                selectedTimeframe={selectedTimeframe}
              />
            </div>
          </div>
        ) : null}

        {activeTool === 'MAP' ? (
          <>
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
            {SHOW_METABOLIC_DEBUG ? (
              <MetabolicDataAudit
                rawDetails={metabolicMapRawDetails}
                mapInputs={metabolicMapInputs}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
