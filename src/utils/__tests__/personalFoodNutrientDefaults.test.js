import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGETS } from '../computeTotaliCore.js';
import {
  fillMissingPersonalFoodNutrients,
  UNKNOWN_SODIUM_KEYS,
} from '../personalFoodNutrientDefaults.js';

test('nessun default inventato: na/sale/fibre/ca restano assenti', () => {
  const entry = {
    desc: 'Alimento etichetta',
    kcal: 120,
    prot: 5,
    carb: 10,
    fatTotal: 4,
  };
  fillMissingPersonalFoodNutrients(
    entry,
    (key) => (key === 'na' ? 500 : key === 'fibre' ? 7.5 : key === 'ca' ? 250 : 1),
    TARGETS,
  );
  assert.equal(entry.na, undefined);
  assert.equal(entry.sale, undefined);
  assert.equal(entry.fibre, undefined);
  assert.equal(entry.ca, undefined);
  assert.equal(entry.vitc, undefined);
  assert.equal(entry.omega3, undefined);
  assert.ok(UNKNOWN_SODIUM_KEYS.includes('na'));
});

test('valori già presenti non vengono toccati', () => {
  const entry = { desc: 'Mela', na: 2, fibre: 2.4, ca: 6 };
  fillMissingPersonalFoodNutrients(entry, () => 999, TARGETS);
  assert.equal(entry.na, 2);
  assert.equal(entry.fibre, 2.4);
  assert.equal(entry.ca, 6);
});
