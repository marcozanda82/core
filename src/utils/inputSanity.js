/**
 * Sanity check / clamping per input giornalieri (sonno, acqua, grammi, peso).
 */

export const SLEEP_HOURS_MIN = 0;
export const SLEEP_HOURS_MAX = 24;
export const SLEEP_MINUTES_MIN = 0;
export const SLEEP_MINUTES_MAX = 59;

export const WATER_ML_MIN = 0;
export const WATER_ML_MAX = 10_000;

export const FOOD_GRAMS_MIN = 1;
export const FOOD_GRAMS_MAX = 2_500;

export const BODY_WEIGHT_KG_MIN = 30;
export const BODY_WEIGHT_KG_MAX = 300;

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number|null} null se non numerico / vuoto
 */
export function clampNumber(value, min, max) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Ore di sonno (0–24). Vuoto → null.
 * @param {unknown} value
 * @returns {number|null}
 */
export function clampSleepHours(value) {
  return clampNumber(value, SLEEP_HOURS_MIN, SLEEP_HOURS_MAX);
}

/**
 * Minuti di durata sonno (0–59).
 * @param {unknown} value
 * @returns {number|null}
 */
export function clampSleepMinutes(value) {
  return clampNumber(value, SLEEP_MINUTES_MIN, SLEEP_MINUTES_MAX);
}

/**
 * Durata totale sonno in ore decimali, clamp 0–24.
 * @param {unknown} hours
 * @param {unknown} [minutes]
 * @returns {number}
 */
export function clampSleepDurationHours(hours, minutes = 0) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  const total = h + m / 60;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(SLEEP_HOURS_MAX, Math.max(SLEEP_HOURS_MIN, total));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSleepHoursOutOfRange(value) {
  if (value == null || value === '') return false;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return false;
  return n < SLEEP_HOURS_MIN || n > SLEEP_HOURS_MAX;
}

/**
 * Acqua/liquidi in ml (0–10000).
 * @param {unknown} value
 * @returns {number|null}
 */
export function clampWaterMl(value) {
  const n = clampNumber(value, WATER_ML_MIN, WATER_ML_MAX);
  return n == null ? null : Math.round(n);
}

/**
 * Grammi porzione cibo (1–2500).
 * @param {unknown} value
 * @returns {number|null}
 */
export function clampFoodGrams(value) {
  const n = clampNumber(value, FOOD_GRAMS_MIN, FOOD_GRAMS_MAX);
  return n == null ? null : Math.round(n);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFoodGramsOutOfRange(value) {
  if (value == null || value === '') return false;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return false;
  return n < FOOD_GRAMS_MIN || n > FOOD_GRAMS_MAX;
}

/**
 * Peso corporeo kg (30–300).
 * @param {unknown} value
 * @returns {number|null}
 */
export function clampBodyWeightKg(value) {
  return clampNumber(value, BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBodyWeightOutOfRange(value) {
  if (value == null || value === '') return false;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return false;
  return n < BODY_WEIGHT_KG_MIN || n > BODY_WEIGHT_KG_MAX;
}

/**
 * Parser input numerico che permette digitazione intermedia ('' / '.') senza forzare clamp,
 * ma clampa quando il valore è un numero finito oltre i limiti.
 * @param {string} raw
 * @param {number} min
 * @param {number} max
 * @returns {{ display: string, value: number|null, clamped: boolean }}
 */
export function sanitizeNumericInput(raw, min, max) {
  const text = String(raw ?? '');
  if (text === '' || text === '.' || text === '-' || text === '-.') {
    return { display: text, value: null, clamped: false };
  }
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n)) {
    return { display: text, value: null, clamped: false };
  }
  if (n < min || n > max) {
    const clamped = Math.min(max, Math.max(min, n));
    return { display: String(clamped), value: clamped, clamped: true };
  }
  return { display: text, value: n, clamped: false };
}
