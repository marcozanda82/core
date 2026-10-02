import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeTotali } from '../../../useBiochimico.js';
import { projectDayNutrition } from '../projectDayNutrition.js';
import {
  toCanonicalDiaryFoodItem,
  buildCanonicalMealCommitPayload,
  nutritionPayloadEquals,
  isCanonicalPersistableResolvedFood,
  isLegacyGrams1Placeholder,
} from '../canonicalMealCommit.js';

const POLLO_ROW = {
  desc: 'Petto di pollo',
  kcal: 110,
  prot: 23.1,
  carb: 0,
  fatTotal: 1.2,
  fat: 1.2,
  fibre: 0,
  vitc: 0,
  mg: 28,
};

const PASTA_ROW = {
  desc: 'Pasta di semola',
  kcal: 350,
  prot: 13,
  carb: 70,
  fatTotal: 1.5,
  fat: 1.5,
  fibre: 3,
  mg: 18,
};

const OLIO_ROW = {
  desc: 'Olio extravergine',
  kcal: 884,
  prot: 0,
  carb: 0,
  fatTotal: 100,
  fat: 100,
  fibre: 0,
};

function manualFood(row, grams, extra = {}) {
  return {
    type: 'food',
    desc: row.desc,
    name: row.desc,
    foodDbKey: extra.foodDbKey,
    qta: grams,
    weight: grams,
    row,
    ...extra,
  };
}

function assistedFood(row, grams, extra = {}) {
  const factor = grams / 100;
  return {
    foodName: row.desc,
    name: row.desc,
    foodDbKey: extra.foodDbKey,
    grams,
    status: extra.status ?? 'resolved',
    kcal: Math.round((Number(row.kcal) || 0) * factor),
    pro: Math.round(((Number(row.prot) || 0) * factor) * 10) / 10,
    carbo: Math.round(((Number(row.carb) || 0) * factor) * 10) / 10,
    fat: Math.round(((Number(row.fatTotal) || 0) * factor) * 10) / 10,
    row,
    ...extra,
  };
}

test('1. 150 g pollo Manuale vs Assistito: payload nutrizionale identico', () => {
  const manual = toCanonicalDiaryFoodItem({
    food: manualFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' }),
    grams: 150,
    sourceMetadata: { entrySource: 'ui' },
  });
  const assisted = toCanonicalDiaryFoodItem({
    food: assistedFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' }),
    grams: 150,
    sourceMetadata: { entrySource: 'chat' },
  });
  assert.ok(manual);
  assert.ok(assisted);
  assert.equal(manual.qta, 150);
  assert.equal(assisted.qta, 150);
  assert.equal(manual.kcal, assisted.kcal);
  assert.equal(manual.prot, assisted.prot);
  assert.equal(manual.carb, assisted.carb);
  assert.equal(manual.fat, assisted.fat);
  assert.equal(manual.fatTotal, assisted.fatTotal);
  assert.ok(nutritionPayloadEquals(manual, assisted));
  assert.equal(manual.entrySource, 'ui');
  assert.equal(assisted.entrySource, 'chat');
});

test('2. pasta 120 + pollo 150 + olio 10: tre item equivalenti', () => {
  const specs = [
    [PASTA_ROW, 120, 'pasta_semola'],
    [POLLO_ROW, 150, 'pollo_petto'],
    [OLIO_ROW, 10, 'olio_evo'],
  ];
  const manualItems = specs.map(([row, g, key]) => toCanonicalDiaryFoodItem({
    food: manualFood(row, g, { foodDbKey: key }),
    grams: g,
    sourceMetadata: { entrySource: 'ui' },
  }));
  const assistedItems = specs.map(([row, g, key]) => toCanonicalDiaryFoodItem({
    food: assistedFood(row, g, { foodDbKey: key }),
    grams: g,
    sourceMetadata: { entrySource: 'chat' },
  }));
  assert.equal(manualItems.length, 3);
  manualItems.forEach((item, i) => {
    assert.ok(nutritionPayloadEquals(item, assistedItems[i]));
  });
});

test('3. stima 100 g corretta a 80 g: il commit persiste 80', () => {
  const food = assistedFood(PASTA_ROW, 80, {
    foodDbKey: 'pasta_semola',
    quantitySource: 'estimated',
  });
  food.quantitySource = 'explicit';
  const item = toCanonicalDiaryFoodItem({ food, grams: 80 });
  assert.equal(item.qta, 80);
  assert.equal(item.grams, 80);
  assert.equal(item.kcal, Math.round(350 * 0.8));
  assert.equal(item.quantitySource, undefined);
});

test('4. stessa riga DB → stessi micronutrienti', () => {
  const manual = toCanonicalDiaryFoodItem({
    food: manualFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' }),
    grams: 150,
  });
  const assisted = toCanonicalDiaryFoodItem({
    food: assistedFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' }),
    grams: 150,
  });
  assert.equal(manual.fibre, assisted.fibre);
  assert.equal(manual.vitc, assisted.vitc);
  assert.equal(manual.mg, assisted.mg);
  assert.equal(manual.mg, Math.round((28 * 1.5) * 10) / 10);
});

test('5. due spuntini distinti: slot id non collidono', () => {
  const snack = assistedFood(POLLO_ROW, 100, { foodDbKey: 'pollo_petto' });
  const morning = buildCanonicalMealCommitPayload({
    resolvedItems: [snack],
    mealType: 'snack',
    slotId: 'snack_111',
    mealTime: 10.5,
    sourceMetadata: { entrySource: 'chat' },
  });
  const afternoon = buildCanonicalMealCommitPayload({
    resolvedItems: [snack],
    mealType: 'snack',
    slotId: 'snack_222',
    mealTime: 16.5,
    sourceMetadata: { entrySource: 'chat' },
  });
  assert.equal(morning.slotId, 'snack_111');
  assert.equal(afternoon.slotId, 'snack_222');
  assert.notEqual(morning.slotId, afternoon.slotId);
  assert.equal(morning.items[0].mealType, 'snack_111');
  assert.equal(afternoon.items[0].mealType, 'snack_222');
});

test('6. edit pasto esistente: stesso slotId, nessun nuovo slot', () => {
  const original = buildCanonicalMealCommitPayload({
    resolvedItems: [assistedFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto', id: 'f_1' })],
    mealType: 'pranzo',
    slotId: 'pranzo_999',
    mealTime: 13,
  });
  const edited = buildCanonicalMealCommitPayload({
    resolvedItems: [assistedFood(POLLO_ROW, 180, { foodDbKey: 'pollo_petto', id: 'f_1' })],
    mealType: 'pranzo',
    slotId: 'pranzo_999',
    mealTime: 13,
  });
  assert.equal(original.slotId, edited.slotId);
  assert.equal(edited.items.length, 1);
  assert.equal(edited.items[0].qta, 180);
  assert.equal(edited.items[0].foodDbKey, 'pollo_petto');
});

test('7. ADD_FOOD chat vs SAVE_MCDRIVE: stesso resolved input → stesso item', () => {
  const resolved = assistedFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' });
  const addFood = toCanonicalDiaryFoodItem({
    food: { ...resolved, qty: 150 },
    grams: 150,
    sourceMetadata: { entrySource: 'chat' },
  });
  const mcdrive = toCanonicalDiaryFoodItem({
    food: resolved,
    grams: resolved.grams,
    sourceMetadata: { entrySource: 'chat' },
  });
  assert.ok(nutritionPayloadEquals(addFood, mcdrive));
});

test('8. unresolved/pending non diventa canonical persistibile', () => {
  const pending = {
    foodName: 'Petto di pollo',
    foodDbKey: 'pollo_petto',
    grams: 150,
    status: 'pending',
    row: POLLO_ROW,
  };
  assert.equal(isCanonicalPersistableResolvedFood(pending, 150), false);
  assert.equal(toCanonicalDiaryFoodItem({ food: pending, grams: 150 }), null);
  const raw = { foodName: 'pasta', grams: 80, status: 'raw' };
  assert.equal(toCanonicalDiaryFoodItem({ food: raw, grams: 80 }), null);
});

test('9. placeholder 1 g legacy non viene promosso solo perché grams === 1', () => {
  const placeholder = {
    type: 'inbox_draft',
    name: 'pasta',
    grams: 1,
    kcal: 0,
  };
  assert.equal(isLegacyGrams1Placeholder(placeholder, 1), true);
  assert.equal(toCanonicalDiaryFoodItem({ food: placeholder, grams: 1 }), null);

  const noKeyOneGram = { name: 'pasta', grams: 1, kcal: 0 };
  assert.equal(toCanonicalDiaryFoodItem({ food: noKeyOneGram, grams: 1 }), null);

  const realSalt = toCanonicalDiaryFoodItem({
    food: {
      name: 'Sale',
      foodDbKey: 'sale_fino',
      grams: 1,
      status: 'resolved',
      row: { desc: 'Sale', kcal: 0, prot: 0, carb: 0, fatTotal: 0, na: 38700 },
    },
    grams: 1,
  });
  assert.ok(realSalt);
  assert.equal(realSalt.qta, 1);
  assert.equal(realSalt.foodDbKey, 'sale_fino');
});

test('10. projection.after === computeTotali dopo commit (kcal/P/C/F)', () => {
  const logBefore = [{
    type: 'food',
    mealType: 'colazione',
    kcal: 400,
    prot: 20,
    carb: 50,
    fat: 10,
    fatTotal: 10,
  }];
  const draft = [
    assistedFood(PASTA_ROW, 120, { foodDbKey: 'pasta_semola' }),
    assistedFood(POLLO_ROW, 150, { foodDbKey: 'pollo_petto' }),
    assistedFood(OLIO_ROW, 10, { foodDbKey: 'olio_evo' }),
  ];
  const projection = projectDayNutrition({
    effectiveTargets: { kcal: 2000, prot: 150, carb: 200, fat: 60 },
    currentDailyLog: logBefore,
    draftMeal: draft,
  });
  const committed = draft.map((food) => toCanonicalDiaryFoodItem({
    food,
    grams: food.grams,
    mealContext: { mealType: 'pranzo', mealTime: 13 },
    sourceMetadata: { entrySource: 'chat' },
  }));
  const totali = computeTotali([...logBefore, ...committed]);
  assert.equal(projection.after.kcal, Math.round(Number(totali.kcal) || 0));
  assert.equal(projection.after.prot, Math.round((Number(totali.prot) || 0) * 10) / 10);
  assert.equal(projection.after.carb, Math.round((Number(totali.carb) || 0) * 10) / 10);
  assert.equal(projection.after.fat, Math.round((Number(totali.fatTotal ?? totali.fat) || 0) * 10) / 10);
});
