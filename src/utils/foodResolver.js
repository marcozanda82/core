import { searchFoodsDetailed } from '../foodSearch.js';
import { estraiDatiFoodDb } from '../features/salaComandi/engines/foodDataEngine.js';

const DEFAULT_RESOLVE_LIMIT = 8;
const MIN_ALTERNATIVES_FOR_UI = 2;

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
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
  const query = String(rawQuery || '').trim();
  if (!query || !foodDb || typeof foodDb !== 'object') {
    return { rawQuery: query, bestMatch: null, alternatives: [] };
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_RESOLVE_LIMIT;

  const hits = searchFoodsDetailed(foodDb, query, {
    limit,
    includeUserHistory: options.includeUserHistory !== false,
  });

  const alternatives = hits.map((hit) => ({
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

  const portion = estraiDatiFoodDb({
    nome: match.foodName,
    qta: g,
    pastoType: mealType,
    preferredDbKey: match.foodDbKey,
    foodDb,
    fullHistory,
  });

  return {
    foodDbKey: portion.foodDbKey ?? match.foodDbKey,
    foodName: String(portion.desc || portion.name || match.foodName).trim(),
    grams: g,
    kcal: roundMacro(portion.kcal ?? portion.cal),
    pro: roundMacro(portion.prot),
    carbo: roundMacro(portion.carb),
    fat: roundMacro(portion.fatTotal ?? portion.fat),
    matchScore: Number(match.matchScore) || 0,
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

/**
 * Risolve un item pasto (nome grezzo + grammi) con bestMatch e alternative dal DB.
 *
 * @param {string} rawName
 * @param {number} grams
 * @param {{ foodDb?: object, fullHistory?: object, mealType?: string, preferredDbKey?: string }} context
 */
export function resolveFoodItemForProposal(rawName, grams, context = {}) {
  const query = String(rawName || '').trim();
  const g = Math.max(1, Math.round(Number(grams) || 0));
  if (!query || !Number.isFinite(g) || g <= 0) return null;

  const foodDb = context.foodDb || {};
  const resolution = resolveFoodEntity(query, foodDb, context);
  const orderedCandidates = orderCandidates(
    resolution.alternatives,
    context.preferredDbKey,
  );

  const portionAlternatives = orderedCandidates
    .map((candidate) => buildPortionFromDbMatch(candidate, g, context))
    .filter(Boolean);

  let best = portionAlternatives[0] || null;

  if (!best) {
    best = buildPortionFromDbMatch(
      { foodDbKey: context.preferredDbKey || query, foodName: query, matchScore: 0 },
      g,
      context,
    );
  }

  if (!best) return null;

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
