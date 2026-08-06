import { searchFoodsDetailed } from '../foodSearch.js';
import {
  estraiDatiFoodDb,
  findFoodDbMatchCascading,
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

function resolveCatalogDbs(context = {}) {
  return {
    personalDb: context.foodDb || context.personalDb || {},
    kentuItDb: context.kentuItDb || context.kentuItDatabase || null,
    globalDb: context.globalDb || context.globalFoodDatabase || context.masterDb || null,
  };
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

function hitsFromDb(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== 'object' || Object.keys(foodDb).length === 0) return [];
  return searchFoodsDetailed(foodDb, query, {
    limit: options.limit || DEFAULT_RESOLVE_LIMIT,
    includeUserHistory: options.includeUserHistory === true,
  })
    .filter((hit) => Number(hit.strictScore) >= MIN_ACCEPTABLE_STRICT_SCORE)
    .map((hit) => ({
      foodDbKey: String(hit.id),
      foodName: String(hit.name).trim(),
      matchScore: Number(hit.matchScore) || 0,
      strictScore: Number(hit.strictScore) || 0,
      dbSource: options.dbSource || 'personal',
      _lookupDb: foodDb,
    }));
}

/**
 * Ricerca a cascata (stesso ordine della ricerca manuale UniversalSearch):
 * personale → Kentu IT → Kentu globale 🌐.
 *
 * @param {string} rawQuery
 * @param {object} foodDb — DB personale (trackerFoodDatabase)
 * @param {{ limit?: number, includeUserHistory?: boolean, kentuItDb?: object, globalDb?: object }} [options]
 */
export function resolveFoodEntity(rawQuery, foodDb, options = {}) {
  const { cleanQuery } = cleanFoodQueryForDbSearch(rawQuery);
  const query = cleanQuery || String(rawQuery || '').trim();
  const catalogs = resolveCatalogDbs({
    foodDb,
    kentuItDb: options.kentuItDb,
    globalDb: options.globalDb,
    kentuItDatabase: options.kentuItDatabase,
    globalFoodDatabase: options.globalFoodDatabase,
    masterDb: options.masterDb,
  });

  if (!query) {
    return { rawQuery: String(rawQuery || '').trim(), bestMatch: null, alternatives: [] };
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_RESOLVE_LIMIT;

  // Cascata: personal first, then Kentu catalogs (same engines as manual search).
  const personalHits = hitsFromDb(catalogs.personalDb, query, {
    limit,
    includeUserHistory: options.includeUserHistory !== false,
    dbSource: 'personal',
  });

  let alternatives = personalHits;
  if (alternatives.length === 0) {
    const kentuItHits = hitsFromDb(catalogs.kentuItDb, query, {
      limit,
      includeUserHistory: false,
      dbSource: 'kentu_it',
    });
    alternatives = kentuItHits;
  }
  if (alternatives.length === 0) {
    const globalHits = hitsFromDb(catalogs.globalDb, query, {
      limit,
      includeUserHistory: false,
      dbSource: 'global',
    });
    alternatives = globalHits;
  }

  return {
    rawQuery: query,
    bestMatch: alternatives[0] || null,
    alternatives,
  };
}

/**
 * Calcola porzione e macro da una corrispondenza DB.
 *
 * @param {{ foodDbKey: string, foodName: string, matchScore?: number, _lookupDb?: object, dbSource?: string }} match
 * @param {number} grams
 * @param {{ foodDb?: object, kentuItDb?: object, globalDb?: object, fullHistory?: object, mealType?: string }} context
 */
export function buildPortionFromDbMatch(match, grams, context = {}) {
  if (!match) return null;

  const catalogs = resolveCatalogDbs(context);
  const lookupDb = match._lookupDb
    || (match.foodDbKey != null && catalogs.personalDb?.[match.foodDbKey] != null
      ? catalogs.personalDb
      : null)
    || (match.foodDbKey != null && catalogs.kentuItDb?.[match.foodDbKey] != null
      ? catalogs.kentuItDb
      : null)
    || (match.foodDbKey != null && catalogs.globalDb?.[match.foodDbKey] != null
      ? catalogs.globalDb
      : null)
    || catalogs.personalDb
    || {};

  const fullHistory = context.fullHistory || {};
  const mealType = context.mealType || 'pranzo';
  const g = Math.max(1, Math.round(Number(grams) || 0));

  if (match.foodDbKey != null && lookupDb[match.foodDbKey] == null) {
    return null;
  }

  const portion = estraiDatiFoodDb({
    nome: match.foodName,
    qta: g,
    pastoType: mealType,
    preferredDbKey: match.foodDbKey,
    foodDb: lookupDb,
    // Se preferred è già nel lookupDb, la cascata interna non serve; resta come safety net.
    kentuItDb: lookupDb === catalogs.personalDb ? catalogs.kentuItDb : null,
    globalDb: lookupDb === catalogs.personalDb ? catalogs.globalDb : null,
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
    dbSource: portion.dbSource || match.dbSource || null,
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
 * Risolve un item pasto (nome grezzo + grammi) con cascata personale → Kentu IT → globale.
 * Nessun fallback a stime inventate: senza match → NEEDS_RESOLUTION + macro a 0.
 *
 * @param {string} rawName
 * @param {number} grams
 * @param {{ foodDb?: object, kentuItDb?: object, globalDb?: object, fullHistory?: object, mealType?: string, preferredDbKey?: string }} context
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

  const catalogs = resolveCatalogDbs(context);

  // preferredDbKey in qualsiasi layer → usa direttamente.
  if (context.preferredDbKey != null) {
    const preferredMatch = findFoodDbMatchCascading({
      ...catalogs,
      nome: query,
      preferredDbKey: context.preferredDbKey,
    });
    if (preferredMatch) {
      const preferredPortion = buildPortionFromDbMatch(
        {
          foodDbKey: preferredMatch.key,
          foodName: preferredMatch.foodDb[preferredMatch.key]?.desc
            || preferredMatch.foodDb[preferredMatch.key]?.name
            || query,
          matchScore: 1,
          dbSource: preferredMatch.source,
          _lookupDb: preferredMatch.foodDb,
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
  }

  // Cascata esatta/forte (stesso findFoodDbKey della ricerca manuale).
  const cascadeMatch = findFoodDbMatchCascading({
    ...catalogs,
    nome: query,
    preferredDbKey: null,
  });
  if (cascadeMatch) {
    const portion = buildPortionFromDbMatch(
      {
        foodDbKey: cascadeMatch.key,
        foodName: cascadeMatch.foodDb[cascadeMatch.key]?.desc
          || cascadeMatch.foodDb[cascadeMatch.key]?.name
          || query,
        matchScore: 1,
        dbSource: cascadeMatch.source,
        _lookupDb: cascadeMatch.foodDb,
      },
      g,
      context,
    );
    if (portion) {
      const resolution = resolveFoodEntity(query, catalogs.personalDb, {
        ...context,
        kentuItDb: catalogs.kentuItDb,
        globalDb: catalogs.globalDb,
        includeUserHistory: false,
      });
      const orderedCandidates = orderCandidates(
        resolution.alternatives,
        cascadeMatch.key,
      );
      const portionAlternatives = orderedCandidates
        .map((candidate) => buildPortionFromDbMatch(candidate, g, context))
        .filter(Boolean);

      return {
        ...portion,
        rawQuery: query,
        alternatives: portionAlternatives.length >= MIN_ALTERNATIVES_FOR_UI
          ? portionAlternatives
          : [],
      };
    }
  }

  return buildUnresolvedPortion(query, g);
}

/**
 * @param {Array<object>} rawItems
 * @param {{ foodDb?: object, kentuItDb?: object, globalDb?: object, fullHistory?: object, mealType?: string }} context
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
