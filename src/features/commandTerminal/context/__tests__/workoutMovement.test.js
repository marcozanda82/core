import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCardioStatus } from '../cardioCylinderStatus.js';
import {
  classifyWorkoutByType,
  equivalentAerobicMinutes,
  resolveWorkoutDurationMinutes,
} from '../workoutMovement.js';

test('0,5 ore, 20 minuti e 90 minuti restano distinti', () => {
  assert.equal(resolveWorkoutDurationMinutes({ duration: 0.5 }), 30);
  assert.equal(resolveWorkoutDurationMinutes({ duration: 20 }), 20);
  assert.equal(resolveWorkoutDurationMinutes({ duration: 90 }), 90);
  assert.equal(resolveWorkoutDurationMinutes({ duration: 0.5, durationMinutes: 12 }), 12);
});

test('il tipo basta anche se il nome è vuoto, e i pesi non diventano minuti equivalenti', () => {
  const bare = { type: 'workout', name: '', workoutType: 'camminata', duration: 0.5 };
  assert.equal(classifyWorkoutByType(bare).kind, 'walk');
  assert.equal(equivalentAerobicMinutes(bare), 30);

  const run = { type: 'workout', name: '', workoutType: 'corsa', duration: 20 };
  assert.equal(classifyWorkoutByType(run).kind, 'vigorous');
  assert.equal(equivalentAerobicMinutes(run), 40);

  const weights = { type: 'workout', name: '', workoutType: 'pesi', duration: 1 };
  assert.equal(classifyWorkoutByType(weights).kind, 'strength');
  assert.equal(equivalentAerobicMinutes(weights), 0);

  const end = new Date('2026-11-09T23:59:59').getTime();
  const status = calculateCardioStatus([], [
    { ...bare, __dateKey: '2026-11-09', time: 12 },
    { ...run, __dateKey: '2026-11-09', time: 18 },
    { ...weights, __dateKey: '2026-11-09', time: 19, muscles: ['Gambe'] },
  ], { nowMs: end });
  assert.equal(status.accumulatedMinutes, 70);
  assert.equal(status.spilloverMinutes, 0);
});
