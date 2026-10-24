/**
 * Kentu Focus — cardio settimanale, forza condizionale, priorità, Ieri/Settimana/Mese.
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
  const out = [];
  for (let i = 6; i >= 0; i -= 1) out.push(addCalendarDays(end, -i));
  return out;
}

function food(id, name, extra = {}) {
  return {
    type: 'food', id, mealType: 'pranzo', mealTime: 13, name,
    grams: 150, kcal: 200, prot: 12, carb: 20, fat: 5, ...extra,
  };
}

function appendDayLog(history, date, items) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, log: [], manualNodes: [] };
  history[key].log = [...(history[key].log || []), ...items];
}

function appendSleep(history, analysisDay, hours = 7.5, bedtime = 23) {
  appendDayLog(history, addCalendarDays(analysisDay, 1), [{
    type: 'sleep', id: `s_${analysisDay}`, hours, wakeTime: 7, bedtime,
  }]);
}

function runWeek(fullHistory, userTargets = { kcal: 2200, prot: 140 }) {
  const nutritionView = buildFocusPrivateNutritionView({
    periodId: 'settimana', uid: 'u', fullHistory, analysisDate: DAY, publicationDate: PUB,
  });
  const wellness = buildFocusWellnessPillars({
    periodId: 'settimana', fullHistory, analysisDate: DAY, publicationDate: PUB,
    nutritionView, userTargets,
  });
  const mealManeuver = buildFocusMealRedistributionManeuver({
    periodId: 'settimana', nutritionView, wellness, sleepNight: null,
    userTargets, analysisDate: DAY, publicationDate: PUB,
  });
  return {
    wellness,
    compass: buildFocusWeeklyHabitCompass({
      periodId: 'settimana', uid: 'u', fullHistory, analysisDate: DAY, publicationDate: PUB,
      wellness, nutritionView, userTargets, mealManeuver,
    }),
  };
}

function print(label, payload) {
  // eslint-disable-next-line no-console
  console.log(`\n===== ${label} =====\n${JSON.stringify(payload, null, 2)}`);
}

describe('Focus cardio + strength P1i', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('1: forza con gruppi muscolari registrati', () => {
    const history = {};
    const plan = [['Petto'], ['Dorso'], null, ['Gambe'], ['Petto'], null, ['Spalle']];
    weekDates().forEach((d, i) => {
      const log = [food(`f${i}`, 'Insalata'), food(`p${i}`, 'Pollo', { prot: 40, kcal: 250 })];
      if (plan[i]) {
        log.push({
          type: 'workout', id: `w${i}`, name: `Pesi · ${plan[i][0]}`,
          workoutType: 'pesi', duration: 50, time: 18, muscles: plan[i],
        });
      }
      appendDayLog(history, d, log);
      appendSleep(history, d);
    });
    const { compass } = runWeek(history);
    const strength = compass.evaluations.find((e) => e.id === 'strength_stimulus');
    assert.ok(strength);
    assert.equal(strength.direction, 'favorable');
    assert.match(strength.habitObserved, /Petto|Dorso|Gambe/);
    print('TEST_1_STRENGTH', {
      strength: { direction: strength.directionLabel, habit: strength.habitObserved, motivation: strength.motivation },
      cardio: compass.cardio,
    });
  });

  it('2: sole camminate senza intensità → non conteggiate come moderate', () => {
    const history = {};
    weekDates().forEach((d, i) => {
      appendDayLog(history, d, [
        food(`f${i}`, 'Yogurt'),
        {
          type: 'workout', id: `w${i}`, name: 'Camminata', workoutType: 'camminata',
          duration: 30, time: 17,
        },
      ]);
      appendSleep(history, d);
    });
    const { compass, wellness } = runWeek(history);
    assert.equal(compass.cardio.aerobicMinutesDocumented, 210);
    assert.equal(compass.cardio.intensityDocumented, false);
    assert.equal(compass.cardio.equivalentModerateMinutes, null);
    assert.ok(compass.cardio.walkingMinutesUnclassified >= 200);
    const cardioEv = compass.evaluations.find((e) => e.id === 'cardio_weekly');
    assert.equal(cardioEv.direction, 'watch');
    assert.match(cardioEv.motivation, /senza intensità|non li attribuisco/i);
    assert.equal(compass.evaluations.some((e) => e.id === 'strength_stimulus'), false);
    print('TEST_2_WALK_NO_INTENSITY', {
      cardio: compass.cardio,
      evaluation: { direction: cardioEv.directionLabel, motivation: cardioEv.motivation, proposal: cardioEv.proposal },
      exercisePhrase: wellness.pillarsById.exercise.shortPhrase,
    });
  });

  it('3: cardio moderato/vigoroso documentato — equivalenza corretta', () => {
    const history = {};
    // 100 min moderate + 40 min vigorous → eq = 100 + 80 = 180
    const days = weekDates();
    days.slice(0, 4).forEach((d, i) => {
      appendDayLog(history, d, [
        food(`f${i}`, 'Pasta'),
        {
          type: 'workout', id: `m${i}`, name: 'Corsa', workoutType: 'corsa',
          duration: 25, time: 18, intensity: 'moderate',
        },
      ]);
      appendSleep(history, d);
    });
    days.slice(4).forEach((d, i) => {
      appendDayLog(history, d, [
        food(`g${i}`, 'Riso'),
        {
          type: 'workout', id: `v${i}`, name: 'Corsa vigorosa', workoutType: 'corsa',
          duration: Math.round(40 / 3), time: 18, intensity: 'vigorous',
        },
      ]);
      appendSleep(history, d);
    });
    // Adjust: 3× ~13.3 won't be exact — use explicit minutes
    // Rebuild last 3 days with 40 total vigorous: 20+10+10
    const history2 = {};
    weekDates().forEach((d, i) => {
      const items = [food(`f${i}`, 'Pasta')];
      if (i < 4) {
        items.push({
          type: 'workout', id: `m${i}`, name: 'Corsa', duration: 25, time: 18, intensity: 'moderate',
        });
      } else if (i === 4) {
        items.push({
          type: 'workout', id: `v${i}`, name: 'Corsa', duration: 20, time: 18, intensity: 'vigorous',
        });
      } else if (i === 5) {
        items.push({
          type: 'workout', id: `v${i}`, name: 'Corsa', duration: 10, time: 18, intensity: 'vigorous',
        });
      } else {
        items.push({
          type: 'workout', id: `v${i}`, name: 'Corsa', duration: 10, time: 18, intensity: 'vigorous',
        });
      }
      appendDayLog(history2, d, items);
      appendSleep(history2, d);
    });
    const { compass } = runWeek(history2);
    // moderate 100, vigorous 40 → eq 180
    assert.equal(compass.cardio.moderateMinutes, 100);
    assert.equal(compass.cardio.vigorousMinutes, 40);
    assert.equal(compass.cardio.equivalentModerateMinutes, 180);
    const cardioEv = compass.evaluations.find((e) => e.id === 'cardio_weekly');
    assert.equal(cardioEv.direction, 'favorable');
    print('TEST_3_CARDIO_EQUIV', {
      documented: compass.cardio.aerobicMinutesDocumented,
      moderate: compass.cardio.moderateMinutes,
      vigorous: compass.cardio.vigorousMinutes,
      equivalentModerate: compass.cardio.equivalentModerateMinutes,
      direction: cardioEv.directionLabel,
      motivation: cardioEv.motivation,
    });
  });

  it('4: progressi aerobici sotto obiettivo', () => {
    const history = {};
    // 60 min moderate total
    weekDates().slice(0, 3).forEach((d, i) => {
      appendDayLog(history, d, [
        food(`f${i}`, 'Insalata'),
        {
          type: 'workout', id: `w${i}`, name: 'Bici', duration: 20, time: 17, intensity: 'moderate',
        },
      ]);
      appendSleep(history, d);
    });
    weekDates().slice(3).forEach((d, i) => {
      appendDayLog(history, d, [food(`x${i}`, 'Yogurt')]);
      appendSleep(history, d);
    });
    const { compass } = runWeek(history);
    assert.equal(compass.cardio.equivalentModerateMinutes, 60);
    const cardioEv = compass.evaluations.find((e) => e.id === 'cardio_weekly');
    assert.equal(cardioEv.direction, 'favorable');
    assert.match(cardioEv.motivation, /Progresso|sotto il riferimento/i);
    print('TEST_4_CARDIO_PROGRESS', {
      equivalentModerate: compass.cardio.equivalentModerateMinutes,
      motivation: cardioEv.motivation,
      proposal: cardioEv.proposal,
    });
  });

  it('5: nessuna attività → niente diagnosi di sedentarietà', () => {
    const history = {};
    weekDates().forEach((d, i) => {
      appendDayLog(history, d, [food(`f${i}`, 'Insalata'), food(`b${i}`, 'Broccoli')]);
      appendSleep(history, d);
    });
    const { compass } = runWeek(history);
    const cardioEv = compass.evaluations.find((e) => e.id === 'cardio_weekly');
    assert.equal(cardioEv.direction, 'insufficient');
    assert.match(cardioEv.motivation, /non deduco sedentarietà/i);
    assert.equal(/sedentar/i.test(cardioEv.motivation) && /sei sedentario/i.test(cardioEv.motivation), false);
    print('TEST_5_NO_ACTIVITY', {
      cardio: compass.cardio,
      motivation: cardioEv.motivation,
      limits: cardioEv.limits,
    });
  });

  it('6: sonno irregolare + forza → priorità motivata', () => {
    const history = {};
    const sleepH = [5, 8.5, 4.5, 9, 5.2, 8, 4.2];
    weekDates().forEach((d, i) => {
      appendDayLog(history, d, [
        food(`f${i}`, 'Riso'),
        food(`v${i}`, 'Zucchine'),
        {
          type: 'workout', id: `w${i}`, name: 'Pesi · Petto', workoutType: 'pesi',
          duration: 45, time: 18, muscles: ['Petto'],
        },
      ]);
      appendSleep(history, d, sleepH[i], i % 2 ? 22.5 : 1.5);
    });
    const { compass } = runWeek(history);
    const sleepEv = compass.evaluations.find((e) => e.id === 'sleep_regularity');
    const strength = compass.evaluations.find((e) => e.id === 'strength_stimulus');
    assert.equal(sleepEv.direction, 'correct');
    assert.ok(strength);
    assert.ok(compass.highlights.primaryAction);
    // Sleep should outrank strength imbalance / food for action when irregular+short
    assert.equal(compass.highlights.correct?.evaluationId, 'sleep_regularity');
    print('TEST_6_SLEEP_VS_STRENGTH', {
      correct: compass.highlights.correct,
      primaryAction: compass.highlights.primaryAction,
      conflictNote: compass.highlights.conflictNote,
      sleep: sleepEv.motivation,
      strength: strength.motivation,
    });
  });

  it('7: conflitto cibo NOVA / sonno / cardio — priorità non fissa su NOVA', () => {
    const history = {};
    const sleepH = [5, 8.5, 4.5, 9, 5.2, 8, 4.2];
    weekDates().forEach((d, i) => {
      appendDayLog(history, d, [
        food(`cola${i}`, 'Bibita gassata cola', { semanticTags: { novaGroup: 4 }, kcal: 140, carb: 35 }),
        food(`p${i}`, 'Pollo', { prot: 40, kcal: 250 }),
        {
          type: 'workout', id: `c${i}`, name: 'Corsa', duration: 15, time: 17, intensity: 'moderate',
        },
      ]);
      appendSleep(history, d, sleepH[i], i % 2 ? 22.5 : 1.8);
    });
    const { compass } = runWeek(history);
    const idsCorrect = compass.evaluations.filter((e) => e.direction === 'correct').map((e) => e.id);
    assert.ok(idsCorrect.includes('food_model_direction'));
    assert.ok(idsCorrect.includes('sleep_regularity'));
    // Non deve essere sempre NOVA: con sonno irregolare+corto, sleep vince
    assert.equal(compass.highlights.correct?.evaluationId, 'sleep_regularity');
    assert.equal(compass.highlights.primaryAction?.evaluationId, 'sleep_regularity');
    assert.match(String(compass.highlights.conflictNote || ''), /non è un ordine fisso|Priorità/i);
    print('TEST_7_PRIORITY_NOT_NOVA', {
      correctIds: idsCorrect,
      highlights: compass.highlights,
      cardio: {
        documented: compass.cardio.aerobicMinutesDocumented,
        equivalentModerate: compass.cardio.equivalentModerateMinutes,
      },
    });
  });

  it('8: Ieri / Settimana / Mese coerenti', () => {
    const history = {};
    for (let i = 29; i >= 0; i -= 1) {
      const d = addCalendarDays(DAY, -i);
      appendDayLog(history, d, [
        food(`f${i}`, 'Insalata'),
        {
          type: 'workout', id: `w${i}`, name: 'Pesi · Dorso', workoutType: 'pesi',
          duration: 40, time: 18, muscles: ['Dorso'],
        },
      ]);
      appendSleep(history, d, 7.2, 23);
    }
    // Ieri: low kcal + short sleep + workout already done
    const ieriNode = history[`trackerStorico_${DAY}`];
    ieriNode.log = [
      food('low', 'Mela', { kcal: 60, carb: 15, prot: 0 }),
      {
        type: 'workout', id: 'w-ieri', name: 'Pesi · Gambe', workoutType: 'pesi',
        duration: 50, time: 18, muscles: ['Gambe'],
      },
    ];
    const pubNode = history[`trackerStorico_${PUB}`];
    pubNode.log = [{ type: 'sleep', id: 's-ieri', hours: 5.0, wakeTime: 7, bedtime: 1.5 }];

    stashFocusDiaryForUser('uid-coh', {
      fullHistory: history,
      analysisDate: DAY,
      publicationDate: PUB,
      userTargets: { kcal: 2200, prot: 140 },
    });

    const ieri = resolveFocusPageSession({ uid: 'uid-coh', periodId: 'ieri' });
    const sett = resolveFocusPageSession({ uid: 'uid-coh', periodId: 'settimana' });
    const mese = resolveFocusPageSession({ uid: 'uid-coh', periodId: 'mese' });

    assert.equal(ieri.habitCompass?.available, false);
    assert.match(ieri.wellness.coach.concreteAction, /carico più leggero|riposo/i);
    assert.equal(/pronto a spingere/i.test(ieri.wellness.coach.concreteAction), false);

    assert.equal(sett.habitCompass?.available, true);
    assert.ok(sett.habitCompass.evaluations.some((e) => e.id === 'strength_stimulus'));
    assert.ok(sett.habitCompass.cardio);

    assert.equal(mese.habitCompass?.available, true);
    assert.ok(mese.habitCompass.cardio?.monthTrendNote);
    assert.ok(mese.wellness.pillarsById.exercise.series.length >= 28);

    print('TEST_8_PERIODS', {
      ieri: {
        habitAvailable: ieri.habitCompass?.available,
        coachAction: ieri.wellness.coach.concreteAction,
        needsAttention: ieri.wellness.coach.needsAttention,
      },
      settimana: {
        strength: sett.habitCompass.evaluations.find((e) => e.id === 'strength_stimulus')?.directionLabel,
        cardioDoc: sett.habitCompass.cardio.aerobicMinutesDocumented,
      },
      mese: {
        monthTrendNote: mese.habitCompass.cardio.monthTrendNote,
        strengthSessionsHint: mese.habitCompass.cardio.strengthSessions,
      },
    });
  });

  it('9: demo/reale isolati per UID', () => {
    const history = {};
    weekDates().forEach((d, i) => {
      appendDayLog(history, d, [
        food(`f${i}`, 'Insalata'),
        {
          type: 'workout', id: `w${i}`, name: 'Camminata', duration: 40, time: 17, intensity: 'moderate',
        },
      ]);
      appendSleep(history, d);
    });
    stashFocusDiaryForUser('uid-X', {
      fullHistory: history, analysisDate: DAY, publicationDate: PUB,
      userTargets: { kcal: 2000 },
    });
    const a = resolveFocusPageSession({ uid: 'uid-X', periodId: 'settimana' });
    const b = resolveFocusPageSession({ uid: 'uid-Y', periodId: 'settimana' });
    assert.equal(a.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(a.habitCompass?.uid, 'uid-X');
    assert.ok(a.habitCompass.cardio.equivalentModerateMinutes > 0);
    assert.notEqual(b.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(b.habitCompass, null);
    print('TEST_9_UID', {
      A: { mode: a.mode, cardioEq: a.habitCompass.cardio.equivalentModerateMinutes },
      B: { mode: b.mode, habitCompass: b.habitCompass },
    });
  });
});
