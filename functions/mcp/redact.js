const SENSITIVE_KEY = /^(kcal|cal|calorie|calories|peso|weight|grams|grammi|qta|qty|sodium|na|sodiumMg|fatTotal)$/i;

/**
 * Rimuove numeri sensibili (calorie, peso, grammi) quando suppressNumbers è attivo.
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSensitiveNumbers(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveNumbers(item));
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = null;
      continue;
    }
    out[key] = redactSensitiveNumbers(item);
  }
  return out;
}
