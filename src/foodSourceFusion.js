import { searchFoodsDetailed } from './foodSearch.js';
import { searchUSDAFoods } from './usdaFoodApi.js';

const SOURCE_BOOST = { CREA: 20, USDA: 5 };

/**
 * @param {object} food — riga DB o oggetto con campi CREA-like
 * @param {'CREA'|'USDA'} source
 */
export function normalizeFood(food, source) {
  const idRaw = String(food?.id ?? '').trim();
  const id = source === 'USDA' && !idRaw.startsWith('USDA_')
    ? `USDA_${idRaw.replace(/^USDA_/i, '')}`
    : idRaw;

  const name = String(food?.name || food?.desc || '').trim();
  const kcal = Number(food?.kcal ?? food?.kcalPer100g);
  const protein = food?.protein ?? food?.prot;
  const carbs = food?.carbs ?? food?.carb;
  const fat = food?.fat;

  return {
    id,
    name,
    kcalPer100g: Number.isFinite(kcal) ? kcal : undefined,
    protein: protein != null ? Number(protein) : undefined,
    carbs: carbs != null ? Number(carbs) : undefined,
    fat: fat != null ? Number(fat) : undefined,
    source,
    gramsPerUnit: food?.gramsPerUnit != null ? Number(food.gramsPerUnit) : undefined,
    defaultUnit: food?.defaultUnit,
    row: food?.row || null,
  };
}

export function isSimilar(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

export function mergeResults(crea, usda) {
  const results = [];

  crea.forEach((f) => {
    results.push({ ...f, priority: 2 });
  });

  usda.forEach((f) => {
    const similar = crea.find((c) => isSimilar(c.name, f.name));
    if (!similar) {
      results.push({ ...f, priority: 1 });
    }
  });

  return results.sort((a, b) => b.priority - a.priority);
}

function finalScore(item) {
  const textMatch = Number(item.textScore ?? item.matchScore ?? 0) * 100;
  const recency = Number(item.recencyScore ?? 0) * 100;
  const frequency = Number(item.frequencyScore ?? 0) * 100;
  const sourceBoost = SOURCE_BOOST[item.source] ?? 0;
  return textMatch + recency + frequency + sourceBoost;
}

function fusionItemToUi(item) {
  const row = item.row || {
    id: item.id,
    desc: item.name,
    name: item.name,
    kcal: item.kcalPer100g,
    prot: item.protein,
    carb: item.carbs,
    fat: item.fat,
    gramsPerUnit: item.gramsPerUnit ?? 100,
    defaultUnit: item.defaultUnit || 'g',
    foodSource: item.source,
  };
  return {
    id: item.id,
    name: item.name,
    desc: row.desc || item.name,
    foodSource: item.source,
    sourceBadgeLabel: item.source === 'CREA' ? 'Consigliato' : 'Altro database',
    row,
  };
}

function buildCreaNormalizedFromDb(creaDb, query, options = {}) {
  const q = String(query || '').trim();
  const includeUserHistory = options.includeUserHistory !== false;
  const creaLimit = Number.isFinite(options.creaLimit) && options.creaLimit > 0
    ? Math.floor(options.creaLimit)
    : 50;

  const detailed = searchFoodsDetailed(creaDb, q, {
    includeUserHistory,
    limit: creaLimit,
    mode: 'search',
  });

  return detailed.map((hit) => {
    const row = creaDb?.[hit.id] || null;
    const food = row
      ? {
        id: hit.id,
        name: hit.name,
        desc: row.desc || hit.name,
        kcal: row.kcal,
        prot: row.prot,
        carb: row.carb,
        fat: row.fat,
        gramsPerUnit: row.gramsPerUnit,
        defaultUnit: row.defaultUnit,
        row,
      }
      : {
        id: hit.id,
        name: hit.name,
        desc: hit.name,
        row: { id: hit.id, desc: hit.name, name: hit.name },
      };
    const n = normalizeFood(food, 'CREA');
    return {
      ...n,
      source: 'CREA',
      textScore: hit.textScore,
      matchScore: hit.matchScore,
      recencyScore: hit.recencyScore,
      frequencyScore: hit.frequencyScore,
    };
  });
}

/**
 * Solo CREA (sync): per mostrare subito i risultati mentre USDA carica in lazy.
 * @returns {{ creaNormalized: object[], uiItems: object[] }}
 */
export function getCreaFusionPayload(creaDb, query, options = {}) {
  const creaNormalized = buildCreaNormalizedFromDb(creaDb, query, options);
  const sorted = [...creaNormalized].sort((a, b) => {
    const fa = finalScore(a);
    const fb = finalScore(b);
    if (fb !== fa) return fb - fa;
    return String(a.name).localeCompare(String(b.name), 'it');
  });
  return {
    creaNormalized,
    uiItems: sorted.map(fusionItemToUi),
  };
}

/**
 * Unisce USDA a un payload CREA già calcolato (nessuna seconda ricerca CREA).
 */
export async function fuseUsdaIntoCrea(creaNormalized, query, options = {}) {
  const minUsda = Number(options.minQueryLengthForUsda) >= 0
    ? Math.floor(options.minQueryLengthForUsda)
    : 2;
  const q = String(query || '').trim();
  if (!Array.isArray(creaNormalized) || creaNormalized.length === 0) {
    return [];
  }

  let usdaHits = [];
  if (q.length >= minUsda) {
    usdaHits = await searchUSDAFoods(q, {
      signal: options.signal,
      pageSize: options.usdaPageSize,
    });
  }

  const usdaNormalized = usdaHits.map((h) => {
    const n = normalizeFood({ ...h.row, id: h.id, name: h.name, row: h.row }, 'USDA');
    return {
      ...n,
      source: 'USDA',
      textScore: 0.35,
      matchScore: 0.35,
      recencyScore: 0,
      frequencyScore: 0,
    };
  });

  const merged = mergeResults(creaNormalized, usdaNormalized);

  merged.forEach((item) => {
    item.finalScore = finalScore(item);
  });

  merged.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (a.source !== b.source) return a.source === 'CREA' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'it');
  });

  // eslint-disable-next-line no-console
  console.log('[fusion]', { crea: creaNormalized.length, usda: usdaNormalized.length });

  return merged.map(fusionItemToUi);
}

/**
 * Carica CREA (sync) + USDA (async). USDA fallito → solo CREA.
 */
export async function fuseCreaUsdaSearch(creaDb, query, options = {}) {
  const { creaNormalized } = getCreaFusionPayload(creaDb, query, options);
  return fuseUsdaIntoCrea(creaNormalized, String(query || '').trim(), options);
}
