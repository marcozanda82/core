/**
 * Pipeline a livelli multi-database per McDrive / Meal Draft:
 * Livello 1 — Personale + Kentu ITA (match ≥80% → subito).
 * Livello 2 — OFF / USDA solo se L1 vuoto, con feedback UI + Interrompi.
 * Filtro rigido: niente candidati <50% o senza legame lessicale.
 */

import { normalizeSearchText } from '../../../foodSearch.js';
import {
  findFastLexicalFoodMatches,
  findSemanticKentuMatches,
} from '../../mealBuilder/utils/SemanticMatchmaker.js';
import {
  annotateCandidatesMatchQuality,
  classifyFoodMatchQuality,
  decideFoodMatchResolution,
  findStrongFoodMatchesInCatalog,
  isStrongFoodMatchQuality,
  levelHasStrongMatch,
  sortCandidatesByMatchQuality,
} from '../../mealBuilder/utils/foodMatchQuality.js';
import {
  computeRelevanceScore,
  mergeAndRankSearchResults,
  MIN_RELEVANCE_SCORE,
  searchGlobalDb,
  searchKentuItDb,
  searchOffDb,
  searchPersonalDb,
} from '../../mealBuilder/hooks/useUniversalSearchEngine.js';
import { lookupUserFoodAlias } from './userFoodAliases.js';
import { getUserFoodPreferenceContext } from './userFoodPreferenceContext.js';
import {
  findCoffeeShopProductByName,
  coffeeShopProductToResolverCandidate,
} from '../../../constants/coffeeShopDatabase.js';

export const AUTO_ACCEPT_CONFIDENCE = 0.85;
/** Match forte Livello 1 (Personale + Kentu): auto-accept / stop senza cataloghi esterni. */
export const LEVEL1_STRONG_CONFIDENCE = 0.8;
/** @deprecated Preferire LEVEL1_STRONG_CONFIDENCE */
export const FAST_PATH_EARLY_EXIT_CONFIDENCE = LEVEL1_STRONG_CONFIDENCE;
export const DISAMBIGUATION_CANDIDATE_LIMIT = 4;
/**
 * Soglia minima per mostrare un candidato in disambiguazione.
 * Sotto questa soglia (e senza exact match) → scartato: UI vuota + ricerca manuale.
 */
export const MIN_DISAMBIGUATION_CONFIDENCE = 0.5;
/** Step 2 su USDA/OFF: risultati stretti, niente full-scan. */
const HEAVY_STEP2_RESULT_LIMIT = 5;

const QUERY_STOPWORDS = new Set([
  'di', 'del', 'della', 'dei', 'delle', 'dello', 'da', 'dal', 'dalla',
  'con', 'e', 'ed', 'a', 'al', 'alla', 'ai', 'alle',
  'la', 'il', 'lo', 'le', 'i', 'gli', 'un', 'una', 'uno',
  'per', 'in', 'su', 'sul', 'sulla', 'the', 'of', 'and',
]);

export const FOOD_SOURCE_BADGE = Object.freeze({
  coffee_shop: { key: 'coffee_shop', label: 'Caffetteria', short: '[Local]' },
  personal: { key: 'personal', label: 'Personale', short: '[Personale]' },
  kentu: { key: 'kentu', label: 'CREA', short: '[CREA]' },
  kentu_it: { key: 'kentu_it', label: 'CREA', short: '[CREA]' },
  usda: { key: 'usda', label: 'USDA', short: '[USDA]' },
  global: { key: 'global', label: 'USDA', short: '[USDA]' },
  master: { key: 'master', label: 'USDA', short: '[USDA]' },
  off: { key: 'off', label: 'OFF', short: '[OFF]' },
});

const SOURCE_PRIORITY = Object.freeze({
  coffee_shop: -1,
  personal: 0,
  kentu: 1,
  kentu_it: 1,
  usda: 2,
  global: 2,
  master: 2,
  off: 3,
});

const CONFIDENCE_LABEL_SCORE = Object.freeze({
  high: 0.92,
  medium: 0.72,
  low: 0.45,
});

/**
 * @param {string} source
 * @returns {{ key: string, label: string, short: string }}
 */
export function resolveSourceBadge(source) {
  const key = String(source || '').trim().toLowerCase();
  return FOOD_SOURCE_BADGE[key] || FOOD_SOURCE_BADGE.kentu;
}

/**
 * @param {number} relevanceScore
 * @returns {number} 0–1
 */
export function relevanceScoreToConfidence(relevanceScore) {
  const score = Number(relevanceScore) || 0;
  if (score >= 1000) return 1;
  if (score >= 980) return 0.97;
  if (score >= 920) return 0.94;
  if (score >= 840) return 0.88;
  if (score >= 800) return 0.82;
  if (score >= 780) return 0.78;
  if (score >= 720) return 0.72;
  if (score >= 640) return 0.65;
  if (score >= 520) return 0.52;
  if (score >= 300) return 0.4;
  return 0;
}

/**
 * @param {string} label
 * @returns {number}
 */
export function confidenceLabelToScore(label) {
  const key = String(label || '').trim().toLowerCase();
  return CONFIDENCE_LABEL_SCORE[key] ?? 0.4;
}

/**
 * @param {number} score
 * @returns {'high'|'medium'|'low'}
 */
export function confidenceScoreToLabel(score) {
  const n = Number(score) || 0;
  if (n >= AUTO_ACCEPT_CONFIDENCE) return 'high';
  if (n >= 0.55) return 'medium';
  return 'low';
}

function normalizeSourceKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'personal' || s === 'personale') return 'personal';
  if (s === 'kentu' || s === 'kentu_it' || s === 'crea' || s === 'italy') return 'kentu';
  if (s === 'usda' || s === 'global' || s === 'master') return 'usda';
  if (s === 'off' || s === 'open_food_facts') return 'off';
  return s || 'kentu';
}

function candidateIdentity(candidate) {
  const id = String(
    candidate?.fdcId || candidate?.row?.id || candidate?.row?.foodDbKey || '',
  ).trim().toLowerCase();
  const name = String(candidate?.name || candidate?.row?.desc || '').trim().toLowerCase();
  return id ? `id:${id}` : `name:${name}`;
}

/**
 * Token significativi della query (stopword e token corti esclusi).
 * @param {string} query
 * @returns {string[]}
 */
export function significantFoodQueryTokens(query) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));
}

/**
 * True se il candidato è un match letterale / near-exact (sempre ammissibile in UI).
 * @param {object} candidate
 */
export function isExactOrNearExactCandidate(candidate) {
  const score = Number(candidate?.confidenceScore) || 0;
  if (score >= 0.98) return true;
  const reason = String(candidate?.reason || '').toLowerCase();
  if (reason.includes('letterale') || reason.includes('exact')) return true;
  const kind = String(candidate?.matchKind || '').toLowerCase();
  return kind === 'exact' || kind === 'whole_token';
}

/**
 * Frazione di token query presenti come token (o prefisso forte) nel nome candidato.
 * @param {string} query
 * @param {string} candidateName
 * @returns {number} 0–1
 */
export function lexicalLinkStrength(query, candidateName) {
  const qTokens = significantFoodQueryTokens(query);
  if (qTokens.length === 0) return 1;
  const hayTokens = normalizeSearchText(candidateName).split(/\s+/).filter(Boolean);
  if (hayTokens.length === 0) return 0;

  let hits = 0;
  for (let i = 0; i < qTokens.length; i += 1) {
    const t = qTokens[i];
    const matched = hayTokens.some((ht) => {
      if (ht === t) return true;
      const minLen = Math.min(ht.length, t.length);
      if (minLen < 4) return false;
      return ht.startsWith(t) || t.startsWith(ht);
    });
    if (matched) hits += 1;
  }
  return hits / qTokens.length;
}

/**
 * Gate UI disambiguazione: scarta confidenza bassa / 0% e match senza legame lessicale.
 * Exact match sempre ammessi.
 *
 * @param {string} query
 * @param {object} candidate
 * @returns {boolean}
 */
export function isAcceptableDisambiguationCandidate(query, candidate) {
  if (!candidate?.row || !String(candidate?.name || '').trim()) return false;
  if (isExactOrNearExactCandidate(candidate)) return true;

  const score = Number(candidate.confidenceScore);
  if (!Number.isFinite(score) || score < MIN_DISAMBIGUATION_CONFIDENCE) return false;

  const label = String(candidate.confidence || '').trim().toLowerCase();
  if (label === 'low') return false;

  const qTokens = significantFoodQueryTokens(query);
  const link = lexicalLinkStrength(query, candidate.name);
  if (link < 0.5) return false;

  // Query multi-parola (es. "salame ungherese"): serve copertura piena dei token,
  // altrimenti solo match ad alta confidenza (≥ auto-accept). Evita "pizza al salame".
  if (qTokens.length >= 2 && link < 1 && score < AUTO_ACCEPT_CONFIDENCE) {
    return false;
  }

  return true;
}

/**
 * Filtra la lista candidati per la sezione "Corrispondenze trovate".
 * Se nessuno passa → array vuoto (ricerca manuale / scanner).
 *
 * @param {string} query
 * @param {object[]} candidates
 * @param {{ limit?: number }} [opts]
 * @returns {object[]}
 */
export function filterAcceptableDisambiguationCandidates(query, candidates = [], opts = {}) {
  const limit = Number.isFinite(opts.limit) && opts.limit > 0
    ? Math.floor(opts.limit)
    : DISAMBIGUATION_CANDIDATE_LIMIT;
  const list = Array.isArray(candidates) ? candidates : [];
  return sortCandidates(
    list.filter((c) => isAcceptableDisambiguationCandidate(query, c)),
    query,
  ).slice(0, limit);
}

/**
 * @param {object} partial
 * @returns {object}
 */
function buildCandidate(partial = {}) {
  const source = normalizeSourceKey(partial.source);
  const badge = resolveSourceBadge(source);
  const confidenceScore = Math.max(0, Math.min(1, Number(partial.confidenceScore) || 0));
  const confidence = partial.confidence || confidenceScoreToLabel(confidenceScore);
  const name = String(partial.name || partial.row?.desc || partial.row?.name || '').trim();
  const fdcId = String(
    partial.fdcId || partial.row?.id || partial.row?.foodDbKey || '',
  ).trim() || null;
  const row = partial.row && typeof partial.row === 'object'
    ? {
      ...partial.row,
      desc: partial.row.desc || name,
      name: partial.row.name || name,
      ...(fdcId ? { id: partial.row.id || fdcId, foodDbKey: partial.row.foodDbKey || fdcId } : {}),
    }
    : null;

  const matchQuality = partial.matchQuality
    || classifyFoodMatchQuality(name, partial.query || '');
  return {
    fdcId,
    name,
    confidence,
    confidenceScore,
    reason: String(partial.reason || '').trim() || badge.short,
    source,
    sourceBadge: badge.short,
    sourceLabel: badge.label,
    row,
    matchQuality,
    ...(partial.matchKind ? { matchKind: partial.matchKind } : {}),
    ...(Number.isFinite(Number(partial.usageCount)) ? { usageCount: Number(partial.usageCount) } : {}),
    ...(Number.isFinite(Number(partial.recencyScore)) ? { recencyScore: Number(partial.recencyScore) } : {}),
  };
}

function mergeCandidatePool(pool, next) {
  if (!next?.row || !next?.name) return;
  const key = candidateIdentity(next);
  const existing = pool.get(key);
  if (!existing) {
    pool.set(key, next);
    return;
  }
  // Preferisci qualità match migliore; a parità confidenza più alta.
  const ranked = sortCandidatesByMatchQuality(
    [existing, next],
    (c) => SOURCE_PRIORITY[c.source] ?? 9,
  );
  pool.set(key, ranked[0]);
}

function sortCandidates(list, query = '') {
  const annotated = annotateCandidatesMatchQuality(query, list);
  return sortCandidatesByMatchQuality(
    annotated,
    (c) => SOURCE_PRIORITY[c.source] ?? 9,
  );
}

/**
 * @param {object} searchResult
 * @param {string} fallbackSource
 * @returns {object|null}
 */
/**
 * @param {object} searchResult
 * @param {string} [fallbackSource]
 * @param {string} [query] — query utente (obbligatoria per score 300–1100 coerente con ricerca manuale)
 */
export function searchResultToResolverCandidate(searchResult, fallbackSource = 'kentu', query = '') {
  if (!searchResult || typeof searchResult !== 'object') return null;
  const row = searchResult.row && typeof searchResult.row === 'object'
    ? searchResult.row
    : searchResult;
  const name = String(
    searchResult.desc || searchResult.name || row.desc || row.name || '',
  ).trim();
  if (!name) return null;

  const legacy = String(
    searchResult._source || searchResult.source || searchResult.legacySource || fallbackSource,
  ).toLowerCase();
  let source = normalizeSourceKey(legacy);
  if (legacy.includes('personal')) source = 'personal';
  else if (legacy.includes('kentu') || legacy.includes('crea') || legacy === 'italy') source = 'kentu';
  else if (legacy.includes('off')) source = 'off';
  else if (legacy.includes('master') || legacy.includes('global') || legacy.includes('usda')) {
    source = 'usda';
  }

  const q = String(query || '').trim();
  const ranking = Number(searchResult.rankingScore);
  const computed = q ? computeRelevanceScore(searchResult, q) : 0;
  let relevance = 0;
  if (Number.isFinite(ranking) && ranking >= MIN_RELEVANCE_SCORE) {
    relevance = ranking;
  } else if (Number.isFinite(computed) && computed >= MIN_RELEVANCE_SCORE) {
    relevance = computed;
  } else {
    // foodSearch textScore/matchScore sono 0–1: non passarli a relevanceScoreToConfidence (scala 300+).
    const unit = Number(searchResult.textScore ?? searchResult.matchScore);
    if (Number.isFinite(unit) && unit > 0 && unit <= 1.5) {
      relevance = Math.round(unit * 1000);
    }
  }

  const matchQuality = classifyFoodMatchQuality(name, q);
  return buildCandidate({
    fdcId: String(searchResult.key || searchResult.id || searchResult.fdcId || row.id || '').trim() || null,
    name,
    confidenceScore: relevanceScoreToConfidence(relevance),
    reason: `Corrispondenza lessicale (${Math.round(relevance)})`,
    source,
    query: q,
    matchQuality,
    usageCount: Number(searchResult.usageCount ?? row.usageCount) || undefined,
    recencyScore: Number(searchResult.recencyScore) || undefined,
    row: {
      ...row,
      desc: row.desc || name,
      name: row.name || name,
      ...(row.brand || searchResult.brand
        ? { brand: row.brand || searchResult.brand }
        : {}),
    },
    matchKind: matchQuality === 'exact' || relevance >= 980 ? 'exact' : undefined,
  });
}

/**
 * @param {object} semanticMatch
 * @param {string} source
 * @returns {object|null}
 */
function semanticMatchToCandidate(semanticMatch, source) {
  if (!semanticMatch?.row) return null;
  const label = String(semanticMatch.confidence || '').toLowerCase();
  // Gemini "low" non entra mai nel pool disambiguazione.
  if (label === 'low') return null;

  const labelScore = confidenceLabelToScore(semanticMatch.confidence);
  const exactBoost = String(semanticMatch.reason || '').toLowerCase().includes('letterale')
    ? 1
    : labelScore;
  return buildCandidate({
    fdcId: semanticMatch.fdcId,
    name: semanticMatch.name,
    confidence: semanticMatch.confidence,
    confidenceScore: exactBoost,
    reason: semanticMatch.reason || 'Match semantico',
    source,
    row: semanticMatch.row,
  });
}

function pushLexicalHits(pool, hits, source, query = '') {
  (Array.isArray(hits) ? hits : []).slice(0, 6).forEach((hit) => {
    const candidate = searchResultToResolverCandidate(hit, source, query);
    if (candidate) mergeCandidatePool(pool, candidate);
  });
}

function matchKindToQuality(matchKind, candidateName, query) {
  const kind = String(matchKind || '').toLowerCase();
  if (kind === 'exact') return 'exact';
  if (kind === 'starts_with') return 'prefix';
  if (kind === 'whole_token') return 'contains';
  return classifyFoodMatchQuality(candidateName, query);
}

function pushFastHits(pool, name, db, source) {
  if (!db || Object.keys(db).length === 0) return;
  // Exact+prefix a catalogo intero (nessun HEAVY_DB_MAX_SCAN / early-break):
  // include italianName CREA ("Spinaci, crudi" ← "spinaci") anche con molti contains personali.
  findStrongFoodMatchesInCatalog(name, db, { limit: 12 }).forEach((hit) => {
    const matchQuality = hit.matchQuality || matchKindToQuality(hit.matchKind, hit.name, name);
    const score = matchQuality === 'exact' ? 1 : matchQuality === 'prefix' ? 0.94 : 0.85;
    mergeCandidatePool(pool, buildCandidate({
      ...hit,
      confidence: 'high',
      confidenceScore: score,
      reason: hit.reason || 'Match letterale forte',
      source,
      query: name,
      matchKind: hit.matchKind || (matchQuality === 'exact' ? 'exact' : 'starts_with'),
      matchQuality,
    }));
  });
  findFastLexicalFoodMatches(name, db, { limit: 4 }).forEach((hit) => {
    const matchQuality = matchKindToQuality(hit.matchKind, hit.name, name);
    const score = matchQuality === 'exact'
      ? 1
      : matchQuality === 'prefix'
        ? 0.94
        : hit.matchKind === 'whole_token'
          ? 0.72
          : 0.65;
    mergeCandidatePool(pool, buildCandidate({
      fdcId: hit.fdcId,
      name: hit.name,
      confidence: matchQuality === 'exact' || matchQuality === 'prefix' ? 'high' : 'medium',
      confidenceScore: score,
      reason: hit.reason,
      source,
      row: hit.row,
      query: name,
      matchKind: hit.matchKind,
      matchQuality,
    }));
  });
}

/**
 * Livello 1 — solo Database Personale + Kentu ITA (curato).
 * Exact / lexical / semantic locale. Nessun USDA/OFF.
 *
 * @param {string} foodName
 * @param {object} ctx
 * @returns {Promise<object[]>}
 */
export async function collectLevel1LocalCandidates(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return [];

  const personalDb = ctx.personalDb && typeof ctx.personalDb === 'object' ? ctx.personalDb : null;
  const kentuItDb = ctx.kentuItDb && typeof ctx.kentuItDb === 'object' ? ctx.kentuItDb : null;
  const signal = ctx.signal;
  const pool = new Map();

  typeof ctx.onProgress === 'function'
    && ctx.onProgress({
      level: 1,
      phase: 'local',
      message: 'Cerco nel Database Personale e Kentu ITA…',
    });

  pushFastHits(pool, name, personalDb, 'personal');
  pushFastHits(pool, name, kentuItDb, 'kentu');

  let ranked = sortCandidates([...pool.values()], name);
  const finalize = (list) => filterAcceptableDisambiguationCandidates(name, list);

  // Early-exit solo con match forte (exact/prefix). Un contains (es. ravioli…spinaci)
  // non deve bloccare la scansione CREA/lessicale.
  if (
    ranked[0]
    && isStrongFoodMatchQuality(ranked[0].matchQuality)
    && Number(ranked[0].confidenceScore) >= LEVEL1_STRONG_CONFIDENCE
  ) {
    return finalize(ranked);
  }

  if (personalDb && Object.keys(personalDb).length > 0) {
    pushLexicalHits(pool, searchPersonalDb(personalDb, name).slice(0, 4), 'personal', name);
  }
  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    pushLexicalHits(
      pool,
      (await searchKentuItDb(name, kentuItDb, [], { limit: HEAVY_STEP2_RESULT_LIMIT, signal: ctx.signal })).slice(0, 4),
      'kentu',
      name,
    );
  }

  ranked = sortCandidates([...pool.values()], name);
  if (
    ranked[0]
    && isStrongFoodMatchQuality(ranked[0].matchQuality)
    && Number(ranked[0].confidenceScore) >= LEVEL1_STRONG_CONFIDENCE
  ) {
    return finalize(ranked);
  }

  // Semantic solo su archivi locali (niente inventare da cataloghi esterni).
  if (personalDb && Object.keys(personalDb).length > 0) {
    try {
      const personalSemantic = await findSemanticKentuMatches(name, {
        personalDb,
        kentuItDb: null,
      }, { signal });
      (Array.isArray(personalSemantic) ? personalSemantic : []).forEach((m) => {
        const c = semanticMatchToCandidate(m, 'personal');
        if (c) mergeCandidatePool(pool, c);
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn('[multiDbFoodResolver] L1 personal semantic failed', error);
    }
  }

  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    try {
      const kentuSemantic = await findSemanticKentuMatches(name, {
        kentuItDb,
        personalDb: null,
      }, { signal });
      (Array.isArray(kentuSemantic) ? kentuSemantic : []).forEach((m) => {
        const c = semanticMatchToCandidate(m, 'kentu');
        if (c) mergeCandidatePool(pool, c);
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn('[multiDbFoodResolver] L1 kentu semantic failed', error);
    }
  }

  return finalize(sortCandidates([...pool.values()], name));
}

/**
 * Livello 2 — cataloghi esterni USDA / Open Food Facts (mirato + filtro rigido).
 *
 * @param {string} foodName
 * @param {object} ctx
 * @returns {Promise<object[]>}
 */
export async function collectLevel2ExternalCandidates(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return [];

  const globalDb = ctx.globalDb && typeof ctx.globalDb === 'object' ? ctx.globalDb : null;
  const pool = new Map();

  typeof ctx.onProgress === 'function'
    && ctx.onProgress({
      level: 2,
      phase: 'external',
      message: 'Non trovato nei tuoi archivi. Interrogazione Open Food Facts e USDA in corso…',
    });

  if (signalAborted(ctx.signal)) return [];

  // Stesso motore della ricerca manuale: OFF locale + USDA, poi mergeAndRank.
  const offDb = ctx.offDb && typeof ctx.offDb === 'object' ? ctx.offDb : null;
  const offHits = await searchOffDb(name, offDb, [], {
    limit: Math.max(HEAVY_STEP2_RESULT_LIMIT, 12),
    signal: ctx.signal,
  });
  if (signalAborted(ctx.signal)) return [];

  let usdaHits = [];
  if (globalDb) {
    let hasGlobal = false;
    for (const _k in globalDb) {
      hasGlobal = true;
      break;
    }
    if (hasGlobal) {
      usdaHits = await searchGlobalDb(name, globalDb, [], {
        limit: Math.max(HEAVY_STEP2_RESULT_LIMIT, 12),
        signal: ctx.signal,
      });
    }
  }
  if (signalAborted(ctx.signal)) return [];

  const ranked = mergeAndRankSearchResults(name, [...offHits, ...usdaHits], 12);
  pushLexicalHits(pool, ranked, 'off', name);

  return filterAcceptableDisambiguationCandidates(name, sortCandidates([...pool.values()], name));
}

function signalAborted(signal) {
  return Boolean(signal?.aborted || (typeof signal?.isCancelled === 'function' && signal.isCancelled()));
}

/**
 * Pipeline a livelli: L1 Personale+Kentu → (solo se vuoto) L2 OFF/USDA.
 * Callback `onProgress` per feedback UI trasparente.
 *
 * @param {string} foodName
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   offDb?: object|null,
 *   signal?: AbortSignal,
 *   onProgress?: (info: { level: number, phase: string, message: string }) => void,
 *   skipExternal?: boolean,
 * }} ctx
 * @returns {Promise<object[]>}
 */
export async function collectMultiDbFoodCandidates(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return [];

  const level1 = annotateCandidatesMatchQuality(
    name,
    await collectLevel1LocalCandidates(name, ctx),
  );
  if (signalAborted(ctx.signal)) return level1;

  // Solo un match exact/prefix in L1 può evitare i cataloghi esterni.
  // Contains (piatto composto con la query come ingrediente) non basta.
  if (levelHasStrongMatch(level1)) {
    return sortCandidates(level1, name);
  }

  if (ctx.skipExternal === true) return sortCandidates(level1, name);

  const level2 = annotateCandidatesMatchQuality(
    name,
    await collectLevel2ExternalCandidates(name, ctx),
  );
  return sortCandidates([...level1, ...level2], name);
}

/**
 * Decide auto-accept vs disambiguazione.
 * I candidati sotto soglia non vengono mai proposti in UI.
 * @param {object[]} candidates
 * @param {string} [query]
 * @param {{ autoAcceptThreshold?: number }} [opts]
 * @returns {{
 *   needsDisambiguation: boolean,
 *   match: object|null,
 *   source: string|null,
 *   confidenceScore: number,
 *   candidates: object[],
 *   alternatives: object[],
 * }}
 */
export function decideMultiDbResolution(candidates = [], query = '', opts = {}) {
  const autoThreshold = Number.isFinite(Number(opts.autoAcceptThreshold))
    ? Number(opts.autoAcceptThreshold)
    : AUTO_ACCEPT_CONFIDENCE;
  const filtered = filterAcceptableDisambiguationCandidates(
    query,
    Array.isArray(candidates) ? candidates.filter((c) => c?.row) : [],
  );
  const topN = sortCandidates(filtered, query).slice(0, DISAMBIGUATION_CANDIDATE_LIMIT);
  const decision = decideFoodMatchResolution(topN, {
    autoAcceptThreshold: autoThreshold,
  });
  const top = topN[0] || null;

  const altMap = (c) => ({
    foodDbKey: c.fdcId || null,
    foodName: c.name,
    confidence: c.confidence,
    confidenceScore: c.confidenceScore,
    source: c.source,
    sourceBadge: c.sourceBadge,
    matchQuality: c.matchQuality || null,
    row: c.row,
  });

  if (!top || decision.needsDisambiguation) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: decision.confidenceScore || Number(top?.confidenceScore) || 0,
      matchQuality: decision.matchQuality || top?.matchQuality || null,
      decisionReason: decision.reason || null,
      candidates: topN,
      alternatives: topN.slice(1).map(altMap),
    };
  }

  return {
    needsDisambiguation: false,
    match: decision.match || top,
    source: (decision.match || top).source,
    confidenceScore: decision.confidenceScore,
    matchQuality: decision.matchQuality,
    decisionReason: decision.reason,
    candidates: topN,
    alternatives: topN.slice(1).map(altMap),
  };
}

/**
 * Risolve un candidato esatto dal dizionario alias utente (memoria semantica).
 * @param {string} foodName
 * @param {object} ctx
 * @returns {object|null}
 */
export function lookupFoodCandidateFromAlias(foodName, ctx = {}) {
  const aliases = ctx.userFoodAliases && typeof ctx.userFoodAliases === 'object'
    ? ctx.userFoodAliases
    : null;
  if (!aliases || Object.keys(aliases).length === 0) return null;

  const foodDbKey = lookupUserFoodAlias(foodName, aliases);
  if (!foodDbKey) return null;

  const catalogs = [
    { db: ctx.personalDb, source: 'personal' },
    { db: ctx.kentuItDb, source: 'kentu' },
    { db: ctx.globalDb, source: 'usda' },
    { db: ctx.offDb, source: 'off' },
  ];

  for (let i = 0; i < catalogs.length; i += 1) {
    const { db, source } = catalogs[i];
    if (!db || typeof db !== 'object' || !db[foodDbKey]) continue;
    const row = db[foodDbKey];
    const displayName = String(row.desc || row.name || foodName).trim();
    return buildCandidate({
      fdcId: foodDbKey,
      name: displayName,
      confidence: 'high',
      confidenceScore: 1,
      reason: 'Alias memorizzato',
      source,
      row,
      matchKind: 'exact',
    });
  }

  return null;
}

function candidateFromKnownFoodDbKey(foodDbKey, spokenName, ctx = {}) {
  const key = String(foodDbKey || '').trim();
  if (!key) return null;
  const catalogs = [
    { db: ctx.personalDb, source: 'personal' },
    { db: ctx.kentuItDb, source: 'kentu' },
    { db: ctx.globalDb, source: 'usda' },
    { db: ctx.offDb, source: 'off' },
  ];
  for (let i = 0; i < catalogs.length; i += 1) {
    const { db, source } = catalogs[i];
    if (!db || typeof db !== 'object' || !db[key]) continue;
    const row = db[key];
    const displayName = String(row.desc || row.name || spokenName).trim();
    return buildCandidate({
      fdcId: key,
      name: displayName,
      confidence: 'high',
      confidenceScore: 1,
      reason: 'Preferenza personale',
      source,
      row,
      query: spokenName,
      matchKind: 'exact',
      matchQuality: classifyFoodMatchQuality(displayName, spokenName),
    });
  }
  return null;
}

/**
 * Entry point a livelli: L1 locale; se vuoto e non deferito → L2 esterni.
 * @param {string} foodName
 * @param {object} ctx
 */
export async function resolveFoodAcrossDatabases(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: 0,
      candidates: [],
      alternatives: [],
      searchLevel: 1,
      needsExternalSearch: true,
    };
  }

  const aliasCandidate = lookupFoodCandidateFromAlias(name, ctx);
  if (aliasCandidate) {
    return {
      needsDisambiguation: false,
      match: aliasCandidate,
      source: aliasCandidate.source,
      confidenceScore: 1,
      candidates: [aliasCandidate],
      alternatives: [],
      searchLevel: 1,
      needsExternalSearch: false,
      fromAlias: true,
    };
  }

  // Tier 0 — catalogo caffetteria / colazione locale (prima di personale/CREA/USDA).
  const coffeeProduct = findCoffeeShopProductByName(name);
  if (coffeeProduct) {
    const coffeeCandidate = coffeeShopProductToResolverCandidate(coffeeProduct);
    if (coffeeCandidate) {
      return {
        needsDisambiguation: false,
        match: coffeeCandidate,
        source: 'coffee_shop',
        confidenceScore: 1,
        candidates: [coffeeCandidate],
        alternatives: [],
        searchLevel: 1,
        needsExternalSearch: false,
        fromCoffeeShop: true,
      };
    }
  }

  const preferredKey = String(ctx.preferredFoodDbKey || '').trim();
  if (preferredKey) {
    const preferredCandidate = candidateFromKnownFoodDbKey(preferredKey, name, ctx);
    if (preferredCandidate) {
      return {
        needsDisambiguation: false,
        match: preferredCandidate,
        source: preferredCandidate.source,
        confidenceScore: 1,
        candidates: [preferredCandidate],
        alternatives: [],
        searchLevel: 1,
        needsExternalSearch: false,
        fromPersonalPreference: true,
      };
    }
  }

  const preference = getUserFoodPreferenceContext(name, {
    personalDb: ctx.personalDb,
    personalFoods: ctx.personalFoods,
    userFoodAliases: ctx.userFoodAliases,
    userPortions: ctx.userPortions,
  });
  if (preference.decision === 'auto' && preference.foodDbKey) {
    const prefCandidate = candidateFromKnownFoodDbKey(preference.foodDbKey, name, ctx);
    // Preferenza personale auto solo se il nome è exact/prefix sulla query
    // (mai "ravioli…spinaci" per query "spinaci").
    if (prefCandidate && isStrongFoodMatchQuality(prefCandidate.matchQuality)) {
      return {
        needsDisambiguation: false,
        match: prefCandidate,
        source: prefCandidate.source,
        confidenceScore: 1,
        matchQuality: prefCandidate.matchQuality,
        candidates: [prefCandidate],
        alternatives: [],
        searchLevel: 1,
        needsExternalSearch: false,
        fromPersonalPreference: true,
      };
    }
  }
  if (preference.decision === 'ambiguous') {
    const mapped = (preference.candidates || [])
      .map((c) => candidateFromKnownFoodDbKey(c.foodDbKey, c.name || name, ctx))
      .filter(Boolean);
    if (mapped.length >= 2) {
      return {
        needsDisambiguation: true,
        match: null,
        source: null,
        confidenceScore: Number(mapped[0]?.confidenceScore) || 1,
        candidates: mapped,
        alternatives: mapped.slice(1).map((c) => ({
          foodDbKey: c.fdcId || null,
          foodName: c.name,
          confidence: c.confidence,
          confidenceScore: c.confidenceScore,
          source: c.source,
          row: c.row,
        })),
        searchLevel: 1,
        needsExternalSearch: false,
        fromPersonalPreference: true,
      };
    }
  }

  const level1 = annotateCandidatesMatchQuality(
    name,
    await collectLevel1LocalCandidates(name, ctx),
  );
  if (signalAborted(ctx.signal)) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: 0,
      candidates: [],
      alternatives: [],
      searchLevel: 1,
      needsExternalSearch: false,
      aborted: true,
    };
  }

  const decision1 = decideMultiDbResolution(level1, name, {
    autoAcceptThreshold: LEVEL1_STRONG_CONFIDENCE,
  });

  // Match exact/prefix auto-accept in L1 → stop senza cataloghi esterni.
  if (!decision1.needsDisambiguation && decision1.match
    && isStrongFoodMatchQuality(decision1.matchQuality || decision1.match.matchQuality)) {
    return { ...decision1, searchLevel: 1, needsExternalSearch: false };
  }

  // L1 con match forti ma ambigui (close race exact/prefix) → disambiguazione locale.
  if (levelHasStrongMatch(level1) && decision1.candidates.length > 0) {
    return { ...decision1, searchLevel: 1, needsExternalSearch: false };
  }

  // Nessun exact/prefix in L1: interroga i cataloghi prima di decidere
  // (anche se L1 ha contains tipo "ravioli…spinaci").
  if (ctx.deferExternalSearch === true || ctx.skipExternal === true) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: decision1.confidenceScore || 0,
      matchQuality: decision1.matchQuality || null,
      candidates: decision1.candidates || [],
      alternatives: decision1.alternatives || [],
      searchLevel: 1,
      needsExternalSearch: ctx.skipExternal !== true,
    };
  }

  const level2 = annotateCandidatesMatchQuality(
    name,
    await collectLevel2ExternalCandidates(name, ctx),
  );
  const merged = sortCandidates([...level1, ...level2], name);
  const decision2 = decideMultiDbResolution(merged, name, {
    autoAcceptThreshold: AUTO_ACCEPT_CONFIDENCE,
  });
  return {
    ...decision2,
    searchLevel: level2.length > 0 ? 2 : 1,
    needsExternalSearch: false,
  };
}

