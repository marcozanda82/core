import { parseMealTypeFromUserText } from './conversationState.js';
import {
  parseConsumedMealFromNaturalText,
  parseExactTimeFromUserText,
  resolveExactTimeForMeal,
} from './mealLogIntent.js';

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

/**
 * @param {Date} [now]
 * @returns {{
 *   now: Date,
 *   timeHHmm: string,
 *   dateISO: string,
 *   decimalHour: number,
 *   header: string,
 * }}
 */
export function formatCurrentSystemTimeContext(now = new Date()) {
  const ref = now instanceof Date ? now : new Date();
  const hours = ref.getHours();
  const minutes = ref.getMinutes();
  const timeHHmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateISO = [
    ref.getFullYear(),
    String(ref.getMonth() + 1).padStart(2, '0'),
    String(ref.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    now: ref,
    timeHHmm,
    dateISO,
    decimalHour: hours + minutes / 60,
    header: `[CURRENT_SYSTEM_TIME: ${timeHHmm}] [CURRENT_DATE: ${dateISO}]`,
  };
}

/**
 * Deduce tipo pasto da ora decimale (esplicita utente o ora di sistema).
 * 06:00-10:30 colazione | 12:00-15:00 pranzo | 19:00-22:30 cena | altro snack
 * @param {number} decimalHour
 * @returns {'colazione'|'pranzo'|'cena'|'snack'}
 */
export function deduceMealTypeFromDecimalHour(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return 'snack';
  if (h >= 6 && h < 10.5) return 'colazione';
  if (h >= 12 && h < 15) return 'pranzo';
  if (h >= 19 && h < 22.5) return 'cena';
  return 'snack';
}

export function parseTimeStringToDecimalHour(hhmm) {
  const raw = String(hhmm || '').trim();
  if (!raw) return null;
  const parts = raw.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] ?? 0);
  if (!Number.isFinite(hours)) return null;
  return hours + (Number.isFinite(minutes) ? minutes / 60 : 0);
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
 * Applica ipotesi intelligente: mealType ed exactTime sempre popolati.
 * @param {object} payload
 * @param {string[]} [conversationTexts]
 * @param {{ now?: Date }} [options]
 */
export function applyMealRegistrationSmartDefaults(payload = {}, conversationTexts = [], options = {}) {
  const ctx = formatCurrentSystemTimeContext(options.now);
  const texts = Array.isArray(conversationTexts) ? conversationTexts : [];

  let exactTime = resolveExactTimeFromPayloadAndTexts(payload, texts);
  if (!exactTime) {
    exactTime = ctx.timeHHmm;
  }

  let mealType = resolveMealTypeFromPayloadAndTexts(payload, texts);
  if (!mealType) {
    const hourForSlot =
      parseTimeStringToDecimalHour(exactTime)
      ?? ctx.decimalHour;
    mealType = deduceMealTypeFromDecimalHour(hourForSlot);
  }

  return {
    ...payload,
    mealType,
    exactTime,
    timeString: exactTime,
  };
}

export const MEAL_SMART_DEFAULTS_PROMPT_RULES = [
  'REGOLA SMART DEFAULTS (registrazione pasto consumato): Se l utente NON indica il tipo di pasto, deducilo dall ora corrente [CURRENT_SYSTEM_TIME] o dall orario esplicito indicato: 06:00-10:30 colazione, 12:00-15:00 pranzo, 19:00-22:30 cena, altri orari snack.',
  'Se l utente NON indica l orario esatto, assume che il pasto sia stato consumato adesso e imposta exactTime con [CURRENT_SYSTEM_TIME] in formato HH:mm.',
  'NON chiedere all utente tipo pasto o orario: compila sempre mealType ed exactTime (estratti o dedotti).',
].join(' ');
