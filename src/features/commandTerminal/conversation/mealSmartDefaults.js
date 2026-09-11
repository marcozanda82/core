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

/**
 * Inietta exactTime / timeString / timeHHmm / mealTime da qualunque campo orario presente.
 * Evita UPSERT senza clock quando l'utente ha scelto un orario in McDrive.
 */
export function injectMealClockIntoCommandPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};
  const next = { ...payload };
  const rawClock = next.exactTime ?? next.timeString ?? next.timeHHmm ?? '';
  const clock = normalizePayloadClockTime(rawClock) || String(rawClock || '').trim();
  if (clock) {
    next.exactTime = normalizePayloadClockTime(next.exactTime) || clock;
    next.timeString = normalizePayloadClockTime(next.timeString) || clock;
    next.timeHHmm = normalizePayloadClockTime(next.timeHHmm) || clock;
  }
  const existingMealTime = Number(next.mealTime);
  if (!Number.isFinite(existingMealTime) || existingMealTime < 0 || existingMealTime > 24) {
    const parsed = parseTimeStringToDecimalHour(next.exactTime || next.timeString || next.timeHHmm);
    if (parsed != null && Number.isFinite(parsed)) {
      next.mealTime = parsed;
    }
  }
  if (Number.isFinite(Number(next.mealTime)) && Array.isArray(next.items) && next.items.length > 0) {
    const mealTime = Number(next.mealTime);
    next.items = next.items.map((item) => (
      item && typeof item === 'object' ? { ...item, mealTime } : item
    ));
  }
  return next;
}

function normalizePayloadClockTime(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [h, m] = s.split(':');
    const hours = Math.min(23, Math.max(0, Number(h)));
    const minutes = Math.min(59, Math.max(0, Number(String(m).slice(0, 2))));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  const n = Number(String(s).replace(',', '.'));
  if (Number.isFinite(n) && n >= 0 && n <= 24) {
    const hours = Math.min(23, Math.floor(n));
    const minutes = Math.min(59, Math.round((n - Math.floor(n)) * 60));
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return null;
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
 * Applica SOLO mealType ed exactTime — non tocca payload.items.
 * Usa campi già presenti nel payload; altrimenti deduce da orario di sistema.
 * @param {object} payload
 * @param {{ now?: Date }} [options]
 */
export function applyMealTimingDefaultsOnly(payload = {}, options = {}) {
  const ctx = formatCurrentSystemTimeContext(options.now);

  let exactTime = normalizePayloadClockTime(payload?.exactTime || payload?.timeString)
    || resolveExactTimeForMeal(payload, '');
  if (!exactTime) {
    exactTime = ctx.timeHHmm;
  }

  let mealType = String(payload?.mealType || '').trim().toLowerCase();
  if (!MEAL_TYPES.includes(mealType)) {
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
    timeHHmm: exactTime,
    mealTime: parseTimeStringToDecimalHour(exactTime) ?? payload?.mealTime,
  };
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

  let exactTime = normalizePayloadClockTime(payload?.exactTime || payload?.timeString)
    || resolveExactTimeFromPayloadAndTexts(payload, texts);
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
    timeHHmm: exactTime,
    mealTime: parseTimeStringToDecimalHour(exactTime) ?? payload?.mealTime,
  };
}

export const MEAL_SMART_DEFAULTS_PROMPT_RULES = [
  'REGOLA SMART DEFAULTS (registrazione pasto consumato): Se l utente NON indica il tipo di pasto, deducilo dall ora corrente [CURRENT_SYSTEM_TIME] o dall orario esplicito indicato: 06:00-10:30 colazione, 12:00-15:00 pranzo, 19:00-22:30 cena, altri orari snack.',
  'Se l utente NON indica l orario esatto, assume che il pasto sia stato consumato adesso e imposta exactTime con [CURRENT_SYSTEM_TIME] in formato HH:mm.',
  'NON chiedere all utente tipo pasto o orario: compila sempre mealType ed exactTime (estratti o dedotti).',
].join(' ');
