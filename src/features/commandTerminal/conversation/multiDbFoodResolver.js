/**
 * Pipeline a livelli multi-database per McDrive / Meal Draft:
 * Livello 1 — Personale + Kentu ITA (match ≥80% → subito).
 * Livello 2 — OFF / USDA solo se L1 vuoto, con feedback UI + Interrompi.
 * Filtro rigido: niente candidati <50% o senza legame lessicale.
 */

import { normalizeSearchText } from '../../../foodSearch.js';
import {
  findExactLiteralFoodInDb,
  findFastLexicalFoodMatches,
  findSemanticKentuMatches,
} from '../../mealBuilder/utils/SemanticMatchmaker.js';
import {
  computeRelevanceScore,
  searchGlobalDb,
  searchKentuItDb,
  searchOffDb,
  searchPersonalDb,
} from '../../mealBuilder/hooks/useUniversalSearchEngine.js';

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
  personal: { key: 'personal', label: 'Personale', short: '[Personale]' },
  kentu: { key: 'kentu', label: 'CREA', short: '[CREA]' },
  kentu_it: { key: 'kentu_it', label: 'CREA', short: '[CREA]' },
  usda: { key: 'usda', label: 'USDA', short: '[USDA]' },
  global: { key: 'global', label: 'USDA', short: '[USDA]' },
  master: { key: 'master', label: 'USDA', short: '[USDA]' },
  off: { key: 'off', label: 'OFF', short: '[OFF]' },
});

const SOURCE_PRIORITY = Object.freeze({
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
    ...(partial.matchKind ? { matchKind: partial.matchKind } : {}),
  };
}

function mergeCandidatePool(pool, next) {
  if (!next?.row || !next?.name) return;
  const key = candidateIdentity(next);
  const existing = pool.get(key);
  if (!existing || next.confidenceScore > existing.confidenceScore) {
    pool.set(key, next);
  }
}

function sortCandidates(list) {
  return [...list].sort((a, b) => {
    const scoreDiff = (Number(b.confidenceScore) || 0) - (Number(a.confidenceScore) || 0);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9);
  });
}

/**
 * @param {object} searchResult
 * @param {string} fallbackSource
 * @returns {object|null}
 */
export function searchResultToResolverCandidate(searchResult, fallbackSource = 'kentu') {
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

  const relevance = Number(
    searchResult.rankingScore
    ?? searchResult.matchScore
    ?? searchResult.textScore
    ?? computeRelevanceScore(searchResult, name),
  ) || 0;

  return buildCandidate({
    fdcId: String(searchResult.key || searchResult.id || searchResult.fdcId || row.id || '').trim() || null,
    name,
    confidenceScore: relevanceScoreToConfidence(relevance),
    reason: `Corrispondenza lessicale (${Math.round(relevance)})`,
    source,
    row: {
      ...row,
      desc: row.desc || name,
      name: row.name || name,
    },
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

function pushLexicalHits(pool, hits, source) {
  (Array.isArray(hits) ? hits : []).slice(0, 6).forEach((hit) => {
    const candidate = searchResultToResolverCandidate(hit, source);
    if (candidate) mergeCandidatePool(pool, candidate);
  });
}

function pushFastHits(pool, name, db, source) {
  if (!db || Object.keys(db).length === 0) return;
  const exact = findExactLiteralFoodInDb(name, db);
  if (exact) {
    mergeCandidatePool(pool, buildCandidate({
      ...exact,
      confidence: 'high',
      confidenceScore: 1,
      reason: exact.reason || 'Match letterale esatto',
      source,
      matchKind: 'exact',
    }));
  }
  findFastLexicalFoodMatches(name, db, { limit: 4 }).forEach((hit) => {
    const score = hit.matchKind === 'exact'
      ? 1
      : hit.matchKind === 'whole_token'
        ? 0.96
        : 0.92;
    mergeCandidatePool(pool, buildCandidate({
      fdcId: hit.fdcId,
      name: hit.name,
      confidence: 'high',
      confidenceScore: score,
      reason: hit.reason,
      source,
      row: hit.row,
      matchKind: hit.matchKind,
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

  let ranked = sortCandidates([...pool.values()]);
  const finalize = (list) => filterAcceptableDisambiguationCandidates(name, list);

  if (
    ranked[0]
    && Number(ranked[0].confidenceScore) >= LEVEL1_STRONG_CONFIDENCE
  ) {
    return finalize(ranked);
  }

  if (personalDb && Object.keys(personalDb).length > 0) {
    pushLexicalHits(pool, searchPersonalDb(personalDb, name).slice(0, 4), 'personal');
  }
  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    pushLexicalHits(
      pool,
      (await searchKentuItDb(name, kentuItDb, [], { limit: HEAVY_STEP2_RESULT_LIMIT, signal: ctx.signal })).slice(0, 4),
      'kentu',
    );
  }

  ranked = sortCandidates([...pool.values()]);
  if (
    ranked[0]
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

  return finalize(sortCandidates([...pool.values()]));
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

  pushLexicalHits(
    pool,
    await searchOffDb(name, null, [], {
      limit: HEAVY_STEP2_RESULT_LIMIT,
      signal: ctx.signal,
    }),
    'off',
  );
  if (signalAborted(ctx.signal)) return [];

  if (globalDb && Object.keys(globalDb).length > 0) {
    pushLexicalHits(
      pool,
      await searchGlobalDb(name, globalDb, [], {
        limit: HEAVY_STEP2_RESULT_LIMIT,
        signal: ctx.signal,
      }),
      'usda',
    );
  }

  return filterAcceptableDisambiguationCandidates(name, sortCandidates([...pool.values()]));
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

  const level1 = await collectLevel1LocalCandidates(name, ctx);
  if (signalAborted(ctx.signal)) return level1;

  // Match forti o comunque accettabili in L1 → non mischiare cataloghi esterni.
  if (level1.length > 0) return level1;

  if (ctx.skipExternal === true) return [];

  return collectLevel2ExternalCandidates(name, ctx);
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
  const topN = filtered.slice(0, DISAMBIGUATION_CANDIDATE_LIMIT);
  const top = topN[0] || null;
  const second = topN[1] || null;

  if (!top) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: 0,
      candidates: [],
      alternatives: [],
    };
  }

  const topScore = Number(top.confidenceScore) || 0;
  const secondScore = Number(second?.confidenceScore) || 0;
  const closeRace = Boolean(
    second
    && topScore < 0.98
    && secondScore >= autoThreshold - 0.05
    && (topScore - secondScore) < 0.08,
  );
  const needsDisambiguation = topScore < autoThreshold || closeRace;

  const altMap = (c) => ({
    foodDbKey: c.fdcId || null,
    foodName: c.name,
    confidence: c.confidence,
    confidenceScore: c.confidenceScore,
    source: c.source,
    sourceBadge: c.sourceBadge,
    row: c.row,
  });

  if (needsDisambiguation) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: topScore,
      candidates: topN,
      alternatives: topN.slice(1).map(altMap),
    };
  }

  return {
    needsDisambiguation: false,
    match: top,
    source: top.source,
    confidenceScore: topScore,
    candidates: topN,
    alternatives: topN.slice(1).map(altMap),
  };
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

  const level1 = await collectLevel1LocalCandidates(name, ctx);
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

  // Match forte L1 (≥80%) → restituisci subito, senza cataloghi esterni.
  if (!decision1.needsDisambiguation && decision1.match) {
    return { ...decision1, searchLevel: 1, needsExternalSearch: false };
  }

  // Candidati L1 accettabili ma ambigui → disambiguazione locale, stop (niente OFF/USDA).
  if (decision1.candidates.length > 0) {
    return { ...decision1, searchLevel: 1, needsExternalSearch: false };
  }

  // L1 vuoto: deferisci L2 alla UI (feedback + Interrompi) oppure esegui subito.
  if (ctx.deferExternalSearch === true || ctx.skipExternal === true) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: 0,
      candidates: [],
      alternatives: [],
      searchLevel: 1,
      needsExternalSearch: ctx.skipExternal !== true,
    };
  }

  const level2 = await collectLevel2ExternalCandidates(name, ctx);
  const decision2 = decideMultiDbResolution(level2, name, {
    autoAcceptThreshold: AUTO_ACCEPT_CONFIDENCE,
  });
  return { ...decision2, searchLevel: 2, needsExternalSearch: false };
}

