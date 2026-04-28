import { normalizeMealFoodItem, normalizeMealFoodsArray } from '../../../coreEngine';

/**
 * Match migliore sul database alimenti: esatto > bidirezionale (includes) con score da differenza di lunghezza.
 * @param {string} searchQuery
 * @param {Record<string, { desc?: string, name?: string }>} db
 * @returns {string|null} chiave dell'entry nel db o null
 */
export function findBestFoodMatch(searchQuery, db) {
  if (!searchQuery || !db) return null;
  const query = searchQuery.toLowerCase().trim();
  if (!query) return null;
  let bestMatchKey = null;
  let bestScore = -1;

  for (const key in db) {
    if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
    const item = db[key];
    const dbName = (item.desc || item.name || '').toLowerCase().trim();
    if (!dbName) continue;

    if (dbName === query) return key;

    if (dbName.includes(query) || query.includes(dbName)) {
      const lengthDiff = Math.abs(dbName.length - query.length);
      const score = 1000 - lengthDiff;

      if (score > bestScore) {
        bestScore = score;
        bestMatchKey = key;
      }
    }
  }
  return bestMatchKey;
}

/**
 * Abitudine / recency: match su foodDb + ultima grammatura usata nello storico (log più recenti per primi).
 * @param {string} query
 * @param {Record<string, object>} foodDb
 * @param {Array} flatLog — es. dailyLog (+ simulated) già normalizzato; ordine [più recente, …]
 */
export function findRecentFoodHabit(query, foodDb, flatLog) {
  if (!query || !foodDb) return null;
  const bestKey = findBestFoodMatch(query, foodDb);
  if (!bestKey) return null;
  const item = foodDb[bestKey];
  if (!item) return null;
  const logArr = Array.isArray(flatLog) ? flatLog : [];
  let lastQty = null;
  for (let i = 0; i < logArr.length; i++) {
    const e = logArr[i];
    if (e.type !== 'food' && e.type !== 'recipe') continue;
    const nm = e.desc || e.name;
    if (!nm || typeof nm !== 'string') continue;
    const k = findBestFoodMatch(nm.trim(), foodDb);
    if (k === bestKey) {
      const q = Number(e.qta ?? e.weight);
      if (Number.isFinite(q) && q > 0) {
        lastQty = Math.round(q);
        break;
      }
    }
  }
  const dq = Number(item.defaultQty);
  const defaultQty =
    lastQty != null ? lastQty : Number.isFinite(dq) && dq > 0 ? Math.round(dq) : 150;
  return {
    dbKey: bestKey,
    name: item.desc || item.name || query,
    qty: defaultQty,
  };
}

/** Da stringhe tipo "200g Riso" → oggetti { name, qty } per stato `meals.foods`. */
export function draftStringsToFoods(strings) {
  if (!Array.isArray(strings)) return [];
  return strings
    .map((s) => {
      const raw = String(s || '').trim();
      if (!raw) return null;
      const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*g\s+(.+)$/i);
      if (m) {
        const qty = Math.round(Number(String(m[1]).replace(',', '.')) || 100);
        const name = String(m[2]).trim();
        return name ? { name, qty: qty > 0 ? qty : 100 } : null;
      }
      return { name: raw, qty: 100 };
    })
    .filter(Boolean)
    .slice(0, 14);
}

/** Righe alimento per modal ghost: prima `foods` normalizzati, poi oggetti in draft, poi stringhe. */
export function ghostMealModalFoodRows(report) {
  let rows = normalizeMealFoodsArray(report?.foods);
  if (rows.length > 0) return rows;
  const draft = Array.isArray(report?.draftFoods) ? report.draftFoods : [];
  const objs = draft.filter((x) => x && typeof x === 'object' && (x.name || x.desc));
  if (objs.length > 0) rows = normalizeMealFoodsArray(objs);
  else {
    const strs = draft
      .filter((x) => typeof x === 'string')
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (strs.length > 0) rows = normalizeMealFoodsArray(draftStringsToFoods(strs));
  }
  return rows;
}

/**
 * Risposta AI piano pasto: preferisce `items` strutturati; fallback `draftFoods` (stringhe).
 * @returns {{ foods: object[], draftFoods: string[] }}
 */
export function parsePlanMealDraftAiResponse(raw) {
  const s = String(raw || '').trim();
  let jsonStr = s;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(e?.message ? String(e.message) : 'JSON non valido');
  }
  if (Array.isArray(obj?.items) && obj.items.length > 0) {
    const foods = normalizeMealFoodsArray(obj.items).slice(0, 14);
    const draftFoods = foods.map((f) => `${f.qty}g ${f.name}`);
    return { foods, draftFoods };
  }
  const arr = obj?.draftFoods;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('draftFoods vuoto o non valido');
  const draftFoods = arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 14);
  const foods = normalizeMealFoodsArray(draftStringsToFoods(draftFoods));
  return { foods, draftFoods };
}

/** Da voci canoniche `meal.foods` (o legacy) → items per `mapProposalItemsToDiaryFoods` (est* + matchedKey). */
export function structuredFoodsToProposalItems(foods) {
  if (!Array.isArray(foods)) return [];
  return foods
    .map((f) => {
      const canon = normalizeMealFoodItem(f);
      if (!canon) return null;
      const o = {
        name: canon.name,
        qty: canon.qty,
        estKcal: canon.kcal,
        estPro: canon.prot,
        estCar: canon.carb,
        estFat: canon.fat,
      };
      if (canon.dbKey) o.dbKey = canon.dbKey;
      if (f && typeof f === 'object' && f.matchedKey != null && String(f.matchedKey).trim() !== '') {
        o.matchedKey = String(f.matchedKey).trim();
      }
      return o;
    })
    .filter(Boolean);
}

/**
 * `draftFoods` UI (stringhe "200g X" o oggetti pill) → proposal items per espansione in righe diario.
 */
export function ghostSurfaceDraftToProposalItems(draftFoods) {
  if (!Array.isArray(draftFoods)) return [];
  return draftFoods
    .map((x) => {
      if (x == null) return null;
      if (typeof x === 'object') {
        return structuredFoodsToProposalItems([x])[0] ?? null;
      }
      const s = String(x).trim();
      if (!s) return null;
      const m = s.match(/^(\d+(?:[.,]\d+)?)\s*g\s+(.+)$/i);
      if (m) {
        const qty = Math.max(1, Math.round(Number(String(m[1]).replace(',', '.')) || 100));
        const name = String(m[2]).trim();
        return name ? { name, qty } : null;
      }
      return { name: s, qty: 100 };
    })
    .filter(Boolean);
}
