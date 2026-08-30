/**
 * Meal UPSERT — writer unificato append | replace | merge per CRUD pasti via chat.
 */

import { sanitizeFoodDisplayName } from '../../../utils/foodVisualResolver.js';

export const MEAL_UPSERT_ACTIONS = Object.freeze(['append', 'replace', 'merge']);

function cleanStoredFoodName(...candidates) {
  const raw = candidates.map((c) => String(c || '').trim()).find(Boolean) || '';
  if (!raw) return '';
  return sanitizeFoodDisplayName(raw, '');
}

/**
 * @param {unknown} raw
 * @returns {'append'|'replace'|'merge'}
 */
export function normalizeMealUpsertAction(raw) {
  const a = String(raw || '').trim().toLowerCase();
  if (a === 'merge' || a === 'add_to' || a === 'append_to_slot') return 'merge';
  if (a === 'replace' || a === 'update' || a === 'overwrite') return 'replace';
  if (a === 'append' || a === 'create' || a === 'new') return 'append';
  return 'append';
}

/**
 * Applica operations[] sul baseline in modo deterministico (client-side SoT).
 * @param {Array<object>} baselineItems
 * @param {Array<object>} operations
 * @returns {Array<object>}
 */
export function applyMealOperations(baselineItems = [], operations = []) {
  const items = (Array.isArray(baselineItems) ? baselineItems : [])
    .map((item, index) => {
      const foodName = cleanStoredFoodName(item?.foodName, item?.name, item?.desc);
      const grams = Math.max(0, Math.round(Number(item?.grams ?? item?.qta ?? item?.weight) || 0));
      const itemId = String(item?.itemId || item?.id || '').trim() || `base_${index}`;
      return {
        ...item,
        itemId,
        foodName,
        name: foodName,
        grams,
        ...(item?.foodDbKey != null ? { foodDbKey: item.foodDbKey, matchedKey: item.foodDbKey } : {}),
      };
    })
    .filter((item) => item.foodName);

  const ops = Array.isArray(operations) ? operations : [];
  if (ops.length === 0) return items;

  let next = [...items];

  const findIndex = (op) => {
    const targetId = String(op?.targetItemId || '').trim();
    if (targetId) {
      const byId = next.findIndex((it) => String(it.itemId || it.id || '') === targetId);
      if (byId >= 0) return byId;
    }
    const hint = cleanStoredFoodName(op?.matchHint, op?.updatedFood?.foodName).toLowerCase();
    if (!hint) return -1;
    return next.findIndex((it) => {
      const name = String(it.foodName || it.name || '').trim().toLowerCase();
      return name === hint || name.includes(hint) || hint.includes(name);
    });
  };

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const action = String(op.action || '').trim().toLowerCase();
    if (action === 'add') {
      const foodName = cleanStoredFoodName(op?.updatedFood?.foodName, op?.foodName);
      const grams = Math.max(1, Math.round(Number(op?.updatedFood?.grams ?? op?.grams) || 0));
      if (!foodName || grams <= 0) continue;
      const foodDbKey = op?.updatedFood?.foodDbKey ?? op?.foodDbKey;
      next.push({
        itemId: `op_add_${Date.now()}_${next.length}`,
        foodName,
        name: foodName,
        grams,
        ...(foodDbKey != null && String(foodDbKey).trim()
          ? { foodDbKey: String(foodDbKey).trim(), matchedKey: String(foodDbKey).trim() }
          : {}),
        _upsertHighlight: 'added',
      });
      continue;
    }
    if (action === 'delete') {
      const idx = findIndex(op);
      if (idx >= 0) next.splice(idx, 1);
      continue;
    }
    if (action === 'update') {
      const idx = findIndex(op);
      if (idx < 0) continue;
      const foodName = cleanStoredFoodName(op?.updatedFood?.foodName, next[idx].foodName);
      const gramsRaw = Number(op?.updatedFood?.grams);
      const grams = Number.isFinite(gramsRaw) && gramsRaw > 0
        ? Math.round(gramsRaw)
        : next[idx].grams;
      next[idx] = {
        ...next[idx],
        foodName: foodName || next[idx].foodName,
        name: foodName || next[idx].name,
        grams,
        _upsertHighlight: 'updated',
      };
    }
  }

  return next.filter((it) => it.foodName && Number(it.grams) > 0);
}

/**
 * Merge: baseline + nuovi items (evidenzia aggiunte).
 * @param {Array<object>} baselineItems
 * @param {Array<object>} incomingItems
 * @returns {Array<object>}
 */
export function mergeMealItems(baselineItems = [], incomingItems = []) {
  const base = (Array.isArray(baselineItems) ? baselineItems : []).map((item, index) => ({
    ...item,
    foodName: cleanStoredFoodName(item?.foodName, item?.name, item?.desc),
    grams: Math.max(1, Math.round(Number(item?.grams ?? item?.qta ?? item?.weight) || 0)),
    itemId: String(item?.itemId || item?.id || '').trim() || `base_${index}`,
  })).filter((it) => it.foodName);

  const incoming = (Array.isArray(incomingItems) ? incomingItems : [])
    .map((item, index) => {
      const foodName = cleanStoredFoodName(item?.foodName, item?.name, item?.desc);
      const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta ?? item?.weight) || 0));
      if (!foodName || grams <= 0) return null;
      const foodDbKey = item?.foodDbKey ?? item?.matchedKey;
      return {
        foodName,
        name: foodName,
        grams,
        itemId: String(item?.itemId || item?.id || '').trim() || `merge_${Date.now()}_${index}`,
        ...(foodDbKey != null && String(foodDbKey).trim()
          ? { foodDbKey: String(foodDbKey).trim(), matchedKey: String(foodDbKey).trim() }
          : {}),
        _upsertHighlight: 'added',
      };
    })
    .filter(Boolean);

  return [...base, ...incoming];
}

/**
 * Risolve action effettiva dal proposal/payload.
 * @param {object} payload
 * @returns {'append'|'replace'|'merge'}
 */
export function resolveUpsertActionFromPayload(payload = {}) {
  const targetNodeId = String(payload?.targetNodeId || '').trim();
  const ops = Array.isArray(payload?.operations) ? payload.operations : [];
  const isDeltaOnlyMerge =
    ops.length > 0
    && ops.every((op) => String(op?.action || '').toLowerCase() === 'add');

  if (payload?.action != null && String(payload.action).trim()) {
    const a = normalizeMealUpsertAction(payload.action);
    // targetNodeId + bozza pasto intero (non delta-only) → replace
    if (targetNodeId && a === 'merge' && !isDeltaOnlyMerge) return 'replace';
    return a;
  }
  if (payload?.upsertAction != null && String(payload.upsertAction).trim()) {
    const a = normalizeMealUpsertAction(payload.upsertAction);
    if (targetNodeId && a === 'merge' && !isDeltaOnlyMerge) return 'replace';
    return a;
  }
  const source = String(payload?.source || '').trim().toLowerCase();
  if (source === 'logged_meal_merge' || source === 'meal_merge') {
    return isDeltaOnlyMerge || !targetNodeId ? 'merge' : 'replace';
  }
  if (source === 'logged_meal_update') {
    if (isDeltaOnlyMerge) return 'merge';
    return 'replace';
  }
  if (targetNodeId) return 'replace';
  return 'append';
}

/**
 * Impronta stabile per idempotenza commit pasto (stesso giorno + slot + items → un solo write).
 * @param {object} payload
 * @param {string} [trackerDate] YYYY-MM-DD
 * @returns {string}
 */
export function buildMealCommitFingerprint(payload = {}, trackerDate = '') {
  const day = String(trackerDate || '').trim();
  const mealType = String(payload?.mealType || '').trim().toLowerCase().split('_')[0];
  const target = String(payload?.targetNodeId || '').trim();
  const rawItems = Array.isArray(payload?.items) && payload.items.length > 0
    ? payload.items
    : payload?.foodName
      ? [{ foodName: payload.foodName, grams: payload.grams }]
      : [];
  const itemKey = rawItems
    .map((item) => {
      const name = cleanStoredFoodName(item?.foodName, item?.name).toLowerCase();
      const grams = Math.max(0, Math.round(Number(item?.grams ?? item?.qty) || 0));
      return name ? `${name}:${grams}` : '';
    })
    .filter(Boolean)
    .sort()
    .join('|');
  // Action omessa: stesso pasto via card (UPSERT) e quick reply (ADD_FOOD) → stessa impronta.
  return `${day}|${mealType}|${target}|${itemKey}`;
}

/**
 * Label badge UI per l'operazione in corso.
 * @param {'append'|'replace'|'merge'} action
 * @param {string} mealType
 * @returns {string}
 */
export function mealUpsertBadgeLabel(action, mealType = '') {
  const meal = String(mealType || 'pasto').trim();
  const pretty = meal.charAt(0).toUpperCase() + meal.slice(1);
  const a = normalizeMealUpsertAction(action);
  if (a === 'merge') return `Aggiunta al ${pretty}`;
  if (a === 'replace') return `Modifica ${pretty}`;
  return `Nuovo · ${pretty}`;
}

/**
 * Trova lo slot esistente (mealType reale nel log) per un tipo canonico.
 * Preferisce lo slot senza suffisso ghost (_2).
 *
 * @param {Array<object>} log
 * @param {string} mealTypeCanonical
 * @returns {{ mealType: string, mealTime: number|null, slotId: string } | null}
 */
export function findExistingCanonicalMealSlot(log, mealTypeCanonical) {
  const canonical = String(mealTypeCanonical || '').trim().toLowerCase().split('_')[0];
  if (!canonical) return null;
  const foods = (Array.isArray(log) ? log : []).filter(
    (item) => (item?.type === 'food' || item?.type === 'recipe')
      && String(item?.mealType || '').split('_')[0].toLowerCase() === canonical,
  );
  if (!foods.length) return null;

  const exact = foods.find((item) => String(item.mealType || '').toLowerCase() === canonical);
  const pick = exact || foods[0];
  const mealType = String(pick.mealType || canonical);
  const mealTime = typeof pick.mealTime === 'number' && !Number.isNaN(pick.mealTime)
    ? pick.mealTime
    : null;
  return {
    mealType,
    mealTime,
    slotId: mealType,
  };
}
