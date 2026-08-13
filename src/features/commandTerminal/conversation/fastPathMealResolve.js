/**
 * Fast-Path: auto-risolve tutti gli alimenti ADD_FOOD in silenzio
 * (Top Hit Two-Tier + grammi espliciti/storici) → card riepilogo immediata.
 */

import {
  normalizeSearchKeywords,
  searchFoodsWithKeywords,
  normalizeSearchText,
} from '../../../foodSearch.js';
import { lookupHabitualGrams } from './mealButlerProposal.js';
import { expandFoodPayloadItems } from './conversationState.js';

const DEFAULT_GRAMS = 100;

/**
 * Testo TTS Fast-Path post auto-risoluzione.
 * @param {Array<{foodName?: string, spokenFoodName?: string}>} items
 * @returns {string}
 */
export function buildFastPathSummarySpokenText(items = []) {
  const names = (Array.isArray(items) ? items : [])
    .map((i) => String(i?.spokenFoodName || i?.foodName || '').trim())
    .filter(Boolean);
  if (names.length === 0) {
    return 'Ho preparato il riepilogo. Confermi il salvataggio o vuoi modificare qualcosa?';
  }
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `Ho preparato il riepilogo con ${list}. Confermi il salvataggio o vuoi modificare qualcosa?`;
}

/**
 * Adaptive UI — Nota vocale / lavagna aperta.
 * Speed (≥2): chiusura breve. Step-by-Step (1): conferma + invito a continuare.
 * @param {Array<{foodName?: string, spokenFoodName?: string, name?: string}>} items
 * @returns {string}
 */
export function buildAdaptiveLavagnaSpokenText(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (list.length >= 2) return 'Aggiunti al carrello.';
  const raw = String(
    list[0]?.spokenFoodName || list[0]?.foodName || list[0]?.name || '',
  ).trim();
  const short = raw.split(/\s+/).slice(0, 4).join(' ');
  if (!short) return 'Aggiunto al carrello. Cos\'altro hai mangiato?';
  const cap = short.charAt(0).toUpperCase() + short.slice(1);
  return `${cap} aggiunto. Cos'altro hai mangiato?`;
}

/**
 * Cascata personale → Kentu IT → globale: Top Hit Two-Tier.
 * @param {string} spokenName
 * @param {string[]} keywords
 * @param {string|null} preferredDbKey
 * @param {object} ctx
 * @returns {{ foodName: string, foodDbKey: string|null, matchTier: string, strictScore: number, source?: string } | null}
 */
function findTopHitCascading(spokenName, keywords, preferredDbKey, ctx = {}) {
  const layers = [
    { db: ctx.personalDb, source: 'personal' },
    { db: ctx.kentuItDb, source: 'kentu_it' },
    { db: ctx.globalDb, source: 'global' },
  ].filter((layer) => layer.db && typeof layer.db === 'object');

  if (preferredDbKey != null) {
    for (let i = 0; i < layers.length; i += 1) {
      const food = layers[i].db[preferredDbKey];
      if (food) {
        return {
          foodName: String(food.desc || food.name || spokenName).trim() || spokenName,
          foodDbKey: preferredDbKey,
          matchTier: 'exact',
          strictScore: 100,
          source: layers[i].source,
        };
      }
    }
  }

  let bestFallback = null;
  for (let i = 0; i < layers.length; i += 1) {
    const hits = searchFoodsWithKeywords(layers[i].db, keywords, {
      limit: 8,
      includeUserHistory: false,
      enableFuzzy: true,
    });
    const top = hits[0];
    if (!top?.name) continue;
    const tier = String(top.matchTier || '');
    const score = Number(top.strictScore) || 0;
    const candidate = {
      foodName: String(top.name).trim(),
      foodDbKey: top.id,
      matchTier: tier,
      strictScore: score,
      source: layers[i].source,
    };
    if (tier === 'exact' || top.keywordExact || score >= 100) {
      return candidate;
    }
    if (tier === 'prefix' || score >= 75) {
      return candidate;
    }
    if (!bestFallback || score > (bestFallback.strictScore || 0)) {
      bestFallback = candidate;
    }
  }
  return bestFallback;
}

/**
 * Risolve un singolo alimento: cascata DB + top hit keywords + grammi.
 * @param {object} item
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   userPortions?: Record<string, number>,
 * }} ctx
 * @returns {object}
 */
export function fastPathResolveFoodItem(item, ctx = {}) {
  const spokenName = String(item?.spokenFoodName || item?.foodName || item?.name || '').trim();
  if (!spokenName) return null;

  const keywords = normalizeSearchKeywords(spokenName, item?.searchKeywords);
  const preferredDbKey = item?.foodDbKey ?? item?.foodId ?? null;
  const hit = findTopHitCascading(spokenName, keywords, preferredDbKey, ctx);

  const foodName = hit?.foodName || spokenName;
  const foodDbKey = hit?.foodDbKey ?? null;
  const matchTier = hit?.matchTier || 'none';
  const strictScore = Number(hit?.strictScore) || 0;

  const explicitGrams = Number(item?.grams);
  const hasExplicit = Number.isFinite(explicitGrams) && explicitGrams > 0;
  let grams = hasExplicit ? Math.round(explicitGrams) : null;
  let isEstimated = item?.isEstimated === true;

  if (grams == null) {
    const habitual = lookupHabitualGrams(foodName, ctx.userPortions || {}, [])
      ?? lookupHabitualGrams(spokenName, ctx.userPortions || {}, []);
    if (habitual != null) {
      grams = Math.round(habitual);
      isEstimated = true;
    } else {
      grams = DEFAULT_GRAMS;
      isEstimated = true;
    }
  } else {
    isEstimated = false;
  }

  const synonymMapped = normalizeSearchText(spokenName) !== normalizeSearchText(foodName);

  return {
    foodName,
    grams,
    isEstimated,
    ...(foodDbKey != null ? { foodDbKey } : {}),
    spokenFoodName: spokenName,
    searchKeywords: keywords,
    ...(item?.icon ? { icon: item.icon } : {}),
    ...(item?.isNewFood === true ? { isNewFood: true } : {}),
    ...(item?.userProvidedMacros && typeof item.userProvidedMacros === 'object'
      ? { userProvidedMacros: item.userProvidedMacros }
      : {}),
    ...(synonymMapped ? { synonymMapped: true } : {}),
    fastPath: true,
    matchTier,
    strictScore,
  };
}

/**
 * Cicla silenziosamente tutti gli item estratti e prende il Top Hit.
 * @param {object} payload
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   userPortions?: Record<string, number>,
 * }} ctx
 * @returns {{ payload: object, items: object[], spokenText: string }}
 */
export function fastPathResolveMealPayload(payload, ctx = {}) {
  const rawItems = expandFoodPayloadItems(payload);
  const resolved = rawItems
    .map((item) => fastPathResolveFoodItem(item, ctx))
    .filter(Boolean);

  const nextPayload = {
    ...payload,
    items: resolved,
    message: buildFastPathSummarySpokenText(resolved),
  };

  return {
    payload: nextPayload,
    items: resolved,
    spokenText: nextPayload.message,
  };
}
