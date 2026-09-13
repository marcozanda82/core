/**
 * Motore decisionale puro: HealthSnapshot → HealthSystemState.
 * Nessun React, nessun I/O, nessun import da salaComandi / UI.
 */

import { CERTAINTY_LEVELS } from '../contracts/healthSnapshot.types.js';
import {
  GLOBAL_DRIVER_LIMIT,
  PILLAR_IDS,
  PILLAR_SCORE_WEIGHTS,
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
  const rec = Number(pillars.recovery?.score) || 0;
  const nut = Number(pillars.nutrition?.score) || 0;
  const act = Number(pillars.activity?.score) || 0;
  const met = Number(pillars.metabolism?.score) || 0;
  const w = PILLAR_SCORE_WEIGHTS;
  const score = rec * w.recovery + nut * w.nutrition + act * w.activity + met * w.metabolism;
  return Math.round(score * 10) / 10;
}

function emptySnapshotGuard() {
  const emptyInsight = {
    text: 'Snapshot assente: stato di salute non valutabile.',
    certainty: CERTAINTY_LEVELS.ESTIMATED,
  };
  const emptyPillar = {
    state: 'NEUTRAL',
    score: 50,
    drivers: [],
    insight: emptyInsight,
    evidence: { type: 'missing', data: null },
  };
  return freezeDeep({
    score: 50,
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
        metabolism: 50,
        nutrition: 50,
        activity: 50,
        recovery: 50,
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
  const activity = evaluateActivity(snapshot.activity);
  const metabolism = evaluateMetabolism(snapshot.metabolic, snapshot.sleep);

  const pillars = {
    metabolism,
    nutrition,
    activity,
    recovery,
  };

  const tagged = [
    ...tagDrivers(PILLAR_IDS.RECOVERY, recovery),
    ...tagDrivers(PILLAR_IDS.NUTRITION, nutrition),
    ...tagDrivers(PILLAR_IDS.ACTIVITY, activity),
    ...tagDrivers(PILLAR_IDS.METABOLISM, metabolism),
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
