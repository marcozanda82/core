/**
 * Dettaglio pasti/notte e kentu_get_evenings (logica pura).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDayMealsDetail,
  buildDaySleepDetail,
  buildEvenings,
  assertEveningsRange,
} from '../dayDetail.js';

function historyWithDay(date, { log = [], manualNodes = [], mealTimes = {} } = {}) {
  return {
    [`trackerStorico_${date}`]: {
      data: date,
      log,
      manualNodes,
      mealTimes,
    },
  };
}

test('buildDayMealsDetail: macro, sodio mancante, liquidi e caffeina', () => {
  const hist = historyWithDay('2026-11-08', {
    mealTimes: { cena: 20.5 },
    log: [
      {
        type: 'meal',
        mealId: 'cena',
        items: [
          {
            type: 'food',
            name: 'Pasta',
            qta: 100,
            kcal: 350,
            prot: 12,
            carb: 70,
            fat: 2,
            fibre: 3,
            na: 400,
            mealTime: 20.5,
          },
          {
            type: 'food',
            name: 'Snack OFF',
            qta: 30,
            kcal: 150,
            prot: 2,
            carb: 20,
            fat: 5,
            mealTime: 20.5,
          },
          {
            type: 'food',
            name: 'Espresso',
            qta: 30,
            kcal: 2,
            caffeineMg: 80,
            mealTime: 15,
            mealType: 'spuntino',
          },
        ],
      },
    ],
    manualNodes: [
      { type: 'water', ml: 300, time: 21 },
      { type: 'alcohol', ml: 150, abv: 12, pureAlcohol: 14.4, kcal: 100, time: 21.5 },
    ],
  });
  const detail = buildDayMealsDetail(hist, '2026-11-08');
  assert.equal(detail.meals.length, 3);
  assert.equal(detail.meals[0].sodiumMg, 400);
  assert.equal(detail.coverage.missingSodiumCount, 2);
  assert.equal(detail.liquids.length, 2);
  assert.equal(detail.caffeineMg, 80);
});

test('buildDaySleepDetail: stelle, notes, bedtime derivato', () => {
  const hist = historyWithDay('2026-11-08', {
    log: [
      {
        type: 'sleep',
        id: 's1',
        hours: 7,
        wakeTime: 7,
        quality: 2,
        notes: 'sete alle 3',
      },
    ],
  });
  const sleep = buildDaySleepDetail(hist, '2026-11-08');
  assert.equal(sleep.qualityStars, 2);
  assert.equal(sleep.notes, 'sete alle 3');
  assert.equal(sleep.hours, 7);
  assert.equal(sleep.bedtimeProvenance, 'derived');
  assert.ok(sleep.bedtime != null);
});

test('buildEvenings: max 90 giorni e riga compatta', () => {
  assert.throws(() => assertEveningsRange('2026-01-01', '2026-05-01'), /90/);
  const hist = historyWithDay('2026-11-08', {
    log: [
      {
        type: 'meal',
        mealId: 'cena',
        items: [
          {
            type: 'food',
            name: 'Zuppa',
            mealType: 'cena',
            mealTime: 21,
            qta: 300,
            kcal: 400,
            na: 900,
          },
        ],
      },
      {
        type: 'sleep',
        hours: 6.5,
        wakeTime: 7,
        quality: 3,
        notes: 'bagno',
      },
    ],
    manualNodes: [{ type: 'water', ml: 400, time: 22 }],
  });
  const out = buildEvenings(hist, '2026-11-08', '2026-11-08');
  assert.equal(out.days, 1);
  const row = out.evenings[0];
  assert.equal(row.dinnerKcal, 400);
  assert.equal(row.liquidsAfter18Ml, 400);
  assert.equal(row.night.qualityStars, 3);
  assert.equal(row.night.notes, 'bagno');
  assert.ok(row.hoursBeforeSleep != null);
});
