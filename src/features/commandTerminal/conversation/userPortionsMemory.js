/**
 * Memoria a lungo termine — porzioni utente (Stadio 1 Motore Ibrido).
 * Firebase: users/{uid}/user_portions  →  { "pomodoro": 150, "pane": 30, ... }
 */

import { ref, update, get } from 'firebase/database';

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
    const norm = normalizePortionFoodKey(key);
    if (!norm) return;
    const grams = Math.round(Number(raw[key]?.grams ?? raw[key]));
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return;
    out[norm] = grams;
  });
  return out;
}

/**
 * True se l'item della bozza va memorizzato (era stima/unità).
 * @param {object} item
 * @returns {boolean}
 */
export function shouldLearnPortionFromMealItem(item) {
  if (!item || typeof item !== 'object') return false;
  return item.isEstimated === true || item.wasEstimated === true || item.learnPortion === true;
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
    const key = normalizePortionFoodKey(item.foodName || item.name);
    const grams = Math.round(Number(item.grams ?? item.qty ?? item.weight) || 0);
    if (!key || !(grams > 0)) return;
    // Per unità multiple (es. 2 fette → 60g totali) memorizziamo il peso confermato
    // come standard per quella descrizione (chiave = nome alimento puro).
    patch[key] = grams;
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
