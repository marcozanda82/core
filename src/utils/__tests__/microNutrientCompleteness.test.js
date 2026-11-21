import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mineralsDataComplete,
  vitaminsDataComplete,
} from '../microNutrientCompleteness.js';

test('senza micro noti → dati incompleti', () => {
  const log = [
    { type: 'food', name: 'Uovo', kcal: 70, prot: 6, carb: 0, fat: 5 },
    { type: 'food', name: 'Merluzzo', kcal: 80, prot: 18, carb: 0, fat: 1 },
  ];
  assert.equal(vitaminsDataComplete(log), false);
  assert.equal(mineralsDataComplete(log), false);
});

test('sodio su pochi grammi → minerali incompleti', () => {
  const log = [
    { type: 'food', name: 'Fagiolini', grams: 40, na: 5, k: 50, ca: 10, mg: 5, fe: 1, zn: 0.2 },
    { type: 'food', name: 'Merluzzo', grams: 200 },
    { type: 'food', name: 'Riso', grams: 100 },
  ];
  assert.equal(mineralsDataComplete(log), false);
});

test('con vitamine/minerali presenti → completo', () => {
  const log = [
    {
      type: 'food',
      name: 'Spinaci',
      grams: 100,
      kcal: 20,
      vitc: 30,
      vitA: 400,
      vitK: 200,
      vitB1: 0.1,
      vitB2: 0.2,
      vitB3: 1,
      vitB5: 0.2,
      vitB6: 0.2,
      b9: 100,
      vitB12: 0,
      vitD: 0,
      vitE: 1,
      na: 50,
      k: 400,
      ca: 80,
      mg: 40,
      fe: 2,
      zn: 0.5,
    },
  ];
  assert.equal(vitaminsDataComplete(log), true);
  assert.equal(mineralsDataComplete(log), true);
});
