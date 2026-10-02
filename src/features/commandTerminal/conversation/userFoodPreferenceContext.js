/**
 * Contesto personale READ-ONLY per l'inserimento assistito.
 * Alias esplicito > pattern d'uso dominante > recency da sola (mai sufficiente).
 * Nessun ML, nessuna scrittura.
 */

export const PERSONAL_AUTO_MIN_USAGE = 3;
export const PERSONAL_AUTO_USAGE_RATIO = 2;
export const PERSONAL_AUTO_USAGE_GAP = 2;

function normalizeFoodKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function usageOf(row) {
  const n = Number(row?.usageCount ?? row?.count);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function nameOf(row) {
  return String(row?.name || row?.desc || row?.foodName || '').trim();
}

function recencyOf(row) {
  const n = Number(row?.lastUsedAt ?? row?.updatedAt ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function queryMatchesFood(query, food) {
  const q = normalizeFoodKey(query);
  const n = normalizeFoodKey(nameOf(food));
  if (!q || !n) return false;
  if (n === q) return true;
  if (n.includes(q) || q.includes(n)) return true;
  const qTokens = q.split(' ').filter((t) => t.length > 2);
  if (qTokens.length === 0) return n.includes(q);
  return qTokens.every((t) => n.includes(t));
}

export function modeOrLastGrams(samples, fallbackLast = null) {
  const nums = (Array.isArray(samples) ? samples : [])
    .map((v) => Math.round(Number(v)))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 5000);
  if (nums.length === 0) {
    const last = Math.round(Number(fallbackLast) || 0);
    return last > 0 ? last : null;
  }
  const recent = nums.slice(-8);
  const freq = new Map();
  recent.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
  let best = null;
  let bestCount = 0;
  freq.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && (best == null || value < best))) {
      best = value;
      bestCount = count;
    }
  });
  if (bestCount >= 2) return best;
  return recent[recent.length - 1];
}

/**
 * @param {object} foodDb
 * @returns {Array<{ foodDbKey: string, name: string, usageCount: number, lastGrams: number|null, gramsSamples?: number[] }>}
 */
export function summarizePersonalFoodsFromDb(foodDb) {
  if (!foodDb || typeof foodDb !== 'object') return [];
  const out = [];
  Object.keys(foodDb).forEach((key) => {
    const row = foodDb[key];
    if (!row || typeof row !== 'object') return;
    const usage = usageOf(row);
    if (usage <= 0) return;
    const lastGrams = Math.round(Number(row.lastQty ?? row.lastGrams ?? row.defaultQty) || 0);
    out.push({
      foodDbKey: String(key),
      name: nameOf(row) || String(key),
      usageCount: usage,
      lastUsedAt: recencyOf(row),
      lastGrams: lastGrams > 0 ? lastGrams : null,
      gramsSamples: Array.isArray(row.gramsSamples) ? row.gramsSamples : undefined,
    });
  });
  out.sort((a, b) => b.usageCount - a.usageCount || recencyOf(b) - recencyOf(a));
  return out.slice(0, 80);
}

function lookupAliasKey(query, aliases) {
  if (!aliases || typeof aliases !== 'object') return null;
  const q = normalizeFoodKey(query);
  if (!q) return null;
  const direct = aliases[q] || aliases[query];
  if (direct && String(direct).trim()) return String(direct).trim();
  const hit = Object.keys(aliases).find((k) => normalizeFoodKey(k) === q);
  return hit ? String(aliases[hit]).trim() : null;
}

/**
 * @param {string} query
 * @param {{
 *   personalFoods?: object[],
 *   personalDb?: object,
 *   userFoodAliases?: Record<string, string>,
 *   userPortions?: Record<string, number>,
 * }} [memory]
 */
export function getUserFoodPreferenceContext(query, memory = {}) {
  const q = String(query || '').trim();
  const empty = {
    query: q,
    decision: 'none',
    foodDbKey: null,
    displayName: null,
    usageCount: 0,
    habitualGrams: null,
    quantitySourceHint: null,
    alias: false,
    candidates: [],
  };
  if (!q) return empty;

  const personalFoods = Array.isArray(memory.personalFoods) && memory.personalFoods.length > 0
    ? memory.personalFoods
    : summarizePersonalFoodsFromDb(memory.personalDb);
  const aliases = memory.userFoodAliases && typeof memory.userFoodAliases === 'object'
    ? memory.userFoodAliases
    : {};
  const portions = memory.userPortions && typeof memory.userPortions === 'object'
    ? memory.userPortions
    : {};

  const aliasKey = lookupAliasKey(q, aliases);
  const matches = personalFoods.filter((food) => queryMatchesFood(q, food));

  const gramsFor = (food) => {
    const fromSamples = modeOrLastGrams(food?.gramsSamples, food?.lastGrams);
    if (fromSamples) return fromSamples;
    const byKey = Math.round(Number(portions[food?.foodDbKey]) || 0);
    if (byKey > 0) return byKey;
    const byName = Math.round(Number(portions[normalizeFoodKey(nameOf(food) || q)]) || 0);
    if (byName > 0) return byName;
    const byQuery = Math.round(Number(portions[normalizeFoodKey(q)] || portions[q]) || 0);
    return byQuery > 0 ? byQuery : null;
  };

  if (aliasKey) {
    const aliased = matches.find((f) => String(f.foodDbKey) === aliasKey)
      || personalFoods.find((f) => String(f.foodDbKey) === aliasKey)
      || { foodDbKey: aliasKey, name: q, usageCount: 0 };
    const habitualGrams = gramsFor(aliased) || gramsFor({ foodDbKey: aliasKey, name: q });
    return {
      query: q,
      decision: 'auto',
      foodDbKey: aliasKey,
      displayName: nameOf(aliased) || q,
      usageCount: usageOf(aliased),
      habitualGrams,
      quantitySourceHint: habitualGrams ? 'user-history' : null,
      alias: true,
      candidates: [aliased],
    };
  }

  const ranked = [...matches].sort(
    (a, b) => usageOf(b) - usageOf(a) || recencyOf(b) - recencyOf(a),
  );
  const best = ranked[0] || null;
  const second = ranked[1] || null;

  if (!best) {
    const portionOnly = Math.round(Number(portions[normalizeFoodKey(q)] || portions[q]) || 0);
    return {
      ...empty,
      habitualGrams: portionOnly > 0 ? portionOnly : null,
      quantitySourceHint: portionOnly > 0 ? 'user-history' : null,
    };
  }

  const bestUsage = usageOf(best);
  const secondUsage = second ? usageOf(second) : 0;
  const dominant = bestUsage >= PERSONAL_AUTO_MIN_USAGE
    && (
      !second
      || (
        bestUsage >= secondUsage * PERSONAL_AUTO_USAGE_RATIO
        && bestUsage - secondUsage >= PERSONAL_AUTO_USAGE_GAP
      )
    );

  if (second && !dominant && secondUsage > 0 && bestUsage < secondUsage * PERSONAL_AUTO_USAGE_RATIO) {
    return {
      query: q,
      decision: 'ambiguous',
      foodDbKey: null,
      displayName: null,
      usageCount: bestUsage,
      habitualGrams: null,
      quantitySourceHint: null,
      alias: false,
      candidates: ranked.slice(0, 4),
    };
  }

  if (!dominant) {
    return {
      query: q,
      decision: 'none',
      foodDbKey: null,
      displayName: null,
      usageCount: bestUsage,
      habitualGrams: gramsFor(best) || Math.round(Number(portions[normalizeFoodKey(q)]) || 0) || null,
      quantitySourceHint: null,
      alias: false,
      candidates: ranked.slice(0, 4),
    };
  }

  const habitualGrams = gramsFor(best);
  return {
    query: q,
    decision: 'auto',
    foodDbKey: String(best.foodDbKey),
    displayName: nameOf(best) || q,
    usageCount: bestUsage,
    habitualGrams,
    quantitySourceHint: habitualGrams ? 'user-history' : null,
    alias: false,
    candidates: ranked.slice(0, 4),
  };
}

export function buildAssistedMemoryFromState(currentState = {}) {
  const personalDb = currentState.personalDb
    || currentState.foodDb
    || currentState.nutrition?.foodDb
    || null;
  return {
    userPortions: currentState.userPortions || currentState.nutrition?.userPortions || null,
    userFoodAliases: currentState.userFoodAliases || currentState.nutrition?.userFoodAliases || null,
    personalDb,
    personalFoods: Array.isArray(currentState.personalFoods)
      ? currentState.personalFoods
      : summarizePersonalFoodsFromDb(personalDb),
    habitualMeals: currentState.habitualMeals || null,
  };
}
