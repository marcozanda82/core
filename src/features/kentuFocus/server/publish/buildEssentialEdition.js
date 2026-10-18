/**
 * Edizione tecnica essenziale da FocusEditorialSelection (niente prosa Gemini).
 * Non inventa articoli per riempire sezioni vuote.
 */

import {
  createFocusArchiveIndexEntry,
  createFocusEditionMeta,
  createFocusEditionRevision,
  FOCUS_EDITION_STATUS,
} from '../contracts/focusPersistence.v1.js';

/**
 * Slim news: solo seed + evidenze già validate in selection.
 * @param {object|null} item
 */
function slimNews(item) {
  if (!item) return null;
  return {
    id: item.id,
    topicId: item.topicId,
    role: item.role,
    tone: item.tone,
    claimType: item.claimType,
    domain: item.domain,
    headlineSeed: item.headlineSeed,
    summarySeed: item.summarySeed,
    refs: item.refs || [],
    metrics: (item.metrics || []).map((m) => ({
      path: m.path,
      value: m.value,
      unit: m.unit ?? null,
      provenance: m.provenance,
    })),
    evidenceQuality: item.evidenceQuality,
    limitations: item.limitations || [],
    doNotClaim: item.doNotClaim || [],
    score: item.score,
  };
}

/**
 * @param {{
 *   selection: object,
 *   revision: number,
 *   inputFingerprint: string,
 *   dossierContentHash?: string|null,
 *   publishedAt?: string,
 *   status?: string,
 * }} input
 */
export function buildEssentialEditionFromSelection(input) {
  const selection = input.selection;
  if (!selection) throw new Error('buildEssentialEditionFromSelection: selection richiesta');

  const publishedAt = input.publishedAt || new Date().toISOString();
  const status = input.status || FOCUS_EDITION_STATUS.published;
  const lead = slimNews(selection.lead);
  const goodNews = (selection.goodNews || []).map(slimNews).filter(Boolean);
  const features = (selection.features || []).map(slimNews).filter(Boolean);
  const concerns = (selection.concerns || []).map(slimNews).filter(Boolean);
  const coach = selection.coach
    ? {
      id: selection.coach.id,
      templateId: selection.coach.templateId,
      textSeed: selection.coach.textSeed,
      refs: selection.coach.refs || [],
      horizonDays: selection.coach.horizonDays ?? null,
      doNotClaim: selection.coach.doNotClaim || [],
    }
    : null;

  const headline = lead?.headlineSeed
    || goodNews[0]?.headlineSeed
    || (concerns[0] ? concerns[0].headlineSeed : null)
    || 'Edizione Kentu Focus';

  const teaser = lead?.summarySeed
    || goodNews[0]?.summarySeed
    || 'Edizione tecnica basata sulle evidenze selezionate.';

  const revisionDoc = createFocusEditionRevision({
    publicationDate: selection.publicationDate,
    analysisDate: selection.analysisDate,
    revision: input.revision,
    status,
    openingMode: selection.openingMode || 'neutral',
    lead,
    goodNews,
    features,
    concerns,
    coach,
    omitted: selection.omitted || [],
    editorialNotes: [
      ...(selection.editorialNotes || []),
      'technical_edition_no_gemini_prose',
    ],
    selectionRef: {
      schemaVersion: selection.schemaVersion,
      openingMode: selection.openingMode,
      caps: selection.caps,
    },
    aiBriefRef: null,
    publishedAt,
    inputFingerprint: input.inputFingerprint,
    dossierContentHash: input.dossierContentHash ?? null,
    technicalOnly: true,
  });

  const editionMeta = createFocusEditionMeta({
    publicationDate: selection.publicationDate,
    analysisDate: selection.analysisDate,
    currentRevision: input.revision,
    status,
    headline,
    teaser,
    publishedAt,
    inputFingerprint: input.inputFingerprint,
    dossierContentHash: input.dossierContentHash ?? null,
  });

  const archiveEntry = createFocusArchiveIndexEntry({
    publicationDate: selection.publicationDate,
    analysisDate: selection.analysisDate,
    revision: input.revision,
    status,
    headline,
    teaser,
    publishedAt,
  });

  return { revisionDoc, editionMeta, archiveEntry };
}
