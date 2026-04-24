import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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

/** Raggio Ancora (viewBox) — marker storici usano lo stesso raggio, senza glow. */
const ANCHOR_CIRCLE_R = 3.1;

/** Punti storici: poco contrasto, non competono con posizione attuale. */
const HISTORIC_TRAIL_DOT_FILL = 'rgb(82, 102, 112)';

/** Sotto questa lunghezza (spazio mappa −100…100) il vettore stile di vita si considera “quasi nullo”: ago verso il centro, più tenue. */
const LIFESTYLE_VECTOR_IDLE_THRESHOLD = 4;

/** Lunghezza lama ago (viewBox) quando il vettore stile di vita è quasi nullo. */
const NEEDLE_BLADE_LEN_IDLE = 3.2;

/** Estremi lama ago (viewBox) in funzione della magnitudo anchor → target (spazio mappa). */
const NEEDLE_BLADE_LEN_MIN = 4;
const NEEDLE_BLADE_LEN_MAX = 12.5;

/** Valore di riferimento magnitudo (spazio mappa −100…100) per allungare l’ago al massimo. */
const LIFESTYLE_LEN_FOR_FULL_NEEDLE = 95;

const VECTOR_MOTION_DURATION_MS = 280;
const VECTOR_MOTION_TRANSITION = { duration: VECTOR_MOTION_DURATION_MS / 1000, ease: 'linear' };

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

/** Raggio posizione attuale (maggior lettura rispetto all’Ancora). */
const TIP_CIRCLE_R = 2.45;
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
  predictionConfidence = 'bassa',
  whatIfTrajectory = null,
  showWhatIf = false,
  onToggleWhatIf = null,
}) {
  const uid = useId().replace(/:/g, '');
  const glowFilterId = `${uid}-anchor-glow`;
  const tipGlowFilterId = `${uid}-tip-glow`;
  const reduceMotion = useReducedMotion();
  const vectorTransition = reduceMotion ? { duration: 0 } : VECTOR_MOTION_TRANSITION;
  const [showHistoricTrailLocal, setShowHistoricTrailLocal] = useState(false);
  const [zoomLevelLocal, setZoomLevelLocal] = useState(1);
  const [smoothedTipSvg, setSmoothedTipSvg] = useState(MAP_CENTER_SVG);
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
  const displayX = shiftedX;
  const displayY = shiftedY;

  const anchorSvg = baselineOffsetToAnchorSvg(baselineX, baselineY);
  const tipSvg = mapPointToSvgCoords(displayX, displayY);
  useEffect(() => {
    let raf = 0;
    const startAt = performance.now();
    const startPos = { cx: smoothedTipSvg.cx, cy: smoothedTipSvg.cy };
    const endPos = { cx: tipSvg.cx, cy: tipSvg.cy };
    const tick = (now) => {
      const elapsed = now - startAt;
      const t = Math.max(0, Math.min(1, elapsed / VECTOR_MOTION_DURATION_MS));
      // Stesso fattore t su entrambi gli assi: velocità costante e traiettoria coerente.
      const next = {
        cx: startPos.cx + (endPos.cx - startPos.cx) * t,
        cy: startPos.cy + (endPos.cy - startPos.cy) * t,
      };
      setSmoothedTipSvg(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tipSvg.cx, tipSvg.cy]);

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
  const needleBladeOpacity = lifestyleNearlyIdle ? 0.32 : 0.86;

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
  const ghostOpacity =
    predictionConfidence === 'alta' ? 0.4 : predictionConfidence === 'media' ? 0.25 : 0;
  const ghostSvg = useMemo(() => {
    const dx = smoothedTipSvg.cx - anchorSvg.cx;
    const dy = smoothedTipSvg.cy - anchorSvg.cy;
    const g = { cx: smoothedTipSvg.cx + dx * 0.28, cy: smoothedTipSvg.cy + dy * 0.28 };
    return {
      cx: Math.max(0, Math.min(100, g.cx)),
      cy: Math.max(0, Math.min(100, g.cy)),
    };
  }, [anchorSvg.cx, anchorSvg.cy, smoothedTipSvg.cx, smoothedTipSvg.cy]);
  const scenarioDots = useMemo(() => {
    if (!showWhatIf || predictionConfidence !== 'alta') return [];
    const arr = Array.isArray(whatIfTrajectory?.scenarios)
      ? whatIfTrajectory.scenarios.slice(0, 3)
      : [];
    return arr
      .map((s) => {
        const p = s?.position;
        if (!p) return null;
        const svg = mapPointToSvgCoords(clampMapAxis(p.x), clampMapAxis(p.y));
        return { type: String(s.type || ''), cx: svg.cx, cy: svg.cy };
      })
      .filter(Boolean);
  }, [showWhatIf, predictionConfidence, whatIfTrajectory]);

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
        onClick={() => {
          if (typeof onToggleWhatIf === 'function') onToggleWhatIf();
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
                ? 'rgba(55, 90, 110, 0.35)'
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
              opacity: 0.055,
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
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.15" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={tipGlowFilterId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-ring-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
            </filter>
          </defs>

          {/* Radar rings + multi-gradient zones */}
          <g aria-hidden>
            {radarRingRadii.map((ringR, idx) => {
              const ringStroke = idx % 2 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.055)';
              return (
                <circle
                  key={`radar-ring-${idx}`}
                  cx={50}
                  cy={50}
                  r={ringR}
                  fill={idx === 0 ? 'rgba(32, 42, 52, 0.06)' : 'none'}
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
                    stroke="rgba(210, 218, 226, 0.1)"
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

          {ghostOpacity > 0 ? (
            <g aria-hidden>
              <line
                x1={smoothedTipSvg.cx}
                y1={smoothedTipSvg.cy}
                x2={ghostSvg.cx}
                y2={ghostSvg.cy}
                stroke="rgba(220,230,240,0.22)"
                strokeWidth={0.16}
                strokeDasharray="0.7 1.5"
                vectorEffect="nonScalingStroke"
              />
              <circle
                cx={ghostSvg.cx}
                cy={ghostSvg.cy}
                r={TIP_CIRCLE_R * 0.92}
                fill={`rgba(220,230,240,${ghostOpacity})`}
                stroke={`rgba(255,255,255,${ghostOpacity * 0.55})`}
                strokeWidth={0.22}
                vectorEffect="nonScalingStroke"
              />
            </g>
          ) : null}
          {scenarioDots.length > 0 ? (
            <g aria-hidden>
              {scenarioDots.map((s) => (
                <g key={`whatif-${s.type}`}>
                  <line
                    x1={smoothedTipSvg.cx}
                    y1={smoothedTipSvg.cy}
                    x2={s.cx}
                    y2={s.cy}
                    stroke="rgba(210,220,230,0.14)"
                    strokeWidth={0.14}
                    strokeDasharray="0.55 1.1"
                    vectorEffect="nonScalingStroke"
                  />
                  <circle
                    cx={s.cx}
                    cy={s.cy}
                    r={TIP_CIRCLE_R * 0.52}
                    fill="rgba(215,225,235,0.24)"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.18}
                    vectorEffect="nonScalingStroke"
                  />
                </g>
              ))}
            </g>
          ) : null}

          {showHistoricTrail && historicTrail.polylinePoints ? (
            <g aria-hidden>
              <polyline
                fill="none"
                stroke="rgba(255,255,255,0.11)"
                strokeWidth={0.45}
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
                  stroke="rgba(255,255,255,0.11)"
                  strokeWidth={0.45}
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
                fill={mixHex(dynamicCompassBorder, '#9db0c0', 0.42)}
                stroke={mixHex(dynamicCompassBorder, '#4a5560', 0.5)}
                strokeWidth={0.36}
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

          <g style={{ pointerEvents: 'none' }}>
            <motion.circle
              r={TIP_CIRCLE_R}
              cx={smoothedTipSvg.cx}
              cy={smoothedTipSvg.cy}
              fill="rgba(220, 230, 240, 0.95)"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={0.3}
              filter={`url(#${tipGlowFilterId})`}
              vectorEffect="nonScalingStroke"
              initial={false}
              animate={{ cx: smoothedTipSvg.cx, cy: smoothedTipSvg.cy }}
              transition={vectorTransition}
            />
          </g>
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
