import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FOOD_DB_SOURCE, FOOD_PROVENANCE, compareProvenancePriority } from '../../../foodDbSource';
import {
  foodNameMatchesQuery,
  normalizeSearchText as normalizeSearchTextShared,
  searchFoodsDetailed,
  textMatchesSearchQuery,
  tokenSharesStem,
} from '../../../foodSearch';
import { hasUsableOffKcal } from '../../../foodLoader';
import { searchOpenFoodFactsApi } from '../utils/openFoodFactsSearchApi';

const MEGA_SEARCH_CHUNK_SIZE = 1000;

const PERSONAL_SEARCH_LIMIT = 40;
const KENTU_IT_SEARCH_LIMIT = 40;
const GLOBAL_SEARCH_LIMIT = 40;
/** Ricerca locale Kentu IT / USDA (L1/L2 resolver): cap stretto + yield. */
const LOCAL_CATALOG_RESOLVER_LIMIT = 5;
const OFF_SEARCH_LIMIT = 5;
/** Cataloghi pesanti (USDA / OFF): cap su Object.entries per non bloccare il main thread. */
const HEAVY_CATALOG_MAX_SCAN = 4000;
/** Cap assoluto risultati UI / merge (mai renderizzare migliaia di nodi). */
export const MERGED_SEARCH_RESULT_CAP = 40;

function catalogDbIsEmpty(db) {
  if (db == null || typeof db !== 'object') return true;
  for (const key in db) {
    if (Object.prototype.hasOwnProperty.call(db, key)) return false;
  }
  return true;
}

export function normalizeSearchText(value) {
  return normalizeSearchTextShared(value);
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
  const dbSource = source === FOOD_DB_SOURCE.OFF
    ? FOOD_DB_SOURCE.OFF
    : source === FOOD_DB_SOURCE.GLOBAL
      ? FOOD_DB_SOURCE.GLOBAL
      : FOOD_DB_SOURCE.KENTU_IT;
  const brand = String(row?.brand || '').trim() || undefined;
  return {
    id: String(id),
    key: String(id),
    desc: name,
    name,
    brand,
    barcode: row?.barcode != null ? String(row.barcode).trim() : undefined,
    row: row
      ? {
        ...row,
        source: row.source || dbSource,
        ...(brand ? { brand } : {}),
        ...(row.semanticTags ? { semanticTags: row.semanticTags } : {}),
      }
      : { id, desc: name, name, source: dbSource, ...(brand ? { brand } : {}) },
    _source: legacySource,
    source: dbSource,
    provenance: legacySource === 'master'
      ? FOOD_PROVENANCE.GLOBAL
      : legacySource === 'off'
        ? FOOD_PROVENANCE.OFF
        : legacySource === 'kentu_it'
          ? FOOD_PROVENANCE.ITALY
          : FOOD_PROVENANCE.PERSONAL,
    matchScore,
    matchType,
    textScore,
    recencyScore,
    ...(row?.semanticTags ? { semanticTags: row.semanticTags } : {}),
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

/** Sotto questa soglia il risultato è scartato (zero tolleranza su match sparsi). */
export const MIN_RELEVANCE_SCORE = 300;

/**
 * Match “solido” di una singola parola: includes o tokenSharesStem sui token del nome.
 */
function wordHasSolidMatch(field, fieldWords, word) {
  return textMatchesSearchQuery(field, word)
    || fieldWords.some((fw) => tokenSharesStem(fw, word));
}

/**
 * Pertinenza rispetto a query su name + brand.
 * Exact / frase ≫ tutte le parole-chiave ≫ prefissi solidi.
 * Match sparsi o solo su una parola di una query multi-termine → 0.
 */
export function computeRelevanceScore(item, query) {
  const q = normalizeSearchText(query);
  if (!q) return 0;

  const name = normalizeSearchText(item?.name || item?.desc || '');
  const brand = normalizeSearchText(item?.brand || item?.row?.brand || '');
  const fields = [name, brand, [name, brand].filter(Boolean).join(' ')].filter(Boolean);
  if (fields.length === 0) return 0;

  const qWords = q.split(' ').filter((w) => w.length >= 2);
  if (qWords.length === 0) return 0;

  if (item?.matchType === 'barcode') {
    return 1100;
  }

  let best = 0;

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const fieldWords = field.split(' ').filter(Boolean);
    if (fieldWords.length === 0) continue;

    // Gate: ogni parola della query deve avere un match solido (zero tolleranza).
    const allWordsSolid = qWords.every((w) => wordHasSolidMatch(field, fieldWords, w));
    if (!allWordsSolid) {
      continue;
    }

    let score = 0;

    if (field === q) {
      score = 1000;
    } else if (field.startsWith(`${q} `) || field.startsWith(q)) {
      score = 920;
    } else if (field.includes(` ${q} `) || field.endsWith(` ${q}`) || field.includes(q)) {
      // Frase intera contenuta (es. "biscotti pan gocciole classici")
      score = 840;
    } else {
      const allExactTokens = qWords.every((w) => fieldWords.includes(w));
      const startsWithFirst = fieldWords[0] === qWords[0] || fieldWords[0]?.startsWith(qWords[0]);

      if (allExactTokens && startsWithFirst) {
        score = 780;
      } else if (allExactTokens) {
        score = 720;
      } else if (startsWithFirst) {
        // Tutte solide + nome inizia con la prima keyword
        score = 640;
      } else {
        // Tutte solide ma ordine/posizione più deboli
        score = 520;
      }

      // Query a una sola parola: alza se token iniziale esatto
      if (qWords.length === 1 && fieldWords[0] === qWords[0]) {
        score = Math.max(score, 800);
      }
    }

      // Query monotoken: preferisci voce base corta (Banane > Banana disidratata…).
      if (qWords.length === 1 && foodNameMatchesQuery(field, q)) {
        const firstWord = fieldWords[0] || '';
        if (firstWord && tokenSharesStem(firstWord, qWords[0]) && fieldWords.length === 1) {
          score = Math.max(score, 980);
        } else if (firstWord && tokenSharesStem(firstWord, qWords[0])) {
          const shortBonus = Math.max(0, 60 - Math.max(0, field.length - firstWord.length));
          score = Math.max(score, 900 + shortBonus);
        }
      }

      // Bonus brand se la query compare anche lì (non inventa score da solo).
    if (brand && score > 0 && (brand === q || brand.includes(q) || qWords.every((w) => brand.includes(w)))) {
      score += 25;
    }

    best = Math.max(best, score);
  }

  // Tie-break minuscolo SOLO se c'è già un match keyword solido — mai creare score da fuzzy.
  if (best > 0) {
    const lexical = Number(item?.textScore ?? item?.matchScore ?? 0);
    if (Number.isFinite(lexical) && lexical > 0) {
      best += Math.min(15, Math.round(lexical * 8));
    }
  }

  return best >= MIN_RELEVANCE_SCORE ? best : 0;
}

function dedupeKeyForResult(item) {
  const barcode = String(item?.barcode ?? item?.row?.barcode ?? '').replace(/\D/g, '');
  if (barcode.length >= 8) return `bc:${barcode}`;
  const name = normalizeSearchText(item?.name || item?.desc || '');
  const brand = normalizeSearchText(item?.brand || item?.row?.brand || '');
  return `n:${name}|b:${brand}|s:${item?._source || item?.source || ''}`;
}

const MASTER_SOURCE_BONUS = 100;
const EXACT_NAME_BONUS = 10;
/** Preferisci nomi più corti a parità di match (Banane > Banana disidratata…). */
const SHORT_NAME_BONUS_MAX = 45;

function isOffSearchResult(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.provenance === FOOD_PROVENANCE.OFF) return true;
  if (item._source === 'off' || item.source === FOOD_DB_SOURCE.OFF) return true;
  if (item.row?.source === FOOD_DB_SOURCE.OFF) return true;
  const foodSource = String(item.foodSource || item.row?.foodSource || '').toUpperCase();
  return foodSource === 'OFF';
}

function isMasterSearchResult(item) {
  if (!item || typeof item !== 'object' || isOffSearchResult(item)) return false;
  const foodSource = String(item.foodSource || item.row?.foodSource || '').toUpperCase();
  if (foodSource === 'KENTU' || foodSource === 'CREA' || foodSource === 'GLOBAL') return true;
  const source = String(item.source || item._source || item.row?.source || '').toUpperCase();
  if (
    source === FOOD_DB_SOURCE.GLOBAL
    || source === FOOD_DB_SOURCE.KENTU_IT
    || source === 'CREA'
    || source === 'MASTER'
    || source === 'KENTU_IT'
    || source === 'GLOBAL'
    || source === 'PERSONAL'
    || source === 'RECIPE'
  ) {
    return true;
  }
  return (
    item.provenance === FOOD_PROVENANCE.GLOBAL
    || item.provenance === FOOD_PROVENANCE.ITALY
    || item.provenance === FOOD_PROVENANCE.PERSONAL
  );
}

function isExactNameMatch(item, query) {
  const q = normalizeSearchText(query);
  const name = normalizeSearchText(item?.name || item?.desc || '');
  if (!q || !name) return false;
  if (name === q || name.startsWith(`${q} `)) return true;
  return foodNameMatchesQuery(name, q) && name.split(/\s+/).length <= q.split(/\s+/).length + 1;
}

/** Bonus se il nome visualizzato è corto rispetto ad alternative stem-equivalenti. */
function computeShortNameBonus(item, query) {
  const q = normalizeSearchText(query);
  const name = normalizeSearchText(item?.name || item?.desc || '');
  if (!q || !name || !foodNameMatchesQuery(name, q)) return 0;
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (qTokens.length !== 1) return 0;
  const token = qTokens[0];
  const firstWord = name.split(/\s+/).filter(Boolean)[0] || '';
  if (!firstWord || !tokenSharesStem(firstWord, token)) return 0;
  const extraLen = Math.max(0, name.length - firstWord.length);
  return Math.max(0, SHORT_NAME_BONUS_MAX - Math.min(SHORT_NAME_BONUS_MAX, extraLen));
}

/** Score di sort: Master +100, match esatto +10, nome corto, poi relevance lessicale. */
function computeRankingScore(item, query, relevanceScore) {
  let score = Number(relevanceScore) || 0;
  if (isMasterSearchResult(item)) score += MASTER_SOURCE_BONUS;
  if (isExactNameMatch(item, query)) score += EXACT_NAME_BONUS;
  score += computeShortNameBonus(item, query);
  return score;
}

/**
 * Unisce i hit dei vari DB. Priorità assoluta Master (Kentu/CREA/GLOBAL) su OFF,
 * poi rankingScore (Master +100, exact +10, relevance).
 */
export function mergeAndRankSearchResults(query, items, cap = MERGED_SEARCH_RESULT_CAP) {
  const list = Array.isArray(items) ? items : [];
  const bestByKey = new Map();

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item) continue;
    const relevanceScore = computeRelevanceScore(item, query);
    if (!Number.isFinite(relevanceScore) || relevanceScore < MIN_RELEVANCE_SCORE) {
      continue;
    }
    const rankingScore = computeRankingScore(item, query, relevanceScore);
    const scored = { ...item, relevanceScore, rankingScore };
    const key = dedupeKeyForResult(scored);
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, scored);
      continue;
    }
    const preferScoredMaster = isMasterSearchResult(scored) && !isMasterSearchResult(prev);
    const preferPrevMaster = isMasterSearchResult(prev) && !isMasterSearchResult(scored);
    if (preferScoredMaster) {
      bestByKey.set(key, scored);
      continue;
    }
    if (preferPrevMaster) continue;
    if (scored.rankingScore !== prev.rankingScore) {
      if (scored.rankingScore > prev.rankingScore) bestByKey.set(key, scored);
      continue;
    }
    if (compareProvenancePriority(scored, prev) < 0) {
      bestByKey.set(key, scored);
    }
  }

  return Array.from(bestByKey.values())
    .filter((item) => Number(item.relevanceScore) >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => {
      const aOff = isOffSearchResult(a);
      const bOff = isOffSearchResult(b);
      if (aOff !== bOff) return aOff ? 1 : -1;
      const scoreA = Number(a.rankingScore) || 0;
      const scoreB = Number(b.rankingScore) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const lenA = normalizeSearchText(a?.name || a?.desc || '').length;
      const lenB = normalizeSearchText(b?.name || b?.desc || '').length;
      if (lenA !== lenB) return lenA - lenB;
      return compareProvenancePriority(a, b);
    })
    .slice(0, Math.max(1, Math.floor(cap) || MERGED_SEARCH_RESULT_CAP));
}

function isHeavyCatalogSource(dbSource) {
  return dbSource === FOOD_DB_SOURCE.GLOBAL || dbSource === FOOD_DB_SOURCE.OFF;
}

function searchCatalogDb(query, catalogDb, existingResults, options = {}) {
  const safeDb = normalizeCatalogDb(catalogDb);
  const q = String(query || '').trim();
  if (!q || !safeDb || catalogDbIsEmpty(safeDb)) return [];
  const {
    limit = KENTU_IT_SEARCH_LIMIT,
    legacySource = 'kentu_it',
    dbSource = FOOD_DB_SOURCE.KENTU_IT,
    // Fuzzy spento: i match “vicini” sparsi vengono comunque azzerati dallo score,
    // ma evitiamo di scaricare junk irrilevante nei pool.
    enableFuzzy = false,
    requireUsableKcal = dbSource === FOOD_DB_SOURCE.OFF,
    maxEntriesToScan = null,
    earlyExitOnStrong = false,
  } = options;
  const heavy = isHeavyCatalogSource(dbSource);
  const effectiveLimit = limit;
  const detailed = searchFoodsDetailed(safeDb, q, {
    includeUserHistory: dbSource === FOOD_DB_SOURCE.KENTU_IT,
    limit: Math.max(effectiveLimit * 2, effectiveLimit),
    mode: 'search',
    enableFuzzy: heavy ? false : enableFuzzy,
    maxEntriesToScan: maxEntriesToScan
      ?? (heavy ? HEAVY_CATALOG_MAX_SCAN : null),
    earlyExitOnStrong: earlyExitOnStrong || heavy,
  });
  const results = [];
  detailed.forEach((hit) => {
    const row = safeDb[hit.id];
    if (!row) return;
    if (requireUsableKcal && !hasUsableOffKcal(row)) return;
    const mapped = mapCatalogHitToResult(hit, row, legacySource, dbSource);
    if (!isDuplicateOfExisting(mapped, existingResults) && !isDuplicateOfExisting(mapped, results)) {
      results.push(mapped);
    }
  });
  return results.slice(0, effectiveLimit);
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function isSearchAborted(signal) {
  if (signal?.aborted) return true;
  return typeof signal?.isCancelled === 'function' && signal.isCancelled();
}

/**
 * Ricerca catalogo a chunk — yield tra blocchi da 1000 voci per non bloccare il main thread.
 */
async function searchCatalogDbChunked(query, catalogDb, existingResults, options = {}, signal = null) {
  const safeDb = normalizeCatalogDb(catalogDb);
  const q = String(query || '').trim();
  if (!q || !safeDb || catalogDbIsEmpty(safeDb) || isSearchAborted(signal)) return [];

  const {
    limit = KENTU_IT_SEARCH_LIMIT,
    legacySource = 'kentu_it',
    dbSource = FOOD_DB_SOURCE.KENTU_IT,
    enableFuzzy = false,
    requireUsableKcal = dbSource === FOOD_DB_SOURCE.OFF,
    maxEntriesToScan = null,
  } = options;

  const heavy = isHeavyCatalogSource(dbSource);
  const effectiveLimit = limit;
  const scanCap = maxEntriesToScan
    ?? (heavy ? HEAVY_CATALOG_MAX_SCAN : null);

  const entries = Object.entries(safeDb);
  const results = [];
  const poolLimit = Math.max(effectiveLimit * 2, effectiveLimit);
  const hardScanEnd = scanCap != null
    ? Math.min(entries.length, scanCap)
    : entries.length;

  for (let start = 0; start < hardScanEnd; start += MEGA_SEARCH_CHUNK_SIZE) {
    if (isSearchAborted(signal)) return results.slice(0, effectiveLimit);

    const chunkEnd = Math.min(start + MEGA_SEARCH_CHUNK_SIZE, hardScanEnd);
    const chunkEntries = entries.slice(start, chunkEnd);
    const chunkDb = Object.fromEntries(chunkEntries);
    const detailed = searchFoodsDetailed(chunkDb, q, {
      includeUserHistory: dbSource === FOOD_DB_SOURCE.KENTU_IT,
      limit: poolLimit,
      mode: 'search',
      enableFuzzy: heavy ? false : enableFuzzy,
      earlyExitOnStrong: heavy,
    });

    detailed.forEach((hit) => {
      if (results.length >= effectiveLimit) return;
      const row = safeDb[hit.id];
      if (!row) return;
      if (requireUsableKcal && !hasUsableOffKcal(row)) return;
      const mapped = mapCatalogHitToResult(hit, row, legacySource, dbSource);
      if (!isDuplicateOfExisting(mapped, existingResults) && !isDuplicateOfExisting(mapped, results)) {
        results.push(mapped);
      }
    });

    if (results.length >= effectiveLimit) break;
    await yieldToMainThread();
  }

  return results.slice(0, effectiveLimit);
}

/**
 * Tier 2–4 async — time-sliced, cancellabile via signal.isCancelled().
 */
export async function searchMegaDbsOnlyAsync(query, options = {}, signal = null) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery || isSearchAborted(signal)) return [];

  const {
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
    cap = MERGED_SEARCH_RESULT_CAP,
  } = options;

  await yieldToMainThread();
  if (isSearchAborted(signal)) return [];

  const kentuItResults = await searchCatalogDbChunked(
    trimmedQuery,
    kentuItDb,
    [],
    {
      limit: KENTU_IT_SEARCH_LIMIT,
      legacySource: 'kentu_it',
      dbSource: FOOD_DB_SOURCE.KENTU_IT,
    },
    signal,
  );
  if (isSearchAborted(signal)) return [];

  const globalResults = searchGlobal
    ? await searchCatalogDbChunked(
      trimmedQuery,
      globalDb,
      kentuItResults,
      {
        limit: GLOBAL_SEARCH_LIMIT,
        legacySource: 'master',
        dbSource: FOOD_DB_SOURCE.GLOBAL,
      },
      signal,
    )
    : [];
  if (isSearchAborted(signal)) return [];

  const offResults = await searchOffDb(
    trimmedQuery,
    null,
    [...kentuItResults, ...globalResults],
    { limit: OFF_SEARCH_LIMIT, signal },
  );
  if (isSearchAborted(signal)) return [];

  return mergeAndRankSearchResults(
    trimmedQuery,
    [...kentuItResults, ...globalResults, ...offResults],
    cap,
  );
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
      if (!textMatchesSearchQuery(name, q)) return;
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
  return results.slice(0, PERSONAL_SEARCH_LIMIT);
}

/**
 * Tier 2 — catalogo Kentu DB IT (CREA certificato).
 * Async + yield ogni 1000 voci per non bloccare il main thread.
 */
export async function searchKentuItDb(query, kentuItDb, existingResults = [], overrides = {}) {
  return searchCatalogDbChunked(query, kentuItDb, existingResults, {
    limit: LOCAL_CATALOG_RESOLVER_LIMIT,
    legacySource: 'kentu_it',
    dbSource: FOOD_DB_SOURCE.KENTU_IT,
    ...overrides,
  }, overrides.signal ?? null);
}

/**
 * Tier 3 — catalogo Kentu DB 🌐 (USDA).
 * Async + yield; scan cap su Object.entries.
 */
export async function searchGlobalDb(query, globalDb, existingResults = [], overrides = {}) {
  return searchCatalogDbChunked(query, globalDb, existingResults, {
    limit: LOCAL_CATALOG_RESOLVER_LIMIT,
    legacySource: 'master',
    dbSource: FOOD_DB_SOURCE.GLOBAL,
    enableFuzzy: false,
    maxEntriesToScan: HEAVY_CATALOG_MAX_SCAN,
    ...overrides,
  }, overrides.signal ?? null);
}

/**
 * Tier 4 — Open Food Facts via REST API (Livello 2 cloud).
 * Il parametro offDb è ignorato (legacy compat).
 */
export async function searchOffDb(query, _offDb, existingResults = [], overrides = {}) {
  void _offDb;
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return [];

  const limit = Number.isFinite(overrides.limit) && overrides.limit > 0
    ? Math.floor(overrides.limit)
    : OFF_SEARCH_LIMIT;

  if (isSearchAborted(overrides.signal)) return [];

  const rows = await searchOpenFoodFactsApi(trimmedQuery, {
    limit,
    signal: overrides.signal,
  });

  const results = [];
  rows.forEach((row, index) => {
    const id = String(row.id || row.barcode || `off_${index}`).trim();
    const mapped = mapCatalogHitToResult(
      {
        id,
        name: row.name || row.desc,
        textScore: 0.92,
        matchScore: 0.92,
      },
      { ...row, id },
      'off',
      FOOD_DB_SOURCE.OFF,
    );
    if (!isDuplicateOfExisting(mapped, existingResults) && !isDuplicateOfExisting(mapped, results)) {
      results.push(mapped);
    }
  });

  return results.slice(0, limit);
}

/**
 * Slice OFF sicuro per lookup AI: REST, max 5 risultati.
 */
export async function searchOffDbForAi(query, _offDb) {
  void _offDb;
  return searchOffDb(query, null, [], { limit: OFF_SEARCH_LIMIT });
}

/**
 * Cerca su tutti i DB, unisce e ordina per pertinenza (non per fonte).
 */
export async function runUnifiedFoodSearch(query, options = {}) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return [];

  const {
    personalDb = null,
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
    cap = MERGED_SEARCH_RESULT_CAP,
    signal = null,
  } = options;

  const personalResults = searchPersonalDb(personalDb, trimmedQuery);
  const kentuItResults = await searchCatalogDbChunked(
    trimmedQuery,
    kentuItDb,
    [],
    {
      limit: KENTU_IT_SEARCH_LIMIT,
      legacySource: 'kentu_it',
      dbSource: FOOD_DB_SOURCE.KENTU_IT,
    },
    signal,
  );
  const globalResults = searchGlobal
    ? await searchCatalogDbChunked(
      trimmedQuery,
      globalDb,
      kentuItResults,
      {
        limit: GLOBAL_SEARCH_LIMIT,
        legacySource: 'master',
        dbSource: FOOD_DB_SOURCE.GLOBAL,
        enableFuzzy: false,
        maxEntriesToScan: HEAVY_CATALOG_MAX_SCAN,
      },
      signal,
    )
    : [];
  const offResults = await searchOffDb(trimmedQuery, offDb, [], { signal });

  return mergeAndRankSearchResults(
    trimmedQuery,
    [...personalResults, ...kentuItResults, ...globalResults, ...offResults],
    cap,
  );
}

/**
 * Tier 2–4 — solo cataloghi pesanti (Kentu IT, Global, OFF). Esclude il DB personale.
 */
export async function searchMegaDbsOnly(query, options = {}, signal = null) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return [];

  const {
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
    cap = MERGED_SEARCH_RESULT_CAP,
  } = options;

  const kentuItResults = await searchCatalogDbChunked(
    trimmedQuery,
    kentuItDb,
    [],
    {
      limit: KENTU_IT_SEARCH_LIMIT,
      legacySource: 'kentu_it',
      dbSource: FOOD_DB_SOURCE.KENTU_IT,
    },
    signal,
  );
  const globalResults = searchGlobal
    ? await searchCatalogDbChunked(
      trimmedQuery,
      globalDb,
      kentuItResults,
      {
        limit: GLOBAL_SEARCH_LIMIT,
        legacySource: 'master',
        dbSource: FOOD_DB_SOURCE.GLOBAL,
        enableFuzzy: false,
        maxEntriesToScan: HEAVY_CATALOG_MAX_SCAN,
      },
      signal,
    )
    : [];
  const offResults = await searchOffDb(trimmedQuery, offDb, [...kentuItResults, ...globalResults], {
    limit: OFF_SEARCH_LIMIT,
    signal,
  });

  return mergeAndRankSearchResults(
    trimmedQuery,
    [...kentuItResults, ...globalResults, ...offResults],
    cap,
  );
}

/** @deprecated Usare searchGlobalDb */
export async function searchMasterDb(query, masterDb, personalResults = []) {
  return searchGlobalDb(query, masterDb, personalResults);
}

/** @deprecated Usare searchGlobalDb */
export async function searchExternalSources(query, masterDb, _legacyUsdaDb, personalResults = []) {
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
  off: {
    label: 'Open Food Facts',
    className: 'border-orange-500/40 bg-orange-500/20 text-orange-400',
  },
  recipe: {
    label: 'Ricetta',
    className: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
  },
};

/**
 * Ricerca ibrida:
 * - DB personale: istantaneo sulla liveQuery (useMemo)
 * - Mega DB: solo su committedMegaQuery (Invio / commitMegaSearch), time-sliced async
 */
export function useSplitFoodSearch(liveQuery, personalDb, options = {}) {
  const {
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
    cap = MERGED_SEARCH_RESULT_CAP,
  } = options;

  const liveTrimmed = String(liveQuery || '').trim();
  const liveTrimmedRef = useRef(liveTrimmed);
  liveTrimmedRef.current = liveTrimmed;

  const [committedMegaQuery, setCommittedMegaQuery] = useState('');
  const [megaResults, setMegaResults] = useState([]);
  const [resolvedMegaQuery, setResolvedMegaQuery] = useState('');
  const [megaInFlight, setMegaInFlight] = useState(false);
  const searchGenRef = useRef(0);

  const personalResults = useMemo(() => {
    if (!liveTrimmed) return [];
    return searchPersonalDb(personalDb, liveTrimmed);
  }, [liveTrimmed, personalDb]);

  const commitMegaSearch = useCallback((overrideQuery) => {
    const next = String(
      overrideQuery != null ? overrideQuery : liveTrimmedRef.current,
    ).trim();
    setCommittedMegaQuery(next);
  }, []);

  const clearMegaSearch = useCallback(() => {
    searchGenRef.current += 1;
    setCommittedMegaQuery('');
    setMegaResults([]);
    setResolvedMegaQuery('');
    setMegaInFlight(false);
  }, []);

  useEffect(() => {
    if (!liveTrimmed) {
      clearMegaSearch();
    }
  }, [liveTrimmed, clearMegaSearch]);

  useEffect(() => {
    const gen = ++searchGenRef.current;
    let cancelled = false;
    const signal = {
      isCancelled: () => cancelled || gen !== searchGenRef.current,
    };

    if (!committedMegaQuery) {
      setMegaResults([]);
      setResolvedMegaQuery('');
      setMegaInFlight(false);
      return undefined;
    }

    setMegaInFlight(true);

    void (async () => {
      await yieldToMainThread();
      if (signal.isCancelled()) return;

      const next = await searchMegaDbsOnlyAsync(
        committedMegaQuery,
        {
          kentuItDb,
          globalDb,
          offDb,
          searchGlobal,
          cap,
        },
        signal,
      );

      if (signal.isCancelled()) return;
      setMegaResults(Array.isArray(next) ? next : []);
      setResolvedMegaQuery(committedMegaQuery);
      setMegaInFlight(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [committedMegaQuery, kentuItDb, globalDb, offDb, searchGlobal, cap]);

  const megaResultsReady = !committedMegaQuery || resolvedMegaQuery === committedMegaQuery;
  const isSearchingMega = Boolean(committedMegaQuery) && (megaInFlight || !megaResultsReady);
  const megaMatchesLive = Boolean(committedMegaQuery) && liveTrimmed === committedMegaQuery;

  const results = useMemo(() => {
    if (!liveTrimmed) return [];
    const megaForMerge = megaResultsReady && megaMatchesLive ? megaResults : [];
    return mergeAndRankSearchResults(
      liveTrimmed,
      [...personalResults, ...megaForMerge],
      cap,
    );
  }, [
    liveTrimmed,
    personalResults,
    megaResults,
    megaResultsReady,
    megaMatchesLive,
    cap,
  ]);

  return {
    results,
    personalResults,
    megaResults: megaResultsReady && megaMatchesLive ? megaResults : [],
    committedMegaQuery,
    commitMegaSearch,
    clearMegaSearch,
    isSearchingMega,
    /** @deprecated alias compat */
    isSearching: isSearchingMega,
    isSearchingExternal: isSearchingMega,
    externalResults: megaResultsReady && megaMatchesLive ? megaResults : [],
  };
}

/**
 * Ricerca su query committata (Invio): personal istantaneo + mega al cambio query.
 */
export function useCommittedFoodSearch(committedQuery, personalDb, options = {}) {
  const trimmed = String(committedQuery || '').trim();
  const {
    results,
    isSearchingMega,
    megaResults,
    personalResults,
    commitMegaSearch,
  } = useSplitFoodSearch(trimmed, personalDb, options);
  const lastCommittedRef = useRef('');

  useEffect(() => {
    if (trimmed && trimmed !== lastCommittedRef.current) {
      lastCommittedRef.current = trimmed;
      commitMegaSearch(trimmed);
    }
    if (!trimmed) {
      lastCommittedRef.current = '';
    }
  }, [trimmed, commitMegaSearch]);

  return {
    results,
    isSearching: isSearchingMega,
    isSearchingExternal: isSearchingMega,
    externalResults: megaResults,
    personalResults,
    commitMegaSearch,
  };
}

/** @deprecated Usare useCommittedFoodSearch — non più debounce live. */
export function useDebouncedExternalFoodSearch(query, personalDb, globalDb = null, options = {}) {
  return useCommittedFoodSearch(query, personalDb, {
    ...options,
    globalDb: options.globalDb ?? globalDb,
  });
}

/**
 * Motore universale: personal live, mega DB solo su Invio (runSearch / commitMegaSearch).
 */
export function useUniversalSearchEngine(personalDb, kentuItDb = null, globalDb = null, options = {}) {
  const {
    searchGlobal = true,
    offDb = null,
  } = options;
  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  const liveTrimmed = String(query || '').trim();

  const {
    results,
    isSearchingMega,
    commitMegaSearch,
    clearMegaSearch,
  } = useSplitFoodSearch(liveTrimmed, personalDb, {
    kentuItDb,
    globalDb,
    offDb,
    searchGlobal,
  });

  const runSearch = useCallback((overrideQuery) => {
    const next = String(overrideQuery != null ? overrideQuery : queryRef.current).trim();
    if (overrideQuery != null) setQuery(String(overrideQuery));
    commitMegaSearch(next);
  }, [commitMegaSearch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    clearMegaSearch();
  }, [clearMegaSearch]);

  return {
    query,
    setQuery,
    results,
    isSearching: isSearchingMega,
    isSearchingMega,
    /** @deprecated alias compat con UI precedente */
    isSearchingExternal: isSearchingMega,
    runSearch,
    clearSearch,
    commitMegaSearch,
    committedQuery: liveTrimmed,
    hasSearched: liveTrimmed.length > 0,
  };
}

export default useUniversalSearchEngine;
