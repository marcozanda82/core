/**
 * Arricchimento semantico alimenti → Kentu DB (CREA + dataset italiano + personale).
 * 1) Normalizzazione ortografica Gemini
 * 2) Filtro locale candidati Kentu IT
 * 3) Ranking Gemini (top 3 confidence)
 */

import { askAI } from '../../../services/aiService.js';
import { normalizeSearchText, searchFoodsDetailed } from '../../../foodSearch.js';
import { TARGETS } from '../../../useBiochimico.js';
import {
  buildPer100TargetNutrientsFromRow,
  pickFiniteNumber,
} from './foodMacroUtils.js';

const GEMINI_MATCH_MODEL = 'gemini-3.7-flash';
const DEFAULT_LOCAL_CANDIDATE_LIMIT = 20;
const DEFAULT_GEMINI_TOP = 3;

/** Correzioni locali immediate (evita chiamata AI per typo comuni). */
const LOCAL_FOOD_TYPO_MAP = Object.freeze({
  mordadella: 'mortadella',
  mortadela: 'mortadella',
  proscuitto: 'prosciutto',
  mozarella: 'mozzarella',
  mozzarela: 'mozzarella',
  pana: 'pane',
});

/** Cache di sessione: evita askAI duplicati per stringhe già normalizzate/rankate. */
const SPELLING_NORMALIZE_SESSION_CACHE = new Map();
const GEMINI_RANK_SESSION_CACHE = new Map();
const SEMANTIC_MATCH_SESSION_CACHE = new Map();
const SESSION_CACHE_MAX = 200;

function rememberSessionCache(map, key, value) {
  if (!key) return value;
  if (map.size >= SESSION_CACHE_MAX) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  map.set(key, value);
  return value;
}

function buildRankCacheKey(productName, candidates) {
  const q = normalizeSearchText(productName);
  const ids = (Array.isArray(candidates) ? candidates : [])
    .slice(0, DEFAULT_LOCAL_CANDIDATE_LIMIT)
    .map((c) => String(c?.fdcId || '').trim())
    .filter(Boolean)
    .join(',');
  return `${q}::${ids}`;
}

/** Soglia oltre la quale un DB è trattato come catalogo pesante (cap scan). */
const HEAVY_DB_ENTRY_THRESHOLD = 5000;
const HEAVY_DB_MAX_SCAN = 4000;

/** Brand / voci USA da escludere dal fallback Kentu. */
const FOREIGN_JUNK_RE = /\b(?:applebee|nutri-?grain|mcdonald|burger\s*king|kellogg|subway|starbucks|domino'?s|taco\s*bell|wendy'?s|pizza\s*hut)\b/i;

const SPELLING_NORMALIZE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    normalized: { type: 'STRING' },
    tokens: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['normalized', 'tokens'],
};

/**
 * Corregge typo italiani e separa ingredienti multipli (es. «mordadella» → «mortadella»).
 * @param {string} rawText
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ normalized: string, tokens: string[] }>}
 */
export async function normalizeIngredientSpellingWithGemini(rawText, opts = {}) {
  const text = String(rawText || '').trim();
  if (!text) return { normalized: '', tokens: [] };

  const cacheKey = normalizeSearchText(text);
  if (cacheKey && SPELLING_NORMALIZE_SESSION_CACHE.has(cacheKey)) {
    return SPELLING_NORMALIZE_SESSION_CACHE.get(cacheKey);
  }

  const quickTokens = text
    .split(/\s*(?:,|;|\be\b|\bed\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const word = part.toLowerCase().replace(/^(?:di|un|una|il|lo|la|i|gli|le)\s+/i, '').trim();
      return LOCAL_FOOD_TYPO_MAP[word] || part;
    });

  const allLocalFixed = quickTokens.every((t, i) => {
    const raw = text.split(/\s*(?:,|;|\be\b|\bed\b)\s*/i)[i]?.trim().toLowerCase() || '';
    const key = raw.replace(/^(?:di|un|una|il|lo|la|i|gli|le)\s+/i, '').trim();
    return LOCAL_FOOD_TYPO_MAP[key] || quickTokens.length === 1;
  });

  if (quickTokens.length > 0 && text.length <= 48 && allLocalFixed) {
    const normalized = quickTokens.join(' e ');
    return rememberSessionCache(SPELLING_NORMALIZE_SESSION_CACHE, cacheKey, {
      normalized,
      tokens: quickTokens,
    });
  }

  try {
    const systemInstruction = [
      'Sei un normalizzatore di nomi alimentari italiani.',
      'Correggi errori ortografici comuni (es. mordadella→mortadella).',
      'Restituisci SOLO JSON: normalized (frase corretta) e tokens (lista ingredienti separati).',
      'Ignora inglese/brand USA: preferisci voci alimentari italiane generiche.',
    ].join(' ');

    const raw = await askAI(
      `Normalizza per lookup nutrizionale Kentu DB:\n${JSON.stringify(text)}`,
      systemInstruction,
      {
        model: GEMINI_MATCH_MODEL,
        temperature: 0,
        responseSchema: SPELLING_NORMALIZE_SCHEMA,
        signal: opts.signal,
      },
    );

    const parsed = JSON.parse(String(raw || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const normalized = String(parsed?.normalized || text).trim() || text;
    const tokens = Array.isArray(parsed?.tokens)
      ? parsed.tokens.map((t) => String(t || '').trim()).filter(Boolean)
      : quickTokens.length ? quickTokens : [normalized];
    return rememberSessionCache(SPELLING_NORMALIZE_SESSION_CACHE, cacheKey, {
      normalized,
      tokens,
    });
  } catch (error) {
    console.warn('[SemanticMatchmaker] spelling normalize fallback', error);
    return rememberSessionCache(SPELLING_NORMALIZE_SESSION_CACHE, cacheKey, {
      normalized: quickTokens.join(' e ') || text,
      tokens: quickTokens.length ? quickTokens : [text],
    });
  }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isLikelyForeignJunkFoodName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (FOREIGN_JUNK_RE.test(n)) return true;
  if (/^[A-Z0-9][A-Z0-9\s'&-]{10,}$/.test(n) && !/[àèéìòù]/i.test(n)) return true;
  if (/\b(?:restaurant|grill|kitchen|foods,? inc)\b/i.test(n)) return true;
  return false;
}

/**
 * Unisce Kentu DB IT (CREA) + DB personale. Esclude il master globale USDA.
 * @param {Record<string, object>|null|undefined} kentuItDb
 * @param {Record<string, object>|null|undefined} personalDb
 */
export function mergeKentuSearchDatabases(kentuItDb, personalDb) {
  const it = kentuItDb && typeof kentuItDb === 'object' ? kentuItDb : {};
  const personal = personalDb && typeof personalDb === 'object' ? personalDb : {};
  return { ...it, ...personal };
}

/** Chiavi etichetta OFF da non sovrascrivere se presenti. */
const OFF_LOCKED_KEYS = new Set([
  'kcal',
  'cal',
  'prot',
  'carb',
  'fat',
  'fatTotal',
  'fatTot',
  'fibre',
  'fiber',
  'fibreTotali',
  'na',
  'sale',
  'sodium',
]);

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };

const SEMANTIC_MATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          fdcId: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          reason: { type: 'STRING' },
        },
        required: ['fdcId', 'confidence', 'reason'],
      },
    },
  },
  required: ['matches'],
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasFiniteNutrient(value) {
  return pickFiniteNumber(value) != null;
}

/**
 * @param {Record<string, unknown> | null | undefined} offProduct
 * @param {string} key
 */
function offHasLockedValue(offProduct, key) {
  if (!offProduct || typeof offProduct !== 'object') return false;
  if (key === 'fat' || key === 'fatTotal' || key === 'fatTot') {
    return (
      hasFiniteNutrient(offProduct.fatTotal)
      || hasFiniteNutrient(offProduct.fat)
      || hasFiniteNutrient(offProduct.fatTot)
    );
  }
  if (key === 'fibre' || key === 'fiber' || key === 'fibreTotali') {
    return (
      hasFiniteNutrient(offProduct.fibre)
      || hasFiniteNutrient(offProduct.fiber)
      || hasFiniteNutrient(offProduct.fibreTotali)
    );
  }
  if (key === 'na' || key === 'sale' || key === 'sodium') {
    return (
      hasFiniteNutrient(offProduct.na)
      || hasFiniteNutrient(offProduct.sale)
      || hasFiniteNutrient(offProduct.sodium)
    );
  }
  if (key === 'kcal' || key === 'cal') {
    return hasFiniteNutrient(offProduct.kcal) || hasFiniteNutrient(offProduct.cal);
  }
  return hasFiniteNutrient(offProduct[key]);
}

/**
 * @param {string} raw
 */
function unwrapJsonText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return text;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ fdcId: string, confidence: 'high'|'medium'|'low', reason: string }>}
 */
function parseGeminiMatches(raw) {
  const text = unwrapJsonText(raw);
  if (!text) return [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  const list = Array.isArray(parsed?.matches)
    ? parsed.matches
    : Array.isArray(parsed)
      ? parsed
      : [];

  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const fdcId = String(item.fdcId ?? item.id ?? '').trim();
      if (!fdcId) return null;
      const confidenceRaw = String(item.confidence || 'low').toLowerCase();
      const confidence =
        confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
          ? confidenceRaw
          : 'low';
      return {
        fdcId,
        confidence,
        reason: String(item.reason || '').trim() || 'Match suggerito dall\'AI',
      };
    })
    .filter(Boolean);
}

/**
 * Riduce rumore commerciale dalla query (marca, taglia, %).
 * @param {string} productName
 */
export function sanitizeProductNameForSearch(productName) {
  return String(productName || '')
    .replace(/\b\d+\s*(?:g|kg|ml|cl|l|oz)\b/gi, ' ')
    .replace(/\b\d+\s*%/g, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match letterale esatto su un DB (case/accenti ignorati).
 * Es. "fette biscottate" → "Fette biscottate".
 * Priorità assoluta alla stringa intera: "fagioli" ≠ "fagiolini".
 *
 * @param {string} foodName
 * @param {Record<string, object>|null|undefined} foodDb
 * @returns {{ fdcId: string, name: string, confidence: 'high', reason: string, row: object } | null}
 */
export function findExactLiteralFoodInDb(foodName, foodDb, opts = {}) {
  const needle = normalizeSearchText(foodName);
  if (!needle || !foodDb || typeof foodDb !== 'object') return null;

  const entries = Object.entries(foodDb);
  const maxScan = Number.isFinite(opts.maxEntriesToScan) && opts.maxEntriesToScan > 0
    ? Math.floor(opts.maxEntriesToScan)
    : (entries.length > HEAVY_DB_ENTRY_THRESHOLD ? HEAVY_DB_MAX_SCAN : entries.length);
  const scanEnd = Math.min(entries.length, maxScan);

  for (let i = 0; i < scanEnd; i += 1) {
    const [id, food] = entries[i];
    if (!food || typeof food !== 'object') continue;

    const descName = String(food.desc || '').trim();
    const altName = String(food.name || '').trim();
    const keyAsName = String(id || '').trim();
    const keyLooksLikeName = keyAsName.length >= 2
      && !/^\d+$/.test(keyAsName)
      && !/^food[_-]?\d+/i.test(keyAsName)
      && /[\p{L}]/u.test(keyAsName);

    const candidates = [
      descName,
      altName,
      keyLooksLikeName ? keyAsName.replace(/[_-]+/g, ' ') : '',
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (normalizeSearchText(candidate) !== needle) continue;
      const displayName = descName || altName || candidate;
      const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? '').trim() || String(id);
      return {
        fdcId,
        name: displayName,
        confidence: 'high',
        reason: 'Match letterale esatto',
        row: {
          ...food,
          id: food.id ?? id,
          fdcId,
          foodDbKey: food.foodDbKey ?? fdcId,
          desc: food.desc || displayName,
          name: food.name || displayName,
        },
      };
    }
  }

  return null;
}

/**
 * True se `needle` è un token intero in `haystack` (evita fagioli→fagiolini via prefisso).
 * @param {string} needle
 * @param {string} haystack
 */
export function isWholeTokenFoodMatch(needle, haystack) {
  const n = normalizeSearchText(needle);
  const h = normalizeSearchText(haystack);
  if (!n || !h) return false;
  if (n === h) return true;
  const tokens = h.split(/\s+/).filter(Boolean);
  return tokens.some((t) => t === n);
}

/**
 * True se needle è prefisso stretto di un token più lungo (collisione tipica stemming).
 * @param {string} needle
 * @param {string} haystack
 */
export function isPrefixTokenCollision(needle, haystack) {
  const n = normalizeSearchText(needle);
  const h = normalizeSearchText(haystack);
  if (!n || !h || n === h) return false;
  const tokens = h.split(/\s+/).filter(Boolean);
  return tokens.some((t) => t.length > n.length && t.startsWith(n) && !isWholeTokenFoodMatch(n, t));
}

/**
 * Ricerca veloce: exact / starts-with / whole-token (senza fuzzy pesante).
 * @param {string} foodName
 * @param {Record<string, object>|null|undefined} foodDb
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ fdcId: string, name: string, confidence: string, reason: string, row: object, matchKind: string }>}
 */
export function findFastLexicalFoodMatches(foodName, foodDb, opts = {}) {
  const needle = normalizeSearchText(foodName);
  const limit = Math.min(8, Math.max(1, Number(opts.limit) || 4));
  if (!needle || !foodDb || typeof foodDb !== 'object') return [];

  const exact = [];
  const wholeToken = [];
  const startsWith = [];

  const entries = Object.entries(foodDb);
  const maxScan = Number.isFinite(opts.maxEntriesToScan) && opts.maxEntriesToScan > 0
    ? Math.floor(opts.maxEntriesToScan)
    : (entries.length > HEAVY_DB_ENTRY_THRESHOLD ? HEAVY_DB_MAX_SCAN : entries.length);
  const scanEnd = Math.min(entries.length, maxScan);

  for (let i = 0; i < scanEnd; i += 1) {
    const [id, food] = entries[i];
    if (!food || typeof food !== 'object') continue;
    const descName = String(food.desc || '').trim();
    const altName = String(food.name || '').trim();
    const displayName = descName || altName;
    if (!displayName) continue;
    const norm = normalizeSearchText(displayName);
    if (!norm) continue;

    // Scarta collisioni prefisso (fagioli vs fagiolini) salvo match intero.
    if (isPrefixTokenCollision(needle, norm) && !isWholeTokenFoodMatch(needle, norm)) {
      continue;
    }

    const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? '').trim() || String(id);
    const row = {
      ...food,
      id: food.id ?? id,
      fdcId,
      foodDbKey: food.foodDbKey ?? fdcId,
      desc: food.desc || displayName,
      name: food.name || displayName,
    };
    const base = {
      fdcId,
      name: displayName,
      confidence: 'high',
      row,
    };

    if (norm === needle) {
      exact.push({ ...base, reason: 'Match letterale esatto', matchKind: 'exact' });
    } else if (isWholeTokenFoodMatch(needle, norm)) {
      wholeToken.push({ ...base, reason: 'Match token intero', matchKind: 'whole_token' });
    } else if (norm.startsWith(`${needle} `) || norm.startsWith(needle)) {
      // starts-with solo se non è collisione tipo "fagiolo"→"fagiolini"
      if (norm === needle || norm.startsWith(`${needle} `) || /\s/.test(norm.slice(needle.length, needle.length + 1))) {
        startsWith.push({
          ...base,
          confidence: 'high',
          reason: 'Match inizia-con',
          matchKind: 'starts_with',
        });
      }
    }

    if (exact.length + wholeToken.length + startsWith.length >= limit * 3) {
      break;
    }
  }

  return [...exact, ...wholeToken, ...startsWith].slice(0, limit);
}

/**
 * Filtro locale: top N candidati Kentu DB (CREA IT + personale).
 *
 * @param {string} productName
 * @param {Record<string, object> | null | undefined} searchDb
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ fdcId: string, name: string, row: object }>>}
 */
export async function findLocalKentuCandidates(productName, searchDb, opts = {}) {
  const limit = Math.min(
    40,
    Math.max(5, Number(opts.limit) || DEFAULT_LOCAL_CANDIDATE_LIMIT),
  );
  const query = sanitizeProductNameForSearch(productName);
  if (!query || !searchDb || typeof searchDb !== 'object') return [];

  const hits = searchFoodsDetailed(searchDb, query, {
    includeUserHistory: true,
    limit: limit * 2,
    mode: 'search',
  });

  return hits
    .filter((hit) => !isLikelyForeignJunkFoodName(hit.name))
    .slice(0, limit)
    .map((hit) => {
      const row = searchDb[hit.id] || {};
      const fdcId = String(row.fdcId ?? row.id ?? hit.id ?? '').trim() || String(hit.id);
      const name = String(row.desc || row.name || hit.name || fdcId).trim();
      return { fdcId, name, row: { ...row, id: hit.id, fdcId } };
    });
}

/** @deprecated Usa findLocalKentuCandidates */
export async function findLocalUsdaCandidates(productName, masterDb, opts = {}) {
  return findLocalKentuCandidates(productName, masterDb, opts);
}

/**
 * Chiede a Gemini di scegliere fino a 3 match biochimici tra i candidati.
 *
 * @param {string} productName
 * @param {Array<{ fdcId: string, name: string }>} candidates
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function rankKentuCandidatesWithGemini(productName, candidates, opts = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!String(productName || '').trim() || list.length === 0) return [];

  const compact = list.slice(0, DEFAULT_LOCAL_CANDIDATE_LIMIT).map((c) => ({
    fdcId: String(c.fdcId),
    name: String(c.name),
  }));

  const rankKey = buildRankCacheKey(productName, compact);
  if (rankKey && GEMINI_RANK_SESSION_CACHE.has(rankKey)) {
    return GEMINI_RANK_SESSION_CACHE.get(rankKey);
  }

  const systemInstruction = [
    'Sei un matchmaker nutrizionale Kentu (database CREA italiano).',
    'Confronta un alimento citato dall\'utente con voci Kentu DB già filtrate.',
    'Escludi catene USA, brand fast-food e prodotti non pertinenti.',
    'Restituisci SOLO JSON conforme allo schema. Massimo 3 match.',
    'confidence: high = profilo quasi identico; medium = generico vs specifico; low = debole.',
    'Se nessun candidato è ragionevole, restituisci matches: [].',
  ].join(' ');

  const prompt = [
    `Alimento richiesto: ${JSON.stringify(String(productName).trim())}`,
    'Candidati Kentu DB (solo id + nome):',
    JSON.stringify(compact),
    'Scegli fino a 3 match migliori. Usa solo fdcId presenti nella lista.',
  ].join('\n');

  const raw = await askAI(prompt, systemInstruction, {
    model: GEMINI_MATCH_MODEL,
    temperature: 0.1,
    responseSchema: SEMANTIC_MATCH_RESPONSE_SCHEMA,
    signal: opts.signal,
  });

  const allowed = new Set(compact.map((c) => c.fdcId));
  const ranked = parseGeminiMatches(raw)
    .filter((m) => allowed.has(m.fdcId))
    .sort((a, b) => (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9))
    .slice(0, DEFAULT_GEMINI_TOP);

  return rememberSessionCache(GEMINI_RANK_SESSION_CACHE, rankKey, ranked);
}

/** @deprecated Usa rankKentuCandidatesWithGemini */
export async function rankUsdaCandidatesWithGemini(productName, candidates, opts = {}) {
  return rankKentuCandidatesWithGemini(productName, candidates, opts);
}

/**
 * Pipeline completa Kentu DB: normalizzazione → filtro locale → Gemini → profili arricchiti.
 *
 * @param {string} productName
 * @param {{ kentuItDb?: object, personalDb?: object, masterDb?: object }} dbContext
 * @param {{ signal?: AbortSignal, localLimit?: number }} [opts]
 */
export async function findSemanticKentuMatches(productName, dbContext = {}, opts = {}) {
  const kentuItDb = dbContext.kentuItDb || dbContext.masterDb || null;
  const personalDb = dbContext.personalDb || null;
  const searchDb = mergeKentuSearchDatabases(kentuItDb, personalDb);

  const rawName = String(productName || '').trim();
  if (!rawName) return [];

  const sessionKey = [
    normalizeSearchText(rawName),
    personalDb ? 'p1' : 'p0',
    kentuItDb ? 'k1' : 'k0',
  ].join('|');
  if (sessionKey && SEMANTIC_MATCH_SESSION_CACHE.has(sessionKey)) {
    return SEMANTIC_MATCH_SESSION_CACHE.get(sessionKey);
  }

  // Priorità assoluta: match letterale esatto (niente AI / confidence basse).
  // Personal DB ha priorità sul merge (...it, ...personal) ma cerchiamo esplicitamente in ordine.
  if (personalDb && Object.keys(personalDb).length > 0) {
    const exactPersonal = findExactLiteralFoodInDb(rawName, personalDb);
    if (exactPersonal) {
      return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, [exactPersonal]);
    }
  }
  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    const exactKentu = findExactLiteralFoodInDb(rawName, kentuItDb);
    if (exactKentu) {
      return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, [exactKentu]);
    }
  }
  const exactMerged = findExactLiteralFoodInDb(rawName, searchDb);
  if (exactMerged) {
    return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, [exactMerged]);
  }

  let queryName = rawName;
  try {
    const normalized = await normalizeIngredientSpellingWithGemini(queryName, { signal: opts.signal });
    if (normalized.normalized) queryName = normalized.normalized;
  } catch (error) {
    console.warn('[SemanticMatchmaker] normalize before search failed', error);
  }

  // Dopo normalizzazione ortografica, riprova match letterale (es. typo → nome DB).
  if (queryName !== rawName) {
    if (personalDb && Object.keys(personalDb).length > 0) {
      const exactPersonal = findExactLiteralFoodInDb(queryName, personalDb);
      if (exactPersonal) {
        return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, [exactPersonal]);
      }
    }
    if (kentuItDb && Object.keys(kentuItDb).length > 0) {
      const exactKentu = findExactLiteralFoodInDb(queryName, kentuItDb);
      if (exactKentu) {
        return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, [exactKentu]);
      }
    }
  }

  const candidates = await findLocalKentuCandidates(queryName, searchDb, {
    limit: opts.localLimit ?? DEFAULT_LOCAL_CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) {
    return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, []);
  }

  const byId = new Map(candidates.map((c) => [c.fdcId, c]));

  let ranked = [];
  try {
    ranked = await rankKentuCandidatesWithGemini(queryName, candidates, {
      signal: opts.signal,
    });
  } catch (error) {
    console.warn('[SemanticMatchmaker] Gemini ranking failed, fallback lexical top', error);
    const fallback = candidates.slice(0, DEFAULT_GEMINI_TOP).map((c, index) => ({
      fdcId: c.fdcId,
      name: c.name,
      confidence: index === 0 ? 'medium' : 'low',
      reason: 'Suggerimento lessicale Kentu DB (AI non disponibile)',
      row: c.row,
    }));
    return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, fallback);
  }

  const enriched = ranked
    .map((m) => {
      const hit = byId.get(m.fdcId);
      if (!hit) return null;
      return {
        fdcId: m.fdcId,
        name: hit.name,
        confidence: m.confidence,
        reason: m.reason,
        row: hit.row,
      };
    })
    .filter(Boolean);

  return rememberSessionCache(SEMANTIC_MATCH_SESSION_CACHE, sessionKey, enriched);
}

/**
 * Compat legacy: accetta masterDb ma cerca solo Kentu IT + personale se forniti nel contesto.
 * @deprecated Preferire findSemanticKentuMatches con kentuItDb + personalDb.
 */
export async function findSemanticUsdaMatches(productName, masterDb, opts = {}) {
  return findSemanticKentuMatches(productName, {
    kentuItDb: masterDb,
    personalDb: opts.personalDb || null,
  }, opts);
}

/**
 * Chat new food: profilo da Kentu DB, nome forzato dall'utente.
 *
 * @param {string} foodName
 * @param {Record<string, unknown>} kentuRow
 * @param {{ confidence?: string, reason?: string, fdcId?: string }} [meta]
 */
export function buildChatFoodFromUsdaRow(foodName, kentuRow, meta = {}) {
  const desc = String(foodName || kentuRow?.desc || kentuRow?.name || '').trim();
  const nutrients = buildPer100TargetNutrientsFromRow(kentuRow);
  const entry = {
    desc,
    name: desc,
    ...nutrients,
    isRecipe: false,
    learnedSource: 'chat_kentu_match',
    userLearned: true,
  };

  if (entry.fatTotal == null && entry.fat != null) entry.fatTotal = entry.fat;
  if (entry.fat == null && entry.fatTotal != null) entry.fat = entry.fatTotal;
  if (entry.cal == null && entry.kcal != null) entry.cal = entry.kcal;

  const dbKey = String(meta.fdcId || kentuRow?.fdcId || kentuRow?.id || '').trim();
  entry.kentuEnrichment = {
    dbKey: dbKey || null,
    confidence: meta.confidence || null,
    reason: meta.reason || null,
    source: 'KENTU_DB',
    mergedAt: new Date().toISOString(),
    chatTextMode: true,
  };
  if (dbKey) entry.fdcId = dbKey;

  return entry;
}

/**
 * Fusione etichetta OFF + profilo USDA.
 * Macro/fibre/sodio OFF (se presenti) restano inviolati; micro da USDA.
 */
export function mergeOffAndUsda(offProduct, usdaRow, meta = {}) {
  const off = offProduct && typeof offProduct === 'object' ? { ...offProduct } : {};
  const usdaNutrients = buildPer100TargetNutrientsFromRow(usdaRow);

  Object.entries(usdaNutrients).forEach(([key, value]) => {
    if (OFF_LOCKED_KEYS.has(key) && offHasLockedValue(off, key)) return;
    off[key] = value;
  });

  // Canonical fat / kcal aliases from OFF lock
  if (off.fatTotal == null && off.fat != null) off.fatTotal = off.fat;
  if (off.fat == null && off.fatTotal != null) off.fat = off.fatTotal;
  if (off.cal == null && off.kcal != null) off.cal = off.kcal;
  if (off.kcal == null && off.cal != null) off.kcal = off.cal;

  const fdcId = String(meta.fdcId || usdaRow?.fdcId || usdaRow?.id || '').trim();
  off.usdaEnrichment = {
    fdcId: fdcId || null,
    confidence: meta.confidence || null,
    reason: meta.reason || null,
    source: 'USDA',
    mergedAt: new Date().toISOString(),
  };
  if (fdcId) off.fdcId = fdcId;

  return off;
}

/**
 * Elenco chiavi TARGETS potenzialmente iniettabili (debug / test).
 */
export function listUsdaInjectableTargetKeys() {
  return Object.values(TARGETS)
    .flatMap((g) => Object.keys(g || {}))
    .filter((k) => !OFF_LOCKED_KEYS.has(k));
}

export { OFF_LOCKED_KEYS };
