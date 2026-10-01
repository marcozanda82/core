/**
 * Classificazione deterministica vs target: stessa convenzione McDrive (±10%).
 * Confronta il valore ATTUALE (es. after) con il target, non il remaining.
 */

export const MACRO_VS_TARGET_MARGIN_RATIO = 0.1;

/**
 * @param {number} actual
 * @param {number} target
 * @param {number} [marginRatio]
 * @returns {'on-target'|'over'|'under'|'neutral'}
 */
export function classifyMacroVsTarget(actual, target, marginRatio = MACRO_VS_TARGET_MARGIN_RATIO) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  if (!(t > 0)) return 'neutral';
  const lo = t * (1 - marginRatio);
  const hi = t * (1 + marginRatio);
  if (a >= lo && a <= hi) return 'on-target';
  if (a > hi) return 'over';
  return 'under';
}
