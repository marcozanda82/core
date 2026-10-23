/**
 * Contratto FocusWrittenEdition v1 — output strutturato per Gemini / fallback.
 * I fatti numerici restano nei campi strutturati (metricsCited), non solo nella prosa.
 */

import { FOCUS_EDITORIAL_SCHEMA_VERSION } from '../focusEditorialConfig.js';

export const FOCUS_WRITTEN_SCHEMA_VERSION = FOCUS_EDITORIAL_SCHEMA_VERSION;

/** @typedef {'lead'|'centerpiece'|'good'|'feature'|'concern'} FocusArticleRole */

export const FOCUS_ARTICLE_ROLES = Object.freeze([
  'lead',
  'centerpiece',
  'good',
  'feature',
  'concern',
]);

export const FOCUS_PROSE_SOURCE = Object.freeze({
  fallback: 'fallback',
  validated_ai: 'validated_ai',
  /** solo test / future — mai pubblicabile senza validazione */
  unvalidated_raw: 'unvalidated_raw',
});

export const FOCUS_WRITING_LIMITS = Object.freeze({
  titleMaxChars: 120,
  bodyMaxChars: 900,
  /** Articolo centrale week/month: pezzo più articolato ammesso. */
  centerpieceBodyMaxChars: 1400,
  bodyMinChars: 40,
  cautionsMax: 8,
  evidenceIdsMax: 12,
  coachBodyMaxChars: 400,
});

/** @param {string} role */
export function bodyMaxCharsForRole(role) {
  return role === 'centerpiece'
    ? FOCUS_WRITING_LIMITS.centerpieceBodyMaxChars
    : FOCUS_WRITING_LIMITS.bodyMaxChars;
}

/**
 * Cosa la validazione deterministica NON può garantire.
 * Non dichiarare equivalenza con correttezza semantica della prosa.
 */
export const FOCUS_SEMANTIC_VALIDATION_LIMITS = Object.freeze({
  cannotVerify: [
    'causalità implicite senza keyword tipiche (oltre i pattern su hypothesis)',
    'interpretazioni mediche/diagnostiche mascherate da linguaggio comune',
    'affermazioni qualitative non supportate oltre i seed',
    'tono sensazionalistico sottile senza keyword esplicite',
    'numeri scritti a parole (cento, due) che contraddicono metricsCited',
    'omissioni narrative di contesto non coperte da mandatoryContext',
    'fatti del brief attribuiti alla giornata sbagliata senza date esplicite errate',
    'unità semanticamente sbagliate se la stringa unit è comunque una stringa',
  ],
  mitigation: [
    'metricsCited byte-identici agli autorizzati; preferire placeholder {{path}}',
    'cifre in prosa ⊆ allowlist (metriche + date + seed editoriali)',
    'mandatoryContext compreso in body/cautions (parafrasi ok); doNotClaim = divieti non da stampare; contextualLimitations = writer-only',
    'evidenceIds ⊆ refs; ruoli/id immutabili; no articoli extra',
    'hypothesis: rifiuto pattern causali tipici; missing/estimated ≠ “misurato”',
    'brief: stringhe utente sanitizzate; prompt DATA fence',
    'pubblicazione solo dopo validate ok + materialize ok, altrimenti fallback',
    'placeholder irrisolti / lookalike → materialize_failed → fallback',
  ],
  checksImplemented: [
    'schema/version/dates/roles/ids/count/duplicates',
    'evidenceIds e metricsCited autorizzati',
    'lunghezze title/body/coach',
    'injection patterns',
    'unauthorized numeric literals in title/body',
    'required cautions coverage',
    'hypothesis causal keywords',
    'missing/estimated presented as measured keywords',
    'medical overclaim keywords (subset)',
    'unavailable history comparison keywords',
    'placeholder ⊆ metricsCited; lookalike rejected',
    'coach gated',
    'materialize: unknown/missing/invalid/unit/unresolved → reject',
  ],
});

/**
 * @param {{
 *   id: string,
 *   role: FocusArticleRole,
 *   title: string,
 *   body: string,
 *   evidenceIds?: string[],
 *   metricsCited?: object[],
 *   cautions?: string[],
 *   selectionIndex: number,
 * }} input
 */
export function createFocusWrittenArticle(input) {
  return {
    id: input.id,
    role: input.role,
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
    evidenceIds: Array.isArray(input.evidenceIds) ? input.evidenceIds : [],
    metricsCited: Array.isArray(input.metricsCited) ? input.metricsCited : [],
    cautions: Array.isArray(input.cautions) ? input.cautions : [],
    selectionIndex: Number(input.selectionIndex),
  };
}

/**
 * @param {{
 *   analysisDate: string,
 *   publicationDate: string,
 *   articles?: object[],
 *   coach?: object|null,
 *   proseSource?: string,
 *   openingMode?: string,
 *   mastheadTeaser?: string|null,
 * }} input
 */
export function createFocusWrittenEdition(input) {
  return {
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
    analysisDate: input.analysisDate,
    publicationDate: input.publicationDate,
    openingMode: input.openingMode || 'neutral',
    articles: Array.isArray(input.articles) ? input.articles : [],
    coach: input.coach ?? null,
    proseSource: input.proseSource || FOCUS_PROSE_SOURCE.fallback,
    mastheadTeaser: input.mastheadTeaser ?? null,
  };
}
