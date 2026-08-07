/**
 * Router modalità diabete: separa pasti (motore nutrizione RTDB)
 * da dati clinici (Firestore diario_salute / eccezioni_terapia).
 */

import {
  isConsumedMealLogDescription,
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  isMealCompletionIntent,
  isMealDraftEvaluationIntent,
  isMealProposalQuery,
  isWipMealBuildIntent,
  looksLikeComplexMealLog,
} from '../commandTerminal/conversation/mealLogIntent.js';
import { inferTherapyExceptionFromText } from '../health/utils/therapyPlanStore.js';

/** @typedef {'NUTRITION' | 'HEALTH' | 'SPLIT'} DiabetesChatRoute */

/**
 * @typedef {object} DiabetesChatClassification
 * @property {DiabetesChatRoute} route
 * @property {boolean} isMeal
 * @property {boolean} isGlycemia
 * @property {boolean} isTherapy
 */

const GLYCEMIA_HINT_RE =
  /glicem|mg\s*\/?\s*dl|\bglu(?:cose|comet(?:ro|er)?)?\b|a\s+digiuno|pre[\s-]?prandial|post[\s-]?prandial|finger\s*stick/i;

const GLYCEMIA_VALUE_RE =
  /(?:glicem\w*\s*(?:di|:|=)?\s*)(\d{2,3})\b|\b(\d{2,3})\s*(?:mg(?:\s*\/?\s*dl)?)\b/i;

const THERAPY_HINT_RE =
  /farmac|terap|pillol|compres|metformin|insulina|gliflozin|ozempic|jardiance|januvia|medicinale|farmaco|sglt|dpp.?4/i;

const FOOD_SIGNAL_RE =
  /\b(?:mangiat|consumat|bevut|yogurt|pane|pasta|riso|uova|frutta|carne|pesce|latte|formaggio|fette\s+biscott|biscott|cereali|insalata|pizza|pane|mela|banana|prosciutto|tonno|olio|zucchero|cioccolat)\w*\b/i;

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
 * True se il messaggio parla di cibo/pasto da gestire col motore nutrizione.
 * Esclude “ho preso la metformina” e simili.
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

  const therapyOnly =
    THERAPY_HINT_RE.test(text)
    && !FOOD_SIGNAL_RE.test(text)
    && !/\b(?:mangiat|consumat|bevut)\b/i.test(text);

  if (therapyOnly) return false;

  // “ho preso X” senza cibo → spesso farmaco
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
  if (isMealProposalQuery(text) || isMealAdviceIntent(text, opts.chatHistory || [])) {
    return true;
  }
  if (isMealCompletionIntent(text) || isMealDraftEvaluationIntent(text)) {
    return true;
  }
  if (isWipMealBuildIntent(text, opts.chatHistory || [], opts.wipMealItems || [])) {
    return true;
  }
  if (FOOD_SIGNAL_RE.test(text) && /\b(?:colazione|pranzo|cena|snack|pasto)\b/i.test(text)) {
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
  const isMeal = looksLikeNutritionIntent(userText, {
    chatHistory: opts.chatHistory,
    wipMealItems: opts.wipMealItems,
  });

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
  };
}
