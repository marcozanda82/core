import React, { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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

/** Lunghezza minima del segmento in unità SVG (viewBox 0–100) sotto cui il vettore è nascosto (~2px sul rendering tipico). */
const VECTOR_HIDE_LEN_SVG = 2;

const VECTOR_MOTION_TRANSITION = { duration: 0.5, ease: [0.4, 0, 0.2, 1] };

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
 * Vettore: ancora strutturale + raggio con punta SVG (marker), orientamento automatico.
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
}) {
  const uid = useId().replace(/:/g, '');
  const glowFilterId = `${uid}-anchor-glow`;
  const markerArrowId = `kentu-arrowhead-${uid}`;
  const reduceMotion = useReducedMotion();
  const vectorTransition = reduceMotion ? { duration: 0 } : VECTOR_MOTION_TRANSITION;
  const vectorCssTransition = reduceMotion
    ? 'none'
    : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';

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

  const svgVecLen = Math.hypot(tipSvg.cx - anchorSvg.cx, tipSvg.cy - anchorSvg.cy);
  const showVector = svgVecLen >= VECTOR_HIDE_LEN_SVG;

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
            <filter id={glowFilterId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id={markerArrowId}
              markerWidth={6}
              markerHeight={6}
              refX={5}
              refY={3}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 6 3, 0 6" fill="rgba(255,255,255,0.9)" />
            </marker>
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

          {showVector ? (
            <motion.line
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth={2}
              strokeLinecap="round"
              markerEnd={`url(#${markerArrowId})`}
              vectorEffect="nonScalingStroke"
              style={{ transition: vectorCssTransition }}
              animate={{
                x1: anchorSvg.cx,
                y1: anchorSvg.cy,
                x2: tipSvg.cx,
                y2: tipSvg.cy,
              }}
              transition={vectorTransition}
            />
          ) : null}

          <motion.circle
            r={3.6}
            fill="#0ea5e9"
            stroke="rgba(224, 242, 254, 0.95)"
            strokeWidth={0.35}
            filter={`url(#${glowFilterId})`}
            vectorEffect="nonScalingStroke"
            style={{ transition: vectorCssTransition }}
            animate={{ cx: anchorSvg.cx, cy: anchorSvg.cy }}
            transition={vectorTransition}
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
