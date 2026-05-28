import { GOAL_DEFINITIONS } from './GoalDefinitions';

/** @typedef {'success' | 'fail' | 'progress'} MetricStatus */

/** Floor = obiettivo minimo; ceiling = limite massimo. */
const MISSION_CONSTRAINTS = Object.freeze({
  LONGEVITY: {
    kcal: 'ceiling',
    protein: 'floor',
    fats: 'ceiling',
    carbs: 'ceiling',
  },
  DEFINITION: {
    kcal: 'ceiling',
    protein: 'floor',
    fats: 'ceiling',
    carbs: 'ceiling',
  },
  HYPERTROPHY: {
    kcal: 'floor',
    protein: 'floor',
    fats: 'ceiling',
    carbs: 'floor',
  },
});

/** Allinea i totali KentuOS (prot/carb/fatTotal) ai campi attesi dalle missioni. */
function normalizeMissionTotals(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    kcal: Number(src.kcal ?? src.cal) || 0,
    protein: Number(src.protein ?? src.prot) || 0,
    carbs: Number(src.carbs ?? src.carb) || 0,
    fats: Number(src.fats ?? src.fatTotal ?? src.fat) || 0,
  };
}

function readMissionCurrentValue(raw, normalized, missionId) {
  const fallbacks = {
    kcal: [normalized.kcal, raw?.kcal, raw?.cal],
    protein: [normalized.protein, raw?.protein, raw?.prot],
    carbs: [normalized.carbs, raw?.carbs, raw?.carb],
    fats: [normalized.fats, raw?.fats, raw?.fatTotal, raw?.fat],
  };
  const candidates = fallbacks[missionId] || [normalized[missionId], raw?.[missionId]];
  for (let i = 0; i < candidates.length; i += 1) {
    const n = Number(candidates[i]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Valuta una singola metrica (floor / ceiling) con tolleranza fisiologica.
 *
 * @param {number} current
 * @param {number} target
 * @param {'floor' | 'ceiling'} constraint
 * @param {boolean} isDayEnded
 * @param {'kcal' | 'protein' | 'carbs' | 'fats' | string} [metricType]
 * @returns {MetricStatus}
 */
export function getMetricStatus(current, target, constraint, isDayEnded, metricType = 'protein') {
  const cur = Number(current) || 0;
  const tgt = Number(target) || 0;
  const toleranceRatio = metricType === 'kcal' ? 0.05 : 0.1;
  const toleranceValue = tgt * toleranceRatio;

  if (constraint === 'ceiling') {
    if (cur > tgt + toleranceValue) return 'fail';
    if (!isDayEnded) return 'progress';
    return 'success';
  }

  const floorThreshold = tgt - toleranceValue;
  if (cur >= floorThreshold) return 'success';
  if (isDayEnded) return 'fail';
  return 'progress';
}

function computeMissionProgress(current, target, status, constraint) {
  const cur = Number(current) || 0;
  const tgt = Number(target) || 0;
  if (tgt <= 0) return status === 'fail' ? 100 : 0;

  if (constraint === 'floor') {
    return Math.min(100, (cur / tgt) * 100);
  }

  if (status === 'fail') return 100;
  return Math.min(100, (cur / tgt) * 100);
}

export const evaluateMissions = (
  goalType,
  currentData,
  userStats = { weight: 68, tdee: 2480, plannedWorkoutKcal: 0 },
  isDayEnded = false,
) => {
  const goalKey = String(goalType || '').toUpperCase();
  const goal = GOAL_DEFINITIONS[goalKey];
  if (!goal) return [];

  const constraints = MISSION_CONSTRAINTS[goalKey] || {};
  const totals = normalizeMissionTotals(currentData);
  const safeStats = userStats && typeof userStats === 'object' ? userStats : {};
  const effectiveWeight = Number(safeStats.weight) || 68;
  const effectiveTdee =
    (Number(safeStats.tdee) || 2480) + Math.max(0, Number(safeStats.plannedWorkoutKcal) || 0);

  const calculatedTargets = {
    kcal: Math.round(effectiveTdee * (1 + (goal.surplus_percentage || 0))),
    protein: Math.round(effectiveWeight * (goal.multipliers?.protein || 0)),
    fats: Math.round(effectiveWeight * (goal.multipliers?.fats || 0)),
    carbs: Math.round(effectiveWeight * (goal.multipliers?.carbs || 0)),
  };

  return goal.missions.map((mission) => {
    const targetValue = Number(calculatedTargets[mission.id]) || 0;
    const currentValue = readMissionCurrentValue(currentData, totals, mission.id);
    const constraint = constraints[mission.id] || 'floor';
    const status = getMetricStatus(
      currentValue,
      targetValue,
      constraint,
      isDayEnded,
      mission.id,
    );
    const progress = computeMissionProgress(currentValue, targetValue, status, constraint);

    return {
      ...mission,
      status,
      progress,
      current: currentValue,
      targetValue,
      constraint,
    };
  });
};
