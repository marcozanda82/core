/**
 * Regole uniche: cosa interrompe il digiuno metabolico.
 * Usato da Monitor Metabolico, timeline, Health Score e prompt avatar.
 *
 * Fonte di verità last-meal: solo voci con calorie rilevanti (>= 10 kcal),
 * più stimolanti esplicitamente breaksFast=true (es. caffè zuccherato).
 */

export const FASTING_BREAK_THRESHOLDS = Object.freeze({
  kcal: 10,
  carbs: 1,
  protein: 1,
});

const MEAL_LIKE_TYPES = new Set(['food', 'recipe', 'ghost_meal', 'meal', 'single']);

function readKcal(item) {
  const n = Number(item?.kcal ?? item?.cal ?? item?.calories ?? 0);
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

/** True se le calorie della voce sono rilevanti per interrompere il digiuno (>= 10 kcal). */
export function itemHasFastingRelevantCalories(item) {
  return readKcal(item) >= FASTING_BREAK_THRESHOLDS.kcal;
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

  // Gate primario richiesto: solo pasti con calorie rilevanti (>= 10 kcal).
  return itemHasFastingRelevantCalories(item);
}

/**
 * Filtra solo le voci che contano come last-meal (kcal >= 10 / breaksFast).
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
