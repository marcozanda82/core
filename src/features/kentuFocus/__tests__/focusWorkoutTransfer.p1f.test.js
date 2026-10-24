/**
 * Kentu Focus — trasferimento completo allenamenti (muscoli, orario, durata).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeWorkoutEvents,
  extractRecordedMuscleGroups,
} from '../normalize/normalizeWorkoutEvents.js';
import {
  buildFocusWellnessPillars,
  buildFocusAiCoachDossier,
  resolveFocusPageSession,
  FOCUS_PAGE_MODE,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

/** Forma tipica salvata da useWorkoutManager (log diario). */
const ORIGINAL_WORKOUT = Object.freeze({
  id: 'workout_demo_1',
  type: 'workout',
  workoutType: 'pesi',
  subType: 'pesi',
  desc: 'Pesi · Bicipiti, Tricipiti',
  name: 'Pesi · Bicipiti, Tricipiti',
  kcal: 220,
  cal: 220,
  duration: 45,
  time: 18.5,
  mealTime: 18.5,
  muscles: ['Bicipiti', 'Tricipiti'],
});

const SECOND_SAME_DAY = Object.freeze({
  id: 'workout_demo_2',
  type: 'workout',
  workoutType: 'camminata',
  subType: 'camminata',
  desc: 'Camminata',
  name: 'Camminata',
  duration: 30,
  time: 8,
  mealTime: 8,
  muscles: [],
});

function historyWithWeek() {
  const history = {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      log: [ORIGINAL_WORKOUT, SECOND_SAME_DAY],
      manualNodes: [],
    },
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{ type: 'sleep', id: 's1', hours: 7, wakeTime: 7, bedtime: 23 }],
    },
  };

  // Altri giorni nella settimana: schiena, gambe
  const d1 = addCalendarDays(DAY, -2);
  const d2 = addCalendarDays(DAY, -4);
  history[`trackerStorico_${d1}`] = {
    data: d1,
    log: [{
      id: 'w_back',
      type: 'workout',
      workoutType: 'pesi',
      name: 'Pesi · Schiena',
      duration: 50,
      time: 19,
      mealTime: 19,
      muscles: ['Schiena'],
    }],
    manualNodes: [],
  };
  history[`trackerStorico_${d2}`] = {
    data: d2,
    log: [{
      id: 'w_legs',
      type: 'workout',
      workoutType: 'pesi',
      name: 'Pesi · Gambe',
      duration: 55,
      time: 17.25,
      mealTime: 17.25,
      muscles: ['Gambe'],
    }],
    manualNodes: [],
  };
  return history;
}

describe('Focus workout transfer P1f', () => {
  it('normalizer conserva muscoli, orario, durata, tipo (senza inventare serie)', () => {
    const pack = normalizeWorkoutEvents({ log: [ORIGINAL_WORKOUT], manualNodes: [] });
    assert.equal(pack.hasWorkout, true);
    const w = pack.activity.workouts[0];
    assert.equal(w.durationMin.value, 45);
    assert.equal(w.clockHour.value, 18.5);
    assert.deepEqual(w.muscleGroups.value, extractRecordedMuscleGroups(ORIGINAL_WORKOUT));
    assert.ok(w.muscleGroups.value.includes('Bicipiti') || w.muscleGroups.value.some((m) => /bicipit/i.test(m)));
    assert.equal(w.workoutTypeId.value, 'pesi');
    assert.equal(w.setsRepsLoadsInvented, false);
    assert.equal(w.activityKind.value, 'strength');

    // eslint-disable-next-line no-console
    console.log('PRIMA_DOPO_ALLENAMENTO:', JSON.stringify({
      originale: {
        muscles: ORIGINAL_WORKOUT.muscles,
        time: ORIGINAL_WORKOUT.time,
        duration: ORIGINAL_WORKOUT.duration,
        workoutType: ORIGINAL_WORKOUT.workoutType,
        name: ORIGINAL_WORKOUT.name,
        kcal: ORIGINAL_WORKOUT.kcal,
      },
      normalizzato: {
        muscleGroups: w.muscleGroups.value,
        clockHour: w.clockHour.value,
        durationMin: w.durationMin.value,
        workoutTypeId: w.workoutTypeId.value,
        label: w.label,
        kcalBurn: w.kcalBurn.value,
        activityKind: w.activityKind.value,
      },
    }, null, 2));
  });

  it('pilastro Ieri: più sessioni stesso giorno con orari e gruppi', () => {
    const fullHistory = historyWithWeek();
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const ex = pack.pillarsById.exercise;
    assert.equal(ex.hasEvidence, true);
    assert.equal(ex.workouts.length, 2);
    const strength = ex.workouts.find((w) => w.workoutTypeId === 'pesi');
    const walk = ex.workouts.find((w) => w.workoutTypeId === 'camminata');
    assert.ok(strength);
    assert.ok(walk);
    assert.equal(strength.durationMin, 45);
    assert.equal(strength.clockLabel, '18:30');
    assert.ok(strength.muscleGroups.length >= 2);
    assert.equal(walk.durationMin, 30);
    assert.equal(walk.clockLabel, '08:00');
    assert.match(ex.shortPhrase, /Bicipiti|Tricipiti|Gruppi/i);
  });

  it('settimana: frequenza gruppi e durate leggibili dal coach', () => {
    const fullHistory = historyWithWeek();
    const week = buildFocusWellnessPillars({
      periodId: 'settimana',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const ex = week.pillarsById.exercise;
    assert.equal(ex.series.length, 7);
    assert.ok(ex.muscleGroupFrequency.length >= 3);
    const groups = ex.muscleGroupFrequency.map((r) => r.group);
    assert.ok(groups.some((g) => /bicipit/i.test(g)));
    assert.ok(groups.some((g) => /dorso|schiena/i.test(g)));
    assert.ok(groups.some((g) => /gambe/i.test(g)));

    const session = resolveFocusPageSession({
      uid: 'u_w',
      periodId: 'settimana',
      handoff: {
        uid: 'u_w',
        fullHistory,
        analysisDate: DAY,
        publicationDate: PUB,
      },
    });
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    const dossier = buildFocusAiCoachDossier(session);
    assert.equal(dossier.ok, true);
    assert.ok(dossier.dossier.exercise.workouts.length >= 3);
    assert.ok(dossier.dossier.exercise.muscleGroupFrequency.length >= 3);
    assert.equal(dossier.dossier.exercise.policy.noInventedSetsRepsLoads, true);
    assert.equal(dossier.dossier.exercise.policy.missingLogNotInactivity, true);

    const coachReadable = {
      sessioni: dossier.dossier.exercise.workouts.map((w) => ({
        date: w.date,
        durationMin: w.durationMin,
        clockLabel: w.clockLabel,
        muscleGroups: w.muscleGroups,
        workoutTypeId: w.workoutTypeId,
      })),
      frequenzaGruppi: dossier.dossier.exercise.muscleGroupFrequency,
    };
    // eslint-disable-next-line no-console
    console.log('SETTIMANA_COACH_LEGGIBILE:', JSON.stringify(coachReadable, null, 2));
  });

  it('assenza log ≠ inattività; demo non mescolata', () => {
    const empty = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory: {
        [`trackerStorico_${DAY}`]: { data: DAY, log: [], manualNodes: [] },
      },
      analysisDate: DAY,
      publicationDate: PUB,
    });
    assert.equal(empty.pillarsById.exercise.hasEvidence, false);
    assert.equal(empty.pillarsById.exercise.primaryValue, 'Non registrato');
    assert.match(empty.pillarsById.exercise.detailNote, /non significa inattività/i);

    const demo = resolveFocusPageSession({ uid: 'x', periodId: 'ieri', handoff: null });
    assert.equal(demo.mode, FOCUS_PAGE_MODE.demo_preview);
    assert.equal(buildFocusAiCoachDossier(demo).ok, false);
  });

  it('mese: serie 30 giorni senza inventare intensità', () => {
    const month = buildFocusWellnessPillars({
      periodId: 'mese',
      fullHistory: historyWithWeek(),
      analysisDate: DAY,
      publicationDate: PUB,
    });
    assert.equal(month.pillarsById.exercise.series.length, 30);
    assert.ok(month.pillarsById.exercise.workouts.every((w) => w.intensityDocumented === false));
  });
});
