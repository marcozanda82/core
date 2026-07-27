/**
 * @deprecated Shiftable Training Block: target deterministici in
 * `src/features/planning/trainingBlockTargets.js` via useTrainingBlock.
 */

const DEPRECATION =
  '[aiTargetService] Deprecato: usa computeTrainingBlockDailyTargets / useTrainingBlock.';

/**
 * @deprecated
 */
export function normalizeAiTargetPayload() {
  console.warn(DEPRECATION);
  return {
    daily_targets: { kcal: 0, pro: 0, cho: 0, fat: 0 },
    micro_notes: '',
    focus_giornata: '',
  };
}

/**
 * @deprecated
 * @throws {Error}
 */
export async function generateDailyMetabolicTargets() {
  console.warn(DEPRECATION);
  throw new Error(
    'aiTargetService è deprecato. Usa computeTrainingBlockDailyTargets (trainingBlockTargets).',
  );
}
