/**
 * Persistenza quality + notes sul sonno (denormalizeSleepEntry → RTDB).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { denormalizeSleepEntry } from '../../../../utils/denormalizeSleepEntry.js';

test('denormalizeSleepEntry: conserva quality e notes canonico', () => {
  const sleep = denormalizeSleepEntry({
    type: 'sleep',
    id: 's1',
    wakeTime: 7,
    sleepStart: 23,
    bedtime: 23,
    hours: 8,
    deepMin: 60,
    remMin: 60,
    quality: 2,
    note: 'due volte per sete',
    details: 'due volte per sete',
    notes: 'due volte per sete',
  });
  assert.ok(sleep);
  assert.equal(sleep.quality, 2);
  assert.equal(sleep.notes, 'due volte per sete');
  assert.equal(sleep.note, undefined);
  assert.equal(sleep.details, undefined);
  assert.equal(sleep.bedtime, 23);
  assert.equal(sleep.hours, 8);
});

test('denormalizeSleepEntry: legge note/details se notes manca', () => {
  const sleep = denormalizeSleepEntry({
    type: 'sleep',
    id: 's2',
    wakeTime: 6.5,
    hours: 7.2,
    details: 'bagno alle 3',
    quality: 4,
  });
  assert.equal(sleep.notes, 'bagno alle 3');
  assert.equal(sleep.quality, 4);
});

test('denormalizeSleepEntry: senza qualità/note non inventa campi', () => {
  const sleep = denormalizeSleepEntry({
    type: 'sleep',
    id: 's3',
    wakeTime: 7,
    hours: 7,
  });
  assert.equal(sleep.quality, undefined);
  assert.equal(sleep.notes, undefined);
});
