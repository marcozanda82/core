/**
 * Pipeline gerarchica multi-database per McDrive / Meal Draft:
 * Personale → Kentu IT/CREA → USDA (globale) → Open Food Facts.
 * Auto-accetta solo con confidenza ≥ 0.85; altrimenti disambiguazione.
 */

import {
  findExactLiteralFoodInDb,
  findSemanticKentuMatches,
} from '../../mealBuilder/utils/SemanticMatchmaker.js';
import {
  computeRelevanceScore,
  runUnifiedFoodSearch,
  searchGlobalDb,
  searchKentuItDb,
  searchOffDb,
  searchPersonalDb,
} from '../../mealBuilder/hooks/useUniversalSearchEngine.js';

export const AUTO_ACCEPT_CONFIDENCE = 0.85;
export const DISAMBIGUATION_CANDIDATE_LIMIT = 4;

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
  const labelScore = confidenceLabelToScore(semanticMatch.confidence);
  // Exact / high semantic: boost slightly for personal priority already encoded in source sort.
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

/**
 * Raccoglie candidati da tutti i DB in ordine gerarchico.
 * @param {string} foodName
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   offDb?: object|null,
 *   signal?: AbortSignal,
 * }} ctx
 * @returns {Promise<object[]>}
 */
export async function collectMultiDbFoodCandidates(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return [];

  const personalDb = ctx.personalDb && typeof ctx.personalDb === 'object' ? ctx.personalDb : null;
  const kentuItDb = ctx.kentuItDb && typeof ctx.kentuItDb === 'object' ? ctx.kentuItDb : null;
  const globalDb = ctx.globalDb && typeof ctx.globalDb === 'object' ? ctx.globalDb : null;
  const offDb = ctx.offDb && typeof ctx.offDb === 'object' ? ctx.offDb : null;
  const signal = ctx.signal;
  const pool = new Map();

  // 1) Match letterali esatti — priorità assoluta per layer.
  const exactLayers = [
    { db: personalDb, source: 'personal' },
    { db: kentuItDb, source: 'kentu' },
    { db: globalDb, source: 'usda' },
    { db: offDb, source: 'off' },
  ];
  for (const layer of exactLayers) {
    if (!layer.db || Object.keys(layer.db).length === 0) continue;
    const exact = findExactLiteralFoodInDb(name, layer.db);
    if (exact) {
      mergeCandidatePool(pool, buildCandidate({
        ...exact,
        confidence: 'high',
        confidenceScore: 1,
        reason: exact.reason || 'Match letterale esatto',
        source: layer.source,
      }));
    }
  }

  // 2) Personale — semantico + lessicale
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
      console.warn('[multiDbFoodResolver] personal semantic failed', error);
    }
    pushLexicalHits(pool, searchPersonalDb(personalDb, name), 'personal');
  }

  // 3) Kentu IT / CREA
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
      console.warn('[multiDbFoodResolver] kentu semantic failed', error);
    }
    pushLexicalHits(pool, searchKentuItDb(name, kentuItDb, []), 'kentu');
  }

  // 4) USDA / globale
  if (globalDb && Object.keys(globalDb).length > 0) {
    pushLexicalHits(pool, searchGlobalDb(name, globalDb, []), 'usda');
  }

  // 5) Open Food Facts
  if (offDb && Object.keys(offDb).length > 0) {
    pushLexicalHits(pool, searchOffDb(name, offDb, []), 'off');
  }

  // Unificato come safety net (dedupe già gestito nel pool)
  const unified = runUnifiedFoodSearch(name, {
    personalDb,
    kentuItDb,
    globalDb,
    offDb,
    searchGlobal: true,
    cap: 12,
  });
  (Array.isArray(unified) ? unified : []).forEach((hit) => {
    const c = searchResultToResolverCandidate(hit);
    if (c) mergeCandidatePool(pool, c);
  });

  return sortCandidates([...pool.values()]);
}

/**
 * Decide auto-accept vs disambiguazione.
 * @param {object[]} candidates
 * @returns {{
 *   needsDisambiguation: boolean,
 *   match: object|null,
 *   source: string|null,
 *   confidenceScore: number,
 *   candidates: object[],
 *   alternatives: object[],
 * }}
 */
export function decideMultiDbResolution(candidates = []) {
  const ranked = sortCandidates(Array.isArray(candidates) ? candidates.filter((c) => c?.row) : []);
  const topN = ranked.slice(0, DISAMBIGUATION_CANDIDATE_LIMIT);
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
    && secondScore >= AUTO_ACCEPT_CONFIDENCE - 0.05
    && (topScore - secondScore) < 0.08,
  );
  const needsDisambiguation = topScore < AUTO_ACCEPT_CONFIDENCE || closeRace;

  if (needsDisambiguation) {
    return {
      needsDisambiguation: true,
      match: null,
      source: null,
      confidenceScore: topScore,
      candidates: topN,
      alternatives: topN.slice(1).map((c) => ({
        foodDbKey: c.fdcId || null,
        foodName: c.name,
        confidence: c.confidence,
        confidenceScore: c.confidenceScore,
        source: c.source,
        sourceBadge: c.sourceBadge,
        row: c.row,
      })),
    };
  }

  return {
    needsDisambiguation: false,
    match: top,
    source: top.source,
    confidenceScore: topScore,
    candidates: topN,
    alternatives: topN.slice(1).map((c) => ({
      foodDbKey: c.fdcId || null,
      foodName: c.name,
      confidence: c.confidence,
      confidenceScore: c.confidenceScore,
      source: c.source,
      sourceBadge: c.sourceBadge,
      row: c.row,
    })),
  };
}

/**
 * Entry point: ricerca multi-DB + decisione confidenza.
 * @param {string} foodName
 * @param {object} ctx
 */
export async function resolveFoodAcrossDatabases(foodName, ctx = {}) {
  const candidates = await collectMultiDbFoodCandidates(foodName, ctx);
  return decideMultiDbResolution(candidates);
}
