/** @typedef {'high' | 'medium' | 'low' | 'rest'} ActivityIntensity */

/**
 * @typedef {object} DistributionDayInput
 * @property {ActivityIntensity} intensity
 * @property {string} [dayKey]
 */

/**
 * @typedef {DistributionDayInput & { deltaKcal: number }} DistributionDayResult
 */

export const GUARDRAILS = {
  maxSurplus: 400,
  maxDeficit: -250,
};

/** Limiti giornalieri per intensità (priorità Tetris). */
const INTENSITY_LIMITS = {
  high: { min: 0, max: 400 },
  medium: { min: 0, max: 200 },
  low: { min: -100, max: 50 },
  rest: { min: -250, max: 0 },
};

/** Centroidi iniziali pesati per intensità. */
const PREFERRED_DELTA = {
  high: 350,
  medium: 120,
  low: -20,
  rest: -140,
};

/** Priorità quando si aumenta il totale settimanale. */
const INCREASE_PRIORITY = {
  high: 4,
  medium: 3,
  low: 2,
  rest: 1,
};

/** Priorità quando si riduce il totale settimanale. */
const DECREASE_PRIORITY = {
  rest: 4,
  low: 3,
  medium: 2,
  high: 1,
};

const WEEKLY_TARGET_MIN = -1750;
const WEEKLY_TARGET_MAX = 2800;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {ActivityIntensity} intensity
 */
function limitsFor(intensity) {
  return INTENSITY_LIMITS[intensity] ?? INTENSITY_LIMITS.low;
}

/**
 * @param {DistributionDayInput[]} daysList
 */
export function getFeasibleWeeklyRange(daysList) {
  let minSum = 0;
  let maxSum = 0;
  daysList.forEach(({ intensity }) => {
    const lim = limitsFor(intensity);
    minSum += lim.min;
    maxSum += lim.max;
  });
  return { minSum, maxSum };
}

/**
 * @param {number} weeklyTargetKcal
 */
export function getWeeklyTargetLabel(weeklyTargetKcal) {
  const kcal = Math.round(Number(weeklyTargetKcal) || 0);
  if (kcal <= -1200) return `Cut Aggressivo ${kcal.toLocaleString('it-IT')} kcal`;
  if (kcal <= -500) return `Deficit ${kcal.toLocaleString('it-IT')} kcal`;
  if (kcal < 0) return `Cut Leggero ${kcal.toLocaleString('it-IT')} kcal`;
  if (kcal === 0) return 'Mantenimento 0 kcal';
  if (kcal <= 700) return `Massa Lieve +${kcal.toLocaleString('it-IT')} kcal`;
  if (kcal <= 1400) return `Massa Moderata +${kcal.toLocaleString('it-IT')} kcal`;
  return `Massa Aggressiva +${kcal.toLocaleString('it-IT')} kcal`;
}

export const WEEKLY_TARGET_RANGE = {
  min: WEEKLY_TARGET_MIN,
  max: WEEKLY_TARGET_MAX,
  step: 50,
  default: 700,
};

/**
 * Distribuisce il budget calorico settimanale su 7 giorni rispettando guardrail e intensità.
 * @param {number} weeklyTargetKcal — somma target dei deltaKcal settimanali
 * @param {DistributionDayInput[]} daysList — 7 giorni con `intensity`
 * @returns {DistributionDayResult[]}
 */
export function distributeCalories(weeklyTargetKcal, daysList) {
  if (!Array.isArray(daysList) || daysList.length === 0) return [];

  const limits = daysList.map(({ intensity }) => limitsFor(intensity));
  const { minSum, maxSum } = getFeasibleWeeklyRange(daysList);
  const target = clamp(
    Math.round(Number(weeklyTargetKcal) || 0),
    Math.max(minSum, WEEKLY_TARGET_MIN),
    Math.min(maxSum, WEEKLY_TARGET_MAX)
  );

  let deltas = daysList.map(({ intensity }) => {
    const lim = limitsFor(intensity);
    const preferred = PREFERRED_DELTA[intensity] ?? 0;
    return clamp(preferred, lim.min, lim.max);
  });

  let sum = deltas.reduce((acc, v) => acc + v, 0);
  const maxIterations = 5000;

  for (let iter = 0; iter < maxIterations && sum !== target; iter += 1) {
    const diff = target - sum;
    if (diff === 0) break;

    const direction = diff > 0 ? 1 : -1;
    const priorityMap = direction > 0 ? INCREASE_PRIORITY : DECREASE_PRIORITY;

    const candidates = daysList
      .map((day, index) => {
        const lim = limits[index];
        const current = deltas[index];
        const headroom =
          direction > 0 ? lim.max - current : current - lim.min;
        return { index, headroom, priority: priorityMap[day.intensity] ?? 0 };
      })
      .filter((c) => c.headroom > 0)
      .sort((a, b) => b.priority - a.priority || b.headroom - a.headroom);

    if (candidates.length === 0) break;

    const step = Math.min(Math.abs(diff), 50, candidates[0].headroom);
    const chosen = candidates[0].index;
    deltas[chosen] += direction * step;
    sum += direction * step;
  }

  if (sum !== target) {
    const residual = target - sum;
    const adjustable = daysList
      .map((day, index) => {
        const lim = limits[index];
        const current = deltas[index];
        const canUp = lim.max - current;
        const canDown = current - lim.min;
        return { index, canUp, canDown, priority: INCREASE_PRIORITY[day.intensity] ?? 0 };
      })
      .filter((c) => (residual > 0 ? c.canUp : c.canDown) > 0)
      .sort((a, b) => b.priority - a.priority);

    for (const adj of adjustable) {
      if (sum === target) break;
      const diff = target - sum;
      const dir = diff > 0 ? 1 : -1;
      const lim = limits[adj.index];
      const headroom = dir > 0 ? lim.max - deltas[adj.index] : deltas[adj.index] - lim.min;
      const step = Math.min(Math.abs(diff), headroom);
      if (step <= 0) continue;
      deltas[adj.index] += dir * step;
      sum += dir * step;
    }
  }

  return daysList.map((day, index) => ({
    ...day,
    deltaKcal: Math.round(deltas[index]),
  }));
}
