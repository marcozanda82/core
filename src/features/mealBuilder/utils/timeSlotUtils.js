export const TIME_SLOTS = ['morning', 'afternoon', 'evening', 'night'];

export const DEFAULT_USAGE_STATS = {
  morning: 0,
  afternoon: 0,
  evening: 0,
  night: 0,
  lastUsed: 0,
};

/**
 * Fascia oraria corrente per raccomandazioni e usage stats.
 * morning: 05–11 · afternoon: 12–17 · evening: 18–22 · night: 23–04
 */
export function getCurrentTimeSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

export function normalizeUsageStats(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_USAGE_STATS };
  }
  return {
    morning: Math.max(0, Number(raw.morning) || 0),
    afternoon: Math.max(0, Number(raw.afternoon) || 0),
    evening: Math.max(0, Number(raw.evening) || 0),
    night: Math.max(0, Number(raw.night) || 0),
    lastUsed: Math.max(0, Number(raw.lastUsed) || 0),
  };
}

export function buildUsageStatsIncrementPatch(existingEntry, timeSlot = getCurrentTimeSlot()) {
  const current = normalizeUsageStats(existingEntry?.usageStats);
  const safeSlot = TIME_SLOTS.includes(timeSlot) ? timeSlot : getCurrentTimeSlot();

  return {
    usageStats: {
      ...current,
      [safeSlot]: current[safeSlot] + 1,
      lastUsed: Date.now(),
    },
  };
}

export function resolveUsageStatsForFood(foodDbKey, personalDb, fallbackEntry = null) {
  const entry = (foodDbKey && personalDb?.[foodDbKey]) || fallbackEntry;
  return normalizeUsageStats(entry?.usageStats);
}

export function resolveUsageStatsForTile(tile, personalDb) {
  const dbKey = tile?.foodDbKey;
  if (dbKey && personalDb?.[dbKey]) {
    return normalizeUsageStats(personalDb[dbKey].usageStats);
  }
  return normalizeUsageStats(tile?.usageStats);
}

/**
 * Ordina alimenti per punteggio nella fascia oraria, poi per lastUsed.
 */
export function sortFoodsByTimeSlotUsage(foods, personalDb, timeSlot) {
  const safeSlot = TIME_SLOTS.includes(timeSlot) ? timeSlot : getCurrentTimeSlot();

  return [...foods].sort((a, b) => {
    const statsA = resolveUsageStatsForTile(a, personalDb);
    const statsB = resolveUsageStatsForTile(b, personalDb);
    const scoreA = statsA[safeSlot] || 0;
    const scoreB = statsB[safeSlot] || 0;

    if (scoreB !== scoreA) return scoreB - scoreA;

    const lastA = statsA.lastUsed || Number(a?.lastUsed || a?.timestamp) || 0;
    const lastB = statsB.lastUsed || Number(b?.lastUsed || b?.timestamp) || 0;
    if (lastB !== lastA) return lastB - lastA;

    return String(a?.desc || a?.label || '').localeCompare(
      String(b?.desc || b?.label || ''),
      'it',
    );
  });
}

export function recordFoodUsageStats(foodDbKey, personalDb, onPatchFoodDbEntry, timeSlot) {
  if (!foodDbKey || typeof onPatchFoodDbEntry !== 'function') return;
  const entry = personalDb?.[foodDbKey];
  if (!entry) return;

  const patch = buildUsageStatsIncrementPatch(entry, timeSlot);
  void onPatchFoodDbEntry(foodDbKey, patch).catch(() => {
    /* persistenza silenziosa */
  });
}

export function recordDraftFoodsUsageStats(draftFoods, personalDb, onPatchFoodDbEntry, timeSlot) {
  if (!Array.isArray(draftFoods) || typeof onPatchFoodDbEntry !== 'function') return;

  const seen = new Set();
  draftFoods.forEach((item) => {
    const key = item?.foodDbKey;
    if (!key || seen.has(key)) return;
    seen.add(key);
    recordFoodUsageStats(key, personalDb, onPatchFoodDbEntry, timeSlot);
  });
}

export function withDefaultUsageStats(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    usageStats: normalizeUsageStats(entry.usageStats),
  };
}
