import { getStructuralBaselineOffsetFromHistory } from '../../../biometricHistory';
import {
  computeMetabolicEngineTargetVec,
  computeOutsideEnergyDeadbandDayFraction,
  computeEnergyDeadBandHalfWidthKcal,
  applyEnergyDeadBandToKcalBalance,
} from '../../../metabolicDirectionEngine';
import {
  METABOLIC_COMPASS_DIRECTIONS,
  metabolicAngleDegToCompassBearingDeg,
  normalizeDeg180,
} from '../../../metabolicDirection';
import {
  calculateBaselineOffset,
  calculateMetabolicMapPosition,
  getLastBiometricData,
} from '../../../metabolicMapEngine';
import { computeMetabolicMapInputsAndAudit } from '../../../metabolicMapPeriodInputs';
import { computeWeightProjectionFromInputs, formatWeightProjectionUI } from '../../../weightProjectionEngine';
import { buildMetabolicStateFromBundle } from './metabolicStateBuilder.js';

const METABOLIC_COMPASS_SNAPSHOT_RAD_TO_DEG = 180 / Math.PI;

function mapZoneToGlowRgba(zone) {
  if (zone === 'red') return 'rgba(120, 88, 92, 0.28)';
  if (zone === 'orange') return 'rgba(125, 100, 82, 0.28)';
  if (zone === 'green') return 'rgba(88, 108, 128, 0.28)';
  return '';
}

/** Fascia opacità ambiente bussola (midpoint tra min/max richiesti). */
const MAP_SIGNAL_STRENGTH_AMBIENT_OPACITY = {
  very_weak: 0.25,
  weak: 0.475,
  moderate: 0.725,
  strong: 0.925,
};

/** Blu cobalto = Blue Zone / longevity; ambra = adattamento; rosso morbido = rischio. */
const COMPASS_AMBIENT_ZONE_RGB = {
  green: { r: 64, g: 132, b: 218 },
  orange: { r: 232, g: 168, b: 82 },
  red: { r: 204, g: 108, b: 104 },
  fallback: { r: 118, g: 136, b: 158 },
};

const COMPASS_AMBIENT_INTENSITY_LABEL = {
  very_weak: 'Molto debole',
  weak: 'Debole',
  moderate: 'Moderato',
  strong: 'Forte',
};

/**
 * Alone / anello bussola da zona mappa (stesso timeframe) + intensità segnale.
 * Solo presentazione — non altera angoli né coordinate mappa.
 *
 * @param {'green'|'orange'|'red'|string|null|undefined} zone
 * @param {'very_weak'|'weak'|'moderate'|'strong'|string|null|undefined} mapSignalStrength
 * @returns {{
 *   color: string,
 *   glowColor: string,
 *   opacity: number,
 *   ringOpacity: number,
 *   intensityLabel: string,
 * }}
 */
export function buildCompassAmbientStyle(zone, mapSignalStrength) {
  const zKey =
    zone === 'green' || zone === 'orange' || zone === 'red' ? zone : 'fallback';
  const rgb = COMPASS_AMBIENT_ZONE_RGB[zKey];

  const s =
    mapSignalStrength === 'very_weak' ||
    mapSignalStrength === 'weak' ||
    mapSignalStrength === 'moderate' ||
    mapSignalStrength === 'strong'
      ? mapSignalStrength
      : 'very_weak';

  const opacity = MAP_SIGNAL_STRENGTH_AMBIENT_OPACITY[s] ?? 0.25;
  const ringOpacity = Math.min(0.92, 0.18 + opacity * 0.52);

  const color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const glowColor = color;

  return {
    color,
    glowColor,
    opacity,
    ringOpacity,
    intensityLabel: COMPASS_AMBIENT_INTENSITY_LABEL[s] ?? COMPASS_AMBIENT_INTENSITY_LABEL.very_weak,
  };
}

function clampAxis(v) {
  return Math.max(-100, Math.min(100, Number(v) || 0));
}

function dailyTrainingToMapAxis(dayTrainingLoad) {
  const t = Math.max(0, Math.min(100, Number(dayTrainingLoad) || 0));
  return clampAxis(((t - 35) / 65) * 100);
}

function buildDailyPointFromLogDay(day, baselineOffset, referenceTdee = 2000) {
  const kcalBalanceRaw = Number(day?.kcalBalance) || 0;
  const { adjusted: kcalBalance } = applyEnergyDeadBandToKcalBalance(kcalBalanceRaw, referenceTdee);
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

function nearestCompassSectorLabelFromMetabolicAngleDeg(angleDeg) {
  const bearing = metabolicAngleDegToCompassBearingDeg(angleDeg);
  let best = METABOLIC_COMPASS_DIRECTIONS[0];
  let bestDist = Infinity;
  for (let i = 0; i < METABOLIC_COMPASS_DIRECTIONS.length; i += 1) {
    const d = METABOLIC_COMPASS_DIRECTIONS[i];
    const dist = Math.abs(normalizeDeg180(bearing - d.angle));
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best.label;
}

/** Allineato alle soglie richieste (solo copy / confidenza, non il vettore). */
export function computeCompassSignalStrength(rawMagnitude) {
  const m = Number(rawMagnitude);
  if (!Number.isFinite(m)) return 'very_weak';
  if (m < 0.5) return 'very_weak';
  if (m < 1.5) return 'weak';
  if (m < 5) return 'moderate';
  return 'strong';
}

export function computeCompassDisplayLabel(sectorLabel, signalStrength) {
  if (signalStrength === 'very_weak') return 'Segnale debole / quasi neutro';
  if (signalStrength === 'weak') return `Tendenza lieve verso ${sectorLabel}`;
  if (signalStrength === 'moderate') return `Tendenza verso ${sectorLabel}`;
  return sectorLabel;
}

/** Oltre questo raggio (coordinate mappa −100…100) zona neutra semantica — no copy quadranti “ansiogeni”. */
const SEMANTIC_NEAR_CENTER_MAP_DISTANCE = 34;

/** Magnitudine normalizzata bussola sotto cui si considera praticamente equilibrio energetico (post dead-band). */
const COMPASS_MAGNITUDE_NEAR_ZERO = 0.058;

/** Giorni con |bilancio| fuori dead-band / finestra — soglie per label estreme. */
const PERSIST_FRAC_EXTREME_SOFT = 0.38;
const PERSIST_FRAC_EXTREME_FULL = 0.52;

/** Settori bussola con copy storico aggressivo: richiedono persistenza e ampiezza per nominarli. */
const EXTREME_COMPASS_SECTOR_LABELS = new Set([
  'Accumulo Grasso',
  'Surplus Disfunzionale',
  'Catabolismo',
  'Digiuno / Autofagia',
]);

/** Settori “costruttivi” da non nominare in modo pieno se energia neutra (dead-band) ma stimolo allenamento alto. */
const ANABOLIC_STRONG_SECTOR_LABELS = new Set(['Massa Pulita', 'Ricomposizione']);

/** Coerente col range x normalizzato post dead-band (~±500 kcal full scale): piccolo residuo = ancora “energia neutra”. */
const NEUTRAL_COMPASS_X_EPS = 0.035;

/** y normalizzato (0–1) sopra cui il training conta come stimolo significativo per il downgrade semantico. */
const TRAINING_SIGNIFICANT_Y = 0.3;

/**
 * Energia in dead-band sul periodo O vettore quasi neutro su x (fallback se audit assente).
 *
 * @param {boolean | null | undefined} deadBandAppliedOnMean
 * @param {number} compassX
 */
function isInsideEnergyDeadbandSemantic(deadBandAppliedOnMean, compassX) {
  const cx = Number(compassX) || 0;
  if (deadBandAppliedOnMean === true) return true;
  return Math.abs(cx) <= NEUTRAL_COMPASS_X_EPS;
}

/**
 * Label leggere quando geometria punta al quadrante costruttivo ma senza surplus energetico sostenuto.
 *
 * @param {'very_weak'|'weak'|'moderate'|'strong'} signalStrength
 */
function neutralEnergyTrainingAnabolicDisplayLabel(signalStrength) {
  if (signalStrength === 'very_weak') return 'Equilibrio con stimolo allenante';
  if (signalStrength === 'weak') return 'Ricomposizione lieve';
  if (signalStrength === 'moderate') return 'Mantenimento attivo';
  return 'Stimolo costruttivo moderato';
}

/**
 * Fase A — gating semantico: label estreme e tono “kentu” solo con segnale e persistenza sufficienti.
 * Refinement — energia neutra + training: no wording bulk/anabolico pieno su settori costruttivi.
 *
 * @param {{
 *   sectorLabel: string,
 *   rawMagnitude: number,
 *   signalStrength: ReturnType<typeof computeCompassSignalStrength>,
 *   persistFrac: number,
 *   mapDistance: number,
 *   compassX: number,
 *   compassY: number,
 *   deadBandAppliedOnMean: boolean | null | undefined,
 * }} p
 * @returns {{
 *   displayLabel: string,
 *   anabolicLabelDowngraded: boolean,
 *   insideEnergyDeadband: boolean,
 * }}
 */
function gateMetabolicCompassDisplayLabel({
  sectorLabel,
  rawMagnitude,
  signalStrength,
  persistFrac,
  mapDistance,
  compassX,
  compassY,
  deadBandAppliedOnMean,
}) {
  const mapDist = Number(mapDistance);
  const mag = Number(rawMagnitude) || 0;
  const persist = Number(persistFrac) || 0;
  const cy = Number(compassY) || 0;

  const insideEnergyDeadband = isInsideEnergyDeadbandSemantic(deadBandAppliedOnMean, compassX);
  const trainingSignificant = cy >= TRAINING_SIGNIFICANT_Y;

  const persistNotElevated = persist < PERSIST_FRAC_EXTREME_FULL;
  const magnitudeNotStrong = signalStrength !== 'strong';

  const shouldDowngradeAnabolicConstructive =
    ANABOLIC_STRONG_SECTOR_LABELS.has(sectorLabel) &&
    insideEnergyDeadband &&
    trainingSignificant &&
    (magnitudeNotStrong || persistNotElevated);

  if (shouldDowngradeAnabolicConstructive) {
    return {
      displayLabel: neutralEnergyTrainingAnabolicDisplayLabel(signalStrength),
      anabolicLabelDowngraded: true,
      insideEnergyDeadband,
    };
  }

  const nearMapCenter =
    Number.isFinite(mapDist) && mapDist >= 0 && mapDist <= SEMANTIC_NEAR_CENTER_MAP_DISTANCE;
  const nearEnergyNeutral = mag <= COMPASS_MAGNITUDE_NEAR_ZERO;

  if (nearMapCenter || nearEnergyNeutral) {
    if (signalStrength === 'very_weak' || nearEnergyNeutral) {
      return {
        displayLabel: 'Equilibrio metabolico',
        anabolicLabelDowngraded: false,
        insideEnergyDeadband,
      };
    }
    return {
      displayLabel: 'Segnale lieve',
      anabolicLabelDowngraded: false,
      insideEnergyDeadband,
    };
  }

  const isExtreme = EXTREME_COMPASS_SECTOR_LABELS.has(sectorLabel);
  if (!isExtreme) {
    return {
      displayLabel: computeCompassDisplayLabel(sectorLabel, signalStrength),
      anabolicLabelDowngraded: false,
      insideEnergyDeadband,
    };
  }

  if (signalStrength === 'very_weak' || signalStrength === 'weak') {
    return {
      displayLabel: computeCompassDisplayLabel(sectorLabel, signalStrength),
      anabolicLabelDowngraded: false,
      insideEnergyDeadband,
    };
  }

  if (persist < PERSIST_FRAC_EXTREME_SOFT) {
    return {
      displayLabel: 'Oscillazioni fisiologiche',
      anabolicLabelDowngraded: false,
      insideEnergyDeadband,
    };
  }

  if (persist < PERSIST_FRAC_EXTREME_FULL) {
    return {
      displayLabel: computeCompassDisplayLabel(sectorLabel, 'weak'),
      anabolicLabelDowngraded: false,
      insideEnergyDeadband,
    };
  }

  return {
    displayLabel: computeCompassDisplayLabel(sectorLabel, signalStrength),
    anabolicLabelDowngraded: false,
    insideEnergyDeadband,
  };
}

const MAP_QUADRANT_RISK_LABELS = {
  NW: 'Carico elevato e recupero ridotto',
  NE: 'Tendenza a surplus protratto',
  SW: 'Tendenza a deficit prolungato',
  SE: 'Surplus con scarso stimolo fisico',
};

/**
 * Pure presentation layer: coordinates and copy for weak bussola signal vs mappa (x/y motore invariati a monte).
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   mapSignalStrength: ReturnType<typeof computeCompassSignalStrength> | null | undefined,
 *   quadrant: string,
 *   riskLabel: string,
 *   longevityDrop: number,
 *   glycemicAura: number,
 *   mapDistance?: number,
 * }} p
 */
export function buildMapSignalPresentation({
  x,
  y,
  mapSignalStrength,
  quadrant,
  riskLabel,
  longevityDrop: _longevityDrop,
  glycemicAura,
  mapDistance,
}) {
  const gx = Number(x) || 0;
  const gy = Number(y) || 0;
  const aura = Number(glycemicAura) || 0;
  const rl =
    riskLabel ||
    MAP_QUADRANT_RISK_LABELS[quadrant] ||
    String(quadrant || '');

  const s =
    mapSignalStrength === 'very_weak' ||
    mapSignalStrength === 'weak' ||
    mapSignalStrength === 'moderate' ||
    mapSignalStrength === 'strong'
      ? mapSignalStrength
      : 'very_weak';

  const md = Number(mapDistance);
  const nearCenter =
    Number.isFinite(md) && md >= 0 && md <= SEMANTIC_NEAR_CENTER_MAP_DISTANCE;

  if (nearCenter) {
    const strongish = s === 'moderate' || s === 'strong';
    const scale = s === 'very_weak' ? 0.3 : s === 'weak' ? 0.6 : 1;
    return {
      displayX: clampAxis(gx * scale),
      displayY: clampAxis(gy * scale),
      displayAura: aura * scale,
      presentationTitle: strongish ? 'Direzione stabile' : 'Equilibrio metabolico',
      presentationCaption: strongish
        ? 'Assetto neutro: oscillazioni fisiologiche nell’area centrale.'
        : 'Oscillazioni fisiologiche nell’area centrale.',
      suppressRiskNarrative: true,
      suppressLongevityWarning: true,
    };
  }

  if (s === 'very_weak') {
    return {
      displayX: clampAxis(gx * 0.3),
      displayY: clampAxis(gy * 0.3),
      displayAura: aura * 0.3,
      presentationTitle: 'Segnale metabolico debole',
      presentationCaption: 'La posizione non è ancora significativa.',
      suppressRiskNarrative: true,
      suppressLongevityWarning: true,
    };
  }
  if (s === 'weak') {
    return {
      displayX: clampAxis(gx * 0.6),
      displayY: clampAxis(gy * 0.6),
      displayAura: aura * 0.6,
      presentationTitle: 'Tendenza metabolica leggera',
      presentationCaption: `Possibile tendenza verso ${rl}`,
      suppressRiskNarrative: false,
      suppressLongevityWarning: true,
    };
  }

  return {
    displayX: clampAxis(gx),
    displayY: clampAxis(gy),
    displayAura: aura,
    presentationTitle: null,
    presentationCaption: null,
    suppressRiskNarrative: false,
    suppressLongevityWarning: false,
  };
}

function computeMetabolicCompassDirectionPure(dailyHistory, timeframe, referenceTdee = 2000) {
  const { x, y } = computeMetabolicEngineTargetVec(dailyHistory, timeframe, referenceTdee);
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

  const utKcal = Number(userTargets?.kcal);
  const referenceTdee = Number.isFinite(utKcal) && utKcal > 0 ? utKcal : 2000;

  const { mapInputs, rawDetails } = computeMetabolicMapInputsAndAudit(
    dailyHistory,
    selectedTimeframe,
    referenceTdee,
  );

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
    return slice.map((day) => buildDailyPointFromLogDay(day, baselineOffset, referenceTdee));
  })();

  const projectedTrajectory = buildTrajectoryProjection(dailyMapPositions);

  const weightProjection = computeWeightProjectionFromInputs({
    bodyMetricsHistory,
    fullHistory,
    userTargets: userTargets || undefined,
    anchorDateStr: projectionAnchorDate,
  });
  const { lineProjection, lineTrend, lineConfidence } = formatWeightProjectionUI(weightProjection);

  const compassDirection = computeMetabolicCompassDirectionPure(
    dailyHistory,
    selectedTimeframe,
    referenceTdee,
  );

  const persistFracOutsideDeadband = computeOutsideEnergyDeadbandDayFraction(
    dailyHistory,
    selectedTimeframe,
    referenceTdee,
  );

  const rawVector = { x: compassDirection.x, y: compassDirection.y };
  const visualVector = computeVisualCompassVector(rawVector);

  const currentMapPoint = dailyMapPositions.length ? dailyMapPositions[dailyMapPositions.length - 1] : null;
  const longevityScore = currentMapPoint
    ? calculateMetabolicScore(currentMapPoint.x, currentMapPoint.y)
    : calculateMetabolicScore(0, 0);

  const mapPointX = Number.isFinite(Number(currentMapPoint?.x))
    ? Number(currentMapPoint.x)
    : mapPosition.x;
  const mapPointY = Number.isFinite(Number(currentMapPoint?.y))
    ? Number(currentMapPoint.y)
    : mapPosition.y;

  const mapDistanceSemantic = Math.hypot(mapPointX, mapPointY);

  const rawMagnitude = Math.hypot(rawVector.x, rawVector.y);
  const compassSectorLabel = nearestCompassSectorLabelFromMetabolicAngleDeg(compassDirection.angleDeg);
  const compassSignalStrength = computeCompassSignalStrength(rawMagnitude);
  const compassGating = gateMetabolicCompassDisplayLabel({
    sectorLabel: compassSectorLabel,
    rawMagnitude,
    signalStrength: compassSignalStrength,
    persistFrac: persistFracOutsideDeadband,
    mapDistance: mapDistanceSemantic,
    compassX: compassDirection.x,
    compassY: compassDirection.y,
    deadBandAppliedOnMean: rawDetails.deadBandAppliedOnMean,
  });
  const compassDisplayLabel = compassGating.displayLabel;

  if (import.meta.env.DEV) {
    console.log('[metabolicCompass:DEV]', {
      rawEnergyBalance: rawDetails.meanKcal,
      normalizedX: compassDirection.x,
      deadBandApplied: rawDetails.deadBandAppliedOnMean,
      energyDeadBandHalfWidthKcal: rawDetails.energyDeadBandHalfWidthKcal,
      persistFracOutsideDeadband,
      signalStrength: compassSignalStrength,
      finalLabel: compassDisplayLabel,
      rawSectorLabel: compassSectorLabel,
      anabolicLabelDowngraded: compassGating.anabolicLabelDowngraded,
      insideEnergyDeadband: compassGating.insideEnergyDeadband,
    });
  }

  const longevityScoreAnchorForDrop = calculateMetabolicScore(
    baselineOffset.x,
    baselineOffset.y
  );
  const longevityScoreFinalForDrop = calculateMetabolicScore(mapPointX, mapPointY);
  const longevityDrop = Math.max(0, longevityScoreAnchorForDrop - longevityScoreFinalForDrop);

  const mapPresentation = buildMapSignalPresentation({
    x: mapPointX,
    y: mapPointY,
    mapSignalStrength: compassSignalStrength,
    quadrant: mapPosition.quadrant,
    riskLabel: MAP_QUADRANT_RISK_LABELS[mapPosition.quadrant] || '',
    longevityDrop,
    glycemicAura: mapPosition.finalAura,
    mapDistance: mapDistanceSemantic,
  });

  const compassAmbientStyle = buildCompassAmbientStyle(
    mapPosition.zone,
    compassSignalStrength
  );

  if (import.meta.env.DEV) {
    console.log('[CompassAmbientStyle:engine]', compassAmbientStyle);
  }

  const sleepPenalty =
    mapInputs.sleepHours < 7.5 ? Math.max(0, 7.5 - mapInputs.sleepHours) : 0;

  const bundle = {
    selectedTimeframe,
    referenceTdeeKcal: referenceTdee,
    impactMultiplier: rawDetails.impactMultiplier ?? null,
    persistFracOutsideDeadband,
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
    rawMagnitude,
    compassSectorLabel,
    compassSignalStrength,
    /** Stessa soglia del motore bussola (rawMagnitude su rawVector). */
    mapSignalStrength: compassSignalStrength,
    compassDisplayLabel,
    x: mapPosition.x,
    y: mapPosition.y,
    energyBalance: mapInputs.energyBalance,
    trainingLoad: mapInputs.trainingLoad,
    glycemic: mapInputs.glycemicInstability,
    sleepPenalty,
    distance: mapPosition.distance,
    quadrant: mapPosition.quadrant,
    longevityScore,
    /** Allineamento bussola–mappa: coordinate e copy solo presentazione. */
    mapPresentation,
    compassAmbientStyle,
    debug: {
      zone: mapPosition.zone,
      finalAura: mapPosition.finalAura,
      rawDetails,
      compassDirection,
      rawVector,
      visualVector,
      rawMagnitude,
      compassSectorLabel,
      compassSignalStrength,
      mapSignalStrength: compassSignalStrength,
      compassDisplayLabel,
      mapPresentation,
      compassAmbientStyle,
      mapInputs,
    },
  };

  bundle.metabolicState = buildMetabolicStateFromBundle(bundle);

  if (import.meta.env.DEV) {
    const ms = bundle.metabolicState;
    console.log('[metabolicState:DEV]', {
      hasMetabolicState: ms != null,
      timeframe: ms?.calibration?.timeframe ?? null,
      signalStrength: ms?.metabolicDirection?.signalStrength ?? null,
      persistence: ms?.persistence?.outsideEnergyDeadbandDayFraction ?? null,
      zone: ms?.bodyState?.zone ?? null,
      displayLabel: ms?.metabolicDirection?.displayLabel ?? null,
    });
  }

  return bundle;
}
