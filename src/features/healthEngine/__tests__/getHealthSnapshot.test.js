import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getHealthSnapshot } from '../adapters/getHealthSnapshot.js';
import {
  CERTAINTY_LEVELS,
  DEFAULT_CARDIO_TARGET_7D_MINUTES,
  METABOLIC_PHASE_IDS,
  SLEEP_SOURCES,
} from '../contracts/healthSnapshot.types.js';
import {
  buildTypicalTrackerStorico,
  TYPICAL_DATE_STR as DATE_STR,
  TYPICAL_NOW_MS as NOW_MS,
} from './fixtures/typicalHealthSnapshot.js';

test('getHealthSnapshot normalizza un trackerStorico tipico senza errori', () => {
  const source = buildTypicalTrackerStorico();
  const snap = getHealthSnapshot(source);

  assert.equal(snap.dateStr, DATE_STR);
  assert.equal(snap.timestamp, NOW_MS);
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.sleep));
  assert.ok(Object.isFrozen(snap.nutrition));

  assert.equal(snap.nutrition.calories, 1780);
  assert.equal(snap.nutrition.proteinGrams, 125);
  assert.equal(snap.nutrition.fiberGrams, 26);
  assert.equal(snap.nutrition.targetCalories, 2300);
  assert.equal(snap.nutrition.targetProteinGrams, 160);
  assert.equal(snap.nutrition.targetFiberGrams, 32);
  assert.equal(typeof snap.nutrition.lastMealTimestamp, 'number');
  assert.equal(snap.nutrition.certainty.calories, CERTAINTY_LEVELS.MEASURED);
  assert.equal(snap.nutrition.history7d.days.length, 7);
  assert.ok(snap.nutrition.history7d.daysLogged >= 4);

  assert.equal(snap.sleep.hasSleepData, true);
  assert.equal(snap.sleep.hours, 7.5);
  assert.equal(snap.sleep.wakeTime, 7);
  assert.equal(snap.sleep.bedtimeCalculated, 23.5);
  assert.equal(snap.sleep.quality, 4);
  assert.equal(snap.sleep.source, SLEEP_SOURCES.MANUAL);
  assert.equal(snap.sleep.dinnerSleepBuffer, 3);
  assert.equal(snap.sleep.certainty.bedtimeCalculated, CERTAINTY_LEVELS.CALCULATED);
  assert.equal(snap.sleep.certainty.dinnerSleepBuffer, CERTAINTY_LEVELS.CALCULATED);
  assert.ok(snap.sleep.history7d.avgHours > 6);
  assert.ok(snap.sleep.history7d.wakeTimeVariability >= 0);

  assert.equal(snap.activity.todayWorkouts.length, 1);
  assert.equal(snap.activity.todayWorkouts[0].type, 'camminata');
  assert.equal(snap.activity.todayWorkouts[0].durationMin, 30);
  assert.equal(snap.activity.cardioMinutes7d, 54);
  assert.equal(snap.activity.cardioTarget7d, DEFAULT_CARDIO_TARGET_7D_MINUTES);
  assert.equal(snap.activity.muscleDecay.legs, 0.5);
  assert.equal(snap.activity.muscleDecay.chest, 0.04);
  assert.ok(snap.activity.lastWorkoutTimestamp != null);

  assert.equal(snap.metabolic.fastingHoursCurrent, 1.5);
  assert.equal(snap.metabolic.glycemicPenalty, 1.08);
  assert.equal(snap.metabolic.currentPhase, METABOLIC_PHASE_IDS.ABSORPTION);

  assert.equal(snap.systemic.systemicFatigue, 0.22);
  assert.equal(snap.systemic.fourCylinders.decay.legs, 0.5);
  assert.notEqual(snap.systemic.fourCylinders, source.fourCylinderData);
});

test('getHealthSnapshot usa fallback neutri se manca il sonno (no sleep_logs)', () => {
  const snap = getHealthSnapshot({
    trackerStoricoDay: {
      data: DATE_STR,
      log: [{ type: 'food', mealType: 'pranzo', mealTime: 13, kcal: 600, prot: 40, fibre: 8 }],
      mealTimes: { pranzo: 13 },
    },
    trackerStoricoWeek: {},
    nowMs: NOW_MS,
    dateStr: DATE_STR,
  });

  assert.equal(snap.sleep.hasSleepData, false);
  assert.equal(snap.sleep.hours, 0);
  assert.equal(snap.sleep.wakeTime, 0);
  assert.equal(snap.sleep.bedtimeCalculated, 0);
  assert.equal(snap.sleep.quality, 0);
  assert.equal(snap.sleep.dinnerSleepBuffer, null);
  assert.equal(snap.sleep.certainty.hours, CERTAINTY_LEVELS.ESTIMATED);
  assert.equal(snap.metabolic.glycemicPenalty, 1);
  assert.equal(snap.activity.muscleDecay.legs, 0);
  assert.equal(snap.systemic.fourCylinders, null);
  assert.equal(snap.systemic.systemicFatigue, 0);
});

test('getHealthSnapshot deriva bedtime con wrap a mezzanotte', () => {
  const snap = getHealthSnapshot({
    trackerStoricoDay: {
      data: DATE_STR,
      log: [{
        type: 'sleep',
        id: 'sleep_cmd_1',
        hours: 8,
        wakeTime: 6,
        quality: 5,
      }],
    },
    nowMs: NOW_MS,
    dateStr: DATE_STR,
  });
  assert.equal(snap.sleep.bedtimeCalculated, 22);
  assert.equal(snap.sleep.source, SLEEP_SOURCES.CHAT);
});
