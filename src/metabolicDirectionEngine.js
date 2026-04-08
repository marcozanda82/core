import { useLayoutEffect, useMemo, useRef, useState } from 'react';

const RAD_TO_DEG = 180 / Math.PI;

const W_TODAY = 0.2;
const W_7 = 0.4;
const W_14 = 0.25;
const W_30 = 0.15;

const SMOOTH_ALPHA = 0.15;
const ANGLE_NOISE_HALF_SPAN_DEG = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
 * Peso combinato (oggi, 7g, 14g, 30g) + correzione di coerenza. Nessuna categoria nominale.
 *
 * @param {Array<{ kcalBalance: number, trainingLoad: number }>} days — ordinati dal più vecchio al più recente; ultimo = oggi
 * @returns {{ x: number, y: number }}
 */
export function computeMetabolicEngineTargetVec(days) {
  const today = tailAverage(days, 1);
  const avg7d = tailAverage(days, 7);
  const avg14d = tailAverage(days, 14);
  const avg30d = tailAverage(days, 30);

  let x =
    W_TODAY * today.x + W_7 * avg7d.x + W_14 * avg14d.x + W_30 * avg30d.x;
  let y =
    W_TODAY * today.y + W_7 * avg7d.y + W_14 * avg14d.y + W_30 * avg30d.y;

  if (x > 0 && y < 0.3) y *= 0.72;
  if (x < 0 && y > 0.8) y *= 0.94;

  return { x, y };
}

export function historyFingerprint(days) {
  if (!days?.length) return '';
  return `${days.length}:${days.map((d) => `${d.kcalBalance},${d.trainingLoad}`).join(';')}`;
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
 * @param {Array<{ kcalBalance: number, trainingLoad: number }>} dailyHistory
 * @returns {{ angleDeg: number, angle: number, magnitude: number, x: number, y: number }}
 */
export function useMetabolicDirectionEngine(dailyHistory) {
  const fp = historyFingerprint(dailyHistory);

  const angleNoiseDeg = useMemo(
    () => (Math.random() * 2 - 1) * ANGLE_NOISE_HALF_SPAN_DEG,
    [fp]
  );

  const previousVecRef = useRef({ x: 0, y: 0 });
  const [smoothed, setSmoothed] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const target = computeMetabolicEngineTargetVec(dailyHistory);
    const next = lerpVec(previousVecRef.current, target, SMOOTH_ALPHA);
    previousVecRef.current = next;
    setSmoothed(next);
  }, [fp]); // eslint-disable-line react-hooks/exhaustive-deps -- fp codifica dailyHistory

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
