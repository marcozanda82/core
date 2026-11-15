import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSensitiveNumbers } from '../redact.js';

test('redactSensitiveNumbers azzera kcal/peso/grammi', () => {
  const out = redactSensitiveNumbers({
    score: 0.8,
    meals: [{ name: 'Pasta', kcal: 400, grams: 100 }],
    weight: 72,
  });
  assert.equal(out.score, 0.8);
  assert.equal(out.weight, null);
  assert.equal(out.meals[0].name, 'Pasta');
  assert.equal(out.meals[0].kcal, null);
  assert.equal(out.meals[0].grams, null);
});
