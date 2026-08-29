/**
 * Memoria contestuale Food Wizard — alimenti frequenti/recenti con grammatura tipica.
 * Fonte dati: stato già sincronizzato da Firebase (fullHistory, foodDatabase, userPortions).
 */

import { addDays } from '../../../calendarDateUtils.js';
import { getLogFromStoricoTree } from '../../../coreEngine';
import { normalizePortionFoodKey, lookupRecentFoodPortionGrams } from './userPortionsMemory.js';

export const USER_RECENT_FOODS_DEFAULT_LIMIT = 20;
export const USER_RECENT_FOODS_LOOKBACK_DAYS = 45;

function toSafeString(value) {
  return String(value ?? '').trim();
}

function isFoodLogEntry(item) {
  if (!item || typeof item !== 'object') return false;
  const type = String(item.type || '').toLowerCase();
  return type === 'food' || type === 'recipe' || type === 'meal';
}

function foodNameFromEntry(item) {
  return toSafeString(item?.desc || item?.name || item?.foodName);
}

function gramsFromEntry(item) {
  const g = Math.round(Number(item?.weight ?? item?.qta ?? item?.grams ?? item?.qty) || 0);
  return Number.isFinite(g) && g > 0 && g <= 5000 ? g : null;
}

function foodDbKeyFromEntry(item) {
  const key = toSafeString(item?.foodDbKey || item?.matchedKey || item?.dbKey || item?.id);
  return key || null;
}

function isValidIsoDate(dateStr) {
  const raw = toSafeString(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function medianPositiveInts(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Math.round(Number(v)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return Math.round((nums[mid - 1] + nums[mid]) / 2);
}

function modeOrMedian(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Math.round(Number(v)))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  const freq = new Map();
  nums.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
  let best = null;
  let bestCount = 0;
  freq.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && (best == null || value < best))) {
      best = value;
      bestCount = count;
    }
  });
  if (bestCount >= 2) return best;
  return medianPositiveInts(nums);
}

function resolveAnchorDate(currentState = {}) {
  const active = toSafeString(currentState?.activeDate);
  if (isValidIsoDate(active)) return active;
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * @typedef {{
 *   foodName: string,
 *   foodDbKey: string|null,
 *   typicalGrams: number|null,
 *   usageCount: number,
 *   lastUsed: number,
 *   aliases?: string[],
 * }} UserRecentFood
 */

/**
 * Aggrega alimenti recenti/frequenti da storico diario + DB personale + porzioni imparate.
 * I dati arrivano dallo stato app già alimentato da Firebase (tracker storico / food DB / user_portions).
 *
 * @param {object} currentState
 * @param {{
 *   limit?: number,
 *   lookbackDays?: number,
 * }} [options]
 * @returns {UserRecentFood[]}
 */
export function buildUserRecentFoods(currentState = {}, options = {}) {
  const limit = Math.max(
    1,
    Math.min(40, Number(options.limit) || USER_RECENT_FOODS_DEFAULT_LIMIT),
  );
  const lookbackDays = Math.max(
    7,
    Math.min(90, Number(options.lookbackDays) || USER_RECENT_FOODS_LOOKBACK_DAYS),
  );

  /** @type {Map<string, {
   *   foodName: string,
   *   foodDbKey: string|null,
   *   gramsSamples: number[],
   *   usageCount: number,
   *   lastUsed: number,
   *   fromPersonalDb: boolean,
   * }>} */
  const byKey = new Map();

  const upsert = ({
    foodName,
    foodDbKey = null,
    grams = null,
    usageBump = 1,
    lastUsed = 0,
    fromPersonalDb = false,
  }) => {
    const name = toSafeString(foodName);
    if (!name) return;
    const dbKey = foodDbKey ? toSafeString(foodDbKey) : null;
    const mapKey = dbKey
      ? `id:${dbKey}`
      : `name:${normalizePortionFoodKey(name)}`;
    if (!mapKey || mapKey.endsWith(':')) return;

    const prev = byKey.get(mapKey);
    if (!prev) {
      byKey.set(mapKey, {
        foodName: name,
        foodDbKey: dbKey,
        gramsSamples: grams != null ? [grams] : [],
        usageCount: Math.max(1, usageBump),
        lastUsed: Math.max(0, Number(lastUsed) || 0),
        fromPersonalDb: Boolean(fromPersonalDb),
      });
      return;
    }

    // Preferisci il nome più lungo/specifico (es. marca + descrizione).
    if (name.length > prev.foodName.length) prev.foodName = name;
    if (!prev.foodDbKey && dbKey) prev.foodDbKey = dbKey;
    if (grams != null) prev.gramsSamples.push(grams);
    prev.usageCount += Math.max(1, usageBump);
    prev.lastUsed = Math.max(prev.lastUsed, Math.max(0, Number(lastUsed) || 0));
    if (fromPersonalDb) prev.fromPersonalDb = true;
  };

  const ingestLog = (log, dayIndex = 0) => {
    const entries = Array.isArray(log) ? log : [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const item = entries[i];
      if (!isFoodLogEntry(item)) continue;
      const foodName = foodNameFromEntry(item);
      if (!foodName) continue;
      const grams = gramsFromEntry(item);
      const lastUsed = Number(item?.timestamp ?? item?.lastUsedAt ?? item?.lastUsed)
        || (Date.now() - dayIndex * 86400000);
      upsert({
        foodName,
        foodDbKey: foodDbKeyFromEntry(item),
        grams,
        usageBump: 1,
        lastUsed,
      });
    }
  };

  // 1) Diario attivo (oggi) — già sync Firebase
  ingestLog(currentState?.activeLog || [], 0);

  // 2) Storico tracker (fullHistory da RTDB)
  const fullHistory = currentState?.fullHistory;
  const anchor = resolveAnchorDate(currentState);
  if (fullHistory && typeof fullHistory === 'object' && isValidIsoDate(anchor)) {
    for (let offset = 1; offset <= lookbackDays; offset += 1) {
      const dateStr = addDays(anchor, -offset);
      if (!isValidIsoDate(dateStr)) continue;
      let dayLog = [];
      try {
        dayLog = getLogFromStoricoTree(fullHistory, dateStr) || [];
      } catch {
        dayLog = [];
      }
      ingestLog(dayLog, offset);
    }
  }

  // 3) DB personale: usageCount / lastUsed (trackerFoodDatabase)
  const personalDb = currentState?.foodDatabase;
  if (personalDb && typeof personalDb === 'object' && !Array.isArray(personalDb)) {
    Object.entries(personalDb).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const foodName = toSafeString(entry.desc || entry.name);
      if (!foodName) return;
      const usageCount = Math.max(
        0,
        Number(entry.usageCount) || 0,
        Number(entry.usageStats?.morning) || 0,
        Number(entry.usageStats?.afternoon) || 0,
        Number(entry.usageStats?.evening) || 0,
        Number(entry.usageStats?.night) || 0,
      );
      const lastUsed = Number(entry.usageStats?.lastUsed) || 0;
      if (usageCount <= 0 && lastUsed <= 0) return;

      const defaultGrams = Math.round(
        Number(entry.defaultUnitWeight)
        || Number(entry?.defaultUnit?.grams)
        || 0,
      ) || null;

      upsert({
        foodName,
        foodDbKey: toSafeString(key) || null,
        grams: defaultGrams,
        usageBump: Math.max(1, usageCount),
        lastUsed,
        fromPersonalDb: true,
      });
    });
  }

  const userPortions = currentState?.userPortions && typeof currentState.userPortions === 'object'
    ? currentState.userPortions
    : {};

  const ranked = [...byKey.values()]
    .map((row) => {
      const portionKey = normalizePortionFoodKey(row.foodName);
      const fromPortions = portionKey && Number.isFinite(Number(userPortions[portionKey]))
        ? Math.round(Number(userPortions[portionKey]))
        : null;
      const fromSamples = modeOrMedian(row.gramsSamples);
      const typicalGrams = (fromPortions && fromPortions > 0)
        ? fromPortions
        : (fromSamples && fromSamples > 0 ? fromSamples : null);

      return {
        foodName: row.foodName,
        foodDbKey: row.foodDbKey,
        typicalGrams,
        usageCount: row.usageCount,
        lastUsed: row.lastUsed,
      };
    })
    .sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
      return a.foodName.localeCompare(b.foodName, 'it');
    })
    .slice(0, limit);

  return ranked;
}

/**
 * Ultima quantità usata per un alimento (foodDbKey o nome).
 * Ordine: ultima voce di diario → typicalGrams recenti → userPortions.
 *
 * @param {string} foodDbKeyOrName
 * @param {object} [currentState]
 * @returns {number|null} grammi > 0, oppure null
 */
export function getLastUsedQuantity(foodDbKeyOrName, currentState = {}) {
  const needle = toSafeString(foodDbKeyOrName);
  if (!needle) return null;

  const fromRecent = lookupRecentFoodPortionGrams({
    id: needle,
    name: needle,
  });
  if (fromRecent > 0) return fromRecent;
  const needleName = normalizePortionFoodKey(needle);
  const needleId = needle;

  let best = null;

  const consider = (item, dayIndex = 0) => {
    if (!isFoodLogEntry(item)) return;
    const dbKey = foodDbKeyFromEntry(item);
    const name = normalizePortionFoodKey(foodNameFromEntry(item));
    const idMatch = dbKey && (dbKey === needleId || dbKey === needle);
    const nameMatch = name && name === needleName;
    if (!idMatch && !nameMatch) return;
    const grams = gramsFromEntry(item);
    if (!grams) return;
    const lastUsed = Number(item?.timestamp ?? item?.lastUsedAt ?? item?.lastUsed)
      || (Date.now() - dayIndex * 86400000);
    if (!best || lastUsed >= best.lastUsed) {
      best = { grams, lastUsed };
    }
  };

  const activeLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
  for (let i = activeLog.length - 1; i >= 0; i -= 1) {
    consider(activeLog[i], 0);
  }

  const fullHistory = currentState?.fullHistory;
  const anchor = resolveAnchorDate(currentState);
  if (fullHistory && typeof fullHistory === 'object' && isValidIsoDate(anchor)) {
    for (let offset = 1; offset <= USER_RECENT_FOODS_LOOKBACK_DAYS; offset += 1) {
      const dateStr = addDays(anchor, -offset);
      if (!isValidIsoDate(dateStr)) continue;
      let dayLog = [];
      try {
        dayLog = getLogFromStoricoTree(fullHistory, dateStr) || [];
      } catch {
        dayLog = [];
      }
      for (let i = dayLog.length - 1; i >= 0; i -= 1) {
        consider(dayLog[i], offset);
      }
    }
  }

  if (best?.grams > 0) return best.grams;

  const recent = buildUserRecentFoods(currentState, { limit: 40 });
  const byId = recent.find((r) => r.foodDbKey && String(r.foodDbKey) === needleId);
  if (byId?.typicalGrams > 0) return Math.round(Number(byId.typicalGrams));
  const byName = recent.find((r) => normalizePortionFoodKey(r.foodName) === needleName);
  if (byName?.typicalGrams > 0) return Math.round(Number(byName.typicalGrams));

  const portions = currentState?.userPortions && typeof currentState.userPortions === 'object'
    ? currentState.userPortions
    : {};
  const fromPortions = Math.round(Number(portions[needleName]));
  if (Number.isFinite(fromPortions) && fromPortions > 0) return fromPortions;

  return null;
}
