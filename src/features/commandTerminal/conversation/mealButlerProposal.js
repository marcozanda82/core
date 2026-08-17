/**
 * Maggiordomo proattivo pasti: propone il «solito» + grammi storici,
 * chiede sempre conferma esplicita (mai deduzione silenziosa, mai «Che tipo di…?»).
 */

import {
  foodNameMatchesQuery,
  searchFoodsWithKeywords,
  normalizeSearchText,
  normalizeSearchKeywords,
  shouldDiscloseSynonymMapping,
} from '../../../foodSearch.js';
import { normalizePortionFoodKey } from './userPortionsMemory.js';

export const BUTLER_MEAL_QUICK_REPLIES = Object.freeze([
  'Sì, va bene',
  'Oggi è diverso',
]);

export const REQUEST_FOOD_PHOTO_QUICK_REPLIES = Object.freeze([
  '📷 Scatta foto etichetta',
  'Te lo descrivo a parole',
]);

const DEFAULT_GENERIC_GRAMS = 100;

const GENERIC_FOOD_TOKENS = new Set([
  'pane', 'pasta', 'riso', 'yogurt', 'latte', 'formaggio', 'prosciutto', 'tonno',
  'pollo', 'carne', 'pesce', 'uova', 'uovo', 'insalata', 'pomodoro', 'pomodori',
  'frutta', 'mela', 'banana', 'biscotti', 'crackers', 'gallette', 'cereali',
  'avena', 'muesli', 'pizza', 'piadina', 'focaccia', 'olio', 'burro', 'marmellata',
  'miele', 'cioccolato', 'caffè', 'caffe', 'succo', 'acqua', 'patate', 'patata',
  'passata', 'sugo', 'minestrone', 'zuppa', 'mozzarella', 'bresaola', 'fesa',
  'tacchino', 'salame', 'mortadella', 'spinaci', 'zucchine', 'peperoni',
]);

/**
 * @param {string} foodName
 * @returns {boolean}
 */
export function isGenericFoodName(foodName) {
  const norm = normalizeSearchText(foodName);
  if (!norm) return false;
  const tokens = norm.split(' ').filter(Boolean);
  // Solo whitelist esplicita: niente «length <= 8» (sgombro ≠ generico).
  if (tokens.length === 1) {
    return GENERIC_FOOD_TOKENS.has(tokens[0]);
  }
  return false;
}

/**
 * Voce personale più frequente che contiene il termine generico.
 * @param {object|null} personalDb
 * @param {string} genericName
 * @returns {{ id: string, name: string, usageCount: number } | null}
 */
export function findMostFrequentPersonalFood(personalDb, genericName, searchKeywords = null) {
  const needle = String(genericName || '').trim();
  if (!needle || !personalDb || typeof personalDb !== 'object') return null;

  const keywords = normalizeSearchKeywords(needle, searchKeywords);
  const hits = searchFoodsWithKeywords(personalDb, keywords, {
    limit: 12,
    includeUserHistory: false,
    enableFuzzy: true,
  });
  if (!hits.length) return null;

  const needleNorm = normalizeSearchText(needle);

  // Preferisci match dove il generico è contenuto nel nome (pane → pane bauletto).
  // DIVIETO: usageCount non può promuovere un alimento di altra categoria (sgombro→merluzzo).
  const ranked = hits
    .map((hit) => {
      const nameNorm = normalizeSearchText(hit.name);
      const contains = foodNameMatchesQuery(hit.name, needle);
      const usage = Number(hit.usageCount) || 0;
      const strict = Number(hit.strictScore) || 0;
      const tierBoost = hit.matchTier === 'exact' || hit.matchTier === 'prefix' ? 20 : 0;
      return {
        id: hit.id,
        name: hit.name,
        usageCount: usage,
        score: usage * 10 + strict + tierBoost + (contains ? 50 : 0),
        contains,
      };
    })
    .filter((row) => row.contains === true)
    .sort((a, b) => b.score - a.score || b.usageCount - a.usageCount);

  const best = ranked[0];
  if (!best) return null;

  // Espandi solo se lo storico ha una variante più specifica del generico.
  const bestNorm = normalizeSearchText(best.name);
  if (bestNorm === needleNorm) return best;
  if (best.usageCount <= 0 && !best.contains) return null;
  if (bestNorm.length <= needleNorm.length + 1 && bestNorm !== needleNorm) {
    // Troppo simile / non più specifico
    if (!best.contains) return null;
  }
  return best;
}

/**
 * @param {string} foodName
 * @param {Record<string, number>} [userPortions]
 * @param {Array<object>} [habitItems]
 * @returns {number | null}
 */
export function lookupHabitualGrams(foodName, userPortions = {}, habitItems = []) {
  const key = normalizePortionFoodKey(foodName);
  if (key && userPortions && typeof userPortions === 'object') {
    const direct = Number(userPortions[key]);
    if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

    // Match parziale: chiave porzione che contiene/è contenuta nel nome.
    const keys = Object.keys(userPortions);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (!k) continue;
      if (key.includes(k) || k.includes(key)) {
        const g = Number(userPortions[k]);
        if (Number.isFinite(g) && g > 0) return Math.round(g);
      }
    }
  }

  const nameNorm = normalizeSearchText(foodName);
  const habits = Array.isArray(habitItems) ? habitItems : [];
  for (let i = 0; i < habits.length; i += 1) {
    const item = habits[i];
    const habitName = normalizeSearchText(item?.foodName || item?.name || item?.desc || '');
    if (!habitName) continue;
    if (habitName === nameNorm || habitName.includes(nameNorm) || nameNorm.includes(habitName)) {
      const g = Math.round(Number(item?.grams ?? item?.qty ?? item?.weight) || 0);
      if (g > 0) return g;
    }
  }
  return null;
}

function flattenHabitItems(userHabitsForCurrentMeal) {
  const proposals = Array.isArray(userHabitsForCurrentMeal?.proposals)
    ? userHabitsForCurrentMeal.proposals
    : [];
  return proposals.flatMap((p) => (Array.isArray(p?.items) ? p.items : []));
}

/**
 * Arricchisce items LLM con variante abituale (DB personale) + grammi storici.
 * Non registra nulla: solo proposta da confermare.
 *
 * @param {Array<object>} items
 * @param {{
 *   personalDb?: object|null,
 *   userPortions?: Record<string, number>,
 *   userHabitsForCurrentMeal?: object|null,
 * }} [ctx]
 * @returns {{
 *   items: Array<object>,
 *   habitProposals: Array<{ originalName: string, proposedName: string, grams: number|null }>,
 *   unresolvedNames: string[],
 *   anyHabitApplied: boolean,
 *   anyGramsEstimated: boolean,
 * }}
 */
export function enrichFoodItemsAsButlerProposal(items = [], ctx = {}) {
  const list = Array.isArray(items) ? items : [];
  const personalDb = ctx.personalDb || null;
  const userPortions = ctx.userPortions || {};
  const habitItems = flattenHabitItems(ctx.userHabitsForCurrentMeal);

  const habitProposals = [];
  const unresolvedNames = [];
  let anyHabitApplied = false;
  let anyGramsEstimated = false;

  const enriched = list.map((raw) => {
    const item = { ...(raw || {}) };
    const originalName = String(item.foodName || item.name || '').trim();
    if (!originalName) return item;

    let foodName = originalName;
    let foodDbKey = item.foodDbKey ?? null;
    let proposedFromHabit = false;
    let synonymMapped = false;

    const generic = isGenericFoodName(originalName);
    const keywords = normalizeSearchKeywords(originalName, item.searchKeywords);

    // Exact su searchKeywords (es. cocomero → Anguria) prima dell'habit «solito».
    if (personalDb) {
      const hits = searchFoodsWithKeywords(personalDb, keywords, {
        limit: 8,
        includeUserHistory: false,
        enableFuzzy: true,
      });
      const exactHit = hits.find((h) => (
        String(h.matchTier || '') === 'exact'
        || h.keywordExact === true
        || Number(h.strictScore) >= 100
      ));
      if (exactHit?.name && shouldDiscloseSynonymMapping(originalName, exactHit.name)) {
        foodName = String(exactHit.name).trim();
        foodDbKey = exactHit.id;
        synonymMapped = true;
      }
    }

    if (!synonymMapped && generic && personalDb) {
      const habit = findMostFrequentPersonalFood(personalDb, originalName, item.searchKeywords);
      if (habit && normalizeSearchText(habit.name) !== normalizeSearchText(originalName)) {
        foodName = habit.name;
        foodDbKey = habit.id;
        if (shouldDiscloseSynonymMapping(originalName, habit.name)) {
          synonymMapped = true;
        } else {
          proposedFromHabit = true;
          anyHabitApplied = true;
        }
      }
    }

    let grams = Number.isFinite(Number(item.grams)) && Number(item.grams) > 0
      ? Math.round(Number(item.grams))
      : null;
    let isEstimated = item.isEstimated === true;

    if (grams == null) {
      const habitual = lookupHabitualGrams(foodName, userPortions, habitItems)
        ?? lookupHabitualGrams(originalName, userPortions, habitItems);
      if (habitual != null) {
        grams = habitual;
        isEstimated = true;
        anyGramsEstimated = true;
      } else {
        grams = DEFAULT_GENERIC_GRAMS;
        isEstimated = true;
        anyGramsEstimated = true;
      }
    }

    if (proposedFromHabit || (isEstimated && !synonymMapped)) {
      habitProposals.push({
        originalName,
        proposedName: foodName,
        grams,
      });
    }

    // Se dopo enrich il nome è ancora generico e non c'è match DB utile → unresolved
    if (!proposedFromHabit && !synonymMapped && personalDb) {
      const hits = searchFoodsWithKeywords(personalDb, keywords, {
        limit: 3,
        includeUserHistory: false,
        enableFuzzy: true,
      });
      const strong = hits.some((h) => {
        const tier = String(h.matchTier || '');
        return tier === 'exact' || tier === 'prefix' || tier === 'fuzzy'
          || Number(h.strictScore) >= 75;
      });
      if (!strong && !generic) {
        unresolvedNames.push(originalName);
      }
    }

    return {
      ...item,
      foodName,
      ...(foodDbKey != null ? { foodDbKey } : {}),
      grams,
      isEstimated,
      ...(proposedFromHabit
        ? { proposedFromHabit: true, spokenFoodName: originalName }
        : {}),
      ...(synonymMapped
        ? { synonymMapped: true, spokenFoodName: originalName }
        : {}),
    };
  });

  return {
    items: enriched,
    habitProposals,
    unresolvedNames,
    anyHabitApplied,
    anyGramsEstimated,
  };
}

/**
 * Messaggio TTS-friendly stile maggiordomo.
 * @param {Array<object>} items
 * @param {{ habitProposals?: Array<object> }} [meta]
 * @returns {string}
 */
export function buildButlerConfirmationMessage(items = [], meta = {}) {
  const list = Array.isArray(items) ? items.filter((i) => i?.foodName) : [];
  if (list.length === 0) {
    return 'Ho preparato il pasto. Confermi, o vuoi cambiare qualcosa?';
  }

  // Mono: disclosure sinonimo (cocomero → Anguria).
  if (list.length === 1 && list[0].synonymMapped) {
    const spoken = String(list[0].spokenFoodName || list[0].foodName || '').trim();
    const dbName = String(list[0].foodName || '').trim();
    const g = Math.round(Number(list[0].grams) || 0);
    const gramsBit = g > 0 ? ` Ti propongo ${g} grammi.` : '';
    return `Per ${spoken}, nel database ho ${dbName}.${gramsBit} Va bene?`.replace(/\s+/g, ' ').trim();
  }

  const spokenList = list
    .map((i) => String(i.spokenFoodName || i.foodName || '').trim())
    .filter(Boolean);
  const annotated = spokenList.length > 0
    ? spokenList.join(' e ')
    : list.map((i) => i.foodName).join(' e ');

  const synonymLines = list
    .filter((i) => i.synonymMapped && shouldDiscloseSynonymMapping(
      i.spokenFoodName || i.foodName,
      i.foodName,
    ))
    .map((i) => {
      const spoken = String(i.spokenFoodName || '').trim();
      const dbName = String(i.foodName || '').trim();
      const g = Math.round(Number(i.grams) || 0);
      const gramsBit = g > 0 ? ` Ti propongo ${g} grammi` : '';
      return `Per ${spoken}, nel database ho ${dbName}.${gramsBit}`;
    });

  const habitLines = (Array.isArray(meta.habitProposals) ? meta.habitProposals : [])
    .filter((p) => p && normalizeSearchText(p.originalName) !== normalizeSearchText(p.proposedName))
    .filter((p) => !list.some((i) => (
      i.synonymMapped
      && normalizeSearchText(i.spokenFoodName || '') === normalizeSearchText(p.originalName)
    )))
    .map((p) => {
      const g = Number(p.grams) > 0 ? ` (${Math.round(Number(p.grams))}g)` : '';
      return `Per il ${p.originalName}, inserisco il tuo solito «${p.proposedName}»${g}`;
    });

  const gramsBits = list
    .filter((i) => Number(i.grams) > 0 && !i.synonymMapped)
    .map((i) => `${Math.round(Number(i.grams))}g per ${String(i.spokenFoodName || i.foodName).toLowerCase()}`);

  const parts = [];
  if (synonymLines.length > 0 && list.length === synonymLines.length) {
    parts.push(`${synonymLines.join('. ')}. Va bene?`);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  parts.push(`Ho annotato ${annotated}.`);

  if (synonymLines.length > 0) {
    parts.push(`${synonymLines.join('. ')}.`);
  }

  if (habitLines.length > 0) {
    parts.push(`${habitLines.join('. ')}, o oggi hai mangiato un tipo diverso?`);
  }

  if (gramsBits.length > 0) {
    const gramsPhrase = gramsBits.length === 1
      ? gramsBits[0]
      : `${gramsBits.slice(0, -1).join(', ')} e ${gramsBits[gramsBits.length - 1]}`;
    parts.push(`Posso segnare ${gramsPhrase} come al solito, o vuoi cambiare le quantità?`);
  } else if (habitLines.length === 0 && synonymLines.length === 0) {
    parts.push('Va bene così, o vuoi cambiare qualcosa?');
  } else if (synonymLines.length > 0 && habitLines.length === 0) {
    parts.push('Va bene?');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Messaggio fallback foto etichetta.
 * @param {string} [foodName]
 * @returns {string}
 */
export function buildRequestFoodPhotoMessage(foodName = '') {
  const name = String(foodName || '').trim();
  if (name) {
    return `Questo prodotto («${name}») non credo di averlo in memoria. Puoi fargli una foto veloce all'etichetta o alla confezione?`;
  }
  return 'Questo prodotto non credo di averlo in memoria. Puoi fargli una foto veloce all\'etichetta o alla confezione?';
}
