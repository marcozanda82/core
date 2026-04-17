import React, { useMemo, useState } from 'react';
import {
  getMetabolicTargetAngle,
  metabolicAngleDegToCompassBearingDeg,
  METABOLIC_GOAL,
} from './metabolicDirection';
import { computeMetabolicEngineTargetVec, historyFingerprint } from './metabolicDirectionEngine';
import {
  calculateBaselineOffset,
  calculateMetabolicMapPosition,
  computeMacroTrajectory,
  getLastBiometricData,
} from './metabolicMapEngine';
import { computeMetabolicMapInputsAndAudit } from './metabolicMapPeriodInputs';
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

function visibleMacroPointCount(selectedTimeframe) {
  if (selectedTimeframe === '30d') return 1;
  if (selectedTimeframe === '14d') return 2;
  if (selectedTimeframe === '7d') return 3;
  return 4;
}

const RAD_TO_DEG = 180 / Math.PI;

function mapZoneToGlowRgba(zone) {
  if (zone === 'red') return 'rgba(239, 68, 68, 0.4)';
  if (zone === 'orange') return 'rgba(249, 115, 22, 0.4)';
  if (zone === 'green') return 'rgba(34, 197, 94, 0.4)';
  return '';
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
 * @param {{ dailyHistory?: Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>, compassScreenActive?: boolean }} props
 */
export default function MetabolicUnifiedView({
  dailyHistory: dailyHistoryProp = [],
  compassScreenActive = true,
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];
  const [viewMode, setViewMode] = useState('compass');
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_TIMEFRAME);

  const compassHistoryKey = useMemo(
    () => historyFingerprint(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  const { mapInputs: metabolicMapInputs, rawDetails: metabolicMapRawDetails } = useMemo(
    () => computeMetabolicMapInputsAndAudit(dailyHistory, selectedTimeframe),
    [compassHistoryKey]
  );

  const macroTrajectory = useMemo(
    () => computeMacroTrajectory(dailyHistory),
    [dailyHistory]
  );
  const baselineOffset = useMemo(() => {
    const biometrics = getLastBiometricData(dailyHistory);
    return calculateBaselineOffset(biometrics);
  }, [dailyHistory]);

  // Bussola: resta ancorata al vettore originale del motore su dailyHistory grezza.
  const { angleDeg } = useMemo(() => {
    const { x, y } = computeMetabolicEngineTargetVec(dailyHistory, selectedTimeframe);
    const angleRad = Math.atan2(y, x);
    const ad = Number.isFinite(angleRad) ? angleRad * RAD_TO_DEG : 0;
    return { angleDeg: ad };
  }, [dailyHistory, selectedTimeframe]);

  const compassRotation = -getMetabolicTargetAngle(goal);
  const arrowRotationDeg = metabolicAngleDegToCompassBearingDeg(angleDeg) + compassRotation;

  const mapZoneColor = useMemo(() => {
    const visibleCount = visibleMacroPointCount(selectedTimeframe);
    const visible = macroTrajectory.slice(0, Math.min(visibleCount, macroTrajectory.length));
    const last = visible[visible.length - 1];
    if (last?.zone) return mapZoneToGlowRgba(last.zone);
    const { zone } = calculateMetabolicMapPosition({
      energyBalance: metabolicMapInputs.energyBalance,
      trainingLoad: metabolicMapInputs.trainingLoad,
      sleepHours: metabolicMapInputs.sleepHours,
      glycemicInstability: metabolicMapInputs.glycemicInstability,
    });
    return mapZoneToGlowRgba(zone);
  }, [macroTrajectory, selectedTimeframe, metabolicMapInputs]);

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
      <button
        type="button"
        onClick={() => setViewMode((m) => (m === 'compass' ? 'map' : 'compass'))}
        aria-label={
          viewMode === 'compass' ? 'Apri mappa metabolica' : 'Apri bussola metabolica'
        }
        aria-pressed={viewMode === 'map'}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          zIndex: 30,
          width: 42,
          height: 42,
          borderRadius: 11,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(10, 12, 16, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(240, 245, 250, 0.9)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
          transition: reducedMotion ? 'none' : 'background 0.25s ease, transform 0.2s ease',
        }}
      >
        {viewMode === 'compass' ? <IconMapSwitch /> : <IconCompassSwitch />}
      </button>

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
          margin: '52px auto 8px',
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
            <MetabolicMap
              energyBalance={metabolicMapInputs.energyBalance}
              trainingLoad={metabolicMapInputs.trainingLoad}
              sleepHours={metabolicMapInputs.sleepHours}
              glycemicInstability={metabolicMapInputs.glycemicInstability}
              realSleepDays={metabolicMapInputs.realSleepDays}
              totalWindowDays={metabolicMapInputs.totalWindowDays}
              selectedTimeframe={selectedTimeframe}
              macroTrajectory={macroTrajectory}
              baselineOffset={baselineOffset}
              currentCompassAngle={arrowRotationDeg}
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
