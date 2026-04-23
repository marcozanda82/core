import { addDays } from './calendarDateUtils';
import { getCombinedDayLogAndManualNodes, sumFoodKcalAndProtein, metricEntryToIsoDay } from './coreEngine';
import { buildCoachOutput } from './coachEngine';
import { computeAdherence } from './adherenceEngine';

/** Fixed kcal nudge when progress rules fire (spec §6). */
export const CALORIE_ADJUSTMENT_STEP = 150;

const STABLE_BAND = 0.002; // ±0.2%
const MASS_LO = 0.002;
const MASS_HI = 0.007;
const CUT_LO = -0.002;
const CUT_HI = -0.01;
const MAINT_BAND = 0.005; // 0.5%
const MIN_DAYS = 14;
const EVAL_COOLDOWN_MS = 10 * 86400000;

/** @typedef {'mass' | 'cut' | 'maintain'} MassCutMaintain */

const GOAL_PCT = { mass: 0.1, cut: -0.2, maintain: 0 };

/**
 * Map profile goals to mass | cut | maintain.
 * @param {Record<string, unknown>} [profile]
 * @returns {MassCutMaintain}
 */
export function goalFromProfile(profile = {}) {
  const ng = profile.nutritionGoal || profile.nutrition_goal;
  if (ng === 'cut' || profile.goal === 'lose') return 'cut';
  if (ng === 'bulk' || profile.goal === 'gain') return 'mass';
  return 'maintain';
}

function mean(arr) {
  if (!arr.length) return NaN;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
}

function buildLast7DayAdherenceInput(fullHistory, anchorDateIso, calorieTarget) {
  const daily_calories = [];
  let days_logged = 0;
  const total_days = 7;

  for (let i = 0; i < total_days; i += 1) {
    const d = addDays(anchorDateIso, -(total_days - 1) + i);
    const dayLog = getCombinedDayLogAndManualNodes(fullHistory, d) || [];
    const { kcal } = sumFoodKcalAndProtein(dayLog);
    const kcalSafe = Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 0;
    daily_calories.push(kcalSafe);
    if (dayLog.length > 0) days_logged += 1;
  }

  return {
    daily_calories,
    calorie_target: Number(calorieTarget),
    days_logged,
    total_days,
  };
}

/**
 * @param {unknown[]} bodyMetricsHistory
 * @param {string} endIso
 * @returns {{ weights: number[], calories: number[], ok: boolean, missingWeightDays: number }}
 */
export function build14DayWeightAndCaloriesSeries(bodyMetricsHistory, fullHistory, endIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endIso))) {
    return { weights: [], calories: [], ok: false, missingWeightDays: MIN_DAYS };
  }

  const sorted = [...(bodyMetricsHistory || [])]
    .map((e) => ({
      e,
      d: metricEntryToIsoDay(e),
      w: Number(e?.weight),
    }))
    .filter((x) => x.d && Number.isFinite(x.w) && x.w > 0)
    .sort((a, b) => a.d.localeCompare(b.d) || (Number(a.e?.timestamp) || 0) - (Number(b.e?.timestamp) || 0));

  if (!sorted.length) {
    return { weights: [], calories: [], ok: false, missingWeightDays: MIN_DAYS };
  }

  const startIso = addDays(endIso, -(MIN_DAYS - 1));
  let j = 0;
  let lastW = null;
  for (; j < sorted.length && sorted[j].d < startIso; j += 1) {
    lastW = sorted[j].w;
  }

  const weights = [];
  const calories = [];
  let missingWeightDays = 0;

  for (let i = 0; i < MIN_DAYS; i += 1) {
    const d = addDays(startIso, i);
    while (j < sorted.length && sorted[j].d <= d) {
      lastW = sorted[j].w;
      j += 1;
    }
    if (lastW == null) {
      missingWeightDays += 1;
      weights.push(NaN);
    } else {
      weights.push(lastW);
    }
    const dayLog = getCombinedDayLogAndManualNodes(fullHistory, d) || [];
    const { kcal } = sumFoodKcalAndProtein(dayLog);
    calories.push(Number.isFinite(kcal) ? kcal : 0);
  }

  const ok = missingWeightDays === 0;
  return { weights, calories, ok, missingWeightDays };
}

/**
 * @param {number[]} weights — length 14
 * @param {number[]} calories — length 14
 */
function rolling7AndTrend(weights, calories) {
  const wPrev = mean(weights.slice(0, 7));
  const wNow = mean(weights.slice(7, 14));
  const cNow = mean(calories.slice(7, 14));
  if (!Number.isFinite(wPrev) || wPrev <= 0 || !Number.isFinite(wNow) || !Number.isFinite(cNow)) {
    return { weightAvgPrev: NaN, weightAvgNow: NaN, calAvgNow: NaN, weightTrend: NaN };
  }
  const weightTrend = (wNow - wPrev) / wPrev;
  return { weightAvgPrev: wPrev, weightAvgNow: wNow, calAvgNow: cNow, weightTrend };
}

/**
 * @param {number} calNow
 * @param {number} wTrend
 */
function estimateTdeeKcal(calNow, wTrend) {
  if (!Number.isFinite(calNow) || calNow < 0) return NaN;
  const a = Math.abs(wTrend);
  if (!Number.isFinite(wTrend) || a <= STABLE_BAND) {
    return calNow;
  }
  if (wTrend > STABLE_BAND) {
    return calNow - calNow * wTrend;
  }
  return calNow + calNow * a;
}

/**
 * @param {MassCutMaintain} goal
 * @param {number} wTrend
 * @param {number} baseTarget
 * @returns {{ decision: 'increase' | 'decrease' | 'keep', calorieTarget: number }}
 */
function applyProgressNudge(goal, wTrend, baseTarget) {
  let decision = 'keep';
  if (goal === 'mass') {
    if (wTrend < MASS_LO) decision = 'increase';
    else if (wTrend > MASS_HI) decision = 'decrease';
  } else if (goal === 'cut') {
    if (wTrend > CUT_LO) decision = 'decrease';
    else if (wTrend < CUT_HI) decision = 'increase';
  } else {
    if (Math.abs(wTrend) > MAINT_BAND) {
      decision = wTrend > 0 ? 'decrease' : 'increase';
    }
  }

  let calorieTarget = baseTarget;
  if (decision === 'increase') calorieTarget = baseTarget + CALORIE_ADJUSTMENT_STEP;
  else if (decision === 'decrease') calorieTarget = baseTarget - CALORIE_ADJUSTMENT_STEP;

  return { decision, calorieTarget };
}

/**
 * Data-driven maintenance + goal-based calorie target. Deterministic: same inputs → same outputs.
 *
 * @param {object} p
 * @param {string} p.anchorDateIso — YYYY-MM-DD (usually weigh-in / “today” for tracker)
 * @param {object | null} p.fullHistory — tracker_data tree
 * @param {unknown[]} p.bodyMetricsHistory
 * @param {MassCutMaintain} p.goal
 * @param {number | null | undefined} p.currentCalorieTarget — current target kcal used for adherence check
 * @param {number | null | undefined} p.lastTdeeEvalAt — ms since epoch; optional
 * @param {number} [p.nowMs] — for tests
 * @returns {{
 *  tdee: number | null,
 *  calorie_target: number | null,
 *  decision: 'increase' | 'decrease' | 'keep' | 'hold',
 *  canUpdate: boolean,
 *  skipReasons: string[],
 *  weight_trend: number | null,
 *  base_target: number | null,
 *  coach_override: 'insufficient_data' | 'low_adherence' | null,
 *  adherence: { score: number | null, level: 'high' | 'medium' | 'low' }
 * }}
 */
export function computeDataDrivenTdee({
  anchorDateIso,
  fullHistory,
  bodyMetricsHistory,
  goal = 'maintain',
  currentCalorieTarget = null,
  lastTdeeEvalAt = null,
  nowMs = Date.now(),
}) {
  const g = goal === 'mass' || goal === 'cut' ? goal : 'maintain';
  const rawAdherence = computeAdherence(
    buildLast7DayAdherenceInput(fullHistory, anchorDateIso, currentCalorieTarget)
  );
  const adherence = {
    score: rawAdherence.adherence_score,
    level: rawAdherence.adherence_level,
  };

  if (adherence.score == null) {
    return {
      tdee: null,
      calorie_target: null,
      decision: 'hold',
      canUpdate: false,
      skipReasons: ['adherence_insufficient_data'],
      weight_trend: null,
      base_target: null,
      coach_override: 'insufficient_data',
      adherence,
    };
  }

  if (adherence.score < 0.7) {
    return {
      tdee: null,
      calorie_target: null,
      decision: 'hold',
      canUpdate: false,
      skipReasons: ['low_adherence'],
      weight_trend: null,
      base_target: null,
      coach_override: 'low_adherence',
      adherence,
    };
  }

  const series = build14DayWeightAndCaloriesSeries(bodyMetricsHistory, fullHistory, anchorDateIso);
  if (!series.ok || series.weights.length < MIN_DAYS) {
    return {
      tdee: null,
      calorie_target: null,
      decision: 'hold',
      canUpdate: false,
      skipReasons: ['insufficient_data_14d'],
      weight_trend: null,
      base_target: null,
      coach_override: 'insufficient_data',
      adherence,
    };
  }

  const gate = [];
  if (lastTdeeEvalAt != null && Number.isFinite(Number(lastTdeeEvalAt)) && (nowMs - Number(lastTdeeEvalAt) < EVAL_COOLDOWN_MS)) {
    gate.push('eval_cooldown_10d');
  }

  const { weights, calories } = series;
  const { weightTrend, calAvgNow } = rolling7AndTrend(weights, calories);
  if (!Number.isFinite(weightTrend) || !Number.isFinite(calAvgNow)) {
    return {
      tdee: null,
      calorie_target: null,
      decision: 'hold',
      canUpdate: false,
      skipReasons: ['non_finite_trend'],
      weight_trend: null,
      base_target: null,
      coach_override: 'insufficient_data',
      adherence,
    };
  }

  const tdeeRaw = estimateTdeeKcal(calAvgNow, weightTrend);
  if (!Number.isFinite(tdeeRaw) || tdeeRaw < 0) {
    return {
      tdee: null,
      calorie_target: null,
      decision: 'hold',
      canUpdate: false,
      skipReasons: ['invalid_tdee'],
      weight_trend: weightTrend,
      base_target: null,
      coach_override: 'insufficient_data',
      adherence,
    };
  }

  const tdee = Math.round(tdeeRaw);
  const baseTarget = tdee * (1 + (GOAL_PCT[g] ?? 0));
  const { decision, calorieTarget } = applyProgressNudge(g, weightTrend, baseTarget);
  const calorie_target = Math.round(Math.max(800, Math.min(12000, calorieTarget)));
  const canUpdate = gate.length === 0;

  return {
    tdee: Math.max(800, Math.min(12000, tdee)),
    calorie_target: Math.max(800, Math.min(12000, calorie_target)),
    decision,
    canUpdate,
    skipReasons: canUpdate ? [] : gate,
    weight_trend: weightTrend,
    base_target: Math.round(baseTarget),
    coach_override: null,
    adherence,
  };
}

/**
 * 14d average food kcal (for onboarding / “smart” profile without BMR), or null.
 * @param {object | null} fullHistory
 * @param {string} endIso
 */
export function averageFoodKcalOver14d(fullHistory, endIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endIso)) || !fullHistory) return null;
  const cals = [];
  for (let i = 0; i < MIN_DAYS; i += 1) {
    const d = addDays(endIso, -(MIN_DAYS - 1) + i);
    const dayLog = getCombinedDayLogAndManualNodes(fullHistory, d) || [];
    cals.push(sumFoodKcalAndProtein(dayLog).kcal);
  }
  if (!cals.some((c) => c > 0)) return null;
  return Math.round(mean(cals));
}

/**
 * Runs {@link computeDataDrivenTdee} and attaches a deterministic {@link buildCoachOutput} result.
 *
 * @param {object} p — same as {@link computeDataDrivenTdee}
 * @returns {object}
 */
export function computeDataDrivenTdeeWithCoach(p) {
  const plan = computeDataDrivenTdee(p);
  const coach = buildCoachOutput({
    goal: p.goal,
    tdee: plan.tdee,
    calorie_target: plan.calorie_target,
    decision: plan.decision,
    weight_trend: plan.weight_trend,
    coach_override: plan.coach_override,
  });
  return { ...plan, coach };
}
