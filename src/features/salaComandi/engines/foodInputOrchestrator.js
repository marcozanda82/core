/**
 * Orchestrazione pura barra alimenti (classico + smart NL).
 * Nessuna UI, nessun Firebase, nessun side-effect.
 * Non collegato al runtime esistente: solo preparazione architetturale.
 */

/** Stopword minime per contare token “significativi” (allineate allo spirito food command). */
const SIGNIFICANT_TOKEN_STOP = new Set([
  'a',
  'al',
  'allo',
  'alla',
  'ai',
  'agli',
  'alle',
  'con',
  'da',
  'di',
  'del',
  'della',
  'delle',
  'dei',
  'in',
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'uno',
  'una',
  'e',
  'ed',
  'o',
  'oppure',
  'the',
]);

/** Quantità tipo 170g, 170 g, 200ml, 200 ml (anche decimali semplici). */
const QTY_UNIT =
  String.raw`\d+(?:[.,]\d+)?\s*(?:g\b|gramm(?:o|i)?\b|ml\b|millilitr[io]?\b)`;
const HAS_EXPLICIT_QTY = new RegExp(QTY_UNIT, 'i');
const STRIP_QTY_FOR_CLASSIC = new RegExp(QTY_UNIT, 'gi');

/** Separatore " e " tra parole (non inizio stringa rumoroso minimo). */
const HAS_E_SEPARATOR = /\s+e\s+/i;

const HAS_PLUS_SEPARATOR = /\+/;

function hasCommaSeparator(q) {
  if (!q.includes(',')) return false;
  const t = q.trim();
  if (/^\d+[.,]\d+$/.test(t)) return false;
  return true;
}

function normalizeQueryToken(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9']/gi, '')
    .trim();
}

/**
 * Token significativi dalla query (stopword escluse).
 * @param {string} query
 * @returns {string[]}
 */
function significantTokens(query) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const parts = q.split(/\s+/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const t = normalizeQueryToken(parts[i]);
    if (!t || t.length < 2) continue;
    if (SIGNIFICANT_TOKEN_STOP.has(t)) continue;
    if (/^\d+[.,]?\d*$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * @param {string} query
 * @returns {boolean}
 */
export function shouldRunSmartFoodInput(query) {
  const q = String(query ?? '').trim();
  if (!q) return false;

  if (HAS_EXPLICIT_QTY.test(q)) return true;
  if (HAS_E_SEPARATOR.test(q)) return true;
  if (hasCommaSeparator(q)) return true;
  if (HAS_PLUS_SEPARATOR.test(q)) return true;

  const sig = significantTokens(q);
  if (sig.length >= 3) return true;
  if (sig.length <= 2) return false;

  return false;
}

/**
 * Estrae una query corta per la ricerca classica (quantità, separatori elenco, più alimenti).
 * @param {string} query
 * @returns {string}
 */
export function deriveClassicSearchQuery(query) {
  const original = String(query ?? '').trim();
  if (!original) return original;

  let s = original.replace(STRIP_QTY_FOR_CLASSIC, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const segments = s.split(/\s+e\s+|,|\+|\//i);
  let seg = (segments[0] ?? '').trim();

  const words = seg.split(/\s+/).filter(Boolean);
  if (words.length >= 3) seg = words[0] ?? '';

  seg = String(seg).trim();
  return seg || original;
}

/**
 * @param {*} fn
 * @returns {boolean}
 */
function isFn(fn) {
  return typeof fn === 'function';
}

/**
 * @param {*} x
 * @returns {any[]}
 */
function asArray(x) {
  if (Array.isArray(x)) return x;
  return [];
}

/**
 * @param {object} input
 * @param {string} [input.query]
 * @param {Record<string, unknown>} [input.foodDb]
 * @param {unknown[]} [input.flatLog]
 * @param {(ctx: { query: string, foodDb: Record<string, unknown>, flatLog: unknown[], maxClassicResults: number }) => unknown} [input.classicSearchFn]
 * @param {(ctx: { text: string, foodDb: Record<string, unknown>, flatLog: unknown[] }) => unknown} [input.smartParseFn]
 * @param {number} [input.maxClassicResults]
 * @returns {{
 *   query: string,
 *   mode: 'classic_only' | 'mixed' | 'smart_only',
 *   shouldShowSmartSuggestion: boolean,
 *   classicCandidates: unknown[],
 *   smartSuggestion: unknown | null,
 *   debug: object
 * }}
 */
export function orchestrateFoodInput(input = {}) {
  const query = String(input.query ?? '').trim();
  const foodDb =
    input.foodDb != null && typeof input.foodDb === 'object' && !Array.isArray(input.foodDb)
      ? input.foodDb
      : {};
  const flatLog = Array.isArray(input.flatLog) ? input.flatLog : [];
  const maxClassicResults =
    Number.isFinite(input.maxClassicResults) && input.maxClassicResults > 0
      ? Math.floor(input.maxClassicResults)
      : 8;

  const shouldRunSmart = shouldRunSmartFoodInput(query);

  /** @type {unknown[]} */
  let classicCandidates = [];
  if (isFn(input.classicSearchFn)) {
    try {
      const raw = input.classicSearchFn({
        query,
        foodDb,
        flatLog,
        maxClassicResults,
      });
      classicCandidates = asArray(raw).slice(0, maxClassicResults);
    } catch {
      classicCandidates = [];
    }
  }

  /** @type {unknown | null} */
  let smartSuggestion = null;
  if (shouldRunSmart && isFn(input.smartParseFn)) {
    try {
      smartSuggestion = input.smartParseFn({
        text: query,
        foodDb,
        flatLog,
      });
    } catch {
      smartSuggestion = null;
    }
  }

  const hasSmartPayload = smartSuggestion != null;
  const shouldShowSmartSuggestion = shouldRunSmart && hasSmartPayload;

  /** @type {'classic_only' | 'mixed' | 'smart_only'} */
  let mode = 'classic_only';
  if (shouldRunSmart && hasSmartPayload) {
    if (classicCandidates.length > 0) mode = 'mixed';
    else mode = 'smart_only';
  }

  const smartStatus =
    smartSuggestion != null &&
    typeof smartSuggestion === 'object' &&
    'status' in smartSuggestion
      ? /** @type {{ status?: string }} */ (smartSuggestion).status
      : null;

  const debug = import.meta.env?.DEV
    ? {
        query,
        shouldRunSmart,
        classicCount: classicCandidates.length,
        smartStatus,
      }
    : {};

  return {
    query,
    mode,
    shouldShowSmartSuggestion,
    classicCandidates,
    smartSuggestion,
    debug,
  };
}
