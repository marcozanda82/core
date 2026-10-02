/**
 * Pipeline assistita unica: testo e voce (dopo STT) convergono qui.
 * Fase 1: interpretazione (nomi, quantità, slot). Fase 2: resolver/DB a valle.
 * Gemini non è fonte di kcal/macro.
 */

import { splitFoodListSegments } from './foodPhraseSplit.js';
import { resolveSmartDefaultPortion } from '../../../utils/smartFoodPortions.js';
import { sanitizeFoodDisplayName } from '../../../utils/foodVisualResolver.js';
import { parseDraftWithGemini } from '../../../utils/draftParser.js';
import { getUserFoodPreferenceContext } from './userFoodPreferenceContext.js';
import { resolveAssistedPortion } from './assistedPortionResolver.js';

export const QUANTITY_SOURCE = Object.freeze({
  explicit: 'explicit',
  household: 'household',
  userHistory: 'user-history',
  database: 'database',
  estimated: 'estimated',
});

const COUNT_WORDS = Object.freeze({
  un: 1,
  una: 1,
  uno: 1,
  due: 2,
  tre: 3,
  quattro: 4,
});

function parseAssistedMealType(text) {
  const t = String(text || '').toLowerCase();
  if (/\bcolazione\b/.test(t)) return 'colazione';
  if (/\bpranzo\b/.test(t)) return 'pranzo';
  if (/\bcena\b/.test(t)) return 'cena';
  if (/\b(?:snack|spuntino|merenda)\b/.test(t)) return 'snack';
  return null;
}

function parseAssistedExactTime(text) {
  const raw = String(text || '').trim().toLowerCase();
  const match = raw.match(/\b(?:alle|ore|h)\s*(\d{1,2})[:h.,](\d{2})\b/)
    || raw.match(/\b(\d{1,2})[:h.,](\d{2})\b/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m >= 60) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractBareAssistedNames(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  let body = raw
    .replace(/\b(?:ho\s+)?(?:mangiat[oa]|consumat[oa]|assunt[oa]|preso|presa|bevut[oa])\b/gi, ' ')
    .replace(/\b(?:per\s+)?(?:colazione|pranzo|cena|snack|pasto)\b/gi, ' ')
    .replace(/\b(?:alle|ore|h)\s*\d{1,2}[:h.,]?\d{0,2}\b/gi, ' ')
    .replace(/[?!.]/g, ' ')
    .trim();
  if (!body) return [];
  return splitFoodListSegments(body)
    .map((p) => cleanFoodName(p))
    .filter((p) => p.length >= 2 && p.length <= 80 && !/^\d+$/.test(p))
    .slice(0, 6);
}

function cleanFoodName(raw) {
  return sanitizeFoodDisplayName(
    String(raw || '')
      .trim()
      .replace(/^(?:come\s+)?(?:per\s+)?(?:la\s+|il\s+|lo\s+|l['’])?(?:colazione|pranzo|cena|snack|spuntino)\s+/i, '')
      .replace(/^(?:ho\s+)?(?:mangiat[oa]|consumat[oa]|assunt[oa]|preso|presa|bevut[oa])\s+/i, '')
      .replace(/^(?:e|ed)\s+/i, '')
      .replace(/^(?:il|la|lo|l['’]|i|gli|le|del|della|dello)\s+mi[oaie]\s+/i, '')
      .replace(/^mi[oaie]\s+/i, '')
      .replace(/^(?:il|la|lo|l['’])\s+solit[oaie]\s+/i, '')
      .replace(/^solit[oaie]\s+/i, '')
      .replace(/^(?:una?|uno|un['’])\s+/i, '')
      .replace(/\s+(?:e|ed)\s*$/i, '')
      .replace(/^di\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim(),
    '',
  );
}

function normalizePortionKey(name) {
  return sanitizeFoodDisplayName(name, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupAssistedHistoryGrams(name, extraDict = null) {
  const key = normalizePortionKey(name);
  if (!key) return 0;
  if (extraDict && typeof extraDict === 'object') {
    const fromExtra = Math.round(Number(extraDict[key] ?? extraDict[name]) || 0);
    if (fromExtra > 0) return fromExtra;
    const extraKey = Object.keys(extraDict).find((k) => normalizePortionKey(k) === key);
    if (extraKey) {
      const n = Math.round(Number(extraDict[extraKey]) || 0);
      if (n > 0) return n;
    }
  }
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem('kentu_recent_portions');
    const parsed = raw ? JSON.parse(raw) : {};
    return Math.round(Number(parsed?.[key]) || 0);
  } catch {
    return 0;
  }
}

function parseCountToken(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/['’]$/, '');
  if (!t) return 1;
  if (Object.prototype.hasOwnProperty.call(COUNT_WORDS, t)) return COUNT_WORDS[t];
  const n = Number(String(t).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function estimateFruitUnitGrams(desc) {
  const s = String(desc || '').toLowerCase();
  if (/banana/.test(s)) return 120;
  if (/mel[ae]|apple/.test(s)) return 150;
  if (/aranci/.test(s)) return 150;
  if (/pera/.test(s)) return 150;
  if (/pesca|nettarina/.test(s)) return 130;
  if (/kiwi/.test(s)) return 100;
  return 120;
}

function isOilLike(foodName) {
  return /\bolio\b/i.test(String(foodName || ''));
}

function isFruitLike(foodName) {
  return /mela|mele|banana|banane|aranci|fragol|kiwi|pesca|pera|uva|melone|anguria|ciliegi|albicocca|prugna|limone|mango|ananas|frutta|pompelm|mandarin/i.test(
    String(foodName || ''),
  );
}

function isEggLike(foodName) {
  return /\buov[oaie]\b/i.test(String(foodName || ''));
}

function isYogurtLike(foodName) {
  return /\byogurt\b|\byoghurt\b|\bskyr\b/i.test(String(foodName || ''));
}

function isRestaurantPhrase(text) {
  return /\bal ristorante\b|\bin pizzeria\b|\bda asporto\b|\bal bar\b/i.test(String(text || ''));
}

function isPreparedDishName(name) {
  const n = String(name || '').toLowerCase();
  if (/\b(?:con|col|ai|al|alla|allo|alle)\b/.test(n) && !/\bal ristorante\b/.test(n)) return true;
  return /\bpizza\b|\bcarbonara\b|\blasagna\b|\blasagne\b|\brisotto\b|\bhamburger\b|\bpanino\b|\binsalata\b/.test(n);
}

function stripRestaurantCue(name) {
  return String(name || '')
    .replace(/\s+\bal ristorante\b.*$/i, '')
    .replace(/\s+\bin pizzeria\b.*$/i, '')
    .replace(/\s+\bda asporto\b.*$/i, '')
    .replace(/\s+\bal bar\b.*$/i, '')
    .trim();
}

function detectPossessive(segment) {
  const s = String(segment || '').trim();
  return /\b(?:il|la|lo|l['’]|del|della|dello)\s+(?:mi[oaie]|solit[oaie])\s+/i.test(s)
    || /\b(?:il|la)\s+solit[oa]\s+(?!colazione|pranzo|cena\b)/i.test(s);
}

function parseHabitualWholeMeal(text) {
  const t = String(text || '').trim().toLowerCase();
  const m = t.match(/\b(?:la|il)\s+solit[ao]\s+(colazione|pranzo|cena)\b/);
  if (!m) return null;
  if (/\b(?:yogurt|pane|pasta|pollo|mela|olio|uov)\b/.test(t) && !/solit[ao]\s+(colazione|pranzo|cena)\s*$/.test(t)) {
    return null;
  }
  return m[1];
}

function isBreadLike(foodName) {
  return /\bpane\b|fette biscottate|focaccia|toast/i.test(String(foodName || ''));
}

function isCannedLike(foodName) {
  return /tonno|sgombro|\bsardine\b/i.test(String(foodName || ''));
}

/**
 * Conversioni già presenti nel codice. Niente fattori inventati.
 * @returns {{ grams: number, unit: string, foodName: string } | null}
 */
export function convertHouseholdUnit({ unitRaw, count = 1, foodName }) {
  const unit = String(unitRaw || '').trim().toLowerCase();
  const name = cleanFoodName(foodName);
  const n = Math.max(1, Number(count) || 1);
  if (!name || !unit) return null;

  if (/cucchiain/.test(unit)) {
    if (!isOilLike(name)) return null;
    return { grams: Math.round(5 * n), unit: 'cucchiaino', foodName: name };
  }
  if (/cucchiai/.test(unit)) {
    if (!isOilLike(name)) return null;
    return { grams: Math.round(10 * n), unit: 'cucchiaio', foodName: name };
  }
  if (/^fett/.test(unit)) {
    const nrm = String(name).toLowerCase();
    if (/fetta biscottata|fette biscottate|biscottata/.test(nrm)) {
      return { grams: Math.round(8 * n), unit: 'fetta', foodName: name };
    }
    if (isBreadLike(name) || /\bpane\b/.test(nrm)) {
      return { grams: Math.round(25 * n), unit: 'fetta', foodName: name };
    }
    return null;
  }
  if (/scatolett/.test(unit)) {
    if (!isCannedLike(name)) return null;
    return { grams: Math.round(56 * n), unit: 'scatoletta', foodName: name };
  }
  if (/unit|pezzo|pezzi/.test(unit)) {
    if (isFruitLike(name)) {
      return { grams: Math.round(estimateFruitUnitGrams(name) * n), unit: 'unita', foodName: name };
    }
    if (isEggLike(name)) {
      return { grams: Math.round(60 * n), unit: 'unita', foodName: name };
    }
    return null;
  }
  if (/bicchier|tazz/.test(unit)) {
    const portion = resolveSmartDefaultPortion(name);
    if (portion.coffeeShopProductId && Number(portion.grams) > 0) {
      return { grams: Math.round(portion.grams * n), unit: /tazz/.test(unit) ? 'tazza' : 'bicchiere', foodName: name };
    }
    return null;
  }
  return null;
}

function parseHouseholdFromSegment(segment) {
  const s = String(segment || '').trim();
  if (!s) return null;

  const utensilFirst = s.match(
    /^(?:(\d+)|un['’]?|una|uno|due|tre|quattro)?\s*(cucchiai(?:no|ni)?|cucchiai[oa]?|fett[ae]|scatolett[ae]|unit[aà]|unita|pezzo|pezzi|bicchier[ei]|tazz[ae])\s+(?:d['’]|di\s+|del\s+|della\s+|dello\s+)?(.+)$/i,
  );
  if (utensilFirst) {
    const count = parseCountToken(utensilFirst[1] || utensilFirst[0].split(/\s+/)[0]);
    const converted = convertHouseholdUnit({
      unitRaw: utensilFirst[2],
      count,
      foodName: utensilFirst[3],
    });
    if (converted) {
      return {
        foodName: converted.foodName,
        householdGrams: converted.grams,
        householdUnit: converted.unit,
        count,
      };
    }
  }

  const fruitUnit = s.match(/^(?:un['’]?|una|uno)\s+(.+)$/i);
  if (fruitUnit) {
    const foodName = cleanFoodName(fruitUnit[1]);
    if (isFruitLike(foodName)) {
      return {
        foodName,
        householdGrams: estimateFruitUnitGrams(foodName),
        householdUnit: 'unita',
        count: 1,
      };
    }
    if (isEggLike(foodName)) {
      return {
        foodName,
        householdGrams: 60,
        householdUnit: 'unita',
        count: 1,
      };
    }
  }

  const counted = s.match(/^(due|tre|quattro|\d+)\s+(.+)$/i);
  if (counted) {
    const count = parseCountToken(counted[1]);
    const rest = counted[2];
    if (!/^(?:g|grammi|gr|kg)\b/i.test(rest)) {
      const foodName = cleanFoodName(rest);
      if (isFruitLike(foodName)) {
        return {
          foodName,
          householdGrams: Math.round(estimateFruitUnitGrams(foodName) * count),
          householdUnit: 'unita',
          count,
        };
      }
      if (isEggLike(foodName)) {
        return {
          foodName,
          householdGrams: Math.round(60 * count),
          householdUnit: 'unita',
          count,
        };
      }
      if (isYogurtLike(foodName)) {
        return {
          foodName,
          householdGrams: Math.round(125 * count),
          householdUnit: 'unita',
          count,
        };
      }
    }
  }

  return null;
}

function parsePlateOrPortion(segment) {
  const s = String(segment || '').trim();
  const m = s.match(/^(?:un['’]?|una|uno)\s+(piatto|porzione)\s+(?:di\s+|d['’])?(.+)$/i);
  if (!m) return null;
  const foodName = cleanFoodName(m[2]);
  if (!foodName) return null;
  return { foodName, plateKind: m[1].toLowerCase() };
}

function parseAllExplicitMasses(segment) {
  const s = String(segment || '').trim();
  const re = /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b(?:\s+di\s+|\s+)(.+?)(?=(?:\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b|$)/gi;
  const out = [];
  let match = re.exec(s);
  while (match) {
    const grams = Math.round(Number(String(match[1]).replace(',', '.')));
    const foodName = cleanFoodName(match[2]);
    if (foodName && grams > 0) out.push({ foodName, explicitGrams: grams });
    match = re.exec(s);
  }
  return out.length >= 2 ? out : null;
}

const SIMPLE_JUXTAPOSE_FOODS = Object.freeze([
  'pasta', 'spaghetti', 'penne', 'riso', 'pollo', 'olio', 'pane', 'yogurt',
  'tonno', 'uova', 'uovo', 'prosciutto', 'formaggio', 'insalata',
]);

function splitJuxtaposedSimpleFoods(name) {
  const raw = String(name || '').trim();
  if (!raw || isPreparedDishName(raw)) return [raw];
  if (/\b(?:di|con|col|ai|al|alla)\b/i.test(raw) && !/\bpasta pollo\b/i.test(raw)) {
    return [raw];
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return [raw];
  const simple = tokens.filter((tok) => (
    SIMPLE_JUXTAPOSE_FOODS.includes(tok.toLowerCase())
  ));
  if (simple.length >= 2 && simple.length === tokens.length) {
    return simple.map((tok) => cleanFoodName(tok)).filter(Boolean);
  }
  return [raw];
}

function parseExplicitMass(segment) {
  const s = String(segment || '').trim();
  const kgFirst = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg|chilogrammi)\b(?:\s+di\s+|\s+)(.+)$/i);
  if (kgFirst) {
    const kg = Number(String(kgFirst[1]).replace(',', '.'));
    return {
      foodName: cleanFoodName(kgFirst[2]),
      explicitGrams: Math.round(kg * 1000),
    };
  }
  const gramsFirst = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b(?:\s+di\s+|\s+)(.+)$/i);
  if (gramsFirst) {
    return {
      foodName: cleanFoodName(gramsFirst[2]),
      explicitGrams: Math.round(Number(String(gramsFirst[1]).replace(',', '.'))),
    };
  }
  const nameThenKg = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|chilogrammi)\b/i);
  if (nameThenKg) {
    const kg = Number(String(nameThenKg[2]).replace(',', '.'));
    return {
      foodName: cleanFoodName(nameThenKg[1]),
      explicitGrams: Math.round(kg * 1000),
    };
  }
  const nameThenG = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/i);
  if (nameThenG) {
    return {
      foodName: cleanFoodName(nameThenG[1]),
      explicitGrams: Math.round(Number(String(nameThenG[2]).replace(',', '.'))),
    };
  }
  return null;
}

function stripInputPrefixes(text) {
  return String(text || '')
    .replace(/^(?:come\s+)?(?:per\s+)?(?:la\s+|il\s+|lo\s+|l['’])?(?:colazione|pranzo|cena|snack|spuntino)\s*,?\s*/i, '')
    .replace(/^(?:ho\s+)?(?:mangiat[oa]|consumat[oa]|assunt[oa]|preso|presa|bevut[oa])\s+/i, '')
    .replace(/\b(?:alle|ore|h)\s*\d{1,2}[:h.,]?\d{0,2}\b/gi, ' ')
    .trim();
}

/**
 * Priorità: explicit → household → user-history → database serving → estimated.
 */
export function resolveAssistedQuantity(foodName, hints = {}, context = {}) {
  const name = cleanFoodName(foodName);
  const recent = lookupAssistedHistoryGrams(
    name,
    context.userPortions && typeof context.userPortions === 'object' ? context.userPortions : null,
  );
  const resolved = resolveAssistedPortion({
    foodName: name,
    resolvedFood: hints.resolvedFood || context.resolvedFood || null,
    foodDbKey: hints.foodDbKey || context.foodDbKey || null,
    explicitGrams: hints.explicitGrams,
    householdGrams: hints.householdGrams,
    userHistory: hints.preferenceGrams ?? context.preferenceGrams ?? recent,
    userPortions: context.userPortions,
  });
  return {
    grams: resolved.grams,
    quantitySource: resolved.quantitySource,
    isEstimated: resolved.isEstimated === true,
    estimateBasis: resolved.estimateBasis,
    servingLabel: resolved.servingLabel || null,
    coffeeShopProductId: resolved.coffeeShopProductId || null,
  };
}

function toAssistedItem(foodName, hints, context) {
  const restaurantGuess = hints.restaurantGuess === true || isRestaurantPhrase(context.sourceText || '');
  const rawName = stripRestaurantCue(cleanFoodName(foodName));
  const name = rawName || cleanFoodName(foodName);
  if (!name || name.length < 2) return null;

  const preference = getUserFoodPreferenceContext(name, context);
  const possessive = hints.possessive === true;
  const identityAmbiguous = preference.decision === 'ambiguous'
    || (possessive && preference.decision !== 'auto' && (preference.candidates || []).length >= 2);

  const qtyHints = { ...hints };
  if (!qtyHints.explicitGrams && !qtyHints.householdGrams && preference.habitualGrams > 0) {
    qtyHints.preferenceGrams = preference.habitualGrams;
  }

  const qty = resolveAssistedQuantity(name, qtyHints, context);
  const disambiguationCandidates = identityAmbiguous
    ? (preference.candidates || []).map((c) => ({
      foodDbKey: c.foodDbKey,
      foodName: c.name || c.desc,
      usageCount: c.usageCount,
    }))
    : [];

  return {
    foodName: preference.displayName && preference.decision === 'auto'
      ? preference.displayName
      : name,
    rawName: name,
    grams: qty.grams,
    quantitySource: qty.quantitySource,
    isEstimated: qty.isEstimated === true,
    estimateBasis: qty.estimateBasis || null,
    quantityUnit: hints.householdUnit || (hints.explicitGrams ? 'g' : null),
    explicitQuantity: Number.isFinite(Number(hints.explicitGrams)) && Number(hints.explicitGrams) > 0
      ? Number(hints.explicitGrams)
      : null,
    servingLabel: qty.servingLabel || null,
    coffeeShopProductId: qty.coffeeShopProductId || null,
    preferredFoodDbKey: identityAmbiguous ? null : (preference.foodDbKey || null),
    identityAmbiguous,
    restaurantGuess,
    platePortion: hints.platePortion === true,
    possessive,
    disambiguationCandidates,
  };
}

function emptyResult(text, context, parser) {
  return {
    sourceText: String(text || '').trim(),
    source: context.source === 'voice' ? 'voice' : 'text',
    mealType: parseAssistedMealType(text) || context.mealTypeHint || null,
    exactTime: parseAssistedExactTime(text),
    items: [],
    parser,
  };
}

/**
 * Parser locale deterministico (nessun Gemini).
 */
export function parseAssistedMealLocal(text, context = {}) {
  const raw = String(text || '').trim();
  if (!raw) return emptyResult(raw, context, 'local');

  const ctx = { ...context, sourceText: raw };
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.foodName) return;
    const key = item.foodName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const habitualSlot = parseHabitualWholeMeal(raw);
  if (habitualSlot) {
    const proposed = Array.isArray(ctx.habitualMeals?.[habitualSlot])
      ? ctx.habitualMeals[habitualSlot]
      : [];
    if (proposed.length >= 2) {
      proposed.forEach((entry) => {
        const name = String(entry?.foodName || entry?.name || '').trim();
        const grams = Math.round(Number(entry?.grams) || 0);
        push(toAssistedItem(name, grams > 0 ? { explicitGrams: grams } : {}, ctx));
      });
    }
    return {
      sourceText: raw,
      source: ctx.source === 'voice' ? 'voice' : 'text',
      mealType: habitualSlot,
      exactTime: parseAssistedExactTime(raw),
      items,
      parser: 'local',
      habitualMealRequested: habitualSlot,
      habitualMealResolved: items.length >= 2,
    };
  }

  const stripped = stripInputPrefixes(raw);
  const segments = splitFoodListSegments(stripped || raw);
  const restaurantGuess = isRestaurantPhrase(raw);

  for (const segment of segments) {
    const possessive = detectPossessive(segment);
    const extras = { possessive, restaurantGuess };

    const manyExplicit = parseAllExplicitMasses(segment);
    if (manyExplicit) {
      manyExplicit.forEach((explicit) => {
        push(toAssistedItem(explicit.foodName, { explicitGrams: explicit.explicitGrams, ...extras }, ctx));
      });
      continue;
    }

    const explicit = parseExplicitMass(segment);
    if (explicit?.foodName && explicit.explicitGrams > 0) {
      push(toAssistedItem(explicit.foodName, { explicitGrams: explicit.explicitGrams, ...extras }, ctx));
      continue;
    }
    const household = parseHouseholdFromSegment(segment);
    if (household?.foodName && household.householdGrams > 0) {
      push(toAssistedItem(household.foodName, {
        householdGrams: household.householdGrams,
        householdUnit: household.householdUnit,
        ...extras,
      }, ctx));
      continue;
    }
    const plate = parsePlateOrPortion(segment);
    if (plate?.foodName) {
      push(toAssistedItem(plate.foodName, { platePortion: true, ...extras }, ctx));
      continue;
    }
  }

  if (items.length === 0) {
    const names = extractBareAssistedNames(raw);
    names.forEach((name) => {
      splitJuxtaposedSimpleFoods(name).forEach((part) => {
        push(toAssistedItem(part, {
          possessive: detectPossessive(raw),
          restaurantGuess,
        }, ctx));
      });
    });
  }

  return {
    sourceText: raw,
    source: ctx.source === 'voice' ? 'voice' : 'text',
    mealType: parseAssistedMealType(raw) || ctx.mealTypeHint || null,
    exactTime: parseAssistedExactTime(raw),
    items,
    parser: 'local',
  };
}

function isLocalSufficient(local, text) {
  if (local?.habitualMealRequested) return true;
  if (local.items.length === 0) return false;
  const hasExplicitOrHousehold = local.items.some((item) => (
    item.quantitySource === QUANTITY_SOURCE.explicit
    || item.quantitySource === QUANTITY_SOURCE.household
  ));
  if (hasExplicitOrHousehold) return true;
  if (extractBareAssistedNames(text).length > 0) return true;
  return local.items.length > 0;
}

function itemFromGeminiEntry(entry, sourceText, context) {
  const nome = typeof entry === 'string'
    ? entry
    : String(entry?.nome || entry?.foodName || entry?.name || '').trim();
  const quantita = typeof entry === 'object'
    ? String(entry?.quantita || entry?.qty || '').trim()
    : '';
  const fromQty = parseExplicitMass(`${quantita} ${nome}`.trim())
    || parseExplicitMass(quantita)
    || parseHouseholdFromSegment(`${quantita} ${nome}`.trim())
    || parseHouseholdFromSegment(quantita);
  const overlay = parseExplicitMass(sourceText);
  const hints = {};
  if (fromQty?.explicitGrams) hints.explicitGrams = fromQty.explicitGrams;
  if (fromQty?.householdGrams) {
    hints.householdGrams = fromQty.householdGrams;
    hints.householdUnit = fromQty.householdUnit;
  }
  if (!hints.explicitGrams && overlay?.explicitGrams && cleanFoodName(overlay.foodName) === cleanFoodName(nome)) {
    hints.explicitGrams = overlay.explicitGrams;
  }
  const householdOnText = parseHouseholdFromSegment(stripInputPrefixes(sourceText));
  if (!hints.explicitGrams && householdOnText?.householdGrams
    && cleanFoodName(householdOnText.foodName) === cleanFoodName(nome)) {
    hints.householdGrams = householdOnText.householdGrams;
    hints.householdUnit = householdOnText.householdUnit;
  }
  return toAssistedItem(nome, hints, context);
}

export function serializeAssistedMealDraft(draft) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  return items.map((item) => ({
    foodName: String(item.foodName || '').trim().toLowerCase(),
    grams: Math.round(Number(item.grams) || 0),
    quantitySource: String(item.quantitySource || ''),
  }));
}

export function toMcDriveParsedItems(draft) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  return items.map((item) => ({
    foodName: item.foodName,
    grams: item.grams,
    isEstimated: item.isEstimated === true,
    quantitySource: item.quantitySource,
    habitualPortion: item.quantitySource === QUANTITY_SOURCE.userHistory,
    coffeeShopProductId: item.coffeeShopProductId || null,
    servingLabel: item.servingLabel || null,
    preferredFoodDbKey: item.preferredFoodDbKey || null,
    identityAmbiguous: item.identityAmbiguous === true,
    restaurantGuess: item.restaurantGuess === true,
    alternatives: Array.isArray(item.disambiguationCandidates) ? item.disambiguationCandidates : [],
  }));
}

/**
 * Ingresso unico assistito. `source` è metadata e non cambia i nutrienti.
 * @param {string} text
 * @param {{ source?: 'text'|'voice', mealTypeHint?: string|null, userPortions?: object, geminiParser?: Function }} [context]
 */
export async function interpretAssistedMealInput(text, context = {}) {
  const raw = String(text || '').trim();
  const local = parseAssistedMealLocal(raw, context);

  if (isLocalSufficient(local, raw)) {
    return local;
  }

  let geminiEntries;
  try {
    const parser = typeof context.geminiParser === 'function'
      ? context.geminiParser
      : parseDraftWithGemini;
    geminiEntries = await parser(raw);
  } catch (error) {
    console.warn('[interpretAssistedMealInput] Gemini failed', error);
    geminiEntries = [];
  }

  const list = Array.isArray(geminiEntries) ? geminiEntries : [];
  if (list.length > 0) {
    const items = [];
    const seen = new Set();
    list.forEach((entry) => {
      const item = itemFromGeminiEntry(entry, raw, context);
      if (!item?.foodName) return;
      const key = item.foodName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
    if (items.length > 0) {
      return {
        ...local,
        items,
        parser: 'gemini',
      };
    }
  }

  return {
    ...local,
    parser: local.items.length > 0 ? 'local-fallback' : 'empty',
  };
}
