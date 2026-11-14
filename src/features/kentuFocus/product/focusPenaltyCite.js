/**
 * Penalità che abbassano il punteggio dell'alimentazione.
 * La line del pilastro deve citarne la causa, anche se resta sulla rotta.
 */

export const SCORE_PENALTY_IDS = Object.freeze([
  'heavy_late_meal',
  'late_meal_before_sleep',
  'nova4_critique',
]);

export const SCORE_PENALTY_CITE = Object.freeze({
  heavy_late_meal: Object.freeze({
    re: /cene abbondant|cena abbondante|pasti abbondant|pasto abbondante|cena pesante|pasto pesante/i,
    phrase: 'cena abbondante',
  }),
  late_meal_before_sleep: Object.freeze({
    re: /meno di 2 ore|meno di due ore|vicino al sonno|prima di dormire|ultimo pasto|a ridosso del sonno/i,
    phrase: 'ultimo pasto vicino al sonno',
  }),
  nova4_critique: Object.freeze({
    re: /ultra-?processat|molto lavorat/i,
    phrase: 'ultra-processato sfavorevole',
  }),
});

/**
 * @param {string} line
 * @param {string[]} penalties
 * @returns {string[]}
 */
export function missingPenaltyCites(line, penalties) {
  const text = String(line || '');
  return (penalties || []).filter((id) => {
    const cite = SCORE_PENALTY_CITE[id];
    return cite && !cite.re.test(text);
  });
}

/**
 * @param {string} line
 * @param {string[]} penalties
 * @param {number} [max]
 * @returns {string}
 */
export function lineWithPenaltyCites(line, penalties, max = 110) {
  const missing = missingPenaltyCites(line, penalties);
  if (missing.length === 0) return String(line || '').trim();
  const phrases = missing.map((id) => SCORE_PENALTY_CITE[id].phrase);
  const head = String(line || '').replace(/[.]+$/, '').trim();
  const tail = phrases.join(', ');
  const combined = head ? `${head}: ${tail}.` : `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
  if (combined.length <= max) return combined;
  const only = `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
  return only.length <= max ? only : `${only.slice(0, max - 1).trim()}…`;
}
