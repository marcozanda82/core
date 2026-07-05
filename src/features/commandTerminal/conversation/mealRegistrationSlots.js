import {
  CONVERSATION_STATE,
  expandFoodPayloadItems,
  normalizeFoodPayload,
  parseMealTypeFromUserText,
} from './conversationState.js';
import {
  parseConsumedMealFromNaturalText,
  parseExactTimeFromUserText,
  resolveExactTimeForMeal,
} from './mealLogIntent.js';

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

export const MEAL_REGISTRATION_SLOT_ORDER = Object.freeze(['foods', 'mealType', 'exactTime']);

export function buildConversationTextsFromChatHistory(chatHistory = [], currentText = '') {
  const texts = [];
  (chatHistory || []).forEach((entry) => {
    if (!entry || entry.isTyping || entry.mealDraft || entry.mealProposals) return;
    const line = String(entry.text || '').trim();
    if (line) texts.push(line);
  });
  const current = String(currentText || '').trim();
  if (current && texts[texts.length - 1] !== current) {
    texts.push(current);
  }
  return texts.filter(Boolean);
}

export function buildGeminiContentsFromChatHistory(chatHistory = []) {
  return (chatHistory || [])
    .filter((entry) => entry && !entry.isTyping && !entry.mealDraft && !entry.mealProposals)
    .map((entry) => {
      const text = String(entry.text || '').trim();
      if (!text) return null;
      const role = entry.sender === 'user' ? 'user' : 'model';
      return { role, parts: [{ text }] };
    })
    .filter(Boolean)
    .slice(-20);
}

function resolveMealTypeFromPayloadAndTexts(payload = {}, conversationTexts = []) {
  const fromPayload = String(payload?.mealType || '').trim().toLowerCase();
  if (MEAL_TYPES.includes(fromPayload)) return fromPayload;

  for (let i = 0; i < conversationTexts.length; i += 1) {
    const parsed = parseMealTypeFromUserText(conversationTexts[i]);
    if (parsed) return parsed;
    const consumed = parseConsumedMealFromNaturalText(conversationTexts[i]);
    if (consumed?.mealType) return consumed.mealType;
  }
  return null;
}

function resolveExactTimeFromPayloadAndTexts(payload = {}, conversationTexts = []) {
  const fromPayload = resolveExactTimeForMeal(payload, '');
  if (fromPayload) return fromPayload;

  for (let i = 0; i < conversationTexts.length; i += 1) {
    const parsed = parseExactTimeFromUserText(conversationTexts[i]);
    if (parsed) return parsed;
    const consumed = parseConsumedMealFromNaturalText(conversationTexts[i]);
    if (consumed?.exactTime) return consumed.exactTime;
  }
  return null;
}

/**
 * Unisce payload parziale con alimenti/pasto/orario estratti dalla cronologia chat.
 */
export function mergeMealRegistrationFromConversation(payload = {}, chatHistory = [], currentText = '') {
  const texts = buildConversationTextsFromChatHistory(chatHistory, currentText);
  let merged = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });

  texts.forEach((text) => {
    const parsed = parseConsumedMealFromNaturalText(text);
    if (parsed?.items?.length) {
      const existing = expandFoodPayloadItems(merged);
      const combined = existing.map((item) => ({ ...item }));
      parsed.items.forEach((newItem) => {
        const idx = combined.findIndex(
          (item) => String(item.foodName || '').trim().toLowerCase()
            === String(newItem.foodName || '').trim().toLowerCase(),
        );
        if (idx >= 0) {
          combined[idx] = { ...combined[idx], ...newItem };
        } else {
          combined.push({ ...newItem });
        }
      });
      merged = { ...merged, items: combined };
    }

    const mealType = parseMealTypeFromUserText(text) || parsed?.mealType;
    if (mealType && !merged.mealType) {
      merged = { ...merged, mealType };
    }

    const exactTime = parseExactTimeFromUserText(text) || parsed?.exactTime;
    if (exactTime && !merged.exactTime) {
      merged = { ...merged, exactTime, timeString: exactTime };
    }
  });

  const mealType = resolveMealTypeFromPayloadAndTexts(merged, texts);
  const exactTime = resolveExactTimeFromPayloadAndTexts(merged, texts);

  return {
    ...merged,
    ...(mealType ? { mealType } : {}),
    ...(exactTime ? { exactTime, timeString: exactTime } : {}),
  };
}

/**
 * Slot mancanti per generare MealProposalCard (pasto già consumato).
 * Tipo pasto e orario sono dedotti via Smart Defaults — resta obbligatorio solo foods.
 * @returns {Array<'foods'>}
 */
export function getMealRegistrationMissingSlots(payload = {}, conversationTexts = []) {
  const missing = [];
  const items = expandFoodPayloadItems(payload);
  const hasCompleteFoods =
    items.length > 0
    && items.every(
      (item) => item.foodName && Number.isFinite(item.grams) && Number(item.grams) > 0,
    );
  if (!hasCompleteFoods) missing.push('foods');
  return missing;
}

export function registrationSlotToConversationState(slot) {
  if (slot === 'foods') return CONVERSATION_STATE.AWAITING_FOOD_GRAMS;
  if (slot === 'mealType') return CONVERSATION_STATE.AWAITING_TIME;
  if (slot === 'exactTime') return CONVERSATION_STATE.AWAITING_EXACT_TIME;
  return CONVERSATION_STATE.IDLE;
}

export function promptForMissingMealRegistrationSlot(slot, payload = {}) {
  const items = expandFoodPayloadItems(payload);
  switch (slot) {
    case 'foods':
      if (items.length > 0 && items.some((item) => !item.grams)) {
        const names = items.map((item) => item.foodName).filter(Boolean);
        if (names.length > 1) {
          return `Quanti grammi per ciascuno? (es. ${names[0]} 200g, ${names[1] || 'altro'} 150g)`;
        }
        return `Quanti grammi di ${names[0] || 'alimento'}?`;
      }
      return 'Cosa hai mangiato e in che quantità? (es. 230g di gnocchi, 100g di passato di pomodoro)';
    case 'mealType':
      return 'Lo classifico come Colazione, Pranzo, Cena o Spuntino?';
    case 'exactTime':
      return "A che ora l'hai mangiato? (es. 14:45)";
    default:
      return 'Mi serve un dettaglio in più per registrare il pasto.';
  }
}

export function buildCombinedConversationText(userText = '', chatHistory = []) {
  return buildConversationTextsFromChatHistory(chatHistory, userText).join('\n');
}
