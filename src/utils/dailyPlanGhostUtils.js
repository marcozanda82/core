export function normalizeDailyPlanConflictTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function collectRealMealTitlesFromLog(srcLog) {
  const realTitles = new Set();
  (srcLog || []).forEach((n) => {
    if (!n || n.isGhost === true || n.type === 'ghost_meal' || n.type === 'ghost_workout') return;
    [n.desc, n.title, n.name].forEach((piece) => {
      const norm = normalizeDailyPlanConflictTitle(piece);
      if (norm.length >= 2) realTitles.add(norm);
    });
  });
  return realTitles;
}

export function logTimeKeyForDiaryEntry(entry) {
  if (!entry) return 0;
  if (entry.type === 'ghost_meal' || entry.type === 'food' || entry.type === 'recipe') {
    return Number(entry.mealTime) || 0;
  }
  return Number(entry.time ?? entry.mealTime) || 0;
}

/**
 * Filtra e mappa ghost meals dal daily plan in voci log.
 * @param {Array<object>} ghostList
 * @param {object} options
 */
export function buildDailyPlanGhostLogEntries(ghostList, options = {}) {
  const {
    batchTs,
    srcLog = [],
    nowDec,
    realMealsSet,
    realTitles,
    toCanonicalMealType,
    parseFlexibleTimeToDecimal,
    normalizeMealFoodsArray,
    mealFoodsRead,
    draftStringsToFoods,
    ghostMealLogEntryIdFromPayload,
  } = options;

  const list = Array.isArray(ghostList) ? ghostList : [];
  const titles = realTitles instanceof Set ? realTitles : collectRealMealTitlesFromLog(srcLog);
  const mealsSet = realMealsSet instanceof Set ? realMealsSet : new Set();

  return list
    .filter((gm) => {
      const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
      if (mealsSet.has(mt)) return false;
      const gTitle = normalizeDailyPlanConflictTitle(gm.title);
      if (gTitle && titles.has(gTitle)) return false;
      void nowDec;
      return true;
    })
    .map((gm, i) => {
      const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
      const timeStr = gm.time != null ? String(gm.time) : '12:00';
      const dec = parseFlexibleTimeToDecimal(timeStr);
      const mealTime = dec != null && !Number.isNaN(dec) ? dec : 12;
      const persistedDraftFoods = gm.draftFoods || [];
      const draftFoods = Array.isArray(persistedDraftFoods)
        ? persistedDraftFoods.map((x) => String(x).trim()).filter(Boolean)
        : [];
      let foodsArr = normalizeMealFoodsArray(mealFoodsRead(gm));
      if (foodsArr.length === 0 && draftFoods.length > 0) {
        foodsArr = normalizeMealFoodsArray(draftStringsToFoods(draftFoods));
      }
      return {
        id: ghostMealLogEntryIdFromPayload(gm, i, batchTs),
        type: 'ghost_meal',
        mealType: mt,
        mealTime,
        title: String(gm.title || 'Pasto pianificato').trim(),
        microDesc: String(gm.microDesc || '').trim(),
        draftFoods,
        foods: foodsArr,
        isGhost: true,
      };
    });
}

export function dedupeDailyPlanGhostEntriesById(entries) {
  const seen = new Set();
  return (entries || []).filter((e) => {
    if (!e?.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export function mergeDiaryLogWithGhostEntries(baseLog, ghostEntries) {
  return [...(baseLog || []), ...(ghostEntries || [])].sort(
    (a, b) => logTimeKeyForDiaryEntry(a) - logTimeKeyForDiaryEntry(b),
  );
}
