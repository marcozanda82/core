import { searchFoodsDetailed } from './foodSearch.js';

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
  const iconTag = food?.iconTag ?? food?.row?.iconTag ?? null;

  return {
    id,
    name,
    kcalPer100g: Number.isFinite(kcal) ? kcal : undefined,
    protein: protein != null ? Number(protein) : undefined,
    carbs: carbs != null ? Number(carbs) : undefined,
    fat: fat != null ? Number(fat) : undefined,
    source,
    iconTag,
    gramsPerUnit: food?.gramsPerUnit != null ? Number(food.gramsPerUnit) : undefined,
    defaultUnit: food?.defaultUnit,
    row: food?.row
      ? { ...food.row, ...(iconTag ? { iconTag } : {}) }
      : null,
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
  const iconTag = item.iconTag ?? item.row?.iconTag ?? null;
  const row = item.row
    ? { ...item.row, ...(iconTag ? { iconTag } : {}) }
    : {
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
      ...(iconTag ? { iconTag } : {}),
    };
  return {
    id: item.id,
    name: item.name,
    desc: row.desc || item.name,
    foodSource: item.source,
    sourceBadgeLabel: item.source === 'CREA' ? 'Consigliato' : 'Altro database',
    iconTag,
    row,
  };
}

function buildNormalizedFromDb(db, query, source, options = {}) {
  const q = String(query || '').trim();
  const includeUserHistory = options.includeUserHistory !== false;
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : 50;

  const detailed = searchFoodsDetailed(db, q, {
    includeUserHistory,
    limit,
    mode: 'search',
  });

  return detailed.map((hit) => {
    const row = db?.[hit.id] || null;
    const food = row
      ? {
        id: hit.id,
        name: hit.name,
        desc: row.desc || hit.name,
        kcal: row.kcal,
        prot: row.prot,
        carb: row.carb,
        fat: row.fat ?? row.fatTotal ?? row.fatTot,
        iconTag: row.iconTag || null,
        gramsPerUnit: row.gramsPerUnit,
        defaultUnit: row.defaultUnit,
        row,
      }
      : {
        id: hit.id,
        name: hit.name,
        desc: hit.name,
        row: { id: hit.id, desc: hit.name, name: hit.name, foodSource: source },
      };
    const n = normalizeFood(food, source);
    return {
      ...n,
      source,
      iconTag: row?.iconTag || n.iconTag || null,
      textScore: hit.textScore,
      matchScore: hit.matchScore,
      recencyScore: hit.recencyScore,
      frequencyScore: hit.frequencyScore,
    };
  });
}

function buildCreaNormalizedFromDb(creaDb, query, options = {}) {
  const creaLimit = Number.isFinite(options.creaLimit) && options.creaLimit > 0
    ? Math.floor(options.creaLimit)
    : 30;

  return buildNormalizedFromDb(creaDb, query, 'CREA', {
    includeUserHistory: options.includeUserHistory !== false,
    limit: creaLimit,
  });
}

function buildUsdaNormalizedFromDb(usdaDb, query, options = {}) {
  const usdaLimit = Number.isFinite(options.usdaLimit) && options.usdaLimit > 0
    ? Math.floor(options.usdaLimit)
    : Number.isFinite(options.usdaPageSize) && options.usdaPageSize > 0
      ? Math.floor(options.usdaPageSize)
      : 30;

  return buildNormalizedFromDb(usdaDb, query, 'USDA', {
    includeUserHistory: false,
    limit: usdaLimit,
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
  if (import.meta.env?.DEV) {
    const q = String(query || '').trim();
    const creaKeys =
      creaDb != null && typeof creaDb === 'object' && !Array.isArray(creaDb)
        ? Object.keys(creaDb).length
        : 0;
    // eslint-disable-next-line no-console
    console.log('[foodSourceFusion:DEV:getCreaFusionPayload]', {
      query: q,
      csvFoodDbKeyCount: creaKeys,
      creaHits: creaNormalized.length,
    });
  }
  return {
    creaNormalized,
    uiItems: sorted.map(fusionItemToUi),
  };
}

/**
 * Solo USDA (sync): catalogo locale `kentu_master_db.json`.
 * @returns {{ usdaNormalized: object[], uiItems: object[] }}
 */
export function getUsdaFusionPayload(usdaDb, query, options = {}) {
  const usdaNormalized = buildUsdaNormalizedFromDb(usdaDb, query, options);
  const sorted = [...usdaNormalized].sort((a, b) => {
    const fa = finalScore(a);
    const fb = finalScore(b);
    if (fb !== fa) return fb - fa;
    return String(a.name).localeCompare(String(b.name), 'it');
  });

  return {
    usdaNormalized,
    uiItems: sorted.map(fusionItemToUi),
  };
}

/**
 * Unisce USDA locale a un payload CREA già calcolato.
 */
export function fuseUsdaIntoCrea(creaNormalized, query, options = {}) {
  const q = String(query || '').trim();
  if (!Array.isArray(creaNormalized)) creaNormalized = [];

  let usdaNormalized = [];
  const usdaDb = options.usdaDb;
  if (
    usdaDb != null
    && typeof usdaDb === 'object'
    && !Array.isArray(usdaDb)
    && Object.keys(usdaDb).length > 0
    && q.length > 0
  ) {
    usdaNormalized = getUsdaFusionPayload(usdaDb, q, options).usdaNormalized;
  }

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

  if (import.meta.env?.DEV) {
    const top10 = merged.slice(0, 10).map((it) => ({
      source: it.source,
      name: it.name,
      score: Math.round((it.finalScore ?? finalScore(it)) * 1000) / 1000,
    }));
    // eslint-disable-next-line no-console
    console.log('[foodSourceFusion:DEV:fuseUsdaIntoCrea]', {
      query: q,
      poolCreaCount: creaNormalized.length,
      poolUsdaCount: usdaNormalized.length,
      mergedCount: merged.length,
      top10,
    });
  }

  return merged.map(fusionItemToUi);
}

/**
 * Carica CREA + USDA locali (sync).
 */
export function fuseCreaUsdaSearch(creaDb, query, options = {}) {
  const { creaNormalized } = getCreaFusionPayload(creaDb, query, options);
  return fuseUsdaIntoCrea(creaNormalized, String(query || '').trim(), options);
}
