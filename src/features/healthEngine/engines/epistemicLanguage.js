/**
 * Grammatica epistemica: il tono dell'insight segue il livello di certezza.
 */

import { CERTAINTY_LEVELS } from '../contracts/healthSnapshot.types.js';

/**
 * @param {import('../contracts/healthSnapshot.types.js').CertaintyLevel} certainty
 * @param {{ measured: string, calculated: string, inferred: string, estimated: string }} variants
 * @returns {string}
 */
export function phraseByCertainty(certainty, variants) {
  if (certainty === CERTAINTY_LEVELS.MEASURED) return variants.measured;
  if (certainty === CERTAINTY_LEVELS.CALCULATED) return variants.calculated;
  if (certainty === CERTAINTY_LEVELS.INFERRED) return variants.inferred;
  return variants.estimated;
}

/**
 * Certezza dominante di un pilastro: la più debole tra i driver (epistemica conservativa).
 * @param {Array<{ certainty?: string }>} drivers
 * @param {string} [fallback]
 */
export function weakestCertainty(drivers, fallback = CERTAINTY_LEVELS.ESTIMATED) {
  const order = [
    CERTAINTY_LEVELS.ESTIMATED,
    CERTAINTY_LEVELS.INFERRED,
    CERTAINTY_LEVELS.CALCULATED,
    CERTAINTY_LEVELS.MEASURED,
  ];
  let weakest = fallback;
  let weakestIdx = order.indexOf(fallback);
  (Array.isArray(drivers) ? drivers : []).forEach((d) => {
    const idx = order.indexOf(d?.certainty);
    if (idx >= 0 && idx < weakestIdx) {
      weakest = d.certainty;
      weakestIdx = idx;
    }
  });
  return weakest;
}
