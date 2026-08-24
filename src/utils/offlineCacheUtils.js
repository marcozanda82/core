/**
 * Cache locale del Database Personale (trackerFoodDatabase).
 * Fase 1 Offline-First: idratazione istantanea da localStorage prima del fetch RTDB.
 */

const CACHE_STORAGE_KEY = 'kentu_personal_food_db_v1';
const CACHE_SCHEMA_VERSION = 1;
/** ~4.5 MB — margine sotto quota tipica localStorage (5 MB). */
const LOCAL_STORAGE_SOFT_LIMIT_BYTES = 4_500_000;

function sanitizeFoodDb(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((key) => {
    const row = raw[key];
    if (!key || !row || typeof row !== 'object' || Array.isArray(row)) return;
    out[key] = row;
  });
  return out;
}

function readCachePayload() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Number(parsed.v) !== CACHE_SCHEMA_VERSION) return null;
    return parsed;
  } catch (error) {
    console.warn('[offlineCache] load parse failed', error);
    return null;
  }
}

/**
 * Carica il DB personale dalla cache locale (sincrono — zero latency al cold start).
 * @param {string|null|undefined} [expectedUid] Se fornito, ignora cache di altri utenti.
 * @returns {Record<string, object>}
 */
export function loadPersonalDbFromCache(expectedUid = null) {
  const payload = readCachePayload();
  if (!payload?.foodDb) return {};

  const cachedUid = payload.uid != null ? String(payload.uid).trim() : '';
  const wantedUid = expectedUid != null ? String(expectedUid).trim() : '';

  if (wantedUid && cachedUid && cachedUid !== wantedUid) {
    return {};
  }

  return sanitizeFoodDb(payload.foodDb);
}

/**
 * Persiste il DB personale in localStorage (best-effort, non blocca UI).
 * @param {Record<string, object>} foodDb
 * @param {string|null|undefined} [uid]
 * @returns {Promise<boolean>} true se salvato con successo
 */
export async function savePersonalDbToCache(foodDb, uid = null) {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  const safeDb = sanitizeFoodDb(foodDb);
  if (Object.keys(safeDb).length === 0) return false;

  const payload = {
    v: CACHE_SCHEMA_VERSION,
    uid: uid != null ? String(uid).trim() : '',
    savedAt: Date.now(),
    foodDb: safeDb,
  };

  let serialized = '';
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    console.warn('[offlineCache] serialize failed', error);
    return false;
  }

  if (serialized.length > LOCAL_STORAGE_SOFT_LIMIT_BYTES) {
    console.warn(
      '[offlineCache] personal food DB exceeds soft limit — skip cache write',
      { bytes: serialized.length },
    );
    return false;
  }

  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn('[offlineCache] localStorage write failed (quota?)', error);
    return false;
  }
}

/**
 * Merge base RTDB → locale: le chiavi remote sovrascrivono, le voci solo-locali restano.
 * @param {Record<string, object>|null|undefined} localDb
 * @param {Record<string, object>|null|undefined} remoteDb
 * @returns {Record<string, object>}
 */
export function mergePersonalDbRemoteOverLocal(localDb, remoteDb) {
  const local = sanitizeFoodDb(localDb);
  const remote = sanitizeFoodDb(remoteDb);
  if (Object.keys(remote).length === 0) return local;
  return { ...local, ...remote };
}

/**
 * Evita setState inutili quando il merge non cambia lo snapshot.
 * @param {Record<string, object>|null|undefined} a
 * @param {Record<string, object>|null|undefined} b
 * @returns {boolean}
 */
export function personalFoodDbSnapshotsEqual(a, b) {
  const dbA = sanitizeFoodDb(a);
  const dbB = sanitizeFoodDb(b);
  const keysA = Object.keys(dbA).sort();
  const keysB = Object.keys(dbB).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i += 1) {
    if (keysA[i] !== keysB[i]) return false;
    try {
      if (JSON.stringify(dbA[keysA[i]]) !== JSON.stringify(dbB[keysB[i]])) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Rimuove la cache offline del DB alimentare personale (GDPR / elimina account).
 * @returns {boolean}
 */
export function clearPersonalDbCache() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.removeItem(CACHE_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('[offlineCache] clear failed', error);
    return false;
  }
}

/**
 * Pulisce chiavi localStorage KentuOS tipiche (cache tracker, versioni DB, ecc.).
 * Best-effort — non interrompe il flusso di eliminazione account.
 */
export function clearKentuLocalUserData() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  clearPersonalDbCache();
  const keysToRemove = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key === CACHE_STORAGE_KEY
        || key.startsWith('kentu_')
        || key.startsWith('trackerStorico_')
        || key.startsWith('ghost_')
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
  } catch (error) {
    console.warn('[offlineCache] clearKentuLocalUserData failed', error);
  }
}
