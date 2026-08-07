/**
 * Router modalità diabete: separa pasti (motore nutrizione RTDB)
 * da dati clinici (Firestore diario_salute / eccezioni_terapia).
 *
 * Regola critica: i follow-up a chiarimenti pasto e gli elenchi alimenti
 * NON devono mai finire nel motore salute (che li rifiuterebbe).
 */

import {
  isClarificationFollowUpReply,
  isConsumedMealLogDescription,
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  isMealCompletionIntent,
  isMealDraftEvaluationIntent,
  isMealProposalQuery,
  isWipMealBuildIntent,
  looksLikeComplexMealLog,
  wasLastAiMessageClarification,
} from '../commandTerminal/conversation/mealLogIntent.js';
import { inferTherapyExceptionFromText } from '../health/utils/therapyPlanStore.js';

/** @typedef {'NUTRITION' | 'HEALTH' | 'SPLIT'} DiabetesChatRoute */

/**
 * @typedef {object} DiabetesChatClassification
 * @property {DiabetesChatRoute} route
 * @property {boolean} isMeal
 * @property {boolean} isGlycemia
 * @property {boolean} isTherapy
 * @property {boolean} [isClarificationFollowUp]
 */

const GLYCEMIA_HINT_RE =
  /glicem|mg\s*\/?\s*dl|\bglu(?:cose|comet(?:ro|er)?)?\b|a\s+digiuno|pre[\s-]?prandial|post[\s-]?prandial|finger\s*stick/i;

const GLYCEMIA_VALUE_RE =
  /(?:glicem\w*\s*(?:di|:|=)?\s*)(\d{2,3})\b|\b(\d{2,3})\s*(?:mg(?:\s*\/?\s*dl)?)\b/i;

const THERAPY_HINT_RE =
  /farmac|terap|pillol|compres|metformin|insulina|gliflozin|ozempic|jardiance|januvia|medicinale|farmaco|sglt|dpp.?4/i;

const FOOD_SIGNAL_RE =
  /\b(?:mangiat|consumat|bevut|yogurt|pane|pasta|riso|uov[ao]|frutta|carne|pesce|latte|formaggio|fette\s+biscott|biscott|cereali|insalat|pizza|mela|banana|prosciutto|tonno|olio|zucchero|cioccolat|pomodor|bauletto|integrale|fresco|cotto|crudo|mozzarella|bresaola|fesa|petto|pollo|tacchin|salame|mortadella|crackers|gallette|avena|muesli|fiocchi|burro|marmellat|miele|confettur|minestrone|zuppa|passata|sugo|patat|carot|zucchin|peperon|cetriol|lattug|spinac|fagiol|ceci|lenticch|tofu|seitan|hamburger|piadina|focaccia|cornetto|brioche|succo|spremuta|acqua|caff[eè]|th[eè]|t[eè])\w*\b/i;

/** Elenco alimenti senza verbo (es. «pomodoro fresco e pane bauletto»). */
const FOOD_LIST_RE =
  /\b[\p{L}][\p{L}\s.'-]{1,40}\s+(?:e|ed|,)\s+[\p{L}][\p{L}\s.'-]{1,40}\b/u;

const MEAL_CONTEXT_ASK_RE =
  /\b(?:cosa\s+hai\s+mangiat|che\s+hai\s+mangiat|dimmi\s+(?:cosa|gli\s+alimenti|il\s+pasto)|quali\s+alimenti|tipo\s+e\s+quantit|dettagli\s+(?:del\s+)?pasto|elenca(?:mi)?\s+(?:gli\s+)?alimenti|grammature|quantit[aà])\b/i;

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function looksLikeGlycemiaLog(userText) {
  const text = String(userText || '').trim();
  if (!text) return false;
  if (GLYCEMIA_HINT_RE.test(text)) return true;
  if (GLYCEMIA_VALUE_RE.test(text)) return true;
  return false;
}

/**
 * @param {string} userText
 * @param {import('../health/utils/therapyPlanStore.js').TherapyPlanDoc | null} [plan]
 * @returns {boolean}
 */
export function looksLikeTherapyException(userText, plan = null) {
  const text = String(userText || '').trim();
  if (!text) return false;
  if (inferTherapyExceptionFromText(text, plan)) return true;
  if (!THERAPY_HINT_RE.test(text)) return false;
  return /saltat|omit|non\s+ho\s+pres|dimenticat|ritard|doppia\s+dose|dose\s+doppia|mezza\s+dose|dose\s+ridott|preso\s+(?:la|il|le|i)\s+\w+/i.test(
    text,
  );
}

/**
 * Ultimo messaggio AI chiedeva dettagli sul pasto (anche se non tipizzato ASK_CLARIFICATION).
 * @param {unknown[]} [chatHistory]
 * @returns {boolean}
 */
export function wasLastAiMessageMealPrompt(chatHistory = []) {
  if (wasLastAiMessageClarification(chatHistory)) return true;

  for (let i = (chatHistory || []).length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping) continue;
    // Ignora turni utente in coda (stesso motivo di wasLastAiMessageClarification).
    if (entry.sender === 'user') continue;
    if (entry.sender !== 'ai') continue;

    const text = String(entry.text || '');
    if (MEAL_CONTEXT_ASK_RE.test(text)) return true;
    if (/\b(?:pasto|colazione|pranzo|cena|snack|alimenti|cibo|mangiat)\b/i.test(text)
      && /\b(?:dimmi|specie|precis|dettagl|quale|quanto|cosa|tipo|quantit|gramm)\b/i.test(text)) {
      return true;
    }
    if (entry.mealProposal || entry.mealDraft || entry.mealProposals || entry.type === 'MEAL_RECEIPT') {
      return true;
    }
    if (entry.type === 'REQUEST_FOOD_PHOTO' || entry.requestFoodPhoto === true) {
      return true;
    }
    if (Array.isArray(entry.quickReplies) && entry.quickReplies.some((r) =>
      /\d+\s*(?:g|gr|grammi)\b/i.test(String(r?.label || r?.text || r || '')),
    )) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Risposta solo grammature / porzioni (es. «100g», «80 gr», «una porzione»).
 * @param {string} userText
 * @returns {boolean}
 */
export function looksLikeGramsOnlyReply(userText) {
  const text = String(userText || '').trim();
  if (!text || text.length > 40) return false;
  if (looksLikeGlycemiaLog(text) || looksLikeTherapyException(text)) return false;
  if (/^(\d+(?:[.,]\d+)?)\s*(?:g|gr|grammi)\b\.?$/i.test(text)) return true;
  if (/^(?:una?\s+)?(?:mezza\s+)?porzion[ei]?\b/i.test(text)) return true;
  if (/^\d+(?:[.,]\d+)?\s*(?:g|gr|grammi)\b/i.test(text) && text.split(/\s+/).length <= 4) {
    return true;
  }
  return false;
}

/**
 * True se il messaggio elenca alimenti (anche senza “ho mangiato”).
 * @param {string} userText
 * @returns {boolean}
 */
export function looksLikeFoodListReply(userText) {
  const text = String(userText || '').trim();
  if (!text || text.length > 220) return false;
  if (/\?/.test(text)) return false;
  if (looksLikeGlycemiaLog(text) || looksLikeTherapyException(text)) return false;

  if (FOOD_SIGNAL_RE.test(text) && FOOD_LIST_RE.test(text)) return true;
  if (FOOD_SIGNAL_RE.test(text) && text.split(/\s+/).length <= 12) return true;
  // Due o più token cibo-like separati da “e”/virgola
  if (FOOD_LIST_RE.test(text) && /[\p{L}]{3,}/u.test(text) && !THERAPY_HINT_RE.test(text)) {
    // Evita frasi cliniche generiche
    if (!/\b(?:glicem|farmac|dose|terap)\b/i.test(text)) return true;
  }
  return false;
}

/**
 * True se il messaggio parla di cibo/pasto da gestire col motore nutrizione.
 *
 * @param {string} userText
 * @param {object} [opts]
 * @param {unknown[]} [opts.chatHistory]
 * @param {unknown[]} [opts.wipMealItems]
 * @returns {boolean}
 */
export function looksLikeNutritionIntent(userText, opts = {}) {
  const text = String(userText || '').trim();
  if (!text) return false;

  const history = opts.chatHistory || [];

  // Continuity: risposta a chiarimento / domanda pasto → sempre nutrizione.
  if (isClarificationFollowUpReply(text, history) || wasLastAiMessageMealPrompt(history)) {
    if (!looksLikeGlycemiaLog(text) && !looksLikeTherapyException(text, opts.terapiaBase || null)) {
      if (
        looksLikeGramsOnlyReply(text)
        || looksLikeFoodListReply(text)
        || FOOD_SIGNAL_RE.test(text)
        || isFoodRegistrationIntent(text)
        || text.length <= 120
      ) {
        return true;
      }
    }
  }

  // Grammature da pulsante anche senza history tipizzata → nutrizione se non clinico.
  if (looksLikeGramsOnlyReply(text) && !looksLikeGlycemiaLog(text) && !looksLikeTherapyException(text)) {
    return true;
  }

  const therapyOnly =
    THERAPY_HINT_RE.test(text)
    && !FOOD_SIGNAL_RE.test(text)
    && !/\b(?:mangiat|consumat|bevut)\b/i.test(text);

  if (therapyOnly) return false;

  if (
    /\bho\s+preso\b/i.test(text)
    && THERAPY_HINT_RE.test(text)
    && !FOOD_SIGNAL_RE.test(text)
  ) {
    return false;
  }

  if (isFoodRegistrationIntent(text) || isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) {
    return true;
  }
  if (isMealProposalQuery(text) || isMealAdviceIntent(text, history)) {
    return true;
  }
  if (isMealCompletionIntent(text) || isMealDraftEvaluationIntent(text)) {
    return true;
  }
  if (isWipMealBuildIntent(text, history, opts.wipMealItems || [])) {
    return true;
  }
  if (FOOD_SIGNAL_RE.test(text) && /\b(?:colazione|pranzo|cena|snack|pasto)\b/i.test(text)) {
    return true;
  }
  // Elenco alimenti nudo → diario alimentare, non salute.
  if (looksLikeFoodListReply(text)) {
    return true;
  }
  return false;
}

/**
 * Classifica il messaggio in modalità diabete.
 *
 * - NUTRITION → solo motore past/macro (RTDB)
 * - HEALTH → solo glicemia / terapia (Firestore)
 * - SPLIT → pasto su RTDB + dati clinici su Firestore
 *
 * @param {string} userText
 * @param {{
 *   chatHistory?: unknown[],
 *   wipMealItems?: unknown[],
 *   terapiaBase?: import('../health/utils/therapyPlanStore.js').TherapyPlanDoc | null,
 * }} [opts]
 * @returns {DiabetesChatClassification}
 */
export function classifyDiabetesChatIntent(userText, opts = {}) {
  const isGlycemia = looksLikeGlycemiaLog(userText);
  const isTherapy = looksLikeTherapyException(userText, opts.terapiaBase || null);
  const isClarificationFollowUp = isClarificationFollowUpReply(userText, opts.chatHistory || [])
    || (
      wasLastAiMessageMealPrompt(opts.chatHistory || [])
      && !isGlycemia
      && !isTherapy
    )
    || (
      looksLikeGramsOnlyReply(userText)
      && wasLastAiMessageMealPrompt(opts.chatHistory || [])
      && !isGlycemia
      && !isTherapy
    );
  const isMeal = looksLikeNutritionIntent(userText, {
    chatHistory: opts.chatHistory,
    wipMealItems: opts.wipMealItems,
    terapiaBase: opts.terapiaBase,
  }) || (isClarificationFollowUp && !isGlycemia && !isTherapy)
    || (looksLikeGramsOnlyReply(userText) && !isGlycemia && !isTherapy);

  /** @type {DiabetesChatRoute} */
  let route = 'HEALTH';
  if (isMeal && (isGlycemia || isTherapy)) route = 'SPLIT';
  else if (isMeal) route = 'NUTRITION';
  else route = 'HEALTH';

  return {
    route,
    isMeal,
    isGlycemia,
    isTherapy,
    isClarificationFollowUp: Boolean(isClarificationFollowUp),
  };
}
