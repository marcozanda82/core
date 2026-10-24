/**
 * Kentu Focus — manovra redistribuzione giustificata (vantaggio reale).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFocusMealRedistributionManeuver,
  buildFocusPrivateNutritionView,
  buildFocusWellnessPillars,
  buildRealSleepNightBrief,
} from '../product/index.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function runManeuver(fullHistory, userTargets = { kcal: 2200, prot: 140 }) {
  const nutritionView = buildFocusPrivateNutritionView({
    periodId: 'ieri',
    uid: 'u',
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
  });
  const wellness = buildFocusWellnessPillars({
    periodId: 'ieri',
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
    nutritionView,
  });
  const sleepNight = buildRealSleepNightBrief(fullHistory, DAY, PUB);
  return buildFocusMealRedistributionManeuver({
    periodId: 'ieri',
    nutritionView,
    wellness,
    sleepNight,
    userTargets,
    analysisDate: DAY,
    publicationDate: PUB,
  });
}

function sleepPub() {
  return {
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{ type: 'sleep', id: 's1', hours: 7, wakeTime: 7, bedtime: 23.5 }],
    },
  };
}

describe('Focus meal redistribution maneuver P1g (justified)', () => {
  it('A: pranzo 13 / forza 17:30 / cena 21:30 → spuntino con carboidrato, non pollo al pranzo', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        mealTimes: { pranzo: 13, cena: 21.5 },
        log: [
          {
            type: 'food', id: 'col', mealType: 'colazione', mealTime: 8,
            name: 'Fiocchi di avena', grams: 60, kcal: 220, prot: 8, carb: 40, fat: 4,
          },
          {
            type: 'food', id: 'p1', mealType: 'pranzo', mealTime: 13,
            name: 'Insalata e pane', grams: 250, kcal: 280, prot: 8, carb: 35, fat: 8,
          },
          {
            type: 'food', id: 'c1', mealType: 'cena', mealTime: 21.5,
            name: 'Petto di pollo', grams: 200, kcal: 330, prot: 60, carb: 0, fat: 8,
          },
          {
            type: 'food', id: 'c2', mealType: 'cena', mealTime: 21.5,
            name: 'Riso', grams: 180, kcal: 230, prot: 5, carb: 50, fat: 1,
          },
          {
            type: 'food', id: 'c3', mealType: 'cena', mealTime: 21.5,
            name: 'Verdure', grams: 150, kcal: 40, prot: 2, carb: 6, fat: 1,
          },
          {
            type: 'workout', id: 'w1', workoutType: 'pesi', name: 'Pesi · Petto',
            duration: 50, time: 17.5, mealTime: 17.5, muscles: ['Petto'],
          },
        ],
        manualNodes: [],
      },
      ...sleepPub(),
    };

    const m = runManeuver(fullHistory);
    assert.equal(m.suggested, true);
    assert.equal(m.reason, 'pre_workout_fuel_gap');
    assert.equal(m.suggestedChange.foodName, 'Riso');
    assert.notEqual(m.suggestedChange.foodName, 'Petto di pollo');
    assert.equal(m.suggestedChange.to.virtualSnack, true);
    assert.ok(m.suggestedChange.to.clockHour > 13 && m.suggestedChange.to.clockHour < 17.5);
    assert.equal(m.simulation.addressesCriticality, true);
    assert.equal(m.simulation.dailyKcalBefore, m.simulation.dailyKcalAfter);
    assert.match(m.criticality, /Intervallo lungo|allenamento/i);
    assert.match(m.expectedAdvantage, /17:|spuntino|prima dell/i);
    assert.match(m.tradeoffs, /Petto di pollo|proteica/i);

    // eslint-disable-next-line no-console
    console.log('TEST_A_OUTPUT:', JSON.stringify({
      criticality: m.criticality,
      objective: m.objective,
      change: m.suggestedChange.text,
      advantage: m.expectedAdvantage,
      tradeoffs: m.tradeoffs,
      item: m.simulation.item,
      beforeAfter: m.simulation.mealTotalsAfter.map((r) => ({
        meal: r.mealLabel,
        clock: r.clockLabel,
        kcal: r.kcal,
        P: r.proteinG,
        C: r.carbG,
        F: r.fatG,
      })),
      dailyKcal: m.simulation.dailyKcalBefore,
    }, null, 2));
  });

  it('B: solo pollo a cena → nessuna manovra forzata per il gap', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        mealTimes: { colazione: 8, pranzo: 13, cena: 21.5 },
        log: [
          {
            type: 'food', id: 'col', mealType: 'colazione', mealTime: 8,
            name: 'Fiocchi di avena', grams: 70, kcal: 250, prot: 9, carb: 45, fat: 5,
          },
          {
            type: 'food', id: 'p1', mealType: 'pranzo', mealTime: 13,
            name: 'Pasta al pomodoro', grams: 300, kcal: 450, prot: 12, carb: 80, fat: 8,
          },
          {
            type: 'food', id: 'c1', mealType: 'cena', mealTime: 21.5,
            name: 'Petto di pollo', grams: 250, kcal: 400, prot: 70, carb: 0, fat: 10,
          },
          {
            type: 'workout', id: 'w1', workoutType: 'pesi', name: 'Pesi · Petto',
            duration: 50, time: 17.5, mealTime: 17.5, muscles: ['Petto'],
          },
        ],
        manualNodes: [],
      },
      ...sleepPub(),
    };

    const m = runManeuver(fullHistory);
    assert.equal(m.suggested, false);
    assert.equal(m.message, 'Nessuna manovra specifica consigliata');
    assert.equal(m.status, 'no_justified_advantage');
    assert.match(m.limits.join(' ') || m.observation || '', /proteica|carboidrati|adatti/i);
    assert.equal(/spuntino|Sposta «/i.test(m.message), false);
    // eslint-disable-next-line no-console
    console.log('TEST_B_OUTPUT:', JSON.stringify({
      status: m.status,
      message: m.message,
      observation: m.observation,
      limits: m.limits,
    }, null, 2));
  });

  it('C: pasti coerenti → nessuna manovra', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        mealTimes: { colazione: 8, pranzo: 13, cena: 20 },
        log: [
          {
            type: 'food', id: 'a', mealType: 'colazione', mealTime: 8,
            name: 'Yogurt', grams: 150, kcal: 140, prot: 12, carb: 14, fat: 3,
          },
          {
            type: 'food', id: 'b', mealType: 'pranzo', mealTime: 13,
            name: 'Pasta e pollo', grams: 350, kcal: 520, prot: 35, carb: 60, fat: 12,
          },
          {
            type: 'food', id: 'c', mealType: 'cena', mealTime: 20,
            name: 'Pesce e verdure', grams: 300, kcal: 380, prot: 40, carb: 20, fat: 12,
          },
        ],
        manualNodes: [],
      },
      ...sleepPub(),
    };

    const m = runManeuver(fullHistory);
    assert.equal(m.suggested, false);
    assert.equal(m.message, 'Nessuna manovra specifica consigliata');
    // eslint-disable-next-line no-console
    console.log('TEST_C_OUTPUT:', JSON.stringify({
      status: m.status,
      message: m.message,
      observation: m.observation,
    }, null, 2));
  });

  it('D: apporto molto basso → nessun consiglio da giornata normale', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        mealTimes: { pranzo: 13, cena: 21.5 },
        log: [
          {
            type: 'food', id: 'p1', mealType: 'pranzo', mealTime: 13,
            name: 'Mela', grams: 120, kcal: 60, prot: 0, carb: 15, fat: 0,
          },
          {
            type: 'food', id: 'c1', mealType: 'cena', mealTime: 21.5,
            name: 'Yogurt', grams: 125, kcal: 90, prot: 8, carb: 10, fat: 2,
          },
          {
            type: 'workout', id: 'w1', workoutType: 'pesi', name: 'Pesi',
            duration: 40, time: 17.5, mealTime: 17.5, muscles: ['Petto'],
          },
        ],
        manualNodes: [],
      },
      ...sleepPub(),
    };

    const m = runManeuver(fullHistory, { kcal: 2200 });
    assert.equal(m.suggested, false);
    assert.equal(m.status, 'low_or_incomplete_intake');
    assert.equal(m.message, 'Nessuna manovra specifica consigliata');
    assert.match(m.limits.join(' '), /basso|incompleto/i);
    // eslint-disable-next-line no-console
    console.log('TEST_D_OUTPUT:', JSON.stringify({
      status: m.status,
      message: m.message,
      limits: m.limits,
      observation: m.observation,
    }, null, 2));
  });

  it('E: prima/dopo con kcal e macro documentati', () => {
    const fullHistory = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        mealTimes: { colazione: 8, pranzo: 13, cena: 21.5 },
        log: [
          {
            type: 'food', id: 'col', mealType: 'colazione', mealTime: 8,
            name: 'Pane e marmellata', grams: 100, kcal: 250, prot: 6, carb: 48, fat: 3,
          },
          {
            type: 'food', id: 'p1', mealType: 'pranzo', mealTime: 13,
            name: 'Insalata e tonno', grams: 280, kcal: 320, prot: 28, carb: 12, fat: 14,
          },
          {
            type: 'food', id: 'c1', mealType: 'cena', mealTime: 21.5,
            name: 'Petto di pollo', grams: 200, kcal: 330, prot: 60, carb: 0, fat: 8,
          },
          {
            type: 'food', id: 'c2', mealType: 'cena', mealTime: 21.5,
            name: 'Patate', grams: 200, kcal: 180, prot: 4, carb: 40, fat: 0,
          },
          {
            type: 'workout', id: 'w1', workoutType: 'pesi', name: 'Forza',
            duration: 45, time: 17.5, mealTime: 17.5, muscles: ['Spalle'],
          },
        ],
        manualNodes: [],
      },
      ...sleepPub(),
    };

    const m = runManeuver(fullHistory);
    assert.equal(m.suggested, true);
    assert.equal(m.simulation.item.name, 'Patate');
    assert.equal(m.simulation.item.documented.carbG, true);
    assert.equal(m.simulation.conservedMacros.kcal, true);
    assert.equal(m.simulation.conservedMacros.carbG, true);
    const snack = m.simulation.mealTotalsAfter.find((r) => r.virtual);
    assert.ok(snack);
    assert.equal(snack.kcal, 180);
    assert.equal(snack.carbG, 40);

    // eslint-disable-next-line no-console
    console.log('TEST_E_OUTPUT:', JSON.stringify({
      item: m.simulation.item,
      conserved: m.simulation.conservedMacros,
      before: m.simulation.mealTotalsBefore,
      after: m.simulation.mealTotalsAfter,
    }, null, 2));
  });
});
