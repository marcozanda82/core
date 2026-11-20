import assert from 'node:assert/strict';
import test from 'node:test';
import { readFibreGrams, readSodiumMg } from '../nutrientRead.js';

test('fibre: preferisce fibreTotali anche se 0', () => {
  assert.equal(readFibreGrams({ name: 'Merluzzo', fibre: 16.5, fibreTotali: 0 }).value, 0);
  assert.equal(readFibreGrams({ name: 'Passata', fibre: 7.5, fibreTotali: 1.2 }).value, 1.2);
});

test('fibre: animale con fibre>0 → null', () => {
  const r = readFibreGrams({ name: 'Uovo sodo', fibre: 15 });
  assert.equal(r.value, null);
  assert.equal(r.reason, 'animal_fibre_suspicious');
});

test('sodio: 0 → null; sale; unità dichiarata (niente na<5 ×1000)', () => {
  assert.equal(readSodiumMg({ name: 'Wudy', na: 0 }).value, null);
  assert.ok(readSodiumMg({ name: 'Pane', na: 0, sale: 0.7 }).value > 200);
  // na già in mg (frutta): non moltiplicare ×1000
  assert.equal(readSodiumMg({ name: 'Mela', na: 0.75 }).value, 0.75);
  // unità g dichiarata → mg
  assert.equal(readSodiumMg({ name: 'Pesto', na: 0.3, naUnit: 'g' }).value, 300);
});
