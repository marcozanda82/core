import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  PREFERRED_MEAL_MODE,
  PREFERRED_MEAL_MODE_KEY,
  getPreferredMealMode,
  normalizePreferredMealMode,
  setPreferredMealMode,
} from '../preferredMealMode.js';

const memoryStore = new Map();

beforeEach(() => {
  memoryStore.clear();
  globalThis.localStorage = {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => { memoryStore.set(String(k), String(v)); },
    removeItem: (k) => { memoryStore.delete(k); },
  };
});

describe('preferredMealMode', () => {
  it('default è ai', () => {
    assert.equal(getPreferredMealMode(), PREFERRED_MEAL_MODE.AI);
    assert.equal(normalizePreferredMealMode(null), PREFERRED_MEAL_MODE.AI);
    assert.equal(normalizePreferredMealMode(''), PREFERRED_MEAL_MODE.AI);
  });

  it('persiste manual e ai', () => {
    assert.equal(setPreferredMealMode('manual'), PREFERRED_MEAL_MODE.MANUAL);
    assert.equal(getPreferredMealMode(), PREFERRED_MEAL_MODE.MANUAL);
    assert.equal(memoryStore.get(PREFERRED_MEAL_MODE_KEY), 'manual');

    assert.equal(setPreferredMealMode('ai'), PREFERRED_MEAL_MODE.AI);
    assert.equal(getPreferredMealMode(), PREFERRED_MEAL_MODE.AI);
  });

  it('accetta alias guidato/manuale', () => {
    assert.equal(normalizePreferredMealMode('guidato'), PREFERRED_MEAL_MODE.AI);
    assert.equal(normalizePreferredMealMode('manuale'), PREFERRED_MEAL_MODE.MANUAL);
  });
});
