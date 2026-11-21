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
    .map((row) => {
      const usageCount = row.grams.length;
      return {
        foodDbKey: row.foodDbKey,
        name: row.name,
        usageCount,
        usedTimesLabel: `usato ${usageCount} volt${usageCount === 1 ? 'a' : 'e'} negli ultimi ${LOOKBACK_DAYS} giorni`,
        typicalGrams: modeOrMedian(row.grams),
        typicalSlot: modeString(row.slots),
        typicalTime: decimalToHHmm(modeOrMedian(row.times)),
        lastUsed: row.lastUsed || null,
      };
    })
    .filter((row) => row.typicalGrams != null && row.usageCount >= 1)
    .sort((a, b) => b.usageCount - a.usageCount || (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, limit);

  return {
    lookbackDays: LOOKBACK_DAYS,
    count: habits.length,
    habits,
    note: 'Preferisci il foodDbKey con usageCount più alto. Usa typicalGrams prima di chiedere conferma.',
  };
}

function hitFoodDbKey(hit) {
  return String(hit?.foodDbKey || hit?.id || hit?.key || hit?.matchedKey || '').trim();
}

/**
 * Ordina i risultati search: prima i più usati (usageCount), poi match quality.
 * @param {Array<object>} results
 * @param {Map<string, { score: number, usageCount: number }>|Record<string, number>} recentScores
 */
export function rankSearchResultsByRecentUsage(results, recentScores) {
  const scores = recentScores instanceof Map
    ? recentScores
    : new Map(Object.entries(recentScores || {}));
  const qualityRank = { exact: 4, prefix: 3, contains: 2, fuzzy: 1 };
  return [...(results || [])]
    .map((hit) => {
      const key = hitFoodDbKey(hit);
      const raw = scores.get(key);
      const usageCount = typeof raw === 'object' && raw
        ? Number(raw.usageCount) || 0
        : 0;
      const score = typeof raw === 'object' && raw
        ? Number(raw.score) || 0
        : Number(raw) || 0;
      return { ...hit, foodDbKey: key || hit?.foodDbKey || null, usageCount, _usageScore: score };
    })
    .sort((a, b) => {
      if ((b.usageCount || 0) !== (a.usageCount || 0)) return (b.usageCount || 0) - (a.usageCount || 0);
      if ((b._usageScore || 0) !== (a._usageScore || 0)) return (b._usageScore || 0) - (a._usageScore || 0);
      const qa = qualityRank[String(a?.matchQuality || '').toLowerCase()] || 0;
      const qb = qualityRank[String(b?.matchQuality || '').toLowerCase()] || 0;
      if (qb !== qa) return qb - qa;
      return 0;
    });
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @returns {Promise<Map<string, { score: number, usageCount: number }>>}
 */
export async function loadRecentFoodUsageScores(db, uid) {
  const habits = await toolGetHabits(db, uid, { limit: 80 });
  const map = new Map();
  for (const h of habits.habits || []) {
    const usageCount = Number(h.usageCount) || 0;
    map.set(h.foodDbKey, {
      usageCount,
      score: usageCount * 100 + Math.min(50, Math.floor((h.lastUsed || 0) / 1e10)),
    });
  }
  return map;
}
