/**
 * Vista editoriale unificata: analisi v3 nuove + compat v2/v1 già salvate.
 */

import {
  coerceEvidenceRefArray,
  normalizeEvidenceRefId,
} from './resolveFocusEvidenceRefs.js';

/**
 * Per la vista normalizzata teniamo id stringa quando possibile;
 * oggetti con solo label umana → id = label (il renderer userà anche i raw).
 * @param {unknown} refs
 * @returns {string[]}
 */
function cleanEvidenceRefList(refs) {
  const list = coerceEvidenceRefArray(refs);
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    let id = normalizeEvidenceRefId(raw);
    if (!id && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const label = String(raw.label || raw.title || raw.name || '').trim();
      if (label) id = label;
    }
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out.slice(0, 8);
}

/**
 * @param {string|null|undefined} text
 * @param {number} [max]
 */
function firstSentence(text, max = 90) {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

/**
 * @param {object|null|undefined} analysis
 * @returns {object|null}
 */
export function normalizeFocusEditorialAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return null;

  // Solo lo schema v3 marca le analisi nuove; v2 può avere headline/sections
  // ricostruite dal validatore per la UI, ma resta legacyCompat.
  const isV3 = analysis.schema === 'kentu.focusAiCoachAnalysis.v3';

  if (isV3) {
    return {
      schema: 'kentu.focusAiCoachAnalysis.v3',
      headline: analysis.headline,
      lead: analysis.lead,
      sections: (analysis.sections || []).filter((s) => s?.title && s?.body),
      keyInsight: analysis.keyInsight || null,
      recommendedAction: analysis.recommendedAction || analysis.theChoiceIWouldMake || analysis.practicalAction,
      expectedChange: analysis.expectedChange || null,
      verifyNext: analysis.verifyNext || analysis.whatToWatchNext,
      evidenceRefs: cleanEvidenceRefList(analysis.evidenceRefs),
      limits: Array.isArray(analysis.limits) ? analysis.limits : [],
      claimLayers: analysis.claimLayers || null,
      quantitativeProposal: analysis.quantitativeProposal || null,
      primaryPillarId: analysis.primaryPillarId || 'balanced',
      proposalVerification: analysis.proposalVerification || null,
      legacyCompat: false,
      // campi legacy per codice che li legge ancora
      theEmergingPicture: analysis.lead || analysis.theEmergingPicture,
      theChoiceIWouldMake: analysis.recommendedAction || analysis.theChoiceIWouldMake,
      whatToWatchNext: analysis.verifyNext || analysis.whatToWatchNext,
    };
  }

  const picture = analysis.theEmergingPicture || analysis.integratedComment || null;
  const nutrition = analysis.nutrition || analysis.pillarObservations?.nutrition || null;
  const exercise = analysis.exercise || analysis.pillarObservations?.exercise || null;
  const sleep = analysis.sleep || analysis.pillarObservations?.sleep || null;
  const choice = analysis.theChoiceIWouldMake || analysis.practicalAction || null;
  const watch = analysis.whatToWatchNext || null;
  const connections = analysis.importantConnections || analysis.focusAspects || [];

  /** @type {object[]} */
  const sections = [];
  if (nutrition) sections.push({ id: 'nutrition', title: 'Alimentazione', body: nutrition });
  if (exercise) sections.push({ id: 'exercise', title: 'Esercizio e forma fisica', body: exercise });
  if (sleep) sections.push({ id: 'sleep', title: 'Sonno e recupero', body: sleep });

  return {
    schema: analysis.schema || 'kentu.focusAiCoachAnalysis.v2',
    headline: firstSentence(picture) || 'Il quadro che emerge',
    lead: picture,
    sections,
    keyInsight: connections[0] || null,
    recommendedAction: choice,
    expectedChange: null,
    verifyNext: watch,
    evidenceRefs: cleanEvidenceRefList(analysis.evidenceRefs),
    limits: [],
    claimLayers: analysis.claimLayers || null,
    quantitativeProposal: analysis.quantitativeProposal || null,
    primaryPillarId: analysis.primaryPillarId || 'balanced',
    proposalVerification: analysis.proposalVerification || null,
    legacyCompat: true,
    theEmergingPicture: picture,
    theChoiceIWouldMake: choice,
    whatToWatchNext: watch,
    importantConnections: connections,
  };
}
