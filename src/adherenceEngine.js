function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/**
 * Computes adherence from nutrition proximity + logging consistency.
 *
 * @param {object} input
 * @param {number[]} input.daily_calories
 * @param {number} input.calorie_target
 * @param {number} input.days_logged
 * @param {number} input.total_days
 * @returns {{
 *  adherence_score: number | null,
 *  adherence_level: 'high' | 'medium' | 'low'
 * }}
 */
export function computeAdherence(input) {
  const daily = Array.isArray(input?.daily_calories) ? input.daily_calories : [];
  const target = Number(input?.calorie_target);
  const daysLogged = Number(input?.days_logged);
  const totalDays = Number(input?.total_days);

  if (!Number.isFinite(totalDays) || totalDays <= 0 || totalDays < 7) {
    return { adherence_score: null, adherence_level: 'low' };
  }

  const logging_consistency = clamp01(daysLogged / totalDays);
  const recent7 = daily.slice(-7);
  if (recent7.length < 7) {
    return { adherence_score: null, adherence_level: 'low' };
  }

  const validCalories = recent7.filter((v) => Number.isFinite(Number(v)) && Number(v) > 0).map(Number);
  const hasNutritionData = validCalories.length > 0 && Number.isFinite(target) && target > 0;

  let adherence_score = null;
  if (hasNutritionData) {
    const avg_calories = mean(validCalories);
    const calorie_diff = Math.abs(avg_calories - target);
    const adherence_nutrition = clamp01(1 - (calorie_diff / target));
    adherence_score = clamp01((adherence_nutrition * 0.7) + (logging_consistency * 0.3));
  } else {
    // Fallback requested by spec when calorie data is missing.
    adherence_score = logging_consistency;
  }

  const adherence_level =
    adherence_score >= 0.8 ? 'high' : adherence_score >= 0.7 ? 'medium' : 'low';

  return { adherence_score, adherence_level };
}
