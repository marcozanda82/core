/**
 * Validazione risposta coach AI Kentu Focus (contratto editoriale v3 + compat v2).
 */

import { normalizeFocusEditorialAnalysis } from './normalizeFocusEditorialAnalysis.js';
import {
  coerceEvidenceRefArray,
  normalizeEvidenceRefId,
} from './resolveFocusEvidenceRefs.js';

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
export function validateFocusAiCoachResponse(rawText, opts = {}) {
  const unwrapped = unwrapFocusAiCoachJson(rawText);
  if (!unwrapped) {
    return { ok: false, reason: 'empty_response', analysis: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return { ok: false, reason: 'invalid_json', analysis: null };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not_object', analysis: null };
  }

  const forbiddenKeys = [
    'dailyScore', 'score', 'healthScore', 'longevityScore', 'longevityNutrition',
    'inflammationSummary', 'clinicalBulletinMarkdown', 'metabolicScore',
  ];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] != null && parsed[key] !== '') {
      return { ok: false, reason: `forbidden_field_${key}`, analysis: null };
    }
  }

  const hasEditorial = Boolean(
    cleanText(parsed.headline)
    && cleanText(parsed.lead)
    && Array.isArray(parsed.sections)
    && parsed.sections.length > 0
    && (cleanText(parsed.recommendedAction) || cleanText(parsed.theChoiceIWouldMake)),
  );

  let headline = cleanText(parsed.headline);
  let lead = cleanText(parsed.lead) || cleanText(parsed.theEmergingPicture) || cleanText(parsed.integratedComment);
  let recommendedAction = cleanText(parsed.recommendedAction)
    || cleanText(parsed.theChoiceIWouldMake)
    || cleanText(parsed.practicalAction);
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

  if (!lead || !recommendedAction || !primaryPillarId || sections.length === 0) {
    return { ok: false, reason: 'missing_required_fields', analysis: null };
  }
  if (!PILLAR_IDS.has(primaryPillarId)) {
    return { ok: false, reason: 'invalid_primary_pillar', analysis: null };
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

  if (BANNED_CLAIM_RE.test(blob)) {
    return { ok: false, reason: 'banned_clinical_or_score_claim', analysis: null };
  }

  if (headline && TECHNICAL_HEADLINE_RE.test(headline)) {
    return { ok: false, reason: 'technical_headline', analysis: null };
  }

  const restatesOnly = /hai registrato .{0,40}pasti?.{0,40}\d+\s*kcal/i.test(lead)
    && lead.length < 180;
  if (restatesOnly) {
    return { ok: false, reason: 'editorial_restate_only', analysis: null };
  }

  // Proposta vaga quando il dossier ha candidati concreti
  const candidates = opts.dossier?.editorialReadingContext?.redistributionCandidates || [];
  if (
    candidates.length > 0
    && /frazione\s+(dell[’']?\s*)?introito|una\s+parte\s+(dei|degli)\s+(carboidrati|proteine)/i.test(actionText)
    && !quantitativeProposal
  ) {
    return { ok: false, reason: 'vague_food_proposal_with_candidates', analysis: null };
  }

  const nutritionOut = nutrition || sections.find((s) => /aliment|nutriz/i.test(s.title))?.body || sections[0]?.body || lead;
  const exerciseOut = exercise || sections.find((s) => /eserciz|forza|cardio|allen/i.test(s.title))?.body || sections[0]?.body || lead;
  const sleepOut = sleep || sections.find((s) => /sonno|recuper/i.test(s.title))?.body || sections[0]?.body || lead;

  const analysis = {
    schema: hasEditorial || cleanText(parsed.headline)
      ? 'kentu.focusAiCoachAnalysis.v3'
      : 'kentu.focusAiCoachAnalysis.v2',
    headline: headline || 'Il quadro che emerge',
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
    // Compat storico / UI legacy
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
    proposalVerification: qCheck,
  };

  // Garantisce che normalize funzioni
  const view = normalizeFocusEditorialAnalysis(analysis);
  if (!view?.lead || !view?.recommendedAction) {
    return { ok: false, reason: 'normalize_failed', analysis: null };
  }

  return { ok: true, reason: null, analysis };
}
