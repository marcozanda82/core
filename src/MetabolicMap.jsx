import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { calculateMetabolicMapPosition } from './metabolicMapEngine';

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

/** Raggio Ancora (viewBox) — marker storici usano lo stesso raggio, senza glow. */
const ANCHOR_CIRCLE_R = 3.5;

/** Punti storici: poco contrasto, non competono con posizione attuale. */
const HISTORIC_TRAIL_DOT_FILL = 'rgb(82, 102, 112)';

/** Sotto questa lunghezza (spazio mappa −100…100) il vettore stile di vita si considera “quasi nullo”: ago verso il centro, più tenue. */
const LIFESTYLE_VECTOR_IDLE_THRESHOLD = 4;

/** Lunghezza lama ago (viewBox) quando il vettore stile di vita è quasi nullo. */
const NEEDLE_BLADE_LEN_IDLE = 3.2;

/** Estremi lama ago (viewBox) in funzione della magnitudo anchor → target (spazio mappa). */
const NEEDLE_BLADE_LEN_MIN = 4;
const NEEDLE_BLADE_LEN_MAX = 12.5;
const NEEDLE_TRAIL_LEN_MIN = 0.4;
const NEEDLE_TRAIL_LEN_MAX = 1.8;

/** Valore di riferimento magnitudo (spazio mappa −100…100) per allungare l’ago al massimo. */
const LIFESTYLE_LEN_FOR_FULL_NEEDLE = 95;

const VECTOR_MOTION_TRANSITION = { duration: 0.32, ease: 'linear' };

const ZONE_LABELS = {
  green: 'Blue Zone (Longevità)',
  orange: 'Arancione (Adattamento)',
  red: 'Rossa (Pericolo)',
};

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.5;
/** Palette desaturata: blu = ottimale, verde = transizione, arancio = attenzione, rosso = critico. */
const ZONE_GRADIENTS = {
  blue: [
    '#2a343f', '#28333d', '#26323a', '#243138', '#223036',
    '#202f33', '#1e2e31', '#1c2d2f', '#1a2c2c', '#182a2a',
  ],
  green: [
    '#28393a', '#263738', '#243536', '#223334', '#203132',
    '#1e2f30', '#1c2d2e', '#1a2b2c', '#18292a', '#162828',
  ],
  orange: [
    '#332e2c', '#312c2a', '#2f2a28', '#2d2826', '#2b2624',
    '#292422', '#272220', '#25201e', '#231e1c', '#211c1a',
  ],
  red: [
    '#332d2f', '#312b2d', '#2f292b', '#2d2729', '#2b2527',
    '#292325', '#272123', '#251f21', '#231d1f', '#211b1d',
  ],
};

/** Morbidezza follow pinch (più alto = meno scatti). */
const ZOOM_PINCH_SMOOTH = 0.28;
const ZOOM_WHEEL_STEP = 0.018;

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
  const b0 = ZONE_GRADIENTS.blue[0];
  const b1 = ZONE_GRADIENTS.blue[4];
  const g0 = ZONE_GRADIENTS.green[3];
  const o0 = ZONE_GRADIENTS.orange[3];
  const r0 = ZONE_GRADIENTS.red[3];
  return `radial-gradient(circle at 50% 50%,
    ${b0} 0%,
    ${b1} 24%,
    ${g0} 42%,
    ${o0} 64%,
    ${r0} 100%
  )`;
}

/** Profondità: centro più leggibile, bordi leggermente oscurati. */
function buildVignetteOverlay() {
  return 'radial-gradient(circle at 50% 50%, rgba(5,6,8,0) 0%, rgba(5,6,8,0) 38%, rgba(0,0,0,0.16) 72%, rgba(0,0,0,0.48) 100%)';
}

function buildGridBackground() {
  return `
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
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

function rotationDegFromDirection(dirX, dirY) {
  const baseDeg = (Math.atan2(dirY, dirX) * 180) / Math.PI;
  return baseDeg + 90;
}

function chaikinSmooth(points, iterations = 2) {
  let arr = Array.isArray(points) ? points.slice() : [];
  if (arr.length < 3) return arr;
  for (let k = 0; k < iterations; k += 1) {
    const next = [arr[0]];
    for (let i = 0; i < arr.length - 1; i += 1) {
      const p0 = arr[i];
      const p1 = arr[i + 1];
      next.push(
        { cx: p0.cx * 0.75 + p1.cx * 0.25, cy: p0.cy * 0.75 + p1.cy * 0.25 },
        { cx: p0.cx * 0.25 + p1.cx * 0.75, cy: p0.cy * 0.25 + p1.cy * 0.75 },
      );
    }
    next.push(arr[arr.length - 1]);
    arr = next;
  }
  return arr;
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
  zoomLevel: zoomLevelProp = undefined,
  onZoomLevelChange = null,
  dailyPositions = null,
  currentPosition = null,
  projectedPosition = null,
  trajectoryVelocity = 0,
}) {
  const uid = useId().replace(/:/g, '');
  const glowFilterId = `${uid}-anchor-glow`;
  const reduceMotion = useReducedMotion();
  const vectorTransition = reduceMotion ? { duration: 0 } : VECTOR_MOTION_TRANSITION;
  const [zoomLevelLocal, setZoomLevelLocal] = useState(1);
  const [inertialTipSvg, setInertialTipSvg] = useState(MAP_CENTER_SVG);
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });
  const targetTipRef = useRef(MAP_CENTER_SVG);
  const inertiaVelRef = useRef(0.04);
  const zoomLevel = typeof zoomLevelProp === 'number' ? clampZoom(zoomLevelProp) : zoomLevelLocal;
  const setZoomLevel = (nextZoom) => {
    const resolved = typeof nextZoom === 'function' ? nextZoom(zoomLevel) : nextZoom;
    const clamped = clampZoom(resolved);
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
  const displayX = Number.isFinite(Number(currentPosition?.x)) ? Number(currentPosition.x) : shiftedX;
  const displayY = Number.isFinite(Number(currentPosition?.y)) ? Number(currentPosition.y) : shiftedY;

  const anchorSvg = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY);
  const movementVelocity = useMemo(() => {
    const speed = Number.isFinite(Number(trajectoryVelocity)) ? Number(trajectoryVelocity) : 0;
    const t = Math.max(0, Math.min(1, speed / 9));
    return 0.02 + t * 0.06; // 0.02–0.08
  }, [trajectoryVelocity]);
  useEffect(() => {
    targetTipRef.current = tipSvg;
    inertiaVelRef.current = movementVelocity;
  }, [tipSvg, movementVelocity]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setInertialTipSvg((prev) => {
        const target = targetTipRef.current || prev;
        const v = Math.max(0.02, Math.min(0.08, Number(inertiaVelRef.current) || 0.04));
        return {
          cx: prev.cx + (target.cx - prev.cx) * v,
          cy: prev.cy + (target.cy - prev.cy) * v,
        };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const lifestyleDx = shiftedX - baselineX;
  const lifestyleDy = shiftedY - baselineY;
  const trajectorySpeed = Number.isFinite(Number(trajectoryVelocity)) ? Number(trajectoryVelocity) : 0;
  const lifestyleLen = Math.max(Math.hypot(lifestyleDx, lifestyleDy), trajectorySpeed);
  const lifestyleNearlyIdle = lifestyleLen < LIFESTYLE_VECTOR_IDLE_THRESHOLD;

  /** Angolo (gradi) tra Ancora e punto finale nello spazio mappa — Fase 1 richiesta. */
  const angleMapDeg = compassAngleDegMapSpace(shiftedX, shiftedY, baselineX, baselineY);

  const projectedSvg = useMemo(() => {
    if (!projectedPosition) return null;
    return mapPointToSvgCoords(clampMapAxis(projectedPosition.x), clampMapAxis(projectedPosition.y));
  }, [projectedPosition]);
  const directionVector = useMemo(() => {
    const target = projectedSvg || inertialTipSvg;
    const dx = (target?.cx ?? inertialTipSvg.cx) - inertialTipSvg.cx;
    const dy = (target?.cy ?? inertialTipSvg.cy) - inertialTipSvg.cy;
    const mag = Math.hypot(dx, dy);
    if (mag < 1e-6) return { x: 0, y: -1, mag: 0 };
    return { x: dx / mag, y: dy / mag, mag };
  }, [projectedSvg, inertialTipSvg.cx, inertialTipSvg.cy]);
  const needleRotateDeg = rotationDegFromDirection(directionVector.x, directionVector.y);
  const needleBladeOpacity = lifestyleNearlyIdle ? 0.32 : 0.86;

  const distAnchor = Math.hypot(
    anchorSvg.cx - MAP_CENTER_SVG.cx,
    anchorSvg.cy - MAP_CENTER_SVG.cy,
  );
  const distTarget = Math.hypot(
    inertialTipSvg.cx - MAP_CENTER_SVG.cx,
    inertialTipSvg.cy - MAP_CENTER_SVG.cy,
  );

  const longevityScoreAnchor = calculateMetabolicScore(baselineX, baselineY);
  const longevityScoreFinal = calculateMetabolicScore(displayX, displayY);
  const surplusCaloricMap =
    distTarget > distAnchor + 1e-6 ? longevityScoreAnchor - longevityScoreFinal : 0;
  const needleFill =
    distTarget > distAnchor
      ? 'rgba(150, 95, 100, 0.78)'
      : 'rgba(100, 140, 158, 0.82)';

  const needleBladeLen = useMemo(() => {
    if (lifestyleNearlyIdle) return NEEDLE_BLADE_LEN_IDLE;
    const t = Math.min(1, lifestyleLen / LIFESTYLE_LEN_FOR_FULL_NEEDLE);
    return NEEDLE_BLADE_LEN_MIN + t * (NEEDLE_BLADE_LEN_MAX - NEEDLE_BLADE_LEN_MIN);
  }, [lifestyleNearlyIdle, lifestyleLen]);
  const trailLen = useMemo(() => {
    if (lifestyleNearlyIdle) return NEEDLE_TRAIL_LEN_MIN;
    const t = Math.min(1, lifestyleLen / LIFESTYLE_LEN_FOR_FULL_NEEDLE);
    return NEEDLE_TRAIL_LEN_MIN + t * (NEEDLE_TRAIL_LEN_MAX - NEEDLE_TRAIL_LEN_MIN);
  }, [lifestyleNearlyIdle, lifestyleLen]);
  const trailOpacity = useMemo(() => {
    if (lifestyleNearlyIdle) return 0.08;
    const t = Math.min(1, lifestyleLen / LIFESTYLE_LEN_FOR_FULL_NEEDLE);
    return 0.1 + t * 0.1;
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
    color: 'rgba(200, 210, 220, 0.17)',
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
  const activeRingRadius = useMemo(() => {
    if (!radarRingRadii.length) return null;
    let best = radarRingRadii[0];
    let bestDiff = Math.abs(best - distTarget);
    for (let i = 1; i < radarRingRadii.length; i += 1) {
      const rr = radarRingRadii[i];
      const diff = Math.abs(rr - distTarget);
      if (diff < bestDiff) {
        best = rr;
        bestDiff = diff;
      }
    }
    return best;
  }, [radarRingRadii, distTarget]);
  const projectedLineEnd = useMemo(() => {
    if (!projectedSvg) return null;
    const mag = directionVector.mag;
    // Noise filter: micro spostamenti non aggiornano la traiettoria futura.
    if (mag < 0.9) return null;
    const speedFactor = Math.max(0.65, Math.min(1.35, 0.75 + trajectorySpeed / 10));
    const length = mag * speedFactor;
    return {
      x: inertialTipSvg.cx + directionVector.x * length,
      y: inertialTipSvg.cy + directionVector.y * length,
    };
  }, [projectedSvg, inertialTipSvg.cx, inertialTipSvg.cy, trajectorySpeed, directionVector]);
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
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5), 0 0 14px ${dynamicCompassBorder}1a`,
          touchAction: 'none',
        }}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setZoomLevel((z) => clampZoom(z - e.deltaY * ZOOM_WHEEL_STEP));
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
          setZoomLevel((z) => clampZoom(lerp(z, targetZoom, ZOOM_PINCH_SMOOTH)));
        }}
        onTouchEnd={() => {
          pinchRef.current.active = false;
        }}
      >
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
              opacity: 0.04,
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: buildVignetteOverlay(),
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
            background: 'rgba(255,255,255,0.045)',
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
            background: 'rgba(255,255,255,0.045)',
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
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-ring-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
            </filter>
            <filter id={`${uid}-future-blur`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" />
            </filter>
            <filter id={`${uid}-trail-soft`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.24" />
            </filter>
            <linearGradient id={`${uid}-trail-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgba(236,244,252,${Math.min(0.2, trailOpacity + 0.05)})`} />
              <stop offset="100%" stopColor="rgba(236,244,252,0.02)" />
            </linearGradient>
          </defs>

          {/* Radar rings + multi-gradient zones */}
          <g aria-hidden>
            {radarRingRadii.map((ringR, idx) => {
              const ringStroke = idx % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.042)';
              return (
                <circle
                  key={`radar-ring-${idx}`}
                  cx={50}
                  cy={50}
                  r={ringR}
                  fill={idx === 0 ? 'rgba(32, 42, 52, 0.04)' : 'none'}
                  stroke={ringStroke}
                  strokeWidth={0.18}
                  vectorEffect="nonScalingStroke"
                />
              );
            })}
            {activeRingRadius != null ? (
              <circle
                cx={50}
                cy={50}
                r={activeRingRadius}
                fill="none"
                stroke="rgba(225,235,245,0.22)"
                strokeWidth={0.28}
                filter={`url(#${uid}-ring-glow)`}
                vectorEffect="nonScalingStroke"
              />
            ) : null}
            {LONGEVITY_SCORE_RING_LEVELS.map((level) => {
              const ringR = svgRadiusForMetabolicScore(level);
              return (
                <g key={`longevity-ring-${level}`}>
                  <circle
                    cx={50}
                    cy={50}
                    r={ringR}
                    fill="none"
                    stroke="rgba(210, 218, 226, 0.075)"
                    strokeWidth={0.18}
                    strokeDasharray="0.9 2.2"
                    vectorEffect="nonScalingStroke"
                  />
                  <text
                    x={50}
                    y={50 - ringR - 0.5}
                    textAnchor="middle"
                    fill="rgba(200, 208, 216, 0.14)"
                    fontSize={7.75}
                    fontWeight={500}
                    style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' }}
                  >
                    {level}
                  </text>
                </g>
              );
            })}
          </g>
          {projectedLineEnd ? (
            <line
              x1={inertialTipSvg.cx}
              y1={inertialTipSvg.cy}
              x2={projectedLineEnd.x}
              y2={projectedLineEnd.y}
              stroke="rgba(220,232,244,0.2)"
              strokeWidth={0.18}
              strokeDasharray="0.9 1.5"
              filter={`url(#${uid}-future-blur)`}
              vectorEffect="nonScalingStroke"
            />
          ) : null}


          <motion.g
            initial={{ x: inertialTipSvg.cx, y: inertialTipSvg.cy }}
            animate={{ x: inertialTipSvg.cx, y: inertialTipSvg.cy }}
            transition={vectorTransition}
            style={{ transformOrigin: '0px 0px' }}
            data-compass-angle-map-deg={Math.round(angleMapDeg * 10) / 10}
          >
            <motion.g animate={{ rotate: needleRotateDeg }} transition={vectorTransition}>
              {/* Direzione+intensità: sottile scia dietro il centro, allineata all'asse del movimento. */}
              <path
                d={`M 0 0.42 Q 0 ${trailLen * 0.56} 0 ${trailLen}`}
                stroke={`url(#${uid}-trail-grad)`}
                strokeWidth={0.24}
                strokeLinecap="round"
                fill="none"
                filter={`url(#${uid}-trail-soft)`}
                vectorEffect="nonScalingStroke"
              />
              <circle
                r={ANCHOR_CIRCLE_R + 0.75}
                cx={0}
                cy={0}
                fill="none"
                stroke="rgba(255,255,255,0.24)"
                strokeWidth={0.22}
                filter={`url(#${glowFilterId})`}
                vectorEffect="nonScalingStroke"
              />
              <circle
                r={ANCHOR_CIRCLE_R}
                cx={0}
                cy={0}
                fill={mixHex(dynamicCompassBorder, '#f8fbff', 0.72)}
                stroke={mixHex(dynamicCompassBorder, '#d9e5f2', 0.64)}
                strokeWidth={0.42}
                filter={`url(#${glowFilterId})`}
                vectorEffect="nonScalingStroke"
              />
              <motion.polygon
                points={needlePolygonPoints}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={0.1}
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
              background: 'rgba(60, 42, 38, 0.45)',
              border: '1px solid rgba(150, 110, 95, 0.35)',
              color: 'rgba(210, 195, 185, 0.92)',
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
              background: 'rgba(55, 38, 40, 0.45)',
              border: '1px solid rgba(130, 90, 92, 0.35)',
              color: 'rgba(215, 190, 188, 0.92)',
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
