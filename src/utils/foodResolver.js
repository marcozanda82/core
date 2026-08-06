import { searchFoodsDetailed } from '../foodSearch.js';
import {
  estraiDatiFoodDb,
  FOOD_RESOLUTION_STATUS,
} from '../features/salaComandi/engines/foodDataEngine.js';

const DEFAULT_RESOLVE_LIMIT = 8;
const MIN_ALTERNATIVES_FOR_UI = 2;
/** Sotto questa soglia (0–100) il match non è affidabile → NEEDS_RESOLUTION. */
const MIN_ACCEPTABLE_STRICT_SCORE = 50;

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/**
 * Pulisce query grezza LLM prima della ricerca DB.
 * Es: "e 160 g di pane integrale" → "pane integrale"
 * Il codice NON sporca le stringhe: se arrivano sporche e perche l'LLM le ha lasciate cosi.
 *
 * @param {string} rawQuery
 * @returns {{ cleanQuery: string, gramsFromQuery: number | null }}
 */
export function cleanFoodQueryForDbSearch(rawQuery) {
  let name = String(rawQuery || '').trim();
  if (!name) return { cleanQuery: '', gramsFromQuery: null };

  const gramsMatch = name.match(/(\d+[.,]?\d*)\s*(?:g|gr|grammi)\b/i);
  const gramsFromQuery = gramsMatch
    ? Math.round(Number(String(gramsMatch[1]).replace(',', '.')))
    : null;

  name = name
    .replace(/^(?:e|ed|con|più|piu|anche|oppure)\s+/i, '')
    .replace(/\b\d+[.,]?\d*\s*(?:g|gr|grammi|kg|ml)\b/gi, ' ')
    .replace(/\(\s*\d+[.,]?\d*\s*(?:g|gr|grammi)?\s*\)/gi, ' ')
    .replace(/\b\d+[.,]?\d*\b/g, ' ')
    .replace(/^(?:di|del|della|dello|dei|degli|delle|un|una|uno)\s+/i, '')
    .replace(/\s+(?:di|del|della|dello|dei|degli|delle)\s+/gi, ' ')
    .replace(/^(?:e|ed|con|più|piu)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanQuery: name,
    gramsFromQuery: Number.isFinite(gramsFromQuery) && gramsFromQuery > 0 ? gramsFromQuery : null,
  };
}

/**
 * Ricerca approssimativa nel DB alimenti locale.
 *
 * @param {string} rawQuery - Testo grezzo (es. "merluzzo gratinato")
 * @param {object} foodDb
 * @param {{ limit?: number, includeUserHistory?: boolean }} [options]
 * @returns {{
 *   rawQuery: string,
 *   bestMatch: { foodDbKey: string, foodName: string, matchScore: number } | null,
 *   alternatives: Array<{ foodDbKey: string, foodName: string, matchScore: number, strictScore: number }>,
 * }}
 */
export function resolveFoodEntity(rawQuery, foodDb, options = {}) {
  const { cleanQuery } = cleanFoodQueryForDbSearch(rawQuery);
  const query = cleanQuery || String(rawQuery || '').trim();
  if (!query || !foodDb || typeof foodDb !== 'object') {
    return { rawQuery: String(rawQuery || '').trim(), bestMatch: null, alternatives: [] };
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_RESOLVE_LIMIT;

  const hits = searchFoodsDetailed(foodDb, query, {
    limit,
    includeUserHistory: options.includeUserHistory !== false,
  });

  const alternatives = hits
    .filter((hit) => Number(hit.strictScore) >= MIN_ACCEPTABLE_STRICT_SCORE)
    .map((hit) => ({
      foodDbKey: String(hit.id),
      foodName: String(hit.name).trim(),
      matchScore: Number(hit.matchScore) || 0,
      strictScore: Number(hit.strictScore) || 0,
    }));

  return {
    rawQuery: query,
    bestMatch: alternatives[0] || null,
    alternatives,
  };
}

/**
 * Calcola porzione e macro da una corrispondenza DB.
 *
 * @param {{ foodDbKey: string, foodName: string, matchScore?: number }} match
 * @param {number} grams
 * @param {{ foodDb?: object, fullHistory?: object, mealType?: string }} context
 */
export function buildPortionFromDbMatch(match, grams, context = {}) {
  if (!match) return null;

  const foodDb = context.foodDb || {};
  const fullHistory = context.fullHistory || {};
  const mealType = context.mealType || 'pranzo';
  const g = Math.max(1, Math.round(Number(grams) || 0));

  if (match.foodDbKey != null && foodDb[match.foodDbKey] == null) {
    return null;
  }

  const portion = estraiDatiFoodDb({
    nome: match.foodName,
    qta: g,
    pastoType: mealType,
    preferredDbKey: match.foodDbKey,
    foodDb,
    fullHistory,
  });

  if (portion?.status === FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION) {
    return null;
  }

  return {
    foodDbKey: portion.foodDbKey ?? match.foodDbKey,
    foodName: String(portion.desc || portion.name || match.foodName).trim(),
    grams: g,
    kcal: roundMacro(portion.kcal ?? portion.cal),
    pro: roundMacro(portion.prot),
    carbo: roundMacro(portion.carb),
    fat: roundMacro(portion.fatTotal ?? portion.fat),
    matchScore: Number(match.matchScore) || 0,
    status: FOOD_RESOLUTION_STATUS.RESOLVED,
  };
}

function orderCandidates(candidates, preferredDbKey) {
  if (!preferredDbKey || candidates.length === 0) return candidates;
  const key = String(preferredDbKey);
  const preferredIdx = candidates.findIndex((c) => String(c.foodDbKey) === key);
  if (preferredIdx <= 0) return candidates;
  const preferred = candidates[preferredIdx];
  const rest = candidates.filter((_, i) => i !== preferredIdx);
  return [preferred, ...rest];
}

function buildUnresolvedPortion(query, grams) {
  const g = Math.max(1, Math.round(Number(grams) || 0));
  return {
    foodDbKey: null,
    foodName: query,
    grams: g,
    kcal: 0,
    pro: 0,
    carbo: 0,
    fat: 0,
    matchScore: 0,
    status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    rawQuery: query,
    alternatives: [],
  };
}

/**
 * Risolve un item pasto (nome grezzo + grammi) con bestMatch e alternative dal DB.
 * Nessun fallback a stime inventate: senza match → NEEDS_RESOLUTION + macro a 0.
 *
 * @param {string} rawName
 * @param {number} grams
 * @param {{ foodDb?: object, fullHistory?: object, mealType?: string, preferredDbKey?: string }} context
 */
export function resolveFoodItemForProposal(rawName, grams, context = {}) {
  const { cleanQuery, gramsFromQuery } = cleanFoodQueryForDbSearch(rawName);
  const query = cleanQuery || String(rawName || '').trim();
  const g = Math.max(1, Math.round(Number(grams) || gramsFromQuery || 0));
  if (!query || !Number.isFinite(g) || g <= 0) return null;

  if (cleanQuery && cleanQuery !== String(rawName || '').trim()) {
    console.log('🧹 DEBUG - foodResolver clean query:', {
      raw: String(rawName || '').trim(),
      clean: cleanQuery,
      gramsIn: grams,
      gramsFromQuery,
      gramsUsed: g,
    });
  }

  const foodDb = context.foodDb || {};

  // preferredDbKey valido nel DB → usa direttamente senza search.
  if (context.preferredDbKey != null && foodDb[context.preferredDbKey] != null) {
    const preferredPortion = buildPortionFromDbMatch(
      {
        foodDbKey: context.preferredDbKey,
        foodName: foodDb[context.preferredDbKey]?.desc
          || foodDb[context.preferredDbKey]?.name
          || query,
        matchScore: 1,
      },
      g,
      context,
    );
    if (preferredPortion) {
      return {
        ...preferredPortion,
        rawQuery: query,
        alternatives: [],
      };
    }
  }

  const resolution = resolveFoodEntity(query, foodDb, context);
  const orderedCandidates = orderCandidates(
    resolution.alternatives,
    context.preferredDbKey,
  );

  const portionAlternatives = orderedCandidates
    .map((candidate) => buildPortionFromDbMatch(candidate, g, context))
    .filter(Boolean);

  const best = portionAlternatives[0] || null;
  if (!best) {
    return buildUnresolvedPortion(query, g);
  }

  return {
    ...best,
    rawQuery: query,
    alternatives: portionAlternatives.length >= MIN_ALTERNATIVES_FOR_UI
      ? portionAlternatives
      : [],
  };
}

/**
 * @param {Array<object>} rawItems
 * @param {{ foodDb?: object, fullHistory?: object, mealType?: string }} context
 */
export function resolveMealProposalItems(rawItems, context = {}) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item) => {
      const rawName = String(item?.rawQuery || item?.foodName || item?.name || '').trim();
      const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
      if (!rawName || !Number.isFinite(grams) || grams <= 0) return null;

      return resolveFoodItemForProposal(rawName, grams, {
        ...context,
        preferredDbKey: item?.foodDbKey ?? context.preferredDbKey ?? null,
      });
    })
    .filter(Boolean);
}

export function sumProposalItemMacros(items) {
  return (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal) || 0),
      pro: acc.pro + (Number(item.pro) || 0),
      carbo: acc.carbo + (Number(item.carbo) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

export { FOOD_RESOLUTION_STATUS };
