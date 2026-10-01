import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeEffectiveDailyTargetKcal } from '../computeEffectiveDailyTargetKcal.js';
import { MACRO_VS_TARGET_MARGIN_RATIO } from '../classifyMacroVsTarget.js';
import { projectDayNutrition } from '../projectDayNutrition.js';

const TARGET = { kcal: 2000, prot: 150, carb: 200, fat: 60 };

function food(mealType, macros, extra = {}) {
  return {
    type: 'food',
    mealType,
    kcal: macros.kcal,
    prot: macros.prot ?? 0,
    carb: macros.carb ?? 0,
    fat: macros.fat ?? 0,
    fatTotal: macros.fat ?? 0,
    mealTime: extra.mealTime,
    status: extra.status,
  };
}

test('soglia status Projection Engine = McDrive ±10%', () => {
  assert.equal(MACRO_VS_TARGET_MARGIN_RATIO, 0.1);
});

test('1. giornata vuota, draft vuoto', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [],
    draftMeal: [],
  });
  assert.deepEqual(p.before, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.deepEqual(p.meal, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.deepEqual(p.after, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.deepEqual(p.remaining, { kcal: 2000, prot: 150, carb: 200, fat: 60 });
  assert.equal(p.status.kcal, 'under');
});

test('2. before + draft normale (caso 2G)', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [
      food('colazione', { kcal: 400, prot: 30, carb: 50, fat: 15 }),
      food('pranzo', { kcal: 800, prot: 50, carb: 70, fat: 25 }),
    ],
    draftMeal: [
      { type: 'food', kcal: 600, prot: 45, carb: 55, fat: 15 },
    ],
  });
  assert.deepEqual(p.before, { kcal: 1200, prot: 80, carb: 120, fat: 40 });
  assert.deepEqual(p.meal, { kcal: 600, prot: 45, carb: 55, fat: 15 });
  assert.deepEqual(p.after, { kcal: 1800, prot: 125, carb: 175, fat: 55 });
  assert.deepEqual(p.remaining, { kcal: 200, prot: 25, carb: 25, fat: 5 });
  assert.equal(p.gapRatio.prot, 0.1667);
});

test('3. over target, remaining negativo (caso 2H)', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [
      food('pranzo', { kcal: 1700, prot: 130, carb: 170, fat: 55 }),
    ],
    draftMeal: [
      { kcal: 500, prot: 35, carb: 50, fat: 20 },
    ],
  });
  assert.deepEqual(p.after, { kcal: 2200, prot: 165, carb: 220, fat: 75 });
  assert.deepEqual(p.remaining, { kcal: -200, prot: -15, carb: -20, fat: -15 });
  assert.ok(p.remaining.kcal < 0);
  assert.ok(p.remaining.prot < 0);
});

test('4. editing cena: BEFORE esclude la cena originale', () => {
  const log = [
    food('colazione', { kcal: 400 }, { mealTime: 8 }),
    food('pranzo', { kcal: 700 }, { mealTime: 13 }),
    food('cena', { kcal: 600 }, { mealTime: 20 }),
  ];
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: log,
    draftMeal: [{ kcal: 750, prot: 0, carb: 0, fat: 0 }],
    editingContext: { slotItems: [food('cena', { kcal: 600 }, { mealTime: 20 })] },
  });
  assert.equal(p.before.kcal, 1100);
  assert.equal(p.meal.kcal, 750);
  assert.equal(p.after.kcal, 1850);
});

test('5. editing pranzo', () => {
  const log = [
    food('colazione', { kcal: 400 }, { mealTime: 8 }),
    food('pranzo', { kcal: 700 }, { mealTime: 13 }),
    food('cena', { kcal: 600 }, { mealTime: 20 }),
  ];
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: log,
    draftMeal: [{ kcal: 500, prot: 40, carb: 40, fat: 10 }],
    editingContext: { slotItems: [food('pranzo', { kcal: 700 }, { mealTime: 13 })] },
  });
  assert.equal(p.before.kcal, 1000);
  assert.equal(p.meal.kcal, 500);
  assert.equal(p.after.kcal, 1500);
});

test('6. draft misto resolved + unresolved: unresolved esclusi', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [],
    draftMeal: [
      { type: 'food', status: 'resolved', kcal: 300, prot: 20, carb: 30, fat: 8 },
      { type: 'food', status: 'raw', kcal: 999, prot: 99, carb: 99, fat: 99 },
      { type: 'food', status: 'pending_enrichment', kcal: 80, prot: 5, carb: 10, fat: 2 },
      { type: 'food', status: 'requires_disambiguation', kcal: 50, prot: 4, carb: 6, fat: 1 },
    ],
  });
  assert.deepEqual(p.meal, { kcal: 300, prot: 20, carb: 30, fat: 8 });
  assert.deepEqual(p.after, { kcal: 300, prot: 20, carb: 30, fat: 8 });
});

test('7. invarianza FastMealLogger vs McDrive a parità di nutrienti resolved', () => {
  const log = [food('colazione', { kcal: 400, prot: 20, carb: 40, fat: 10 })];
  const loggerDraft = [
    { type: 'food', desc: 'A', qta: 150, kcal: 210, prot: 18, carb: 12, fat: 6 },
    { type: 'food', desc: 'B', qta: 100, kcal: 130, prot: 8, carb: 20, fat: 3 },
  ];
  const mcDriveDraft = [
    { status: 'resolved', foodName: 'A', grams: 150, kcal: 210, pro: 18, carbo: 12, fat: 6 },
    { status: 'resolved', foodName: 'B', grams: 100, kcal: 130, pro: 8, carbo: 20, fat: 3 },
  ];
  const a = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: log,
    draftMeal: loggerDraft,
  });
  const b = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: log,
    draftMeal: mcDriveDraft,
  });
  assert.deepEqual(a.meal, b.meal);
  assert.deepEqual(a.after, b.after);
  assert.deepEqual(a.remaining, b.remaining);
  assert.deepEqual(a.status, b.status);
  assert.equal(a.meal.kcal, 340);
});

test('8. target effettivo con Ghost già incluso', () => {
  const effective = computeEffectiveDailyTargetKcal({
    settingsBaseKcal: 2456,
    autopilotKcal: 177,
  });
  assert.equal(effective, 2633);
  const p = projectDayNutrition({
    effectiveTargets: { kcal: effective, prot: 150, carb: 200, fat: 60 },
    currentDailyLog: [food('pranzo', { kcal: 633 })],
    draftMeal: [{ kcal: 1000, prot: 0, carb: 0, fat: 0 }],
  });
  assert.equal(p.target.kcal, 2633);
  assert.equal(p.after.kcal, 1633);
  assert.equal(p.remaining.kcal, 1000);
});

test('9. draft vuoto con consumo già presente', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [food('colazione', { kcal: 500, prot: 20, carb: 40, fat: 10 })],
    draftMeal: [],
  });
  assert.deepEqual(p.meal, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.equal(p.after.kcal, 500);
  assert.equal(p.remaining.kcal, 1500);
});

test('10. valori nutrizionali zero', () => {
  const p = projectDayNutrition({
    effectiveTargets: { kcal: 0, prot: 0, carb: 0, fat: 0 },
    currentDailyLog: [],
    draftMeal: [{ kcal: 0, prot: 0, carb: 0, fat: 0, status: 'resolved' }],
  });
  assert.deepEqual(p.after, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.deepEqual(p.remaining, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  assert.equal(p.status.kcal, 'neutral');
  assert.equal(p.gapRatio.prot, null);
});

test('cena non ha formula speciale: stessa addizione della giornata', () => {
  const p = projectDayNutrition({
    effectiveTargets: TARGET,
    currentDailyLog: [food('pranzo', { kcal: 1000 })],
    draftMeal: [{ mealType: 'cena', kcal: 400, prot: 30, carb: 40, fat: 10 }],
  });
  assert.equal(p.after.kcal, 1400);
  assert.equal(p.remaining.kcal, 600);
});
