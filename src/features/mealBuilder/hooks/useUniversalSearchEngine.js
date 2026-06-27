import { useMemo, useState } from 'react';



import { FOOD_DB_SOURCE, FOOD_PROVENANCE, compareProvenancePriority } from '../../../foodDbSource';

import { searchFoodsDetailed } from '../../../foodSearch';



const PERSONAL_SEARCH_LIMIT = 30;

const KENTU_IT_SEARCH_LIMIT = 30;

const GLOBAL_SEARCH_LIMIT = 30;



function normalizeSearchText(value) {

  return String(value || '')

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .toLowerCase()

    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')

    .replace(/\s+/g, ' ')

    .trim();

}



function normalizePersonalDb(personalDb) {

  if (personalDb == null) return {};

  if (Array.isArray(personalDb)) {

    const map = {};

    personalDb.forEach((item, index) => {

      if (!item || typeof item !== 'object') return;

      const key = String(item.foodDbKey ?? item.id ?? item.key ?? `personal_${index}`).trim();

      if (!key) return;

      map[key] = item;

    });

    return map;

  }

  if (typeof personalDb === 'object') return personalDb;

  return {};

}



function normalizeCatalogDb(db) {

  if (db == null) return null;

  if (typeof db === 'object' && !Array.isArray(db)) return db;

  return null;

}



function isRecipeRow(row) {

  return row?.isRecipe === true || row?.type === 'recipe';

}



function buildUnifiedResult({

  id,

  desc,

  row,

  source,

  legacySource,

  matchScore,

  matchType,

  textScore,

  recencyScore,

}) {

  const name = String(desc || row?.desc || row?.name || id || '').trim();

  const dbSource = source === FOOD_DB_SOURCE.GLOBAL ? FOOD_DB_SOURCE.GLOBAL : FOOD_DB_SOURCE.KENTU_IT;



  return {

    id: String(id),

    key: String(id),

    desc: name,

    name,

    barcode: row?.barcode != null ? String(row.barcode).trim() : undefined,

    row: row ? { ...row, source: row.source || dbSource } : { id, desc: name, name, source: dbSource },

    _source: legacySource,

    source: dbSource,

    provenance: legacySource === 'master'
      ? FOOD_PROVENANCE.GLOBAL
      : legacySource === 'kentu_it'
        ? FOOD_PROVENANCE.ITALY
        : FOOD_PROVENANCE.PERSONAL,

    matchScore,

    matchType,

    textScore,

    recencyScore,

  };

}



function isDuplicateOfExisting(externalItem, existingResults) {

  const extName = normalizeSearchText(externalItem.name || externalItem.desc);

  const extBarcode = String(

    externalItem.barcode ?? externalItem.row?.barcode ?? '',

  ).replace(/\D/g, '');



  for (const existingItem of existingResults) {

    const existingName = normalizeSearchText(existingItem.desc || existingItem.name);

    const existingBarcode = String(

      existingItem.barcode ?? existingItem.row?.barcode ?? '',

    ).replace(/\D/g, '');



    if (extBarcode && existingBarcode && extBarcode === existingBarcode) {

      return true;

    }



    if (extName && existingName && extName === existingName) {

      return true;

    }

  }



  return false;

}



function mapCatalogHitToResult(hit, row, legacySource, dbSource) {

  const name = String(row?.desc ?? row?.name ?? hit.name ?? '').trim();

  return buildUnifiedResult({

    id: hit.id,

    desc: name,

    row,

    source: dbSource,

    legacySource,

    matchScore: hit.textScore ?? hit.matchScore,

    matchType: 'text',

    textScore: hit.textScore,

    recencyScore: hit.recencyScore,

  });

}



function searchCatalogDb(query, catalogDb, existingResults, options = {}) {

  const safeDb = normalizeCatalogDb(catalogDb);

  const q = String(query || '').trim();

  if (!q || !safeDb || Object.keys(safeDb).length === 0) return [];



  const {

    limit = KENTU_IT_SEARCH_LIMIT,

    legacySource = 'kentu_it',

    dbSource = FOOD_DB_SOURCE.KENTU_IT,

  } = options;



  const detailed = searchFoodsDetailed(safeDb, q, {

    includeUserHistory: dbSource === FOOD_DB_SOURCE.KENTU_IT,

    limit,

    mode: 'search',

  });



  const results = [];



  detailed.forEach((hit) => {

    const row = safeDb[hit.id];

    if (!row) return;



    const mapped = mapCatalogHitToResult(hit, row, legacySource, dbSource);

    if (!isDuplicateOfExisting(mapped, existingResults)) {

      results.push(mapped);

    }

  });



  return results.sort(compareProvenancePriority);

}



/**

 * Tier 1 — ricerca sincrona sul database personale Firebase (Kentu DB IT).

 */

export function searchPersonalDb(personalDb, query) {

  const db = normalizePersonalDb(personalDb);

  const q = String(query || '').trim();

  if (!q || Object.keys(db).length === 0) return [];



  const results = [];

  const seenIds = new Set();

  const qDigits = q.replace(/\D/g, '');



  if (qDigits.length >= 8) {

    Object.entries(db).forEach(([id, row]) => {

      if (!row || typeof row !== 'object' || isRecipeRow(row)) return;

      const barcode = String(row.barcode ?? '').replace(/\D/g, '');

      if (!barcode || barcode !== qDigits) return;

      seenIds.add(id);

      results.push(

        buildUnifiedResult({

          id,

          desc: row.desc ?? row.name,

          row,

          source: FOOD_DB_SOURCE.KENTU_IT,

          legacySource: 'personal',

          matchScore: 1,

          matchType: 'barcode',

        }),

      );

    });

  }



  const detailed = searchFoodsDetailed(db, q, {

    mode: 'search',

    limit: PERSONAL_SEARCH_LIMIT,

    includeUserHistory: true,

  });



  detailed.forEach((hit) => {

    if (seenIds.has(hit.id)) return;

    const row = db[hit.id];

    if (!row) return;

    seenIds.add(hit.id);

    results.push(

      buildUnifiedResult({

        id: hit.id,

        desc: hit.name || row.desc || row.name,

        row,

        source: FOOD_DB_SOURCE.KENTU_IT,

        legacySource: isRecipeRow(row) ? 'recipe' : 'personal',

        matchScore: hit.textScore ?? hit.matchScore,

        matchType: 'text',

        textScore: hit.textScore,

        recencyScore: hit.recencyScore,

      }),

    );

  });



  const qNorm = normalizeSearchText(q);

  if (qNorm) {

    Object.entries(db).forEach(([id, row]) => {

      if (!row || typeof row !== 'object' || !isRecipeRow(row) || seenIds.has(id)) return;

      const name = String(row.desc ?? row.name ?? '').trim();

      if (!name) return;

      const nameNorm = normalizeSearchText(name);

      if (!nameNorm.includes(qNorm)) return;

      seenIds.add(id);

      results.push(

        buildUnifiedResult({

          id,

          desc: name,

          row,

          source: FOOD_DB_SOURCE.KENTU_IT,

          legacySource: 'recipe',

          matchScore: nameNorm.startsWith(qNorm) ? 0.95 : 0.75,

          matchType: 'text',

          textScore: nameNorm.startsWith(qNorm) ? 0.95 : 0.75,

        }),

      );

    });

  }



  return results.sort(compareProvenancePriority);

}



/**

 * Tier 2 — catalogo Kentu DB IT (CREA certificato).

 */

export function searchKentuItDb(query, kentuItDb, existingResults = []) {

  return searchCatalogDb(query, kentuItDb, existingResults, {

    limit: KENTU_IT_SEARCH_LIMIT,

    legacySource: 'kentu_it',

    dbSource: FOOD_DB_SOURCE.KENTU_IT,

  });

}



/**

 * Tier 3 — catalogo Kentu DB 🌐 (esplorazione globale).

 */

export function searchGlobalDb(query, globalDb, existingResults = []) {

  return searchCatalogDb(query, globalDb, existingResults, {

    limit: GLOBAL_SEARCH_LIMIT,

    legacySource: 'master',

    dbSource: FOOD_DB_SOURCE.GLOBAL,

  });

}



/** @deprecated Usare searchGlobalDb */

export function searchMasterDb(query, masterDb, personalResults = []) {

  return searchGlobalDb(query, masterDb, personalResults);

}



/** @deprecated Usare searchGlobalDb */

export function searchExternalSources(query, masterDb, _legacyUsdaDb, personalResults = []) {

  void _legacyUsdaDb;

  return searchGlobalDb(query, masterDb, personalResults);

}



export const SEARCH_SOURCE_BADGE = {

  personal: {

    label: 'Personale',

    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',

  },

  kentu_it: {

    label: 'Kentu DB IT',

    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',

  },

  master: {

    label: 'Kentu DB 🌐',

    className: 'border-violet-500/40 bg-violet-500/15 text-violet-300',

  },

  recipe: {

    label: 'Ricetta',

    className: 'border-violet-500/40 bg-violet-500/15 text-violet-300',

  },

};



/**

 * Ricerca Kentu DB IT + opzionale globale per la barra inline della Vetrina.

 */

export function useDebouncedExternalFoodSearch(

  query,

  personalDb,

  globalDb = null,

  options = {},

) {

  const { kentuItDb = null, searchGlobal = false } = options;



  const results = useMemo(() => {

    const trimmedQuery = String(query || '').trim();

    if (!trimmedQuery) return [];



    const personalResults = searchPersonalDb(personalDb, trimmedQuery);

    const kentuItResults = searchKentuItDb(trimmedQuery, kentuItDb, personalResults);

    const kentuItCombined = [...personalResults, ...kentuItResults];



    if (!searchGlobal) return [];



    return searchGlobalDb(trimmedQuery, globalDb, kentuItCombined);

  }, [query, personalDb, kentuItDb, globalDb, searchGlobal]);



  return { externalResults: results, isSearchingExternal: false };

}



/**

 * Motore di ricerca unificato: Kentu DB IT (priorità) + opzionale globale.

 */

export function useUniversalSearchEngine(personalDb, kentuItDb = null, globalDb = null, options = {}) {

  const { searchGlobal = true } = options;

  const [query, setQuery] = useState('');



  const results = useMemo(() => {

    const trimmedQuery = String(query || '').trim();

    if (!trimmedQuery) return [];



    const personalResults = searchPersonalDb(personalDb, trimmedQuery);

    const kentuItResults = searchKentuItDb(trimmedQuery, kentuItDb, personalResults);

    const combined = [...personalResults, ...kentuItResults];



    if (!searchGlobal) {

      return combined.sort(compareProvenancePriority);

    }



    const globalResults = searchGlobalDb(trimmedQuery, globalDb, combined);

    return [...combined, ...globalResults].sort(compareProvenancePriority);

  }, [query, personalDb, kentuItDb, globalDb, searchGlobal]);



  return {

    query,

    setQuery,

    results,

    isSearchingExternal: false,

  };

}



export default useUniversalSearchEngine;

