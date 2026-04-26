import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { calculateBaselineOffset, calculateMetabolicMapPosition } from './metabolicMapEngine';
import { biometricsToMapBaselineInput } from './biometricHistory';

const MAP_MIN_X = -100;
const MAP_MAX_X = 100;
const MAP_MIN_Y = -100;
const MAP_MAX_Y = 100;
const MAP_VIEWBOX_MIN = 0;
const MAP_VIEWBOX_MAX = 100;
const MAP_MARKER_SAFE_SVG_MARGIN = 4.75;
const MAP_VIEWPORT_PADDING_SVG = 14;

/** Stesso range della mappa (−100…100) usato per i punti storici e per l’Ancora. */
function clampMapAxis(value, min = MAP_MIN_X, max = MAP_MAX_X) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clampMapPosition(position, label = 'position') {
  const rawX = Number(position?.x);
  const rawY = Number(position?.y);
  const safeRawX = Number.isFinite(rawX) ? rawX : 0;
  const safeRawY = Number.isFinite(rawY) ? rawY : 0;
  const x = clampMapAxis(safeRawX, MAP_MIN_X, MAP_MAX_X);
  const y = clampMapAxis(safeRawY, MAP_MIN_Y, MAP_MAX_Y);
  return {
    x,
    y,
    rawX: safeRawX,
    rawY: safeRawY,
    outOfBounds:
      !Number.isFinite(rawX) ||
      !Number.isFinite(rawY) ||
      safeRawX !== x ||
      safeRawY !== y,
    label,
  };
}

/** viewBox 0–100: stesso sistema di posizionamento del marker (50 ± x/2, 50 ∓ y/2). */
function mapPointToSvgCoords(x, y, keepMarkerInside = false) {
  const cxRaw = 50 + clampMapAxis(x, MAP_MIN_X, MAP_MAX_X) / 2;
  const cyRaw = 50 - clampMapAxis(y, MAP_MIN_Y, MAP_MAX_Y) / 2;
  if (!keepMarkerInside) return { cx: cxRaw, cy: cyRaw };
  return {
    cx: Math.max(MAP_MARKER_SAFE_SVG_MARGIN, Math.min(100 - MAP_MARKER_SAFE_SVG_MARGIN, cxRaw)),
    cy: Math.max(MAP_MARKER_SAFE_SVG_MARGIN, Math.min(100 - MAP_MARKER_SAFE_SVG_MARGIN, cyRaw)),
  };
}

function buildDynamicMapViewBox(points, zoomLevel) {
  const safePoints = (Array.isArray(points) ? points : []).filter(
    (p) => Number.isFinite(Number(p?.cx)) && Number.isFinite(Number(p?.cy)),
  );
  const z = clampZoom(zoomLevel);
  const defaultSize = 100 / z;
  if (safePoints.length === 0 || z <= 1.01) return '0 0 100 100';

  let minX = MAP_VIEWBOX_MAX;
  let maxX = MAP_VIEWBOX_MIN;
  let minY = MAP_VIEWBOX_MAX;
  let maxY = MAP_VIEWBOX_MIN;
  safePoints.forEach((p) => {
    minX = Math.min(minX, p.cx);
    maxX = Math.max(maxX, p.cx);
    minY = Math.min(minY, p.cy);
    maxY = Math.max(maxY, p.cy);
  });

  const contentW = maxX - minX + MAP_VIEWPORT_PADDING_SVG * 2;
  const contentH = maxY - minY + MAP_VIEWPORT_PADDING_SVG * 2;
  const size = Math.min(100, Math.max(defaultSize, contentW, contentH));
  const half = size / 2;
  const desiredCenterX = (minX + maxX) / 2;
  const desiredCenterY = (minY + maxY) / 2;
  const centerX = Math.max(half, Math.min(100 - half, desiredCenterX));
  const centerY = Math.max(half, Math.min(100 - half, desiredCenterY));
  return `${(centerX - half).toFixed(2)} ${(centerY - half).toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)}`;
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

function buildHistoricBaselineTrailSvg(bodyMetricsHistory, baselineX, baselineY) {
  const arr = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  if (arr.length === 0) return { historicDots: [], polylinePoints: '', canShow: false };
  const sorted = [...arr].sort((a, b) => bodyMetricEntrySortTime(a) - bodyMetricEntrySortTime(b));
  const historicDots = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const input = biometricsToMapBaselineInput(sorted[i]);
    if (!input) continue;
    const base = calculateBaselineOffset(input);
    historicDots.push(mapPointToSvgCoords(clampMapAxis(base.x), clampMapAxis(base.y), true));
  }
  const anchor = baselineOffsetToAnchorSvg(baselineX, baselineY);
  if (historicDots.length === 0) return { historicDots: [], polylinePoints: '', canShow: false };
  const points = [...historicDots, anchor];
  return {
    historicDots,
    polylinePoints: points.map((p) => `${p.cx},${p.cy}`).join(' '),
    canShow: points.length >= 2,
  };
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

/** Sotto questa lunghezza (spazio mappa −100…100) il vettore stile di vita si considera “quasi nullo”: ago verso il centro, più tenue. */
const LIFESTYLE_VECTOR_IDLE_THRESHOLD = 4;

/** Lunghezza lama ago (viewBox) quando il vettore stile di vita è quasi nullo. */
const NEEDLE_BLADE_LEN_IDLE = 3.2;

/** Estremi lama ago (viewBox) in funzione della magnitudo anchor → target (spazio mappa). */
const NEEDLE_BLADE_LEN_MIN = 4;
const NEEDLE_BLADE_LEN_MAX = 12.5;

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
const INERTIA_VELOCITY_MIN = 0.015;
const INERTIA_VELOCITY_MAX = 0.045;
const INERTIA_MAX_STEP_SVG = 1.4;

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

function rotationDegFromDirection(dirX, dirY) {
  const baseDeg = (Math.atan2(dirY, dirX) * 180) / Math.PI;
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
  zoomLevel: zoomLevelProp = undefined,
  onZoomLevelChange = null,
  trajectoryPositions = null,
  currentPosition = null,
  normalizedMetabolicState = null,
  showRoute = false,
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

  const computedMapState = useMemo(
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
  const hasSharedNormalizedState =
    normalizedMetabolicState &&
    Number.isFinite(Number(normalizedMetabolicState.x)) &&
    Number.isFinite(Number(normalizedMetabolicState.y));

  const shiftedX = useMemo(() => {
    if (hasSharedNormalizedState) {
      return clampMapAxis(Number(normalizedMetabolicState.x), MAP_MIN_X, MAP_MAX_X);
    }
    return clampMapAxis(computedMapState.x + baselineX, MAP_MIN_X, MAP_MAX_X);
  }, [hasSharedNormalizedState, normalizedMetabolicState, computedMapState.x, baselineX]);
  const shiftedY = useMemo(() => {
    if (hasSharedNormalizedState) {
      return clampMapAxis(Number(normalizedMetabolicState.y), MAP_MIN_Y, MAP_MAX_Y);
    }
    return clampMapAxis(computedMapState.y + baselineY, MAP_MIN_Y, MAP_MAX_Y);
  }, [hasSharedNormalizedState, normalizedMetabolicState, computedMapState.y, baselineY]);

  const stateZone = hasSharedNormalizedState ? String(normalizedMetabolicState.zone || '') : '';
  const stateQuadrant = hasSharedNormalizedState ? String(normalizedMetabolicState.quadrant || '') : '';
  const stateDistance = hasSharedNormalizedState ? Number(normalizedMetabolicState.distance) : NaN;

  const displayPosition = useMemo(
    () => clampMapPosition(currentPosition || { x: shiftedX, y: shiftedY }, 'current'),
    [currentPosition, shiftedX, shiftedY],
  );
  const displayAura = hasSharedNormalizedState
    ? Math.max(0, Math.min(100, Number(normalizedMetabolicState.finalAura) || 0))
    : computedMapState.finalAura;
  const displayX = displayPosition.x;
  const displayY = displayPosition.y;

  const { zone: effectiveZone, quadrant: effectiveQuadrant, distance: effectiveDistance } = useMemo(
    () => {
      if (
        (stateZone === 'green' || stateZone === 'orange' || stateZone === 'red') &&
        (stateQuadrant === 'NE' || stateQuadrant === 'NW' || stateQuadrant === 'SE' || stateQuadrant === 'SW') &&
        Number.isFinite(stateDistance)
      ) {
        return {
          zone: stateZone,
          quadrant: stateQuadrant,
          distance: stateDistance,
        };
      }
      return classifyMapPoint(displayX, displayY);
    },
    [displayX, displayY, stateZone, stateQuadrant, stateDistance],
  );

  const anchorSvg = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY, true);
  const movementVelocity = useMemo(() => {
    const positions = Array.isArray(trajectoryPositions) ? trajectoryPositions : [];
    const last = positions[positions.length - 1];
    const prev = positions.length > 1 ? positions[positions.length - 2] : last;
    const speed = Math.hypot(
      (Number(last?.x) || 0) - (Number(prev?.x) || 0),
      (Number(last?.y) || 0) - (Number(prev?.y) || 0),
    );
    const t = Math.max(0, Math.min(1, speed / 9));
    return INERTIA_VELOCITY_MIN + t * (INERTIA_VELOCITY_MAX - INERTIA_VELOCITY_MIN);
  }, [trajectoryPositions]);
  useEffect(() => {
    targetTipRef.current = tipSvg;
    inertiaVelRef.current = movementVelocity;
  }, [tipSvg, movementVelocity]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setInertialTipSvg((prev) => {
        const target = targetTipRef.current || prev;
        const v = Math.max(INERTIA_VELOCITY_MIN, Math.min(INERTIA_VELOCITY_MAX, Number(inertiaVelRef.current) || 0.03));
        const dx = (target.cx - prev.cx) * v;
        const dy = (target.cy - prev.cy) * v;
        const step = Math.hypot(dx, dy);
        if (step > INERTIA_MAX_STEP_SVG && step > 0) {
          const scale = INERTIA_MAX_STEP_SVG / step;
          return {
            cx: prev.cx + dx * scale,
            cy: prev.cy + dy * scale,
          };
        }
        return {
          cx: prev.cx + dx,
          cy: prev.cy + dy,
        };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const lifestyleDx = displayX - baselineX;
  const lifestyleDy = displayY - baselineY;
  const trajectorySpeed = useMemo(() => {
    const positions = Array.isArray(trajectoryPositions) ? trajectoryPositions : [];
    const last = positions[positions.length - 1];
    const prev = positions.length > 1 ? positions[positions.length - 2] : last;
    return Math.hypot(
      (Number(last?.x) || 0) - (Number(prev?.x) || 0),
      (Number(last?.y) || 0) - (Number(prev?.y) || 0),
    );
  }, [trajectoryPositions]);
  const lifestyleLen = Math.max(Math.hypot(lifestyleDx, lifestyleDy), trajectorySpeed);
  const lifestyleNearlyIdle = lifestyleLen < LIFESTYLE_VECTOR_IDLE_THRESHOLD;
  const compassCenter = useMemo(
    () => ({ x: inertialTipSvg.cx, y: inertialTipSvg.cy }),
    [inertialTipSvg.cx, inertialTipSvg.cy]
  );

  /** Angolo (gradi) tra Ancora e punto finale nello spazio mappa — Fase 1 richiesta. */
  const angleMapDeg = compassAngleDegMapSpace(displayX, displayY, baselineX, baselineY);

  const trajectoryPointSvg = useMemo(() => {
    const arr = Array.isArray(trajectoryPositions) ? trajectoryPositions : [];
    return arr
      .map((point, idx) => {
        const clamped = clampMapPosition(point, `trajectory-${idx}`);
        return mapPointToSvgCoords(clamped.x, clamped.y, true);
      })
      .filter((point) => Number.isFinite(point.cx) && Number.isFinite(point.cy));
  }, [trajectoryPositions]);
  const historicTrail = useMemo(
    () => buildHistoricBaselineTrailSvg(bodyMetricsHistory, baselineX, baselineY),
    [bodyMetricsHistory, baselineX, baselineY]
  );
  const centerRoutePolyline = useMemo(() => {
    if (!showRoute) return '';
    const anchor = baselineOffsetToAnchorSvg(baselineX, baselineY);
    const steps = 7;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      const cx = anchor.cx + (MAP_CENTER_SVG.cx - anchor.cx) * eased;
      const cy = anchor.cy + (MAP_CENTER_SVG.cy - anchor.cy) * eased;
      points.push(`${cx.toFixed(2)},${cy.toFixed(2)}`);
    }
    return points.join(' ');
  }, [showRoute, baselineX, baselineY]);
  const viewportPoints = useMemo(() => {
    const extra = [];
    if (showRoute && historicTrail?.canShow && Array.isArray(historicTrail.historicDots)) {
      extra.push(...historicTrail.historicDots);
      extra.push(MAP_CENTER_SVG);
    }
    return [tipSvg, ...extra].filter(Boolean);
  }, [tipSvg, showRoute, historicTrail]);
  const viewportViewBox = useMemo(
    () => buildDynamicMapViewBox(
      viewportPoints,
      zoomLevel,
    ),
    [viewportPoints, zoomLevel],
  );
  useEffect(() => {
    const outOfBounds = [];
    if (displayPosition.outOfBounds) outOfBounds.push(displayPosition);
    if (Array.isArray(trajectoryPositions)) {
      trajectoryPositions.forEach((point, idx) => {
        const dailyPoint = clampMapPosition(point, `trajectory-${idx}`);
        if (dailyPoint.outOfBounds) outOfBounds.push(dailyPoint);
      });
    }
    if (outOfBounds.length > 0) {
      console.warn('[MetabolicMap] clamped out-of-bounds map positions', {
        bounds: {
          x: [MAP_MIN_X, MAP_MAX_X],
          y: [MAP_MIN_Y, MAP_MAX_Y],
        },
        positions: outOfBounds,
      });
    }
  }, [displayPosition, trajectoryPositions]);
  const trajectoryTangent = useMemo(() => {
    const lastIdx = trajectoryPointSvg.length - 1;
    const prev = lastIdx > 0 ? trajectoryPointSvg[lastIdx - 1] : anchorSvg;
    const target = lastIdx >= 0 ? trajectoryPointSvg[lastIdx] : inertialTipSvg;
    const dx = (target?.cx ?? compassCenter.x) - (prev?.cx ?? compassCenter.x);
    const dy = (target?.cy ?? compassCenter.y) - (prev?.cy ?? compassCenter.y);
    const mag = Math.hypot(dx, dy);
    if (mag < 1e-6) return { x: 0, y: -1, mag: 0 };
    return { x: dx / mag, y: dy / mag, mag };
  }, [trajectoryPointSvg, anchorSvg, compassCenter.x, compassCenter.y, inertialTipSvg]);
  const needleRotateDeg = rotationDegFromDirection(trajectoryTangent.x, trajectoryTangent.y);
  const needleBladeOpacity = lifestyleNearlyIdle ? 0.32 : 0.86;
  const snailTrailStyle = useMemo(() => {
    const t = Math.max(0, Math.min(1, trajectorySpeed / 14));
    return {
      length: 0.45 + t * 3.1,
      opacity: t < 0.08 ? 0.015 : 0.035 + t * 0.18,
      width: 0.95 + t * 1.1,
    };
  }, [trajectorySpeed]);

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
          background: 'rgba(8, 10, 14, 0.96)',
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
          viewBox={viewportViewBox}
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
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-ring-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
            </filter>
            <filter id={`${uid}-snail-shadow-blur`} x="-120%" y="-80%" width="340%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.62" />
            </filter>
            <linearGradient id={`${uid}-snail-shadow-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(226,238,246,0.2)" stopOpacity="0.85" />
              <stop offset="62%" stopColor="rgba(170,196,210,0.14)" stopOpacity="0.38" />
              <stop offset="100%" stopColor="rgba(120,150,165,0.02)" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${uid}-map-zone-gradient`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2a343f" stopOpacity="0.95" />
              <stop offset="24%" stopColor="#243138" stopOpacity="0.95" />
              <stop offset="42%" stopColor="#203132" stopOpacity="0.94" />
              <stop offset="64%" stopColor="#2b2624" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#2b2527" stopOpacity="0.98" />
            </radialGradient>
          </defs>

          {/* Radar rings + multi-gradient zones */}
          <g aria-hidden>
            <circle cx={50} cy={50} r={50} fill={`url(#${uid}-map-zone-gradient)`} />
            <circle cx={50} cy={50} r={50} fill="rgba(8,10,14,0.2)" />
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
            {showRoute && historicTrail?.canShow ? (
              <polyline
                points={historicTrail.polylinePoints}
                fill="none"
                stroke="rgba(170, 196, 210, 0.42)"
                strokeWidth={0.3}
                strokeDasharray="1.8 1.4"
                vectorEffect="nonScalingStroke"
              />
            ) : null}
            {showRoute && centerRoutePolyline ? (
              <polyline
                points={centerRoutePolyline}
                fill="none"
                stroke="rgba(188, 213, 224, 0.34)"
                strokeWidth={0.26}
                strokeDasharray="1.4 1.2"
                vectorEffect="nonScalingStroke"
              />
            ) : null}
            {showRoute && historicTrail?.canShow && Array.isArray(historicTrail.historicDots)
              ? historicTrail.historicDots.map((dot, idx) => (
                  <circle
                    key={`historic-anchor-${idx}`}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={0.55}
                    fill="rgba(190, 212, 224, 0.5)"
                    vectorEffect="nonScalingStroke"
                  />
                ))
              : null}
          </g>
          <motion.g
            initial={{ x: compassCenter.x, y: compassCenter.y }}
            animate={{ x: compassCenter.x, y: compassCenter.y }}
            transition={vectorTransition}
            style={{ transformOrigin: '0px 0px' }}
            data-compass-angle-map-deg={Math.round(angleMapDeg * 10) / 10}
          >
            <motion.g animate={{ rotate: needleRotateDeg }} transition={vectorTransition}>
              <motion.rect
                x={-snailTrailStyle.width / 2}
                y={0.72}
                width={snailTrailStyle.width}
                height={snailTrailStyle.length}
                rx={snailTrailStyle.width / 2}
                fill={`url(#${uid}-snail-shadow-grad)`}
                filter={`url(#${uid}-snail-shadow-blur)`}
                vectorEffect="nonScalingStroke"
                animate={{ opacity: snailTrailStyle.opacity }}
                transition={vectorTransition}
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
