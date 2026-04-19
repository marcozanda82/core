import React, { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { calculateMetabolicMapPosition, calculateBaselineOffset } from './metabolicMapEngine';
import { biometricsToMapBaselineInput } from './biometricHistory';

/** viewBox 0–100: stesso sistema di posizionamento del marker (50 ± x/2, 50 ∓ y/2). */
function mapPointToSvgCoords(x, y) {
  return { cx: 50 + x / 2, cy: 50 - y / 2 };
}

/** Stesso range della mappa (−100…100) usato per i punti storici e per l’Ancora. */
function clampMapAxis(value) {
  return Math.max(-100, Math.min(100, value));
}

/** Coordinate SVG dell’Ancora da baselineOffset (allineate allo storico). */
function baselineOffsetToAnchorSvg(baselineX, baselineY) {
  return mapPointToSvgCoords(clampMapAxis(baselineX), clampMapAxis(baselineY));
}

function bodyMetricEntrySortTime(entry) {
  if (entry?.date && typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    return new Date(`${entry.date}T12:00:00`).getTime();
  }
  const ts = Number(entry?.timestamp);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Percorso baseline (x,y mappa) dalle pesate → fino all’ancora corrente, in coordinate SVG viewBox.
 */
function buildHistoricBaselineTrailSvg(bodyMetricsHistory, baselineX, baselineY) {
  const arr = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  if (arr.length === 0) {
    return { polylinePoints: '', historicDots: [], lastSolidConnector: null, canToggle: false };
  }
  const sorted = [...arr].sort((a, b) => bodyMetricEntrySortTime(a) - bodyMetricEntrySortTime(b));
  const historicDots = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const inp = biometricsToMapBaselineInput(sorted[i]);
    if (!inp) continue;
    const { x, y } = calculateBaselineOffset(inp);
    historicDots.push(mapPointToSvgCoords(clampMapAxis(x), clampMapAxis(y)));
  }
  if (historicDots.length === 0) {
    return { polylinePoints: '', historicDots: [], lastSolidConnector: null, canToggle: false };
  }
  const anchor = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const trailSvgPoints = [...historicDots];
  trailSvgPoints.push(anchor);
  const lastHistoric = historicDots[historicDots.length - 1];
  const lastSolidConnector =
    lastHistoric.cx === anchor.cx && lastHistoric.cy === anchor.cy
      ? null
      : { x1: lastHistoric.cx, y1: lastHistoric.cy, x2: anchor.cx, y2: anchor.cy };
  return {
    polylinePoints: trailSvgPoints.map((p) => `${p.cx},${p.cy}`).join(' '),
    historicDots,
    lastSolidConnector,
    canToggle: true,
  };
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

/** Centro mappa / “Blue Zone” in unità SVG (viewBox). */
const MAP_CENTER_SVG = { cx: 50, cy: 50 };

/** Sotto questa lunghezza (spazio mappa −100…100) il vettore stile di vita si considera “quasi nullo”: ago verso il centro, più tenue. */
const LIFESTYLE_VECTOR_IDLE_THRESHOLD = 4;

/** Lunghezza lama ago (viewBox) quando il vettore stile di vita è quasi nullo. */
const NEEDLE_BLADE_LEN_IDLE = 3.2;

/** Estremi lama ago (viewBox) in funzione della magnitudo anchor → target (spazio mappa). */
const NEEDLE_BLADE_LEN_MIN = 4;
const NEEDLE_BLADE_LEN_MAX = 12.5;

/** Valore di riferimento magnitudo (spazio mappa −100…100) per allungare l’ago al massimo. */
const LIFESTYLE_LEN_FOR_FULL_NEEDLE = 95;

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

function sleepDataReliabilityText(realSleepDays, totalWindowDays) {
  if (totalWindowDays <= 0) return null;
  if (realSleepDays >= totalWindowDays) return null;
  if (realSleepDays <= 0) {
    return 'Dati sonno non rilevati (utilizzata stima 8h)';
  }
  return `Affidabilità dati sonno: ${realSleepDays}/${totalWindowDays} giorni registrati`;
}

/**
 * Angolo (gradi) tra Ancora e punto finale nello spazio mappa (asse Y metabolico verso l’alto).
 * Equivale a atan2(dy_svg, dx_svg) dopo mapPointToSvgCoords.
 */
function compassAngleDegMapSpace(shiftedX, shiftedY, baselineX, baselineY) {
  return (
    Math.atan2(shiftedY - baselineY, shiftedX - baselineX) * (180 / Math.PI)
  );
}

/**
 * Rotazione (gradi) per un ago che in stato base punta verso −Y (nord schermo).
 * Allinea la punta alla direzione anchor → target nello spazio SVG.
 */
function needleRotationDegSvg(targetSvg, anchorSvg) {
  const baseDeg =
    (Math.atan2(
      targetSvg.cy - anchorSvg.cy,
      targetSvg.cx - anchorSvg.cx,
    ) *
      180) /
    Math.PI;
  return baseDeg + 90;
}

/**
 * Mappa metabolica: ancora + mini-bussola sull’ancora + vettore stile di vita.
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
  bodyMetricsHistory = null,
}) {
  const uid = useId().replace(/:/g, '');
  const glowFilterId = `${uid}-anchor-glow`;
  const reduceMotion = useReducedMotion();
  const vectorTransition = reduceMotion ? { duration: 0 } : VECTOR_MOTION_TRANSITION;
  const [showHistoricTrail, setShowHistoricTrail] = useState(false);

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

  const anchorSvg = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY);

  const historicTrail = useMemo(
    () => buildHistoricBaselineTrailSvg(bodyMetricsHistory, baselineX, baselineY),
    [bodyMetricsHistory, baselineX, baselineY],
  );

  const lifestyleDx = shiftedX - baselineX;
  const lifestyleDy = shiftedY - baselineY;
  const lifestyleLen = Math.hypot(lifestyleDx, lifestyleDy);
  const lifestyleNearlyIdle = lifestyleLen < LIFESTYLE_VECTOR_IDLE_THRESHOLD;

  /** Angolo (gradi) tra Ancora e punto finale nello spazio mappa — Fase 1 richiesta. */
  const angleMapDeg = compassAngleDegMapSpace(shiftedX, shiftedY, baselineX, baselineY);

  const needleRotateDeg = lifestyleNearlyIdle
    ? needleRotationDegSvg(MAP_CENTER_SVG, anchorSvg)
    : needleRotationDegSvg(tipSvg, anchorSvg);
  const needleBladeOpacity = lifestyleNearlyIdle ? 0.38 : 0.96;

  const distAnchor = Math.hypot(
    anchorSvg.cx - MAP_CENTER_SVG.cx,
    anchorSvg.cy - MAP_CENTER_SVG.cy,
  );
  const distTarget = Math.hypot(
    tipSvg.cx - MAP_CENTER_SVG.cx,
    tipSvg.cy - MAP_CENTER_SVG.cy,
  );
  const needleFill =
    distTarget > distAnchor ? 'rgba(255, 60, 60, 0.9)' : 'rgba(0, 200, 255, 0.9)';

  const needleBladeLen = useMemo(() => {
    if (lifestyleNearlyIdle) return NEEDLE_BLADE_LEN_IDLE;
    const t = Math.min(1, lifestyleLen / LIFESTYLE_LEN_FOR_FULL_NEEDLE);
    return NEEDLE_BLADE_LEN_MIN + t * (NEEDLE_BLADE_LEN_MAX - NEEDLE_BLADE_LEN_MIN);
  }, [lifestyleNearlyIdle, lifestyleLen]);

  const needlePolygonPoints = useMemo(() => {
    const halfW = Math.min(0.62, 0.28 + needleBladeLen * 0.035);
    const baseY = 0.55;
    return `0,-${needleBladeLen} ${halfW},${baseY} -${halfW},${baseY}`;
  }, [needleBladeLen]);

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
      {historicTrail.canToggle && (
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setShowHistoricTrail((v) => !v)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: showHistoricTrail ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: 'rgba(230,235,242,0.88)',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {showHistoricTrail ? 'Nascondi rotta storica' : 'Mostra rotta storica'}
          </button>
        </div>
      )}
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
          </defs>

          {/* Blue Zone + fasce allarme */}
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

          {showHistoricTrail && historicTrail.polylinePoints ? (
            <g aria-hidden>
              <polyline
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={0.5}
                strokeDasharray="1.4 2.4"
                vectorEffect="nonScalingStroke"
                points={historicTrail.polylinePoints}
              />
              {historicTrail.lastSolidConnector ? (
                <line
                  x1={historicTrail.lastSolidConnector.x1}
                  y1={historicTrail.lastSolidConnector.y1}
                  x2={historicTrail.lastSolidConnector.x2}
                  y2={historicTrail.lastSolidConnector.y2}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={0.5}
                  vectorEffect="nonScalingStroke"
                />
              ) : null}
              {historicTrail.historicDots.map((p, i) => (
                <circle key={i} cx={p.cx} cy={p.cy} r={0.55} fill="rgba(160, 164, 175, 0.85)" />
              ))}
            </g>
          ) : null}

          <motion.g
            initial={{ x: anchorSvg.cx, y: anchorSvg.cy }}
            animate={{ x: anchorSvg.cx, y: anchorSvg.cy }}
            transition={vectorTransition}
            style={{ transformOrigin: '0px 0px' }}
            data-compass-angle-map-deg={Math.round(angleMapDeg * 10) / 10}
          >
            <motion.g animate={{ rotate: needleRotateDeg }} transition={vectorTransition}>
              <circle
                r={3.6}
                cx={0}
                cy={0}
                fill="#0ea5e9"
                stroke="rgba(224, 242, 254, 0.95)"
                strokeWidth={0.35}
                filter={`url(#${glowFilterId})`}
                vectorEffect="nonScalingStroke"
              />
              <motion.polygon
                points={needlePolygonPoints}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={0.12}
                vectorEffect="nonScalingStroke"
                animate={{ fill: needleFill, opacity: needleBladeOpacity }}
                transition={vectorTransition}
              />
            </motion.g>
          </motion.g>
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
