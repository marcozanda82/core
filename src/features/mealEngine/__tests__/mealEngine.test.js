import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeEffectiveDailyTargetKcal } from '../computeEffectiveDailyTargetKcal.js';
import { excludeEditingMealSlotFromLog } from '../excludeEditingMealSlotFromLog.js';
import { getDynamicMealTargets } from '../getDynamicMealTargets.js';
import {
  countRemainingNutritionalSlots,
  listCompletedNutritionalSlots,
  NUTRITIONAL_MEAL_SLOTS,
} from '../nutritionalSlots.js';

const MACRO_TARGETS = { prot: 150, carb: 200, fat: 60, fatTotal: 60, fibre: 30 };

function food(mealType, kcal, extra = {}) {
  return {
    type: 'food',
    mealType,
    kcal,
    prot: extra.prot ?? 0,
    carb: extra.carb ?? 0,
    fat: extra.fat ?? 0,
    mealTime: extra.mealTime,
  };
}

function slotTargets(mealType, log, effectiveDailyKcal) {
  return getDynamicMealTargets(mealType, log, { kcal: 2000, ...MACRO_TARGETS }, {
    effectiveDailyKcal,
  });
}

test('NUTRITIONAL_MEAL_SLOTS sono i quattro slot del Meal Engine', () => {
  assert.deepEqual([...NUTRITIONAL_MEAL_SLOTS], ['colazione', 'pranzo', 'snack', 'cena']);
});

test('Caso A: target effettivo 2000, nessun consumo — cena = 2000, dopo vuoto restano 3 slot da pranzo', () => {
  const log = [];
  assert.equal(countRemainingNutritionalSlots(log, 'colazione'), 4);
  assert.equal(countRemainingNutritionalSlots(log, 'pranzo'), 3);
  assert.equal(slotTargets('colazione', log, 2000).kcal, 440);
  assert.equal(slotTargets('pranzo', log, 2000).kcal, Math.max(150, Math.round(2000 / 3)));
  assert.equal(slotTargets('cena', log, 2000).kcal, 2000);
});

test('Caso B: colazione 300 — slot rimanenti da pranzo sono pranzo+snack+cena (3), non 4', () => {
  const log = [food('colazione', 300)];
  const completed = listCompletedNutritionalSlots(log);
  assert.equal(completed.has('colazione'), true);
  assert.equal(completed.size, 1);
  assert.equal(countRemainingNutritionalSlots(log, 'pranzo'), 3);
  assert.equal(slotTargets('pranzo', log, 2000).kcal, Math.max(150, Math.round(1700 / 3)));
});

test('due alimenti nello stesso pranzo contano uno slot, non due', () => {
  const log = [
    food('pranzo', 400, { mealTime: 13 }),
    food('pranzo', 200, { mealTime: 13.5 }),
  ];
  assert.equal(listCompletedNutritionalSlots(log).size, 1);
  assert.equal(countRemainingNutritionalSlots(log, 'snack'), 2);
});

test('spuntino alias e snack_2 completano lo stesso slot snack', () => {
  const log = [food('spuntino', 180), food('snack_2', 40, { mealTime: 17 })];
  assert.deepEqual([...listCompletedNutritionalSlots(log)], ['snack']);
});

test('slot saltato: solo cena in arrivo, colazione/pranzo/snack non assorbono budget', () => {
  assert.equal(countRemainingNutritionalSlots([], 'cena'), 1);
});

test('Caso C: 300+1000+400 su 2000 → cena = 300', () => {
  const log = [
    food('colazione', 300),
    food('pranzo', 1000),
    food('spuntino', 400),
  ];
  assert.equal(countRemainingNutritionalSlots(log, 'cena'), 1);
  assert.equal(slotTargets('cena', log, 2000).kcal, 300);
});

test('Caso D: Ghost nel target effettivo 2633, consumato 1900 → cena 733, non 2456', () => {
  const effective = computeEffectiveDailyTargetKcal({
    settingsBaseKcal: 2456,
    burnKcal: 0,
    strategyDeltaKcal: 0,
    compensationKcal: 0,
    autopilotKcal: 177,
  });
  assert.equal(effective, 2633);
  const log = [
    food('colazione', 500),
    food('pranzo', 900),
    food('snack', 500),
  ];
  assert.equal(log.reduce((s, e) => s + e.kcal, 0), 1900);
  assert.equal(slotTargets('cena', log, effective).kcal, 733);
  assert.equal(slotTargets('cena', log, 2456).kcal, 556);
});

test('Caso E: consumato 2700 su 2500 → cena 0, mai negativo', () => {
  const log = [food('pranzo', 2700)];
  const dinner = slotTargets('cena', log, 2500);
  assert.equal(dinner.kcal, 0);
  assert.ok(dinner.kcal >= 0);
});

test('Caso F: editing cena esclude lo slot in modifica dal consumo', () => {
  const log = [
    food('colazione', 500),
    food('pranzo', 900),
    food('snack', 500),
    food('cena', 800, { mealTime: 20 }),
  ];
  const dinnerItems = [food('cena', 800, { mealTime: 20 })];
  const withoutDinner = excludeEditingMealSlotFromLog(log, dinnerItems);
  assert.equal(withoutDinner.filter((e) => e.mealType === 'cena').length, 0);
  const effective = 2633;
  assert.equal(slotTargets('cena', withoutDinner, effective).kcal, 733);
  assert.equal(slotTargets('cena', log, effective).kcal, 0);
});

test('effectiveDailyKcal non duplica strategia/burn se già nel totale', () => {
  const breakfast = getDynamicMealTargets('colazione', [], { kcal: 2456, ...MACRO_TARGETS }, {
    effectiveDailyKcal: 2633,
    calorieStrategy: 'surplus',
    burnedKcalBonus: 400,
  });
  assert.equal(breakfast.kcal, Math.round(2633 * 0.22));
});
