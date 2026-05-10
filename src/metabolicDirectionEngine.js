import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getTodayString } from './coreEngine';

const RAD_TO_DEG = 180 / Math.PI;

/** @typedef {'1d' | '7d' | '14d' | '30d'} MetabolicTimeframe */

/** Finestra giorni per il sottoinsieme di `dailyHistory` (ultimo = ieri di calendario; oggi escluso dal vettore). */
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

const SMOOTH_ALPHA = 0.15;
const ANGLE_NOISE_HALF_SPAN_DEG = 2;

/** Fascia neutra sul bilancio kcal (intake − TDEE): max tra minimo assoluto e % TDEE, cappata. */
const METABOLIC_ENERGY_DEADBAND_MIN_KCAL = 75;
const METABOLIC_ENERGY_DEADBAND_TDEE_FRAC = 0.04;
const METABOLIC_ENERGY_DEADBAND_MAX_KCAL = 125;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Esclude voci con `date === oggi` (serie Firebase: ultimo giorno = ieri).
 *
 * @param {Array<{ date?: string, kcalBalance: number, trainingLoad: number }>} days
 */
function compassHistoryForEngine(days) {
  const today = getTodayString();
  return (days || []).filter((e) => e?.date !== today);
}

/**
 * Metà larghezza dead-band energetica (kcal) rispetto al TDEE di riferimento.
 * Esempio: TDEE 2500 → max(75, 100) cappato a 125 → |±100| kcal ≈ neutri.
 *
 * @param {number} [referenceTdee]
 * @returns {number}
 */
export function computeEnergyDeadBandHalfWidthKcal(referenceTdee = 2000) {
  const tdee = Number(referenceTdee);
  if (!Number.isFinite(tdee) || tdee <= 0) return METABOLIC_ENERGY_DEADBAND_MIN_KCAL;
  const fromPct = Math.abs(tdee) * METABOLIC_ENERGY_DEADBAND_TDEE_FRAC;
  return Math.min(
    METABOLIC_ENERGY_DEADBAND_MAX_KCAL,
    Math.max(METABOLIC_ENERGY_DEADBAND_MIN_KCAL, fromPct),
  );
}

/**
 * @param {number} kcalBalance intake − TDEE
 * @param {number} [referenceTdee]
 * @returns {{ adjusted: number, deadBandApplied: boolean, halfWidthKcal: number }}
 */
export function applyEnergyDeadBandToKcalBalance(kcalBalance, referenceTdee = 2000) {
  const half = computeEnergyDeadBandHalfWidthKcal(referenceTdee);
  const kb = Number(kcalBalance) || 0;
  if (Math.abs(kb) <= half) {
    return { adjusted: 0, deadBandApplied: true, halfWidthKcal: half };
  }
  return { adjusted: kb, deadBandApplied: false, halfWidthKcal: half };
}

/**
 * Finestra giorni effettiva del motore bussola (senza oggi).
 *
 * @param {Array<{ date?: string, kcalBalance?: number, trainingLoad?: number }>} days
 * @param {MetabolicTimeframe} [timeframe='7d']
 */
export function getMetabolicDirectionWindowSlice(days, timeframe = '7d') {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safeDays = compassHistoryForEngine(days);
  if (!safeDays.length) return [];
  return safeDays.length <= windowDays ? safeDays : safeDays.slice(-windowDays);
}

/**
 * Frazione di giorni nella finestra con |bilancio kcal| oltre la dead-band (persistenza direzione energetica).
 *
 * @param {Array<{ date?: string, kcalBalance?: number }>} dailyHistory
 * @param {MetabolicTimeframe} timeframe
 * @param {number} [referenceTdee]
 * @returns {number} in [0, 1]
 */
export function computeOutsideEnergyDeadbandDayFraction(dailyHistory, timeframe, referenceTdee = 2000) {
  const slice = getMetabolicDirectionWindowSlice(dailyHistory, timeframe);
  if (!slice.length) return 0;
  const half = computeEnergyDeadBandHalfWidthKcal(referenceTdee);
  let n = 0;
  for (let i = 0; i < slice.length; i += 1) {
    if (Math.abs(Number(slice[i]?.kcalBalance) || 0) > half) n += 1;
  }
  return n / slice.length;
}

/**
 * @param {{ kcalBalance: number, trainingLoad: number }} day
 * @param {number} [referenceTdee=2000]
 * @returns {{ x: number, y: number }}
 */
export function normalizeMetabolicDay(day, referenceTdee = 2000) {
  const { adjusted } = applyEnergyDeadBandToKcalBalance(day.kcalBalance, referenceTdee);
  const x = clamp(adjusted / 500, -1, 1);
  const y = clamp(day.trainingLoad / 100, 0, 1);
  return { x, y };
}

/**
 * @param {Array<{ kcalBalance: number, trainingLoad: number }>} days
 * @param {number} [referenceTdee=2000]
 * @returns {{ x: number, y: number }}
 */
export function averageNormalizedVec(days, referenceTdee = 2000) {
  const n = days.length;
  if (n === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    const v = normalizeMetabolicDay(days[i], referenceTdee);
    sx += v.x;
    sy += v.y;
  }
  const k = 1 / n;
  return { x: sx * k, y: sy * k };
}

function tailAverage(days, maxLen, referenceTdee = 2000) {
  if (!days.length) return { x: 0, y: 0 };
  const slice = days.length <= maxLen ? days : days.slice(-maxLen);
  return averageNormalizedVec(slice, referenceTdee);
}

/**
 * Vettore target: media normalizzata sull’ultima finestra (1 / 7 / 14 / 30 giorni).
 * Se ci sono meno giorni della finestra, {@link tailAverage} usa tutti i giorni disponibili.
 * Poi correzione di coerenza (stessa logica di sempre).
 *
 * @param {Array<{ date?: string, kcalBalance: number, trainingLoad: number }>} days — più vecchio → più recente; ultimo = ieri (calendario)
 * @param {MetabolicTimeframe} [timeframe='7d']
 * @param {number} [referenceTdee=2000] TDEE utente per dead-band energetica (allineato a buildMetabolicCompassDailyHistory).
 * @returns {{ x: number, y: number }}
 */
export function computeMetabolicEngineTargetVec(days, timeframe = '7d', referenceTdee = 2000) {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safeDays = compassHistoryForEngine(days);
  let { x, y } = tailAverage(safeDays, windowDays, referenceTdee);

  if (x > 0 && y < 0.3) y *= 0.72;
  if (x < 0 && y > 0.8) y *= 0.94;

  return { x, y };
}

export function historyFingerprint(days, timeframe = '7d') {
  const safeDays = compassHistoryForEngine(days);
  if (!safeDays.length) return `|${timeframe}`;
  return `${safeDays.length}:${safeDays
    .map((d) => {
      const sh =
        d.sleepHours != null && Number.isFinite(Number(d.sleepHours))
          ? Number(d.sleepHours)
          : '';
      return `${d.date ?? ''}:${d.kcalBalance},${d.trainingLoad},${sh}`;
    })
    .join(';')}|${timeframe}`;
}

/**
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} next
 * @param {number} t
 */
export function lerpVec(prev, next, t) {
  return {
    x: lerp(prev.x, next.x, t),
    y: lerp(prev.y, next.y, t),
  };
}

/**
 * Output motore: angolo (con micro-rumore stabile per fingerprint) e magnitudine dal vettore smussato.
 *
 * @param {Array<{ date?: string, kcalBalance: number, trainingLoad: number }>} dailyHistory
 * @param {MetabolicTimeframe} [timeframe='7d']
 * @returns {{ angleDeg: number, angle: number, magnitude: number, x: number, y: number }}
 */
export function useMetabolicDirectionEngine(dailyHistory, timeframe = '7d') {
  const fp = historyFingerprint(dailyHistory, timeframe);

  const angleNoiseDeg = useMemo(
    () => (Math.random() * 2 - 1) * ANGLE_NOISE_HALF_SPAN_DEG,
    [fp]
  );

  const previousVecRef = useRef({ x: 0, y: 0 });
  const [smoothed, setSmoothed] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const target = computeMetabolicEngineTargetVec(dailyHistory, timeframe, 2000);
    const next = lerpVec(previousVecRef.current, target, SMOOTH_ALPHA);
    previousVecRef.current = next;
    setSmoothed(next);
  }, [fp]); // eslint-disable-line react-hooks/exhaustive-deps -- fp codifica dailyHistory+timeframe

  return useMemo(() => {
    const angleRad = Math.atan2(smoothed.y, smoothed.x);
    const angleDeg = angleRad * RAD_TO_DEG + angleNoiseDeg;
    const magnitude = Math.sqrt(smoothed.x * smoothed.x + smoothed.y * smoothed.y);
    return {
      angleDeg,
      angle: angleDeg,
      magnitude,
      x: smoothed.x,
      y: smoothed.y,
    };
  }, [smoothed, angleNoiseDeg]);
}
