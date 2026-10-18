/**
 * Applica FocusWrittenEdition (già risolto) sopra l’edizione essenziale.
 */

import { FOCUS_PROSE_SOURCE } from './focusWrittenEdition.v1.js';

/**
 * @param {object} newsItem slim da buildEssentialEdition
 * @param {object|undefined} article written
 */
function mergeNews(newsItem, article) {
  if (!newsItem) return null;
  if (!article) return newsItem;
  return {
    ...newsItem,
    title: article.title,
    body: article.body,
    evidenceIds: article.evidenceIds || [],
    metricsCited: article.metricsCited || [],
    cautions: article.cautions || [],
    selectionIndex: article.selectionIndex,
  };
}

/**
 * @param {{
 *   revisionDoc: object,
 *   editionMeta: object,
 *   archiveEntry: object,
 * }} built
 * @param {object} written FocusWrittenEdition
 */
export function applyWrittenEditionToRevision(built, written) {
  const byId = new Map((written.articles || []).map((a) => [a.id, a]));
  const rev = built.revisionDoc;

  const lead = rev.lead ? mergeNews(rev.lead, byId.get(rev.lead.id)) : null;
  const goodNews = (rev.goodNews || []).map((n) => mergeNews(n, byId.get(n.id)));
  const features = (rev.features || []).map((n) => mergeNews(n, byId.get(n.id)));
  const concerns = (rev.concerns || []).map((n) => mergeNews(n, byId.get(n.id)));

  let coach = rev.coach;
  if (written.coach && rev.coach) {
    coach = {
      ...rev.coach,
      title: written.coach.title || rev.coach.title || null,
      body: written.coach.body,
      textSeed: rev.coach.textSeed,
    };
  }

  const proseSource = written.proseSource || FOCUS_PROSE_SOURCE.fallback;
  const isFallback = proseSource === FOCUS_PROSE_SOURCE.fallback;

  const headline = lead?.title
    || goodNews[0]?.title
    || concerns[0]?.title
    || written.mastheadTeaser
    || built.editionMeta.headline;

  const teaser = written.mastheadTeaser
    || lead?.body?.slice(0, 160)
    || built.editionMeta.teaser;

  const revisionDoc = {
    ...rev,
    lead,
    goodNews,
    features,
    concerns,
    coach,
    editorialNotes: [
      ...(rev.editorialNotes || []).filter(
        (n) => n !== 'technical_edition_no_gemini_prose',
      ),
      isFallback ? 'prose_source_fallback' : 'prose_source_validated_ai',
      'no_unvalidated_ai_prose',
    ],
    technicalOnly: false,
    proseSource,
    aiBriefRef: rev.aiBriefRef,
  };

  const editionMeta = {
    ...built.editionMeta,
    headline,
    teaser,
  };

  const archiveEntry = {
    ...built.archiveEntry,
    headline,
    teaser,
  };

  return { revisionDoc, editionMeta, archiveEntry };
}
