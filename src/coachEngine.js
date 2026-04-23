/**
 * Deterministic coach layer: maps TDEE / decision system output to structured copy.
 * No free-form text, no randomness, no LLM.
 *
 * @typedef {'mass' | 'cut' | 'maintain'} Goal
 * @typedef {'increase' | 'decrease' | 'keep' | 'hold'} Decision
 * @typedef {'high' | 'medium' | 'low'} Confidence
 */

/**
 * @param {object} input
 * @param {Goal} input.goal
 * @param {number} input.tdee
 * @param {number} input.calorie_target
 * @param {Decision} input.decision
 * @param {number | null} [input.weight_trend] — reserved for future rules; not used in copy (deterministic on decision + gates)
 * @param {'insufficient_data' | 'low_adherence' | null | undefined} [input.coach_override]
 * @returns {{
 *   primary_action: string,
 *   secondary_action: string,
 *   reason: string,
 *   confidence: Confidence
 * }}
 */
export function buildCoachOutput(input) {
  const g = input.goal === 'mass' || input.goal === 'cut' ? input.goal : 'maintain';
  const tdee = Number(input.tdee);
  const calorieTarget = Number(input.calorie_target);
  const hasSufficientData =
    Number.isFinite(tdee) && tdee > 0 && Number.isFinite(calorieTarget) && calorieTarget > 0;
  const override = input?.coach_override;

  const secondary =
    g === 'mass'
      ? 'Focus on strength training and recovery'
      : g === 'cut'
        ? 'Maintain protein intake and monitor energy levels'
        : 'Keep habits stable';

  if (override === 'insufficient_data') {
    return {
      primary_action: 'Raccogli più dati prima di cambiare',
      secondary_action: secondary,
      reason: 'Dati insufficienti per adattare la strategia',
      confidence: 'low',
    };
  }

  if (override === 'low_adherence') {
    return {
      primary_action: 'Segui il piano con più costanza',
      secondary_action: secondary,
      reason: "L'aderenza attuale non consente aggiustamenti affidabili",
      confidence: 'low',
    };
  }

  if (!hasSufficientData) {
    return {
      primary_action: 'Collect more data before making changes',
      secondary_action: secondary,
      reason: 'At least 14 days of weight and food intake are needed for reliable tracking.',
      confidence: 'low',
    };
  }

  if (input.decision === 'increase') {
    return {
      primary_action: 'Increase calorie intake slightly',
      secondary_action: secondary,
      reason: 'Weight is not increasing as expected for your goal',
      confidence: 'high',
    };
  }
  if (input.decision === 'decrease') {
    return {
      primary_action: 'Reduce calorie intake slightly',
      secondary_action: secondary,
      reason: 'Weight is changing too fast relative to your goal',
      confidence: 'high',
    };
  }
  return {
    primary_action: 'Stay consistent',
    secondary_action: secondary,
    reason: 'You are progressing as expected',
    confidence: 'high',
  };
}
