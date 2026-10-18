import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAIN_NIGHT_STATUS,
  resolveMainNightSleep,
} from '../normalize/resolveMainNightSleep.js';

test('I4-E notte: assente / solo nap / singola / dedup id / ambigua', () => {
  assert.equal(resolveMainNightSleep([]).status, MAIN_NIGHT_STATUS.absent);

  const naps = resolveMainNightSleep([
    { type: 'sleep', id: 'n1', hours: 1.2 },
    { type: 'sleep', id: 'n2', hours: 1.5 },
  ]);
  assert.equal(naps.status, MAIN_NIGHT_STATUS.only_naps);
  assert.equal(naps.entry, null);

  const single = resolveMainNightSleep([
    { type: 'sleep', id: 'n1', hours: 1 },
    { type: 'sleep', id: 'main', hours: 7.2, wakeTime: 7, bedtime: 23.8 },
  ]);
  assert.equal(single.status, MAIN_NIGHT_STATUS.selected);
  assert.equal(single.entry.id, 'main');

  const dedup = resolveMainNightSleep([
    { type: 'sleep', id: 'main', hours: 5, updatedAt: 1 },
    { type: 'sleep', id: 'main', hours: 8, wakeTime: 7, updatedAt: 9 },
  ]);
  assert.equal(dedup.status, MAIN_NIGHT_STATUS.selected);
  assert.equal(dedup.entry.hours, 8);

  const amb = resolveMainNightSleep([
    { type: 'sleep', id: 'a', hours: 7.0, wakeTime: 7, bedtime: 0 },
    { type: 'sleep', id: 'b', hours: 7.1, wakeTime: 7.2, bedtime: 0.1 },
  ]);
  assert.equal(amb.status, MAIN_NIGHT_STATUS.ambiguous);
  assert.equal(amb.entry, null);

  const clearGap = resolveMainNightSleep([
    { type: 'sleep', id: 'short', hours: 5.5, wakeTime: 6 },
    { type: 'sleep', id: 'long', hours: 8, wakeTime: 7, bedtime: 23 },
  ]);
  assert.equal(clearGap.status, MAIN_NIGHT_STATUS.selected);
  assert.equal(clearGap.entry.id, 'long');

  // Frammenti che sommano a notte → ambiguous (non only_naps)
  const frag = resolveMainNightSleep([
    { type: 'sleep', id: 'a', hours: 2 },
    { type: 'sleep', id: 'b', hours: 2.5 },
  ]);
  assert.equal(frag.status, MAIN_NIGHT_STATUS.ambiguous);

  // Corto con bedtime serale → ambiguous
  const overnightShort = resolveMainNightSleep([
    { type: 'sleep', id: 'x', hours: 2.5, bedtime: 23, wakeTime: 1.5 },
  ]);
  assert.equal(overnightShort.status, MAIN_NIGHT_STATUS.ambiguous);

  // Turno: una notte lunga con bedtime mattutino → selected
  const shift = resolveMainNightSleep([
    { type: 'sleep', id: 'shift', hours: 7.5, bedtime: 8, wakeTime: 15.5 },
  ]);
  assert.equal(shift.status, MAIN_NIGHT_STATUS.selected);
});
