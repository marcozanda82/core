import { parseMealTypeFromUserText } from './conversationState.js';

const WEIGHT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr|kg)\b|\bporzion/i;
const TIME_PATTERN =
  /\b(?:alle|ore|h)\s*\d{1,2}[:h.,]\d{2}\b|\b\d{1,2}[:h.,]\d{2}\b/;
const FOOD_LOG_VERB_PATTERN =
  /\b(?:ho\s+)?(?:mangiat|consumat|assunt|preso|bevut|bevut[oa])\b|\b(?:per\s+)?(?:colazione|pranzo|cena|snack)\b.*\d+\s*(?:g|grammi|gr)\b/i;
const MEAL_SLOT_PATTERN = /\b(?:colazione|pranzo|cena|snack|pasto)\b/;

/** Richieste di proposta pasto (nessun alimento specifico da registrare). */
const MEAL_PROPOSAL_QUERY_PATTERNS = [
  /\b(?:cosa|che)\s+(?:potrei|posso|devo|dovrei|vorrei)\s+mangiar/i,
  /\b(?:cosa|che)\s+mangio\b/i,
  /\b(?:cosa|che)\s+(?:mi\s+)?(?:proponi|consigli|suggerisci)\b/i,
  /\b(?:proponi|suggerisci|consigliami)\b/i,
  /\bconsigli\b.*\b(?:pranzo|colazione|cena|snack|pasto|mangio|mangiare)\b/i,
  /\b(?:che|quali)\s+opzioni\s+(?:ho|abbiamo)\b/i,
  /\bidee\b.*\b(?:pasto|pranzo|colazione|cena|mangio|mangiare)\b/i,
  /(?:colazione|pranzo|cena|snack)\s+(?:cosa|che\s+cosa)/i,
  /(?:che|cosa)\s+(?:pasto|cosa)\s+(?:mangio|preparo|faccio)/i,
  /\b(?:proponi|suggerisci)\s+(?:un\s+)?pasto/i,
  /\b(?:carica|registra)\s+(?:il\s+)?(?:mio\s+)?(?:solito|abituale)/i,
];

/** Valutazione / consiglio su cosa mangiare (incluso alimento specifico). */
const MEAL_ADVICE_EVALUATION_PATTERNS = [
  /\bposso\s+(?:mangiare|prendere|avere)\b/i,
  /\bconviene\s+(?:mangiare|prendere)\b/i,
  /\bmi\s+consigli\b/i,
  /\b(?:è|e)\s+ok\s+mangiare\b/i,
  /\bva\s+bene\s+mangiare\b/i,
  /\bse\s+mangio\b/i,
  /\bdentro\s+(?:al\s+)?budget\b/i,
  /\bquanto\s+(?:posso\s+)?mangiare\b/i,
  /\bposso\s+.*\?/i,
];

const FOOD_REGISTRATION_PATTERNS = [
  /\bho\s+mangiat/i,
  /\bho\s+preso\b/i,
  /\bho\s+bevut/i,
  /\baggiung/i,
  /\blogg/i,
  /\bregistr/i,
  /\b(?:per\s+)?(?:colazione|pranzo|cena|snack)\s+(?:ho\s+)?(?:mangiat|preso|bevut)/i,
  /\d+\s*(?:g|grammi|gr)\s+(?:di\s+)?\w+/i,
];

/** Intent "Sous-Chef": utente ha già iniziato il piatto e chiede cosa aggiungere. */
const MEAL_COMPLETION_PATTERNS = [
  /\bho\s+gi[aà]\s+(?:preparat|cucin|fatto|messo)\b/i,
  /\b(?:cosa|che)\s+(?:aggiungo|metto)\s+a\b/i,
  /\bcome\s+integro\b/i,
  /\b(?:ho\s+messo\s+su|ho\s+gi[aà]\s+messo\s+su)\b/i,
  /\b(?:completo|finisco)\s+(?:il\s+)?pasto\b/i,
];

/** Intent resoconto giornata / debrief serale. */
const DAY_REVIEW_PATTERNS = [
  /\bcom(?:e|'?è)\s+andat[ao]\s+oggi\b/i,
  /\bfammi\s+(?:il\s+)?resoconto\b/i,
  /\b(?:analisi|resoconto)\s+della\s+giornata\b/i,
  /\bho\s+fatt[oa]\s+tutto\s+bene\b/i,
  /\btiriamo\s+le\s+somme\b/i,
  /\b(?:review|debrief)(?:ing)?\b.*\b(?:oggi|giornata)\b/i,
];

/**
 * Proposta generica di pasto (es. "cosa mangio?", "cosa potrei mangiare per cena?").
 * @param {string} userText
 * @returns {boolean}
 */
export function isMealProposalQuery(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  return MEAL_PROPOSAL_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Richiesta di consiglio nutrizionale — DEVE routare a ASK_MEAL_ADVICE, non ADD_FOOD.
 * @param {string} userText
 * @returns {boolean}
 */
export function isMealAdviceIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;

  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) {
    return false;
  }

  if (isMealProposalQuery(text)) return true;
  return MEAL_ADVICE_EVALUATION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Registrazione pasto al diario (alimenti/quantità da aggiungere).
 * @param {string} userText
 * @returns {boolean}
 */
export function isFoodRegistrationIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isMealAdviceIntent(text)) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return true;
  return FOOD_REGISTRATION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Completamento pasto in corso: richiede integrazione, non registrazione e non proposta da zero.
 * Scatta solo se ci sono alimenti citati (idealmente con grammature).
 *
 * @param {string} userText
 * @returns {boolean}
 */
export function isMealCompletionIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (isMealAdviceIntent(text)) return false;

  const hasTrigger = MEAL_COMPLETION_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasTrigger) return false;

  // Richiede almeno un alimento citato. Preferiamo la presenza di grammature per poter calcolare residuo.
  const parsed = parseConsumedMealFromNaturalText(text);
  if (parsed?.items?.length) return true;

  // Fallback: se non parsea, ma ci sono grammature esplicite, consideralo comunque completamento.
  return WEIGHT_PATTERN.test(text);
}

/**
 * Debriefing / resoconto giornata.
 * @param {string} userText
 * @returns {boolean}
 */
export function isDayReviewIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (isFoodRegistrationIntent(text)) return false;
  if (isMealCompletionIntent(text)) return false;
  return DAY_REVIEW_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Richiesta scansione etichetta / creazione nuovo alimento da foto.
 * @param {string} userText
 * @returns {boolean}
 */
export function isCreateNewFoodIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  return (
    /\betichett/.test(text)
    || /\bvalori\s+nutriz/.test(text)
    || /\bmacro\b/.test(text)
    || /\bscansion/.test(text)
    || /\bnuovo\s+alimento\b/.test(text)
    || /\bcrea(?:re)?\s+alimento\b/.test(text)
  );
}

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
