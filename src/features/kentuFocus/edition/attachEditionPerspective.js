/**
 * Attacca al FocusDossier il blocco prospettico edizione (P6.5 / P6.5.1).
 * Non altera la cronaca quotidiana già assemblata.
 */

import { buildEditionPerspective } from './aggregateEditionWindows.js';
import { resolveEditionWindows } from './editionCalendar.js';

/**
 * @param {object} dossier
 * @param {object[]} historyDayBriefs
 * @param {{
 *   seriesFrom?: string,
 *   seriesTo?: string,
 *   asOfDate?: string,
 *   presetHint?: string,
 *   forceSimulation?: boolean,
 * }} [ctx]
 */
export function attachEditionPerspective(dossier, historyDayBriefs, ctx = {}) {
  if (!dossier?.meta?.publicationDate) {
    throw new Error('attachEditionPerspective: publicationDate richiesto');
  }
  const windows = resolveEditionWindows(dossier.meta.publicationDate);
  const perspective = buildEditionPerspective(historyDayBriefs, windows, {
    seriesFrom: ctx.seriesFrom || null,
    seriesTo: ctx.seriesTo || dossier.meta.analysisDate || null,
    asOfDate: ctx.asOfDate || null,
    presetHint: ctx.presetHint || null,
    forceSimulation: Boolean(ctx.forceSimulation),
  });
  dossier.edition = perspective;
  dossier.meta.editionKind = perspective.editionKind;
  dossier.meta.asOfDate = perspective.asOfDate || null;
  dossier.meta.verificationStatus = perspective.verificationStatus || null;
  return dossier;
}
