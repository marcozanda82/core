import React, { useId, useMemo } from 'react';
import { calculateMetabolicMapPosition } from './metabolicMapEngine';

/** viewBox 0–100: stesso sistema di posizionamento del marker (50 ± x/2, 50 ∓ y/2). */
function mapPointToSvgCoords(x, y) {
  return { cx: 50 + x / 2, cy: 50 - y / 2 };
}

function classifyMapPoint(x, y) {
  const distance = Math.hypot(x, y);
  let zone = 'green';
  if (distance > 70) zone = 'red';
  else if (distance > 35) zone = 'orange';

  let quadrant = 'NE';
  if (x < 0 && y >= 0) quadrant = 'NW';
  else if (x >= 0 && y < 0) quadrant = 'SE';
  else if (x < 0 && y < 0) quadrant = 'SW';
  return { zone, quadrant, distance };
}

/** Soglie zona radiale: distanza ≤35 Blue Zone, ≤70 arancione, oltre rosso (coerente con classifyMapPoint). */
const BLUE_ZONE_SVG_R = 17.5;

/** Freccia mini-bussola: 0° = Nord (verso −y SVG), coerente con la freccia principale. */
function MetabolicMapCompassMarker({ cx, cy, angleDeg, gradientId, highAura }) {
  return (
    <g
      transform={`translate(${cx},${cy}) rotate(${angleDeg})`}
      className={highAura ? 'metabolic-map-arrow-pulse' : undefined}
      style={
        highAura
          ? undefined
          : { filter: 'drop-shadow(0 0 4px rgba(120, 210, 255, 0.35))' }
      }
    >
      <polygon
        points="0,-7.5 6.2,6.5 -6.2,6.5"
        fill={`url(#${gradientId})`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={0.35}
        vectorEffect="nonScalingStroke"
      />
    </g>
  );
}

const ZONE_LABELS = {
  green: 'Blue Zone (Longevità)',
  orange: 'Arancione (Adattamento)',
  red: 'Rossa (Pericolo)',
};

const QUADRANT_RISK_LABELS = {
  NW: 'BURNOUT / CORTISOLO',
  NE: 'INFIAMMAZIONE / BULK',
  SW: 'DEPERIMENTO / CATABOLISMO',
  SE: 'FEGATO GRASSO / INSULINA',
};

function buildMapBackground() {
  return `radial-gradient(circle at 50% 50%,
    rgba(14, 165, 233, 0.38) 0%,
    rgba(8, 105, 155, 0.48) 32%,
    rgba(110, 52, 14, 0.88) 35%,
    rgba(130, 62, 18, 0.82) 70%,
    rgba(92, 10, 24, 0.9) 70%,
    rgba(48, 6, 14, 0.95) 100%
  )`;
}

function buildGridBackground() {
  return `
    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px),
    linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)
  `;
}

function buildGridSize() {
  return '12.5% 12.5%, 12.5% 12.5%, 100% 100%, 100% 100%';
}

function buildGridPosition() {
  return '0 0, 0 0, 50% 50%, 50% 50%';
}

/**
 * Testo opzionale sotto il pannello rischio: solo se mancano dati sonno nel periodo.
 *
 * @param {number} realSleepDays
 * @param {number} totalWindowDays
 * @returns {string | null}
 */
function sleepDataReliabilityText(realSleepDays, totalWindowDays) {
  if (totalWindowDays <= 0) return null;
  if (realSleepDays >= totalWindowDays) return null;
  if (realSleepDays <= 0) {
    return 'Dati sonno non rilevati (utilizzata stima 8h)';
  }
  return `Affidabilità dati sonno: ${realSleepDays}/${totalWindowDays} giorni registrati`;
}

/**
 * Mappa metabolica: coordinate da `metabolicMapEngine`, zone radiali e aura glicemica.
 * Rendering vettoriale: Ancora strutturale (baseline bilancia) + vettore stile di vita + bussola sulla punta.
 */
export default function MetabolicMap({
  energyBalance = 0,
  trainingLoad = 0,
  sleepHours = 8,
  glycemicInstability = 0,
  realSleepDays = 0,
  totalWindowDays = 0,
  selectedTimeframe = '7d',
  baselineOffset = null,
  currentCompassAngle = null,
}) {
  const gradientId = useId().replace(/:/g, '');
  const glowFilterId = `${gradientId}-anchor-glow`;

  const { x, y, finalAura } = useMemo(
    () =>
      calculateMetabolicMapPosition({
        energyBalance,
        trainingLoad,
        sleepHours,
        glycemicInstability,
      }),
    [energyBalance, trainingLoad, sleepHours, glycemicInstability],
  );

  const baselineX = Number(baselineOffset?.x) || 0;
  const baselineY = Number(baselineOffset?.y) || 0;

  const shiftedX = useMemo(
    () => Math.max(-100, Math.min(100, x + baselineX)),
    [x, baselineX],
  );
  const shiftedY = useMemo(
    () => Math.max(-100, Math.min(100, y + baselineY)),
    [y, baselineY],
  );

  const { zone: effectiveZone, quadrant: effectiveQuadrant, distance: effectiveDistance } = useMemo(
    () => classifyMapPoint(shiftedX, shiftedY),
    [shiftedX, shiftedY],
  );

  const displayAura = finalAura;
  const displayX = shiftedX;
  const displayY = shiftedY;

  const anchorSvg = mapPointToSvgCoords(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY);

  const vectorDx = displayX - baselineX;
  const vectorDy = displayY - baselineY;
  const vectorLen = Math.hypot(vectorDx, vectorDy);
  const VECTOR_EPS = 0.02;

  const baselineHeadingDeg = useMemo(() => {
    if (vectorLen < VECTOR_EPS) return null;
    return (Math.atan2(vectorDx, vectorDy) * 180) / Math.PI;
  }, [vectorDx, vectorDy, vectorLen]);

  const arrowAngleDeg =
    baselineHeadingDeg != null
      ? baselineHeadingDeg
      : currentCompassAngle != null && Number.isFinite(Number(currentCompassAngle))
        ? Number(currentCompassAngle)
        : 0;

  const highAuraPulse = displayAura >= 45;

  const labelStyle = {
    position: 'absolute',
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.25,
    maxWidth: '42%',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const sleepReliabilityLine = sleepDataReliabilityText(realSleepDays, totalWindowDays);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
      }}
    >
      <style>
        {`
          @keyframes metabolicMapArrowGlowPulse {
            0%, 100% {
              filter: drop-shadow(0 0 5px rgba(255, 140, 110, 0.45)) drop-shadow(0 0 14px rgba(220, 70, 50, 0.25));
            }
            50% {
              filter: drop-shadow(0 0 10px rgba(255, 160, 130, 0.75)) drop-shadow(0 0 22px rgba(240, 90, 60, 0.4));
            }
          }
          .metabolic-map-arrow-pulse {
            animation: metabolicMapArrowGlowPulse 2.1s ease-in-out infinite;
          }
        `}
      </style>

      <div
        role="img"
        aria-label={`Mappa metabolica (${selectedTimeframe}): zona ${ZONE_LABELS[effectiveZone]}, quadrante ${QUADRANT_RISK_LABELS[effectiveQuadrant]}, distanza ${Math.round(effectiveDistance)}`}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 400,
          borderRadius: 16,
          overflow: 'hidden',
          background: buildMapBackground(),
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.45)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: buildGridBackground(),
            backgroundSize: buildGridSize(),
            backgroundPosition: buildGridPosition(),
            opacity: 0.35,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            marginLeft: -0.5,
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            marginTop: -0.5,
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 4,
            pointerEvents: 'none',
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
              <stop offset="45%" stopColor="rgba(140, 220, 255, 0.88)" />
              <stop offset="100%" stopColor="rgba(70, 170, 210, 0.75)" />
            </linearGradient>
            <filter id={glowFilterId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Blue Zone + fasce allarme (stroke coerenti con classifyMapPoint) */}
          <g aria-hidden>
            <circle
              cx={50}
              cy={50}
              r={BLUE_ZONE_SVG_R}
              fill="rgba(14, 165, 233, 0.15)"
              stroke="#0ea5e9"
              strokeWidth={0.45}
              vectorEffect="nonScalingStroke"
            />
            <circle
              cx={50}
              cy={50}
              r={35}
              fill="none"
              stroke="rgba(249, 115, 22, 0.42)"
              strokeWidth={0.35}
              vectorEffect="nonScalingStroke"
            />
            <circle
              cx={50}
              cy={50}
              r={50}
              fill="none"
              stroke="rgba(239, 68, 68, 0.38)"
              strokeWidth={0.3}
              vectorEffect="nonScalingStroke"
            />
          </g>

          {vectorLen >= VECTOR_EPS ? (
            <line
              x1={anchorSvg.cx}
              y1={anchorSvg.cy}
              x2={tipSvg.cx}
              y2={tipSvg.cy}
              stroke="rgba(14, 165, 233, 0.45)"
              strokeWidth={0.55}
              strokeDasharray="2.8 2.2"
              strokeLinecap="round"
              vectorEffect="nonScalingStroke"
            />
          ) : null}

          <circle
            cx={anchorSvg.cx}
            cy={anchorSvg.cy}
            r={3.6}
            fill="#0ea5e9"
            stroke="rgba(224, 242, 254, 0.95)"
            strokeWidth={0.35}
            filter={`url(#${glowFilterId})`}
            vectorEffect="nonScalingStroke"
          />

          <MetabolicMapCompassMarker
            {...tipSvg}
            angleDeg={arrowAngleDeg}
            gradientId={gradientId}
            highAura={highAuraPulse}
          />
        </svg>

        <span style={{ ...labelStyle, top: 8, left: 8, textAlign: 'left', zIndex: 5 }}>
          BURNOUT / CORTISOLO
        </span>
        <span style={{ ...labelStyle, top: 8, right: 8, textAlign: 'right', zIndex: 5 }}>
          INFIAMMAZIONE / BULK
        </span>
        <span style={{ ...labelStyle, bottom: 8, left: 8, textAlign: 'left', zIndex: 5 }}>
          DEPERIMENTO / CATABOLISMO
        </span>
        <span style={{ ...labelStyle, bottom: 8, right: 8, textAlign: 'right', zIndex: 5 }}>
          FEGATO GRASSO / INSULINA
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(20, 24, 28, 0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: '0.8125rem',
          lineHeight: 1.45,
          color: 'rgba(230, 235, 240, 0.92)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Zona attuale: {ZONE_LABELS[effectiveZone]} — Rischio: {QUADRANT_RISK_LABELS[effectiveQuadrant]}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(200, 208, 216, 0.75)' }}>
          Distanza dal centro: {effectiveDistance.toFixed(1)} · Aura glicemica: {Math.round(displayAura)}
        </div>
        {displayAura > 50 && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(120, 20, 28, 0.35)',
              border: '1px solid rgba(255, 80, 70, 0.45)',
              color: 'rgba(255, 160, 150, 0.98)',
              fontWeight: 600,
              fontSize: '0.78rem',
            }}
          >
            Allarme Infiammazione Glicemica in corso
          </div>
        )}
      </div>

      {sleepReliabilityLine && (
        <p
          style={{
            margin: '8px 0 0',
            padding: '0 2px',
            fontSize: 10,
            lineHeight: 1.35,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'rgba(230, 235, 242, 0.45)',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {sleepReliabilityLine}
        </p>
      )}
    </div>
  );
}
