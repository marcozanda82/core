export const CONVERSATION_STATE = Object.freeze({
  IDLE: 'IDLE',
  AWAITING_FOOD_GRAMS: 'AWAITING_FOOD_GRAMS',
  AWAITING_TIME: 'AWAITING_TIME',
});

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

export function parseGramsFromUserText(text) {
  const raw = String(text || '').trim().toLowerCase().replace(',', '.');
  if (!raw) return null;

  const gramMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|grammi|gr)\b/);
  if (gramMatch) {
    const n = Number(gramMatch[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  if (/\bporzion/.test(raw)) {
    return 100;
  }

  const plain = Number(raw);
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain);
  return null;
}

export function parseMealTypeFromUserText(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (/\bcolaz/.test(t)) return 'colazione';
  if (/\b(cena|serale|sera)\b/.test(t)) return 'cena';
  if (/\b(pranzo|mezzogiorno)\b/.test(t)) return 'pranzo';
  if (/\b(snack|spuntino|merenda)\b/.test(t)) return 'snack';
  if (MEAL_TYPES.includes(t)) return t;
  return null;
}

export function inferDefaultMealType(currentState) {
  const fromState = String(currentState?.mealState?.mealType || '').trim().toLowerCase();
  return MEAL_TYPES.includes(fromState) ? fromState : null;
}

/** Campi mancanti per completare ADD_FOOD. */
export function getFoodPayloadMissingFields(payload) {
  const missing = [];
  if (!String(payload?.foodName || '').trim()) missing.push('foodName');
  const gramsRaw = payload?.grams;
  const grams =
    gramsRaw === null || gramsRaw === undefined || gramsRaw === ''
      ? NaN
      : Number(gramsRaw);
  if (!Number.isFinite(grams) || grams <= 0) missing.push('grams');
  const mealType = String(payload?.mealType || '').trim().toLowerCase();
  if (!MEAL_TYPES.includes(mealType)) missing.push('mealType');
  return missing;
}

export function normalizeFoodPayload(payload, currentState = {}, options = {}) {
  const { inferMealTypeFromContext = true } = options;
  const foodName = String(payload?.foodName || '').trim();
  const gramsRaw = payload?.grams;
  const gramsNum =
    gramsRaw === null || gramsRaw === undefined || gramsRaw === ''
      ? NaN
      : Number(gramsRaw);
  const explicitMeal =
    parseMealTypeFromUserText(payload?.mealType)
    || (MEAL_TYPES.includes(String(payload?.mealType || '').trim().toLowerCase())
      ? String(payload.mealType).trim().toLowerCase()
      : null);
  const mealType =
    explicitMeal
    || (inferMealTypeFromContext ? inferDefaultMealType(currentState) : null)
    || null;
  const timeString = payload?.timeString != null ? String(payload.timeString).trim() : undefined;

  return {
    foodName,
    grams: Number.isFinite(gramsNum) && gramsNum > 0 ? Math.round(gramsNum) : null,
    mealType: MEAL_TYPES.includes(mealType) ? mealType : null,
    ...(timeString ? { timeString } : {}),
    ...(payload?.notes ? { notes: String(payload.notes) } : {}),
  };
}

export function slotPromptForState(state, pendingPayload = {}) {
  const name = String(pendingPayload.foodName || 'alimento').trim();
  if (state === CONVERSATION_STATE.AWAITING_FOOD_GRAMS) {
    return `Quanti grammi di ${name}?`;
  }
  if (state === CONVERSATION_STATE.AWAITING_TIME) {
    return 'Per quale pasto? (colazione, pranzo, cena, snack)';
  }
  return '';
}

export const GRAMS_SLOT_QUICK_REPLIES = Object.freeze([
  '50g',
  '100g',
  '150g',
  '200g',
  '1 porzione',
]);

export const MEAL_SLOT_QUICK_REPLIES = Object.freeze([
  'Colazione',
  'Pranzo',
  'Cena',
  'Snack',
]);

/** Quick replies da mostrare sopra l'input in base allo stato conversazionale. */
export function quickRepliesForConversationState(state) {
  if (state === CONVERSATION_STATE.AWAITING_FOOD_GRAMS) {
    return [...GRAMS_SLOT_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_TIME) {
    return [...MEAL_SLOT_QUICK_REPLIES];
  }
  return [];
}
