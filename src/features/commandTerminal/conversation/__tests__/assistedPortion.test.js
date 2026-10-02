import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  interpretAssistedMealInput,
  parseAssistedMealLocal,
  QUANTITY_SOURCE,
  serializeAssistedMealDraft,
} from '../assistedMealPipeline.js';
import {
  ESTIMATE_BASIS,
  isPlausibleAssistedPortion,
  readTrustedDbServingGrams,
  resolveAssistedPortion,
} from '../assistedPortionResolver.js';
import { shouldAskMealClarification } from '../shouldAskMealClarification.js';
import { toCanonicalDiaryFoodItem } from '../../../mealEngine/canonicalMealCommit.js';
import { projectDayNutrition } from '../../../mealEngine/projectDayNutrition.js';
import { computeTotali } from '../../../../useBiochimico.js';

test('Caso 1 — olio nudo non è 100 g generici', () => {
  const r = resolveAssistedPortion({ foodName: 'olio' });
  assert.notEqual(r.grams, 100);
  assert.equal(r.grams, 10);
  assert.equal(r.quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(r.estimateBasis, ESTIMATE_BASIS.categoryHeuristic);
});

test('Caso 2 — un cucchiaio d\'olio resta 10 g household', () => {
  const draft = parseAssistedMealLocal("un cucchiaio d'olio");
  assert.equal(draft.items[0].grams, 10);
  assert.equal(draft.items[0].quantitySource, QUANTITY_SOURCE.household);
});

test('Caso 3 — pasta usa euristica pasto 200 g estimated', () => {
  const r = resolveAssistedPortion({ foodName: 'pasta' });
  assert.equal(r.grams, 200);
  assert.equal(r.quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(r.estimateBasis, ESTIMATE_BASIS.categoryHeuristic);
});

test('Caso 4 — pizza margherita: euristica 300 meglio del fallback 100', () => {
  const draft = parseAssistedMealLocal('pizza margherita');
  assert.equal(draft.items[0].grams, 300);
  assert.equal(draft.items[0].quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(draft.items[0].estimateBasis, ESTIMATE_BASIS.categoryHeuristic);
});

test('Caso 5 — carbonara al ristorante: estimated, nessuna domanda', () => {
  const draft = parseAssistedMealLocal('carbonara al ristorante');
  assert.equal(draft.items[0].restaurantGuess, true);
  assert.equal(draft.items[0].quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(shouldAskMealClarification(draft.items[0]).ask, false);
});

test('Caso 6 — history vince sull\'euristica pizza', () => {
  const r = resolveAssistedPortion({
    foodName: 'pizza margherita',
    userPortions: { 'pizza margherita': 350 },
  });
  assert.equal(r.grams, 350);
  assert.equal(r.quantitySource, QUANTITY_SOURCE.userHistory);
});

test('Caso 7 — serving DB numerico valido → database', () => {
  const r = resolveAssistedPortion({
    foodName: 'yogurt greco',
    resolvedFood: { servingGrams: 170, desc: 'Yogurt greco' },
  });
  assert.equal(r.grams, 170);
  assert.equal(r.quantitySource, QUANTITY_SOURCE.database);
  assert.equal(r.estimateBasis, ESTIMATE_BASIS.databaseServing);
});

test('Caso 8 — serving DB stringa non parseabile ignorato', () => {
  assert.equal(readTrustedDbServingGrams({ serving_size: '1 cup (240 ml)' }), null);
  assert.equal(readTrustedDbServingGrams({ servingSize: '1 porzione' }), null);
  const r = resolveAssistedPortion({
    foodName: 'pasta',
    resolvedFood: { serving_size: '1 cup', servingSize: '1 cup' },
  });
  assert.equal(r.quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(r.grams, 200);
});

test('Caso 9 — stima non plausibile scartata, niente clamp', () => {
  assert.equal(isPlausibleAssistedPortion(1), false);
  assert.equal(isPlausibleAssistedPortion(0), false);
  assert.equal(isPlausibleAssistedPortion(-10), false);
  assert.equal(isPlausibleAssistedPortion(9000), false);
  const r = resolveAssistedPortion({
    foodName: 'pasta',
    resolvedFood: { servingGrams: 1 },
  });
  assert.equal(r.grams, 200);
  assert.equal(r.quantitySource, QUANTITY_SOURCE.estimated);
  const huge = resolveAssistedPortion({
    foodName: 'xyzfood',
    resolvedFood: { servingGrams: 50000 },
  });
  assert.equal(huge.grams, 100);
  assert.equal(huge.estimateBasis, ESTIMATE_BASIS.genericFallback);
});

test('Caso 10 — 1000 g pasta esplicita non viene corretta', () => {
  const draft = parseAssistedMealLocal('1000 g pasta');
  assert.equal(draft.items[0].grams, 1000);
  assert.equal(draft.items[0].quantitySource, QUANTITY_SOURCE.explicit);
});

test('Caso 11 — testo/voce stessi grammi sulle nuove stime', async () => {
  for (const phrase of ['olio', 'pasta', 'riso', 'pizza margherita', 'carbonara al ristorante']) {
    const textDraft = await interpretAssistedMealInput(phrase, { source: 'text' });
    const voiceDraft = await interpretAssistedMealInput(phrase, { source: 'voice' });
    assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  }
});

test('Caso 12 — household e una mela restano; projection/commit invarianti', () => {
  const mela = parseAssistedMealLocal('una mela');
  assert.equal(mela.items[0].grams, 150);
  assert.equal(mela.items[0].quantitySource, QUANTITY_SOURCE.household);
  const due = parseAssistedMealLocal('due mele');
  assert.equal(due.items[0].grams, 300);

  const item = toCanonicalDiaryFoodItem({
    food: {
      name: 'Pasta',
      foodDbKey: 'pasta_1',
      grams: 200,
      status: 'resolved',
      row: { desc: 'Pasta', kcal: 350, prot: 13, carb: 70, fatTotal: 1.5 },
    },
    grams: 200,
  });
  const projection = projectDayNutrition({
    effectiveTargets: { kcal: 2000, prot: 150, carb: 200, fat: 60 },
    currentDailyLog: [],
    draftMeal: [item],
  });
  const totali = computeTotali([item]);
  assert.equal(projection.after.kcal, Math.round(Number(totali.kcal) || 0));
  assert.equal(item.estimateBasis, undefined);
});
