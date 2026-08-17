/**
 * Pipeline post-LLM per alimenti nuovi da chat testuale.
 * Caso A: macro forniti dall'utente → save DB personale → RESOLVED.
 * Caso B: match esatto/forte nel DB personale/Kentu → auto-resolve (niente modale).
 * Caso C: senza macro e senza match → pendingUsdaEnrichment (Fase 3 UI).
 */

import {
  buildLearnedFoodEntryPer100,
  persistLearnedFoodToDatabase,
  resolveLearnedPortionAfterSave,
} from '../../../services/userFoodLearning.js';
import {
  EXACT_DB_MATCH_STRICT_SCORE,
  resolveFoodItemForProposal,
  tryExactDbMatchFastPath,
} from '../../../utils/foodResolver.js';
import { FOOD_RESOLUTION_STATUS } from '../../../features/salaComandi/engines/foodDataEngine.js';
import { buildChatFoodFromUsdaRow } from '../../mealBuilder/utils/SemanticMatchmaker.js';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isChatNewFoodCandidate(item) {
  if (!item || typeof item !== 'object') return false;
  // Già risolto in buildMealLogProposal / auto-resolve: non aprire modale enrichment.
  if (
    String(item.status || '') === FOOD_RESOLUTION_STATUS.RESOLVED
    && item.foodDbKey != null
    && String(item.foodDbKey).trim() !== ''
  ) {
    return false;
  }
  if (item.isNewFood === true) return true;
  return String(item.status || '') === FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION;
}

/**
 * @param {unknown} macros
 * @returns {boolean}
 */
function hasActionableUserProvidedMacros(macros) {
  if (!macros || typeof macros !== 'object') return false;
  const kcal = Number(macros.kcal);
  return Number.isFinite(kcal) && kcal > 0;
}

/**
 * @param {object} item
 * @returns {object}
 */
function markPendingUsdaEnrichment(item) {
  return {
    ...item,
    pendingUsdaEnrichment: true,
    status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    resolutionSource: 'pending_usda_enrichment',
  };
}

/**
 * Auto-resolve da DB personale/Kentu (stessa cascata della ricerca manuale).
 * Evita modale «Non conosco X» quando X è già nel trackerFoodDatabase.
 *
 * @param {object} item
 * @param {object} context
 * @returns {object | null}
 */
function tryAutoResolveFromDb(item, context = {}) {
  const foodName = String(item?.foodName || item?.name || item?.spokenFoodName || '').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams) || 0));
  if (!foodName || !Number.isFinite(grams) || grams <= 0) return null;

  const resolveCtx = {
    foodDb: context.foodDb,
    personalDb: context.foodDb,
    kentuItDb: context.kentuItDb,
    globalDb: context.globalDb,
    fullHistory: context.fullHistory,
    mealType: context.mealType,
    preferredDbKey: item?.foodDbKey ?? null,
    searchKeywords: item?.searchKeywords || null,
  };

  // Fast-path allineato alla modale: exact/stem forte nel personale (score 100).
  const exactFast = tryExactDbMatchFastPath(foodName, grams, resolveCtx);
  if (
    exactFast?.status === FOOD_RESOLUTION_STATUS.RESOLVED
    && exactFast.foodDbKey != null
    && String(exactFast.foodDbKey).trim() !== ''
  ) {
    return {
      ...item,
      ...exactFast,
      foodName: exactFast.foodName || foodName,
      strictScore: EXACT_DB_MATCH_STRICT_SCORE,
      matchTier: 'exact',
      pendingUsdaEnrichment: false,
      isNewFood: false,
      resolutionSource: exactFast.resolutionSource || 'exact_db_match',
    };
  }

  const resolved = resolveFoodItemForProposal(foodName, grams, resolveCtx);

  if (
    resolved?.status === FOOD_RESOLUTION_STATUS.RESOLVED
    && resolved.foodDbKey != null
    && String(resolved.foodDbKey).trim() !== ''
  ) {
    return {
      ...item,
      ...resolved,
      foodName: resolved.foodName || foodName,
      pendingUsdaEnrichment: false,
      isNewFood: false,
      resolutionSource: resolved.resolutionSource || 'chat_db_auto_resolve',
    };
  }
  return null;
}

/**
 * Salva alimento imparato da macro utente e risolve porzione.
 *
 * @param {object} item
 * @param {object} context
 * @returns {Promise<object>}
 */
async function resolveItemWithUserProvidedMacros(item, context) {
  const foodName = String(item?.foodName || item?.name || '').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams) || 0));
  const macros = item.userProvidedMacros;

  const entryPer100 = buildLearnedFoodEntryPer100({
    foodName,
    grams,
    kcal: Number(macros.kcal) || 0,
    pro: Number(macros.prot) || 0,
    carbo: Number(macros.carb) || 0,
    fat: Number(macros.fat) || 0,
    source: 'chat_user_macros',
  });

  if (!entryPer100) {
    return markPendingUsdaEnrichment(item);
  }

  const saveFn = context?.saveFoodEntryPer100ToFoodDb;
  if (typeof saveFn !== 'function') {
    console.warn('[chatNewFoodPipeline] saveFoodEntryPer100ToFoodDb missing — pending USDA');
    return markPendingUsdaEnrichment(item);
  }

  const { foodDbKey, row } = await persistLearnedFoodToDatabase(
    (entry) => saveFn(entry, { strictLearned: true }),
    entryPer100,
  );

  const foodDb = row
    ? { ...(context.foodDb || {}), [foodDbKey]: row }
    : (context.foodDb || {});

  const portion = resolveLearnedPortionAfterSave(
    resolveFoodItemForProposal,
    foodName,
    grams,
    foodDbKey,
    {
      foodDb,
      fullHistory: context.fullHistory || {},
      mealType: context.mealType || 'pranzo',
      kentuItDb: context.kentuItDb || null,
      globalDb: context.globalDb || null,
    },
  );

  return {
    ...item,
    foodDbKey,
    foodName: portion?.foodName || foodName,
    grams,
    kcal: Math.round(Number(portion?.kcal) || Number(macros.kcal) || 0),
    pro: Number(portion?.pro) ?? Number(macros.prot) ?? 0,
    carbo: Number(portion?.carbo) ?? Number(macros.carb) ?? 0,
    fat: Number(portion?.fat) ?? Number(macros.fat) ?? 0,
    status: FOOD_RESOLUTION_STATUS.RESOLVED,
    resolutionSource: 'chat_learned_macros',
    pendingUsdaEnrichment: false,
    isNewFood: true,
  };
}

/**
 * Itera proposal items con isNewFood o NEEDS_RESOLUTION.
 *
 * @param {Array<object>} proposalItems
 * @param {{
 *   saveFoodEntryPer100ToFoodDb?: (entry: object, options?: object) => Promise<{ key?: string, row?: object } | void>,
 *   foodDb?: object,
 *   fullHistory?: object,
 *   mealType?: string,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 * }} context
 * @returns {Promise<{ items: object[], savedCount: number, pendingUsdaCount: number }>}
 */
export async function processUnresolvedChatFoods(proposalItems, context = {}) {
  const list = Array.isArray(proposalItems) ? proposalItems : [];
  if (list.length === 0) {
    return { items: [], savedCount: 0, pendingUsdaCount: 0 };
  }

  let savedCount = 0;
  let pendingUsdaCount = 0;

  const nextItems = await Promise.all(list.map(async (rawItem) => {
    const item = rawItem && typeof rawItem === 'object' ? { ...rawItem } : rawItem;
    if (!isChatNewFoodCandidate(item)) return item;

    try {
      if (hasActionableUserProvidedMacros(item.userProvidedMacros)) {
        const resolved = await resolveItemWithUserProvidedMacros(item, context);
        if (resolved?.status === FOOD_RESOLUTION_STATUS.RESOLVED && resolved.foodDbKey) {
          savedCount += 1;
        } else if (resolved?.pendingUsdaEnrichment) {
          pendingUsdaCount += 1;
        }
        return resolved;
      }

      const autoResolved = tryAutoResolveFromDb(item, context);
      if (autoResolved) {
        return autoResolved;
      }

      pendingUsdaCount += 1;
      return markPendingUsdaEnrichment(item);
    } catch (error) {
      console.warn('[chatNewFoodPipeline] item processing failed', {
        foodName: item?.foodName,
        error,
      });
      pendingUsdaCount += 1;
      return markPendingUsdaEnrichment(item);
    }
  }));

  return {
    items: nextItems,
    savedCount,
    pendingUsdaCount,
  };
}

/**
 * @param {object} item
 * @returns {object}
 */
export function applyChatUsdaEnrichmentSkip(item) {
  return {
    ...item,
    pendingUsdaEnrichment: false,
    status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    resolutionSource: 'chat_usda_skipped',
    kcal: 0,
    pro: 0,
    carbo: 0,
    fat: 0,
    foodDbKey: null,
  };
}

/**
 * Resume Fase 3: salva alimento da match USDA o skip.
 *
 * @param {object} item
 * @param {null | { row?: object, fdcId?: string, confidence?: string, reason?: string }} usdaMatch
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function applyChatUsdaEnrichmentResult(item, usdaMatch, context = {}) {
  if (!usdaMatch?.row) {
    return applyChatUsdaEnrichmentSkip(item);
  }

  const foodName = String(item?.foodName || item?.name || '').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams) || 0));
  const saveFn = context?.saveFoodEntryPer100ToFoodDb;

  if (typeof saveFn !== 'function') {
    console.warn('[chatNewFoodPipeline] saveFoodEntryPer100ToFoodDb missing on USDA resume');
    return applyChatUsdaEnrichmentSkip(item);
  }

  const entryPer100 = buildChatFoodFromUsdaRow(foodName, usdaMatch.row, {
    fdcId: usdaMatch.fdcId,
    confidence: usdaMatch.confidence,
    reason: usdaMatch.reason,
  });

  const { foodDbKey, row } = await persistLearnedFoodToDatabase(
    (entry) => saveFn(entry, { strictLearned: false }),
    entryPer100,
  );

  const foodDb = row
    ? { ...(context.foodDb || {}), [foodDbKey]: row }
    : (context.foodDb || {});

  const portion = resolveLearnedPortionAfterSave(
    resolveFoodItemForProposal,
    foodName,
    grams,
    foodDbKey,
    {
      foodDb,
      fullHistory: context.fullHistory || {},
      mealType: context.mealType || 'pranzo',
      kentuItDb: context.kentuItDb || null,
      globalDb: context.globalDb || null,
    },
  );

  return {
    ...item,
    foodDbKey,
    foodName: portion?.foodName || foodName,
    grams,
    kcal: Math.round(Number(portion?.kcal) || 0),
    pro: Number(portion?.pro) || 0,
    carbo: Number(portion?.carbo) || 0,
    fat: Number(portion?.fat) || 0,
    status: FOOD_RESOLUTION_STATUS.RESOLVED,
    resolutionSource: 'chat_usda_match',
    pendingUsdaEnrichment: false,
    isNewFood: true,
  };
}

/**
 * @param {Array<object>} items
 * @returns {number[]}
 */
export function collectPendingUsdaEnrichmentIndices(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => (item?.pendingUsdaEnrichment === true ? index : -1))
    .filter((index) => index >= 0);
}
