/**
 * USDA FoodData Central — ricerca locale su `kentu_master_db.json` (in memoria).
 * Mantiene la firma storica `searchUSDAFoods` per compatibilità con i call site legacy.
 */

import { searchFoodsDetailed } from './foodSearch.js';

const DEFAULT_PAGE_SIZE = 10;

function normalizeUsdaDb(usdaDb) {
  if (usdaDb == null) return null;
  if (typeof usdaDb === 'object' && !Array.isArray(usdaDb)) return usdaDb;
  return null;
}

function mapLocalHitToLegacyShape(hit, usdaDb) {
  const row = usdaDb?.[hit.id] || {
    id: hit.id,
    desc: hit.name,
    name: hit.name,
    foodSource: 'USDA',
  };

  return {
    id: hit.id,
    name: hit.name || row.desc || row.name,
    row,
  };
}

/**
 * Ricerca USDA locale (sincrona sotto il cofano, Promise risolta subito).
 *
 * @param {string} query
 * @param {{ usdaDb?: object, pageSize?: number, minQueryLength?: number }} [opts]
 * @returns {Promise<Array<{ id: string, name: string, row: object }>>}
 */
export function searchUSDAFoods(query, opts = {}) {
  const usdaDb = normalizeUsdaDb(opts.usdaDb);
  const q = String(query || '').trim();
  const minLen = Number.isFinite(opts.minQueryLength) ? opts.minQueryLength : 1;

  if (!usdaDb || !q || q.length < minLen) {
    return Promise.resolve([]);
  }

  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || DEFAULT_PAGE_SIZE));
  const hits = searchFoodsDetailed(usdaDb, q, {
    includeUserHistory: false,
    limit: pageSize,
    mode: 'search',
  });

  return Promise.resolve(hits.map((hit) => mapLocalHitToLegacyShape(hit, usdaDb)));
}

/** @deprecated Non più usata: la traduzione IT→EN serviva solo per l'API remota. */
export function normalizeQueryForUsda(raw) {
  return String(raw || '').trim();
}
