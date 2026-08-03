/**
 * Campi salute opzionali sul foodDatabase personale (Firebase trackerFoodDatabase).
 * @typedef {{
 *   novaScore?: number | null,
 *   inflammationFactor?: number | null,
 *   hasSaturatedFats?: boolean | null,
 * }} FoodHealthLabels
 */

export const FOOD_HEALTH_LABEL_KEYS = Object.freeze([
  'novaScore',
  'inflammationFactor',
  'hasSaturatedFats',
]);

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeNovaScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 4) return null;
  return n;
}

/**
 * @param {unknown} value
 * @returns {-1 | 0 | 1 | null}
 */
export function normalizeInflammationFactor(value) {
  const n = Math.round(Number(value));
  if (n === -1 || n === 0 || n === 1) return n;
  return null;
}

/**
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function normalizeHasSaturatedFats(value) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return null;
}

/**
 * True se la riga DB ha già i tre tag salute validi (cache semantica hit).
 * @param {Record<string, unknown> | null | undefined} dbRow
 * @returns {boolean}
 */
export function hasCompleteHealthLabels(dbRow) {
  if (!dbRow || typeof dbRow !== 'object') return false;
  return (
    normalizeNovaScore(dbRow.novaScore) != null
    && normalizeInflammationFactor(dbRow.inflammationFactor) != null
    && normalizeHasSaturatedFats(dbRow.hasSaturatedFats) != null
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} dbRow
 * @returns {FoodHealthLabels | null}
 */
export function readHealthLabels(dbRow) {
  if (!hasCompleteHealthLabels(dbRow)) return null;
  return {
    novaScore: normalizeNovaScore(dbRow.novaScore),
    inflammationFactor: normalizeInflammationFactor(dbRow.inflammationFactor),
    hasSaturatedFats: normalizeHasSaturatedFats(dbRow.hasSaturatedFats),
  };
}

/**
 * Normalizza una newLabel LLM in patch Firebase sicura.
 * @param {Record<string, unknown>} label
 * @returns {{ foodDbKey: string | null, foodName: string, novaScore: number, inflammationFactor: number, hasSaturatedFats: boolean } | null}
 */
export function normalizeNewHealthLabel(label) {
  if (!label || typeof label !== 'object') return null;
  const foodName = String(label.foodName || label.desc || label.name || '').trim();
  const novaScore = normalizeNovaScore(label.novaScore);
  const inflammationFactor = normalizeInflammationFactor(label.inflammationFactor);
  const hasSaturatedFats = normalizeHasSaturatedFats(label.hasSaturatedFats);
  if (!foodName || novaScore == null || inflammationFactor == null || hasSaturatedFats == null) {
    return null;
  }
  const keyRaw = label.foodDbKey ?? label.key ?? null;
  const foodDbKey = keyRaw != null && String(keyRaw).trim() ? String(keyRaw).trim() : null;
  return { foodDbKey, foodName, novaScore, inflammationFactor, hasSaturatedFats };
}
