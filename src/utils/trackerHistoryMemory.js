/**
 * Storico tracker in-RAM per uid: evita re-download su remount Home→Focus→Home.
 * Finestra Home: ultimi HOME_HISTORY_DAYS. Range più vecchi on-demand.
 */

import { query, orderByKey, startAt, endAt, get, ref } from 'firebase/database';
import { addDays } from '../calendarDateUtils.js';
import { getTodayString, TRACKER_STORICO_KEY } from '../coreEngine';

export const HOME_HISTORY_DAYS = 90;

/** Allineato a getDaysSinceLastStimulus (scan a ritroso fino a 365g). */
export const STIMULUS_HISTORY_DAYS = 365;

/** @type {Map<string, { tree: object, from: string, to: string, loadedAt: number }>} */
const BY_UID = new Map();

/**
 * @param {string} uid
 */
export function peekTrackerHistoryMemory(uid) {
  const id = String(uid || '').trim();
  if (!id) return null;
  return BY_UID.get(id) || null;
}

/**
 * @param {string} uid
 * @param {object} tree
 * @param {{ from?: string, to?: string }} [range]
 */
export function stashTrackerHistoryMemory(uid, tree, range = {}) {
  const id = String(uid || '').trim();
  if (!id || !tree || typeof tree !== 'object') return false;
  const prev = BY_UID.get(id);
  const merged = prev?.tree ? { ...prev.tree, ...tree } : { ...tree };
  const dates = Object.keys(merged)
    .filter((k) => /^trackerStorico_\d{4}-\d{2}-\d{2}$/.test(k))
    .map((k) => k.slice('trackerStorico_'.length))
    .sort();
  BY_UID.set(id, {
    tree: merged,
    from: range.from || dates[0] || prev?.from || null,
    to: range.to || dates[dates.length - 1] || prev?.to || null,
    loadedAt: Date.now(),
  });
  return true;
}

export function clearTrackerHistoryMemory(uid) {
  const id = String(uid || '').trim();
  if (id) BY_UID.delete(id);
}

/**
 * @param {string} [today]
 */
export function homeHistoryWindow(today = getTodayString()) {
  const to = String(today || getTodayString()).slice(0, 10);
  const from = addDays(to, -(HOME_HISTORY_DAYS - 1));
  return { from, to };
}

function snapVal(snap) {
  if (!snap) return null;
  return snap.exists?.() ? snap.val() : null;
}

/**
 * Scarica un intervallo orderByKey (o fallback albero filtrato).
 * @param {{ db: object, uid: string, from: string, to: string, existing?: object }} input
 */
export async function loadTrackerHistoryRange(input) {
  const uid = String(input?.uid || '').trim();
  const from = String(input?.from || '').slice(0, 10);
  const to = String(input?.to || '').slice(0, 10);
  if (!uid || !input?.db || !from || !to) {
    return { ok: false, tree: input?.existing || {}, from, to };
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const trackerRoot = ref(input.db, `users/${uid}/tracker_data`);
  const startKey = TRACKER_STORICO_KEY(from);
  const endKey = `${TRACKER_STORICO_KEY(to)}\uf8ff`;
  let chunk = {};
  try {
    const rangeQuery = query(trackerRoot, orderByKey(), startAt(startKey), endAt(endKey));
    const snap = await get(rangeQuery);
    chunk = snapVal(snap) || {};
    // food DB personale serve a Home; una sola volta se manca.
    if (!chunk.trackerFoodDatabase && !(input.existing || {}).trackerFoodDatabase) {
      try {
        const foodSnap = await get(ref(input.db, `users/${uid}/tracker_data/trackerFoodDatabase`));
        const foodDb = snapVal(foodSnap);
        if (foodDb && typeof foodDb === 'object') chunk.trackerFoodDatabase = foodDb;
      } catch {
        /* optional */
      }
    }
  } catch {
    const snap = await get(trackerRoot);
    const all = snapVal(snap) || {};
    chunk = {};
    for (const [key, value] of Object.entries(all)) {
      const m = /^trackerStorico_(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!m) {
        if (key === 'trackerFoodDatabase') chunk[key] = value;
        continue;
      }
      if (m[1] >= from && m[1] <= to) chunk[key] = value;
    }
  }
  const merged = { ...(input.existing && typeof input.existing === 'object' ? input.existing : {}), ...chunk };
  stashTrackerHistoryMemory(uid, merged, { from, to });
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  // eslint-disable-next-line no-console
  console.log(`[perf] bootstrap:history-range +${ms} ms from=${from} to=${to} days=${Object.keys(chunk).filter((k) => k.startsWith('trackerStorico_')).length}`);
  return { ok: true, tree: merged, from, to, ms };
}

/**
 * @param {string} uid
 * @param {string} from
 * @param {string} to
 */
export function trackerHistoryMemoryCoversRange(uid, from, to) {
  const mem = peekTrackerHistoryMemory(uid);
  if (!mem?.tree || !mem.from || !mem.to) return false;
  const a = String(from || '').slice(0, 10);
  const b = String(to || '').slice(0, 10);
  if (!a || !b) return false;
  return mem.from <= a && mem.to >= b;
}

/**
 * True se la memoria copre già la finestra Home (90g).
 * @param {string} uid
 * @param {string} [today]
 */
export function trackerHistoryMemoryCoversHome(uid, today = getTodayString()) {
  const win = homeHistoryWindow(today);
  return trackerHistoryMemoryCoversRange(uid, win.from, win.to);
}

/**
 * Finestra per scan stimolo muscolare (365g).
 * @param {string} [today]
 */
export function stimulusHistoryWindow(today = getTodayString()) {
  const to = String(today || getTodayString()).slice(0, 10);
  const from = addDays(to, -(STIMULUS_HISTORY_DAYS - 1));
  return { from, to };
}

/**
 * Garantisce che RAM+RTDB coprano [from,to]; no-op se già coperto.
 * @param {{ db: object, uid: string, from: string, to: string, existing?: object }} input
 */
export async function ensureTrackerHistoryRange(input) {
  const uid = String(input?.uid || '').trim();
  const from = String(input?.from || '').slice(0, 10);
  const to = String(input?.to || '').slice(0, 10);
  if (!uid || !from || !to) {
    return { ok: false, tree: input?.existing || {}, skipped: true, from, to };
  }
  if (trackerHistoryMemoryCoversRange(uid, from, to)) {
    const mem = peekTrackerHistoryMemory(uid);
    // eslint-disable-next-line no-console
    console.log(`[perf] bootstrap:history-range skipped (memory covers ${from}…${to})`);
    return { ok: true, tree: mem.tree, skipped: true, from, to };
  }
  return loadTrackerHistoryRange(input);
}
