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

test('buildDaySleepDetail: legge la notte da date+1 (come il pilastro)', () => {
  const hist = {
    ...historyWithDay('2026-11-08', {
      log: [{ type: 'sleep', hours: 7, wakeTime: 7, quality: 4, notes: 'giorno scorretto' }],
    }),
    ...historyWithDay('2026-11-09', {
      log: [
        {
          type: 'sleep',
          id: 's1',
          hours: 6,
          wakeTime: 7.5,
          quality: 2,
          notes: 'sete alle 3',
        },
      ],
    }),
  };
  const sleep = buildDaySleepDetail(hist, '2026-11-08');
  assert.equal(sleep.hours, 6);
  assert.equal(sleep.storageDate, '2026-11-09');
  assert.equal(sleep.qualityStars, 2);
  assert.equal(sleep.notes, 'sete alle 3');
  assert.equal(sleep.bedtimeProvenance, 'derived');
  assert.ok(sleep.bedtime != null);
});

test('buildDayMealsDetail: fibre/sodio — fibreTotali, sale, niente 0 sentinella', () => {
  const hist = historyWithDay('2026-11-17', {
    log: [
      {
        type: 'meal',
        mealId: 'pranzo',
        items: [
          {
            type: 'food',
            name: 'Filetti di merluzzo',
            grams: 220,
            fibre: 16.5,
            fibreTotali: 0,
            na: 1100,
          },
          {
            type: 'food',
            name: 'Uovo sodo',
            grams: 100,
            fibre: 15,
            na: 1000,
          },
          {
            type: 'food',
            name: 'Pesto rosso',
            grams: 50,
            fibre: 0.8,
            na: 0,
            sale: 0.7,
          },
          {
            type: 'food',
            name: 'Wudy al Formaggio',
            grams: 50,
            fibre: 0,
            fibreTotali: 0,
            na: 0,
          },
          {
            type: 'food',
            name: 'Pane integrale',
            grams: 80,
            fibre: 5.1,
            fibreTotali: 5.1,
            na: 0,
            sale: 0.7,
          },
        ],
      },
    ],
  });
  const detail = buildDayMealsDetail(hist, '2026-11-17');
  const byName = Object.fromEntries(detail.meals.map((m) => [m.name, m]));
  assert.equal(byName['Filetti di merluzzo'].fibre, 0);
  assert.equal(byName['Uovo sodo'].fibre, null);
  assert.ok(detail.coverage.foodsMissingFibre.includes('Uovo sodo'));
  assert.ok(byName['Pesto rosso'].sodiumMg > 200);
  assert.equal(byName['Wudy al Formaggio'].sodiumMg, null);
  assert.ok(detail.coverage.foodsMissingSodium.includes('Wudy al Formaggio'));
  assert.ok(byName['Pane integrale'].sodiumMg > 200);
});

test('buildEvenings: max 90 giorni e riga compatta', () => {
  assert.throws(() => assertEveningsRange('2026-01-01', '2026-05-01'), /90/);
  const hist = {
    ...historyWithDay('2026-11-08', {
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
      ],
      manualNodes: [{ type: 'water', ml: 400, time: 22 }],
    }),
    ...historyWithDay('2026-11-09', {
      log: [
        {
          type: 'sleep',
          hours: 6.5,
          wakeTime: 7,
          quality: 3,
          notes: 'bagno',
        },
      ],
    }),
  };
  const out = buildEvenings(hist, '2026-11-08', '2026-11-08');
  assert.equal(out.days, 1);
  const row = out.evenings[0];
  assert.equal(row.dinnerKcal, 400);
  assert.equal(row.dinnerSodiumMg, 900);
  assert.equal(row.dinnerSodiumIncomplete, false);
  assert.equal(row.dinnerSodiumCoverage.known, 1);
  assert.equal(row.liquidsAfter18Ml, 400);
  assert.equal(row.night.qualityStars, 3);
  assert.equal(row.night.notes, 'bagno');
  assert.equal(row.night.hours, 6.5);
  assert.ok(row.hoursBeforeSleep != null);
});

test('buildEvenings: sodio cena null se copertura grammi < 70%', () => {
  const hist = historyWithDay('2026-11-20', {
    log: [
      {
        type: 'meal',
        mealId: 'cena',
        items: [
          { type: 'food', name: 'Fagiolini', mealType: 'cena', mealTime: 20, grams: 80, na: 5, fibre: 2 },
          { type: 'food', name: 'Merluzzo', mealType: 'cena', mealTime: 20, grams: 200 },
          { type: 'food', name: 'Cavolfiore', mealType: 'cena', mealTime: 20, grams: 150 },
          { type: 'food', name: 'Riso', mealType: 'cena', mealTime: 20, grams: 80 },
          { type: 'food', name: 'Olio', mealType: 'cena', mealTime: 20, grams: 10 },
        ],
      },
    ],
  });
  const detail = buildDayMealsDetail(hist, '2026-11-20');
  assert.equal(detail.totals.sodiumMg, null);
  assert.equal(detail.totals.sodiumIncomplete, true);
  assert.equal(detail.totals.sodiumNote, 'dati insufficienti');
  assert.equal(detail.totals.sodiumCoverage.known, 1);
  assert.equal(detail.totals.sodiumCoverage.missing, 4);

  const out = buildEvenings(hist, '2026-11-20', '2026-11-20');
  const row = out.evenings[0];
  assert.equal(row.dinnerSodiumMg, null);
  assert.equal(row.dinnerSodiumIncomplete, true);
  assert.equal(row.dinnerSodiumNote, 'dati insufficienti');
  assert.equal(row.dinnerSodiumCoverage.known, 1);
  assert.equal(row.dinnerSodiumCoverage.missing, 4);
});

test('minerals Home: sodio parziale → incompleto', async () => {
  const { mineralsDataComplete } = await import('../../../src/utils/microNutrientCompleteness.js');
  const log = [
    { type: 'food', name: 'Fagiolini', grams: 80, na: 5, k: 100 },
    { type: 'food', name: 'Merluzzo', grams: 200 },
    { type: 'food', name: 'Cavolfiore', grams: 150 },
    { type: 'food', name: 'Riso', grams: 80 },
    { type: 'food', name: 'Olio', grams: 10 },
  ];
  assert.equal(mineralsDataComplete(log), false);
});
