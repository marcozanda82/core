/**
 * Presentazione quantità assistita. Legge solo `quantitySource` (Step 4).
 * Nessuna ricostruzione della provenienza in UI.
 */

import { QUANTITY_SOURCE } from './assistedMealPipeline.js';

export function isEstimatedQuantitySource(quantitySource) {
  return String(quantitySource || '') === QUANTITY_SOURCE.estimated;
}

/**
 * @param {number} grams
 * @param {string} [quantitySource]
 * @returns {string}
 */
export function formatAssistedGramsLabel(grams, quantitySource) {
  const n = Math.max(0, Math.round(Number(grams) || 0));
  if (isEstimatedQuantitySource(quantitySource)) return `~${n} g`;
  return `${n} g`;
}

export function confirmQuantitySourceAfterManualEdit() {
  return QUANTITY_SOURCE.explicit;
}

/**
 * Item Inbox da bozza assistita. Nessun grams: 1.
 * @param {object} draft
 * @param {number} [stamp]
 */
export function buildVoiceInboxItemsFromAssistedDraft(draft, stamp = Date.now()) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  return items
    .map((entry, index) => {
      const foodName = String(entry?.foodName || entry?.name || '').trim();
      if (!foodName) return null;
      const gramsRaw = Number(entry?.grams);
      const hasGrams = Number.isFinite(gramsRaw) && gramsRaw > 0;
      return {
        id: `voice_inbox_${stamp}_${index}`,
        foodName,
        name: foodName,
        desc: foodName,
        spokenFoodName: foodName,
        status: 'pending',
        ...(hasGrams ? { grams: Math.round(gramsRaw) } : {}),
        ...(entry?.quantitySource ? { quantitySource: entry.quantitySource } : {}),
        ...(entry?.isEstimated === true ? { isEstimated: true } : {}),
      };
    })
    .filter(Boolean);
}
