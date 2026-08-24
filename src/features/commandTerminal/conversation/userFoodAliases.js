/**
 * Memoria semantica AI — dizionario alias alimenti.
 * Firebase RTDB: users/{uid}/user_food_aliases → { "pasta integrale": "foodDbKey", ... }
 */

import { ref, update, get } from 'firebase/database';
import { normalizePortionFoodKey } from './userPortionsMemory.js';

const CACHE_STORAGE_KEY = 'kentu_user_food_aliases_v1';
const CACHE_SCHEMA_VERSION = 1;

/** @param {unknown} name @returns {string} */
export function normalizeSpokenFoodAliasKey(name) {
  return normalizePortionFoodKey(name);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeUserFoodAliasesDict(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((key) => {
    const norm = normalizeSpokenFoodAliasKey(key);
    const foodDbKey = String(raw[key] ?? '').trim();
    if (!norm || !foodDbKey) return;
    out[norm] = foodDbKey.slice(0, 120);
  });
  return out;
}

/**
 * @param {string} uid
 * @returns {string}
 */
export function userFoodAliasesFirebasePath(uid) {
  return `users/${uid}/user_food_aliases`;
}

/**
 * @param {import('firebase/database').Database} db
 * @param {string} uid
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchUserFoodAliasesDict(db, uid) {
  if (!db || !uid) return {};
  try {
    const snap = await get(ref(db, userFoodAliasesFirebasePath(uid)));
    if (!snap.exists()) return {};
    return sanitizeUserFoodAliasesDict(snap.val());
  } catch (error) {
    console.warn('[userFoodAliases] fetch failed', error);
    return {};
  }
}

/**
 * @param {string|null|undefined} [expectedUid]
 * @returns {Record<string, string>}
 */
export function loadUserFoodAliasesFromCache(expectedUid = null) {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Number(parsed.v) !== CACHE_SCHEMA_VERSION) return {};
    const cachedUid = parsed.uid != null ? String(parsed.uid).trim() : '';
    const wantedUid = expectedUid != null ? String(expectedUid).trim() : '';
    if (wantedUid && cachedUid && cachedUid !== wantedUid) return {};
    return sanitizeUserFoodAliasesDict(parsed.aliases);
  } catch (error) {
    console.warn('[userFoodAliases] cache load failed', error);
    return {};
  }
}

/**
 * @param {Record<string, string>} aliases
 * @param {string|null|undefined} uid
 */
export function saveUserFoodAliasesToCache(aliases, uid = null) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload = {
      v: CACHE_SCHEMA_VERSION,
      uid: uid != null ? String(uid).trim() : '',
      savedAt: Date.now(),
      aliases: sanitizeUserFoodAliasesDict(aliases),
    };
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[userFoodAliases] cache save failed', error);
  }
}

/**
 * @param {Record<string, string>} local
 * @param {Record<string, string>} remote
 * @returns {Record<string, string>}
 */
export function mergeUserFoodAliasesRemoteOverLocal(local = {}, remote = {}) {
  return {
    ...sanitizeUserFoodAliasesDict(local),
    ...sanitizeUserFoodAliasesDict(remote),
  };
}

/**
 * @param {string} spokenTerm
 * @param {Record<string, string>} aliases
 * @returns {string|null}
 */
export function lookupUserFoodAlias(spokenTerm, aliases = {}) {
  const key = normalizeSpokenFoodAliasKey(spokenTerm);
  if (!key) return null;
  const safe = sanitizeUserFoodAliasesDict(aliases);
  return safe[key] || null;
}

/**
 * @param {{ db: object, uid: string, spokenTerm: string, foodDbKey: string }} params
 * @returns {Promise<Record<string, string>>}
 */
export async function persistUserFoodAlias({ db, uid, spokenTerm, foodDbKey }) {
  const key = normalizeSpokenFoodAliasKey(spokenTerm);
  const dbKey = String(foodDbKey || '').trim();
  if (!db || !uid || !key || !dbKey) return {};
  const patch = { [key]: dbKey };
  try {
    await update(ref(db, userFoodAliasesFirebasePath(uid)), patch);
    return patch;
  } catch (error) {
    console.warn('[userFoodAliases] persist failed (non-blocking)', error);
    return {};
  }
}

/**
 * Salva alias da scelta utente (disambiguazione / cambia associazione).
 * Fire-and-forget.
 *
 * @param {{
 *   db: object,
 *   uid: string,
 *   spokenTerm: string,
 *   foodDbKey: string,
 *   onLocalMerge?: (patch: Record<string, string>) => void,
 * }} params
 */
export function learnUserFoodAlias({
  db,
  uid,
  spokenTerm,
  foodDbKey,
  onLocalMerge = null,
}) {
  const key = normalizeSpokenFoodAliasKey(spokenTerm);
  const dbKey = String(foodDbKey || '').trim();
  if (!key || !dbKey) return;

  const patch = { [key]: dbKey };

  try {
    if (typeof onLocalMerge === 'function') {
      onLocalMerge(patch);
    }
  } catch (error) {
    console.warn('[userFoodAliases] local merge failed', error);
  }

  if (!db || !uid) return;

  void persistUserFoodAlias({ db, uid, spokenTerm, foodDbKey }).then((saved) => {
    if (Object.keys(saved).length > 0) {
      console.log('[userFoodAliases] learned', saved);
    }
  });
}
