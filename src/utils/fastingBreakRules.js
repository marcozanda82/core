/**
 * Regole uniche: cosa interrompe il digiuno metabolico.
 * Usato da Monitor Metabolico, timeline, Health Score e prompt avatar.
 *
 * Fonte di verità last-meal: qualsiasi apporto con zuccheri/CHO o kcal sopra soglia
 * (caffè zuccherato, snack, pasti), più stimolanti con breaksFast=true.
 * Caffè amaro / acqua / tè unsweetened restano fasting-safe.
 */

export const FASTING_BREAK_THRESHOLDS = Object.freeze({
  /** Qualsiasi apporto sopra 5 kcal interrompe il digiuno. */
  kcal: 5,
  /** Qualsiasi CHO > 0 (es. bustina di zucchero) interrompe il digiuno. */
  carbs: 0,
  protein: 1,
});

const MEAL_LIKE_TYPES = new Set(['food', 'recipe', 'ghost_meal', 'meal', 'single']);

function readKcal(item) {
  const n = Number(item?.kcal ?? item?.cal ?? item?.calories ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readCarbs(item) {
  const n = Number(item?.carb ?? item?.carbs ?? item?.cho ?? item?.carbohydrates ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function itemDisplayName(item) {
  return String(
    item?.desc || item?.name || item?.label || item?.foodName || item?.title || '',
  ).trim().toLowerCase();
}

/**
 * Marker di bevande zuccherate / latticini — anche se il nome contiene "caffè".
 */
function hasSweetOrCaloricDrinkMarkers(name) {
  return /zuccher|zucchero|latte|cappuccino|macchiato|marocchino|con\s+zucch|dolcif|sciroppo|succo|juice|smoothie|frapp[eé]|mocha|cioccolat|panna|cream|miele|honey|bevanda\s+energetica|energy\s*drink/i.test(
    name,
  );
}

/**
 * Nomi tipici di liquidi a zero/basse calorie (caffè amaro, tè, acqua, tisane).
 */
export function isLikelyZeroCalorieDrinkName(rawName) {
  const name = String(rawName || '').trim().toLowerCase();
  if (!name || hasSweetOrCaloricDrinkMarkers(name)) return false;
  if (
    /\b(caff[eè]\s*(amaro|nero|decaffeinat)|black\s*coffee|espresso\s*(amaro|nero)?|americano\s*(amaro)?|moka\s*(amara)?)\b/i.test(name)
  ) {
    return true;
  }
  if (
    /^(caff[eè]|coffee|espresso|americano|moka|lungo|ristretto)\b/i.test(name)
    && !hasSweetOrCaloricDrinkMarkers(name)
  ) {
    return true;
  }
  if (
    /\b(t[eè]|tea|tisana|infuso|acqua|water|brodo\s*(vegetale|chiaro)?|integratore|elettrolit|sal[ei]\s*mineral)\b/i.test(name)
    && !hasSweetOrCaloricDrinkMarkers(name)
  ) {
    return true;
  }
  return false;
}

/**
 * True se l'apporto è metabolicamente rilevante per interrompere il digiuno:
 * kcal > 5, oppure CHO > 0, oppure nome tipico di bevanda zuccherata.
 */
export function itemHasFastingRelevantCalories(item) {
  if (readKcal(item) > FASTING_BREAK_THRESHOLDS.kcal) return true;
  if (readCarbs(item) > FASTING_BREAK_THRESHOLDS.carbs) return true;
  return hasSweetOrCaloricDrinkMarkers(itemDisplayName(item));
}

/**
 * Stimolante / energizer che interrompe il digiuno (caffè zuccherato, ecc.).
 */
export function isStimulantFastingBreaker(item) {
  if (!item || typeof item !== 'object') return false;
  const type = String(item.type || '').toLowerCase();
  if (type && type !== 'stimulant' && type !== 'energizer') return false;
  if (item.breaksFast === false) return false;
  if (item.breaksFast === true) return true;
  const variant = String(item.coffeeVariant || '').toLowerCase();
  if (variant === 'amaro') return false;
  if (variant === 'zuccherato') return true;
  return itemHasFastingRelevantCalories(item);
}

/**
 * Voce del diario che NON deve far ripartire il timer digiuno
 * (acqua, caffè amaro, tè senza zucchero, integratori a ~0 kcal).
 */
export function isZeroCalorieFastSafeItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.isFastingSafe === true) return true;
  if (item.breaksFast === false) return true;

  const type = String(item.type || '').toLowerCase();
  if (type === 'water') return true;
  if (type === 'stimulant' || type === 'energizer') {
    return !isStimulantFastingBreaker(item);
  }

  // Qualsiasi voce sotto soglia calorica è safe per il timer digiuno.
  if (!itemHasFastingRelevantCalories(item) && !hasSweetOrCaloricDrinkMarkers(itemDisplayName(item))) {
    return true;
  }

  const name = itemDisplayName(item);
  if (isLikelyZeroCalorieDrinkName(name) && !itemHasFastingRelevantCalories(item)) {
    return true;
  }
  return false;
}

/**
 * True se la voce conta come "ultimo pasto" metabolico (interrompe il digiuno).
 * Fonte di verità unica per Monitor, timeline, Health Score.
 *
 * @param {object | null | undefined} item
 * @returns {boolean}
 */
export function isFastingBreakerItem(item) {
  if (!item || typeof item !== 'object') return false;

  const type = String(item.type || '').toLowerCase();

  if (type === 'workout' || type === 'sleep' || type === 'nap') return false;
  if (type === 'water') return false;

  // Schema esplicito caffetteria / pasto (caffeineMg + isFastingSafe).
  if (item.isFastingSafe === true) return false;
  if (item.isFastingSafe === false && itemHasFastingRelevantCalories(item)) return true;

  if (item.breaksFast === false) return false;
  if (item.breaksFast === true) return true;

  if (type === 'stimulant' || type === 'energizer') {
    return isStimulantFastingBreaker(item);
  }

  if (type === 'meal' && Array.isArray(item.items)) {
    const mealKcal = readKcal(item);
    if (mealKcal > 0) return mealKcal >= FASTING_BREAK_THRESHOLDS.kcal;
    return item.items.some((sub) => isFastingBreakerItem({
      ...sub,
      type: sub?.type || 'food',
    }));
  }

  // Liquidi zero-cal / sotto soglia anche se type=food
  if (isZeroCalorieFastSafeItem(item)) return false;

  const isMealLike = !type || MEAL_LIKE_TYPES.has(type);
  if (!isMealLike) return false;

  // Gate primario: kcal > 5, CHO > 0, o bevanda zuccherata nel nome.
  return itemHasFastingRelevantCalories(item);
}

/**
 * Filtra solo le voci che contano come last-meal (kcal/CHO / breaksFast).
 * @param {Array<object>|null|undefined} meals
 * @returns {Array<object>}
 */
export function filterFastingRelevantMeals(meals) {
  return (Array.isArray(meals) ? meals : []).filter((meal) => isFastingBreakerItem(meal));
}

/** Alias storico (Monitor / timeline). */
export function isFastingBreakerLogItem(item) {
  return isFastingBreakerItem(item);
}
