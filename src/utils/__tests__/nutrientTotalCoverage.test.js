import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeNutrientTotalByGrams,
} from '../nutrientTotalCoverage.js';

test('somma completa se ≥70% grammi noti', () => {
  const r = summarizeNutrientTotalByGrams(
    [
      { grams: 80, na: 5 },
      { grams: 20, na: 10 },
    ],
    {
      getGrams: (i) => i.grams,
      getValue: (i) => i.na ?? null,
    },
  );
  assert.equal(r.value, 15);
  assert.equal(r.incomplete, false);
  assert.equal(r.note, null);
});

test('null + dati insufficienti se <70% grammi noti', () => {
  const r = summarizeNutrientTotalByGrams(
    [
      { grams: 80, na: 5 },
      { grams: 200 },
      { grams: 150 },
      { grams: 80 },
      { grams: 10 },
    ],
    {
      getGrams: (i) => i.grams,
      getValue: (i) => i.na ?? null,
    },
  );
  assert.equal(r.value, null);
  assert.equal(r.incomplete, true);
  assert.equal(r.note, 'dati insufficienti');
  assert.equal(r.coverage.known, 1);
  assert.equal(r.coverage.missing, 4);
});
