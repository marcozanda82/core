/**
 * Unico resolver di porzione per l'inserimento Assistito (testo / voce / McDrive).
 * Non persiste estimateBasis. Non sceglie l'alimento. Nessun Gemini.
 */

import {
  DRAFT_FOOD_DEFAULT_GRAMS,
  GENERIC_ASSISTED_FALLBACK_GRAMS,
  resolveSmartDefaultPortion,
} from '../../../utils/smartFoodPortions.js';

export const ESTIMATE_BASIS = Object.freeze({
  explicit: 'explicit',
  household: 'household',
  personalHistory: 'personal-history',
  databaseServing: 'database-serving',
  smartPiece: 'database-serving',
  categoryHeuristic: 'category-heuristic',
  genericFallback: 'generic-fallback',
});

const MAX_AUTO_PORTION_GRAMS = 2000;

function roundPositive(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Guard per STIME automatiche. Non si applica a quantità esplicite dell'utente.
 */
export function isPlausibleAssistedPortion(grams) {
  const n = Number(grams);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n === 1) return false;
  if (n > MAX_AUTO_PORTION_GRAMS) return false;
  return true;
}

function acceptAuto(grams) {
  const n = roundPositive(grams);
  if (!isPlausibleAssistedPortion(n)) return null;
  return n;
}

/**
 * Solo campi numerici che nel progetto significano grammi porzione, non /100g.
 * Ignora stringhe serving_size / servingSize non parseabili.
 */
export function readTrustedDbServingGrams(resolvedFood) {
  if (!resolvedFood || typeof resolvedFood !== 'object') return null;
  const row = resolvedFood.row && typeof resolvedFood.row === 'object'
    ? resolvedFood.row
    : resolvedFood;

  const numericKeys = ['servingGrams', 'portionGrams', 'defaultUnitWeight'];
  for (let i = 0; i < numericKeys.length; i += 1) {
    const raw = row[numericKeys[i]];
    if (typeof raw !== 'number' && typeof raw !== 'string') continue;
    if (typeof raw === 'string' && /[a-z]/i.test(raw) && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(raw)) {
      continue;
    }
    const n = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
    const accepted = acceptAuto(n);
    if (accepted != null) return accepted;
  }

  if (typeof row.defaultQty === 'number') {
    const accepted = acceptAuto(row.defaultQty);
    if (accepted != null) return accepted;
  }
  if (typeof row.servingSize === 'number') {
    const accepted = acceptAuto(row.servingSize);
    if (accepted != null) return accepted;
  }
  return null;
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lookupCategoryHeuristicGrams(foodName) {
  const n = normalizeName(foodName);
  if (!n) return null;
  const tokens = Object.keys(DRAFT_FOOD_DEFAULT_GRAMS).sort((a, b) => b.length - a.length);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (n.includes(token)) {
      const grams = acceptAuto(DRAFT_FOOD_DEFAULT_GRAMS[token]);
      if (grams != null) return { grams, token };
    }
  }
  return null;
}

function lookupHistoryGrams(foodName, userHistory, userPortions) {
  const fromArg = acceptAuto(userHistory);
  if (fromArg != null) return fromArg;
  if (!userPortions || typeof userPortions !== 'object') return null;
  const key = normalizeName(foodName);
  const direct = acceptAuto(userPortions[key] ?? userPortions[foodName]);
  if (direct != null) return direct;
  const hit = Object.keys(userPortions).find((k) => normalizeName(k) === key);
  return hit ? acceptAuto(userPortions[hit]) : null;
}

/**
 * @param {{
 *   foodName?: string,
 *   resolvedFood?: object|null,
 *   foodDbKey?: string|null,
 *   householdGrams?: number|null,
 *   explicitGrams?: number|null,
 *   userHistory?: number|null,
 *   userPortions?: object|null,
 *   quantitySourceHint?: string|null,
 *   existingGrams?: number|null,
 * }} input
 */
export function resolveAssistedPortion(input = {}) {
  const foodName = String(input.foodName || '').trim();
  const sourceHint = String(input.quantitySourceHint || '').trim();

  const explicit = roundPositive(input.explicitGrams);
  if (explicit > 0) {
    return {
      grams: explicit,
      quantitySource: 'explicit',
      estimateBasis: ESTIMATE_BASIS.explicit,
      isEstimated: false,
    };
  }

  const household = roundPositive(input.householdGrams);
  if (household > 0) {
    return {
      grams: household,
      quantitySource: 'household',
      estimateBasis: ESTIMATE_BASIS.household,
      isEstimated: false,
    };
  }

  if (sourceHint === 'explicit') {
    const existing = roundPositive(input.existingGrams);
    if (existing > 0) {
      return {
        grams: existing,
        quantitySource: 'explicit',
        estimateBasis: ESTIMATE_BASIS.explicit,
        isEstimated: false,
      };
    }
  }
  if (sourceHint === 'household') {
    const existing = roundPositive(input.existingGrams);
    if (existing > 0) {
      return {
        grams: existing,
        quantitySource: 'household',
        estimateBasis: ESTIMATE_BASIS.household,
        isEstimated: false,
      };
    }
  }

  const history = lookupHistoryGrams(foodName, input.userHistory, input.userPortions);
  if (history != null) {
    return {
      grams: history,
      quantitySource: 'user-history',
      estimateBasis: ESTIMATE_BASIS.personalHistory,
      isEstimated: false,
    };
  }

  const dbServing = readTrustedDbServingGrams(input.resolvedFood);
  if (dbServing != null) {
    return {
      grams: dbServing,
      quantitySource: 'database',
      estimateBasis: ESTIMATE_BASIS.databaseServing,
      isEstimated: false,
      servingLabel: input.resolvedFood?.servingLabel || input.resolvedFood?.row?.servingLabel || null,
    };
  }

  const smart = resolveSmartDefaultPortion(foodName);
  if (smart.coffeeShopProductId || smart.kind === 'pastry' || smart.kind === 'coffee') {
    const grams = acceptAuto(smart.grams);
    if (grams != null) {
      return {
        grams,
        quantitySource: 'database',
        estimateBasis: ESTIMATE_BASIS.databaseServing,
        isEstimated: false,
        servingLabel: smart.servingLabel || null,
        coffeeShopProductId: smart.coffeeShopProductId || null,
      };
    }
  }
  if (smart.kind === 'piece') {
    const grams = acceptAuto(smart.grams);
    if (grams != null) {
      return {
        grams,
        quantitySource: 'database',
        estimateBasis: ESTIMATE_BASIS.smartPiece,
        isEstimated: smart.isEstimated === true,
        servingLabel: smart.servingLabel || null,
      };
    }
  }

  const heuristic = lookupCategoryHeuristicGrams(foodName);
  if (heuristic) {
    return {
      grams: heuristic.grams,
      quantitySource: 'estimated',
      estimateBasis: ESTIMATE_BASIS.categoryHeuristic,
      isEstimated: true,
    };
  }

  const generic = acceptAuto(GENERIC_ASSISTED_FALLBACK_GRAMS) || GENERIC_ASSISTED_FALLBACK_GRAMS;
  return {
    grams: generic,
    quantitySource: 'estimated',
    estimateBasis: ESTIMATE_BASIS.genericFallback,
    isEstimated: true,
  };
}
