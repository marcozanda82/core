/**
 * Kentu Focus — bussola preventiva settimanale (abitudini).
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  buildFocusWeeklyHabitCompass,
  buildFocusWellnessPillars,
  buildFocusPrivateNutritionView,
  buildFocusMealRedistributionManeuver,
  resolveFocusPageSession,
  stashFocusDiaryForUser,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function weekDates(end = DAY) {
  const dates = [];
  for (let i = 6; i >= 0; i -= 1) dates.push(addCalendarDays(end, -i));
  return dates;
}

function food(id, name, extra = {}) {
  return {
    type: 'food',
    id,
    mealType: 'pranzo',
    mealTime: 13,
    name,
    grams: 150,
    kcal: 120,
    prot: 5,
    carb: 15,
    fat: 3,
    ...extra,
  };
}

function workout(id, muscles, dateSuffix = '') {
  return {
    type: 'workout',
    id: `${id}${dateSuffix}`,
    workoutType: 'pesi',
    name: `Pesi · ${(muscles || [])[0] || 'Sessione'}`,
    duration: 45,
    time: 18,
    muscles: muscles || [],
  };
}

/**
 * Unisce food/workout/sleep sullo stesso nodo giorno (il sonno D è sul risveglio D+1).
 * @param {object} history
 * @param {string} date
 * @param {object[]} items
 */
function appendDayLog(history, date, items) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) {
    history[key] = { data: date, log: [], manualNodes: [] };
  }
  history[key].log = [...(history[key].log || []), ...items];
}

function appendSleepForDay(history, analysisDay, hours, bedtime = 23.5) {
  const wakeDate = addCalendarDays(analysisDay, 1);
  appendDayLog(history, wakeDate, [{
    type: 'sleep',
    id: `sleep_${wakeDate}`,
    hours,
    wakeTime: 7,
    bedtime,
  }]);
}

function runCompass(fullHistory, userTargets = { kcal: 2200, prot: 140 }) {
  const nutritionView = buildFocusPrivateNutritionView({
    periodId: 'settimana',
    uid: 'u-habit',
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
  });
  const wellness = buildFocusWellnessPillars({
    periodId: 'settimana',
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
    nutritionView,
  });
  const mealManeuver = buildFocusMealRedistributionManeuver({
    periodId: 'settimana',
    nutritionView,
    wellness,
    sleepNight: null,
    userTargets,
    analysisDate: DAY,
    publicationDate: PUB,
  });
  return buildFocusWeeklyHabitCompass({
    periodId: 'settimana',
    uid: 'u-habit',
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
    wellness,
    nutritionView,
    userTargets,
    mealManeuver,
  });
}

function printEval(label, compass) {
  const compact = {
    reason: compass.reason,
    highlights: compass.highlights,
    evaluations: (compass.evaluations || []).map((e) => ({
      pillar: e.pillarLabel,
      direction: e.directionLabel,
      habit: e.habitObserved,
      motivation: e.motivation,
      proposal: e.proposal,
      evidence: e.evidence,
    })),
  };
  // eslint-disable-next-line no-console
  console.log(`\n===== ${label} =====\n${JSON.stringify(compact, null, 2)}`);
  return compact;
}

describe('Focus weekly habit compass P1h', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('1: settimana con abitudini alimentari favorevoli', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    dates.forEach((d, idx) => {
      appendDayLog(fullHistory, d, [
        food(`a-${idx}`, 'Insalata mista', { kcal: 80, carb: 10, fibre: 4 }),
        food(`b-${idx}`, 'Broccoli', { kcal: 50, carb: 6, fibre: 3 }),
        food(`c-${idx}`, 'Yogurt greco', { kcal: 140, prot: 15, carb: 6 }),
        food(`d-${idx}`, 'Fiocchi di avena', { mealType: 'colazione', mealTime: 8, kcal: 200, carb: 35 }),
      ]);
      appendSleepForDay(fullHistory, d, 7.5, 23);
    });

    const c = runCompass(fullHistory);
    assert.equal(c.available, true);
    const foodEv = c.evaluations.find((e) => e.id === 'food_model_direction');
    assert.equal(foodEv.direction, 'favorable');
    assert.ok(c.highlights.encourage);
    printEval('TEST_1_FOOD_FAVORABLE', c);
  });

  it('2: modello alimentare ricorrente sfavorevole con NOVA attendibile', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    dates.forEach((d, idx) => {
      appendDayLog(fullHistory, d, [
        food(`cola-${idx}`, 'Bibita gassata cola', {
          kcal: 140,
          carb: 35,
          semanticTags: { novaGroup: 4 },
        }),
        food(`snack-${idx}`, 'Patatine confezionate', {
          kcal: 180,
          fat: 12,
          carb: 16,
          semanticTags: { novaGroup: 4 },
        }),
        food(`p-${idx}`, 'Petto di pollo', { kcal: 200, prot: 40, carb: 0 }),
      ]);
      appendSleepForDay(fullHistory, d, 7.2, 23.2);
    });

    const c = runCompass(fullHistory);
    const foodEv = c.evaluations.find((e) => e.id === 'food_model_direction');
    assert.equal(foodEv.direction, 'correct');
    assert.match(foodEv.motivation, /NOVA 4|processat/i);
    assert.ok(foodEv.proposal);
    assert.equal(c.highlights.correct?.evaluationId, 'food_model_direction');
    printEval('TEST_2_FOOD_NOVA4', c);
  });

  it('3: allenamenti ripetuti con gruppi muscolari documentati', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    const plan = [
      ['Petto'],
      ['Dorso'],
      null,
      ['Gambe'],
      ['Petto'],
      null,
      ['Spalle'],
    ];
    dates.forEach((d, idx) => {
      const log = [
        food(`f-${idx}`, 'Pasta al pomodoro', { kcal: 400, carb: 70, prot: 12 }),
        food(`v-${idx}`, 'Insalata', { kcal: 40, carb: 5 }),
      ];
      if (plan[idx]) log.push(workout(`w-${idx}`, plan[idx], d));
      appendDayLog(fullHistory, d, log);
      appendSleepForDay(fullHistory, d, 7.4, 23);
    });

    const c = runCompass(fullHistory);
    const ex = c.evaluations.find((e) => e.id === 'strength_stimulus');
    assert.ok(ex, 'attesa valutazione forza quando i pesi sono registrati');
    assert.equal(ex.direction, 'favorable');
    assert.match(ex.habitObserved, /Petto|Dorso|Gambe/i);
    assert.ok(ex.evidence.some((line) => /Gruppi/i.test(line)));
    printEval('TEST_3_TRAINING_BALANCE', c);
  });

  it('4: sonno irregolare documentato', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    const sleepPattern = [
      { h: 5.0, bed: 1.5 },
      { h: 8.5, bed: 22.5 },
      { h: 4.5, bed: 2.0 },
      { h: 9.0, bed: 22.0 },
      { h: 5.5, bed: 1.0 },
      { h: 8.0, bed: 23.0 },
      { h: 4.0, bed: 2.5 },
    ];
    dates.forEach((d, idx) => {
      appendDayLog(fullHistory, d, [
        food(`f-${idx}`, 'Riso', { kcal: 250, carb: 50 }),
        food(`v-${idx}`, 'Zucchine', { kcal: 40, carb: 5 }),
      ]);
      appendSleepForDay(fullHistory, d, sleepPattern[idx].h, sleepPattern[idx].bed);
    });

    const c = runCompass(fullHistory);
    const sleepEv = c.evaluations.find((e) => e.id === 'sleep_regularity');
    assert.equal(sleepEv.direction, 'correct');
    assert.match(sleepEv.motivation, /irregolar|oscill/i);
    assert.ok(c.highlights.correct || c.highlights.primaryAction);
    printEval('TEST_4_SLEEP_IRREGULAR', c);
  });

  it('5: diario incompleto → niente verdetti', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        log: [food('only', 'Mela', { kcal: 60, carb: 15 })],
      },
    };
    const c = runCompass(fullHistory);
    assert.equal(c.available, true);
    for (const e of c.evaluations) {
      assert.equal(e.direction, 'insufficient');
    }
    assert.equal(c.highlights.encourage, null);
    assert.equal(c.highlights.correct, null);
    assert.equal(c.highlights.primaryAction, null);
    printEval('TEST_5_INCOMPLETE', c);
  });

  it('6: conflitto fra due consigli → priorità giustificata', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    const sleepPattern = [5, 8.5, 4.5, 9, 5.2, 8, 4.2];
    dates.forEach((d, idx) => {
      appendDayLog(fullHistory, d, [
        food(`cola-${idx}`, 'Bibita gassata cola', {
          kcal: 140,
          carb: 35,
          semanticTags: { novaGroup: 4 },
        }),
        food(`p-${idx}`, 'Petto di pollo', { kcal: 220, prot: 45 }),
        workout(`w-${idx}`, ['Petto'], d),
      ]);
      appendSleepForDay(fullHistory, d, sleepPattern[idx], idx % 2 ? 22.5 : 1.8);
    });

    const c = runCompass(fullHistory);
    const dirs = c.evaluations.filter((e) => e.direction === 'correct');
    assert.ok(dirs.length >= 2, 'servono almeno due criticità');
    assert.ok(c.highlights.primaryAction);
    assert.ok(c.highlights.conflictNote);
    assert.match(c.highlights.conflictNote, /Priorità/i);
    printEval('TEST_6_CONFLICT', c);
  });

  it('7: nessuna contaminazione demo/reale o fra UID', () => {
    const dates = weekDates();
    /** @type {object} */
    const fullHistory = {};
    dates.forEach((d, idx) => {
      appendDayLog(fullHistory, d, [
        food(`a-${idx}`, 'Insalata', { kcal: 70 }),
        food(`b-${idx}`, 'Broccoli', { kcal: 45 }),
        food(`c-${idx}`, 'Fiocchi di avena', { kcal: 200, carb: 35 }),
      ]);
      appendSleepForDay(fullHistory, d, 7.5, 23);
    });

    stashFocusDiaryForUser('uid-A', {
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
      userTargets: { kcal: 2200, prot: 140 },
    });

    const sessionA = resolveFocusPageSession({ uid: 'uid-A', periodId: 'settimana' });
    assert.equal(sessionA.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(sessionA.habitCompass?.available, true);
    assert.equal(sessionA.habitCompass?.uid, 'uid-A');
    const foodA = sessionA.habitCompass.evaluations.find((e) => e.id === 'food_model_direction');
    assert.equal(foodA.direction, 'favorable');

    const sessionB = resolveFocusPageSession({ uid: 'uid-B', periodId: 'settimana' });
    assert.notEqual(sessionB.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(sessionB.habitCompass, null);

    const sessionIeri = resolveFocusPageSession({ uid: 'uid-A', periodId: 'ieri' });
    assert.equal(sessionIeri.habitCompass?.available, false);
    assert.match(String(sessionIeri.habitCompass?.reason || ''), /period_not_settimana/);

    // eslint-disable-next-line no-console
    console.log('\n===== TEST_7_UID_ISOLATION =====\n', JSON.stringify({
      A: {
        mode: sessionA.mode,
        foodDirection: foodA.directionLabel,
        uid: sessionA.habitCompass.uid,
      },
      B: { mode: sessionB.mode, habitCompass: sessionB.habitCompass },
      A_ieri: { available: sessionIeri.habitCompass?.available, reason: sessionIeri.habitCompass?.reason },
    }, null, 2));
  });
});
