/**
 * Fallback editoriale deterministico — edizione pubblicabile senza Gemini.
 * Usa soltanto seed/evidenze della selection.
 * lead null NON svuota good/feature/concern: articles[] riflette la selection.
 */

import {
  createFocusWrittenArticle,
  createFocusWrittenEdition,
  FOCUS_PROSE_SOURCE,
  FOCUS_WRITING_LIMITS,
} from './focusWrittenEdition.v1.js';

/**
 * @param {object} item
 * @param {string} role
 * @param {number} selectionIndex
 * @param {{ analysisDate: string, publicationDate: string }} dates
 */
function articleFromSeed(item, role, selectionIndex, dates) {
  const title = soberTitle(item.headlineSeed, role);
  const body = soberBody(item, role, dates);
  const evidenceIds = [];
  for (const ref of item.refs || []) {
    if (typeof ref === 'string' && !evidenceIds.includes(ref)) evidenceIds.push(ref);
  }
  for (const m of item.metrics || []) {
    if (m?.path && !evidenceIds.includes(m.path)) evidenceIds.push(m.path);
  }

  const metricsCited = (item.metrics || [])
    .filter((m) => m && m.path)
    .map((m) => ({
      path: m.path,
      value: m.value,
      unit: m.unit ?? null,
      provenance: m.provenance,
    }));

  const cautions = [
    ...(item.limitations || []),
    ...(item.doNotClaim || []),
  ].slice(0, FOCUS_WRITING_LIMITS.cautionsMax);

  return createFocusWrittenArticle({
    id: item.id,
    role,
    title,
    body,
    evidenceIds: evidenceIds.slice(0, FOCUS_WRITING_LIMITS.evidenceIdsMax),
    metricsCited,
    cautions,
    selectionIndex,
  });
}

function soberTitle(seed, role) {
  const base = String(seed || '').trim() || defaultTitle(role);
  // Evita punti esclamativi / sensazionalismo tipico
  return base.replace(/!+/g, '').replace(/\s+/g, ' ').slice(0, FOCUS_WRITING_LIMITS.titleMaxChars);
}

function defaultTitle(role) {
  if (role === 'concern') return 'Un punto da osservare con calma';
  if (role === 'feature') return 'Uno spunto dal diario';
  if (role === 'good') return 'Un segnale positivo';
  return 'In evidenza oggi';
}

/**
 * @param {object} item
 * @param {string} role
 * @param {{ analysisDate: string, publicationDate: string }} dates
 */
function soberBody(item, role, dates) {
  const summary = String(item.summarySeed || '').trim();
  const parts = [];

  parts.push(
    `Edizione del ${dates.publicationDate}, in riferimento alla giornata del ${dates.analysisDate}. `
    + (summary
      ? `${summary}${/[.!?]$/.test(summary) ? '' : '.'}`
      : 'Dal diario emerge un dettaglio da raccontare senza enfasi.'),
  );

  const recorded = (item.metrics || []).filter(
    (m) => m && m.value != null && m.provenance === 'recorded',
  );
  if (recorded.length > 0) {
    const bits = recorded.slice(0, 3).map((m) => {
      const unit = m.unit ? ` ${m.unit}` : '';
      const short = String(m.path).split('.').slice(-2).join('.');
      return `${short} ${m.value}${unit}`;
    });
    parts.push(`Nel fascicolo restano annotati ${bits.join(', ')}.`);
  }

  const estimated = (item.metrics || []).filter((m) => m?.provenance === 'estimated');
  if (estimated.length > 0) {
    parts.push('Dove i valori sono stimati, non vanno letti come misure dirette.');
  }

  if (item.claimType === 'hypothesis') {
    parts.push('Resta un’ipotesi di lettura, non un fatto consolidato.');
  }

  if (role === 'concern') {
    parts.push('Si osserva con calma, senza trasformarlo in verdetto.');
  }

  if (item.evidenceQuality === 'low') {
    parts.push('La qualità dell’evidenza invita a non forzare conclusioni.');
  }

  let body = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (body.length < FOCUS_WRITING_LIMITS.bodyMinChars) {
    body = `${body} Il pezzo resta essenziale e fedele alle sole evidenze selezionate.`
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (body.length > FOCUS_WRITING_LIMITS.bodyMaxChars) {
    body = `${body.slice(0, FOCUS_WRITING_LIMITS.bodyMaxChars - 1)}…`;
  }
  return body;
}

/**
 * @param {{ selection: object }} input
 */
export function buildFallbackWrittenEdition(input) {
  const selection = input?.selection;
  if (!selection) throw new Error('buildFallbackWrittenEdition: selection richiesta');

  const dates = {
    analysisDate: selection.analysisDate,
    publicationDate: selection.publicationDate,
  };

  const articles = [];
  let index = 0;
  if (selection.lead) {
    articles.push(articleFromSeed(selection.lead, 'lead', index, dates));
    index += 1;
  }
  for (const n of selection.goodNews || []) {
    articles.push(articleFromSeed(n, 'good', index, dates));
    index += 1;
  }
  for (const n of selection.features || []) {
    articles.push(articleFromSeed(n, 'feature', index, dates));
    index += 1;
  }
  for (const n of selection.concerns || []) {
    articles.push(articleFromSeed(n, 'concern', index, dates));
    index += 1;
  }

  let coach = null;
  if (selection.coach && selection.coach.templateId !== 'NONE') {
    const seed = String(selection.coach.textSeed || '').trim();
    let body = seed
      || 'Un invito leggero, senza pressioni: resta all’interno di ciò che il diario già suggerisce.';
    if (body.length > FOCUS_WRITING_LIMITS.coachBodyMaxChars) {
      body = `${body.slice(0, FOCUS_WRITING_LIMITS.coachBodyMaxChars - 1)}…`;
    }
    coach = {
      id: selection.coach.id,
      templateId: selection.coach.templateId,
      title: 'Nota del coach',
      body,
    };
  }

  const mastheadTeaser = articles[0]?.title
    || (articles.length === 0
      ? `Edizione essenziale del ${dates.publicationDate}: poche evidenze registrate per il ${dates.analysisDate}.`
      : articles[0].title);

  return createFocusWrittenEdition({
    analysisDate: dates.analysisDate,
    publicationDate: dates.publicationDate,
    openingMode: selection.openingMode || 'neutral',
    articles,
    coach,
    proseSource: FOCUS_PROSE_SOURCE.fallback,
    mastheadTeaser,
  });
}
