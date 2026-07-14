import { parseMealTypeFromUserText } from './conversationState.js';
import { buildComputedMealNodes } from '../../../utils/mealNodeAggregation.js';
import { decimalToTimeStr, toCanonicalMealType } from '../../../coreEngine.jsx';

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

/** What-If / navigatore live: pasto in corso + aggiunte ipotetiche. */
const MEAL_DRAFT_EVALUATION_PATTERNS = [
  /\bsto\s+mangian\w+\b.*\b(?:vorrei|pensavo)\b/i,
  /\b(?:vorrei|pensavo)\s+(?:di\s+)?(?:mangiar\w*|aggiungere)\b/i,
  /\bho\s+preparat\w+.*\b(?:pensavo|vorrei)\s+(?:di\s+)?mangiar/i,
  /\bse\s+mangio\b.*\b(?:sforo|rientro|budget|kcal|calorie)\b/i,
  /\bse\s+mangio\b.*\?/i,
  /\bcome\s+sono\s+mess[oa]\b/i,
  /\b(?:mangio|aggiungo)\b.*\b(?:e\s+)?(?:poi|anche)\b.*\b(?:sforo|budget|kcal|come\s+sono)\b/i,
];

const DRAFT_PLANNED_SPLIT_MARKERS = [
  /\s+e\s+vorrei\s+aggiungere\s+(?:anche\s+)?/i,
  /\s+vorrei\s+aggiungere\s+(?:anche\s+)?/i,
  /\s+pensavo\s+di\s+mangiar(?:e)?\s+(?:anche\s+)?/i,
  /\s+e\s+pensavo\s+di\s+mangiar/i,
  /\s*,\s*pensavo\s+di\s+mangiar/i,
  /\s+se\s+mangio\s+/i,
];

const DRAFT_FRACTION_PATTERNS = [
  { pattern: /\b(?:mezza|metà|mezzo)\s+/i, multiplier: 0.5 },
  { pattern: /\bun\s+quarto\s+di\s+/i, multiplier: 0.25 },
  { pattern: /\btre\s+quarti\s+di\s+/i, multiplier: 0.75 },
  { pattern: /\b(?:una|un)\s+/i, multiplier: 1 },
];

const DRAFT_FOOD_DEFAULT_GRAMS = {
  pizza: 300,
  pasta: 200,
  riso: 180,
  pane: 50,
  patate: 200,
  gnocchi: 200,
};

/** Follow-up CTA del navigatore What-If: calcolo porzioni riparate. */
const FIX_MEAL_DRAFT_STRONG_PATTERNS = [
  /\b(?:s[iì]|ok)\s*,?\s*(?:calcola|calcolami)\s+(?:le\s+)?porzion/i,
  /\bcalcola\s+(?:le\s+)?porzioni\s+esatte\b/i,
  /\baggiust(?:a|ami)\s+(?:le\s+)?grammatur/i,
  /\btaglia\s+(?:per\s+)?(?:farmi\s+)?rientrar/i,
  /\bporzioni\s+esatte\b/i,
  /\brientra\s+nel\s+budget\b/i,
  /\b(?:s[iì]|ok)\s*,?\s*(?:fallo|procedi)\b/i,
];

const FIX_MEAL_DRAFT_WEAK_PATTERNS = [
  /\b(?:s[iì]|ok)\s+grazie\b/i,
  /\bfai\s+tu\b/i,
  /\b(?:s[iì]|ok)\b/i,
];

/** Follow-up CTA del navigatore What-If: sostituzione alimento problematico. */
const SUBSTITUTE_MEAL_DRAFT_STRONG_PATTERNS = [
  /\bsostituisci\b/i,
  /\brimuov\w*\b/i,
  /\btogli\b.*\b(?:e\s+)?(?:metti|sostitu)/i,
  /\bcambiamo\s+aliment/i,
  /\bcambia\s+aliment/i,
  /\bmetti\s+altro\b/i,
];

const SUBSTITUTE_MEAL_DRAFT_WEAK_PATTERNS = [
  /\bpreferisco\s+sostituir/i,
  /\bvoglio\s+sostituir/i,
  /\bsostituire\s+con\s+qualcos/i,
  /\bcon\s+qualcos['']?\s*altro\b/i,
  /\bqualcos['']?\s*altro\b/i,
];

/** Modifica contestuale di un pasto già registrato nel diario di oggi. */
const UPDATE_MEAL_TYPE_TOKEN_RE = '(?:colazione|pranzo|cena|snack(?:\\s+pomeridiano|\\s+mattutino)?|spuntino|merenda(?:\\s+pomeridiana|\\s+mattutina)?)';
const UPDATE_MEAL_TYPE_CAPTURE_RE = '(colazione|pranzo|cena|snack(?:\\s+pomeridiano|\\s+mattutino)?|spuntino|merenda(?:\\s+pomeridiana|\\s+mattutina)?)';
const UPDATE_MEAL_ARTICLE_RE = "(?:l['']|il\\s+|la\\s+|lo\\s+|i\\s+|gli\\s+|le\\s+)?";

const UPDATE_LOGGED_MEAL_PATTERNS = [
  new RegExp(`\\b(?:vorrei|voglio|devo|posso)\\s+(?:modificare|cambiare|aggiornare|correggere)\\s+${UPDATE_MEAL_ARTICLE_RE}(?:mio\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\bmodific\\w*\\s+${UPDATE_MEAL_ARTICLE_RE}(?:mio\\s+)?(?:pasto\\s+)?(?:di\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\b(?:aggiorn\\w*|corregg\\w*)\\s+${UPDATE_MEAL_ARTICLE_RE}(?:mio\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\b(?:aggiung\\w*|metti|inserisc\\w*)\\b.+\\b(?:al|alla|nel|nella|allo|alla)\\s+(?:mio\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\b(?:togli\\w*|rimuov\\w*|elimina\\w*)\\b.+\\b(?:dal|dalla|del|della|nel|nella)\\s+(?:mio\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\bho\\s+dimenticat\\w*\\s+(?:di\\s+)?(?:segnar\\w*|registr\\w*|aggiung\\w*|mangiare)\\b.+\\b(?:nel\\s+|nella\\s+|allo\\s+|alla\\s+)?${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
  new RegExp(`\\b(?:mancava|mancano|manca)\\b.+\\b(?:nel|nella|al|alla)\\s+${UPDATE_MEAL_TYPE_TOKEN_RE}\\b`, 'i'),
];

/** Stato conversazionale: Kentu attende dettagli modifica pasto. */
export const MEAL_UPDATE_WAITING_STATE = 'WAITING_FOR_UPDATE_DETAILS';

/** Stato conversazionale: più nodi dello stesso tipo, serve scelta orario. */
export const MEAL_UPDATE_DISAMBIGUATION_STATE = 'WAITING_FOR_MEAL_SLOT_SELECTION';

const UPDATE_TIME_QUALIFIER_PATTERNS = [
  { pattern: /\b(?:di|della|del|dell['']|al|alla|allo|in)\s+mattin[ao]\b|\bmattutin[ao]\b|\bal\s+mattino\b/i, qualifier: 'mattina' },
  { pattern: /\b(?:di|della|del|dell['']|al|alla|allo|in)\s+pomeriggio\b|\bpomeridian[ao]\b/i, qualifier: 'pomeriggio' },
  { pattern: /\b(?:di|della|del|dell['']|al|alla|allo|in)\s+sera\b|\bserale\b|\bserat[ao]\b|\bdella\s+notte\b/i, qualifier: 'sera' },
];

const UPDATE_MEAL_TYPE_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

const UPDATE_EXPLICIT_ACTION_PATTERNS = [
  /\b(?:aggiung\w*|metti|inserisc\w*)\b/i,
  /\b(?:togli\w*|rimuov\w*|elimina\w*|cancella\w*|sostituisc\w*)\b/i,
  /\b(?:cambiamo|cambia)\s+(?:il\s+|la\s+)?/i,
  /\b\d+\s*(?:g|grammi|gr)\b/i,
];

const UPDATE_MEAL_TYPE_CAPTURE_PATTERNS = [
  new RegExp(`\\b(?:al|alla|allo|nel|nella|nello|dal|dalla|del|della)\\s+(?:mio\\s+)?${UPDATE_MEAL_TYPE_CAPTURE_RE}\\b`, 'i'),
  new RegExp(`\\b(?:nello|nella)\\s+${UPDATE_MEAL_TYPE_CAPTURE_RE}\\b`, 'i'),
  new RegExp(`\\b(?:il|la|lo|l')\\s*(?:mio\\s+)?${UPDATE_MEAL_TYPE_CAPTURE_RE}\\b`, 'i'),
  new RegExp(`\\b(?:modific\\w*|aggiorn\\w*|corregg\\w*)\\s+${UPDATE_MEAL_ARTICLE_RE}(?:mio\\s+)?${UPDATE_MEAL_TYPE_CAPTURE_RE}\\b`, 'i'),
  new RegExp(`\\b${UPDATE_MEAL_TYPE_CAPTURE_RE}\\b`, 'i'),
];

const CANONICAL_UPDATE_MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

/**
 * Converge sinonimi/varianti testuali sulla chiave canonica del dailyLog (colazione|snack|pranzo|cena).
 * @param {string} raw
 * @returns {'colazione'|'snack'|'pranzo'|'cena'|null}
 */
function normalizeUpdateTargetMealType(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;

  if (CANONICAL_UPDATE_MEAL_TYPES.includes(text)) return text;

  if (/\b(snack\s+pomeridiano|merenda\s+pomeridiana|spuntino\s+pomeridiano)\b/.test(text)) {
    return 'snack';
  }
  if (/\b(snack\s+mattutino|merenda\s+mattutina|spuntino\s+mattutino)\b/.test(text)) {
    return 'snack';
  }
  if (/\b(spuntino|merenda)\b/.test(text)) return 'snack';
  if (/\bcolaz/.test(text)) return 'colazione';
  if (/\b(pranzo|mezzogiorno)\b/.test(text)) return 'pranzo';
  if (/\bcena\b/.test(text)) return 'cena';
  if (/\b(sera|serale)\b/.test(text) && !/\b(?:snack|spuntino|merenda|colazione|pranzo)\b/.test(text)) {
    return 'cena';
  }
  if (/\bsnack\b/.test(text)) return 'snack';

  const fromCanonicalMap = toCanonicalMealType(text.split(/\s+/)[0]);
  if (CANONICAL_UPDATE_MEAL_TYPES.includes(fromCanonicalMap)) return fromCanonicalMap;

  return parseMealTypeFromUserText(text);
}

/**
 * True se il testo assomiglia a una richiesta di modifica pasto loggato (senza follow-up chat).
 * @param {string} userText
 * @returns {boolean}
 */
function looksLikeUpdateLoggedMealRequest(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (!UPDATE_LOGGED_MEAL_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return Boolean(parseTargetMealTypeFromUpdateText(text)?.mealType);
}

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
export function isMealAdviceIntent(userText, chatHistory = []) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;

  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) {
    return false;
  }

  if (isMealDraftEvaluationIntent(text)) return false;
  if (isSubstituteMealDraftIntent(text, chatHistory)) return false;
  if (isFixMealDraftIntent(text, chatHistory)) return false;

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
  if (looksLikeUpdateLoggedMealRequest(text)) return false;
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
export function isMealDraftEvaluationIntent(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (DAY_REVIEW_PATTERNS.some((pattern) => pattern.test(text))) return false;

  if (/\b(?:cosa|che)\s+(?:aggiungo|metto)\s+a\b/i.test(text)) return false;
  if (/\bcome\s+integro\b/i.test(text)) return false;
  if (/\b(?:completo|finisco)\s+(?:il\s+)?pasto\b/i.test(text)) return false;

  const hasTrigger = MEAL_DRAFT_EVALUATION_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasTrigger) return false;

  const parsed = parseMealDraftProjectionFromText(text);
  return Boolean(parsed?.items?.length);
}

function wasLastAiMessageMealDraftEvaluation(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping) continue;
    if (entry.sender === 'user') return false;
    if (entry.sender !== 'ai') continue;
    return Boolean(entry?.mealDraftProjection?.items?.length)
      || /\b(?:porzioni\s+esatte|sostituire).*(?:qualcos|altro)\b/i.test(String(entry.text || ''));
  }
  return false;
}

/**
 * Recupera l'ultima bozza What-If dalla cronologia chat (proiezione risolta o testo utente).
 * @param {Array<object>} chatHistory
 * @returns {{ mealType?: string | null, items: Array<object>, exactTime?: string | null } | null}
 */
export function findLatestMealDraftProjectionFromChatHistory(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    const projection = entry?.mealDraftProjection;
    if (projection?.items?.length) {
      return {
        mealType: projection.mealType || null,
        items: projection.items,
        exactTime: projection.exactTime || null,
      };
    }
  }

  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (entry?.sender !== 'user') continue;
    const parsed = parseMealDraftProjectionFromText(entry.text);
    if (parsed?.items?.length) return parsed;
  }

  return null;
}

/**
 * Follow-up CTA: calcola porzioni esatte per rientrare nel budget.
 * @param {string} userText
 * @param {Array<object>} [chatHistory]
 * @returns {boolean}
 */
export function isFixMealDraftIntent(userText, chatHistory = []) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (DAY_REVIEW_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (!findLatestMealDraftProjectionFromChatHistory(chatHistory)) return false;
  if (isSubstituteMealDraftIntent(text, chatHistory)) return false;

  if (FIX_MEAL_DRAFT_STRONG_PATTERNS.some((pattern) => pattern.test(text))) return true;

  if (FIX_MEAL_DRAFT_WEAK_PATTERNS.some((pattern) => pattern.test(text))) {
    return wasLastAiMessageMealDraftEvaluation(chatHistory);
  }

  return false;
}

/**
 * Estrae dal testo utente il nome dell'alimento da sostituire (se esplicito).
 * @param {string} userText
 * @returns {string | null}
 */
export function parseRemovedFoodQueryFromSubstituteText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return null;

  const patterns = [
    /\bsostituisci\s+(?:la\s+|il\s+|l'|lo\s+|i\s+|gli\s+|le\s+)?([^?,.\n]+?)(?:\s+con\b|\s*$)/i,
    /\brimuov\w*\s+(?:la\s+|il\s+|l'|lo\s+|i\s+|gli\s+|le\s+)?([^?,.\n]+?)(?:\s+e\s+|\s+con\b|\s*$)/i,
    /\btogli\s+(?:la\s+|il\s+|l'|lo\s+|i\s+|gli\s+|le\s+)?([^?,.\n]+?)(?:\s+e\s+|\s+con\b|\s*$)/i,
    /\bcambiamo\s+(?:la\s+|il\s+|l'|lo\s+|i\s+|gli\s+|le\s+)?([^?,.\n]+?)(?:\s*$)/i,
    /\bcambia\s+(?:la\s+|il\s+|l'|lo\s+|i\s+|gli\s+|le\s+)?([^?,.\n]+?)(?:\s*$)/i,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (!match?.[1]) continue;
    const query = match[1]
      .trim()
      .replace(/\s+e\s+metti\s+altro.*/i, '')
      .replace(/\s+con\s+qualcos.*/i, '')
      .replace(/\s+con\s+altro.*/i, '')
      .trim();
    if (query.length >= 2 && !/^(?:aliment|qualcos|altro|solo|qualcosa)$/i.test(query)) {
      return query;
    }
  }

  return null;
}

function normalizeFoodToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function estimateDraftItemKcal(item) {
  const grams = Math.round(Number(item?.grams) || 0);
  if (grams <= 0) return 0;
  const kcalFromItem = Number(item?.kcal);
  if (Number.isFinite(kcalFromItem) && kcalFromItem > 0) return Math.round(kcalFromItem);
  const name = normalizeFoodToken(item?.foodName);
  if (/pizza|olio|noci|pesto|formagg|mandorl|burro/.test(name)) return Math.round(grams * 2.5);
  if (/pasta|riso|pane|patat|gnocch/.test(name)) return Math.round(grams * 1.3);
  return Math.round(grams * 1.5);
}

function estimateDraftItemFat(item) {
  const fatFromItem = Number(item?.fat ?? item?.fatTotal);
  if (Number.isFinite(fatFromItem) && fatFromItem >= 0) return fatFromItem;
  const name = normalizeFoodToken(item?.foodName);
  if (/pizza|olio|noci|pesto|formagg|mandorl|burro|edamame/.test(name)) {
    return Math.round((Number(item?.grams) || 100) * 0.15);
  }
  return 0;
}

/**
 * Trova l'alimento della bozza più "problematico" (kcal + grassi).
 * @param {Array<object>} draftItems
 * @returns {object | null}
 */
export function findMostProblematicDraftItem(draftItems = []) {
  const items = Array.isArray(draftItems) ? draftItems.filter(Boolean) : [];
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  let best = items[0];
  let bestScore = -1;
  items.forEach((item) => {
    const kcal = estimateDraftItemKcal(item);
    const fat = estimateDraftItemFat(item);
    const score = kcal + fat * 9;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });
  return best;
}

/**
 * Abbina un alimento della bozza a una query testuale.
 * @param {Array<object>} draftItems
 * @param {string} query
 * @returns {object | null}
 */
export function matchDraftItemByFoodQuery(draftItems = [], query) {
  const items = Array.isArray(draftItems) ? draftItems.filter(Boolean) : [];
  const q = normalizeFoodToken(query);
  if (!q || items.length === 0) return null;

  let best = null;
  let bestScore = 0;
  items.forEach((item) => {
    const name = normalizeFoodToken(item?.foodName);
    if (!name) return;
    if (name === q || name.includes(q) || q.includes(name)) {
      const score = Math.min(name.length, q.length);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
      return;
    }
    const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
    const hit = tokens.some((token) => name.includes(token));
    if (hit) {
      const score = tokens.reduce((acc, token) => (name.includes(token) ? acc + token.length : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  });

  return best;
}

/**
 * Risolve quale voce della bozza va sostituita.
 * @param {Array<object>} draftItems
 * @param {string} userText
 * @returns {object | null}
 */
export function resolveSubstituteRemovedItem(draftItems = [], userText) {
  const items = Array.isArray(draftItems) ? draftItems.filter(Boolean) : [];
  if (items.length === 0) return null;

  const query = parseRemovedFoodQueryFromSubstituteText(userText);
  if (query) {
    const matched = matchDraftItemByFoodQuery(items, query);
    if (matched) return matched;
  }

  return findMostProblematicDraftItem(items);
}

/**
 * Follow-up CTA: sostituire un alimento della bozza What-If con alternative.
 * @param {string} userText
 * @param {Array<object>} [chatHistory]
 * @returns {boolean}
 */
export function isSubstituteMealDraftIntent(userText, chatHistory = []) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (DAY_REVIEW_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (!findLatestMealDraftProjectionFromChatHistory(chatHistory)) return false;
  if (FIX_MEAL_DRAFT_STRONG_PATTERNS.some((pattern) => pattern.test(text))) return false;

  if (SUBSTITUTE_MEAL_DRAFT_STRONG_PATTERNS.some((pattern) => pattern.test(text))) return true;

  if (SUBSTITUTE_MEAL_DRAFT_WEAK_PATTERNS.some((pattern) => pattern.test(text))) {
    return wasLastAiMessageMealDraftEvaluation(chatHistory);
  }

  return false;
}

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
 * Estrae qualificatore temporale da una richiesta di modifica (mattina/pomeriggio/sera).
 * @param {string} userText
 * @returns {'mattina'|'pomeriggio'|'sera'|null}
 */
export function parseTimeQualifierFromUpdateText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return null;

  for (let i = 0; i < UPDATE_TIME_QUALIFIER_PATTERNS.length; i += 1) {
    const entry = UPDATE_TIME_QUALIFIER_PATTERNS[i];
    if (entry.pattern.test(text)) return entry.qualifier;
  }

  if (/\b(?:snack|merenda|spuntino)\s+mattutin[ao]\b/.test(text)) return 'mattina';
  if (/\b(?:snack|merenda|spuntino)\s+pomeridian[ao]\b/.test(text)) return 'pomeriggio';

  return null;
}

/**
 * Estrae tipo pasto e qualificatore temporale da una richiesta di modifica contestuale.
 * @param {string} userText
 * @returns {{ mealType: 'colazione'|'pranzo'|'cena'|'snack'|null, timeQualifier: 'mattina'|'pomeriggio'|'sera'|null }}
 */
export function parseTargetMealTypeFromUpdateText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return { mealType: null, timeQualifier: null };

  let mealType = null;
  for (let i = 0; i < UPDATE_MEAL_TYPE_CAPTURE_PATTERNS.length; i += 1) {
    const match = text.match(UPDATE_MEAL_TYPE_CAPTURE_PATTERNS[i]);
    const raw = String(match?.[1] || '').trim().toLowerCase();
    if (!raw) continue;
    const normalized = normalizeUpdateTargetMealType(raw);
    if (normalized) {
      mealType = normalized;
      break;
    }
  }

  if (!mealType) {
    mealType = normalizeUpdateTargetMealType(text) || parseMealTypeFromUserText(text);
  }

  let timeQualifier = parseTimeQualifierFromUpdateText(text);
  if (!timeQualifier && mealType === 'snack') {
    if (/\b(?:snack|merenda|spuntino)\s+mattutin[ao]\b/.test(text)) timeQualifier = 'mattina';
    if (/\b(?:snack|merenda|spuntino)\s+pomeridian[ao]\b/.test(text)) timeQualifier = 'pomeriggio';
  }

  return { mealType: mealType || null, timeQualifier: timeQualifier || null };
}

/**
 * Modifica contestuale di un pasto già loggato (aggiungi/togli/correggi su slot esistente).
 * Include follow-up quando l'IA è in WAITING_FOR_UPDATE_DETAILS.
 * @param {string} userText
 * @param {Array<object>} [chatHistory]
 * @returns {boolean}
 */
export function isUpdateLoggedMealIntent(userText, chatHistory = []) {
  if (findPendingUpdateLoggedMealContext(chatHistory)) return true;

  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text)) return false;
  if (isMealDraftEvaluationIntent(text)) return false;
  if (isMealCompletionIntent(text)) return false;
  if (isMealAdviceIntent(text)) return false;
  if (!UPDATE_LOGGED_MEAL_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return Boolean(parseTargetMealTypeFromUpdateText(text)?.mealType);
}

/**
 * True se l'utente ha specificato azioni/alimenti concreti per la modifica.
 * @param {string} userText
 * @returns {boolean}
 */
export function hasExplicitUpdateAction(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (UPDATE_EXPLICIT_ACTION_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const parsed = parseConsumedMealFromNaturalText(text);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) return false;

  const mealTokens = new Set(['colazione', 'pranzo', 'cena', 'snack', 'spuntino', 'merenda', 'pasto']);
  return items.some((item) => {
    const name = String(item?.foodName || '').trim().toLowerCase();
    return name && !mealTokens.has(name);
  });
}

/**
 * Recupera contesto modifica pasto in attesa dall'ultimo messaggio IA.
 * @param {Array<object>} chatHistory
 * @returns {object | null}
 */
export function findPendingUpdateLoggedMealContext(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping) continue;
    if (entry.sender === 'user') return null;
    if (entry.sender !== 'ai') continue;

    const pending = entry.pendingMealUpdate;
    if (
      pending
      && (
        pending.state === MEAL_UPDATE_WAITING_STATE
        || pending.state === MEAL_UPDATE_DISAMBIGUATION_STATE
      )
      && pending.targetMealType
    ) {
      return pending;
    }
    return null;
  }
  return null;
}

/**
 * Combina target pasto dalla memoria con il dettaglio fornito dall'utente.
 * @param {string} targetMealType
 * @param {string} userText
 * @returns {string}
 */
export function buildUpdateLoggedMealCombinedQuery(targetMealType, userText) {
  const meal = String(targetMealType || 'pasto').trim();
  const detail = String(userText || '').trim();
  if (!detail) return `modifica ${meal}`;
  return `Aggiungi al ${meal} esistente: ${detail}`;
}

/**
 * Messaggio di attesa dettagli modifica (con card preview locale al turno 1).
 * @param {string} targetMealType
 * @returns {string}
 */
export function buildUpdateWaitingPromptMessage(targetMealType) {
  const label = UPDATE_MEAL_TYPE_LABELS[String(targetMealType || '').toLowerCase()] || 'Pasto';
  return `Ho recuperato il tuo ${label}. Scrivimi cosa vuoi aggiungere o togliere, oppure usa il tasto Modifica qui sotto.`;
}

export function buildUpdateVagueFollowUpMessage(targetMealType) {
  const label = UPDATE_MEAL_TYPE_LABELS[String(targetMealType || '').toLowerCase()] || 'Pasto';
  return `Dimmi cosa aggiungere o togliere dal tuo ${label}.`;
}

function sumLoggedMealItemMacros(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    kcal: Math.round(list.reduce((sum, item) => sum + (Number(item?.kcal) || 0), 0)),
    pro: Math.round(list.reduce((sum, item) => sum + (Number(item?.pro) || 0), 0) * 10) / 10,
    carbo: Math.round(list.reduce((sum, item) => sum + (Number(item?.carbo) || 0), 0) * 10) / 10,
    fat: Math.round(list.reduce((sum, item) => sum + (Number(item?.fat) || 0), 0) * 10) / 10,
  };
}

function mapLoggedFoodRowToProposalItem(row) {
  if (!row || typeof row !== 'object') return null;
  const foodName = String(row.desc || row.name || '').trim();
  const grams = Math.round(Number(row.qta ?? row.weight) || 0);
  if (!foodName || grams <= 0) return null;
  return {
    foodName,
    foodDbKey: row.foodDbKey || row.matchedKey || row.dbKey || null,
    grams,
    kcal: Math.round(Number(row.kcal ?? row.cal) || 0),
    pro: Number(row.prot) || 0,
    carbo: Number(row.carb) || 0,
    fat: Number(row.fatTotal ?? row.fat) || 0,
  };
}

function formatMealNodeTimeLabel(node) {
  const exactTime = node?.exactTime
    || (Number.isFinite(Number(node?.mealTime)) ? decimalToTimeStr(Number(node.mealTime)) : null);
  return exactTime || '??:??';
}

/**
 * True se il timestamp decimale del pasto rientra nel qualificatore temporale.
 * @param {number} decimalHour
 * @param {'mattina'|'pomeriggio'|'sera'|null} timeQualifier
 * @returns {boolean}
 */
export function mealNodeMatchesTimeQualifier(decimalHour, timeQualifier) {
  const hour = Number(decimalHour);
  if (!timeQualifier || !Number.isFinite(hour)) return true;
  if (timeQualifier === 'mattina') return hour < 12;
  if (timeQualifier === 'pomeriggio') return hour >= 12 && hour <= 16;
  if (timeQualifier === 'sera') return hour > 16;
  return true;
}

function mapComputedNodeToExistingMealNode(node, canonicalTarget) {
  const items = (node.items || [])
    .map(mapLoggedFoodRowToProposalItem)
    .filter(Boolean);
  if (items.length === 0) return null;

  const mealTime = Number(node.time);
  const exactTime = Number.isFinite(mealTime) ? decimalToTimeStr(mealTime) : null;
  const mealType = String(node.mealType || canonicalTarget).split('_')[0];

  return {
    targetNodeId: String(node.id || node.mealId || ''),
    mealType: toCanonicalMealType(mealType) || canonicalTarget,
    mealSlotType: String(node.mealType || mealType),
    mealTime: Number.isFinite(mealTime) ? mealTime : null,
    exactTime,
    items,
    totals: sumLoggedMealItemMacros(items),
    source: 'active_log',
  };
}

function filterNodesByMealType(nodes, canonicalTarget) {
  return nodes.filter((node) => {
    const nodeCanonical = toCanonicalMealType(String(node?.mealType || '').split('_')[0]);
    if (canonicalTarget === 'snack') {
      return nodeCanonical === 'snack' || String(node?.mealType || '').startsWith('snack');
    }
    return nodeCanonical === canonicalTarget;
  });
}

/**
 * Risolve i nodi pasto esistenti nel diario di oggi per mealType (+ filtro temporale opzionale).
 * @param {Array<object>} activeLog
 * @param {string} targetMealType
 * @param {object} [fullHistory]
 * @param {string} [currentTrackerDate]
 * @param {{ timeQualifier?: 'mattina'|'pomeriggio'|'sera'|null }} [options]
 * @returns {{
 *   matches: Array<object>,
 *   allMatches: Array<object>,
 *   resolutionMethod: 'auto'|'ambiguous'|'no_match'|'none',
 *   timeQualifier: 'mattina'|'pomeriggio'|'sera'|null,
 *   selected: object | null,
 * }}
 */
export function resolveExistingMealNode(
  activeLog,
  targetMealType,
  fullHistory = {},
  currentTrackerDate = null,
  options = {},
) {
  const timeQualifier = options?.timeQualifier || null;
  const canonicalTarget = toCanonicalMealType(String(targetMealType || '').split('_')[0]);
  const emptyResult = {
    matches: [],
    allMatches: [],
    resolutionMethod: 'none',
    timeQualifier,
    selected: null,
  };

  if (!canonicalTarget || !Array.isArray(activeLog) || activeLog.length === 0) {
    return emptyResult;
  }

  const nodes = buildComputedMealNodes(activeLog, fullHistory, currentTrackerDate);
  const typeNodes = filterNodesByMealType(nodes, canonicalTarget);
  const allMatches = typeNodes
    .map((node) => mapComputedNodeToExistingMealNode(node, canonicalTarget))
    .filter(Boolean)
    .sort((a, b) => (Number(a?.mealTime) || 0) - (Number(b?.mealTime) || 0));

  if (allMatches.length === 0) {
    return emptyResult;
  }

  const filteredMatches = timeQualifier
    ? allMatches.filter((node) => mealNodeMatchesTimeQualifier(node.mealTime, timeQualifier))
    : allMatches;

  if (timeQualifier && filteredMatches.length === 0) {
    return {
      matches: [],
      allMatches,
      resolutionMethod: 'no_match',
      timeQualifier,
      selected: null,
    };
  }

  if (filteredMatches.length === 1) {
    return {
      matches: filteredMatches,
      allMatches,
      resolutionMethod: 'auto',
      timeQualifier,
      selected: filteredMatches[0],
    };
  }

  return {
    matches: filteredMatches,
    allMatches,
    resolutionMethod: 'ambiguous',
    timeQualifier,
    selected: null,
  };
}

/**
 * Messaggio quando esistono più nodi dello stesso tipo senza qualificatore temporale.
 * @param {string} targetMealType
 * @param {Array<object>} nodes
 * @returns {string}
 */
export function buildUpdateMealDisambiguationMessage(targetMealType, nodes = []) {
  const label = UPDATE_MEAL_TYPE_LABELS[String(targetMealType || '').toLowerCase()] || 'pasto';
  const sorted = [...nodes].sort((a, b) => (Number(a?.mealTime) || 0) - (Number(b?.mealTime) || 0));
  const countLabels = { 2: 'due', 3: 'tre', 4: 'quattro' };
  const countWord = countLabels[sorted.length] || String(sorted.length);
  const timesText = sorted.length === 2
    ? `ore ${formatMealNodeTimeLabel(sorted[0])} e ore ${formatMealNodeTimeLabel(sorted[1])}`
    : sorted.map((node) => `ore ${formatMealNodeTimeLabel(node)}`).join(', ');
  return `Ho trovato ${countWord} ${label.toLowerCase()} oggi (${timesText}). Quale vorresti modificare?`;
}

/**
 * Messaggio quando il qualificatore temporale non trova nodi, ma ne esistono altri.
 * @param {string} targetMealType
 * @param {'mattina'|'pomeriggio'|'sera'} timeQualifier
 * @param {Array<object>} allMatches
 * @returns {string}
 */
export function buildUpdateMealNoMatchMessage(targetMealType, timeQualifier, allMatches = []) {
  const label = UPDATE_MEAL_TYPE_LABELS[String(targetMealType || '').toLowerCase()] || 'pasto';
  const whenLabels = {
    mattina: 'in mattinata',
    pomeriggio: 'nel pomeriggio',
    sera: 'in serata',
  };
  const when = whenLabels[timeQualifier] || 'in quella fascia oraria';
  const sorted = [...allMatches].sort((a, b) => (Number(a?.mealTime) || 0) - (Number(b?.mealTime) || 0));

  if (sorted.length === 1) {
    return `Non trovo alcun ${label.toLowerCase()} registrato ${when}. Vuoi modificare quello delle ${formatMealNodeTimeLabel(sorted[0])}?`;
  }

  const alternatives = sorted
    .map((node) => `quello delle ${formatMealNodeTimeLabel(node)}`)
    .join(' o ');
  return `Non trovo alcun ${label.toLowerCase()} registrato ${when}. Vuoi modificare ${alternatives}?`;
}

/**
 * Risolve la scelta dell'utente tra più candidati (disambiguazione oraria).
 * @param {string} userText
 * @param {Array<object>} candidateNodes
 * @returns {object | null}
 */
export function resolveMealNodeFromDisambiguationResponse(userText, candidateNodes = []) {
  const candidates = Array.isArray(candidateNodes) ? candidateNodes.filter(Boolean) : [];
  if (candidates.length === 0) return null;

  const text = String(userText || '').trim().toLowerCase();
  if (!text) return null;

  const sorted = [...candidates].sort((a, b) => (Number(a?.mealTime) || 0) - (Number(b?.mealTime) || 0));

  const exactTime = parseExactTimeFromUserText(text);
  if (exactTime) {
    const exactMatch = sorted.find((node) => node.exactTime === exactTime);
    if (exactMatch) return exactMatch;
    const hourOnly = Number(exactTime.split(':')[0]);
    const hourMatches = sorted.filter((node) => Number(String(node.exactTime || '').split(':')[0]) === hourOnly);
    if (hourMatches.length === 1) return hourMatches[0];
  }

  const hourMatch = text.match(/\b(?:alle|ore|delle?|del|della)\s*(\d{1,2})(?:[:.,h](\d{2}))?\b/);
  if (hourMatch) {
    const targetHour = Number(hourMatch[1]);
    const targetMin = hourMatch[2] != null ? Number(hourMatch[2]) : null;
    const timeMatches = sorted.filter((node) => {
      const nodeTime = String(node.exactTime || '');
      const [h, m] = nodeTime.split(':').map((part) => Number(part));
      if (!Number.isFinite(h)) return false;
      if (targetMin != null && Number.isFinite(m)) {
        return h === targetHour && m === targetMin;
      }
      return h === targetHour;
    });
    if (timeMatches.length === 1) return timeMatches[0];
  }

  const qualifier = parseTimeQualifierFromUpdateText(text);
  if (qualifier) {
    const qualifierMatches = sorted.filter((node) => mealNodeMatchesTimeQualifier(node.mealTime, qualifier));
    if (qualifierMatches.length === 1) return qualifierMatches[0];
  }

  if (/\b(?:primo|1°|1o|mattutin[ao]|mattin[ao])\b/.test(text) && sorted[0]) return sorted[0];
  if (/\b(?:secondo|2°|2o|pomeridian[ao]|pomeriggio)\b/.test(text) && sorted[1]) return sorted[1];
  if (/\b(?:terzo|3°|3o)\b/.test(text) && sorted[2]) return sorted[2];
  if (/\b(?:ultimo|sera|serale)\b/.test(text) && sorted[sorted.length - 1]) return sorted[sorted.length - 1];

  if (/^(?:s[iì]|ok|va bene|certo)\b/.test(text) && sorted.length === 1) return sorted[0];

  return null;
}

/**
 * Risolve contesto update pasto (target, nodo, disambiguazione) da testo utente e stato pending.
 * @param {Array<object>} activeLog
 * @param {string} userText
 * @param {object} [fullHistory]
 * @param {string} [currentTrackerDate]
 * @param {object | null} [pendingUpdate]
 * @returns {object}
 */
export function resolveUpdateMealContext(
  activeLog,
  userText,
  fullHistory = {},
  currentTrackerDate = null,
  pendingUpdate = null,
) {
  const parsedTarget = parseTargetMealTypeFromUpdateText(userText);
  const targetMealType = parsedTarget?.mealType || pendingUpdate?.targetMealType || null;
  const timeQualifier = parsedTarget?.timeQualifier || pendingUpdate?.timeQualifier || null;

  if (
    pendingUpdate?.state === MEAL_UPDATE_DISAMBIGUATION_STATE
    && Array.isArray(pendingUpdate.candidateNodes)
    && pendingUpdate.candidateNodes.length > 0
  ) {
    const resolved = resolveMealNodeFromDisambiguationResponse(userText, pendingUpdate.candidateNodes);
    if (resolved) {
      return {
        targetMealType: pendingUpdate.targetMealType || resolved.mealType,
        timeQualifier: pendingUpdate.timeQualifier || timeQualifier,
        existingMealNode: resolved,
        resolution: {
          matches: [resolved],
          allMatches: pendingUpdate.candidateNodes,
          resolutionMethod: 'auto',
          timeQualifier: pendingUpdate.timeQualifier || timeQualifier,
          selected: resolved,
        },
        resolvedFromDisambiguation: true,
      };
    }
    return {
      targetMealType: pendingUpdate.targetMealType,
      timeQualifier: pendingUpdate.timeQualifier || timeQualifier,
      existingMealNode: null,
      resolution: null,
      disambiguationUnresolved: true,
      candidateNodes: pendingUpdate.candidateNodes,
    };
  }

  const resolution = resolveExistingMealNode(
    activeLog,
    targetMealType,
    fullHistory,
    currentTrackerDate,
    { timeQualifier },
  );

  const existingMealNode = resolution.selected
    || (resolution.resolutionMethod === 'auto' && resolution.matches.length === 1
      ? resolution.matches[0]
      : null)
    || pendingUpdate?.existingMealNode
    || null;

  return {
    targetMealType,
    timeQualifier,
    existingMealNode,
    resolution,
    resolvedFromDisambiguation: false,
  };
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

function pushUniqueItem(items, seen, foodName, grams, extra = {}) {
  const name = cleanFoodName(foodName);
  const g = Math.round(Number(grams));
  if (!name || !Number.isFinite(g) || g <= 0) return;
  const role = String(extra.role || 'draft').trim() || 'draft';
  const key = `${name.toLowerCase()}_${g}_${role}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ foodName: name, grams: g, role });
}

function defaultGramsForDraftFood(foodName) {
  const normalized = String(foodName || '').trim().toLowerCase();
  for (const [token, grams] of Object.entries(DRAFT_FOOD_DEFAULT_GRAMS)) {
    if (normalized.includes(token)) return grams;
  }
  return 100;
}

function stripDraftSegmentPrefixes(segmentText) {
  return String(segmentText || '')
    .replace(/\?.*$/, '')
    .replace(/^(?:sto\s+mangian\w+|ho\s+preparat\w+|se\s+mangio|vorrei\s+aggiungere(?:\s+anche)?|pensavo\s+di\s+mangiar(?:e)?(?:\s+anche)?)\s*/i, '')
    .replace(/^(?:anche\s+)/i, '')
    .replace(/\bcome\s+sono\s+mess[oa].*$/i, '')
    .replace(/\b(?:sforo|rientro|nel\s+budget|nelle\s+calorie).*$/i, '')
    .trim();
}

function splitDraftTextByRole(text) {
  for (let i = 0; i < DRAFT_PLANNED_SPLIT_MARKERS.length; i += 1) {
    const marker = DRAFT_PLANNED_SPLIT_MARKERS[i];
    const match = text.match(marker);
    if (!match || match.index == null) continue;

    const consumed = text.slice(0, match.index).trim();
    const planned = text.slice(match.index + match[0].length).trim();
    const segments = [];
    if (consumed) segments.push({ text: consumed, role: 'consumed' });
    if (planned) segments.push({ text: planned, role: 'planned' });
    if (segments.length > 0) return segments;
  }

  if (/\bse\s+mangio\b/i.test(text)) {
    return [{ text, role: 'planned' }];
  }
  if (/\bsto\s+mangian/i.test(text)) {
    return [{ text, role: 'consumed' }];
  }
  if (/\bho\s+preparat/i.test(text)) {
    return [{ text, role: 'consumed' }];
  }

  return [{ text, role: 'draft' }];
}

function extractGramItemsFromSegment(segmentText, role, items, seen) {
  const parsed = parseConsumedMealFromNaturalText(segmentText);
  if (!parsed?.items?.length) return;

  parsed.items.forEach((item) => {
    pushUniqueItem(items, seen, item.foodName, item.grams, { role });
  });
}

function extractBareFoodItemsFromSegment(segmentText, role, items, seen) {
  const cleaned = stripDraftSegmentPrefixes(segmentText);
  if (!cleaned) return;

  const parts = cleaned
    .split(/\s+e\s+|\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  parts.forEach((part) => {
    let fraction = 1;
    let foodPart = part;
    for (let i = 0; i < DRAFT_FRACTION_PATTERNS.length; i += 1) {
      const { pattern, multiplier } = DRAFT_FRACTION_PATTERNS[i];
      if (!pattern.test(foodPart)) continue;
      fraction = multiplier;
      foodPart = foodPart.replace(pattern, '').trim();
      break;
    }

    const name = cleanFoodName(foodPart);
    if (!name || name.length < 2) return;
    if (/^(?:se|come|sforo|budget|calorie|kcal)$/i.test(name)) return;

    const grams = Math.round(defaultGramsForDraftFood(name) * fraction);
    pushUniqueItem(items, seen, name, grams, { role });
  });
}

function extractItemsFromDraftSegment(segmentText, role, items, seen) {
  const beforeCount = items.length;
  extractGramItemsFromSegment(segmentText, role, items, seen);
  if (items.length === beforeCount) {
    extractBareFoodItemsFromSegment(segmentText, role, items, seen);
  }
}

/**
 * Estrae alimenti già in corso / ipotizzati per simulazione What-If.
 * @param {string} userText
 * @returns {{ mealType: string | null, items: Array<{ foodName: string, grams: number, role: string }>, exactTime: string | null } | null}
 */
export function parseMealDraftProjectionFromText(userText) {
  const text = String(userText || '').trim();
  if (!text) return null;

  const items = [];
  const seen = new Set();
  const segments = splitDraftTextByRole(text);

  segments.forEach((segment) => {
    extractItemsFromDraftSegment(segment.text, segment.role, items, seen);
  });

  if (items.length === 0) {
    extractItemsFromDraftSegment(text, 'draft', items, seen);
  }

  if (items.length === 0) return null;

  return {
    mealType: parseMealTypeFromUserText(text),
    items,
    exactTime: parseExactTimeFromUserText(text),
  };
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
