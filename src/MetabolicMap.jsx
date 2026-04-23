import React, { useId, useMemo, useRef, useState } from 'react';
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

/**
 * Longevity Score (1–100) da coordinate mappa (−100…100): r = distanza SVG dal centro (50,50).
 */
export function calculateMetabolicScore(mapX, mapY) {
  const { cx, cy } = mapPointToSvgCoords(clampMapAxis(mapX), clampMapAxis(mapY));
  const r = Math.hypot(cx - 50, cy - 50);
  let raw;
  if (r <= 40) {
    raw = 100 - (r / 40) * 90;
  } else {
    raw = 10 - ((r - 40) / 10) * 9;
  }
  const rounded = Math.round(raw);
  return Math.min(100, Math.max(1, rounded));
}

/** Raggio SVG (centro 50,50) per un dato Longevity Score (solo ramo r ≤ 40, score ≥ 10). */
function svgRadiusForMetabolicScore(score) {
  const s = Math.min(100, Math.max(10, score));
  return ((100 - s) / 90) * 40;
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
  /** Punto finale = Ancora (baselineOffset): stesse coordinate del cerchio principale, nessun drift. */
  const anchor = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const trailSvgPoints = [...historicDots, { cx: anchor.cx, cy: anchor.cy }];
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

/** Anelli di riferimento Longevity Score (solo etichette su archi con score ≥ 10 → r ≤ 40). */
const LONGEVITY_SCORE_RING_LEVELS = [80, 60, 40, 20];

/** Centro mappa / “Blue Zone” in unità SVG (viewBox). */
const MAP_CENTER_SVG = { cx: 50, cy: 50 };

/** Raggio Ancora principale (viewBox) — marker storici usano lo stesso raggio, senza glow. */
const ANCHOR_CIRCLE_R = 3.6;

/** Ciano/grigio spento per i punti storici (l’Ancora resta col brillante). */
const HISTORIC_TRAIL_DOT_FILL = 'rgb(100, 155, 168)';

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

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.12;
const ZONE_GRADIENTS = {
  blue: ['#4b5d74', '#46596f', '#42556a', '#3d5165', '#394d60', '#35485a', '#304455', '#2c4050', '#283c4a', '#243845'],
  green: ['#4f665f', '#4b625b', '#475d56', '#435952', '#3f554e', '#3b5049', '#364c45', '#334841', '#2f433c', '#2b3f38'],
  orange: ['#6b5a4e', '#67574b', '#635347', '#5f5044', '#5b4d41', '#57493d', '#53463a', '#4f4337', '#4b3f33', '#473c30'],
  red: ['#6c5056', '#684d53', '#644950', '#60464d', '#5c4349', '#583f46', '#543c43', '#503940', '#4c353c', '#483239'],
};

function clampZoom(v) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
  });
}

function colorFromZoneArray(zone, t) {
  const arr = ZONE_GRADIENTS[zone] || ZONE_GRADIENTS.blue;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.round(t * (arr.length - 1))));
  return arr[idx];
}

export function getColorFromValue(value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  if (v >= 82) {
    const t = (v - 82) / 18;
    return colorFromZoneArray('blue', t);
  }
  if (v >= 62) {
    const t = (v - 62) / 20;
    return mixHex(colorFromZoneArray('green', 1), colorFromZoneArray('blue', 0), t);
  }
  if (v >= 40) {
    const t = (v - 40) / 22;
    return mixHex(colorFromZoneArray('orange', 1), colorFromZoneArray('green', 0), t);
  }
  const t = v / 40;
  return mixHex(colorFromZoneArray('red', 1), colorFromZoneArray('orange', 0), t);
}

const QUADRANT_RISK_LABELS = {
  NW: 'BURNOUT / CORTISOLO',
  NE: 'INFIAMMAZIONE / BULK',
  SW: 'DEPERIMENTO / CATABOLISMO',
  SE: 'FEGATO GRASSO / INSULINA',
};

function buildMapBackground() {
  const b0 = ZONE_GRADIENTS.blue[1];
  const b1 = ZONE_GRADIENTS.blue[7];
  const g = ZONE_GRADIENTS.green[6];
  const o = ZONE_GRADIENTS.orange[6];
  const r = ZONE_GRADIENTS.red[7];
  return `radial-gradient(circle at 50% 50%,
    ${b0} 0%,
    ${b1} 26%,
    ${g} 46%,
    ${o} 68%,
    ${r} 100%
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
  showHistoricTrail: showHistoricTrailProp = undefined,
  onToggleHistoricTrail = null,
  showHistoricTrailControl = true,
  zoomLevel: zoomLevelProp = undefined,
  onZoomLevelChange = null,
}) {
  const uid = useId().replace(/:/g, '');
  const glowFilterId = `${uid}-anchor-glow`;
  const reduceMotion = useReducedMotion();
  const vectorTransition = reduceMotion ? { duration: 0 } : VECTOR_MOTION_TRANSITION;
  const [showHistoricTrailLocal, setShowHistoricTrailLocal] = useState(false);
  const [zoomLevelLocal, setZoomLevelLocal] = useState(1);
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });
  const showHistoricTrail = typeof showHistoricTrailProp === 'boolean'
    ? showHistoricTrailProp
    : showHistoricTrailLocal;
  const toggleHistoricTrail = () => {
    if (typeof onToggleHistoricTrail === 'function') {
      onToggleHistoricTrail(!showHistoricTrail);
      return;
    }
    setShowHistoricTrailLocal((v) => !v);
  };
  const zoomLevel = typeof zoomLevelProp === 'number' ? clampZoom(zoomLevelProp) : zoomLevelLocal;
  const setZoomLevel = (nextZoom) => {
    const clamped = clampZoom(nextZoom);
    if (typeof onZoomLevelChange === 'function') onZoomLevelChange(clamped);
    else setZoomLevelLocal(clamped);
  };

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

  const longevityScoreAnchor = calculateMetabolicScore(baselineX, baselineY);
  const longevityScoreFinal = calculateMetabolicScore(displayX, displayY);
  const surplusCaloricMap =
    distTarget > distAnchor + 1e-6 ? longevityScoreAnchor - longevityScoreFinal : 0;
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
    fontWeight: 500,
    letterSpacing: '0.04em',
    color: 'rgba(226,232,240,0.36)',
    lineHeight: 1.25,
    maxWidth: '42%',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const sleepReliabilityLine = sleepDataReliabilityText(realSleepDays, totalWindowDays);
  const dynamicCompassBorder = getColorFromValue(longevityScoreFinal);
  const radarRingRadii = useMemo(
    () => Array.from({ length: 10 }, (_, i) => 5 + i * 4.5),
    []
  );

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
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.45), 0 0 18px ${dynamicCompassBorder}44`,
          touchAction: 'none',
        }}
        onTouchStart={(e) => {
          if (e.touches.length !== 2) return;
          const [a, b] = [e.touches[0], e.touches[1]];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          pinchRef.current = { active: true, startDist: dist, startZoom: zoomLevel };
        }}
        onTouchMove={(e) => {
          if (!pinchRef.current.active || e.touches.length !== 2) return;
          const [a, b] = [e.touches[0], e.touches[1]];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const ratio = dist / Math.max(1, pinchRef.current.startDist);
          const targetZoom = pinchRef.current.startZoom * ratio;
          // Smooth pinch easing to avoid abrupt zoom jumps.
          setZoomLevel(lerp(zoomLevel, targetZoom, 0.26));
        }}
        onTouchEnd={() => {
          pinchRef.current.active = false;
        }}
      >
        {showHistoricTrailControl && historicTrail.canToggle ? (
          <button
            type="button"
            aria-pressed={showHistoricTrail}
            title={showHistoricTrail ? 'Nascondi rotta storica' : 'Mostra rotta storica'}
            onClick={toggleHistoricTrail}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px 4px 8px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.22)',
              background: showHistoricTrail
                ? 'rgba(14, 165, 233, 0.28)'
                : 'rgba(0, 0, 0, 0.5)',
              color: 'rgba(241, 245, 249, 0.95)',
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              maxWidth: 'calc(50% - 16px)',
            }}
          >
            <span style={{ fontSize: '0.75rem', lineHeight: 1 }} aria-hidden>
              🧭
            </span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {showHistoricTrail ? 'Rotta on' : 'Rotta'}
            </span>
          </button>
        ) : null}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${zoomLevel})`,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: buildGridBackground(),
              backgroundSize: buildGridSize(),
              backgroundPosition: buildGridPosition(),
              opacity: 0.22,
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 50%, rgba(6,10,16,0.02) 38%, rgba(4,7,12,0.22) 72%, rgba(2,4,8,0.42) 100%)',
            pointerEvents: 'none',
            zIndex: 1,
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
            transform: `scale(${zoomLevel})`,
            transformOrigin: '50% 50%',
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

          {/* Radar rings + multi-gradient zones */}
          <g aria-hidden>
            {radarRingRadii.map((ringR, idx) => {
              const pseudoScore = Math.max(1, Math.min(100, 100 - idx * 8.5));
              const ringColor = getColorFromValue(pseudoScore);
              return (
                <circle
                  key={`radar-ring-${idx}`}
                  cx={50}
                  cy={50}
                  r={ringR}
                  fill={idx === 0 ? 'rgba(14,165,233,0.08)' : 'none'}
                  stroke={ringColor}
                  strokeWidth={idx % 2 === 0 ? 0.28 : 0.22}
                  strokeOpacity={idx < 3 ? 0.08 : 0.05}
                  vectorEffect="nonScalingStroke"
                />
              );
            })}
            {LONGEVITY_SCORE_RING_LEVELS.map((level) => {
              const ringR = svgRadiusForMetabolicScore(level);
              return (
                <g key={`longevity-ring-${level}`}>
                  <circle
                    cx={50}
                    cy={50}
                    r={ringR}
                    fill="none"
                    stroke={getColorFromValue(level)}
                    strokeWidth={0.24}
                    strokeDasharray="0.9 2.2"
                    strokeOpacity={0.22}
                    vectorEffect="nonScalingStroke"
                  />
                  <text
                    x={50}
                    y={50 - ringR - 0.5}
                    textAnchor="middle"
                    fill="rgba(226, 232, 240, 0.26)"
                    fontSize={8}
                    fontWeight={500}
                    style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' }}
                  >
                    {level}
                  </text>
                </g>
              );
            })}
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
              {historicTrail.historicDots.map((p, index) => {
                const n = historicTrail.historicDots.length;
                const denom = Math.max(1, n - 1);
                const opacity = 0.1 + 0.4 * (index / denom);
                return (
                  <circle
                    key={`historic-${index}-${p.cx}-${p.cy}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={ANCHOR_CIRCLE_R}
                    fill={HISTORIC_TRAIL_DOT_FILL}
                    opacity={opacity}
                    stroke="none"
                    vectorEffect="nonScalingStroke"
                  />
                );
              })}
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
                r={ANCHOR_CIRCLE_R}
                cx={0}
                cy={0}
                fill={mixHex(dynamicCompassBorder, '#dbeafe', 0.55)}
                stroke={dynamicCompassBorder}
                strokeWidth={0.42}
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
        <div
          style={{
            fontSize: '0.78rem',
            color: 'rgba(200, 208, 216, 0.88)',
            marginBottom: 6,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 14px',
          }}
        >
          <span>
            Longevity Score (Ancora):{' '}
            <strong style={{ color: '#e2e8f0' }}>{longevityScoreAnchor}</strong>
          </span>
          <span>
            Longevity Score (Posizione finale):{' '}
            <strong style={{ color: '#e2e8f0' }}>{longevityScoreFinal}</strong>
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(200, 208, 216, 0.75)' }}>
          Distanza dal centro: {effectiveDistance.toFixed(1)} · Aura glicemica: {Math.round(displayAura)}
        </div>
        {surplusCaloricMap > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(120, 45, 25, 0.35)',
              border: '1px solid rgba(248, 113, 113, 0.45)',
              color: 'rgba(254, 202, 165, 0.98)',
              fontWeight: 600,
              fontSize: '0.78rem',
            }}
          >
            Surplus calorico (mappa): la posizione finale è più lontana dal centro dell’Ancora — calo di
            Longevity Score potenziale fino a ~{surplusCaloricMap} punti rispetto all’Ancora.
          </div>
        )}
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
