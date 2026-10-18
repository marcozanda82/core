import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import {
  FOCUS_DOSSIER_SCHEMA_VERSION,
  FOCUS_PROVENANCE,
} from '../contracts/focusDossier.v1.js';
import {
  addCalendarDays,
  assertPublicationFollowsAnalysis,
  computeBedtimeFromWakeAndDuration,
  isIsoDateString,
  wrap24,
} from '../normalize/focusDateUtils.js';
import { DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN } from '../normalize/normalizeSleepNight.js';
import { validateFocusDossier } from '../validate/validateFocusDossier.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
  buildMidnightCrossingFixture,
  buildMissingValuesFixture,
  buildNoMealsFixture,
  buildPartialSleepFixture,
  buildUnreliableStagesFixture,
  buildWearableStagesFixture,
} from './fixtures/focusDayFixtures.js';

test('contratto: schemaVersion e relazione date publication = analysis + 1', () => {
  assert.equal(FOCUS_DOSSIER_SCHEMA_VERSION, '1.0.0');
  assert.equal(isIsoDateString(ANALYSIS_DATE), true);
  assert.equal(isIsoDateString(PUBLICATION_DATE), true);
  assert.equal(addCalendarDays(ANALYSIS_DATE, 1), PUBLICATION_DATE);
  assert.equal(assertPublicationFollowsAnalysis(ANALYSIS_DATE, PUBLICATION_DATE).ok, true);
  assert.equal(assertPublicationFollowsAnalysis(ANALYSIS_DATE, ANALYSIS_DATE).ok, false);
});

test('giornata completa: totals, coverage, validazione, dedupe cibo', () => {
  const fixture = buildFullDayFixture();
  const dossier = buildFocusDossier({
    uid: 'user_demo',
    generatedAt: '2026-10-17T07:12:00.000Z',
    ...fixture,
  });

  const v = validateFocusDossier(dossier);
  assert.equal(v.ok, true, v.errors.join(', '));

  assert.equal(dossier.meta.coverage.analysisDayHasFood, true);
  assert.equal(dossier.meta.coverage.analysisDayHasWorkout, true);
  assert.equal(dossier.meta.coverage.sleepAvailable, true);
  assert.equal(dossier.meta.flags.incompleteDay, false);

  // 420+780+690 (duplicato scartato)
  assert.equal(dossier.day.nutrition.totals.kcal.value, 1890);
  assert.equal(dossier.day.nutrition.foodSummary.itemsLogged, 3);
  assert.equal(dossier.day.nutrition.meals.length, 3);

  assert.equal(dossier.day.activity.workouts.length, 2);
  assert.equal(dossier.day.activity.workoutKcalTotal.value, 440);
  assert.equal(dossier.day.activity.cardioMinutes.value, 30);

  assert.equal(dossier.day.stimuli.waterMl.value, 1800);
  assert.equal(dossier.day.stimuli.stimulantEvents.value, 2);
  assert.equal(dossier.day.stimuli.pureAlcoholG.provenance, FOCUS_PROVENANCE.missing);

  assert.equal(dossier.sleep.hours.value, 7.2);
  const expectedBed = computeBedtimeFromWakeAndDuration(7.0, 7.2);
  assert.equal(dossier.sleep.bedtime.value, expectedBed);
  assert.equal(dossier.sleep.bedtime.provenance, FOCUS_PROVENANCE.calculated);
  assert.ok(expectedBed > 20, 'bedtime dopo mezzanotte wrap in fascia serale');
});

test('giornata senza pasti', () => {
  const dossier = buildFocusDossier(buildNoMealsFixture());
  assert.equal(dossier.meta.coverage.analysisDayHasFood, false);
  assert.equal(dossier.day.nutrition.totals.kcal.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.day.nutrition.foodSummary.itemsLogged, 0);
  assert.equal(dossier.meta.coverage.analysisDayHasWorkout, true);
  assert.equal(dossier.meta.flags.incompleteDay, false);
  assert.equal(validateFocusDossier(dossier).ok, true);
});

test('sonno parziale: flag e metriche incomplete', () => {
  const dossier = buildFocusDossier(buildPartialSleepFixture());
  assert.equal(dossier.meta.flags.sleepPartial, true);
  assert.equal(dossier.sleep.hours.value, 6.5);
  assert.equal(dossier.sleep.wakeTime.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.sleep.bedtime.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(validateFocusDossier(dossier).ok, true);
});

test('valori mancanti: nodi vuoti → missing + incompleteDay', () => {
  const dossier = buildFocusDossier(buildMissingValuesFixture());
  assert.equal(dossier.meta.coverage.analysisDayHasFood, false);
  assert.equal(dossier.meta.coverage.analysisDayHasWorkout, false);
  assert.equal(dossier.meta.coverage.sleepAvailable, false);
  assert.equal(dossier.meta.flags.incompleteDay, true);
  assert.equal(dossier.day.stimuli.waterMl.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.sleep.hours.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(validateFocusDossier(dossier).ok, true);
});

test('attraversamento mezzanotte: bedtime calcolato e buffer cena→sonno', () => {
  const dossier = buildFocusDossier(buildMidnightCrossingFixture());
  assert.equal(dossier.sleep.bedtime.value, wrap24(6.5 - 8));
  assert.equal(dossier.sleep.bedtime.value, 22.5);
  assert.equal(dossier.sleep.dinnerSleepBufferH.value, 0);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.recorded);
  assert.equal(dossier.sleep.remMin.value, 110);
});

test('timezone / date: mode device_local_offset e rejezione date non ISO', () => {
  const dossier = buildFocusDossier(buildFullDayFixture());
  assert.equal(dossier.meta.timezoneMode, 'device_local_offset');
  assert.throws(
    () => buildFocusDossier({
      analysisDate: '16/10/2026',
      publicationDate: PUBLICATION_DATE,
    }),
    /YYYY-MM-DD/,
  );
  assert.throws(
    () => buildFocusDossier({
      analysisDate: ANALYSIS_DATE,
      publicationDate: ANALYSIS_DATE,
    }),
    /publication_not_analysis_plus_one/,
  );
});

test('REM/deep predefiniti 60/60 senza wearable → missing (non estimated)', () => {
  const dossier = buildFocusDossier(buildUnreliableStagesFixture());
  assert.equal(dossier.sleep.deepMin.value, null);
  assert.equal(dossier.sleep.remMin.value, null);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.sleep.remMin.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.sleep.deepMin.source, 'form_placeholder_60_suppressed');
  assert.equal(DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN, 60);
});

test('REM/deep 60/60 con indizio wearable → recorded', () => {
  const dossier = buildFocusDossier(buildWearableStagesFixture());
  assert.equal(dossier.sleep.deepMin.value, 60);
  assert.equal(dossier.sleep.remMin.value, 60);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.recorded);
  assert.equal(dossier.sleep.remMin.provenance, FOCUS_PROVENANCE.recorded);
});

test('REM/deep intenzionali diversi da 60/60 → recorded', () => {
  const fixture = buildUnreliableStagesFixture();
  fixture.publicationDayNode.log[0].deepMin = 95;
  fixture.publicationDayNode.log[0].remMin = 88;
  const dossier = buildFocusDossier(fixture);
  assert.equal(dossier.sleep.deepMin.value, 95);
  assert.equal(dossier.sleep.remMin.value, 88);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.recorded);
});

test('assenza duplicazioni evidenti: id ripetuti in log e manualNodes workout', () => {
  const fixture = buildFullDayFixture();
  fixture.analysisDayNode.manualNodes.push({
    type: 'workout',
    id: 'workout_1',
    name: 'Pesi DUPLICATO',
    duration: 55,
    kcal: 999,
  });
  const dossier = buildFocusDossier(fixture);
  assert.equal(dossier.day.activity.workouts.length, 2);
  assert.equal(dossier.day.activity.workoutKcalTotal.value, 440);
  const ids = dossier.day.activity.workouts.map((w) => w.id);
  assert.deepEqual(ids, ['workout_1', 'workout_walk']);
});
