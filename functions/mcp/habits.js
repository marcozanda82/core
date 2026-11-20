/**
 * Abitudini alimentari (sola lettura) per Claude: foodDbKey, porzione tipica, slot/orario.
 */

import { addDaysIso, todayInRome } from './dates.js';

const LOOKBACK_DAYS = 60;
const MAX_HABITS = 40;

function finite(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function mealSlotOf(mealId, item) {
  const raw = String(item?.mealType || mealId || '').trim().toLowerCase();
  const base = raw.split('_')[0];
  if (['colazione', 'snack', 'pranzo', 'cena'].includes(base)) return base;
  return null;
}

function decimalToHHmm(dec) {
  const n = Number(dec);
  if (!Number.isFinite(n)) return null;
  const h = Math.floor(n) % 24;
  const m = Math.round((n - Math.floor(n)) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function modeOrMedian(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) return null;
  const freq = new Map();
  for (const n of list) {
    const k = Math.round(n);
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let best = null;
  let bestC = 0;
  for (const [k, c] of freq) {
    if (c > bestC) {
      best = k;
      bestC = c;
    }
  }
  if (best != null && bestC >= 2) return best;
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
}

function modeString(values) {
  const freq = new Map();
  for (const v of values || []) {
    if (!v) continue;
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  let best = null;
  let bestC = 0;
  for (const [k, c] of freq) {
    if (c > bestC) {
      best = k;
      bestC = c;
    }
  }
  return best;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {{ limit?: number }} [opts]
 */
export async function toolGetHabits(db, uid, opts = {}) {
  const id = String(uid || '').trim();
  const limit = Math.min(MAX_HABITS, Math.max(1, Number(opts.limit) || 25));
  const today = todayInRome(new Date());
  const start = addDaysIso(today, -(LOOKBACK_DAYS - 1));

  /** @type {Map<string, { foodDbKey: string, name: string, grams: number[], slots: string[], times: number[], lastUsed: number }>} */
  const byKey = new Map();

  const trackerSnap = await db.ref(`users/${id}/tracker_data`).get();
  const tracker = trackerSnap.exists() ? trackerSnap.val() : {};

  for (const [dayKey, day] of Object.entries(tracker || {})) {
    if (!String(dayKey).startsWith('trackerStorico_')) continue;
    const date = String(dayKey).slice('trackerStorico_'.length);
    if (date < start || date > today) continue;
    const log = Array.isArray(day?.log) ? day.log : Object.values(day?.log || {});
    const mealTimes = day?.mealTimes && typeof day.mealTimes === 'object' ? day.mealTimes : {};

    for (const meal of log) {
      if (!meal || typeof meal !== 'object') continue;
      const mealId = String(meal.mealId || meal.id || '');
      const items = Array.isArray(meal.items)
        ? meal.items
        : (meal.type === 'food' || meal.type === 'recipe' || meal.foodName || meal.desc ? [meal] : []);
      const mealTime = finite(mealTimes[mealId]) ?? finite(items[0]?.mealTime);

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (item.condimentKind || item.condimentOf) continue;
        const foodDbKey = String(item.foodDbKey || item.matchedKey || '').trim();
        if (!foodDbKey) continue;
        const grams = finite(item.grams ?? item.qta ?? item.weight ?? item.qty);
        if (grams == null || grams <= 0) continue;
        const name = String(item.name || item.desc || item.foodName || foodDbKey).trim();
        const slot = mealSlotOf(mealId, item);
        const prev = byKey.get(foodDbKey) || {
          foodDbKey,
          name,
          grams: [],
          slots: [],
          times: [],
          lastUsed: 0,
        };
        prev.grams.push(grams);
        if (slot) prev.slots.push(slot);
        if (mealTime != null) prev.times.push(mealTime);
        prev.lastUsed = Math.max(prev.lastUsed, Date.parse(`${date}T12:00:00Z`) || 0);
        if (name) prev.name = name;
        byKey.set(foodDbKey, prev);
      }
    }
  }

  const habits = [...byKey.values()]
    .map((row) => ({
      foodDbKey: row.foodDbKey,
      name: row.name,
      usageCount: row.grams.length,
      typicalGrams: modeOrMedian(row.grams),
      typicalSlot: modeString(row.slots),
      typicalTime: decimalToHHmm(modeOrMedian(row.times)),
      lastUsed: row.lastUsed || null,
    }))
    .filter((row) => row.typicalGrams != null && row.usageCount >= 1)
    .sort((a, b) => b.usageCount - a.usageCount || (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, limit);

  return {
    lookbackDays: LOOKBACK_DAYS,
    count: habits.length,
    habits,
    note: 'Usa foodDbKey + typicalGrams per proporre porzioni abituali prima di chiedere conferma.',
  };
}

/**
 * Ordina i risultati search mettendo prima le chiavi usate di recente.
 * @param {Array<object>} results
 * @param {Map<string, number>|Record<string, number>} recentScores
 */
export function rankSearchResultsByRecentUsage(results, recentScores) {
  const scores = recentScores instanceof Map
    ? recentScores
    : new Map(Object.entries(recentScores || {}));
  return [...(results || [])].sort((a, b) => {
    const sa = scores.get(String(a?.id || '')) || 0;
    const sb = scores.get(String(b?.id || '')) || 0;
    if (sb !== sa) return sb - sa;
    return 0;
  });
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @returns {Promise<Map<string, number>>}
 */
export async function loadRecentFoodUsageScores(db, uid) {
  const habits = await toolGetHabits(db, uid, { limit: 80 });
  const map = new Map();
  for (const h of habits.habits || []) {
    map.set(h.foodDbKey, (h.usageCount || 0) * 10 + Math.min(50, Math.floor((h.lastUsed || 0) / 1e10)));
  }
  return map;
}
