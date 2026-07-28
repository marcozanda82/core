import { buildComputedMealNodes } from '../../../utils/mealNodeAggregation.js';
import { decimalToTimeStr, toCanonicalMealType } from '../../../coreEngine.jsx';

const MAX_DIARY_INDEX_MEALS = 12;
const MAX_DIARY_INDEX_ITEMS_PER_MEAL = 24;

function toSafeString(value) {
  return String(value ?? '').trim();
}

function normalizeMealType(value) {
  const v = toSafeString(value).toLowerCase();
  if (['colazione', 'snack', 'pranzo', 'cena'].includes(v)) return v;
  return null;
}

function normalizeFoodToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Hash deterministico leggero per itemId stabili senza crypto.
 * @param {string} raw
 * @returns {string}
 */
function hashToken(raw) {
  let hash = 0;
  const text = String(raw || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * @param {string} mealId
 * @param {string} foodName
 * @param {number} grams
 * @param {number} index
 * @param {string|null} existingId
 * @returns {string}
 */
function buildStableItemId(mealId, foodName, grams, index, existingId = null) {
  const fromRow = toSafeString(existingId);
  if (fromRow) return fromRow;
  const key = `${mealId}|${normalizeFoodToken(foodName)}|${grams}|${index}`;
  return `item_${hashToken(key)}_${index}`;
}

/**
 * Indice compatto del diario odierno per Gemini ([TODAY_DIARY_INDEX]).
 * Espone mealId/targetNodeId, mealType, time e items con itemId stabili.
 *
 * @param {Array<object>} activeLog
 * @param {{ fullHistory?: object, activeDate?: string|null }} [options]
 * @returns {Array<object>}
 */
export function buildTodayDiaryIndex(activeLog = [], options = {}) {
  const log = Array.isArray(activeLog) ? activeLog : [];
  if (log.length === 0) return [];

  const nodes = buildComputedMealNodes(
    log,
    options.fullHistory || {},
    options.activeDate || null,
  );

  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => {
      if (!node || typeof node !== 'object') return null;
      const mealId = toSafeString(node.id || node.mealId);
      if (!mealId) return null;

      const mealTime = Number(node.time);
      const time = Number.isFinite(mealTime) ? decimalToTimeStr(mealTime) : null;
      const mealTypeRaw = String(node.mealType || '').split('_')[0];
      const mealType = toCanonicalMealType(mealTypeRaw) || normalizeMealType(mealTypeRaw);

      const rawItems = Array.isArray(node.items) ? node.items : [];
      const items = rawItems
        .slice(0, MAX_DIARY_INDEX_ITEMS_PER_MEAL)
        .map((row, index) => {
          if (!row || typeof row !== 'object') return null;
          const foodName = toSafeString(row.desc || row.name || row.foodName);
          const grams = Math.round(Number(row.qta ?? row.weight ?? row.grams) || 0);
          if (!foodName || grams <= 0) return null;
          const existingId = row.id || row.itemId || row.logId || null;
          return {
            itemId: buildStableItemId(mealId, foodName, grams, index, existingId),
            foodName,
            grams,
          };
        })
        .filter(Boolean);

      if (items.length === 0) return null;

      return {
        mealId,
        targetNodeId: mealId,
        mealType: mealType || null,
        time,
        items,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_DIARY_INDEX_MEALS);
}
