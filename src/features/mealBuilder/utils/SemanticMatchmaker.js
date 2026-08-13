/**
 * Arricchimento semantico OFF → USDA (kentu_master_db).
 * 1) Filtro locale candidati
 * 2) Ranking Gemini (top 3 confidence)
 * 3) Merge: macro OFF inviolati + micro USDA
 */

import { askAI } from '../../../services/aiService.js';
import { searchUSDAFoods } from '../../../usdaFoodApi.js';
import { TARGETS } from '../../../useBiochimico.js';
import {
  buildPer100TargetNutrientsFromRow,
  pickFiniteNumber,
} from './foodMacroUtils.js';

const DEFAULT_LOCAL_CANDIDATE_LIMIT = 20;
const DEFAULT_GEMINI_TOP = 3;

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
 * Filtro locale: top N candidati USDA/Kentu master.
 *
 * @param {string} productName
 * @param {Record<string, object> | null | undefined} masterDb
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ fdcId: string, name: string, row: object }>>}
 */
export async function findLocalUsdaCandidates(productName, masterDb, opts = {}) {
  const limit = Math.min(
    40,
    Math.max(5, Number(opts.limit) || DEFAULT_LOCAL_CANDIDATE_LIMIT),
  );
  const query = sanitizeProductNameForSearch(productName);
  if (!query || !masterDb || typeof masterDb !== 'object') return [];

  const hits = await searchUSDAFoods(query, { usdaDb: masterDb, pageSize: limit });
  return hits.map((hit) => {
    const row = hit.row || masterDb[hit.id] || {};
    const fdcId = String(row.fdcId ?? hit.id ?? '').trim() || String(hit.id);
    const name = String(row.desc || row.name || hit.name || fdcId).trim();
    return { fdcId, name, row: { ...row, id: hit.id, fdcId } };
  });
}

/**
 * Chiede a Gemini di scegliere fino a 3 match biochimici tra i candidati.
 *
 * @param {string} productName
 * @param {Array<{ fdcId: string, name: string }>} candidates
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function rankUsdaCandidatesWithGemini(productName, candidates, opts = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!String(productName || '').trim() || list.length === 0) return [];

  const compact = list.slice(0, DEFAULT_LOCAL_CANDIDATE_LIMIT).map((c) => ({
    fdcId: String(c.fdcId),
    name: String(c.name),
  }));

  const systemInstruction = [
    'Sei un matchmaker nutrizionale. Confronti un prodotto da etichetta (Open Food Facts)',
    'con voci USDA/FoodData Central già filtrate.',
    'Valuta compatibilità biochimica (categoria alimento, grassi, proteine, lavorazione).',
    'Restituisci SOLO JSON conforme allo schema. Massimo 3 match.',
    'confidence: high = profilo quasi identico; medium = generico vs specifico; low = debole.',
    'Se nessun candidato è ragionevole, restituisci matches: [].',
  ].join(' ');

  const prompt = [
    `Prodotto scansionato: ${JSON.stringify(String(productName).trim())}`,
    'Candidati USDA (solo id + nome):',
    JSON.stringify(compact),
    'Scegli fino a 3 match migliori. Usa solo fdcId presenti nella lista.',
  ].join('\n');

  const raw = await askAI(prompt, systemInstruction, {
    temperature: 0.1,
    responseSchema: SEMANTIC_MATCH_RESPONSE_SCHEMA,
    signal: opts.signal,
  });

  const allowed = new Set(compact.map((c) => c.fdcId));
  return parseGeminiMatches(raw)
    .filter((m) => allowed.has(m.fdcId))
    .sort((a, b) => (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9))
    .slice(0, DEFAULT_GEMINI_TOP);
}

/**
 * Pipeline completa: filtro locale → Gemini → row USDA arricchite.
 *
 * @param {string} productName
 * @param {Record<string, object> | null | undefined} masterDb
 * @param {{ signal?: AbortSignal, localLimit?: number }} [opts]
 * @returns {Promise<Array<{
 *   fdcId: string,
 *   name: string,
 *   confidence: 'high'|'medium'|'low',
 *   reason: string,
 *   row: object,
 * }>>}
 */
export async function findSemanticUsdaMatches(productName, masterDb, opts = {}) {
  const candidates = await findLocalUsdaCandidates(productName, masterDb, {
    limit: opts.localLimit ?? DEFAULT_LOCAL_CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) return [];

  const byId = new Map(candidates.map((c) => [c.fdcId, c]));

  let ranked = [];
  try {
    ranked = await rankUsdaCandidatesWithGemini(productName, candidates, {
      signal: opts.signal,
    });
  } catch (error) {
    console.warn('[SemanticMatchmaker] Gemini ranking failed, fallback lexical top', error);
    // Fallback: primi 3 lessicali a confidence medium/low
    return candidates.slice(0, DEFAULT_GEMINI_TOP).map((c, index) => ({
      fdcId: c.fdcId,
      name: c.name,
      confidence: index === 0 ? 'medium' : 'low',
      reason: 'Suggerimento lessicale (AI non disponibile)',
      row: c.row,
    }));
  }

  return ranked
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
}

/**
 * Chat new food: profilo personale interamente da USDA, nome forzato dall'utente.
 *
 * @param {string} foodName
 * @param {Record<string, unknown>} usdaRow
 * @param {{ confidence?: string, reason?: string, fdcId?: string }} [meta]
 */
export function buildChatFoodFromUsdaRow(foodName, usdaRow, meta = {}) {
  const desc = String(foodName || usdaRow?.desc || usdaRow?.name || '').trim();
  const nutrients = buildPer100TargetNutrientsFromRow(usdaRow);
  const entry = {
    desc,
    name: desc,
    ...nutrients,
    isRecipe: false,
    learnedSource: 'chat_usda_match',
    userLearned: true,
  };

  if (entry.fatTotal == null && entry.fat != null) entry.fatTotal = entry.fat;
  if (entry.fat == null && entry.fatTotal != null) entry.fat = entry.fatTotal;
  if (entry.cal == null && entry.kcal != null) entry.cal = entry.kcal;

  const fdcId = String(meta.fdcId || usdaRow?.fdcId || usdaRow?.id || '').trim();
  entry.usdaEnrichment = {
    fdcId: fdcId || null,
    confidence: meta.confidence || null,
    reason: meta.reason || null,
    source: 'USDA',
    mergedAt: new Date().toISOString(),
    chatTextMode: true,
  };
  if (fdcId) entry.fdcId = fdcId;

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
