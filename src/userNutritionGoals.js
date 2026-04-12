/**
 * Canonical nutrition goal fields for the user profile (cut / maintain / bulk),
 * daily calorie target, and optional protein override.
 */

/** @typedef {'cut' | 'maintain' | 'bulk'} NutritionGoalId */

/**
 * Normalize any legacy or alias value to cut | maintain | bulk.
 * @param {string} [raw]
 * @returns {'cut' | 'maintain' | 'bulk'}
 */
export function normalizeNutritionGoal(raw) {
  const g = String(raw || '').toLowerCase().trim();
  if (g === 'cut' || g === 'lose' || g === 'dimagrimento' || g === 'deficit') return 'cut';
  if (g === 'bulk' || g === 'gain' || g === 'massa' || g === 'surplus') return 'bulk';
  return 'maintain';
}

/**
 * Merge server profile with defaults for nutrition fields and migrate legacy `goal`.
 * @param {object} profile
 * @returns {object}
 */
export function mergeProfileNutritionFromServer(profile) {
  if (!profile || typeof profile !== 'object') return {};
  const p = { ...profile };
  p.nutritionGoal = normalizeNutritionGoal(p.nutritionGoal ?? p.goal);
  if (p.targetCalories != null) {
    const k = Number(p.targetCalories);
    p.targetCalories = Number.isFinite(k) ? Math.round(Math.min(12000, Math.max(800, k))) : null;
  }
  if (p.proteinTarget != null && p.proteinTarget !== '') {
    const pr = Number(p.proteinTarget);
    p.proteinTarget = Number.isFinite(pr) ? Math.round(Math.min(400, Math.max(30, pr))) : null;
  } else {
    p.proteinTarget = null;
  }
  return p;
}

/**
 * Snapshot for global access (context) and UI.
 * @param {object} profile
 * @param {object} targets
 */
export function buildNutritionGoalsSnapshot(profile, targets) {
  const goal = normalizeNutritionGoal(profile?.nutritionGoal ?? profile?.goal);
  const tc = profile?.targetCalories;
  const targetCalories = Number.isFinite(Number(tc))
    ? Math.round(Number(tc))
    : Math.round(Number(targets?.kcal) || 2000);

  const pt = profile?.proteinTarget;
  const proteinTarget =
    pt != null && pt !== '' && Number.isFinite(Number(pt))
      ? Math.round(Number(pt))
      : null;

  const effectiveProteinG = proteinTarget != null
    ? proteinTarget
    : Math.round(Number(targets?.prot) || 0);

  return {
    goal,
    targetCalories,
    proteinTarget,
    effectiveProteinG,
  };
}
