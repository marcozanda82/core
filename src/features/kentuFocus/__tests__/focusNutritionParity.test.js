import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeTotali } from '../../../utils/computeTotaliCore.js';
import {
  collectDayLogForNutrition,
  normalizeFoodEvents,
} from '../normalize/normalizeFoodEvents.js';

function assertMacroParity(log, label) {
  const node = { log, manualNodes: [] };
  const focus = normalizeFoodEvents(node);
  const dayLog = collectDayLogForNutrition(node);
  const kentu = computeTotali(dayLog);
  assert.equal(focus.kentuTotals.kcal, kentu.kcal, `${label}: kcal`);
  assert.equal(focus.kentuTotals.prot, kentu.prot, `${label}: prot`);
  assert.equal(focus.kentuTotals.carb, kentu.carb, `${label}: carb`);
  assert.equal(focus.kentuTotals.fatTotal, kentu.fatTotal, `${label}: fatTotal`);
  assert.equal(focus.kentuTotals.fibre, kentu.fibre, `${label}: fibre`);
  assert.equal(focus.nutrition.totals.kcal.value, Math.round(kentu.kcal * 10) / 10, `${label}: metric kcal`);
  assert.equal(focus.nutrition.totals.proteinG.value, Math.round(kentu.prot * 10) / 10, `${label}: metric prot`);
}

test('parity: alimenti singoli', () => {
  assertMacroParity([
    {
      type: 'food', id: 'a', mealType: 'colazione', kcal: 300, prot: 25, carb: 30, fat: 10, fibre: 5,
    },
    {
      type: 'food', id: 'b', mealType: 'pranzo', kcal: 700, prot: 40, carb: 80, fat: 20, fibre: 8,
    },
  ], 'singoli');
});

test('parity: ricetta come unità', () => {
  assertMacroParity([
    {
      type: 'recipe',
      id: 'r1',
      name: 'Lasagne',
      mealType: 'cena',
      kcal: 850,
      prot: 45,
      carb: 70,
      fatTotal: 35,
      fibre: 6,
    },
  ], 'recipe');
});

test('parity: macro mancanti contano 0 senza inventare', () => {
  const log = [{ type: 'food', id: 'x', mealType: 'snack', kcal: 120 }];
  assertMacroParity(log, 'macro_mancanti');
  const focus = normalizeFoodEvents({ log });
  assert.equal(focus.nutrition.totals.proteinG.value, 0);
  assert.equal(focus.nutrition.totals.carbG.value, 0);
});

test('parity: valori preaggregati fat/fibre alias', () => {
  assertMacroParity([
    {
      type: 'food',
      id: 'y',
      mealType: 'pranzo',
      kcal: 400,
      prot: 30,
      carb: 40,
      fat: 12,
      fiber: 7,
    },
  ], 'alias');
});

test('parity: stimolante con kcal incluso come computeTotali', () => {
  assertMacroParity([
    {
      type: 'food', id: 'f', mealType: 'colazione', kcal: 200, prot: 10, carb: 20, fat: 5, fibre: 1,
    },
    {
      type: 'stimulant', id: 's', kcal: 80, carb: 18, name: 'Cappuccino',
    },
  ], 'stimulant');
});

test('parity: stimolante fasting-safe escluso', () => {
  assertMacroParity([
    {
      type: 'food', id: 'f', mealType: 'colazione', kcal: 200, prot: 10, carb: 20, fat: 5, fibre: 1,
    },
    {
      type: 'stimulant', id: 's', kcal: 2, carb: 0, isFastingSafe: true,
    },
  ], 'stimulant_safe');
});

test('parity: draft unresolved esclusi', () => {
  assertMacroParity([
    {
      type: 'food', id: 'ok', mealType: 'pranzo', kcal: 500, prot: 30, carb: 50, fat: 15, fibre: 4,
    },
    {
      type: 'food',
      id: 'draft',
      status: 'pending_enrichment',
      mealType: 'pranzo',
      kcal: 999,
      prot: 99,
      carb: 99,
      fat: 99,
      fibre: 9,
    },
  ], 'draft');
});

test('parity: duplicati per id — Focus dedupe prima di computeTotali', () => {
  const log = [
    {
      type: 'food', id: 'dup', mealType: 'cena', kcal: 400, prot: 20, carb: 40, fat: 10, fibre: 3,
    },
    {
      type: 'food', id: 'dup', mealType: 'cena', kcal: 400, prot: 20, carb: 40, fat: 10, fibre: 3,
    },
  ];
  const focus = normalizeFoodEvents({ log });
  const kentuOnRaw = computeTotali(log);
  assert.equal(kentuOnRaw.kcal, 800, 'diario grezzo somma duplicati');
  assert.equal(focus.kentuTotals.kcal, 400, 'Focus dedupe id');
  assert.equal(focus.nutrition.foodSummary.itemsLogged, 1);
});

test('giornata senza pasti: totals missing se nessun segnale nutrizionale', () => {
  const focus = normalizeFoodEvents({ log: [], manualNodes: [] });
  assert.equal(focus.hasFood, false);
  assert.equal(focus.nutrition.totals.kcal.provenance, 'missing');
  assert.equal(focus.nutrition.totals.kcal.value, null);
});
