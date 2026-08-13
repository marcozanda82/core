/**
 * Blocchi alimentari storici — porzioni modali indivisibili per coach bozza (Vassoio).
 */
import { buildUserRecentFoods } from './userRecentFoods.js';

/**
 * @typedef {{
 *   foodName: string,
 *   foodDbKey: string|null,
 *   typicalGrams: number,
 *   usageCount: number,
 * }} HistoricalFoodBlock
 */

/**
 * Aggrega alimenti ricorrenti con grammatura modale (porzione più usata / typicalGrams).
 *
 * @param {object} diaryData — stato app (fullHistory, activeLog, foodDatabase, userPortions) o compat
 * @param {{ limit?: number, lookbackDays?: number }} [options]
 * @returns {HistoricalFoodBlock[]}
 */
export function getHistoricalFoodBlocks(diaryData = {}, options = {}) {
  const currentState =
    diaryData?.fullHistory || diaryData?.activeLog || diaryData?.foodDatabase
      ? diaryData
      : { fullHistory: diaryData };

  const limit = Math.max(5, Math.min(50, Number(options.limit) || 30));
  const recent = buildUserRecentFoods(currentState, {
    limit,
    lookbackDays: options.lookbackDays,
  });

  return recent
    .filter((row) => Number(row?.typicalGrams) > 0)
    .map((row) => ({
      foodName: String(row.foodName || '').trim(),
      foodDbKey: row.foodDbKey != null ? String(row.foodDbKey).trim() : null,
      typicalGrams: Math.round(Number(row.typicalGrams)),
      usageCount: Math.max(0, Math.round(Number(row.usageCount) || 0)),
    }))
    .filter((row) => row.foodName && row.typicalGrams > 0);
}

/**
 * Filtra i blocchi storici in base a alimenti citati dall'utente (es. dispensa).
 *
 * @param {HistoricalFoodBlock[]} blocks
 * @param {string} userText
 * @returns {HistoricalFoodBlock[]}
 */
export function filterHistoricalBlocksByUserText(blocks, userText) {
  const list = Array.isArray(blocks) ? blocks : [];
  const text = String(userText || '').trim().toLowerCase();
  if (!text || list.length === 0) return list;

  const tokens = text
    .replace(/\b(?:ho|in|dispensa|tengo|con|e|ed|il|la|lo|l'|i|gli|le|del|della|dei|delle|un|una|per|le|i)\b/g, ' ')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  if (tokens.length === 0) return list;

  const matched = list.filter((block) => {
    const name = String(block.foodName || '').toLowerCase();
    return tokens.some((token) => name.includes(token) || token.includes(name.split(/\s+/)[0]));
  });

  return matched.length > 0 ? matched : list;
}
