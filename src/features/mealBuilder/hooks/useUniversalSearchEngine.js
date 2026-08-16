import { useCallback, useEffect, useRef, useState } from 'react';
import { FOOD_DB_SOURCE, FOOD_PROVENANCE, compareProvenancePriority } from '../../../foodDbSource';
import { searchFoodsDetailed } from '../../../foodSearch';
import { hasUsableOffKcal } from '../../../foodLoader';

const PERSONAL_SEARCH_LIMIT = 40;
const KENTU_IT_SEARCH_LIMIT = 40;
const GLOBAL_SEARCH_LIMIT = 40;
const OFF_SEARCH_LIMIT = 40;
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
      ? { ...row, source: row.source || dbSource, ...(brand ? { brand } : {}) }
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
 * Match “solido” di una singola parola della query su name/brand.
 * Parole corte (≤3): solo token esatto o prefisso molto stretto (pan→pane).
 * Parole lunghe: token esatto, prefisso token, o substring della frase.
 */
function wordHasSolidMatch(field, fieldWords, word) {
  const w = String(word || '').trim();
  if (!w || !field) return false;
  if (field === w) return true;
  if (fieldWords.includes(w)) return true;

  if (w.length <= 2) return false;

  if (w.length <= 3) {
    return fieldWords.some(
      (fw) => fw === w || (fw.startsWith(w) && fw.length <= w.length + 2),
    );
  }

  if (fieldWords.some((fw) => fw === w || fw.startsWith(w))) return true;
  // Substring solo se non è un frammento dentro un'altra parola casuale:
  // richiedi confini (inizio / spazio prima).
  if (field.startsWith(w) || field.includes(` ${w}`)) return true;
  return false;
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

/**
 * Unisce i hit dei vari DB, ordina per relevanceScore, tie-break per fonte.
 * Esclude categoricamente score 0 / sotto soglia (niente riempimento con cibi casuali).
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
    const scored = { ...item, relevanceScore };
    const key = dedupeKeyForResult(scored);
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, scored);
      continue;
    }
    if (scored.relevanceScore !== prev.relevanceScore) {
      if (scored.relevanceScore > prev.relevanceScore) bestByKey.set(key, scored);
      continue;
    }
    if (compareProvenancePriority(scored, prev) < 0) {
      bestByKey.set(key, scored);
    }
  }

  return Array.from(bestByKey.values())
    .filter((item) => Number(item.relevanceScore) >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => {
      const scoreA = Number(a.relevanceScore) || 0;
      const scoreB = Number(b.relevanceScore) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return compareProvenancePriority(a, b);
    })
    .slice(0, Math.max(1, Math.floor(cap) || MERGED_SEARCH_RESULT_CAP));
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
  } = options;
  const detailed = searchFoodsDetailed(safeDb, q, {
    includeUserHistory: dbSource === FOOD_DB_SOURCE.KENTU_IT,
    limit: Math.max(limit * 2, limit),
    mode: 'search',
    enableFuzzy,
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
  return results.slice(0, limit);
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
  return results.slice(0, PERSONAL_SEARCH_LIMIT);
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

/**
 * Tier 4 — Open Food Facts (solo kcal > 0).
 */
export function searchOffDb(query, offDb, existingResults = []) {
  return searchCatalogDb(query, offDb, existingResults, {
    limit: OFF_SEARCH_LIMIT,
    legacySource: 'off',
    dbSource: FOOD_DB_SOURCE.OFF,
    enableFuzzy: false,
    requireUsableKcal: true,
  }).slice(0, OFF_SEARCH_LIMIT);
}

/**
 * Slice OFF sicuro per lookup AI: mai l'intero DB.
 */
export function searchOffDbForAi(query, offDb) {
  return searchOffDb(query, offDb, []).slice(0, OFF_SEARCH_LIMIT);
}

/**
 * Cerca su tutti i DB, unisce e ordina per pertinenza (non per fonte).
 */
export function runUnifiedFoodSearch(query, options = {}) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return [];

  const {
    personalDb = null,
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
    cap = MERGED_SEARCH_RESULT_CAP,
  } = options;

  // Pool indipendenti: niente ordinamento per fonte qui — solo fetch.
  const personalResults = searchPersonalDb(personalDb, trimmedQuery);
  const kentuItResults = searchKentuItDb(trimmedQuery, kentuItDb, []);
  const globalResults = searchGlobal
    ? searchGlobalDb(trimmedQuery, globalDb, [])
    : [];
  const offResults = searchOffDb(trimmedQuery, offDb, []);

  return mergeAndRankSearchResults(
    trimmedQuery,
    [...personalResults, ...kentuItResults, ...globalResults, ...offResults],
    cap,
  );
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
 * Esegue la ricerca pesante in modo deferito così il spinner può paintare.
 */
function scheduleSearchWork(work) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(work());
    }, 0);
  });
}

/**
 * Ricerca esterna / unificata su query *committata* (Invio), non live.
 * isSearching è true non appena la query committata non coincide ancora coi risultati risolti
 * (evita il flash "Nessun risultato" prima che l'effect parta).
 */
export function useCommittedFoodSearch(committedQuery, personalDb, options = {}) {
  const {
    kentuItDb = null,
    globalDb = null,
    offDb = null,
    searchGlobal = true,
  } = options;
  const trimmed = String(committedQuery || '').trim();
  const [results, setResults] = useState([]);
  const [resolvedQuery, setResolvedQuery] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const genRef = useRef(0);

  const isSearching = Boolean(trimmed) && (inFlight || resolvedQuery !== trimmed);
  const safeResults = !trimmed || isSearching || resolvedQuery !== trimmed ? [] : results;

  useEffect(() => {
    const gen = ++genRef.current;

    if (!trimmed) {
      setResults([]);
      setResolvedQuery('');
      setInFlight(false);
      return undefined;
    }

    setInFlight(true);
    let cancelled = false;

    void scheduleSearchWork(() =>
      runUnifiedFoodSearch(trimmed, {
        personalDb,
        kentuItDb,
        globalDb,
        offDb,
        searchGlobal,
      }),
    ).then((next) => {
      if (cancelled || gen !== genRef.current) return;
      setResults(Array.isArray(next) ? next : []);
      setResolvedQuery(trimmed);
      setInFlight(false);
    });

    return () => {
      cancelled = true;
    };
  }, [trimmed, personalDb, kentuItDb, globalDb, offDb, searchGlobal]);

  return {
    results: safeResults,
    isSearching,
    /** @deprecated alias compat */
    isSearchingExternal: isSearching,
    externalResults: safeResults,
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
 * Motore universale: digitazione libera; ricerca solo su Invio / runSearch().
 */
export function useUniversalSearchEngine(personalDb, kentuItDb = null, globalDb = null, options = {}) {
  const {
    searchGlobal = true,
    offDb = null,
  } = options;
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  const { results, isSearching } = useCommittedFoodSearch(committedQuery, personalDb, {
    kentuItDb,
    globalDb,
    offDb,
    searchGlobal,
  });

  const runSearch = useCallback((overrideQuery) => {
    const next = String(overrideQuery != null ? overrideQuery : queryRef.current).trim();
    if (overrideQuery != null) setQuery(String(overrideQuery));
    setCommittedQuery(next);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setCommittedQuery('');
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    /** @deprecated alias compat con UI precedente */
    isSearchingExternal: isSearching,
    runSearch,
    clearSearch,
    committedQuery,
    hasSearched: committedQuery.trim().length > 0,
  };
}

export default useUniversalSearchEngine;
