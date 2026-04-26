import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { calculateBaselineOffset } from './metabolicMapEngine';
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


/** Soglie zona radiale: distanza ≤35 Blue Zone, ≤70 arancione, oltre rosso. */
const BLUE_ZONE_SVG_R = 17.5;

/** Anelli di riferimento Longevity Score (solo etichette su archi con score ≥ 10 → r ≤ 40). */
const LONGEVITY_SCORE_RING_LEVELS = [80, 60, 40, 20];

/** Centro mappa / “Blue Zone” in unità SVG (viewBox). */
const MAP_CENTER_SVG = { cx: 50, cy: 50 };

/** Raggio Ancora (viewBox) — marker storici usano lo stesso raggio, senza glow. */
const ANCHOR_CIRCLE_R = 3.5;
/** Marker bussola principale: corpo circolare sempre visibile anche in direzione neutra. */
const COMPASS_BODY_R = 6.4;

const VECTOR_MOTION_TRANSITION = { duration: 0.32, ease: 'linear' };

const ZONE_LABELS = {
  neutral: 'Neutrale (Placeholder)',
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
const INERTIA_VELOCITY_MIN = 0.01;
const INERTIA_VELOCITY_MAX = 0.03;
const INERTIA_MAX_STEP_SVG = 0.95;
const ACTIVE_RING_PULSE_TRANSITION = {
  duration: 2.8,
  repeat: Infinity,
  repeatType: 'loop',
  ease: 'easeInOut',
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
  neutral: 'Modalità placeholder',
  NW: 'BURNOUT / CORTISOLO',
  NE: 'INFIAMMAZIONE / BULK',
  SW: 'DEPERIMENTO / CATABOLISMO',
  SE: 'FEGATO GRASSO / INSULINA',
};

function statusLabelFromSignals(quadrant, energyBalance, trainingLoad, glycemicInstability, sleepHours) {
  const q = String(quadrant || 'neutral');
  if (q !== 'NE') return QUADRANT_RISK_LABELS[q] || QUADRANT_RISK_LABELS.neutral;
  const e = Number(energyBalance) || 0;
  const t = Number(trainingLoad) || 0;
  const g = Number(glycemicInstability) || 0;
  const s = Number.isFinite(Number(sleepHours)) ? Number(sleepHours) : 8;
  if (Math.abs(e) < 5 && t >= 70 && g < 25) return 'RICOMPOSIZIONE / STIMOLO ALLENANTE';
  if (e <= 0 && t >= 70) return 'MASSA PULITA / RECUPERO ATTIVO';
  if (e > 0 && (g >= 35 || s < 6.2)) return 'INFIAMMAZIONE / BULK';
  if (e > 0 && g < 25) {
    return t >= 30
      ? (e > 8 ? 'RICOMPOSIZIONE / SURPLUS CONTROLLATO' : 'RICOMPOSIZIONE / STIMOLO ALLENANTE')
      : 'BULK LEGGERO';
  }
  if (e > 8) return 'SURPLUS CONTROLLATO';
  return 'RICOMPOSIZIONE / STIMOLO ALLENANTE';
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
  directionVector = null,
  directionAvailable = false,
  tractionMagnitude = 0,
  directionUnavailableReason = 'unavailable',
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
  const inertiaVelRef = useRef(0.02);
  const zoomLevel = typeof zoomLevelProp === 'number' ? clampZoom(zoomLevelProp) : zoomLevelLocal;
  const setZoomLevel = (nextZoom) => {
    const resolved = typeof nextZoom === 'function' ? nextZoom(zoomLevel) : nextZoom;
    const clamped = clampZoom(resolved);
    if (typeof onZoomLevelChange === 'function') onZoomLevelChange(clamped);
    else setZoomLevelLocal(clamped);
  };

  const baselineX = Number(baselineOffset?.x) || 0;
  const baselineY = Number(baselineOffset?.y) || 0;
  const anchorPosition = useMemo(
    () => clampMapPosition({ x: baselineX, y: baselineY }, 'anchor'),
    [baselineX, baselineY],
  );
  const displayPosition = useMemo(
    () => clampMapPosition(currentPosition || anchorPosition, 'current'),
    [currentPosition, anchorPosition],
  );
  const hasNormalizedState =
    normalizedMetabolicState &&
    Number.isFinite(Number(normalizedMetabolicState.x)) &&
    Number.isFinite(Number(normalizedMetabolicState.y));
  const displayAura = hasNormalizedState
    ? Math.max(0, Math.min(100, Number(normalizedMetabolicState.finalAura) || 0))
    : 0;
  const displayX = displayPosition.x;
  const displayY = displayPosition.y;
  const effectiveZone = hasNormalizedState
    ? (['green', 'orange', 'red'].includes(String(normalizedMetabolicState.zone))
      ? String(normalizedMetabolicState.zone)
      : 'neutral')
    : 'neutral';
  const effectiveQuadrant = hasNormalizedState
    ? (['NE', 'NW', 'SE', 'SW'].includes(String(normalizedMetabolicState.quadrant))
      ? String(normalizedMetabolicState.quadrant)
      : 'neutral')
    : 'neutral';
  const effectiveDistance = hasNormalizedState
    ? Math.max(0, Number(normalizedMetabolicState.distance) || 0)
    : Math.hypot(displayX, displayY);
  const effectiveStatusLabel = useMemo(
    () =>
      statusLabelFromSignals(
        effectiveQuadrant,
        energyBalance,
        trainingLoad,
        glycemicInstability,
        sleepHours
      ),
    [effectiveQuadrant, energyBalance, trainingLoad, glycemicInstability, sleepHours]
  );

  const anchorSvg = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY, true);
  const movementVelocity = INERTIA_VELOCITY_MIN;
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

  const safeDirectionVector = useMemo(() => {
    if (!directionAvailable) return { x: 0, y: 0 };
    const x = Number(directionVector?.x);
    const y = Number(directionVector?.y);
    const length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length <= 1e-9) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }, [directionAvailable, directionVector]);
  const directionMagnitude = Math.hypot(safeDirectionVector.x, safeDirectionVector.y);
  const compassCenter = useMemo(
    () => ({ x: inertialTipSvg.cx, y: inertialTipSvg.cy }),
    [inertialTipSvg.cx, inertialTipSvg.cy]
  );

  /** Angolo (gradi) tra Ancora e punto finale nello spazio mappa — Fase 1 richiesta. */
  const angleMapDeg = compassAngleDegMapSpace(displayX, displayY, baselineX, baselineY);

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
    if (outOfBounds.length > 0) {
      console.warn('[MetabolicMap] clamped out-of-bounds map positions', {
        bounds: {
          x: [MAP_MIN_X, MAP_MAX_X],
          y: [MAP_MIN_Y, MAP_MAX_Y],
        },
        positions: outOfBounds,
      });
    }
  }, [displayPosition]);
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
  const tractionVisual = useMemo(() => {
    const hasDirection = Boolean(directionAvailable) && directionMagnitude > 1e-6;
    if (!hasDirection) {
      return {
        hasDirection: false,
        lineX: 0,
        lineY: 0,
        dotX: 0,
        dotY: 0,
        dotR: 0,
      };
    }
    const magnitude01 = Math.max(0, Math.min(1, (Number(tractionMagnitude) || 0) / 100));
    const readableFallback01 = magnitude01 > 0 ? magnitude01 : 0.42;
    const pullDotOffset = COMPASS_BODY_R * (0.24 + readableFallback01 * 0.42);
    const pullLineLen = Math.max(COMPASS_BODY_R * 0.22, pullDotOffset - 0.8);
    return {
      hasDirection: true,
      lineX: safeDirectionVector.x * pullLineLen,
      lineY: -safeDirectionVector.y * pullLineLen,
      dotX: safeDirectionVector.x * pullDotOffset,
      dotY: -safeDirectionVector.y * pullDotOffset,
      dotR: 1.14 + readableFallback01 * 0.5,
    };
  }, [directionAvailable, directionMagnitude, tractionMagnitude, safeDirectionVector]);
  const pullColor = directionAvailable && directionMagnitude > 1e-6
    ? (distTarget > distAnchor ? 'rgba(178, 128, 136, 0.88)' : 'rgba(148, 186, 214, 0.88)')
    : 'rgba(176, 190, 206, 0.4)';

  const semanticLabelBaseStyle = {
    position: 'absolute',
    color: '#cfe8ff',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    fontWeight: 400,
    lineHeight: 1.25,
    pointerEvents: 'none',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    zIndex: 5,
    textAlign: 'center',
  };
  const semanticPrimaryStyle = {
    ...semanticLabelBaseStyle,
    fontSize: '0.57rem',
    opacity: 0.55,
  };
  const semanticSecondaryStyle = {
    ...semanticLabelBaseStyle,
    fontSize: '0.5rem',
    opacity: 0.35,
  };
  const semanticCenterStyle = {
    ...semanticLabelBaseStyle,
    fontSize: '0.5rem',
    opacity: 0.25,
    letterSpacing: '0.11em',
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
  const activeRingIndex = useMemo(() => {
    if (activeRingRadius == null || !radarRingRadii.length) return null;
    const idx = radarRingRadii.findIndex((r) => Math.abs(r - activeRingRadius) < 1e-6);
    return idx >= 0 ? idx + 1 : null;
  }, [activeRingRadius, radarRingRadii]);
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
        aria-label={`Mappa metabolica (${selectedTimeframe}): zona ${ZONE_LABELS[effectiveZone]}, quadrante ${effectiveStatusLabel}, distanza ${Math.round(effectiveDistance)}`}
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
        {activeRingRadius != null && activeRingIndex != null ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 10,
              top: 10,
              zIndex: 7,
              padding: '5px 8px',
              borderRadius: 8,
              border: '1px solid rgba(206, 220, 235, 0.32)',
              background: 'rgba(12, 16, 24, 0.62)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.03)',
              color: 'rgba(228, 236, 245, 0.94)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1.2,
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            Ring {activeRingIndex}
          </div>
        ) : null}
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
              <stop offset="0%" stopColor="#1f3f8f" stopOpacity="0.96" />
              <stop offset="16%" stopColor="#1b3777" stopOpacity="0.95" />
              <stop offset="36%" stopColor="#2b3f4d" stopOpacity="0.94" />
              <stop offset="58%" stopColor="#3f3a34" stopOpacity="0.95" />
              <stop offset="78%" stopColor="#453133" stopOpacity="0.96" />
              <stop offset="100%" stopColor="#1f1d23" stopOpacity="0.98" />
            </radialGradient>
            <filter id={`${uid}-active-ring-soft-glow`} x="-65%" y="-65%" width="230%" height="230%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.15" />
            </filter>
          </defs>

          {/* Radar rings + multi-gradient zones */}
          <g aria-hidden>
            <circle cx={50} cy={50} r={50} fill={`url(#${uid}-map-zone-gradient)`} />
            <circle cx={50} cy={50} r={50} fill="rgba(8,10,14,0.2)" />
            {radarRingRadii.map((ringR, idx) => {
              const ringStroke = idx % 2 === 0 ? 'rgba(198, 212, 228, 0.12)' : 'rgba(184, 198, 214, 0.085)';
              return (
                <circle
                  key={`radar-ring-${idx}`}
                  cx={50}
                  cy={50}
                  r={ringR}
                  fill={idx === 0 ? 'rgba(38, 56, 96, 0.08)' : 'none'}
                  stroke={ringStroke}
                  strokeWidth={0.22}
                  vectorEffect="nonScalingStroke"
                />
              );
            })}
            {activeRingRadius != null ? (
              <>
                <motion.circle
                  cx={50}
                  cy={50}
                  r={activeRingRadius}
                  fill="none"
                  stroke="rgba(196, 214, 232, 0.22)"
                  strokeWidth={0.72}
                  filter={`url(#${uid}-active-ring-soft-glow)`}
                  vectorEffect="nonScalingStroke"
                  animate={{ opacity: [0.26, 0.42, 0.26] }}
                  transition={ACTIVE_RING_PULSE_TRANSITION}
                />
                <motion.circle
                  cx={50}
                  cy={50}
                  r={activeRingRadius}
                  fill="none"
                  stroke="rgba(218, 230, 242, 0.6)"
                  strokeWidth={0.36}
                  filter={`url(#${uid}-ring-glow)`}
                  vectorEffect="nonScalingStroke"
                  animate={{ opacity: [0.55, 0.85, 0.55] }}
                  transition={ACTIVE_RING_PULSE_TRANSITION}
                />
              </>
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
                    stroke="rgba(196, 208, 222, 0.14)"
                    strokeWidth={0.22}
                    strokeDasharray="1.05 2"
                    vectorEffect="nonScalingStroke"
                  />
                  <text
                    x={50}
                    y={50 - ringR - 0.5}
                    textAnchor="middle"
                    fill="rgba(226, 234, 242, 0.42)"
                    fontSize={8.1}
                    fontWeight={600}
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
            <circle
              r={COMPASS_BODY_R + 2.15}
              cx={0}
              cy={0}
              fill="rgba(102, 148, 194, 0.2)"
              stroke="none"
              filter={`url(#${glowFilterId})`}
              vectorEffect="nonScalingStroke"
            />
            <circle
              r={COMPASS_BODY_R}
              cx={0}
              cy={0}
              fill={mixHex(dynamicCompassBorder, '#1a2735', 0.5)}
              stroke={mixHex(dynamicCompassBorder, '#e2ecf8', 0.52)}
              strokeWidth={0.56}
              filter={`url(#${glowFilterId})`}
              vectorEffect="nonScalingStroke"
            />
            <circle
              r={COMPASS_BODY_R * 0.34}
              cx={0}
              cy={0}
              fill="rgba(222, 236, 252, 0.26)"
              stroke="none"
              vectorEffect="nonScalingStroke"
            />
            {tractionVisual.hasDirection ? (
              <>
                <line
                  x1={0}
                  y1={0}
                  x2={tractionVisual.lineX}
                  y2={tractionVisual.lineY}
                  stroke={mixHex(pullColor, '#eef6ff', 0.24)}
                  strokeWidth={0.74}
                  strokeLinecap="round"
                  vectorEffect="nonScalingStroke"
                />
                <circle
                  r={tractionVisual.dotR}
                  cx={tractionVisual.dotX}
                  cy={tractionVisual.dotY}
                  fill={mixHex(pullColor, '#f0f7ff', 0.18)}
                  stroke="rgba(232, 242, 252, 0.32)"
                  strokeWidth={0.24}
                  filter={`url(#${glowFilterId})`}
                  vectorEffect="nonScalingStroke"
                />
              </>
            ) : null}
          </motion.g>

        </svg>

        <span style={{ ...semanticPrimaryStyle, top: 4, left: '50%', transform: 'translateX(-50%)' }}>
          RICOMPOSIZIONE
        </span>
        <span
          style={{
            ...semanticPrimaryStyle,
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            textAlign: 'right',
          }}
        >
          ACCUMULO GRASSO
        </span>
        <span style={{ ...semanticPrimaryStyle, bottom: 4, left: '50%', transform: 'translateX(-50%)' }}>
          CATABOLISMO
        </span>
        <span
          style={{
            ...semanticPrimaryStyle,
            left: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            textAlign: 'left',
          }}
        >
          DIGIUNO / AUTOFAGIA
        </span>

        <span style={{ ...semanticSecondaryStyle, top: 28, right: 20, textAlign: 'right' }}>
          SURPLUS CONTROLLATO
        </span>
        <span style={{ ...semanticSecondaryStyle, top: 28, left: 20, textAlign: 'left' }}>
          MASSA PULITA
        </span>
        <span style={{ ...semanticSecondaryStyle, bottom: 28, right: 20, textAlign: 'right' }}>
          SURPLUS DISFUNZIONALE
        </span>
        <span style={{ ...semanticSecondaryStyle, bottom: 28, left: 20, textAlign: 'left' }}>
          PERDITA GRASSO
        </span>

        <div
          style={{
            ...semanticCenterStyle,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1.2,
          }}
        >
          <span>BLUE ZONE</span>
          <span style={{ fontSize: '0.43rem', opacity: 0.8, letterSpacing: '0.1em' }}>LONGEVITÀ</span>
        </div>
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
          Zona attuale: {ZONE_LABELS[effectiveZone]} — Stato: {effectiveStatusLabel}
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
        {directionAvailable ? (
          <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'rgba(200, 208, 216, 0.72)' }}>
            Direzione visiva da trazione metabolica corrente (ancora stabile, nessun movimento reale).
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'rgba(200, 208, 216, 0.72)' }}>
            Direzione non disponibile ({directionUnavailableReason}): trazione troppo debole nella finestra selezionata.
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
