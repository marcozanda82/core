/**
 * Dizionario locale di saluti con auto-apprendimento (localStorage).
 * Intercetta i saluti puri prima di Gemini.
 */

export const GREETING_STORAGE_KEY = 'kentu_learned_greetings_v1';
export const GREETING_REPLY_ROTATION_KEY = 'kentu_greeting_reply_rotation_v1';
const LEARNED_CAP = 80;
const MAX_GREETING_CHARS = 48;
const MAX_GREETING_WORDS = 5;

/** Saluti seed — sempre presenti, anche senza localStorage. */
export const SEED_GREETINGS = Object.freeze([
  'ciao',
  'ciao kentu',
  'ciao kentuos',
  'buongiorno',
  'buongiorno kentu',
  'buonasera',
  'buonasera kentu',
  'buonanotte',
  'salve',
  'salve kentu',
  'hey',
  'ehi',
  'ehilà',
  'hola',
  'hello',
  'hi',
  'buondi',
  'buon pomeriggio',
  'buona giornata',
  'buona serata',
  'weila',
  'bella',
]);

const VOCATIVE_TOKENS = new Set([
  'kentu',
  'kentuos',
  'ghost',
  'ghostapp',
  'coach',
  'bot',
  'ai',
  'assistente',
  'assistant',
  'amico',
  'amica',
  'bello',
  'bella',
  'raga',
  'bro',
  'frate',
  'fra',
  'tesoro',
  'maestro',
  'doc',
  'dottore',
  'there',
]);

const NOVEL_STEMS = new Set([
  'ciao',
  'ciauz',
  'ciau',
  'ciaus',
  'hey',
  'helo',
  'hello',
  'hi',
  'hiya',
  'hola',
  'ehi',
  'ehila',
  'weila',
  'weilaoh',
  'ao',
  'aho',
  'yo',
  'salve',
  'saluti',
  'buongiorno',
  'buonasera',
  'buonanotte',
  'buondi',
  'gm',
  'gn',
  'morning',
  'evening',
  'bella',
]);

const BLOCKLIST = new Set([
  'ok',
  'okay',
  'okey',
  'si',
  'no',
  'annulla',
  'cancel',
  'stop',
  'grazie',
  'thanks',
  'perfetto',
  'confermo',
  'vai',
  'va',
  'bene',
  'sì',
]);

/** Contenuto che deve andare a Gemini / sous-chef / log. */
const COMPLEX_RE =
  /\b(mangiat|mangiare|mangiato|pranzo|cena|colazione|spuntino|snack|proteine?|kcal|calorie|macro|sonno|dormit|dormire|allenament|workout|cardio|cilindr|ho\s+(fatto|preso|bevut|completato)|registra|aggiung|inserisci|frigo|grammi|\d+\s*g\b|quanto|quante|consigli|cosa\s+(mangio|fare|posso)|pasto|diario|report|bollettino|glicem|insulina|digiuno)\b/i;

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

/**
 * Minuscolo, senza accenti, senza punteggiatura / emoji superflue.
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeGreetingText(text) {
  return asTrimmedString(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized) {
  return String(normalized || '').split(/\s+/).filter(Boolean);
}

function readLearnedList() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(GREETING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.greetings;
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => normalizeGreetingText(item))
      .filter(Boolean)
      .slice(0, LEARNED_CAP);
  } catch {
    return [];
  }
}

function writeLearnedList(list) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const unique = [];
    const seen = new Set();
    for (const item of list) {
      const norm = normalizeGreetingText(item);
      if (!norm || seen.has(norm) || SEED_GREETINGS.includes(norm)) continue;
      seen.add(norm);
      unique.push(norm);
      if (unique.length >= LEARNED_CAP) break;
    }
    window.localStorage.setItem(GREETING_STORAGE_KEY, JSON.stringify({
      v: 1,
      greetings: unique,
    }));
  } catch (error) {
    console.warn('[greetingMatcher] persist failed', error);
  }
}

/**
 * Seed + saluti imparati (normalizzati, unici).
 * @returns {string[]}
 */
export function getGreetingDictionary() {
  const seed = SEED_GREETINGS.map((item) => normalizeGreetingText(item)).filter(Boolean);
  const learned = readLearnedList();
  const seen = new Set();
  const out = [];
  for (const item of [...seed, ...learned]) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * @param {string} phrase
 * @returns {boolean} true se è stato aggiunto
 */
export function learnGreeting(phrase) {
  const norm = normalizeGreetingText(phrase);
  if (!norm || BLOCKLIST.has(norm) || COMPLEX_RE.test(norm)) return false;
  if (norm.length > MAX_GREETING_CHARS) return false;
  const dict = new Set(getGreetingDictionary());
  if (dict.has(norm)) return false;
  writeLearnedList([...readLearnedList(), norm]);
  return true;
}

function buildVocatives(displayName) {
  const set = new Set(VOCATIVE_TOKENS);
  const name = normalizeGreetingText(displayName).split(/\s+/)[0];
  if (name && name.length >= 2) set.add(name);
  return set;
}

function stripVocatives(normalized, vocatives) {
  const tokens = tokenize(normalized);
  const kept = tokens.filter((token) => !vocatives.has(token));
  return kept.join(' ');
}

function collapseRepeatsToKnown(normalized, dictSet) {
  const collapsed = String(normalized || '').replace(/(.)\1+/g, '$1');
  if (collapsed && dictSet.has(collapsed)) return collapsed;
  const endCollapsed = String(normalized || '').replace(/([a-z])\1+$/g, '$1');
  if (endCollapsed && dictSet.has(endCollapsed)) return endCollapsed;
  return normalized;
}

function findKnownGreeting(normalized, dictionary) {
  if (!normalized) return null;
  const dictSet = new Set(dictionary);
  const direct = collapseRepeatsToKnown(normalized, dictSet);
  if (dictSet.has(direct)) return direct;
  const tokens = tokenize(direct);
  if (tokens.length === 0) return null;
  // Prefisso: "ciao kentu come..." non deve matchare; qui `normalized` è già stripped.
  if (dictSet.has(tokens[0]) && tokens.length === 1) return tokens[0];
  return null;
}

function looksLikeNovelGreeting(normalized) {
  if (!normalized) return false;
  if (normalized.length > MAX_GREETING_CHARS) return false;
  const tokens = tokenize(normalized);
  if (tokens.length === 0 || tokens.length > MAX_GREETING_WORDS) return false;
  if (tokens.some((token) => BLOCKLIST.has(token))) return false;
  if (tokens.some((token) => /^\d+$/.test(token))) return false;
  return tokens.every((token) => {
    const collapsed = token.replace(/(.)\1+/g, '$1');
    return NOVEL_STEMS.has(token) || NOVEL_STEMS.has(collapsed);
  });
}

function hasComplexIntent(normalized, rawText) {
  if (COMPLEX_RE.test(normalized)) return true;
  const raw = asTrimmedString(rawText);
  if (/\?/.test(raw) && tokenize(normalized).length > 2) return true;
  if (tokenize(normalized).length > MAX_GREETING_WORDS) return true;
  return false;
}

function hourNow() {
  try {
    return new Date().getHours();
  } catch {
    return 12;
  }
}

/** Pool di benvenuto: nome + domanda di supporto (macro / giornata / log). */
export const GREETING_REPLY_POOLS = Object.freeze({
  generic: Object.freeze([
    'Ciao {name}! Come posso aiutarti oggi?',
    'Ciao {name}! Sono pronto. Vuoi controllare i macro o registrare qualcosa?',
    'Ehilà {name}! Come vanno le cose? Dimmi tutto.',
    'Ciao {name}, dimmi pure: facciamo il punto sulla giornata o partiamo da un pasto?',
    'Ciao {name}! Dimmi cosa ti serve: macro, un log, o un consiglio per il prossimo pasto?',
    'Ciao {name}, ci sono. Vuoi vedere come stiamo messi oggi o registriamo qualcosa?',
  ]),
  morning: Object.freeze([
    'Buongiorno {name}, dimmi pure: vuoi fare il punto sulla giornata o pensiamo al prossimo pasto?',
    'Buongiorno {name}! Come posso aiutarti oggi?',
    'Buongiorno {name}, sono qui. Controlliamo i macro o registriamo qualcosa?',
    'Ciao {name}, buon inizio. Vuoi vedere come stiamo messi o partiamo da colazione?',
    'Buongiorno {name}! Dimmi tutto: giornata, macro o un log veloce?',
  ]),
  afternoon: Object.freeze([
    'Ciao {name}! Come posso aiutarti oggi?',
    'Ciao {name}, dimmi pure: vuoi fare il punto sulla giornata o pensiamo alla cena?',
    'Ciao {name}! Sono pronto. Vuoi controllare i macro o registrare qualcosa?',
    'Ehilà {name}! Come vanno le cose? Facciamo il punto o partiamo da un pasto?',
    'Ciao {name}, ci sono. Macro, un log, o un consiglio per il prossimo pasto?',
  ]),
  evening: Object.freeze([
    'Buonasera {name}, dimmi pure: vuoi chiudere i macro o pensiamo alla cena?',
    'Buonasera {name}! Come posso aiutarti stasera?',
    'Ciao {name}, serata tranquilla: facciamo il punto o registriamo qualcosa?',
    'Buonasera {name}, sono pronto. Cena, macro o un log veloce?',
    'Ehilà {name}! Come vanno le cose? Dimmi tutto.',
  ]),
  night: Object.freeze([
    'Buonanotte {name}. Prima di chiudere: vuoi un ultimo log o il punto sulla giornata?',
    'Buonanotte {name}, a presto. Se ti serve, dimmi pure: sonno, macro o un log?',
    'Riposa bene {name}. Vuoi registrare il sonno o chiudiamo qui?',
    'Buonanotte {name}. Come posso aiutarti prima di chiudere?',
  ]),
});

function fillNameTemplate(template, name) {
  const raw = String(template || '');
  if (name) return raw.replaceAll('{name}', name);
  return raw
    .replaceAll(' {name}!', '!')
    .replaceAll(' {name}.', '.')
    .replaceAll(' {name},', ',')
    .replaceAll('{name}', '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function readReplyRotation() {
  if (typeof window === 'undefined' || !window.localStorage) return { lastIndex: -1, lastBucket: '' };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GREETING_REPLY_ROTATION_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return { lastIndex: -1, lastBucket: '' };
    return {
      lastIndex: Number.isFinite(Number(parsed.lastIndex)) ? Number(parsed.lastIndex) : -1,
      lastBucket: String(parsed.lastBucket || ''),
    };
  } catch {
    return { lastIndex: -1, lastBucket: '' };
  }
}

function writeReplyRotation(lastIndex, lastBucket) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(GREETING_REPLY_ROTATION_KEY, JSON.stringify({
      v: 1,
      lastIndex,
      lastBucket,
    }));
  } catch (error) {
    console.warn('[greetingMatcher] rotation persist failed', error);
  }
}

/**
 * Sceglie una risposta dal pool: prima casuale, poi rotazione sequenziale
 * (niente doppioni consecutivi, tutte le varianti nel giro).
 * @param {readonly string[]} pool
 * @param {string} bucket
 * @returns {string}
 */
export function pickGreetingReplyFromPool(pool, bucket = 'generic') {
  const list = Array.isArray(pool) && pool.length ? pool : GREETING_REPLY_POOLS.generic;
  const rotation = readReplyRotation();
  const idx = rotation.lastBucket === bucket && rotation.lastIndex >= 0
    ? (rotation.lastIndex + 1) % list.length
    : Math.floor(Math.random() * list.length);
  writeReplyRotation(idx, bucket);
  return list[idx];
}

function resolveGreetingBucket(phrase, hour) {
  if (/^buonanotte\b/.test(phrase)) return 'night';
  if (/^buonasera\b/.test(phrase) || /^buona serata\b/.test(phrase)) return 'evening';
  if (/^buongiorno\b/.test(phrase) || /^buondi\b/.test(phrase) || /^buona giornata\b/.test(phrase) || /^morning\b/.test(phrase)) {
    return 'morning';
  }
  if (/^buon pomeriggio\b/.test(phrase)) return 'afternoon';
  if (hour >= 22 || hour < 5) return 'night';
  if (hour >= 18) return 'evening';
  if (hour >= 5 && hour < 12) return 'morning';
  return 'afternoon';
}

/**
 * Risposta calda dal pool rotativo, con nome e domanda di supporto.
 * @param {string} matchedPhrase
 * @param {string} [displayName]
 * @returns {string}
 */
export function buildGreetingReply(matchedPhrase, displayName = '') {
  const name = asTrimmedString(displayName).split(/\s+/)[0] || '';
  const phrase = normalizeGreetingText(matchedPhrase);
  const bucket = resolveGreetingBucket(phrase, hourNow());
  const pool = GREETING_REPLY_POOLS[bucket] || GREETING_REPLY_POOLS.generic;
  return fillNameTemplate(pickGreetingReplyFromPool(pool, bucket), name);
}

/**
 * Se il messaggio è un saluto puro, restituisce la risposta locale.
 * Impara automaticamente le varianti nuove (weila, ciaooo, …).
 *
 * @param {unknown} userText
 * @param {{ displayName?: string }} [opts]
 * @returns {{ reply: string, learned: boolean, phrase: string } | null}
 */
export function matchLocalGreeting(userText, opts = {}) {
  const raw = asTrimmedString(userText);
  if (!raw) return null;

  const normalized = normalizeGreetingText(raw);
  if (!normalized) return null;
  if (hasComplexIntent(normalized, raw)) return null;

  const dictionary = getGreetingDictionary();
  const vocatives = buildVocatives(opts.displayName);
  const stripped = stripVocatives(normalized, vocatives) || normalized;

  const known = findKnownGreeting(stripped, dictionary)
    || findKnownGreeting(normalized, dictionary);
  if (known) {
    return {
      reply: buildGreetingReply(known, opts.displayName),
      learned: false,
      phrase: known,
    };
  }

  if (looksLikeNovelGreeting(stripped) || looksLikeNovelGreeting(normalized)) {
    const phrase = stripped || normalized;
    const learned = learnGreeting(phrase);
    return {
      reply: buildGreetingReply(phrase, opts.displayName),
      learned,
      phrase,
    };
  }

  return null;
}
