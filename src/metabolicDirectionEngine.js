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
 * @param {{ kcalBalance: number, trainingLoad: number }} day
 * @returns {{ x: number, y: number }}
 */
export function normalizeMetabolicDay(day) {
  const x = clamp(day.kcalBalance / 500, -1, 1);
  const y = clamp(day.trainingLoad / 100, 0, 1);
  return { x, y };
}

/**
 * @param {Array<{ kcalBalance: number, trainingLoad: number }>} days
 * @returns {{ x: number, y: number }}
 */
export function averageNormalizedVec(days) {
  const n = days.length;
  if (n === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    const v = normalizeMetabolicDay(days[i]);
    sx += v.x;
    sy += v.y;
  }
  const k = 1 / n;
  return { x: sx * k, y: sy * k };
}

function tailAverage(days, maxLen) {
  if (!days.length) return { x: 0, y: 0 };
  const slice = days.length <= maxLen ? days : days.slice(-maxLen);
  return averageNormalizedVec(slice);
}

/**
 * Vettore target: media normalizzata sull’ultima finestra (1 / 7 / 14 / 30 giorni).
 * Se ci sono meno giorni della finestra, {@link tailAverage} usa tutti i giorni disponibili.
 * Poi correzione di coerenza (stessa logica di sempre).
 *
 * @param {Array<{ date?: string, kcalBalance: number, trainingLoad: number }>} days — più vecchio → più recente; ultimo = ieri (calendario)
 * @param {MetabolicTimeframe} [timeframe='7d']
 * @returns {{ x: number, y: number }}
 */
export function computeMetabolicEngineTargetVec(days, timeframe = '7d') {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safeDays = compassHistoryForEngine(days);
  let { x, y } = tailAverage(safeDays, windowDays);

  if (x > 0 && y < 0.3) y *= 0.72;
  if (x < 0 && y > 0.8) y *= 0.94;

  return { x, y };
}

export function historyFingerprint(days, timeframe = '7d') {
  const safeDays = compassHistoryForEngine(days);
  if (!safeDays.length) return `|${timeframe}`;
  return `${safeDays.length}:${safeDays.map((d) => `${d.date ?? ''}:${d.kcalBalance},${d.trainingLoad}`).join(';')}|${timeframe}`;
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
    const target = computeMetabolicEngineTargetVec(dailyHistory, timeframe);
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
