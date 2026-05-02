import React, { useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { computeMetabolicMapCompassBundle } from './features/salaComandi/engines/metabolicMapEngine';
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
  const [viewMode, setViewMode] = useState('compass');
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [timeframeInternal, setTimeframeInternal] = useState(DEFAULT_TIMEFRAME);
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
    lineProjection,
    lineTrend,
    lineConfidence,
  } = mapData;

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
            metabolicMapInputsFromBundle={mapData.metabolicMapInputs}
            compassDirectionFromBundle={mapData.compassDirection}
            visualVectorFromBundle={mapData.visualVector}
            compassDisplayLabelFromBundle={mapData.compassDisplayLabel}
            mapSignalStrengthFromBundle={mapData.mapSignalStrength}
          />
          {SHOW_METABOLIC_DEBUG && (
            <CompassDebugPanel
              selectedTimeframe={selectedTimeframe}
              mapData={mapData}
              compassDebugByTimeframe={compassDebugByTimeframe}
            />
          )}
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
              dailyPositions={dailyMapPositions}
              currentPosition={dailyMapPositions[dailyMapPositions.length - 1] || null}
              projectedPosition={projectedTrajectory.projected}
              trajectoryVelocity={projectedTrajectory.velocity}
              mapSignalStrength={mapData.mapSignalStrength}
              mapPresentation={mapData.mapPresentation}
            />
            {SHOW_METABOLIC_DEBUG ? (
              <MetabolicDataAudit
                rawDetails={metabolicMapRawDetails}
                mapInputs={metabolicMapInputs}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
