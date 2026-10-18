/**
 * Costruisce dossierInput Focus da letture tracker per-chiave + contesto profilo.
 * Non inventa giornate assenti, target o peso.
 */

import { buildDayBrief } from '../../aggregate/buildDayBrief.js';
import {
  addCalendarDays,
  assertPublicationFollowsAnalysis,
  isIsoDateString,
} from '../../normalize/focusDateUtils.js';
import { normalizeSleepNight } from '../../normalize/normalizeSleepNight.js';
import { resolveFocusHistoryDays } from './focusHistoryHorizon.js';
import { listRequiredTrackerDates as listDates } from './trackerDateWindow.js';

export { listRequiredTrackerDates } from './trackerDateWindow.js';

/**
 * @param {{
 *   uid: string,
 *   reader: {
 *     getDayNodes: Function,
 *     getStats: Function,
 *     maxHistoryDays?: number,
 *     loadFocusUserContext?: Function,
 *   },
 *   publicationDate: string,
 *   analysisDate?: string,
 *   historyDays?: number,
 *   horizon?: 'd7'|'d30'|'d90',
 *   needD90?: boolean,
 *   targets?: object|null,
 *   bodyWeightKg?: number|null,
 *   bodyMeasuredOn?: string|null,
 *   loadProfileContext?: boolean,
 * }} input
 */
export async function buildDossierInputFromTracker(input) {
  const uid = String(input.uid || '').trim();
  const publicationDate = input.publicationDate;
  if (!uid) throw new Error('buildDossierInputFromTracker: uid richiesto');
  if (!isIsoDateString(publicationDate)) {
    throw new Error('buildDossierInputFromTracker: publicationDate ISO richiesta');
  }

  const analysisDate = input.analysisDate || addCalendarDays(publicationDate, -1);
  const relation = assertPublicationFollowsAnalysis(analysisDate, publicationDate);
  if (!relation.ok) {
    throw new Error(`buildDossierInputFromTracker: ${relation.reason}`);
  }

  const horizonPlan = resolveFocusHistoryDays({
    historyDays: input.historyDays,
    horizon: input.horizon,
    needD90: input.needD90,
  });
  const historyDays = horizonPlan.historyDays;

  /** @type {object|null} */
  let userContext = null;
  const loadProfile = input.loadProfileContext !== false
    && typeof input.reader.loadFocusUserContext === 'function';
  if (loadProfile) {
    userContext = await input.reader.loadFocusUserContext(uid, analysisDate, {
      targetsOverride: input.targets,
      bodyWeightKgOverride: input.bodyWeightKg,
      bodyMeasuredOnOverride: input.bodyMeasuredOn,
    });
  }

  const targets = userContext
    ? userContext.targets
    : (input.targets ?? null);
  let bodyWeightKg = userContext
    ? userContext.bodyWeightKg
    : (input.bodyWeightKg ?? null);
  let bodyMeasuredOn = userContext
    ? userContext.bodyMeasuredOn
    : (input.bodyMeasuredOn ?? null);

  // Nessun peso zero / negativo
  if (bodyWeightKg != null && !(Number(bodyWeightKg) > 0)) {
    bodyWeightKg = null;
    bodyMeasuredOn = null;
  }

  const requiredDates = listDates(analysisDate, publicationDate, historyDays);
  const nodes = await input.reader.getDayNodes(uid, requiredDates);

  const analysisDayNode = nodes.get(analysisDate) ?? null;
  const publicationDayNode = nodes.get(publicationDate) ?? null;

  const sleepPack = normalizeSleepNight(publicationDayNode, { publicationDate });

  /** @type {object[]} */
  const historyDayBriefs = [];
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const sleepStorageDate = addCalendarDays(date, 1);
    const dayNode = nodes.get(date) ?? null;
    const sleepNode = nodes.get(sleepStorageDate) ?? null;
    historyDayBriefs.push(
      buildDayBrief({
        date,
        dayNode,
        sleepNode,
        sleepStorageDate,
        bodyWeightKg: date === analysisDate ? bodyWeightKg : null,
      }),
    );
  }

  const readStats = input.reader.getStats ? input.reader.getStats() : null;

  return {
    dossierInput: {
      analysisDate,
      publicationDate,
      analysisDayNode,
      publicationDayNode,
      targets,
      bodyWeightKg,
      bodyMeasuredOn,
      historyDayBriefs,
    },
    sleepGate: {
      sleepAvailable: sleepPack.sleepAvailable,
      sleepPartial: sleepPack.sleepPartial,
      sleepAmbiguous: Boolean(sleepPack.sleepAmbiguous),
      status: sleepPack.sleepSelection?.status || null,
      reason: sleepPack.sleepSelection?.reason || null,
      nightCandidateCount: sleepPack.sleepSelection?.nightCandidateCount ?? null,
    },
    userContext,
    horizonPlan,
    readStats,
    requiredDates,
    historyDays,
  };
}
