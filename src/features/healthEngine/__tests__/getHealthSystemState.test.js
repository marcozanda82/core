import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getHealthSystemState } from '../engines/getHealthSystemState.js';
import { PILLAR_STATES } from '../contracts/healthSystem.types.js';
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
  PILLAR_KEYS.forEach((key) => {
    assert.equal(state.pillars[key].state, PILLAR_STATES.NEUTRAL);
  });
});
