/**
 * Memoria a lungo termine — porzioni utente (Stadio 1 Motore Ibrido).
 * Firebase: users/{uid}/user_portions  →  { "pomodoro": 150, "pane": 30, ... }
 * Locale: recentFoodPortions in LocalStorage (ultima quantità confermata).
 */

import { ref, update, get } from 'firebase/database';

export const RECENT_FOOD_PORTIONS_LS_KEY = 'kentu_recent_food_portions';

/**
 * Chiave stabile per il dizionario (minuscolo, senza accenti).
 * @param {unknown} name
 * @returns {string}
 */
export function normalizePortionFoodKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function sanitizeUserPortionsDict(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((key) => {
    const rawKey = String(key || '').trim();
    const norm = normalizePortionFoodKey(rawKey);
    const grams = Math.round(Number(raw[key]?.grams ?? raw[key]));
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return;
    if (rawKey && /^[A-Za-z0-9_.:-]{2,80}$/.test(rawKey)) {
      out[rawKey] = grams;
    }
    if (norm) out[norm] = grams;
  });
  return out;
}

/**
 * @returns {Record<string, number>}
 */
export function readRecentFoodPortions() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(RECENT_FOOD_PORTIONS_LS_KEY);
    if (!raw) return {};
    return sanitizeUserPortionsDict(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, number>} dict
 */
export function writeRecentFoodPortions(dict) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      RECENT_FOOD_PORTIONS_LS_KEY,
      JSON.stringify(sanitizeUserPortionsDict(dict)),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Memorizza l'ultima quantità usata per id e/o nome.
 * @param {{ id?: string, foodId?: string, foodDbKey?: string, name?: string, foodName?: string, grams?: number }} food
 * @returns {Record<string, number>}
 */
export function rememberRecentFoodPortion(food = {}) {
  const grams = Math.round(Number(food.grams ?? food.qty ?? food.weight) || 0);
  if (!(grams > 0) || grams > 5000) return readRecentFoodPortions();

  const prev = readRecentFoodPortions();
  const id = String(food.id || food.foodId || food.foodDbKey || food.key || '').trim();
  const nameKey = normalizePortionFoodKey(food.name || food.foodName || food.desc || '');
  const next = { ...prev };
  if (id) next[id] = grams;
  if (nameKey) next[nameKey] = grams;
  writeRecentFoodPortions(next);
  return next;
}

/**
 * Default grammi: ultima porzione → servingSize → null (caller fa fallback 100).
 * @param {{ id?: string, foodDbKey?: string, name?: string, foodName?: string, servingSize?: unknown, row?: object }} food
 * @param {Record<string, number>} [extraDict]
 * @returns {number}
 */
export function lookupRecentFoodPortionGrams(food = {}, extraDict = null) {
  const dict = {
    ...readRecentFoodPortions(),
    ...(extraDict && typeof extraDict === 'object' ? sanitizeUserPortionsDict(extraDict) : {}),
  };
  const id = String(food.id || food.foodId || food.foodDbKey || food.key || '').trim();
  if (id) {
    const fromId = Math.round(Number(dict[id]) || 0);
    if (fromId > 0) return fromId;
  }
  const nameKey = normalizePortionFoodKey(food.name || food.foodName || food.desc || '');
  if (nameKey) {
    const fromName = Math.round(Number(dict[nameKey]) || 0);
    if (fromName > 0) return fromName;
  }
  return 0;
}

/**
 * @param {{ id?: string, foodDbKey?: string, name?: string, foodName?: string, servingSize?: unknown, row?: object }} food
 * @param {Record<string, number>} [extraDict]
 * @returns {number}
 */
export function resolveDefaultFoodGrams(food = {}, extraDict = null) {
  const recent = lookupRecentFoodPortionGrams(food, extraDict);
  if (recent > 0) return recent;
  const serving = Math.round(
    Number(food.servingSize ?? food.row?.servingSize ?? food.defaultQty ?? food.row?.defaultQty) || 0,
  );
  if (serving > 0) return serving;
  return 100;
}

/**
 * True se l'item della bozza va memorizzato (qualsiasi conferma con grammi validi).
 * @param {object} item
 * @returns {boolean}
 */
export function shouldLearnPortionFromMealItem(item) {
  if (!item || typeof item !== 'object') return false;
  const grams = Math.round(Number(item.grams ?? item.qty ?? item.weight) || 0);
  return Number.isFinite(grams) && grams > 0 && grams <= 5000;
}

/**
 * Patch Firebase da items confermati della bozza.
 * @param {Array<object>} items
 * @returns {Record<string, number>}
 */
export function buildUserPortionsPatchFromMealItems(items = []) {
  const patch = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!shouldLearnPortionFromMealItem(item)) return;
    const grams = Math.round(Number(item.grams ?? item.qty ?? item.weight) || 0);
    if (!(grams > 0)) return;
    const nameKey = normalizePortionFoodKey(item.foodName || item.name || item.desc);
    const id = String(item.foodDbKey || item.matchedKey || item.id || item.foodId || '').trim();
    if (nameKey) patch[nameKey] = grams;
    if (id) patch[id] = grams;
  });
  return patch;
}

/**
 * Path RTDB.
 * @param {string} uid
 * @returns {string}
 */
export function userPortionsFirebasePath(uid) {
  return `users/${uid}/user_portions`;
}

/**
 * Carica il dizionario da Firebase.
 * @param {import('firebase/database').Database} db
 * @param {string} uid
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchUserPortionsDict(db, uid) {
  if (!db || !uid) return {};
  try {
    const snap = await get(ref(db, userPortionsFirebasePath(uid)));
    if (!snap.exists()) return {};
    return sanitizeUserPortionsDict(snap.val());
  } catch (error) {
    console.warn('[userPortions] fetch failed', error);
    return {};
  }
}

/**
 * Merge patch su Firebase (fire-and-forget friendly).
 * Non lancia: errori solo in console.
 * @param {{ db: object, uid: string, patch: Record<string, number> }} params
 * @returns {Promise<Record<string, number>>} patch effettivamente inviato (vuoto se skip)
 */
export async function persistUserPortionsPatch({ db, uid, patch }) {
  const safe = sanitizeUserPortionsDict(patch);
  if (!db || !uid || Object.keys(safe).length === 0) return {};
  try {
    await update(ref(db, userPortionsFirebasePath(uid)), safe);
    return safe;
  } catch (error) {
    console.warn('[userPortions] persist failed (non-blocking)', error);
    return {};
  }
}

/**
 * Apprende porzioni dagli item bozza confermati + aggiorna stato locale.
 * Fire-and-forget: non blocca il caller.
 *
 * @param {{
 *   db: object,
 *   uid: string,
 *   items: Array<object>,
 *   onLocalMerge?: (patch: Record<string, number>) => void,
 * }} params
 */
export function learnUserPortionsFromConfirmedMeal({
  db,
  uid,
  items,
  onLocalMerge = null,
}) {
  const patch = buildUserPortionsPatchFromMealItems(items);
  if (Object.keys(patch).length === 0) return;

  try {
    writeRecentFoodPortions({
      ...readRecentFoodPortions(),
      ...patch,
    });
    if (typeof onLocalMerge === 'function') {
      onLocalMerge(patch);
    }
  } catch (error) {
    console.warn('[userPortions] local merge failed', error);
  }

  void persistUserPortionsPatch({ db, uid, patch }).then((saved) => {
    if (Object.keys(saved).length > 0) {
      console.log('[userPortions] learned', saved);
    }
  });
}
