/**
 * Motore decisionale puro: HealthSnapshot → HealthSystemState.
 * Nessun React, nessun I/O, nessun import da salaComandi / UI.
 */

import { CERTAINTY_LEVELS } from '../contracts/healthSnapshot.types.js';
import {
  GLOBAL_DRIVER_LIMIT,
  NEUTRAL_SCORE_BASELINE,
  PILLAR_IDS,
  PILLAR_SCORE_WEIGHTS,
  PILLAR_STATES,
} from '../contracts/healthSystem.types.js';
import { freezeDeep } from '../adapters/healthSnapshotExtractors.js';
import { pickGlobalDrivers, rankDrivers } from './driverRanking.js';
import {
  evaluateActivity,
  evaluateMetabolism,
  evaluateNutrition,
  evaluateRecovery,
} from './pillarEvaluators.js';
import { selectPrimaryAction } from './primaryActionEngine.js';

function tagDrivers(pillarId, pillar) {
  return (pillar?.drivers || []).map((driver) => ({ driver, pillar: pillarId }));
}

function weightedGlobalScore(pillars) {
  const w = PILLAR_SCORE_WEIGHTS;
  const keys = ['recovery', 'nutrition', 'activity', 'metabolism'];
  let weighted = 0;
  let mass = 0;
  keys.forEach((key) => {
    const pillar = pillars?.[key];
    if (!pillar || pillar.state === PILLAR_STATES.NEUTRAL) return;
    const score = Number(pillar.score);
    if (!Number.isFinite(score)) return;
    weighted += score * w[key];
    mass += w[key];
  });
  if (mass <= 0) return NEUTRAL_SCORE_BASELINE;
  return Math.round((weighted / mass) * 10) / 10;
}

function tagActionableDrivers(pillarId, pillar) {
  if (pillar?.evidence?.data?.dayInProgress === true) return [];
  return tagDrivers(pillarId, pillar);
}

function emptySnapshotGuard() {
  const emptyInsight = {
    text: 'In attesa dei dati: lo stato di salute sarà visibile dopo i primi registri.',
    certainty: CERTAINTY_LEVELS.ESTIMATED,
  };
  const emptyPillar = {
    state: 'NEUTRAL',
    score: NEUTRAL_SCORE_BASELINE,
    drivers: [],
    insight: emptyInsight,
    evidence: { type: 'missing', data: null },
  };
  return freezeDeep({
    score: NEUTRAL_SCORE_BASELINE,
    pillars: {
      metabolism: { ...emptyPillar },
      nutrition: { ...emptyPillar },
      activity: { ...emptyPillar },
      recovery: { ...emptyPillar },
    },
    globalDrivers: [],
    primaryAction: null,
    reasoningTrace: {
      driverScores: [],
      selectedActionId: null,
      rejectedActions: [],
      pillarScores: {
        metabolism: NEUTRAL_SCORE_BASELINE,
        nutrition: NEUTRAL_SCORE_BASELINE,
        activity: NEUTRAL_SCORE_BASELINE,
        recovery: NEUTRAL_SCORE_BASELINE,
      },
    },
  });
}

/**
 * @param {import('../contracts/healthSnapshot.types.js').HealthSnapshot} snapshot
 * @returns {import('../contracts/healthSystem.types.js').HealthSystemState}
 */
export function getHealthSystemState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return emptySnapshotGuard();
  }

  const recovery = evaluateRecovery(snapshot.sleep, snapshot.systemic);
  const nutrition = evaluateNutrition(snapshot.nutrition);
  const activity = evaluateActivity(snapshot.activity, snapshot.timestamp);
  const metabolism = evaluateMetabolism(snapshot.metabolic, snapshot.sleep);

  const pillars = {
    metabolism,
    nutrition,
    activity,
    recovery,
  };

  const tagged = [
    ...tagActionableDrivers(PILLAR_IDS.RECOVERY, recovery),
    ...tagActionableDrivers(PILLAR_IDS.NUTRITION, nutrition),
    ...tagActionableDrivers(PILLAR_IDS.ACTIVITY, activity),
    ...tagActionableDrivers(PILLAR_IDS.METABOLISM, metabolism),
  ];

  const driverScores = rankDrivers(tagged);
  const globalDrivers = pickGlobalDrivers(tagged, GLOBAL_DRIVER_LIMIT);
  const { action: primaryAction, rejected } = selectPrimaryAction(driverScores, tagged, 5);

  const state = {
    score: weightedGlobalScore(pillars),
    pillars,
    globalDrivers,
    primaryAction,
    reasoningTrace: {
      driverScores,
      selectedActionId: primaryAction?.id ?? null,
      rejectedActions: rejected,
      pillarScores: {
        metabolism: metabolism.score,
        nutrition: nutrition.score,
        activity: activity.score,
        recovery: recovery.score,
      },
    },
  };

  return freezeDeep(state);
}

export default getHealthSystemState;
