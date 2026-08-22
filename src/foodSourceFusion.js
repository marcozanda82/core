import { searchOpenFoodFactsApi } from './features/mealBuilder/utils/openFoodFactsSearchApi.js';
import { FOOD_DB_SOURCE } from './foodDbSource.js';

const MASTER_SOURCE = 'KENTU';
const OFF_SOURCE = 'OFF';
const OFF_SEARCH_LIMIT = 30;

function fusionItemToUi(item) {
  const row = item.row || {
    id: item.id,
    desc: item.name,
    name: item.name,
    foodSource: MASTER_SOURCE,
  };

  return {
    id: item.id,
    name: item.name,
    desc: row.desc || item.name,
    foodSource: MASTER_SOURCE,
    sourceBadgeLabel: 'Kentu DB',
    iconTag: row.iconTag ?? item.iconTag ?? null,
    brand: row.brand ?? item.brand ?? null,
    row,
    _source: item.source === OFF_SOURCE ? 'off' : undefined,
  };
}

function offFusionItemToUi(item) {
  const row = item.row || {
    id: item.id,
    desc: item.name,
    name: item.name,
    foodSource: OFF_SOURCE,
    _source: 'off',
  };
  const brand = String(row.brand || item.brand || '').trim() || null;

  return {
    id: item.id,
    name: item.name,
    desc: row.desc || item.name,
    foodSource: OFF_SOURCE,
    sourceBadgeLabel: 'Open Food Facts',
    iconTag: row.iconTag ?? item.iconTag ?? null,
    brand,
    row: { ...row, brand: brand || row.brand, _source: 'off', source: FOOD_DB_SOURCE.OFF },
    _source: 'off',
  };
}

/**
 * Ricerca sul database proprietario KentuOS — row passato intatto (micro, amminoacidi, ecc.).
 *
 * @returns {{ masterNormalized: object[], uiItems: object[] }}
 */
export function getMasterFusionPayload(masterDb, query, options = {}) {
  const q = String(query || '').trim();
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : Number.isFinite(options.masterLimit) && options.masterLimit > 0
      ? Math.floor(options.masterLimit)
      : Number.isFinite(options.creaLimit) && options.creaLimit > 0
        ? Math.floor(options.creaLimit)
        : 30;

  if (!q || masterDb == null || typeof masterDb !== 'object' || Array.isArray(masterDb)) {
    return { masterNormalized: [], uiItems: [] };
  }

  const detailed = searchFoodsDetailed(masterDb, q, {
    includeUserHistory: options.includeUserHistory !== false,
    limit,
    mode: 'search',
  });

  const masterNormalized = detailed.map((hit) => {
    const row = masterDb[hit.id] || null;
    const name = String(row?.desc ?? row?.name ?? hit.name ?? '').trim();

    return {
      id: hit.id,
      name,
      source: MASTER_SOURCE,
      row: row || { id: hit.id, desc: name, name, foodSource: MASTER_SOURCE },
      textScore: hit.textScore,
      matchScore: hit.matchScore,
      recencyScore: hit.recencyScore,
      frequencyScore: hit.frequencyScore,
    };
  });

  masterNormalized.sort((a, b) => {
    const scoreA = Number(a.textScore ?? a.matchScore ?? 0);
    const scoreB = Number(b.textScore ?? b.matchScore ?? 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a.name).localeCompare(String(b.name), 'it');
  });

  return {
    masterNormalized,
    uiItems: masterNormalized.map(fusionItemToUi),
  };
}

/**
 * Ricerca Open Food Facts via REST (prodotti confezionati) — `_source: 'off'`, brand.
 *
 * @returns {Promise<{ offNormalized: object[], uiItems: object[] }>}
 */
export async function getOffFusionPayload(_offDb, query, options = {}) {
  void _offDb;
  const q = String(query || '').trim();
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : Number.isFinite(options.offLimit) && options.offLimit > 0
      ? Math.floor(options.offLimit)
      : OFF_SEARCH_LIMIT;

  if (!q) {
    return { offNormalized: [], uiItems: [] };
  }

  const rows = await searchOpenFoodFactsApi(q, { limit });

  const offNormalized = rows.map((row) => {
    const name = String(row.desc ?? row.name ?? '').trim();
    const brand = String(row.brand || '').trim() || null;
    const id = String(row.id || row.barcode || name).trim();

    return {
      id,
      name,
      source: OFF_SOURCE,
      row: {
        ...row,
        id,
        desc: name,
        name,
        _source: 'off',
        source: FOOD_DB_SOURCE.OFF,
        brand,
      },
      textScore: 0.9,
      matchScore: 0.9,
      recencyScore: 0,
      frequencyScore: 0,
      iconTag: row.iconTag ?? null,
      brand,
      _source: 'off',
    };
  });

  return {
    offNormalized: offNormalized.slice(0, limit),
    uiItems: offNormalized.slice(0, limit).map(offFusionItemToUi),
  };
}

/** @deprecated Usare getMasterFusionPayload — mantiene compatibilità con call site legacy. */
export function getCreaFusionPayload(masterDb, query, options = {}) {
  const { masterNormalized, uiItems } = getMasterFusionPayload(masterDb, query, options);
  return { creaNormalized: masterNormalized, uiItems };
}

/** @deprecated Database USDA rimosso — ritorna sempre array vuoto. */
export function getUsdaFusionPayload() {
  return { usdaNormalized: [], uiItems: [] };
}

/** @deprecated Fusione CREA+USDA rimossa — ritorna solo i risultati master già normalizzati. */
export function fuseUsdaIntoCrea(masterNormalized, query, options = {}) {
  void query;
  void options;
  const pool = Array.isArray(masterNormalized) ? masterNormalized : [];
  return pool.map(fusionItemToUi);
}

/** @deprecated Usare getMasterFusionPayload. */
export function fuseCreaUsdaSearch(masterDb, query, options = {}) {
  return getMasterFusionPayload(masterDb, query, options).uiItems;
}

/** @deprecated Mantenuto per import legacy — preferire getMasterFusionPayload. */
export function normalizeFood(food, source = MASTER_SOURCE) {
  const id = String(food?.id ?? '').trim();
  const name = String(food?.name || food?.desc || '').trim();
  return {
    id,
    name,
    source,
    row: food?.row || food,
  };
}

/** @deprecated */
export function isSimilar(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/** @deprecated */
export function mergeResults(primary, secondary) {
  return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])];
}
