/**
 * Totali nutrienti con copertura a grammi: se troppo pochi grammi hanno dato,
 * il totale è null («dati insufficienti»), non un numero parziale.
 */

export const MIN_NUTRIENT_GRAMS_COVERAGE = 0.7;

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * @param {object[]} items
 * @param {{
 *   getGrams: (item: object) => number|null|undefined,
 *   getValue: (item: object) => number|null|undefined,
 *   minCoverage?: number,
 * }} opts
 * @returns {{
 *   value: number|null,
 *   coverage: { known: number, missing: number, knownGrams: number, missingGrams: number, ratio: number },
 *   incomplete: boolean,
 *   note: string|null,
 * }}
 */
export function summarizeNutrientTotalByGrams(items, opts) {
  const minCoverage = Number.isFinite(opts?.minCoverage)
    ? opts.minCoverage
    : MIN_NUTRIENT_GRAMS_COVERAGE;
  const list = Array.isArray(items) ? items : [];

  let known = 0;
  let missing = 0;
  let knownGrams = 0;
  let missingGrams = 0;
  let sum = 0;
  let totalWeight = 0;

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const g = finite(opts.getGrams(item));
    const weight = g != null && g > 0 ? g : 1;
    totalWeight += weight;
    const value = finite(opts.getValue(item));
    if (value != null) {
      known += 1;
      knownGrams += weight;
      sum += value;
    } else {
      missing += 1;
      missingGrams += weight;
    }
  }

  if (known + missing === 0) {
    return {
      value: null,
      coverage: { known: 0, missing: 0, knownGrams: 0, missingGrams: 0, ratio: 0 },
      incomplete: false,
      note: null,
    };
  }

  const ratio = totalWeight > 0 ? knownGrams / totalWeight : 0;
  const incomplete = ratio < minCoverage;
  return {
    value: incomplete ? null : round1(sum),
    coverage: {
      known,
      missing,
      knownGrams: round1(knownGrams) ?? 0,
      missingGrams: round1(missingGrams) ?? 0,
      ratio: Math.round(ratio * 1000) / 1000,
    },
    incomplete,
    note: incomplete ? 'dati insufficienti' : null,
  };
}
