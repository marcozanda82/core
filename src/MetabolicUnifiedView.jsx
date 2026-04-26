import React, { useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { historyFingerprint } from './metabolicDirectionEngine';
import { calendarDayKeyFromRow, getStructuralBaselineOffsetFromHistory } from './biometricHistory';
import {
  calculateBaselineOffset,
  getLastBiometricData,
} from './metabolicMapEngine';
import {
  computeMetabolicMapInputsAndAudit,
} from './metabolicMapPeriodInputs';
import { computeWeightProjectionFromInputs, formatWeightProjectionUI } from './weightProjectionEngine';
import MetabolicDataAudit from './MetabolicDataAudit';
import MetabolicCompass from './MetabolicCompass';
import MetabolicMap from './MetabolicMap';

const DEFAULT_TIMEFRAME = '7d';
const METABOLIC_COMPASS_TIMEFRAMES = [
  { value: '1d', label: 'IERI' },
  { value: '7d', label: '7G' },
  { value: '14d', label: '14G' },
  { value: '30d', label: '30G' },
];
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

function mapZoneToGlowRgba(zone) {
  if (zone === 'red') return 'rgba(120, 88, 92, 0.28)';
  if (zone === 'orange') return 'rgba(125, 100, 82, 0.28)';
  if (zone === 'green') return 'rgba(88, 108, 128, 0.28)';
  return '';
}

function clampAxis(v) {
  return Math.max(-100, Math.min(100, Number(v) || 0));
}

function getAnchorFromLastWeighIn(baselineOffset) {
  return {
    x: clampAxis(Number(baselineOffset?.x) || 0),
    y: clampAxis(Number(baselineOffset?.y) || 0),
  };
}

function timeframeDateRangeFromDailyHistory(dailyHistory, timeframe) {
  const arr = Array.isArray(dailyHistory) ? dailyHistory : [];
  const dated = arr
    .filter((d) => typeof d?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (dated.length === 0) return null;
  const windowLen = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const slice = dated.length <= windowLen ? dated : dated.slice(-windowLen);
  const startDate = slice[0]?.date;
  const endDate = slice[slice.length - 1]?.date;
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

function filterBodyMetricsByDateRange(bodyMetricsHistory, startDate, endDate) {
  if (!startDate || !endDate) return [];
  const src = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  return src.filter((row) => {
    const dayKey = calendarDayKeyFromRow(row);
    return typeof dayKey === 'string' && dayKey >= startDate && dayKey <= endDate;
  });
}


function IconMapSwitch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5 9 4v13l-5 2.5V6.5Zm10-2.5 5 2.5v13l-5-2.5V4Zm1 .6v11.8l3-1.5V6.1l-3-1.5Zm-9-.1v11.8l3 1.5V5.5l-3 1.5Z"
        fill="currentColor"
        opacity={0.92}
      />
      <path
        d="M15 8.5h4M15 11h3"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  );
}

function IconCompassSwitch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.1} opacity={0.35} />
      <path
        d="M12 6.5 13.8 12 12 17.5 10.2 12 12 6.5Z"
        fill="currentColor"
        opacity={0.9}
      />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity={0.95} />
    </svg>
  );
}

/**
 * Bussola + mappa metabolica in un unico flusso: traiettoria storica, mini-freccia allineata alla bussola,
 * alone bezel dalla zona dell’ultimo giorno della finestra.
 *
 * @param {{ dailyHistory?: Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>, bodyMetricsHistory?: Array<Record<string, unknown>>, compassScreenActive?: boolean, fullHistory?: object | null, userTargets?: { kcal?: number } | null, projectionAnchorDate?: string | null }} props
 */
export default function MetabolicUnifiedView({
  dailyHistory: dailyHistoryProp = [],
  bodyMetricsHistory: bodyMetricsHistoryProp = [],
  compassScreenActive = true,
  fullHistory = null,
  userTargets = null,
  projectionAnchorDate = null,
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];
  const bodyMetricsHistory = Array.isArray(bodyMetricsHistoryProp) ? bodyMetricsHistoryProp : [];
  const [viewMode, setViewMode] = useState('compass');
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [mapZoom, setMapZoom] = useState(1);
  const [showRoute, setShowRoute] = useState(false);

  const compassHistoryKey = useMemo(
    () => historyFingerprint(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  const { mapInputs: metabolicMapInputs, rawDetails: metabolicMapRawDetails } = useMemo(
    () => computeMetabolicMapInputsAndAudit(dailyHistory, selectedTimeframe),
    [compassHistoryKey]
  );

  const baselineOffset = useMemo(() => {
    const range = timeframeDateRangeFromDailyHistory(dailyHistory, selectedTimeframe);
    if (range) {
      const rangedBodyMetrics = filterBodyMetricsByDateRange(
        bodyMetricsHistory,
        range.startDate,
        range.endDate
      );
      const rangedOffset = getStructuralBaselineOffsetFromHistory(rangedBodyMetrics);
      if (rangedOffset) return rangedOffset;
    }
    const fromScale = getStructuralBaselineOffsetFromHistory(bodyMetricsHistory);
    if (fromScale) return fromScale;
    const biometrics = getLastBiometricData(dailyHistory);
    return calculateBaselineOffset(biometrics);
  }, [bodyMetricsHistory, dailyHistory, selectedTimeframe]);

  const anchorPosition = useMemo(() => getAnchorFromLastWeighIn(baselineOffset), [baselineOffset]);
  const estimatedPosition = anchorPosition;
  const directionVector = useMemo(() => ({ x: 0, y: 0 }), []);
  const normalizedMetabolicState = useMemo(() => {
    const x = clampAxis(Number(estimatedPosition?.x) || 0);
    const y = clampAxis(Number(estimatedPosition?.y) || 0);
    return {
      x,
      y,
      finalAura: 0,
      distance: Math.hypot(x, y),
      zone: 'neutral',
      quadrant: 'neutral',
      placeholderStatic: true,
    };
  }, [estimatedPosition]);

  const mapZoneColor = useMemo(() => {
    const zone = normalizedMetabolicState?.zone;
    if (!zone) return '';
    return mapZoneToGlowRgba(zone);
  }, [normalizedMetabolicState]);

  const weightProjection = useMemo(
    () =>
      computeWeightProjectionFromInputs({
        bodyMetricsHistory,
        fullHistory,
        userTargets: userTargets || undefined,
        anchorDateStr: projectionAnchorDate,
      }),
    [bodyMetricsHistory, fullHistory, userTargets, projectionAnchorDate]
  );
  const { lineProjection, lineTrend, lineConfidence } = useMemo(
    () => formatWeightProjectionUI(weightProjection),
    [weightProjection]
  );
  const trajectoryPositions = useMemo(() => [{ ...estimatedPosition }], [estimatedPosition]);
  const currentTrajectoryPosition = useMemo(
    () => ({
      x: clampAxis(Number(estimatedPosition?.x) || 0),
      y: clampAxis(Number(estimatedPosition?.y) || 0),
    }),
    [estimatedPosition]
  );

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(10, 12, 16, 0.74)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode((m) => (m === 'compass' ? 'map' : 'compass'))}
          aria-label={
            viewMode === 'compass' ? 'Apri mappa metabolica' : 'Apri bussola metabolica'
          }
          aria-pressed={viewMode === 'map'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(240, 245, 250, 0.9)',
            transition: reducedMotion ? 'none' : 'background 0.25s ease, transform 0.2s ease',
          }}
        >
          {viewMode === 'compass' ? <IconMapSwitch /> : <IconCompassSwitch />}
        </button>
        <button
          type="button"
          onClick={() => setMapZoom((z) => Math.max(0.8, z - 0.12))}
          disabled={viewMode !== 'map'}
          aria-label="Riduci zoom mappa"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          -
        </button>
        <button
          type="button"
          onClick={() => setMapZoom((z) => Math.min(2.5, z + 0.12))}
          disabled={viewMode !== 'map'}
          aria-label="Aumenta zoom mappa"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setShowRoute((v) => !v)}
          disabled={viewMode !== 'map'}
          aria-label={showRoute ? 'Nascondi rotta' : 'Mostra rotta'}
          style={{
            minWidth: 54,
            height: 32,
            padding: '0 10px',
            borderRadius: 9,
            border: `1px solid ${showRoute ? 'rgba(148, 163, 184, 0.48)' : 'rgba(255,255,255,0.12)'}`,
            background: showRoute ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          Rotta
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Periodo analisi"
        className="metabolic-compass-timeframe"
        style={{
          position: 'relative',
          zIndex: 25,
          display: 'flex',
          width: '100%',
          maxWidth: 340,
          padding: 3,
          gap: 2,
          margin: '58px auto 8px',
          borderRadius: 12,
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {METABOLIC_COMPASS_TIMEFRAMES.map(({ value, label }) => {
          const active = selectedTimeframe === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedTimeframe(value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 5px',
                borderRadius: 9,
                border: 'none',
                margin: 0,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 650,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                color: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.36)',
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
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 480,
          paddingTop: 4,
          boxSizing: 'border-box',
        }}
      >
        <div
          aria-hidden={viewMode !== 'compass'}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            opacity: viewMode === 'compass' ? 1 : 0,
            transform:
              viewMode === 'compass'
                ? 'translateY(0) scale(1)'
                : 'translateY(6px) scale(0.99)',
            pointerEvents: viewMode === 'compass' ? 'auto' : 'none',
            transition: reducedMotion
              ? 'none'
              : 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
            width: '100%',
          }}
        >
          <MetabolicCompass
            dailyHistory={dailyHistory}
            compassScreenActive={compassScreenActive}
            mapZoneColor={mapZoneColor}
            hideMetabolicMapSection
            goal={goal}
            onGoalChange={setGoal}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            normalizedMetabolicState={normalizedMetabolicState}
            neutralStaticMode
          />
        </div>

        <div
          aria-hidden={viewMode !== 'map'}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            opacity: viewMode === 'map' ? 1 : 0,
            transform:
              viewMode === 'map'
                ? 'translateY(0) scale(1)'
                : 'translateY(6px) scale(0.99)',
            pointerEvents: viewMode === 'map' ? 'auto' : 'none',
            transition: reducedMotion
              ? 'none'
              : 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
            width: '100%',
          }}
        >
          <div style={{ padding: 'clamp(0.75rem, 3vw, 1rem)', boxSizing: 'border-box' }}>
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
            <div
              style={{
                margin: '0 0 10px',
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(16, 20, 24, 0.72)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'rgba(200, 210, 220, 0.88)',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {lineProjection ? (
                <div style={{ fontWeight: 500, color: 'rgba(226, 232, 240, 0.92)', marginBottom: 4 }}>
                  {lineProjection}
                </div>
              ) : null}
              <div style={{ fontSize: 11, opacity: 0.9 }}>{lineTrend}</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{lineConfidence}</div>
            </div>
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
              trajectoryPositions={trajectoryPositions}
              currentPosition={currentTrajectoryPosition}
              normalizedMetabolicState={normalizedMetabolicState}
              directionVector={directionVector}
              showRoute={false}
            />
            <MetabolicDataAudit
              rawDetails={metabolicMapRawDetails}
              mapInputs={metabolicMapInputs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
