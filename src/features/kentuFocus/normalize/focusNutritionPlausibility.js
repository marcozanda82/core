/**
 * Metadati di qualità nutrizionale Focus — non altera i valori grezzi.
 * Le soglie sono euristiche operative, non diagnosi cliniche.
 */

import { finiteNumber } from './logUtils.js';
import { isUnresolvedMealDraftItem } from '../../../utils/mealDraftStatus.js';

export const FOCUS_NUTRITION_PLAUSIBILITY = Object.freeze({
  recorded: 'recorded',
  suspect: 'suspect',
  insufficient_evidence: 'insufficient_evidence',
});

/** Soglia euristica fibra giornaliera (g) sopra cui segnalare suspect. */
export const FOCUS_FIBER_DAY_SUSPECT_G = 60;

const FISH_NAME_RE = /\b(pesce|salmone|tonno|merluzzo|orata|branzino|sgombro|trota|halibut|cod|tuna|salmon)\b/i;

const FOOD_TYPES = new Set(['food', 'recipe']);

/**
 * @param {object[]} dayLog
 * @param {{ fiberG?: number|null, hasFood?: boolean }} dayTotals
 */
export function evaluateDayNutritionPlausibility(dayLog, dayTotals = {}) {
  /** @type {object[]} */
  const flags = [];
  const fibreDay = finiteNumber(dayTotals.fiberG);
  const hasFood = Boolean(dayTotals.hasFood);

  if (!hasFood) {
    return {
      status: FOCUS_NUTRITION_PLAUSIBILITY.insufficient_evidence,
      reliableForJudgement: false,
      flags: [{
        code: 'no_food_log',
        status: FOCUS_NUTRITION_PLAUSIBILITY.insufficient_evidence,
        note: 'Nessuna registrazione alimentare; non formulare giudizi nutrizionali.',
      }],
      thresholds: { fiberDaySuspectG: FOCUS_FIBER_DAY_SUSPECT_G },
    };
  }

  if (fibreDay != null && fibreDay > FOCUS_FIBER_DAY_SUSPECT_G) {
    flags.push({
      code: 'daily_fiber_unusually_high',
      status: FOCUS_NUTRITION_PLAUSIBILITY.suspect,
      fiberG: fibreDay,
      thresholdG: FOCUS_FIBER_DAY_SUSPECT_G,
      note: 'Soglia euristica operativa, non diagnosi. Valore grezzo conservato.',
    });
  }

  for (const item of Array.isArray(dayLog) ? dayLog : []) {
    if (!item || !FOOD_TYPES.has(item.type)) continue;
    if (isUnresolvedMealDraftItem(item)) continue;
    const name = String(item?.name || item?.desc || item?.label || item?.foodDbKey || '').trim();
    const fibre = finiteNumber(item?.fibre ?? item?.fiber ?? item?.fiberG);
    if (name && FISH_NAME_RE.test(name) && fibre != null && fibre > 0) {
      flags.push({
        code: 'fibre_on_fish_like_name',
        status: FOCUS_NUTRITION_PLAUSIBILITY.suspect,
        itemId: item.id != null ? String(item.id) : null,
        fibreG: fibre,
        note: 'Pass-through dal log; audit food DB separato. Valore non corretto.',
      });
    }
    const kcal = finiteNumber(item?.kcal ?? item?.cal);
    const grams = finiteNumber(item?.grams ?? item?.g ?? item?.qty ?? item?.quantity);
    if (kcal != null && grams != null && grams > 0 && kcal / grams > 12) {
      flags.push({
        code: 'kcal_per_gram_implausible',
        status: FOCUS_NUTRITION_PLAUSIBILITY.suspect,
        itemId: item.id != null ? String(item.id) : null,
        kcal,
        grams,
        note: 'Possibile incongruenza unità/porzione; valore grezzo conservato.',
      });
    }
  }

  const suspect = flags.some((f) => f.status === FOCUS_NUTRITION_PLAUSIBILITY.suspect);
  return {
    status: suspect
      ? FOCUS_NUTRITION_PLAUSIBILITY.suspect
      : FOCUS_NUTRITION_PLAUSIBILITY.recorded,
    reliableForJudgement: !suspect,
    flags,
    thresholds: { fiberDaySuspectG: FOCUS_FIBER_DAY_SUSPECT_G },
  };
}
