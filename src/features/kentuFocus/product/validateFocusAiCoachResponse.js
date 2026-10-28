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
 */
export function validateFocusAiCoachSummary(parsed, dossier) {
  const summary = parsed?.summary;
  if (!summary || typeof summary !== 'object') {
    return failRule('summary_missing', summary, 'summary assente');
  }
  const headline = cleanText(summary.headline) || cleanText(parsed.headline);
  if (!headline) return failRule('summary_headline_missing', summary.headline, 'headline vuota');
  const headlineSoft = softMaxLen(SUMMARY_HEADLINE_MAX);
  if (headline.length > headlineSoft) {
    return {
      ...failRule(
        'summary_headline_too_long',
        { length: headline.length, max: SUMMARY_HEADLINE_MAX, softMax: headlineSoft, text: headline },
        `headline ${headline.length} > softMax ${headlineSoft}`,
      ),
      severity: 'fixable',
    };
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

  let todayAction = cleanText(summary.todayAction);
  if (!todayAction && summary.todayAction && typeof summary.todayAction === 'object') {
    todayAction = cleanText(summary.todayAction.text);
  }
  if (!todayAction) return failRule('summary_todayAction_missing', summary.todayAction, 'todayAction vuota');
  const actionSoft = softMaxLen(SUMMARY_ACTION_MAX);
  if (todayAction.length > actionSoft) {
    return {
      ...failRule(
        'summary_todayAction_too_long',
        { length: todayAction.length, max: SUMMARY_ACTION_MAX, softMax: actionSoft, text: todayAction },
        `todayAction ${todayAction.length} > softMax ${actionSoft}`,
      ),
      severity: 'fixable',
    };
  }

  const droppedEventRefs = [
    ...(went.droppedEventRefs || []),
    ...(improve.droppedEventRefs || []),
  ];

  return {
    ok: true,
    reason: null,
    droppedEventRefs,
    summary: {
      headline,
      wentWell: went.items,
      toImprove: improve.items,
      todayAction,
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
  const summaryRequested = parsed.summary != null || opts.requireSummary === true;
  const summaryCheck = summaryRequested
    ? validateFocusAiCoachSummary(parsed, opts.dossier || null)
    : { ok: true, reason: null, summary: null, droppedEventRefs: [] };
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
    };
  }
  /** @type {string[]} */
  const droppedEventRefs = [...(summaryCheck.droppedEventRefs || [])];
  const hasSummary = Boolean(summaryCheck.ok && summaryCheck.summary);

  let headline = cleanText(parsed.headline) || summaryCheck.summary?.headline || null;
  // lead: o dato concreto, o omesso (null). Stringa vuota → null.
  let lead = parsed.lead === null
    ? null
    : (cleanText(parsed.lead) || cleanText(parsed.theEmergingPicture) || cleanText(parsed.integratedComment));
  // Se lead assente e c'è summary v4, resta null (omesso). Fallback legacy solo senza summary.
  if (!lead && !hasSummary) {
    lead = cleanText(parsed.theEmergingPicture) || cleanText(parsed.integratedComment);
  }

  let recommendedAction = cleanText(parsed.recommendedAction)
    || cleanText(parsed.theChoiceIWouldMake)
    || cleanText(parsed.practicalAction)
    || summaryCheck.summary?.todayAction
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
      return reject('claimLayers_required', parsed.claimLayers, 'claimLayers obbligatorio');
    }
    for (const k of ['recordedFacts', 'generalKnowledge', 'foundedInferences', 'hypothesesToTest']) {
      if (!Array.isArray(parsed.claimLayers[k])) {
        return reject('claimLayers_incomplete', { key: k, value: parsed.claimLayers[k] }, `claimLayers.${k} non array`);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'quantitativeProposal')) {
      return reject('quantitativeProposal_required', null, 'chiave quantitativeProposal assente');
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
    for (const raw of coerceEvidenceRefArray(parsed.evidenceRefs)) {
      let id = normalizeEvidenceRefId(raw);
      if (!id && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const label = String(raw.label || raw.title || raw.name || '').trim();
        if (label) id = label;
      }
      if (!id) continue;
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      evidenceRefs.push(id);
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
  if (summary?.todayAction) {
    const actionNorm = summary.todayAction.toLowerCase().replace(/\s+/g, ' ').trim();
    const sectionBlob = sections.map((s) => `${s.title}\n${s.body}`).join('\n')
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (actionNorm.length >= 24 && sectionBlob.includes(actionNorm)) {
      return reject('todayAction_repeated_in_sections', summary.todayAction, 'todayAction ripetuta nelle sections');
    }
  }

  // todayAction ↔ primo toImprove: stessa leva (overlap lessicale minimo)
  if (summary?.todayAction && Array.isArray(summary.toImprove) && summary.toImprove[0]?.text) {
    const actionTokens = new Set(
      summary.todayAction.toLowerCase().split(/[^a-zàèéìòù0-9]+/i).filter((t) => t.length >= 4),
    );
    const firstImprove = String(summary.toImprove[0].text).toLowerCase();
    let overlap = 0;
    for (const t of actionTokens) {
      if (firstImprove.includes(t)) overlap += 1;
    }
    if (actionTokens.size >= 3 && overlap < 1) {
      return reject('todayAction_mismatch_first_toImprove', {
        todayAction: summary.todayAction,
        firstToImprove: summary.toImprove[0].text,
        overlap,
      }, 'todayAction non allineata al primo toImprove');
    }
  }

  // Limiti: se foodQuality partial, assicurati che limits lo citino (soft: aggiungi se assente)
  if (
    opts.dossier?.nutrition?.foodQuality?.completeness === 'partial'
    && !limits.some((l) => /off|catalogo|incomplet|partial/i.test(l))
  ) {
    limits = [
      ...limits,
      'Catalogo OFF non pronto: qualità alimentare parziale (off_catalog_not_ready).',
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

  const banned = findBannedPhrasesInAnalysis(analysis);
  if (!banned.ok) {
    return {
      ok: false,
      reason: banned.reason || 'banned_user_facing_phrase',
      analysis: null,
      severity: 'fixable',
      bannedHits: banned.hits,
      failedRules: (banned.hits || []).map((h) => ({
        rule: 'banned_user_facing_phrase',
        value: { id: h.id, label: h.label, where: h.where },
        message: `termine vietato «${h.label}» in ${h.where}`,
      })),
      droppedEventRefs,
    };
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

  return { ok: true, reason: null, analysis, droppedEventRefs };
}
