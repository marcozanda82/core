/**
 * Validazione risposta coach AI Kentu Focus (contratto editoriale v4 summary + compat v3/v2).
 */

import { normalizeFocusEditorialAnalysis } from './normalizeFocusEditorialAnalysis.js';
import {
  coerceEvidenceRefArray,
  normalizeEvidenceRefId,
} from './resolveFocusEvidenceRefs.js';
import { findBannedPhrasesInAnalysis } from './focusAiCoachBannedUserPhrases.js';

const SUMMARY_AREAS = new Set(['energia', 'qualita', 'ritmo', 'sonno', 'movimento']);
const SUMMARY_HEADLINE_MAX = 70;
const SUMMARY_ITEM_MAX = 120;
const SUMMARY_ACTION_MAX = 140;
/** Accetta sforamenti di lunghezza fino a +15% senza retry. */
const SUMMARY_LENGTH_SOFT_RATIO = 1.15;

/** Regole bloccanti: fallimento definitivo (no auto-fix). */
export const FOCUS_AI_BLOCKING_RULES = new Set([
  'empty_response',
  'invalid_json',
  'not_object',
  'banned_clinical_or_score_claim',
  'todayAction_repeated_in_sections',
  'forbidden_field_dailyScore',
  'forbidden_field_score',
  'forbidden_field_healthScore',
  'forbidden_field_longevityScore',
  'forbidden_field_longevityNutrition',
  'forbidden_field_inflammationSummary',
  'forbidden_field_clinicalBulletinMarkdown',
  'forbidden_field_metabolicScore',
]);

/**
 * @param {string|null|undefined} reason
 * @returns {'blocking'|'fixable'}
 */
export function classifyFocusAiValidationRule(reason) {
  const r = String(reason || '');
  if (FOCUS_AI_BLOCKING_RULES.has(r) || r.startsWith('forbidden_field_')) return 'blocking';
  if (r === 'banned_user_facing_phrase') return 'fixable'; // retry con hint
  if (/_too_long$/.test(r)) return 'fixable';
  return 'fixable';
}

/**
 * @param {number} max
 */
function softMaxLen(max) {
  return Math.floor(max * SUMMARY_LENGTH_SOFT_RATIO);
}

const BANNED_CLAIM_RE = new RegExp([
  'daily\\s*score',
  'longevity\\s*score',
  'score\\s*\\d{1,3}\\s*/\\s*100',
  'punteggio\\s*(di\\s*)?salute',
  '0\\s*[-–]\\s*100',
  'citochin',
  'cytokine',
  'glicemia\\s+misurat',
  'la\\s+tua\\s+glicemia',
  'picco\\s+glicem\\w*\\s+(garant|misurat|di\\s+\\d)',
  'cortisol\\w*\\s+(elevat|misurat|alto)',
  'nrf2',
  'stato\\s+infiammatorio',
  'infiammazione\\s+clinica',
  'dii\\s*(di|=|score)',
  'carenza\\s+(di\\s+)?(ferro|b12|vitamina)\\s+diagnostic',
  'deficit\\s+(di\\s+)?(ferro|b12)\\s+diagnostic',
  'diagnosi\\s+(di|medica)',
  'referto\\s+medico',
  'catabolismo\\s+(misurat|diagnostic|in\\s+corso)',
  'sei\\s+in\\s+catabolismo',
  'garantisce\\s+la\\s+stabilit',
  'causa\\s+(diretta|certa|dimostrata)\\s+',
  'provoca\\s+(certamente|direttamente)\\s+il\\s+sonno',
  'antinfiammatorio\\s+eccellente',
  'pronto\\s+a\\s+spingere',
  'anni\\s+di\\s+vita\\s+guadagn',
  // Fisiologia del sonno / termogenesi individuali non misurate (affermazioni positive)
  'ha\\s+compromesso\\s+il\\s+sonno\\s+profond',
  'compromette\\s+il\\s+sonno\\s+profond',
  'sonno\\s+profond\\w*\\s+(è|risulta|viene|fu)\\s+(compromess|alterat|distrutt|rovinat)',
  'fasi\\s+del\\s+sonno\\s+(sono|risultano|vengono)\\s+(compromess|alterat|distrutt)',
  'termogenesi\\s+notturna\\s+(compromette|impedisce|rovina|causa|provoca)',
  'infiammazione\\s+(sistemica|cronica)\\s+(in\\s+corso|elevata|documentata)',
].join('|'), 'i');

/** Titoli da report tecnico — rifiuta solo headline, non l’intero testo. */
const TECHNICAL_HEADLINE_RE = new RegExp([
  'asimmetr\\w*',
  'assetto\\s+operativ',
  'scarto\\s+energetic',
  'delta\\s*kcal',
  'bilancio\\s+netto\\s+stimat',
  'deviazione\\s+standard',
  'iperscal\\w*',
].join('|'), 'i');

const PILLAR_IDS = new Set(['nutrition', 'exercise', 'sleep', 'balanced']);

/**
 * @param {unknown} rawText
 * @returns {string}
 */
export function unwrapFocusAiCoachJson(rawText) {
  let text = String(rawText || '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function cleanText(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

/**
 * @param {unknown} arr
 * @param {number} max
 */
function cleanStringArray(arr, max = 6) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => cleanText(x)).filter(Boolean).slice(0, max);
}

/**
 * @param {object|null|undefined} dossier
 * @returns {Set<string>}
 */
function dossierEventIdSet(dossier) {
  const ids = dossier?.eventIndex?.ids;
  if (Array.isArray(ids) && ids.length) {
    return new Set(ids.map((x) => String(x)));
  }
  /** @type {Set<string>} */
  const set = new Set();
  for (const meal of dossier?.nutrition?.meals || []) {
    for (const it of meal.items || []) {
      if (it?.eventId) set.add(String(it.eventId));
    }
  }
  if (dossier?.sleep?.day?.eventId) set.add(String(dossier.sleep.day.eventId));
  for (const w of dossier?.exercise?.workouts || []) {
    if (w?.eventId) set.add(String(w.eventId));
  }
  return set;
}

/**
 * Risolve alias corti (e1…) → id reale; id già reali restano.
 * @param {string} ref
 * @param {object|null|undefined} dossier
 */
function resolveEventRefAlias(ref, dossier) {
  const id = String(ref || '').trim();
  if (!id) return null;
  const map = dossier?.eventIndex?.aliasToId;
  if (map && typeof map === 'object' && map[id]) return String(map[id]);
  return id;
}

/**
 * Orari HH:MM / HH.MM e quantità in grammi presenti nel testo.
 * @param {string} text
 * @returns {{ clocks: string[], grams: string[] }}
 */
export function extractActionQuantities(text) {
  const raw = String(text || '');
  /** @type {string[]} */
  const clocks = [];
  for (const m of raw.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)) {
    clocks.push(`${String(m[1]).padStart(2, '0')}:${m[2]}`);
  }
  /** @type {string[]} */
  const grams = [];
  for (const m of raw.matchAll(/\b(\d+(?:[.,]\d+)?)\s*g\b/gi)) {
    const n = String(m[1]).replace(',', '.');
    const num = Number(n);
    if (!Number.isFinite(num)) continue;
    grams.push(Number.isInteger(num) ? String(Math.round(num)) : String(num));
  }
  return { clocks, grams };
}

/**
 * todayAction e recommendedAction devono condividere gli stessi orari/grammi
 * quando presenti in entrambe (o in todayAction da riusare in recommended).
 * @param {string} todayAction
 * @param {string} recommendedAction
 */
export function findActionQuantityMismatches(todayAction, recommendedAction) {
  const a = extractActionQuantities(todayAction);
  const b = extractActionQuantities(recommendedAction);
  /** @type {{ kind: string, expected: string, found: string[] }[]} */
  const mismatches = [];
  for (const clock of a.clocks) {
    if (!b.clocks.includes(clock)) {
      mismatches.push({ kind: 'clock', expected: clock, found: b.clocks });
    }
  }
  for (const g of a.grams) {
    if (!b.grams.includes(g)) {
      mismatches.push({ kind: 'grams', expected: g, found: b.grams });
    }
  }
  // Orari nuovi in recommended diversi da quelli di todayAction
  if (a.clocks.length > 0) {
    for (const clock of b.clocks) {
      if (!a.clocks.includes(clock)) {
        mismatches.push({ kind: 'clock_extra', expected: a.clocks.join('|'), found: [clock] });
      }
    }
  }
  if (a.grams.length > 0) {
    for (const g of b.grams) {
      if (!a.grams.includes(g)) {
        mismatches.push({ kind: 'grams_extra', expected: a.grams.join('|'), found: [g] });
      }
    }
  }
  return mismatches;
}

/**
 * @param {string} rule
 * @param {unknown} value
 * @param {string} [message]
 */
function failRule(rule, value, message) {
  return {
    ok: false,
    reason: rule,
    failedRules: [{ rule, value: value == null ? null : value, message: message || rule }],
    items: [],
    summary: null,
    analysis: null,
  };
}

/**
 * @param {unknown} raw
 * @param {Set<string>} allowedIds
 * @param {number} maxItems
 * @param {object|null|undefined} dossier
 * @returns {{ ok: boolean, reason: string|null, items: object[], droppedEventRefs?: string[], failedRules?: object[], severity?: string }}
 */
function normalizeSummaryItems(raw, allowedIds, maxItems, dossier) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > maxItems) {
    return {
      ...failRule(
        'summary_items_count',
        Array.isArray(raw) ? raw.length : typeof raw,
        `attesi 1–${maxItems} item`,
      ),
      severity: 'blocking',
    };
  }
  /** @type {object[]} */
  const items = [];
  /** @type {string[]} */
  const droppedEventRefs = [];
  const itemSoftMax = softMaxLen(SUMMARY_ITEM_MAX);
  for (const rowRaw of raw) {
    // Correggibile: Gemini a volte emette stringhe al posto di {text,area,eventRefs}
    let row = rowRaw;
    if (typeof rowRaw === 'string') {
      row = { text: rowRaw, area: null, eventRefs: [] };
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return {
        ...failRule('summary_item_invalid', rowRaw, 'riga summary non oggetto'),
        severity: 'blocking',
      };
    }
    const text = cleanText(row.text);
    if (!text) return failRule('summary_item_empty_text', row.text, 'text vuoto');
    if (text.length > itemSoftMax) {
      return {
        ...failRule(
          'summary_item_too_long',
          { length: text.length, max: SUMMARY_ITEM_MAX, softMax: itemSoftMax, text },
          `text ${text.length} > softMax ${itemSoftMax} (+15% su ${SUMMARY_ITEM_MAX})`,
        ),
        severity: 'fixable',
      };
    }
    // entro +15%: accetta senza truncare
    const areaRaw = cleanText(row.area);
    const area = areaRaw && SUMMARY_AREAS.has(areaRaw) ? areaRaw : null;
    const refsRaw = Array.isArray(row.eventRefs) ? row.eventRefs : [];
    const eventRefs = [];
    const seen = new Set();
    for (const r of refsRaw) {
      const aliasOrId = cleanText(r);
      if (!aliasOrId) continue;
      const id = resolveEventRefAlias(aliasOrId, dossier);
      if (!id || !allowedIds.has(id)) {
        droppedEventRefs.push(aliasOrId);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      eventRefs.push(id);
    }
    items.push({ text, area, eventRefs });
  }
  return { ok: true, reason: null, items, droppedEventRefs };
}

/**
 * @param {object} parsed
 * @param {object|null|undefined} dossier
 * @param {{ salvage?: boolean }} [opts]
 */
export function validateFocusAiCoachSummary(parsed, dossier, opts = {}) {
  const salvage = Boolean(opts.salvage);
  const summary = parsed?.summary;
  if (!summary || typeof summary !== 'object') {
    return failRule('summary_missing', summary, 'summary assente');
  }
  let headline = cleanText(summary.headline) || cleanText(parsed.headline);
  if (!headline) return failRule('summary_headline_missing', summary.headline, 'headline vuota');
  const headlineSoft = softMaxLen(SUMMARY_HEADLINE_MAX);
  /** @type {string[]} */
  const autoFixes = [];
  if (headline.length > headlineSoft) {
    if (salvage) {
      headline = `${headline.slice(0, SUMMARY_HEADLINE_MAX - 1).trim()}…`;
      autoFixes.push('headline_truncated');
    } else {
      return {
        ...failRule(
          'summary_headline_too_long',
          { length: headline.length, max: SUMMARY_HEADLINE_MAX, softMax: headlineSoft, text: headline },
          `headline ${headline.length} > softMax ${headlineSoft}`,
        ),
        severity: 'retryable',
      };
    }
  }

  const allowedIds = dossierEventIdSet(dossier);
  const went = normalizeSummaryItems(summary.wentWell, allowedIds, 2, dossier);
  if (!went.ok) {
    return {
      ok: false,
      reason: went.reason || 'summary_wentWell_invalid',
      failedRules: went.failedRules || [{ rule: went.reason, value: summary.wentWell }],
      severity: went.severity || classifyFocusAiValidationRule(went.reason),
      summary: null,
    };
  }
  const improve = normalizeSummaryItems(summary.toImprove, allowedIds, 2, dossier);
  if (!improve.ok) {
    return {
      ok: false,
      reason: improve.reason || 'summary_toImprove_invalid',
      failedRules: improve.failedRules || [{ rule: improve.reason, value: summary.toImprove }],
      severity: improve.severity || classifyFocusAiValidationRule(improve.reason),
      summary: null,
    };
  }

  const todayNorm = normalizeTodayActionObject(
    summary.todayAction,
    improve.items,
    allowedIds,
    dossier,
    salvage,
  );
  if (!todayNorm.ok) {
    return {
      ok: false,
      reason: todayNorm.reason || 'summary_todayAction_invalid',
      failedRules: todayNorm.failedRules || [{ rule: todayNorm.reason, value: summary.todayAction }],
      severity: todayNorm.severity || 'retryable',
      summary: null,
      autoFixes: todayNorm.autoFixes || [],
    };
  }

  const droppedEventRefs = [
    ...(went.droppedEventRefs || []),
    ...(improve.droppedEventRefs || []),
    ...(todayNorm.droppedEventRefs || []),
  ];

  return {
    ok: true,
    reason: null,
    droppedEventRefs,
    autoFixes: [...autoFixes, ...(todayNorm.autoFixes || [])],
    summary: {
      headline,
      wentWell: went.items,
      toImprove: improve.items,
      todayAction: todayNorm.todayAction,
    },
  };
}

/**
 * todayAction strutturato: { text, toImproveIndex, eventRefs }.
 * Compat: stringa legacy → oggetto con index 0.
 * @param {unknown} raw
 * @param {object[]} improveItems
 * @param {Set<string>} allowedIds
 * @param {object|null|undefined} dossier
 * @param {boolean} salvage
 */
export function normalizeTodayActionObject(raw, improveItems, allowedIds, dossier, salvage = false) {
  /** @type {string[]} */
  const autoFixes = [];
  /** @type {string[]} */
  const droppedEventRefs = [];

  let obj = raw;
  if (typeof raw === 'string') {
    obj = { text: raw, toImproveIndex: 0, eventRefs: [] };
    autoFixes.push('todayAction_coerced_from_string');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      reason: 'summary_todayAction_invalid',
      severity: 'retryable',
      failedRules: [{ rule: 'summary_todayAction_invalid', value: raw, message: 'todayAction non oggetto' }],
      autoFixes,
    };
  }

  let text = cleanText(obj.text);
  if (!text) {
    return {
      ok: false,
      reason: 'summary_todayAction_missing',
      severity: 'retryable',
      failedRules: [{ rule: 'summary_todayAction_missing', value: obj, message: 'todayAction.text vuoto' }],
      autoFixes,
    };
  }

  if (/\s+o\s+/i.test(text)) {
    if (salvage) {
      const cut = text.split(/\s+o\s+/i)[0].trim();
      if (cut) {
        text = /[.!?]$/.test(cut) ? cut : `${cut}.`;
        autoFixes.push('todayAction_stripped_or_alternative');
      } else {
        return {
          ok: false,
          reason: 'todayAction_has_or_alternative',
          severity: 'retryable',
          failedRules: [{ rule: 'todayAction_has_or_alternative', value: text, message: 'todayAction con alternative « o »' }],
          autoFixes,
        };
      }
    } else {
      return {
        ok: false,
        reason: 'todayAction_has_or_alternative',
        severity: 'retryable',
        failedRules: [{ rule: 'todayAction_has_or_alternative', value: text, message: 'todayAction con alternative « o »' }],
        autoFixes,
      };
    }
  }

  const actionSoft = softMaxLen(SUMMARY_ACTION_MAX);
  if (text.length > actionSoft) {
    if (salvage) {
      text = `${text.slice(0, SUMMARY_ACTION_MAX - 1).trim()}…`;
      autoFixes.push('todayAction_truncated');
    } else {
      return {
        ok: false,
        reason: 'summary_todayAction_too_long',
        severity: 'retryable',
        failedRules: [{
          rule: 'summary_todayAction_too_long',
          value: { length: text.length, max: SUMMARY_ACTION_MAX, softMax: actionSoft, text },
          message: `todayAction ${text.length} > softMax ${actionSoft}`,
        }],
        autoFixes,
      };
    }
  }

  let index = Number(obj.toImproveIndex);
  if (!Number.isInteger(index)) {
    if (salvage) {
      index = 0;
      autoFixes.push('todayAction_index_default_0');
    } else {
      return {
        ok: false,
        reason: 'todayAction_index_invalid',
        severity: 'retryable',
        failedRules: [{ rule: 'todayAction_index_invalid', value: obj.toImproveIndex, message: 'toImproveIndex non intero' }],
        autoFixes,
      };
    }
  }
  if (index < 0 || index >= (improveItems || []).length) {
    if (salvage && (improveItems || []).length > 0) {
      index = 0;
      autoFixes.push('todayAction_index_clamped_0');
    } else {
      return {
        ok: false,
        reason: 'todayAction_index_invalid',
        severity: 'retryable',
        failedRules: [{
          rule: 'todayAction_index_invalid',
          value: { toImproveIndex: index, toImproveCount: (improveItems || []).length },
          message: 'toImproveIndex fuori range',
        }],
        autoFixes,
      };
    }
  }

  const target = improveItems[index];
  const refsRaw = Array.isArray(obj.eventRefs) ? obj.eventRefs : [];
  /** @type {string[]} */
  const eventRefs = [];
  const seen = new Set();
  for (const r of refsRaw) {
    const aliasOrId = cleanText(r);
    if (!aliasOrId) continue;
    const id = resolveEventRefAlias(aliasOrId, dossier);
    if (!id || (allowedIds.size > 0 && !allowedIds.has(id))) {
      droppedEventRefs.push(aliasOrId);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    eventRefs.push(id);
  }

  const targetRefs = Array.isArray(target?.eventRefs) ? target.eventRefs : [];
  const areaRaw = cleanText(obj.area);
  const area = areaRaw && SUMMARY_AREAS.has(areaRaw) ? areaRaw : null;
  const sameArea = Boolean(area && target?.area && area === target.area);
  const hasIntersection = eventRefs.some((id) => targetRefs.includes(id));
  const refsCompatible = eventRefs.length === 0
    || targetRefs.length === 0
    || hasIntersection
    || sameArea;

  if (!refsCompatible) {
    if (salvage) {
      eventRefs.length = 0;
      for (const id of targetRefs.slice(0, 4)) eventRefs.push(id);
      autoFixes.push('todayAction_eventRefs_aligned_to_toImprove');
    } else {
      return {
        ok: false,
        reason: 'todayAction_refs_incompatible',
        severity: 'retryable',
        failedRules: [{
          rule: 'todayAction_refs_incompatible',
          value: { eventRefs, targetRefs, toImproveIndex: index, area },
          message: 'eventRefs non compatibili con toImprove[index]',
        }],
        autoFixes,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    droppedEventRefs,
    autoFixes,
    todayAction: {
      text,
      toImproveIndex: index,
      eventRefs,
      ...(area ? { area } : {}),
    },
  };
}

/**
 * @param {object|null} proposal
 * @param {object|null} dossier
 */
export function verifyQuantitativeProposalAgainstDossier(proposal, dossier) {
  if (!proposal || typeof proposal !== 'object') {
    return { ok: true, mode: 'none', reason: null };
  }
  const foodName = cleanText(proposal.foodName);
  if (!foodName) {
    return { ok: false, mode: 'reject', reason: 'quantitative_missing_food' };
  }
  const names = new Set();
  for (const meal of dossier?.nutrition?.meals || []) {
    for (const it of meal.items || []) {
      if (it?.name) names.add(String(it.name).toLowerCase());
    }
  }
  for (const f of dossier?.nutrition?.foodFrequency || []) {
    if (f?.name) names.add(String(f.name).toLowerCase());
  }
  if (names.size === 0) {
    return { ok: false, mode: 'downgrade_qualitative', reason: 'no_foods_to_verify' };
  }
  if (!names.has(foodName.toLowerCase())) {
    return { ok: false, mode: 'downgrade_qualitative', reason: 'food_not_in_diary' };
  }
  return { ok: true, mode: 'verified', reason: null };
}

/**
 * @param {unknown} rawText
 * @param {{ dossier?: object|null }} [opts]
 */
/**
 * @param {string} rule
 * @param {unknown} value
 * @param {string} [message]
 */
function reject(rule, value, message) {
  return {
    ok: false,
    reason: rule,
    analysis: null,
    severity: classifyFocusAiValidationRule(rule),
    failedRules: [{ rule, value: value == null ? null : value, message: message || rule }],
  };
}

export function validateFocusAiCoachResponse(rawText, opts = {}) {
  const unwrapped = unwrapFocusAiCoachJson(rawText);
  if (!unwrapped) {
    return reject('empty_response', null, 'risposta vuota');
  }

  let parsed;
  try {
    parsed = JSON.parse(unwrapped);
  } catch (err) {
    return reject('invalid_json', String(unwrapped).slice(0, 240), err?.message || 'JSON.parse failed');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return reject('not_object', typeof parsed, 'root non oggetto');
  }

  const forbiddenKeys = [
    'dailyScore', 'score', 'healthScore', 'longevityScore', 'longevityNutrition',
    'inflammationSummary', 'clinicalBulletinMarkdown', 'metabolicScore',
  ];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] != null && parsed[key] !== '') {
      return reject(`forbidden_field_${key}`, parsed[key], `campo vietato ${key}`);
    }
  }

  // summary: obbligatorio per nuove generazioni (prompt/schema v4);
  // se assente → compat v3; se presente → validazione stretta.
  const salvage = Boolean(opts.salvage);
  /** @type {string[]} */
  const autoFixes = [];
  const summaryRequested = parsed.summary != null || opts.requireSummary === true;
  const summaryCheck = summaryRequested
    ? validateFocusAiCoachSummary(parsed, opts.dossier || null, { salvage })
    : { ok: true, reason: null, summary: null, droppedEventRefs: [], autoFixes: [] };
  if (summaryRequested && !summaryCheck.ok) {
    return {
      ok: false,
      reason: summaryCheck.reason || 'summary_invalid',
      analysis: null,
      severity: summaryCheck.severity || classifyFocusAiValidationRule(summaryCheck.reason),
      failedRules: summaryCheck.failedRules || [{
        rule: summaryCheck.reason || 'summary_invalid',
        value: parsed.summary || null,
        message: summaryCheck.reason || 'summary_invalid',
      }],
      droppedEventRefs: summaryCheck.droppedEventRefs || [],
      autoFixes: summaryCheck.autoFixes || [],
    };
  }
  if (Array.isArray(summaryCheck.autoFixes)) autoFixes.push(...summaryCheck.autoFixes);
  /** @type {string[]} */
  const droppedEventRefs = [...(summaryCheck.droppedEventRefs || [])];
  const hasSummary = Boolean(summaryCheck.ok && summaryCheck.summary);

  // Un solo titolo: headline top-level = summary.headline
  let headline = hasSummary
    ? (summaryCheck.summary?.headline || cleanText(parsed.headline) || null)
    : (cleanText(parsed.headline) || summaryCheck.summary?.headline || null);
  // lead: o dato concreto, o omesso (null). Stringa vuota → null.
  let lead = parsed.lead === null
    ? null
    : (cleanText(parsed.lead) || cleanText(parsed.theEmergingPicture) || cleanText(parsed.integratedComment));
  // Se lead assente e c'è summary v4, resta null (omesso). Fallback legacy solo senza summary.
  if (!lead && !hasSummary) {
    lead = cleanText(parsed.theEmergingPicture) || cleanText(parsed.integratedComment);
  }

  const summaryTodayText = typeof summaryCheck.summary?.todayAction === 'string'
    ? summaryCheck.summary.todayAction
    : cleanText(summaryCheck.summary?.todayAction?.text);
  let recommendedAction = cleanText(parsed.recommendedAction)
    || cleanText(parsed.theChoiceIWouldMake)
    || cleanText(parsed.practicalAction)
    || summaryTodayText
    || null;

  const hasEditorial = Boolean(
    (headline || hasSummary)
    && Array.isArray(parsed.sections)
    && parsed.sections.length > 0
    && (recommendedAction || hasSummary)
    && (lead || hasSummary),
  );

  // claimLayers + quantitativeProposal obbligatori in v4 (chiave presente)
  if (summaryRequested || hasSummary || parsed.summary != null) {
    if (!parsed.claimLayers || typeof parsed.claimLayers !== 'object' || Array.isArray(parsed.claimLayers)) {
      if (salvage) {
        parsed.claimLayers = {
          recordedFacts: [], generalKnowledge: [], foundedInferences: [], hypothesesToTest: [],
        };
        autoFixes.push('claimLayers_default_empty');
      } else {
        return reject('claimLayers_required', parsed.claimLayers, 'claimLayers obbligatorio');
      }
    }
    for (const k of ['recordedFacts', 'generalKnowledge', 'foundedInferences', 'hypothesesToTest']) {
      if (!Array.isArray(parsed.claimLayers[k])) {
        if (salvage) {
          parsed.claimLayers[k] = [];
          autoFixes.push(`claimLayers_${k}_default_empty`);
        } else {
          return reject('claimLayers_incomplete', { key: k, value: parsed.claimLayers[k] }, `claimLayers.${k} non array`);
        }
      }
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'quantitativeProposal')) {
      if (salvage) {
        parsed.quantitativeProposal = null;
        autoFixes.push('quantitativeProposal_default_null');
      } else {
        return reject('quantitativeProposal_required', null, 'chiave quantitativeProposal assente');
      }
    }
  }

  // v4: lead presente → almeno un dato concreto; altrimenti ometti (null)
  if (hasSummary && lead) {
    const hasConcrete = /\d/.test(lead)
      && /(kcal|target|media|bilancio|ore|g\b|%|minut)/i.test(lead);
    if (!hasConcrete) {
      return reject('lead_missing_concrete_datum', lead, 'lead senza dato concreto');
    }
  }
  let verifyNext = cleanText(parsed.verifyNext)
    || cleanText(parsed.whatToWatchNext)
    || 'Osserva nei prossimi 7–14 giorni se la proposta resta sostenibile e utile.';
  let expectedChange = cleanText(parsed.expectedChange);
  let keyInsight = cleanText(parsed.keyInsight);
  let evidenceRefs = [];
  {
    const seen = new Set();
    const allowedIds = dossierEventIdSet(opts.dossier || null);
    for (const raw of coerceEvidenceRefArray(parsed.evidenceRefs)) {
      let id = normalizeEvidenceRefId(raw);
      if (!id && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const label = String(raw.label || raw.title || raw.name || '').trim();
        if (label) id = label;
      }
      if (!id) continue;
      // Alias e1… → id evento reale (come eventRefs)
      const resolved = resolveEventRefAlias(id, opts.dossier || null) || id;
      if (allowedIds.size > 0 && /^e\d+$/i.test(id) && !allowedIds.has(resolved)) {
        droppedEventRefs.push(id);
        continue;
      }
      const finalId = resolved;
      const key = finalId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      evidenceRefs.push(finalId);
      if (evidenceRefs.length >= 6) break;
    }
  }
  let limits = cleanStringArray(parsed.limits, 4);
  const primaryPillarId = cleanText(parsed.primaryPillarId) || 'balanced';

  /** @type {{ id: string|null, title: string, body: string }[]} */
  let sections = [];
  if (Array.isArray(parsed.sections)) {
    sections = parsed.sections
      .map((s, i) => ({
        id: cleanText(s?.id) || `section_${i + 1}`,
        title: cleanText(s?.title),
        body: cleanText(s?.body),
      }))
      .filter((s) => s.title && s.body)
      .slice(0, 5);
  }

  // Compat v2 → sezioni
  const nutrition = cleanText(parsed.nutrition) || cleanText(parsed.pillarObservations?.nutrition);
  const exercise = cleanText(parsed.exercise) || cleanText(parsed.pillarObservations?.exercise);
  const sleep = cleanText(parsed.sleep) || cleanText(parsed.pillarObservations?.sleep);
  if (!sections.length) {
    if (nutrition) sections.push({ id: 'nutrition', title: 'Alimentazione', body: nutrition });
    if (exercise) sections.push({ id: 'exercise', title: 'Esercizio e forma fisica', body: exercise });
    if (sleep) sections.push({ id: 'sleep', title: 'Sonno e recupero', body: sleep });
  }

  if (!lead) lead = sections[0]?.body || null;
  if (!headline && lead) {
    const m = lead.match(/^(.{12,90}?)([.!?]|$)/);
    headline = m ? m[1].trim() : 'Il quadro che emerge';
  }

  let importantConnections = cleanStringArray(parsed.importantConnections, 2);
  if (!importantConnections.length) {
    importantConnections = cleanStringArray(parsed.focusAspects, 2);
  }
  if (!keyInsight && importantConnections[0]) keyInsight = importantConnections[0];

  if (!recommendedAction || !primaryPillarId || sections.length === 0) {
    return reject('missing_required_fields', {
      recommendedAction: Boolean(recommendedAction),
      primaryPillarId,
      sections: sections.length,
    }, 'campi obbligatori mancanti');
  }
  if (!lead && !hasSummary) {
    return reject('missing_required_fields', { lead, hasSummary }, 'lead assente senza summary');
  }
  if (!PILLAR_IDS.has(primaryPillarId)) {
    return reject('invalid_primary_pillar', primaryPillarId, 'primaryPillarId non ammesso');
  }

  // Redistribuzione: se expectedChange manca e c'è quantitativeProposal, avvisa kcal invariate
  let quantitativeProposal = parsed.quantitativeProposal && typeof parsed.quantitativeProposal === 'object'
    ? {
      foodName: cleanText(parsed.quantitativeProposal.foodName),
      grams: Number.isFinite(Number(parsed.quantitativeProposal.grams))
        ? Number(parsed.quantitativeProposal.grams)
        : null,
      fromMeal: cleanText(parsed.quantitativeProposal.fromMeal),
      toTiming: cleanText(parsed.quantitativeProposal.toTiming),
      rationale: cleanText(parsed.quantitativeProposal.rationale),
      dailyKcalUnchanged: parsed.quantitativeProposal.dailyKcalUnchanged !== false,
    }
    : null;

  const qCheck = verifyQuantitativeProposalAgainstDossier(quantitativeProposal, opts.dossier || null);
  let actionText = recommendedAction;
  if (quantitativeProposal && qCheck.mode === 'downgrade_qualitative') {
    quantitativeProposal = null;
    if (!/ipotesi|qualitativ/i.test(actionText)) {
      actionText = `${actionText} (proposta quantitativa non verificabile sul diario: resta un’indicazione qualitativa).`;
    }
  } else if (quantitativeProposal && qCheck.mode === 'reject') {
    quantitativeProposal = null;
  }

  if (quantitativeProposal && !expectedChange) {
    expectedChange = quantitativeProposal.dailyKcalUnchanged !== false
      ? 'Cambia la distribuzione/timing degli alimenti già registrati; le calorie giornaliere restano sostanzialmente invariate se non si aggiungono o tolgono grammi netti.'
      : 'Verifica sul diario cosa cambia nei totali dichiarati.';
  }

  const claimLayers = parsed.claimLayers && typeof parsed.claimLayers === 'object'
    ? {
      recordedFacts: cleanStringArray(parsed.claimLayers.recordedFacts, 8),
      generalKnowledge: cleanStringArray(parsed.claimLayers.generalKnowledge, 8),
      foundedInferences: cleanStringArray(parsed.claimLayers.foundedInferences, 8),
      hypothesesToTest: cleanStringArray(parsed.claimLayers.hypothesesToTest, 8),
    }
    : null;

  const blob = [
    headline,
    lead,
    ...sections.map((s) => `${s.title}\n${s.body}`),
    keyInsight,
    actionText,
    expectedChange,
    verifyNext,
    ...evidenceRefs,
    ...limits,
    ...(claimLayers?.foundedInferences || []),
    ...(claimLayers?.hypothesesToTest || []),
  ].join('\n');

  const bannedClaimMatch = blob.match(BANNED_CLAIM_RE);
  if (bannedClaimMatch) {
    return reject('banned_clinical_or_score_claim', bannedClaimMatch[0], 'claim clinico/score vietato');
  }

  if (headline && TECHNICAL_HEADLINE_RE.test(headline)) {
    return reject('technical_headline', headline, 'headline tecnica');
  }

  const restatesOnly = /hai registrato .{0,40}pasti?.{0,40}\d+\s*kcal/i.test(lead)
    && lead.length < 180;
  if (restatesOnly) {
    return reject('editorial_restate_only', lead, 'lead solo riassunto numerico');
  }

  // Proposta vaga quando il dossier ha candidati concreti
  const candidates = opts.dossier?.editorialReadingContext?.redistributionCandidates || [];
  if (
    candidates.length > 0
    && /frazione\s+(dell[’']?\s*)?introito|una\s+parte\s+(dei|degli)\s+(carboidrati|proteine)/i.test(actionText)
    && !quantitativeProposal
  ) {
    return reject('vague_food_proposal_with_candidates', actionText, 'proposta vaga con candidati in dossier');
  }

  const summary = hasSummary ? summaryCheck.summary : null;
  const todayText = typeof summary?.todayAction === 'string'
    ? summary.todayAction
    : cleanText(summary?.todayAction?.text);
  if (todayText) {
    const actionNorm = todayText.toLowerCase().replace(/\s+/g, ' ').trim();
    const sectionBlob = sections.map((s) => `${s.title}\n${s.body}`).join('\n')
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (actionNorm.length >= 24 && sectionBlob.includes(actionNorm)) {
      return reject('todayAction_repeated_in_sections', todayText, 'todayAction ripetuta nelle sections');
    }
  }

  // todayAction ↔ recommendedAction: stessi orari e grammi
  if (todayText && actionText) {
    const qtyMismatches = findActionQuantityMismatches(todayText, actionText);
    if (qtyMismatches.length > 0) {
      if (salvage) {
        actionText = todayText;
        autoFixes.push('recommendedAction_aligned_to_todayAction');
      } else {
        return reject('action_quantity_mismatch', {
          todayAction: todayText,
          recommendedAction: actionText,
          mismatches: qtyMismatches,
        }, 'orari/grammi diversi tra todayAction e recommendedAction');
      }
    }
  }

  // headline top-level allineato a summary
  if (summary?.headline) {
    headline = summary.headline;
  }

  // Limiti: se foodQuality partial, assicurati che limits lo citino (soft: aggiungi se assente)
  if (
    opts.dossier?.nutrition?.foodQuality?.completeness === 'partial'
    && !limits.some((l) => /off|catalogo|incomplet|partial|lavorazione/i.test(l))
  ) {
    limits = [
      ...limits,
      'Catalogo alimenti incompleto: alcuni dati di qualità non erano disponibili.',
    ].slice(0, 4);
  }
  const unclassifiedN = Number(opts.dossier?.nutrition?.foodQuality?.day?.provenanceCounts?.unclassified) || 0;
  if (
    unclassifiedN > 0
    && !limits.some((l) => /senza dati sulla lavorazione|non classificat|lavorazione/i.test(l))
  ) {
    limits = [
      ...limits,
      unclassifiedN === 1
        ? '1 alimento senza dati sulla lavorazione.'
        : `${unclassifiedN} alimenti senza dati sulla lavorazione.`,
    ].slice(0, 4);
  }

  // Mapping sezioni → pillar: niente fallback crociato (exercise ≠ nutrition).
  const nutritionSectionBody = sections.find((s) => /aliment|nutriz|qualit/i.test(s.id || '') || /aliment|nutriz|qualit/i.test(s.title || ''))?.body || null;
  const exerciseSectionBody = sections.find((s) => /eserciz|forza|cardio|allen|moviment/i.test(s.id || '') || /eserciz|forza|cardio|allen|moviment/i.test(s.title || ''))?.body || null;
  const sleepSectionBody = sections.find((s) => /sonno|recuper|orar/i.test(s.id || '') || /sonno|recuper|orar/i.test(s.title || ''))?.body || null;
  const nutritionOut = nutrition || nutritionSectionBody || null;
  const exerciseOut = exercise || exerciseSectionBody || null;
  const sleepOut = sleep || sleepSectionBody || null;

  const isV4 = Boolean(summary);
  const isV3 = !isV4 && (hasEditorial || Boolean(cleanText(parsed.headline)));

  /** Analisi canoniche v3/v4: senza campi legacy in persistenza. */
  const analysis = {
    schema: isV4
      ? 'kentu.focusAiCoachAnalysis.v4'
      : (isV3 ? 'kentu.focusAiCoachAnalysis.v3' : 'kentu.focusAiCoachAnalysis.v2'),
    summary,
    headline: headline || summary?.headline || 'Il quadro che emerge',
    lead,
    sections,
    keyInsight,
    recommendedAction: actionText,
    expectedChange,
    verifyNext,
    evidenceRefs,
    limits,
    claimLayers,
    quantitativeProposal,
    primaryPillarId,
    proposalVerification: qCheck,
    // Solo v2 (o input già legacy senza headline/sections moderne) ripete i campi storici in scrittura.
    ...((!isV4 && !isV3) ? {
      theEmergingPicture: lead,
      nutrition: nutritionOut,
      exercise: exerciseOut,
      sleep: sleepOut,
      importantConnections: importantConnections.length
        ? importantConnections
        : (keyInsight ? [keyInsight] : []),
      theChoiceIWouldMake: actionText,
      whatToWatchNext: verifyNext,
      integratedComment: lead,
      pillarObservations: { nutrition: nutritionOut, exercise: exerciseOut, sleep: sleepOut },
      focusAspects: importantConnections.length
        ? importantConnections
        : (keyInsight ? [keyInsight] : []),
      practicalAction: actionText,
    } : {}),
  };

  // Garantisce che normalize funzioni (lead può essere null in v4)
  const view = normalizeFocusEditorialAnalysis(analysis);
  if (!view?.recommendedAction) {
    return reject('normalize_failed', { hasRecommendedAction: false }, 'normalize senza recommendedAction');
  }
  if (view.schema !== 'kentu.focusAiCoachAnalysis.v4' && !view.lead) {
    return reject('normalize_failed', { schema: view.schema, lead: view.lead }, 'normalize senza lead (non-v4)');
  }

  const energyIrregular = Boolean(
    opts.dossier?.deterministicSignals?.activeIds?.includes?.('energy_irregular')
    || opts.dossier?.editorialReadingContext?.dayVersusRecent?.recent7dExcludingAnalysisDay?.irregular
    || opts.dossier?.editorialReadingContext?.energyVariability?.irregular,
  );
  const banned = findBannedPhrasesInAnalysis(analysis, { energyIrregular });
  if (!banned.ok) {
    if (salvage) {
      autoFixes.push('banned_phrases_accepted_after_salvage');
    } else {
      return {
        ok: false,
        reason: banned.reason || 'banned_user_facing_phrase',
        analysis: null,
        severity: 'retryable',
        bannedHits: banned.hits,
        failedRules: (banned.hits || []).map((h) => ({
          rule: 'banned_user_facing_phrase',
          value: { id: h.id, label: h.label, where: h.where },
          message: `termine vietato «${h.label}» in ${h.where}`,
        })),
        droppedEventRefs,
      };
    }
  }

  if (droppedEventRefs.length) {
    try {
      const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      if (dev) {
        // eslint-disable-next-line no-console
        console.info('[FocusAiCoach] dropped_event_refs', droppedEventRefs.slice(0, 20));
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    reason: null,
    analysis,
    droppedEventRefs,
    autoFixes,
    softAccepted: salvage && autoFixes.length > 0,
  };
}
