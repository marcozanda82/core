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
 * morning: 06–12 · afternoon: 12–17 · evening: 17–22 · night: 22–06
 */
export function getCurrentTimeSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
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

/**
 * Tile Vetrina da voci del DB personale (esclusi ricette), per ranking predittivo.
 */
export function buildPersonalDbSuggestTiles(personalDb) {
  if (!personalDb || typeof personalDb !== 'object') return [];

  return Object.entries(personalDb)
    .filter(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return false;
      if (entry.isRecipe || entry.type === 'recipe') return false;
      if (Array.isArray(entry.ingredients) && entry.ingredients.length > 0) return false;
      const desc = String(entry.desc || entry.name || '').trim();
      return Boolean(desc) && Boolean(key);
    })
    .map(([key, entry]) => {
      const desc = String(entry.desc || entry.name).trim();
      const defaultWeight = Math.max(1, Number(entry.defaultUnitWeight) || 100);
      const kcalPer100 = Number(entry.kcal ?? entry.cal) || 0;
      const ratio = defaultWeight / 100;

      return {
        key: `db:${key}`,
        foodDbKey: key,
        desc,
        type: 'food',
        qta: defaultWeight,
        weight: defaultWeight,
        kcal: Math.round(kcalPer100 * ratio),
        cal: Math.round(kcalPer100 * ratio),
        prot: Math.round((Number(entry.prot) || 0) * ratio * 10) / 10,
        carb: Math.round((Number(entry.carb) || 0) * ratio * 10) / 10,
        fat: Math.round((Number(entry.fatTotal ?? entry.fat) || 0) * ratio * 10) / 10,
        fatTotal: Math.round((Number(entry.fatTotal ?? entry.fat) || 0) * ratio * 10) / 10,
        label: desc,
        row: entry,
        lastUsed: Number(entry.usageStats?.lastUsed) || 0,
        timestamp: Number(entry.usageStats?.lastUsed) || 0,
      };
    });
}

export function mergePredictiveWithPersonalDb(predictiveBlocks, personalDb, timeSlot, limit = 30) {
  const personalTiles = buildPersonalDbSuggestTiles(personalDb);
  const seen = new Set();

  predictiveBlocks.forEach((block) => {
    const id = String(block.foodDbKey || block.key || '').trim();
    if (id) seen.add(id);
  });

  const merged = [...predictiveBlocks];
  personalTiles.forEach((tile) => {
    const id = String(tile.foodDbKey || tile.key || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(tile);
  });

  return sortFoodsByTimeSlotUsage(merged, personalDb, timeSlot).slice(0, limit);
}
