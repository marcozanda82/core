/**
 * Bozze pasto esterne (create da Claude via MCP) → blocchi bozza dell'Inbox esistente.
 *
 * Restano in users/{uid}/external_drafts/meals/{draftId}, mai nel diario:
 * l'Inbox le mostra accanto alle bozze del giorno e la convalida passa dal
 * percorso esistente (smistamento → lavagna di riconoscimento → commit).
 */

import {
  CLAUDE_DRAFT_SOURCE,
  asCollectionArray,
  normalizeInboxDraftBlock,
} from '../../utils/mealDraftStatus.js';

export const externalMealDraftsPath = (uid) => `users/${uid}/external_drafts/meals`;

const EXTERNAL_BLOCK_PREFIX = 'ext_';

export function isExternalInboxBlock(block) {
  return Boolean(block && String(block.externalDraftId || '').trim());
}

/**
 * @param {string} draftId
 * @param {Record<string, unknown>} draft riga RTDB external_drafts/meals/{draftId}
 */
export function externalDraftToInboxBlock(draftId, draft) {
  const id = String(draftId || '').trim();
  if (!id || !draft || typeof draft !== 'object') return null;
  if (draft.status !== 'pending') return null;
  const date = String(draft.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const items = asCollectionArray(draft.items).map((item, index) => {
    const foodDbKey = String(item?.foodDbKey || item?.matchedKey || '').trim();
    const grams = Number(item?.grams);
    const hasGrams = Number.isFinite(grams) && grams > 0;
    // Chiave verificata lato MCP + grammi → skip lavagna (status matched).
    const resolved = Boolean(foodDbKey) && hasGrams;
    return {
      id: String(item?.id || `${id}_i${index}`),
      foodName: item?.foodName,
      spokenFoodName: item?.foodName,
      ...(hasGrams ? { grams, quantitySource: 'explicit' } : {}),
      ...(item?.note ? { note: item.note } : {}),
      ...(foodDbKey ? { foodDbKey, matchedKey: foodDbKey } : {}),
      status: resolved ? 'matched' : 'raw',
    };
  });
  const block = normalizeInboxDraftBlock({
    id: `${EXTERNAL_BLOCK_PREFIX}${id}`,
    createdAt: Number(draft.createdAt) || 0,
    timeHHmm: draft.timeHHmm,
    items,
    rawText: draft.rawText,
    inferredType: 'meal',
    status: 'pending',
    source: draft.source || draft.origin || CLAUDE_DRAFT_SOURCE,
    slotHint: draft.slotHint,
  });
  if (!block) return null;
  return { ...block, externalDraftId: id, externalDate: date };
}

/**
 * @param {Record<string, unknown>|null} node valore di external_drafts/meals
 * @param {string} viewDate giorno aperto in Kentu (YYYY-MM-DD)
 * @returns {{ blocks: object[], otherDays: Array<{ date: string, count: number }>, totalPending: number }}
 */
export function summarizeExternalMealDrafts(node, viewDate) {
  const all = Object.entries(node && typeof node === 'object' ? node : {})
    .map(([draftId, draft]) => externalDraftToInboxBlock(draftId, draft))
    .filter(Boolean)
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  const blocks = all.filter((block) => block.externalDate === viewDate);
  const counts = new Map();
  all.forEach((block) => {
    if (block.externalDate === viewDate) return;
    counts.set(block.externalDate, (counts.get(block.externalDate) || 0) + 1);
  });
  const otherDays = [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { blocks, otherDays, totalPending: all.length };
}

/** "18 nov" per il contatore delle bozze in altri giorni. */
export function formatExternalDraftDay(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
