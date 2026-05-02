import { getStructuralBaselineOffsetFromHistory } from '../../../biometricHistory';
import { computeMetabolicEngineTargetVec } from '../../../metabolicDirectionEngine';
import {
  calculateBaselineOffset,
  calculateMetabolicMapPosition,
  getLastBiometricData,
} from '../../../metabolicMapEngine';
import { computeMetabolicMapInputsAndAudit } from '../../../metabolicMapPeriodInputs';
import { computeWeightProjectionFromInputs, formatWeightProjectionUI } from '../../../weightProjectionEngine';

const METABOLIC_COMPASS_SNAPSHOT_RAD_TO_DEG = 180 / Math.PI;

function mapZoneToGlowRgba(zone) {
  if (zone === 'red') return 'rgba(120, 88, 92, 0.28)';
  if (zone === 'orange') return 'rgba(125, 100, 82, 0.28)';
  if (zone === 'green') return 'rgba(88, 108, 128, 0.28)';
  return '';
}

function clampAxis(v) {
  return Math.max(-100, Math.min(100, Number(v) || 0));
}

function dailyTrainingToMapAxis(dayTrainingLoad) {
  const t = Math.max(0, Math.min(100, Number(dayTrainingLoad) || 0));
  return clampAxis(((t - 35) / 65) * 100);
}

function buildDailyPointFromLogDay(day, baselineOffset) {
  const kcalBalance = Number(day?.kcalBalance) || 0;
  const trainingLoadAxis = dailyTrainingToMapAxis(day?.trainingLoad);
  const sleepHours = Number(day?.sleepHours);
  const safeSleep = Number.isFinite(sleepHours) && sleepHours > 0 ? sleepHours : 8;
  const surplusFactor = Math.max(0, Math.min(1, kcalBalance / 500));
  const sleepStress = safeSleep < 7.5 ? Math.max(0, Math.min(1, (7.5 - safeSleep) / 7.5)) : 0;
  const glycemicInstability = Math.max(0, Math.min(100, (0.4 * surplusFactor + 0.45 * sleepStress) * 100));
  return calculateMetabolicMapPosition({
    energyBalance: clampAxis(kcalBalance / 5),
    trainingLoad: trainingLoadAxis,
    sleepHours: safeSleep,
    glycemicInstability,
    baselineOffsetX: baselineOffset.x,
    baselineOffsetY: baselineOffset.y,
  });
}

function buildTrajectoryProjection(dailyPositions) {
  const arr = Array.isArray(dailyPositions) ? dailyPositions : [];
  const fallback = { projected: { x: 0, y: 0 }, velocity: 0 };
  if (arr.length === 0) return fallback;
  const current = arr[arr.length - 1];
  if (arr.length < 2) return { projected: { x: current.x, y: current.y }, velocity: 0 };

  let vx = 0;
  let vy = 0;
  let count = 0;
  for (let i = Math.max(1, arr.length - 3); i < arr.length; i += 1) {
    const prev = arr[i - 1];
    const next = arr[i];
    vx += (Number(next?.x) || 0) - (Number(prev?.x) || 0);
    vy += (Number(next?.y) || 0) - (Number(prev?.y) || 0);
    count += 1;
  }
  if (count > 0) {
    vx /= count;
    vy /= count;
  }
  const velocity = Math.hypot(vx, vy);
  const projectionScale = Math.max(1.6, Math.min(3.2, velocity * 0.9 + 1.6));
  return {
    projected: {
      x: clampAxis((Number(current.x) || 0) + vx * projectionScale),
      y: clampAxis((Number(current.y) || 0) + vy * projectionScale),
    },
    velocity,
  };
}

function mapPointToSvgCoords(x, y) {
  return { cx: 50 + x / 2, cy: 50 - y / 2 };
}

function clampMapAxis(value) {
  return Math.max(-100, Math.min(100, value));
}

/** Stessa formula di {@link calculateMetabolicScore} in MetabolicMap.jsx */
function calculateMetabolicScore(mapX, mapY) {
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

function computeMetabolicCompassDirectionPure(dailyHistory, timeframe) {
  const { x, y } = computeMetabolicEngineTargetVec(dailyHistory, timeframe);
  const angleRad = Math.atan2(y, x);
  const angleDeg = Number.isFinite(angleRad) ? angleRad * METABOLIC_COMPASS_SNAPSHOT_RAD_TO_DEG : 0;
  const magnitude = Math.hypot(x, y);
  return { angleDeg, magnitude, x, y };
}

/**
 * Layer VISUAL sulla bussola: stessa direzione di (x,y), magnitudo riscalata per leggibilità.
 * Non altera `compassDirection` RAW (angleDeg / x,y engine restano nel bundle separatamente).
 *
 * @param {{ x?: number, y?: number }} param0
 * @returns {{ visualX: number, visualY: number, visualMagnitude: number, rawMagnitude: number }}
 */
export function computeVisualCompassVector({ x: xIn, y: yIn } = {}) {
  const x = Number(xIn) || 0;
  const y = Number(yIn) || 0;
  const rawMagnitude = Math.hypot(x, y);
  if (rawMagnitude <= 0 || !Number.isFinite(rawMagnitude)) {
    return { visualX: 0, visualY: 0, visualMagnitude: 0, rawMagnitude: 0 };
  }

  let m = rawMagnitude;
  if (m < 5) {
    m = 0.75 + (m / 5) * (5 - 0.75);
  }
  m = Math.pow(m, 0.8);
  const visualMagnitude = Math.min(m, 100);
  const scale = visualMagnitude / rawMagnitude;
  return {
    visualX: x * scale,
    visualY: y * scale,
    visualMagnitude,
    rawMagnitude,
  };
}

function resolveBaselineOffset(bodyMetricsHistory, dailyHistory) {
  const fromScale = getStructuralBaselineOffsetFromHistory(bodyMetricsHistory);
  if (fromScale) return fromScale;
  const biometrics = getLastBiometricData(dailyHistory);
  return calculateBaselineOffset(biometrics);
}

/**
 * Bundle puro mappa + dati condivisi con la bussola (medie periodo, traiettoria, proiezione peso).
 * Nessuna dipendenza da React / Firebase.
 *
 * @param {{
 *   dailyHistory?: Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>,
 *   bodyMetricsHistory?: Array<Record<string, unknown>>,
 *   fullHistory?: object | null,
 *   userTargets?: { kcal?: number } | null,
 *   projectionAnchorDate?: string | null,
 *   selectedTimeframe?: string,
 * }} params
 */
export function computeMetabolicMapCompassBundle({
  dailyHistory: dailyHistoryProp = [],
  bodyMetricsHistory: bodyMetricsHistoryProp = [],
  fullHistory = null,
  userTargets = null,
  projectionAnchorDate = null,
  selectedTimeframe = '7d',
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];
  const bodyMetricsHistory = Array.isArray(bodyMetricsHistoryProp) ? bodyMetricsHistoryProp : [];

  const { mapInputs, rawDetails } = computeMetabolicMapInputsAndAudit(dailyHistory, selectedTimeframe);

  const baselineOffset = resolveBaselineOffset(bodyMetricsHistory, dailyHistory);

  const mapPosition = calculateMetabolicMapPosition({
    energyBalance: mapInputs.energyBalance,
    trainingLoad: mapInputs.trainingLoad,
    sleepHours: mapInputs.sleepHours,
    glycemicInstability: mapInputs.glycemicInstability,
    baselineOffsetX: baselineOffset.x,
    baselineOffsetY: baselineOffset.y,
  });

  const mapZoneColor = mapZoneToGlowRgba(mapPosition.zone);

  const dailyMapPositions = (() => {
    const slice = dailyHistory.slice(-7);
    return slice.map((day) => buildDailyPointFromLogDay(day, baselineOffset));
  })();

  const projectedTrajectory = buildTrajectoryProjection(dailyMapPositions);

  const weightProjection = computeWeightProjectionFromInputs({
    bodyMetricsHistory,
    fullHistory,
    userTargets: userTargets || undefined,
    anchorDateStr: projectionAnchorDate,
  });
  const { lineProjection, lineTrend, lineConfidence } = formatWeightProjectionUI(weightProjection);

  const compassDirection = computeMetabolicCompassDirectionPure(dailyHistory, selectedTimeframe);

  const rawVector = { x: compassDirection.x, y: compassDirection.y };
  const visualVector = computeVisualCompassVector(rawVector);
  if (import.meta.env.DEV) {
    console.log('[CompassVisualLayer]', { raw: rawVector, visual: visualVector });
  }

  const currentMapPoint = dailyMapPositions.length ? dailyMapPositions[dailyMapPositions.length - 1] : null;
  const longevityScore = currentMapPoint
    ? calculateMetabolicScore(currentMapPoint.x, currentMapPoint.y)
    : calculateMetabolicScore(0, 0);

  const sleepPenalty =
    mapInputs.sleepHours < 7.5 ? Math.max(0, 7.5 - mapInputs.sleepHours) : 0;

  return {
    metabolicMapInputs: mapInputs,
    metabolicMapRawDetails: rawDetails,
    baselineOffset,
    mapZoneColor,
    dailyMapPositions,
    projectedTrajectory,
    lineProjection,
    lineTrend,
    lineConfidence,
    compassDirection,
    rawVector,
    visualVector,
    x: mapPosition.x,
    y: mapPosition.y,
    energyBalance: mapInputs.energyBalance,
    trainingLoad: mapInputs.trainingLoad,
    glycemic: mapInputs.glycemicInstability,
    sleepPenalty,
    distance: mapPosition.distance,
    quadrant: mapPosition.quadrant,
    longevityScore,
    debug: {
      zone: mapPosition.zone,
      finalAura: mapPosition.finalAura,
      rawDetails,
      compassDirection,
      rawVector,
      visualVector,
      mapInputs,
    },
  };
}
