/**
 * Orchestrazione pura: dossier → selection → AiBrief (senza mutare memoria).
 */

import { buildFocusAiBrief } from './buildFocusAiBrief.js';
import { selectFocusEditorial } from './selectFocusEditorial.js';

/**
 * @param {{
 *   dossier: object,
 *   memory?: object|null,
 *   dossierContentHash?: string,
 *   locale?: string,
 * }} input
 */
export function runFocusEditorial(input) {
  const selection = selectFocusEditorial({
    dossier: input.dossier,
    memory: input.memory,
    dossierContentHash: input.dossierContentHash,
  });
  const aiBrief = buildFocusAiBrief({
    selection,
    memory: input.memory,
    locale: input.locale,
  });
  return { selection, aiBrief };
}
