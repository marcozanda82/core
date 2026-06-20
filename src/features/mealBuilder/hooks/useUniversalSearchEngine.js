import { useEffect, useRef, useState } from 'react';
import { searchFoodsDetailed } from '../../../foodSearch';
import { getCreaFusionPayload, isSimilar } from '../../../foodSourceFusion';
import { searchUSDAFoods } from '../../../usdaFoodApi';

const EXTERNAL_DEBOUNCE_MS = 450;
const MIN_EXTERNAL_QUERY_LENGTH = 3;
const PERSONAL_SEARCH_LIMIT = 30;
const CREA_SEARCH_LIMIT = 40;
const USDA_PAGE_SIZE = 10;

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

function normalizeCreaDb(creaDb) {
  if (creaDb == null) return null;
  if (typeof creaDb === 'object' && !Array.isArray(creaDb)) return creaDb;
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
  matchScore,
  matchType,
  textScore,
  recencyScore,
}) {
  const name = String(desc || row?.desc || row?.name || id || '').trim();
  return {
    id: String(id),
    key: String(id),
    desc: name,
    name,
    barcode: row?.barcode != null ? String(row.barcode).trim() : undefined,
    row: row || { id, desc: name, name },
    _source: source,
    matchScore,
    matchType,
    textScore,
    recencyScore,
  };
}

/**
 * Tier 1 — ricerca sincrona sul database personale Firebase.
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
          source: 'personal',
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
    if (!row || isRecipeRow(row)) return;
    seenIds.add(hit.id);
    results.push(
      buildUnifiedResult({
        id: hit.id,
        desc: hit.name || row.desc || row.name,
        row,
        source: 'personal',
        matchScore: hit.textScore ?? hit.matchScore,
        matchType: 'text',
        textScore: hit.textScore,
        recencyScore: hit.recencyScore,
      }),
    );
  });

  return results.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

function isDuplicateOfPersonal(externalItem, personalResults) {
  const extName = normalizeSearchText(externalItem.name || externalItem.desc);
  const extBarcode = String(
    externalItem.barcode ?? externalItem.row?.barcode ?? '',
  ).replace(/\D/g, '');

  for (const personalItem of personalResults) {
    const personalName = normalizeSearchText(personalItem.desc || personalItem.name);
    const personalBarcode = String(
      personalItem.barcode ?? personalItem.row?.barcode ?? '',
    ).replace(/\D/g, '');

    if (extBarcode && personalBarcode && extBarcode === personalBarcode) {
      return true;
    }
    if (extName && personalName) {
      if (extName === personalName || isSimilar(extName, personalName)) {
        return true;
      }
    }
  }

  return false;
}

function isDuplicateInList(item, list) {
  const name = normalizeSearchText(item.name || item.desc);
  return list.some((existing) => {
    const existingName = normalizeSearchText(existing.name || existing.desc);
    return existingName && name && isSimilar(existingName, name);
  });
}

function mapCreaItemToResult(item) {
  const row = item.row || {
    id: item.id,
    desc: item.name,
    name: item.name,
    kcal: item.kcalPer100g,
    prot: item.protein,
    carb: item.carbs,
    fat: item.fat,
    foodSource: 'CREA',
  };

  return buildUnifiedResult({
    id: item.id,
    desc: item.name,
    row,
    source: 'crea',
    matchScore: item.finalScore ?? item.textScore ?? item.matchScore,
    matchType: 'text',
    textScore: item.textScore ?? item.matchScore,
  });
}

function mapUsdaHitToResult(hit) {
  const row = hit.row || {
    id: hit.id,
    desc: hit.name,
    name: hit.name,
    foodSource: 'USDA',
  };

  return buildUnifiedResult({
    id: hit.id,
    desc: hit.name,
    row,
    source: 'usda',
    matchScore: 0.35,
    matchType: 'text',
    textScore: 0.35,
  });
}

async function searchExternalSources(query, creaDb, personalResults, signal) {
  const external = [];
  const safeCreaDb = normalizeCreaDb(creaDb);

  if (safeCreaDb && Object.keys(safeCreaDb).length > 0) {
    const { creaNormalized } = getCreaFusionPayload(safeCreaDb, query, {
      includeUserHistory: false,
      creaLimit: CREA_SEARCH_LIMIT,
    });

    creaNormalized.forEach((item) => {
      const mapped = mapCreaItemToResult(item);
      if (!isDuplicateOfPersonal(mapped, personalResults)) {
        external.push(mapped);
      }
    });
  }

  const usdaHits = await searchUSDAFoods(query, {
    signal,
    pageSize: USDA_PAGE_SIZE,
  });

  usdaHits.forEach((hit) => {
    const mapped = mapUsdaHitToResult(hit);
    if (
      !isDuplicateOfPersonal(mapped, personalResults) &&
      !isDuplicateInList(mapped, external)
    ) {
      external.push(mapped);
    }
  });

  return external;
}

/**
 * Motore di ricerca unificato a cascata: Personale (sync) → CREA + USDA (async debounced).
 *
 * @param {object|Array|null} personalDb Database personale Firebase (`trackerFoodDatabase`)
 * @param {object|null} [creaDb] Catalogo CREA (CSV). Se omesso, Tier 2 salta CREA.
 * @returns {{
 *   query: string,
 *   setQuery: Function,
 *   results: object[],
 *   isSearchingExternal: boolean,
 * }}
 */
export function useUniversalSearchEngine(personalDb, creaDb = null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);

  const debounceTimerRef = useRef(null);
  const externalRequestSeqRef = useRef(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const trimmedQuery = String(query || '').trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!trimmedQuery) {
      setResults([]);
      setIsSearchingExternal(false);
      return undefined;
    }

    const personalResults = searchPersonalDb(personalDb, trimmedQuery);
    setResults(personalResults);

    if (trimmedQuery.length < MIN_EXTERNAL_QUERY_LENGTH) {
      setIsSearchingExternal(false);
      return undefined;
    }

    debounceTimerRef.current = setTimeout(() => {
      const requestSeq = externalRequestSeqRef.current + 1;
      externalRequestSeqRef.current = requestSeq;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsSearchingExternal(true);

      void (async () => {
        try {
          const latestPersonal = searchPersonalDb(personalDb, trimmedQuery);
          const externalResults = await searchExternalSources(
            trimmedQuery,
            creaDb,
            latestPersonal,
            abortController.signal,
          );

          if (requestSeq !== externalRequestSeqRef.current) return;
          if (abortController.signal.aborted) return;

          setResults([...latestPersonal, ...externalResults]);
        } catch (error) {
          if (error?.name === 'AbortError') return;
          if (requestSeq !== externalRequestSeqRef.current) return;

          setResults(searchPersonalDb(personalDb, trimmedQuery));
        } finally {
          if (requestSeq === externalRequestSeqRef.current) {
            setIsSearchingExternal(false);
          }
        }
      })();
    }, EXTERNAL_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [query, personalDb, creaDb]);

  return {
    query,
    setQuery,
    results,
    isSearchingExternal,
  };
}

export default useUniversalSearchEngine;
