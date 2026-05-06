/**
 * Concetti alimentari minimali IT/EN per matching deterministico nel foodCommandEngine.
 * Nessuna dipendenza esterna.
 */

const ACCENT_REGEX = /[\u0300-\u036f]/g;

/** @type {Record<string, string[]>} chiave = id concetto canonico */
export const FOOD_CONCEPTS = Object.freeze({
  gelato: ['gelato', 'gelati', 'ice cream', 'icecream'],
  riso: ['riso', 'rice'],
  cioccolato: ['cioccolato', 'cacao', 'chocolate', 'cocoa'],
  yogurt: ['yogurt', 'yoghurt'],
  fragola: ['fragola', 'fragole', 'strawberry', 'strawberries'],
});

/** Stopword aggiuntive (oltre a quelle del motore) per normalizzazione concetto */
const EXTRA_SKIP = new Set([
  'e',
  'ed',
  'oppure',
  'o',
  'ecc',
  'the',
  'a',
  'an',
]);

/**
 * Mappa ogni termine (parola o frase) → id concetto.
 * Frasi multi-parola sono chiavi con spazio (es. "ice cream").
 */
export const TERM_TO_CONCEPT = (() => {
  /** @type {Record<string, string>} */
  const m = Object.create(null);
  const keys = Object.keys(FOOD_CONCEPTS);
  for (let i = 0; i < keys.length; i += 1) {
    const conceptId = keys[i];
    const arr = FOOD_CONCEPTS[conceptId];
    for (let j = 0; j < arr.length; j += 1) {
      const term = String(arr[j] ?? '')
        .trim()
        .toLowerCase();
      if (!term) continue;
      m[term] = conceptId;
    }
  }
  return Object.freeze(m);
})();

/** Frasi da sostituire prima dello split, ordinate per lunghezza decrescente */
const SORTED_PHRASES = (() => {
  const seen = new Set();
  const out = [];
  const conceptKeys = Object.keys(FOOD_CONCEPTS);
  for (let i = 0; i < conceptKeys.length; i += 1) {
    const cid = conceptKeys[i];
    const arr = FOOD_CONCEPTS[cid];
    for (let j = 0; j < arr.length; j += 1) {
      const term = String(arr[j] ?? '').trim().toLowerCase();
      if (term.includes(' ') && !seen.has(term)) {
        seen.add(term);
        out.push({ phrase: term, conceptId: cid });
      }
    }
  }
  out.sort((a, b) => b.phrase.length - a.phrase.length);
  return out;
})();

/**
 * Lowercase, NFD, rimuovi accenti.
 * @param {string} s
 */
function stripNorm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(/[''`´]/g, ' ');
}

/**
 * Sostituisce frasi note (es. "ice cream") con il token canonico del concetto.
 * @param {string} normalized lower, no accents
 */
export function applyFoodPhrases(normalized) {
  let t = String(normalized ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  for (let i = 0; i < SORTED_PHRASES.length; i += 1) {
    const { phrase, conceptId } = SORTED_PHRASES[i];
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`, 'gi');
    t = t.replace(re, (_, a, b) => {
      const padA = typeof a === 'string' ? a : '';
      const padB = typeof b === 'string' ? b : '';
      return `${padA}${conceptId}${padB}`;
    });
  }
  return t.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(x) {
  return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenizza dopo frasi; rimuove stopword (base + extra); mappa a id concetto dove definito.
 * @param {string} raw
 * @param {string[]} engineSkipTokens skipwords condivise col motore (SKIP_TOKENS)
 * @returns {string[]}
 */
export function toConceptTokenList(raw, engineSkipTokens = []) {
  const skip = new Set([...engineStopSet(engineSkipTokens), ...EXTRA_SKIP]);
  let s = stripNorm(raw);
  s = applyFoodPhrases(s);
  const rawParts = s.split(/\s+/);

  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < rawParts.length; i += 1) {
    let t = rawParts[i]
      .replace(/^[^a-z0-9àèéìòù]+/gi, '')
      .replace(/[^a-z0-9àèéìòù]+$/gi, '');
    if (t.length === 0) continue;
    if (skip.has(t)) continue;
    const mapped = TERM_TO_CONCEPT[t] ?? t;
    out.push(mapped);
  }
  return out;
}

function engineStopSet(arr) {
  const s = new Set();
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i += 1) s.add(String(arr[i]).toLowerCase());
  }
  return s;
}
