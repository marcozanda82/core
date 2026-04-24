/**
 * Peso: trend 7+7, confidenza (aderenza + completezza + stabilità), proiezione a breve.
 */

import { addDays } from './calendarDateUtils';
import { getLogFromStoricoTree, getYesterdayString } from './coreEngine';
import { mergeDuplicateBiometrics } from './biometricHistory';
import { computeAdherence } from './adherenceEngine';
import { computeTotali } from './useBiochimico';

const MIN_DAYS_PER_WINDOW = 3;
const MIN_PREV_WEEK_MEAN_KG = 20;

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Mappa (data ISO → peso kg) dalle biometrics unite per giorno.
 * @param {Array<Record<string, unknown>>} bodyMetricsHistory
 * @returns {Map<string, number>}
 */
function buildWeightByDayMap(bodyMetricsHistory) {
  const merged = mergeDuplicateBiometrics(Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : []);
  const map = new Map();
  for (const row of merged) {
    const d = typeof row?.date === 'string' ? row.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const w = Number(row.weight);
    if (Number.isFinite(w) && w > 5 && w < 500) map.set(d, w);
  }
  return map;
}

/**
 * Riferimento temporale: ieri (allineo bussola metabolica, oggi escluso).
 * @param {string | null | undefined} _anchorDateStr — mantenuto per compat; finestra fissa su ieri.
 * @returns {string}
 */
export function getProjectionEndDate(_anchorDateStr) {
  return getYesterdayString();
}

/**
 * Pesi osservati in una finestra di giorni ISO consecutivi (può avere buchi).
 * @param {Map<string, number>} weightByDay
 * @param {string[]} dayIsos
 * @returns {number[]}
 */
function pickWeightsForDays(weightByDay, dayIsos) {
  return dayIsos.map((d) => weightByDay.get(d)).filter((v) => Number.isFinite(v));
}

/**
 * Dati tracker: frazione giorni (max 7) con almeno una voce.
 * @param {object | null | undefined} fullHistory
 * @param {string} endDateIso
 * @returns {number}
 */
function dataCompletenessLast7(fullHistory, endDateIso) {
  let logged = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(endDateIso, -i);
    const log = getLogFromStoricoTree(fullHistory, d) || [];
    if (log.length > 0) logged += 1;
  }
  return logged / 7;
}

function countDaysWithLogLast7(fullHistory, endDateIso) {
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(endDateIso, -i);
    const log = getLogFromStoricoTree(fullHistory, d) || [];
    if (log.length > 0) n += 1;
  }
  return n;
}

/**
 * Serie kcal 7 giorni, dal vecchio al recente, per {@link computeAdherence}.
 * @param {object | null | undefined} fullHistory
 * @param {string} endDateIso
 * @returns {number[]}
 */
function last7DaysCaloriesChrono(fullHistory, endDateIso) {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = addDays(endDateIso, -i);
    const log = getLogFromStoricoTree(fullHistory, d) || [];
    const t = computeTotali(log);
    out.push(Number(t.kcal) || 0);
  }
  return out;
}

/**
 * Stabilità: ~1 con poca varianza, ~0 con molta (CV).
 * @param {number[]} weights
 * @returns {number}
 */
function weightStabilityFromLastWeights(weights) {
  if (!Array.isArray(weights) || weights.length < 2) return 0.4;
  const m = mean(weights);
  if (!Number.isFinite(m) || m < 1) return 0.4;
  const st = sampleStdDev(weights);
  const cv = st / m;
  return clamp01(1 - Math.min(1, cv * 6));
}

function sampleStdDev(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

/**
 * Etichetta trend da variazione relativa (decimale, es. 0.01 = 1%).
 * Soglie: >0.2% crescita lenta, >0.5% moderata, >1% veloce; simmetrico sotto 0; ±0.2% stabile.
 * @param {number} weightChange
 * @returns {string}
 */
export function trendLabelFromWeightChange(weightChange) {
  if (!Number.isFinite(weightChange)) return 'stabile';
  if (weightChange > 0.01) return 'crescita veloce';
  if (weightChange > 0.005) return 'crescita moderata';
  if (weightChange > 0.002) return 'crescita lenta';
  if (weightChange >= -0.002) return 'stabile';
  return 'in calo';
}

/**
 * @param {number} score
 * @returns {'alta' | 'media' | 'bassa'}
 */
export function confidenceLabelFromScore(score) {
  if (!Number.isFinite(score)) return 'bassa';
  if (score >= 0.8) return 'alta';
  if (score > 0.6) return 'media';
  return 'bassa';
}

/**
 * Giorni di proiezione (valore singolo) in base alla confidenza.
 * @param {'alta' | 'media' | 'bassa'} label
 * @returns {number | null}
 */
function projectionDaysForConfidence(label) {
  if (label === 'alta') return 6;
  if (label === 'media') return 4;
  return null;
}

/**
 * @param {object} input
 * @param {Array<Record<string, unknown>>} [input.bodyMetricsHistory]
 * @param {object | null | undefined} [input.fullHistory]
 * @param {{ kcal?: number } | null | undefined} [input.userTargets]
 * @param {string | null} [input.anchorDateStr] — inutilizzata; riferimento = ieri
 * @returns {{
 *   projected_range: { min: number, max: number } | null,
 *   projection_days: number | null,
 *   trend_label: string,
 *   confidence_label: 'alta' | 'media' | 'bassa',
 *   adherence_score: number,
 * }}
 */
export function computeWeightProjectionFromInputs({
  bodyMetricsHistory = [],
  fullHistory = null,
  userTargets = null,
  anchorDateStr: _anchorDateStr = null,
} = {}) {
  const endDate = getProjectionEndDate(_anchorDateStr);
  const weightByDay = buildWeightByDayMap(bodyMetricsHistory);

  const last7Isos = Array.from({ length: 7 }, (_, i) => addDays(endDate, -i));
  const prev7Isos = Array.from({ length: 7 }, (_, i) => addDays(endDate, -(7 + i)));

  const wLast = pickWeightsForDays(weightByDay, last7Isos);
  const wPrev = pickWeightsForDays(weightByDay, prev7Isos);
  const avgLast = wLast.length >= MIN_DAYS_PER_WINDOW ? mean(wLast) : null;
  const avgPrev = wPrev.length >= MIN_DAYS_PER_WINDOW ? mean(wPrev) : null;

  let weightChangeRatio = null;
  if (avgLast != null && avgPrev != null && avgPrev >= MIN_PREV_WEEK_MEAN_KG) {
    weightChangeRatio = (avgLast - avgPrev) / avgPrev;
  }

  const trend_label =
    weightChangeRatio == null ? 'stabile' : trendLabelFromWeightChange(weightChangeRatio);

  const dataCompleteness = dataCompletenessLast7(fullHistory, endDate);

  const kcalTarget = Number(userTargets?.kcal);
  const daily7 = last7DaysCaloriesChrono(fullHistory, endDate);
  const daysLogged = countDaysWithLogLast7(fullHistory, endDate);
  const { adherence_score: rawAdh } = computeAdherence({
    daily_calories: daily7,
    calorie_target: Number.isFinite(kcalTarget) && kcalTarget > 0 ? kcalTarget : 2000,
    days_logged: daysLogged,
    total_days: 7,
  });
  const adherence = rawAdh == null ? 0.5 : clamp01(rawAdh);

  const weightStab = weightStabilityFromLastWeights(wLast);

  const confidenceScore = clamp01((adherence + dataCompleteness + weightStab) / 3);
  const confidence_label = confidenceLabelFromScore(confidenceScore);

  let projected_range = null;
  let projection_days = null;
  if (confidence_label === 'bassa' || weightChangeRatio == null || !Number.isFinite(avgLast)) {
    return {
      projected_range: null,
      projection_days: null,
      trend_label,
      confidence_label,
      adherence_score: adherence,
    };
  }

  projection_days = projectionDaysForConfidence(confidence_label);

  const weeklyDeltaKg = avgLast - avgPrev;
  const centerDelta = (weeklyDeltaKg * projection_days) / 7;
  const spread = Math.max(0.05, sampleStdDev(wLast) * 0.35);
  const min = centerDelta - spread;
  const max = centerDelta + spread;
  const round1 = (x) => Math.round(x * 10) / 10;
  projected_range = { min: round1(min), max: round1(max) };

  return {
    projected_range,
    projection_days,
    trend_label,
    confidence_label,
    adherence_score: adherence,
  };
}

/**
 * Formattazione UI minima (trend e confidenza qualitative; proiezione numerica solo se ok).
 * @param {ReturnType<typeof computeWeightProjectionFromInputs>} p
 * @returns {{ lineProjection: string | null, lineTrend: string, lineConfidence: string }}
 */
export function formatWeightProjectionUI(p) {
  const { projected_range, projection_days, trend_label, confidence_label } = p;
  const lineTrend = `Trend: ${trend_label}`;
  const lineConfidence = `Confidenza: ${confidence_label}`;

  if (
    confidence_label === 'bassa' ||
    projected_range == null ||
    projection_days == null
  ) {
    return { lineProjection: null, lineTrend, lineConfidence };
  }

  const fmt = (n) => {
    const s = n.toFixed(1).replace('.', ',');
    if (n > 0) return `+${s}`;
    return s;
  };
  const a = fmt(projected_range.min);
  const b = fmt(projected_range.max);
  const lineProjection = `${a} → ${b} kg in ${projection_days} giorni`;

  return { lineProjection, lineTrend, lineConfidence };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const OPTIMAL_ZONE_RADIUS = 35;
const SMALL_DISTANCE_DELTA = 1.5;

function pointDistanceFromCenter(pos) {
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return NaN;
  return Math.hypot(x, y);
}

function mapTrendToSeverity(trendLabel) {
  const t = String(trendLabel || '').toLowerCase();
  if (t.includes('crescita veloce')) return 3;
  if (t.includes('crescita moderata')) return 2;
  if (t.includes('crescita lenta')) return 1;
  if (t.includes('stabile')) return 0;
  if (t.includes('in calo')) return -1;
  return 0;
}

/**
 * Alert traiettoria intelligente: notifica solo cambiamenti significativi.
 *
 * @param {object} input
 * @param {{x:number,y:number}} input.current_position
 * @param {{x:number,y:number}} input.ghost_position
 * @param {string} input.trend_label
 * @param {'alta'|'media'|'bassa'} input.confidence_label
 * @param {number} input.adherence_score
 * @param {number | null | undefined} input.lastNotificationAt
 * @param {number} [input.projected_days]
 * @param {string | null | undefined} [input.prev_trend_label]
 * @param {number | null | undefined} [input.nowMs]
 * @returns {{ shouldNotify: boolean, message: string }}
 */
export function computeTrajectoryAlert(input = {}) {
  const confidence = String(input?.confidence_label || '').toLowerCase();
  const adherence = Number(input?.adherence_score);
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const lastAt = Number(input?.lastNotificationAt);

  if (confidence !== 'alta') return { shouldNotify: false, message: '' };
  if (!Number.isFinite(adherence) || adherence < 0.7) return { shouldNotify: false, message: '' };
  if (Number.isFinite(lastAt) && nowMs - lastAt < ONE_DAY_MS) {
    return { shouldNotify: false, message: '' };
  }

  const trendLabel = String(input?.trend_label || '').toLowerCase();
  const currentDist = pointDistanceFromCenter(input?.current_position);
  const ghostDist = pointDistanceFromCenter(input?.ghost_position);
  const deltaFromCenter = ghostDist - currentDist;
  const absDelta = Math.abs(deltaFromCenter);

  // Ignore micro movimenti / rumore.
  if (!Number.isFinite(currentDist) || !Number.isFinite(ghostDist) || absDelta < SMALL_DISTANCE_DELTA) {
    return { shouldNotify: false, message: '' };
  }

  const projectedDaysRaw = Number(input?.projected_days);
  const projectedDays = Number.isFinite(projectedDaysRaw) ? projectedDaysRaw : 3;
  const ghostOutsideOptimal = ghostDist > OPTIMAL_ZONE_RADIUS;
  const movingAway = deltaFromCenter > 0;
  const movingToward = deltaFromCenter < 0;

  // TYPE 1 — EXIT ZONE
  if (ghostOutsideOptimal && projectedDays >= 2 && projectedDays <= 4) {
    return {
      shouldNotify: true,
      message: 'Se continui cosi, uscirai dalla zona entro pochi giorni',
    };
  }

  // IGNORE: trend stabile (eccetto traiettoria positiva esplicita)
  const trendStable = trendLabel.includes('stabile');
  if (trendStable && !movingToward) {
    return { shouldNotify: false, message: '' };
  }

  // TYPE 2 — NEGATIVE DRIFT
  const prevTrendSeverity = mapTrendToSeverity(input?.prev_trend_label);
  const currTrendSeverity = mapTrendToSeverity(trendLabel);
  const trendWorsening = currTrendSeverity > prevTrendSeverity || currTrendSeverity >= 2;
  if (trendWorsening && movingAway) {
    return {
      shouldNotify: true,
      message: 'Stai lentamente uscendo dalla zona ottimale',
    };
  }

  // TYPE 3 — POSITIVE TRAJECTORY
  if (movingToward && trendStable && confidence === 'alta') {
    return {
      shouldNotify: true,
      message: 'Se continui cosi, sei in traiettoria perfetta',
    };
  }

  return { shouldNotify: false, message: '' };
}
