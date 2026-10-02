import assert from 'node:assert/strict';
import { test } from 'node:test';

import { projectDayNutrition } from '../../../mealEngine/projectDayNutrition.js';
import { serializeInboxDraftItem } from '../../../../utils/mealDraftStatus.js';
import { interpretAssistedMealInput, QUANTITY_SOURCE } from '../assistedMealPipeline.js';
import {
  buildVoiceInboxItemsFromAssistedDraft,
  confirmQuantitySourceAfterManualEdit,
  formatAssistedGramsLabel,
  isEstimatedQuantitySource,
} from '../assistedQuantityPresentation.js';

const TARGETS = { kcal: 2000, prot: 150, carb: 200, fat: 70 };

test('Step5 Caso 1 — 150 g pollo explicit: nessun indicatore stima', async () => {
  const draft = await interpretAssistedMealInput('150 g pollo', { source: 'text' });
  const item = draft.items[0];
  assert.equal(item.quantitySource, QUANTITY_SOURCE.explicit);
  assert.equal(formatAssistedGramsLabel(item.grams, item.quantitySource), '150 g');
  assert.equal(isEstimatedQuantitySource(item.quantitySource), false);
  assert.equal(String(formatAssistedGramsLabel(item.grams, item.quantitySource)).includes('~'), false);
});

test('Step5 Caso 2 — cucchiaio olio household: nessun indicatore stima', async () => {
  const draft = await interpretAssistedMealInput("un cucchiaio d'olio", { source: 'text' });
  const item = draft.items[0];
  assert.equal(item.grams, 10);
  assert.equal(item.quantitySource, QUANTITY_SOURCE.household);
  assert.equal(formatAssistedGramsLabel(item.grams, item.quantitySource), '10 g');
  assert.equal(isEstimatedQuantitySource(item.quantitySource), false);
});

test('Step5 Caso 3 — una mela: porzione supportata, non stima', async () => {
  const draft = await interpretAssistedMealInput('una mela', { source: 'text' });
  const item = draft.items[0];
  assert.equal(item.grams, 150);
  assert.ok(item.quantitySource === QUANTITY_SOURCE.household || item.quantitySource === QUANTITY_SOURCE.database);
  assert.equal(formatAssistedGramsLabel(item.grams, item.quantitySource), '150 g');
  assert.equal(isEstimatedQuantitySource(item.quantitySource), false);
});

test('Step5 Caso 4 — pasta estimated: ~200 g', async () => {
  const draft = await interpretAssistedMealInput('pasta', { source: 'text' });
  const item = draft.items[0];
  assert.equal(item.grams, 200);
  assert.equal(item.quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(formatAssistedGramsLabel(item.grams, item.quantitySource), '~200 g');
  assert.equal(isEstimatedQuantitySource(item.quantitySource), true);
});

test('Step5 Caso 5 — edit manuale 100→80: non più estimated', () => {
  const after = {
    foodName: 'pasta',
    grams: 80,
    quantitySource: confirmQuantitySourceAfterManualEdit(),
    isEstimated: false,
  };
  assert.equal(after.quantitySource, QUANTITY_SOURCE.explicit);
  assert.equal(isEstimatedQuantitySource(after.quantitySource), false);
  assert.equal(formatAssistedGramsLabel(after.grams, after.quantitySource), '80 g');
});

test('Step5 Caso 6 — stesso transcript testo/voce: stessa UI quantità', async () => {
  const textDraft = await interpretAssistedMealInput('pasta', { source: 'text' });
  const voiceDraft = await interpretAssistedMealInput('pasta', { source: 'voice' });
  assert.equal(
    formatAssistedGramsLabel(textDraft.items[0].grams, textDraft.items[0].quantitySource),
    formatAssistedGramsLabel(voiceDraft.items[0].grams, voiceDraft.items[0].quantitySource),
  );
  assert.equal(textDraft.items[0].quantitySource, voiceDraft.items[0].quantitySource);
});

test('Step5 Caso 7 — modifica grammi aggiorna projection', () => {
  const before = projectDayNutrition({
    currentDailyLog: [],
    draftMeal: [{ type: 'food', kcal: 200, prot: 7, carb: 40, fat: 1 }],
    effectiveTargets: TARGETS,
  });
  const after = projectDayNutrition({
    currentDailyLog: [],
    draftMeal: [{ type: 'food', kcal: 160, prot: 5.6, carb: 32, fat: 0.8 }],
    effectiveTargets: TARGETS,
  });
  assert.equal(before.meal.kcal, 200);
  assert.equal(after.meal.kcal, 160);
  assert.notEqual(after.remaining.kcal, before.remaining.kcal);
  assert.equal(after.after.kcal, after.meal.kcal);
});

test('Step5 Caso 8 — Inbox vocale: nessun hardcode grams 1', async () => {
  const draft = await interpretAssistedMealInput('ho mangiato pasta', { source: 'voice' });
  const inboxItems = buildVoiceInboxItemsFromAssistedDraft(draft, 1);
  assert.ok(inboxItems.length >= 1);
  const serialized = serializeInboxDraftItem(inboxItems[0]);
  assert.notEqual(serialized.grams, 1);
  assert.equal(serialized.grams, 200);
  assert.equal(serialized.quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(serialized.status, 'pending');

  const unknown = serializeInboxDraftItem({ foodName: 'appunto grezzo', status: 'pending' });
  assert.equal(unknown.grams, undefined);
  assert.notEqual(unknown.grams, 1);
});

test('Step5 Caso 9 — inbox unresolved non entra nei totali', () => {
  const p = projectDayNutrition({
    currentDailyLog: [
      {
        type: 'inbox_draft',
        kcal: 9999,
        items: [{ foodName: 'pasta', grams: 100, kcal: 350, status: 'pending' }],
      },
      {
        type: 'food',
        mealType: 'pranzo',
        kcal: 500,
        prot: 40,
        carb: 10,
        fat: 20,
        status: 'raw',
      },
      {
        type: 'food',
        mealType: 'colazione',
        kcal: 400,
        prot: 20,
        carb: 40,
        fat: 10,
        status: 'resolved',
      },
    ],
    draftMeal: [],
    effectiveTargets: TARGETS,
  });
  assert.equal(p.before.kcal, 400);
  assert.equal(p.meal.kcal, 0);
});

test('Step5 user-history e database non usano tilde', () => {
  assert.equal(formatAssistedGramsLabel(170, QUANTITY_SOURCE.userHistory), '170 g');
  assert.equal(formatAssistedGramsLabel(125, QUANTITY_SOURCE.database), '125 g');
  assert.equal(isEstimatedQuantitySource(QUANTITY_SOURCE.userHistory), false);
  assert.equal(isEstimatedQuantitySource(QUANTITY_SOURCE.database), false);
});
