import { parseMealTypeFromUserText } from './conversationState.js';

const WEIGHT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr|kg)\b|\bporzion/i;
const TIME_PATTERN =
  /\b(?:alle|ore|h)\s*\d{1,2}[:h.,]\d{2}\b|\b\d{1,2}[:h.,]\d{2}\b/;
const FOOD_LOG_VERB_PATTERN =
  /\b(?:ho\s+)?(?:mangiat|consumat|assunt|preso|bevut|bevut[oa])\b|\b(?:per\s+)?(?:colazione|pranzo|cena|snack)\b.*\d+\s*(?:g|grammi|gr)\b/i;
const MEAL_SLOT_PATTERN = /\b(?:colazione|pranzo|cena|snack|pasto)\b/;

/**
 * Descrizione libera di un pasto già consumato con quantità (es. "per pranzo ho mangiato 230g di gnocchi...").
 */
export function looksLikeComplexMealLog(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;

  const hasWeight = WEIGHT_PATTERN.test(text);
  if (!hasWeight) return false;

  const hasFoodVerb = FOOD_LOG_VERB_PATTERN.test(text);
  const hasMealSlot = MEAL_SLOT_PATTERN.test(text);
  const hasTime = TIME_PATTERN.test(text);
  const hasMultipleSegments =
    (text.match(/,/g) || []).length >= 1
    || /\d+\s*(?:g|grammi|gr)\b[^,]*(?:,|\s+e\s+)\s*\d+\s*(?:g|grammi|gr)\b/.test(text);

  return hasFoodVerb || hasMealSlot || hasTime || hasMultipleSegments;
}

/**
 * Pasto al passato (già mangiato) — candidato a card riepilogo + conferma.
 */
export function isConsumedMealLogDescription(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;

  return (
    /\b(?:ho\s+)?(?:mangiat|consumat|assunt|preso|bevut)\b/.test(text)
    || /\b(?:per\s+)?(?:colazione|pranzo|cena|snack)\b/.test(text) && WEIGHT_PATTERN.test(text)
  );
}

function formatExactTime(hours, minutes) {
  const h = Number(hours);
  const min = Number(minutes);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min >= 60) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Normalizza un orario grezzo (LLM o payload) in formato HH:mm.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeExactTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return parseExactTimeFromUserText(`ore ${raw.replace(',', '.')}`)
    || parseExactTimeFromUserText(raw);
}

/**
 * Estrae orario esplicito dal testo utente (es. "ore 14.45", "alle 20:30").
 * @param {string} userText
 * @returns {string | null} HH:mm
 */
export function parseExactTimeFromUserText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return null;

  const patterns = [
    /\b(?:alle|ore|h)\s*(\d{1,2})[:h.,](\d{2})\b/,
    /\b(\d{1,2})[:h.,](\d{2})\b/,
    /\b(\d{1,2})\s*,\s*(\d{2})\b/,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (!match) continue;
    const formatted = formatExactTime(match[1], match[2]);
    if (formatted) return formatted;
  }

  return null;
}

/**
 * Risolve exactTime da payload strutturato e/o testo utente.
 * @param {object} payload
 * @param {string} [userText]
 * @returns {string | null}
 */
export function resolveExactTimeForMeal(payload = {}, userText = '') {
  const fromPayload = normalizeExactTime(payload.exactTime || payload.timeString);
  if (fromPayload) return fromPayload;
  return parseExactTimeFromUserText(userText);
}

function cleanFoodName(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+(?:e|ed)\s*$/i, '')
    .replace(/^di\s+/i, '')
    .trim();
}

function pushUniqueItem(items, seen, foodName, grams) {
  const name = cleanFoodName(foodName);
  const g = Math.round(Number(grams));
  if (!name || !Number.isFinite(g) || g <= 0) return;
  const key = `${name.toLowerCase()}_${g}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ foodName: name, grams: g });
}

/**
 * Parser locale di fallback per frasi tipo "230g di gnocchi, 100g di passato di pomodoro".
 * @param {string} userText
 * @returns {{ mealType: string | null, items: Array<{ foodName: string, grams: number }> } | null}
 */
export function parseConsumedMealFromNaturalText(userText) {
  const text = String(userText || '').trim();
  if (!text) return null;

  const mealType = parseMealTypeFromUserText(text);
  const items = [];
  const seen = new Set();

  const gramsFirstPattern =
    /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b(?:\s+di\s+|\s+)([^,;]+?)(?=\s*,|\s*;\s*|\s+e\s+\d|\s*$)/gi;
  let match = gramsFirstPattern.exec(text);
  while (match) {
    pushUniqueItem(items, seen, match[2], Number(String(match[1]).replace(',', '.')));
    match = gramsFirstPattern.exec(text);
  }

  if (items.length === 0) {
    const nameFirstPattern = /([^,;]+?)\s+(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/gi;
    match = nameFirstPattern.exec(text);
    while (match) {
      pushUniqueItem(items, seen, match[1], Number(String(match[2]).replace(',', '.')));
      match = nameFirstPattern.exec(text);
    }
  }

  if (items.length === 0) return null;

  const exactTime = parseExactTimeFromUserText(text);

  return { mealType, items, exactTime };
}
