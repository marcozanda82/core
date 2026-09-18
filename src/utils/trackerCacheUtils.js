import { getTodayString, TRACKER_STORICO_KEY } from '../coreEngine';
import { addDays } from '../calendarDateUtils';

export const KENTU_RECENT_HISTORY = 'kentu_recent_history_v1';
const RECENT_HISTORY_SCHEMA = 1;
const RECENT_HISTORY_DAYS = 15;
const RECENT_HISTORY_FALLBACK_DAYS = 7;
const TRACKER_STORICO_PREFIX = 'trackerStorico_';
const FOOD_DB_KEY = 'trackerFoodDatabase';

function recentHistoryCacheKey(uid) {
  return `${KENTU_RECENT_HISTORY}_${String(uid || '').trim()}`;
}

function isQuotaExceeded(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const code = err.code;
  return (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || code === 22
    || code === 1014
    || /quota/i.test(String(err.message || ''))
  );
}

function safeParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isStoricoDayKey(key) {
  const k = String(key || '');
  if (!k.startsWith(TRACKER_STORICO_PREFIX)) return false;
  if (k === FOOD_DB_KEY || k.includes(FOOD_DB_KEY)) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(k.slice(TRACKER_STORICO_PREFIX.length));
}

function isAnchorFresh(anchorDate, today = getTodayString()) {
  const iso = String(anchorDate || '').slice(0, 10);
  if (!iso) return false;
  return iso === today || iso === addDays(today, -1);
}

/**
 * Estrae solo i nodi `trackerStorico_YYYY-MM-DD` (mai `trackerFoodDatabase`).
 * @param {object | null | undefined} tree
 * @param {string} [anchorDate]
 * @param {number} [days]
 * @returns {Record<string, object>}
 */
export function extractRecentHistoryDays(
  tree,
  anchorDate = getTodayString(),
  days = RECENT_HISTORY_DAYS,
) {
  const out = {};
  if (!tree || typeof tree !== 'object') return out;
  const anchor = String(anchorDate || getTodayString()).slice(0, 10);
  const window = Math.max(1, Math.floor(Number(days) || RECENT_HISTORY_DAYS));
  for (let i = 0; i < window; i += 1) {
    const iso = addDays(anchor, -i);
    const key = TRACKER_STORICO_KEY(iso);
    if (!isStoricoDayKey(key)) continue;
    const node = tree[key];
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      out[key] = node;
    }
  }
  return out;
}

function readRecentHistoryPayload(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return null;
  const doc = safeParse(window.localStorage.getItem(recentHistoryCacheKey(uid)));
  if (!doc || typeof doc !== 'object') return null;
  if (Number(doc.v) !== RECENT_HISTORY_SCHEMA) return null;
  if (String(doc.uid || '').trim() !== String(uid).trim()) return null;
  if (!isAnchorFresh(doc.anchorDate)) return null;
  if (!doc.days || typeof doc.days !== 'object' || Array.isArray(doc.days)) return null;
  return doc;
}

/**
 * Legge il subset 15 giorni (o 7 se salvato in fallback quota).
 * @param {string | null | undefined} uid
 * @param {string} [anchorDate]
 * @returns {Record<string, object> | null}
 */
export function readRecentHistoryCache(uid, anchorDate = getTodayString()) {
  const doc = readRecentHistoryPayload(uid);
  if (!doc) return null;
  const days = extractRecentHistoryDays(doc.days, anchorDate || doc.anchorDate, RECENT_HISTORY_DAYS);
  return Object.keys(days).length > 0 ? days : null;
}

function persistRecentHistoryDays(uid, days, anchorDate) {
  const payload = {
    v: RECENT_HISTORY_SCHEMA,
    uid: String(uid).trim(),
    savedAt: Date.now(),
    anchorDate: String(anchorDate || getTodayString()).slice(0, 10),
    days,
  };
  window.localStorage.setItem(recentHistoryCacheKey(uid), JSON.stringify(payload));
}

/**
 * Persiste gli ultimi 15 giorni. Se quota piena, ritenta con 7 giorni; poi abortisce.
 * @param {string | null | undefined} uid
 * @param {object | null | undefined} tree
 * @param {string} [anchorDate]
 * @returns {boolean}
 */
export function writeRecentHistoryCache(uid, tree, anchorDate = getTodayString()) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return false;
  const anchor = String(anchorDate || getTodayString()).slice(0, 10);
  const days15 = extractRecentHistoryDays(tree, anchor, RECENT_HISTORY_DAYS);
  if (Object.keys(days15).length === 0) return false;

  try {
    persistRecentHistoryDays(uid, days15, anchor);
    return true;
  } catch (err) {
    if (!isQuotaExceeded(err)) {
      console.warn('recent history cache write failed:', err);
      return false;
    }
    try {
      const days7 = extractRecentHistoryDays(tree, anchor, RECENT_HISTORY_FALLBACK_DAYS);
      if (Object.keys(days7).length === 0) return false;
      persistRecentHistoryDays(uid, days7, anchor);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Aggiorna un singolo giorno nel blob 15g (es. dopo sync di oggi).
 * @param {string | null | undefined} uid
 * @param {string} dateStr
 * @param {object | null | undefined} node
 * @returns {boolean}
 */
export function patchRecentHistoryDay(uid, dateStr, node) {
  if (!uid || !dateStr || !node || typeof node !== 'object' || Array.isArray(node)) return false;
  const iso = String(dateStr).slice(0, 10);
  const key = TRACKER_STORICO_KEY(iso);
  if (!isStoricoDayKey(key)) return false;

  const existing = readRecentHistoryPayload(uid);
  const merged = {
    ...(existing?.days && typeof existing.days === 'object' ? existing.days : {}),
    [key]: node,
  };
  delete merged[FOOD_DB_KEY];
  return writeRecentHistoryCache(uid, merged, getTodayString());
}

/** SWR: aggiorna localStorage per il giorno corrente (sync, best-effort). */
export function writeTodayTrackerLocalCache(dateStr, log, mealTimes) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (dateStr !== getTodayString()) return;
  try {
    window.localStorage.setItem(
      TRACKER_STORICO_KEY(dateStr),
      JSON.stringify({ log: log ?? [], mealTimes: mealTimes ?? {} }),
    );
  } catch (err) {
    console.warn('tracker local cache write failed:', err);
  }
}
