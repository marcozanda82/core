import {
  CONVERSATION_STATE,
  buildMissingGramsPrompt,
  expandFoodPayloadItems,
  normalizeFoodPayload,
  parseGramsFromUserText,
  parseMealTypeFromUserText,
} from './conversationState.js';
import {
  parseConsumedMealFromNaturalText,
  parseExactTimeFromUserText,
  resolveExactTimeForMeal,
} from './mealLogIntent.js';

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

export const MEAL_REGISTRATION_SLOT_ORDER = Object.freeze(['foods', 'mealType', 'exactTime']);

const SYSTEM_MEMORY_PROPOSALS_TAG = 'MEMORIA DI SISTEMA - PROPOSTE APPENA MOSTRATE';
const SYSTEM_MEMORY_DRAFT_TAG = 'MEMORIA DI SISTEMA - BOZZA IN ATTESA DI CONFERMA';
const SYSTEM_MEMORY_DRAFT_PROJECTION_TAG = 'MEMORIA DI SISTEMA - BOZZA WHAT-IF IN VALUTAZIONE';

function formatFoodItemForMemory(item) {
  const name = String(item?.foodName || item?.name || item?.desc || '').trim();
  const grams = Math.round(Number(item?.grams ?? item?.qta ?? item?.weight) || 0);
  if (!name) return '';
  return grams > 0 ? `${name} (${grams}g)` : name;
}

function formatFoodItemsListForMemory(items) {
  return (items || [])
    .map(formatFoodItemForMemory)
    .filter(Boolean)
    .join(', ');
}

/**
 * Serializza mealProposals UI in tag di memoria per l'LLM.
 * @param {Array<object>} proposals
 * @returns {string}
 */
export function serializeMealProposalsMemoryTag(proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  if (list.length === 0) return '';

  const lines = list.map((proposal, index) => {
    const label = String(proposal?.label || proposal?.name || `Opzione ${index + 1}`).trim();
    const itemsText = formatFoodItemsListForMemory(proposal?.items);
    return `${index + 1}. ${label}: ${itemsText || '—'}`;
  });

  return `[${SYSTEM_MEMORY_PROPOSALS_TAG}: ${lines.join('; ')}]`;
}

/**
 * Serializza mealDraft UI in tag di memoria per l'LLM.
 * @param {object} mealDraft
 * @returns {string}
 */
export function serializeMealDraftMemoryTag(mealDraft) {
  if (!mealDraft || typeof mealDraft !== 'object') return '';

  const payload = mealDraft.payload && typeof mealDraft.payload === 'object'
    ? mealDraft.payload
    : mealDraft;
  const items = Array.isArray(payload?.items)
    ? payload.items
    : expandFoodPayloadItems(payload);
  const itemsText = formatFoodItemsListForMemory(items);
  if (!itemsText) return '';

  const mealType = String(payload?.mealType || '').trim();
  const mealSuffix = mealType ? ` (${mealType})` : '';
  const exactTime = String(payload?.exactTime || payload?.timeString || '').trim();
  const timeSuffix = exactTime ? ` alle ${exactTime}` : '';

  return `[${SYSTEM_MEMORY_DRAFT_TAG}${mealSuffix}${timeSuffix}: ${itemsText}]`;
}

/**
 * Serializza mealDraftProjection What-If in tag di memoria per l'LLM.
 * @param {object} mealDraftProjection
 * @returns {string}
 */
export function serializeMealDraftProjectionMemoryTag(mealDraftProjection) {
  if (!mealDraftProjection || typeof mealDraftProjection !== 'object') return '';
  const items = Array.isArray(mealDraftProjection.items) ? mealDraftProjection.items : [];
  const itemsText = formatFoodItemsListForMemory(items);
  if (!itemsText) return '';
  const mealType = String(mealDraftProjection.mealType || '').trim();
  const mealSuffix = mealType ? ` (${mealType})` : '';
  return `[${SYSTEM_MEMORY_DRAFT_PROJECTION_TAG}${mealSuffix}: ${itemsText}]`;
}

/**
 * Testo inviato al modello per un messaggio chat, con memoria strutturata invisibile in UI.
 * @param {object} entry
 * @returns {string}
 */
export function buildChatEntryTextForLlm(entry) {
  const baseText = String(entry?.text || '').trim();
  const memoryLines = [];

  if (Array.isArray(entry?.mealProposals) && entry.mealProposals.length > 0) {
    const tag = serializeMealProposalsMemoryTag(entry.mealProposals);
    if (tag) memoryLines.push(tag);
  }

  if (entry?.mealDraft) {
    const tag = serializeMealDraftMemoryTag(entry.mealDraft);
    if (tag) memoryLines.push(tag);
  }

  if (entry?.mealDraftProjection) {
    const tag = serializeMealDraftProjectionMemoryTag(entry.mealDraftProjection);
    if (tag) memoryLines.push(tag);
  }

  if (memoryLines.length === 0) return baseText;
  const memoryBlock = memoryLines.join('\n');
  return baseText ? `${baseText}\n${memoryBlock}` : memoryBlock;
}

export function buildConversationTextsFromChatHistory(chatHistory = [], currentText = '') {
  const texts = [];
  (chatHistory || []).forEach((entry) => {
    if (!entry || entry.isTyping) return;
    const line = entry.sender === 'user'
      ? String(entry.text || '').trim()
      : buildChatEntryTextForLlm(entry);
    if (line) texts.push(line);
  });
  const current = String(currentText || '').trim();
  if (current && texts[texts.length - 1] !== current) {
    texts.push(current);
  }
  return texts.filter(Boolean);
}

/** Solo messaggi utente — evita di riparsare prompt di sistema nella merge slot-filling. */
export function buildUserConversationTextsFromChatHistory(chatHistory = [], currentText = '') {
  const texts = [];
  (chatHistory || []).forEach((entry) => {
    if (!entry || entry.isTyping || entry.sender !== 'user') return;
    const line = String(entry.text || '').trim();
    if (line) texts.push(line);
  });
  const current = String(currentText || '').trim();
  if (current && texts[texts.length - 1] !== current) {
    texts.push(current);
  }
  return texts.filter(Boolean);
}

function isGramsOnlySlotReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (parseConsumedMealFromNaturalText(raw)?.items?.length) return false;
  return parseGramsFromUserText(raw) != null;
}

function mergeFoodItemIntoList(combined, newItem) {
  const idx = combined.findIndex(
    (item) => String(item.foodName || '').trim().toLowerCase()
      === String(newItem.foodName || '').trim().toLowerCase(),
  );
  if (idx >= 0) {
    const existing = combined[idx];
    combined[idx] = {
      ...existing,
      foodName: newItem.foodName || existing.foodName,
      grams:
        Number.isFinite(newItem.grams) && Number(newItem.grams) > 0
          ? newItem.grams
          : existing.grams,
    };
    return;
  }
  combined.push({ ...newItem });
}

export function buildGeminiContentsFromChatHistory(chatHistory = []) {
  return (chatHistory || [])
    .filter((entry) => entry && !entry.isTyping)
    .map((entry) => {
      const text = entry.sender === 'user'
        ? String(entry.text || '').trim()
        : buildChatEntryTextForLlm(entry);
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
 * Unisce payload parziale con dati estratti dal testo utente.
 * Per default NON riscrive items dalla chat history — solo dal messaggio corrente.
 * @param {object} [options]
 * @param {boolean} [options.includeHistoricalItems=false] Se true, merge anche messaggi utente precedenti.
 */
export function mergeMealRegistrationFromConversation(
  payload = {},
  chatHistory = [],
  currentText = '',
  options = {},
) {
  const includeHistoricalItems = options.includeHistoricalItems === true;
  const texts = includeHistoricalItems
    ? buildUserConversationTextsFromChatHistory(chatHistory, currentText)
    : buildUserConversationTextsFromChatHistory([], currentText);
  let merged = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });

  texts.forEach((text) => {
    if (isGramsOnlySlotReply(text)) return;

    const parsed = parseConsumedMealFromNaturalText(text);
    if (parsed?.items?.length) {
      const existing = expandFoodPayloadItems(merged);
      const combined = existing.map((item) => ({ ...item }));
      parsed.items.forEach((newItem) => {
        mergeFoodItemIntoList(combined, newItem);
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
  switch (slot) {
    case 'foods':
      return buildMissingGramsPrompt(payload);
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
