import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dayNutritionProjectionTitle,
  formatSignedRemainingLabel,
  formatSlotReferenceHint,
  hasCountableProjectedMeal,
  slotReferenceHeading,
} from '../formatDayNutritionRemaining.js';

test('remaining positivo → Restano', () => {
  const kcal = formatSignedRemainingLabel(433, { unit: 'kcal', capitalize: true });
  assert.equal(kcal.kind, 'under');
  assert.equal(kcal.text, 'Restano 433 kcal');
  const prot = formatSignedRemainingLabel(20, { unit: 'g' });
  assert.equal(prot.text, 'restano 20 g');
});

test('remaining zero → Target raggiunto', () => {
  const z = formatSignedRemainingLabel(0, { unit: 'kcal', capitalize: true });
  assert.equal(z.kind, 'met');
  assert.equal(z.text, 'Target raggiunto');
});

test('remaining negativo → valore positivo rispetto al target', () => {
  const kcal = formatSignedRemainingLabel(-167, { unit: 'kcal', capitalize: true });
  assert.equal(kcal.kind, 'over');
  assert.equal(kcal.text, '+167 kcal rispetto al target');
  const fat = formatSignedRemainingLabel(-10, { unit: 'g' });
  assert.equal(fat.text, '+10 g rispetto al target');
  assert.equal(String(fat.text).includes('-'), false);
});

test('cena usa titolo di fine giornata', () => {
  assert.equal(dayNutritionProjectionTitle('cena'), 'Proiezione di fine giornata');
  assert.equal(dayNutritionProjectionTitle('cena_20'), 'Proiezione di fine giornata');
  assert.equal(dayNutritionProjectionTitle('pranzo'), 'Dopo questo pasto');
  assert.equal(dayNutritionProjectionTitle('snack'), 'Dopo questo pasto');
});

test('draft senza nutrienti validi non è proiettabile', () => {
  assert.equal(hasCountableProjectedMeal({
    meal: { kcal: 0, prot: 0, carb: 0, fat: 0 },
  }), false);
  assert.equal(hasCountableProjectedMeal({
    meal: { kcal: 10, prot: 0, carb: 0, fat: 0 },
  }), true);
});

test('riferimento slot: pasto vs chiusura cena', () => {
  assert.equal(slotReferenceHeading('spuntino'), 'Riferimento pasto');
  assert.equal(slotReferenceHeading('pranzo'), 'Riferimento pasto');
  assert.equal(slotReferenceHeading('cena'), 'Per chiudere oggi');
  assert.equal(formatSlotReferenceHint('snack', 250, 'kcal'), 'Riferimento 250 kcal');
  assert.equal(formatSlotReferenceHint('cena', 1124, 'kcal'), '1124 kcal disponibili');
});

test('remaining cena usa Resterebbero se richiesto', () => {
  const kcal = formatSignedRemainingLabel(364, {
    unit: 'kcal',
    capitalize: true,
    positiveVerb: 'Resterebbero',
  });
  assert.equal(kcal.text, 'Resterebbero 364 kcal');
});
