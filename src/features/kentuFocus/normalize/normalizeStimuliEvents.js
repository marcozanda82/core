/**
 * Normalizzatore puro stimolanti / acqua / alcol (conteggi).
 * pureAlcoholG: non calcolato in I1 (evita import coreEngine) → missing.
 */

import {
  FOCUS_PROVENANCE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import {
  dedupeById,
  finiteNumber,
  getLogArray,
  getManualNodesArray,
} from './logUtils.js';

/**
 * @param {object|null|undefined} analysisDayNode
 */
export function normalizeStimuliEvents(analysisDayNode) {
  const log = getLogArray(analysisDayNode);
  const manual = getManualNodesArray(analysisDayNode);
  const all = dedupeById([...log, ...manual], (e) => e?.id);

  let waterMl = 0;
  let waterSeen = false;
  let stimulantEvents = 0;
  let alcoholEvents = 0;

  for (const entry of all) {
    if (!entry || typeof entry !== 'object') continue;
    const type = String(entry.type || '').toLowerCase();
    if (type === 'water') {
      waterSeen = true;
      waterMl += finiteNumber(entry.ml ?? entry.amount ?? entry.waterMl) ?? 0;
    } else if (type === 'stimulant' || type === 'energizer' || type === 'caffeine') {
      stimulantEvents += 1;
    } else if (type === 'alcohol' || type === 'drink_alcohol') {
      alcoholEvents += 1;
    }
  }

  return {
    stimuli: {
      waterMl: waterSeen
        ? focusMetric(Math.round(waterMl), {
          unit: 'ml',
          provenance: FOCUS_PROVENANCE.recorded,
          source: 'normalizeStimuliEvents',
        })
        : missingMetric('ml'),
      stimulantEvents: focusMetric(stimulantEvents, {
        provenance: FOCUS_PROVENANCE.recorded,
        source: 'normalizeStimuliEvents',
      }),
      alcoholEvents: focusMetric(alcoholEvents, {
        provenance: FOCUS_PROVENANCE.recorded,
        source: 'normalizeStimuliEvents',
      }),
      // Blocco tecnico I1: calcolo etanolo vive in coreEngine → non importare.
      pureAlcoholG: missingMetric('g'),
    },
  };
}
