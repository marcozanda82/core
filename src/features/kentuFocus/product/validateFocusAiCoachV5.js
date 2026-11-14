/**
 * Validazione del rapporto v5. La v4 resta nel validatore storico.
 * Un tone fuori stato si ritenta una volta; in recupero il codice lo corregge e lo segna.
 */

import {
  findBannedPhrasesInText,
  FOCUS_AI_COACH_BANNED_USER_PHRASES,
  FOCUS_AI_COACH_BANNED_V5_PHRASES,
  FOCUS_UNCLASSIFIED_FOOD_LIMIT,
} from './focusAiCoachBannedUserPhrases.js';
import { composeFocusV5Report } from './composeFocusV5Report.js';
import { lineWithPenaltyCites, missingPenaltyCites } from './focusPenaltyCite.js';

const PILLARS = new Set(['alimentazione', 'sonno', 'movimento', 'forza']);
const TONES = new Set(['positive', 'neutral', 'improve']);
const CLINICAL_RE = /diagnosi|punteggio\s*(di\s*)?salute|score\s*\d|0\s*[-–]\s*100|pronto\s+a\s+spingere|infiammazione\s+clinica|daily\s*score/i;
const QUANTITY_RE = /\d+(?:[.,]\d+)?\s*(?:kcal|calorie|kg|g\/kg|grammi|\bg\b)/i;
const SHARP_RE = /ottim[oa]|pessimo|perfett[oa]|disastro|fuori\s+rotta|sulla\s+rotta|eccellent/i;
const FORZA_RE = /\bforza\b|\bpesi\b|\bpalestra\b|\bdistrett/i;
const SUPPORT_RE = /professionist|medico|supporto|confront/i;
const HEADLINE_EXCUSE_RE = /\s+(?:ma|per[oò]|tuttavia|anche se)\b/i;
const ACTION_OR_RE = /\s+o\s+/i;
const DECIMAL_DURATION_RE = /\d+[.,]\d+\s*(?:ore|h)\b/i;
const MISSING_ACCENT_RE = /\battivita\b|\bpiu\b|\bperche\b/i;
const IMPERSONAL_RE = /\briposo (?:di|registrato)\b|\bnessun minuto\b|\bè stato registrato\b/i;
const SINGLE_DAY_RE = /\b(?:ultima notte|stanotte|questa notte|ieri|oggi)\b/i;

const ACT_HINT = Object.freeze({
  energy_very_low_repeated: /obiettiv|past[oi]|mangia|energia|deficit/,
  weight_loss_fast: /peso|calo/,
  protein_low_in_deficit: /protein/,
  no_rest_streak: /ripos/,
  load_spike: /carico|allenament|ripos/,
  same_district_no_recovery: /ripos|distrett|recuper/,
  overreaching: /rallent|scarico|ripos/,
  restrictive_pattern: /pasto|pasti|semplice|mangia|aggiungi/i,
});

const ACT_REPAIR = Object.freeze({
  energy_very_low_repeated: 'avvicina i pasti all’obiettivo, senza stringere oltre',
  weight_loss_fast: 'rallenta il calo del peso',
  protein_low_in_deficit: 'aggiungi una fonte proteica a un pasto',
  no_rest_streak: 'prendi il riposo come obiettivo e salta la sessione dura',
  load_spike: 'tieni il carico più basso delle settimane precedenti',
  same_district_no_recovery: 'lascia riposare il distretto allenato da poco',
  overreaching: 'tratta una settimana di scarico come un successo',
  restrictive_pattern: 'scegli un pasto semplice, senza stringere',
});

/**
 * @param {object} parsed
 * @param {{ dossier?: object|null, salvage?: boolean }} [opts]
 */
export function validateFocusAiCoachV5(parsed, opts = {}) {
  const salvage = Boolean(opts.salvage);
  const autoFixes = [];
  const brief = opts.dossier?.periodBrief || null;
  const report = {
    headline: clean(parsed.headline),
    pillars: Array.isArray(parsed.pillars) ? parsed.pillars.map((row) => ({ ...row })) : [],
    action: parsed.action && typeof parsed.action === 'object' ? { ...parsed.action } : null,
    deepDive: parsed.deepDive && typeof parsed.deepDive === 'object' ? { ...parsed.deepDive } : null,
    support: parsed.support && typeof parsed.support === 'object' ? { ...parsed.support } : null,
  };

  if (!report.headline) return fail('headline_missing', parsed.headline);
  if (report.headline.length > 70) return fail('headline_too_long', report.headline);
  if (!report.action || !clean(report.action.text)) return fail('action_missing', parsed.action);
  if (clean(report.action.text).length > 140) return fail('action_too_long', report.action.text);
  if (!report.deepDive) return fail('deepDive_missing', null);

  const expectedPillar = brief?.actionPillar || null;
  if (expectedPillar && report.action.pillar !== expectedPillar) {
    if (!salvage) return fail('action_pillar_mismatch', report.action.pillar, `atteso ${expectedPillar}`);
    report.action.pillar = expectedPillar;
    autoFixes.push(`action.pillar→${expectedPillar}`);
  }
  if (report.action.pillar && !PILLARS.has(report.action.pillar)) {
    return fail('action_pillar_invalid', report.action.pillar);
  }

  const byId = new Map((brief?.pillars || []).map((item) => [item.id, item]));
  const kept = [];
  for (const row of report.pillars) {
    const source = byId.get(row?.id);
    if (source?.status === 'inactive') return fail('forza_mentioned', row.id);
    if (!source || source.status === 'no_data' || source.active === false) continue;
    const tone = row.tone;
    if (!TONES.has(tone)) return fail('pillar_tone_invalid', tone);
    const line = clean(row.line);
    if (!line) return fail('pillar_line_missing', row.id);
    if (line.length > 110) return fail('pillar_line_too_long', line);
    if (!toneMatches(source.status, tone, row.id, brief)) {
      if (!salvage) return fail('pillar_tone_mismatch', tone, `${row.id} è ${source.status}`);
      row.tone = toneFor(source.status, row.id, brief);
      autoFixes.push(`tone:${row.id}:${tone}→${row.tone}`);
    }
    kept.push({
      id: row.id,
      line,
      tone: row.tone,
      eventRefs: Array.isArray(row.eventRefs) ? row.eventRefs.map(String) : [],
    });
  }
  report.pillars = kept;

  const act = (brief?.safety?.signals || []).find((item) => item.level === 'act');
  if (act?.id === 'restrictive_pattern') {
    const simple = ACT_HINT.restrictive_pattern.test(report.action.text);
    const invite = SUPPORT_RE.test(report.action.text);
    if (!simple || invite) {
      if (!salvage) return fail('safety_action_mismatch', report.action.text, act.id);
      report.action.text = repairAction(brief, act.id);
      autoFixes.push('action.text→restrictive_simple');
    }
  } else if (act && !actionMatches(act.id, report.action.text)) {
    if (!salvage) return fail('safety_action_mismatch', report.action.text, act.id);
    report.action.text = repairAction(brief, act.id);
    autoFixes.push(`action.text→${act.id}`);
  }
  if (/^(oggi|questa settimana|questo mese)\s+se ti va\b/i.test(report.action.text)) {
    if (!salvage) return fail('horizon_glued', report.action.text);
    report.action.text = repairAction(brief, act?.id || 'restrictive_pattern');
    autoFixes.push('action.text→horizon');
  }

  if (brief?.support) {
    const text = clean(report.support?.text);
    if (!text || !SUPPORT_RE.test(text)) {
      if (!salvage) return fail('support_missing', text);
      report.support = { text: 'Se ti va, confrontati con un professionista.' };
      autoFixes.push('support→restrictive');
    } else if (/^(oggi|questa settimana|questo mese)\s+se ti va\b/i.test(text)) {
      if (!salvage) return fail('horizon_glued', text);
      report.support = { text: 'Se ti va, confrontati con un professionista.' };
      autoFixes.push('support→horizon');
    } else {
      report.support = { text };
    }
  } else if (report.support) {
    if (!salvage) return fail('support_unexpected', report.support.text);
    report.support = null;
    autoFixes.push('support→removed');
  }

  const texts = collectTexts(report);
  if (brief?.safety?.suppressNumbers) {
    const hit = texts.find((item) => QUANTITY_RE.test(item.text));
    if (hit) {
      if (!salvage) return fail('suppress_numbers', hit.text);
      scrubQuantities(report);
      autoFixes.push('suppress_numbers');
    }
    if (SHARP_RE.test(report.headline)) {
      if (!salvage) return fail('suppress_numbers_tone', report.headline);
      report.headline = 'Meglio alleggerire i numeri e il giudizio';
      autoFixes.push('suppress_numbers_tone');
    }
  }

  const dayReport = brief?.horizon === 'oggi' || brief?.periodId === 'ieri' || !brief?.horizon;
  if (brief?.reliability === 'low') {
    if (dayReport && SHARP_RE.test(report.headline)) {
      if (!salvage) return fail('low_reliability_headline', report.headline);
      report.headline = 'Un giorno da leggere con calma';
      autoFixes.push('headline→soft');
    }
    const limits = Array.isArray(report.deepDive.limits) ? report.deepDive.limits.map(clean).filter(Boolean) : [];
    if (!limits.some((line) => /affidabilit|approssimat|buchi/i.test(line))) {
      if (!salvage) return fail('low_reliability_limits', limits);
      limits.push(dayReport
        ? 'Affidabilità bassa: il giorno è approssimato oppure ha buchi.'
        : 'Affidabilità bassa: ci sono giorni approssimati oppure con buchi.');
      autoFixes.push('limits→reliability');
    }
    report.deepDive.limits = limits;
  }

  if (brief?.reliability === 'medium' && dayReport) {
    if (report.headline === 'Un giorno da leggere con calma') {
      if (!salvage) return fail('medium_reliability_headline', report.headline);
      report.headline = composeFocusV5Report(brief).headline;
      autoFixes.push('headline→normal');
    }
    const limits = Array.isArray(report.deepDive.limits) ? report.deepDive.limits.map(clean).filter(Boolean) : [];
    if (!limits.some((line) => /affidabilità media|non confermat/i.test(line))) {
      if (!salvage) return fail('medium_reliability_limits', limits);
      limits.push('Affidabilità media: il giorno non è confermato.');
      autoFixes.push('limits→medium');
    }
    report.deepDive.limits = limits;
  }

  const forzaOff = (brief?.pillars || []).some((item) => item.id === 'forza' && item.status === 'inactive');
  if (forzaOff) {
    const hit = texts.find((item) => FORZA_RE.test(item.text));
    if (hit) return fail('forza_mentioned', hit.text);
  }

  const register = applyRegister(report, brief, salvage, autoFixes);
  if (register) return register;
  const quantity = applyActionQuantity(report, brief, salvage, autoFixes);
  if (quantity) return quantity;
  const foodLimit = applyUnclassifiedLimit(report, opts.dossier, salvage, autoFixes);
  if (foodLimit) return foodLimit;
  const penalty = applyPenaltyCites(report, brief, salvage, autoFixes);
  if (penalty) return penalty;
  const unconfirmed = applyUnconfirmedNote(report, brief, salvage, autoFixes);
  if (unconfirmed) return unconfirmed;

  const blob = collectTexts(report).map((item) => item.text).join('\n');
  if (CLINICAL_RE.test(blob)) return fail('banned_clinical_or_score_claim', blob.match(CLINICAL_RE)?.[0]);
  const banned = findBannedPhrasesInText(blob, [
    ...FOCUS_AI_COACH_BANNED_USER_PHRASES,
    ...FOCUS_AI_COACH_BANNED_V5_PHRASES,
  ]);
  if (banned.length > 0) return fail('banned_user_facing_phrase', banned[0].label);

  const unrecorded = (brief?.pillars || [])
    .filter((item) => item.status === 'no_data')
    .map((item) => ({ id: item.id, line: 'non registrato' }));

  return {
    ok: true,
    reason: null,
    severity: null,
    autoFixes,
    analysis: {
      schema: 'kentu.focusAiCoachAnalysis.v5',
      headline: report.headline,
      pillars: report.pillars,
      unrecorded,
      action: {
        text: clean(report.action.text),
        pillar: report.action.pillar,
        horizon: brief?.horizon || report.action.horizon || null,
      },
      support: report.support?.text ? { text: clean(report.support.text) } : null,
      deepDive: {
        lead: clean(report.deepDive.lead) || '',
        sections: Array.isArray(report.deepDive.sections) ? report.deepDive.sections : [],
        limits: Array.isArray(report.deepDive.limits) ? report.deepDive.limits.map(clean).filter(Boolean) : [],
        evidenceRefs: Array.isArray(report.deepDive.evidenceRefs) ? report.deepDive.evidenceRefs.map(String) : [],
      },
    },
  };
}

export function isFocusAiCoachV5(parsed) {
  return Boolean(parsed && typeof parsed === 'object' && parsed.pillars && parsed.action && parsed.deepDive);
}

function toneMatches(status, tone, pillarId, brief) {
  if (pillarId === 'alimentazione' && restrictiveOn(brief)) {
    if (tone === 'positive') return false;
    if (status === 'off_track') return tone === 'improve';
    return tone === 'neutral' || tone === 'improve';
  }
  if (status === 'on_track') return tone === 'positive';
  if (status === 'off_track') return tone === 'improve';
  if (status === 'halfway') return tone === 'neutral' || tone === 'improve';
  return true;
}

function toneFor(status, pillarId, brief) {
  if (pillarId === 'alimentazione' && restrictiveOn(brief)) {
    return status === 'off_track' ? 'improve' : 'neutral';
  }
  if (status === 'on_track') return 'positive';
  if (status === 'off_track') return 'improve';
  return 'neutral';
}

function restrictiveOn(brief) {
  return (brief?.safety?.signals || []).some((item) => (
    item.id === 'restrictive_pattern' && item.level === 'act'
  ));
}

function actionMatches(id, text) {
  const hint = ACT_HINT[id];
  if (!hint) return true;
  return hint.test(String(text || ''));
}

function repairAction(brief, id) {
  const horizon = horizonLead(brief?.actionHorizon || brief?.horizon);
  const sentence = String(ACT_REPAIR[id] || 'rallenta e tratta il riposo come un obiettivo')
    .replace(/^(oggi|questa settimana|questo mese|la prossima settimana|a [a-zàèéìòù]+)\s+/i, '');
  return `${horizon} ${sentence}.`;
}

function scrubQuantities(report) {
  const scrub = (text) => String(text || '').replace(QUANTITY_RE, '').replace(/\s{2,}/g, ' ').trim();
  report.headline = scrub(report.headline);
  report.action.text = scrub(report.action.text);
  if (report.deepDive) {
    report.deepDive.lead = scrub(report.deepDive.lead);
    report.deepDive.sections = (report.deepDive.sections || []).map((section) => ({
      ...section,
      title: scrub(section.title),
      body: scrub(section.body),
    }));
    report.deepDive.limits = (report.deepDive.limits || []).map(scrub);
  }
  report.pillars = report.pillars.map((row) => ({ ...row, line: scrub(row.line) }));
  if (report.support) report.support.text = scrub(report.support.text);
}

function keepHeadlineSignal(headline, excuse) {
  const left = headline.slice(0, excuse.index).trim().replace(/[,:;–—-]+$/, '').trim();
  const right = headline.slice(excuse.index + excuse[0].length).trim().replace(/[.!?…]+$/, '').trim();
  const justification = /media|allineat|comunque|nel complesso|abitual|consuet|contesto/i;
  const praise = /centrat|in linea|bene|ottim|buon|stabile/i;
  const pick = (text) => (text && text.length >= 8 ? text : '');
  if (justification.test(right)) return pick(left);
  if (praise.test(left) && !justification.test(right)) return pick(right);
  return pick(left) || pick(right);
}

const NUMBER_WORDS = Object.freeze([
  ['dieci', '10'], ['nove', '9'], ['otto', '8'], ['sette', '7'], ['sei', '6'],
  ['cinque', '5'], ['quattro', '4'], ['tre', '3'], ['due', '2'], ['una', '1'], ['uno', '1'],
]);

function actionAmount(text, unit) {
  let raw = String(text || '').toLowerCase();
  for (const [word, digit] of NUMBER_WORDS) {
    raw = raw.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  if (unit === 'min') {
    let best = 0;
    const multi = /(\d+)\s+(?:camminat\w*|uscite|volte|sessioni)\s+da\s+(\d+)\s*minut/g;
    for (const match of raw.matchAll(multi)) best = Math.max(best, Number(match[1]) * Number(match[2]));
    for (const match of raw.matchAll(/(\d+)\s*minut/g)) best = Math.max(best, Number(match[1]));
    return best;
  }
  if (unit === 'kcal') {
    const match = raw.match(/(\d+)\s*kcal/);
    return match ? Number(match[1]) : 0;
  }
  if (unit === 'sessioni') {
    const match = raw.match(/(\d+)\s+session/);
    if (match) return Number(match[1]);
    return /\bsession/.test(raw) ? 1 : 0;
  }
  return 0;
}

function applyActionQuantity(report, brief, salvage, autoFixes) {
  const close = brief?.actionClose;
  if (!close || !(close.minimum > 0)) return null;
  if ((brief?.safety?.signals || []).some((item) => item.level === 'act')) return null;
  if (actionAmount(report.action?.text, close.unit) >= close.minimum) return null;
  if (!salvage) {
    return fail('action_quantity_short', report.action?.text, `servono almeno ${close.minimum} ${close.unit}`);
  }
  const phrase = String(close.phrase || '').trim();
  if (!phrase) return fail('action_quantity_short', report.action?.text, `servono almeno ${close.minimum} ${close.unit}`);
  report.action.text = /[.!?…]$/.test(phrase) ? phrase : `${phrase}.`;
  autoFixes.push('action_quantity');
  return null;
}

function applyUnconfirmedNote(report, brief, salvage, autoFixes) {
  const note = brief?.unconfirmedNote;
  if (!note) return null;
  const limits = Array.isArray(report.deepDive?.limits) ? report.deepDive.limits.map(clean).filter(Boolean) : [];
  if (limits.includes(note)) {
    report.deepDive.limits = limits;
    return null;
  }
  if (!salvage) return fail('unconfirmed_days_omitted', limits, note);
  limits.push(note);
  report.deepDive.limits = limits;
  autoFixes.push('limits→unconfirmed');
  return null;
}

function applyPenaltyCites(report, brief, salvage, autoFixes) {
  const byId = new Map((brief?.pillars || []).map((item) => [item.id, item]));
  for (const row of report.pillars || []) {
    const missing = missingPenaltyCites(row.line, byId.get(row.id)?.penalties);
    if (missing.length === 0) continue;
    if (!salvage) {
      return fail('pillar_penalty_omitted', row.line, `${row.id}: ${missing.join(', ')}`);
    }
    row.line = lineWithPenaltyCites(row.line, missing);
    autoFixes.push(`line:${row.id}:penalty`);
  }
  return null;
}

function applyUnclassifiedLimit(report, dossier, salvage, autoFixes) {
  const required = (dossier?.generationLimits || []).includes(FOCUS_UNCLASSIFIED_FOOD_LIMIT);
  const jargon = collectTexts(report).find((item) => /catalogo|open food|classificazione/i.test(item.text));
  const limits = Array.isArray(report.deepDive?.limits) ? report.deepDive.limits.map(clean).filter(Boolean) : [];
  const hasSentence = limits.some((line) => line.includes('non hanno dati sulla lavorazione'));
  if (!jargon && (!required || hasSentence)) return null;
  if (!salvage) return fail('unclassified_food_limit', jargon?.text || limits, FOCUS_UNCLASSIFIED_FOOD_LIMIT);
  report.deepDive.limits = [
    ...limits.filter((line) => !/catalogo|open food|classificazione/i.test(line)),
    FOCUS_UNCLASSIFIED_FOOD_LIMIT,
  ];
  autoFixes.push('unclassified_food_limit');
  return null;
}

function applyRegister(report, brief, salvage, autoFixes) {
  const excuse = String(report.headline || '').match(HEADLINE_EXCUSE_RE);
  if (excuse) {
    if (!salvage) return fail('headline_excuse', report.headline, 'il titolo giustifica il segnale negativo');
    const kept = keepHeadlineSignal(report.headline, excuse);
    if (!kept) return fail('headline_excuse', report.headline, 'il titolo giustifica il segnale negativo');
    report.headline = kept;
    autoFixes.push('headline_excuse_stripped');
  }

  if (ACTION_OR_RE.test(report.action?.text || '')) {
    if (!salvage) return fail('action_has_or_alternative', report.action.text, 'l’azione ha una sola leva');
    const cut = String(report.action.text).split(ACTION_OR_RE)[0].trim();
    if (!cut) return fail('action_has_or_alternative', report.action.text, 'l’azione ha una sola leva');
    report.action.text = /[.!?…]$/.test(cut) ? cut : `${cut}.`;
    autoFixes.push('action_or_stripped');
  }

  const decimal = collectTexts(report).find((item) => DECIMAL_DURATION_RE.test(item.text));
  if (decimal) return fail('duration_decimal', decimal.text, 'le durate sono «6 h 50», mai decimali');

  const accent = collectTexts(report).find((item) => MISSING_ACCENT_RE.test(item.text));
  if (accent) {
    if (!salvage) return fail('missing_accent', accent.text, 'manca l’accento su attività, più o perché');
    rewriteAccents(report);
    autoFixes.push('accents_restored');
  }

  const impersonal = collectTexts(report).find((item) => IMPERSONAL_RE.test(item.text));
  if (impersonal) return fail('register_impersonal', impersonal.text, 'seconda persona diretta');

  const period = brief?.periodId === 'settimana' || brief?.periodId === 'mese'
    || brief?.horizon === 'questa settimana' || brief?.horizon === 'questo mese';
  const minutes = applyMinuteDigits(report, salvage, autoFixes);
  if (minutes) return minutes;
  const lead = applyActionLead(report, brief, salvage, autoFixes);
  if (lead) return lead;
  if (period) {
    const dayHit = collectTexts(report).find((item) => SINGLE_DAY_RE.test(item.text));
    if (dayHit) return fail('period_single_day', dayHit.text, 'il periodo non cita l’ultima notte né un giorno singolo');
  }
  return null;
}

function horizonLead(horizon) {
  if (horizon === 'questa settimana') return 'Questa settimana';
  if (horizon === 'questo mese') return 'Questo mese';
  if (horizon === 'la prossima settimana') return 'La prossima settimana';
  const month = String(horizon || '').match(/^a ([a-zàèéìòù]+)$/i);
  if (month) return `A ${month[1]}`;
  return 'Oggi';
}

function leadFor(brief) {
  const chosen = (brief?.pillars || []).find((item) => item.id === brief?.actionPillar);
  const cause = brief?.actionClose?.unit === 'causa';
  const act = (brief?.safety?.signals || []).some((item) => item.level === 'act');
  const needsLead = cause || act || (chosen && chosen.status && chosen.status !== 'on_track');
  if (!needsLead) return null;
  return horizonLead(brief?.actionHorizon || brief?.horizon);
}

function applyActionLead(report, brief, salvage, autoFixes) {
  const owned = brief?.actionHorizon || brief?.horizon;
  if (owned && report.action) report.action.horizon = owned;
  const lead = leadFor(brief);
  if (!lead || !report.action?.text) return null;
  const text = clean(report.action.text);
  if (new RegExp(`^${lead}\\b`, 'i').test(text)) return null;
  const body = text
    .replace(/^(oggi|questa settimana|questo mese|la prossima settimana|a [a-zàèéìòù]+)\s+/i, '')
    .replace(/[.]+$/, '')
    .trim();
  report.action.text = `${lead} ${body}.`.replace(/\s+/g, ' ');
  autoFixes.push('action→horizon');
  void salvage;
  return null;
}

function applyMinuteDigits(report, salvage, autoFixes) {
  const pad = (text) => String(text || '').replace(/\b(\d+)\s+h\s+(\d)(?!\d)/g, '$1 h 0$2');
  const before = JSON.stringify(report);
  report.headline = pad(report.headline);
  if (report.action) report.action.text = pad(report.action.text);
  if (report.support?.text) report.support.text = pad(report.support.text);
  for (const row of report.pillars || []) row.line = pad(row.line);
  if (report.deepDive) {
    report.deepDive.lead = pad(report.deepDive.lead);
    for (const section of report.deepDive.sections || []) {
      if (section.title) section.title = pad(section.title);
      if (section.body) section.body = pad(section.body);
      if (section.content) section.content = pad(section.content);
    }
    report.deepDive.limits = (report.deepDive.limits || []).map(pad);
  }
  if (JSON.stringify(report) !== before) autoFixes.push('minutes→two-digits');
  void salvage;
  return null;
}

function rewriteAccents(report) {
  const fix = (text) => String(text || '')
    .replace(/\bAttivita\b/g, 'Attività')
    .replace(/\battivita\b/g, 'attività')
    .replace(/\bPiu\b/g, 'Più')
    .replace(/\bpiu\b/g, 'più')
    .replace(/\bPerche\b/g, 'Perché')
    .replace(/\bperche\b/g, 'perché');
  report.headline = fix(report.headline);
  if (report.action) report.action.text = fix(report.action.text);
  if (report.support?.text) report.support.text = fix(report.support.text);
  for (const row of report.pillars || []) row.line = fix(row.line);
  if (!report.deepDive) return;
  report.deepDive.lead = fix(report.deepDive.lead);
  for (const section of report.deepDive.sections || []) {
    if (!section) continue;
    section.title = fix(section.title);
    section.body = fix(section.body);
    section.content = fix(section.content);
    section.text = fix(section.text);
  }
  report.deepDive.limits = (report.deepDive.limits || []).map(fix);
}

function pushStrings(push, where, value) {
  if (typeof value === 'string') push(where, value);
  else if (Array.isArray(value)) value.forEach((item) => pushStrings(push, where, item));
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) pushStrings(push, where, item);
  }
}

function collectTexts(report) {
  const out = [];
  const push = (where, text) => {
    if (text) out.push({ where, text: String(text) });
  };
  push('headline', report.headline);
  push('action', report.action?.text);
  push('support', report.support?.text);
  push('lead', report.deepDive?.lead);
  for (const row of report.pillars || []) push(row.id, row.line);
  for (const section of report.deepDive?.sections || []) {
    pushStrings(push, 'section', section);
  }
  for (const line of report.deepDive?.limits || []) push('limits', line);
  return out;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fail(rule, value, message) {
  return {
    ok: false,
    reason: rule,
    analysis: null,
    severity: rule === 'banned_clinical_or_score_claim' ? 'blocking' : 'fixable',
    failedRules: [{ rule, value: value == null ? null : value, message: message || rule }],
    autoFixes: [],
  };
}
