import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getHealthSystemState } from '../engines/getHealthSystemState.js';
import {
  ACTION_IDS,
  NEUTRAL_SCORE_BASELINE,
  PILLAR_STATES,
} from '../contracts/healthSystem.types.js';
import {
  ACTIVITY_DAY_PENDING_INSIGHT,
  NUTRITION_DAY_PENDING_INSIGHT,
} from '../engines/pillarEvaluators.js';
import { buildTypicalHealthSnapshot } from './fixtures/typicalHealthSnapshot.js';

const PILLAR_KEYS = ['metabolism', 'nutrition', 'activity', 'recovery'];
const PILLAR_STATE_SET = new Set(Object.values(PILLAR_STATES));

test('getHealthSystemState valuta i 4 pilastri e restituisce una sola primaryAction', () => {
  const snapshot = buildTypicalHealthSnapshot();
  const state = getHealthSystemState(snapshot);

  assert.ok(Object.isFrozen(state));
  assert.equal(typeof state.score, 'number');
  assert.ok(state.score >= 0 && state.score <= 100);

  PILLAR_KEYS.forEach((key) => {
    const pillar = state.pillars[key];
    assert.ok(pillar, `pilastro ${key} assente`);
    assert.notEqual(pillar.state, undefined);
    assert.ok(PILLAR_STATE_SET.has(pillar.state), `stato non valido per ${key}: ${pillar.state}`);
    assert.equal(typeof pillar.score, 'number');
    assert.ok(Array.isArray(pillar.drivers));
    assert.equal(typeof pillar.insight.text, 'string');
    assert.ok(pillar.insight.text.length > 0);
    assert.equal(typeof pillar.evidence.type, 'string');
  });

  assert.ok(Array.isArray(state.globalDrivers));
  assert.equal(state.globalDrivers.length, 3);

  assert.ok(state.primaryAction);
  assert.equal(typeof state.primaryAction.id, 'string');
  assert.equal(typeof state.primaryAction.text, 'string');
  assert.equal(typeof state.primaryAction.priority, 'number');
  assert.equal(state.reasoningTrace.selectedActionId, state.primaryAction.id);

  const actionIds = [state.primaryAction.id];
  assert.equal(actionIds.length, 1);
});

test('getHealthSystemState su snapshot nullo resta deterministico e NEUTRAL', () => {
  const state = getHealthSystemState(null);
  assert.equal(state.primaryAction, null);
  assert.equal(state.score, NEUTRAL_SCORE_BASELINE);
  PILLAR_KEYS.forEach((key) => {
    assert.equal(state.pillars[key].state, PILLAR_STATES.NEUTRAL);
    assert.equal(state.pillars[key].score, NEUTRAL_SCORE_BASELINE);
  });
});

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildMorningIncompleteSnapshot(overrides = {}) {
  const snap = clonePlain(buildTypicalHealthSnapshot());
  snap.timestamp = Date.parse(`${snap.dateStr}T07:30:00`);
  snap.nutrition = {
    ...snap.nutrition,
    calories: 0,
    proteinGrams: 0,
    fiberGrams: 0,
    ...(overrides.nutrition || {}),
  };
  snap.activity = {
    ...snap.activity,
    todayWorkouts: [],
    ...(overrides.activity || {}),
  };
  return snap;
}

const DIAGNOSTIC_MORNING_ACTIONS = new Set([
  ACTION_IDS.HIT_PROTEIN,
  ACTION_IDS.ADD_FIBER,
  ACTION_IDS.ADD_CARDIO,
  ACTION_IDS.STIMULATE_LAG_MUSCLE,
]);

test('mattina senza pasti: nutrizione NEUTRAL, insight umano, score non affossato', () => {
  const state = getHealthSystemState(buildMorningIncompleteSnapshot());
  const nutrition = state.pillars.nutrition;
  const activity = state.pillars.activity;

  assert.equal(nutrition.state, PILLAR_STATES.NEUTRAL);
  assert.equal(nutrition.insight.text, NUTRITION_DAY_PENDING_INSIGHT);
  assert.equal(nutrition.evidence.data.dayInProgress, true);
  assert.ok(
    nutrition.drivers.every((d) => d.direction !== 'NEGATIVE'),
    'la nutrizione mattutina non deve emettere driver negativi',
  );

  assert.equal(activity.state, PILLAR_STATES.NEUTRAL);
  assert.equal(activity.insight.text, ACTIVITY_DAY_PENDING_INSIGHT);
  assert.equal(activity.evidence.data.dayInProgress, true);

  assert.ok(state.score >= 70 && state.score <= 95, `score mattutino atteso 70–95, ottenuto ${state.score}`);
  assert.notEqual(state.pillars.recovery.state, PILLAR_STATES.NEUTRAL);
  if (state.primaryAction) {
    assert.equal(
      DIAGNOSTIC_MORNING_ACTIONS.has(state.primaryAction.id),
      false,
      `azione diagnostica mascherata: ${state.primaryAction.id}`,
    );
  }
});

test('calorie sotto il 10% del target restano NEUTRAL, sopra si valuta', () => {
  const pending = getHealthSystemState(buildMorningIncompleteSnapshot({
    nutrition: { calories: 180, proteinGrams: 8, fiberGrams: 1 },
  }));
  assert.equal(pending.pillars.nutrition.state, PILLAR_STATES.NEUTRAL);
  assert.equal(pending.pillars.nutrition.insight.text, NUTRITION_DAY_PENDING_INSIGHT);

  const scored = getHealthSystemState(buildMorningIncompleteSnapshot({
    nutrition: { calories: 920, proteinGrams: 70, fiberGrams: 18 },
  }));
  assert.notEqual(scored.pillars.nutrition.state, PILLAR_STATES.NEUTRAL);
  assert.notEqual(scored.pillars.nutrition.insight.text, NUTRITION_DAY_PENDING_INSIGHT);
});

