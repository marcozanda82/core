/**
 * Regressione sodio: niente ×1000 cieco; fresco tipico ≤ 50 mg/100g.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readSodiumMgFromDiaryEntry,
  readSodiumMgPer100FromCatalogRow,
  sodiumValueToMg,
} from '../sodiumUnits.js';
import { buildDayMealsDetail } from '../../../functions/mcp/dayDetail.js';
import { readSodiumMg } from '../../../functions/mcp/nutrientRead.js';

test('lettura diario: na basso in mg non viene ×1000', () => {
  assert.equal(readSodiumMgFromDiaryEntry({ name: 'Mela', na: 3 }).value, 3);
  assert.equal(readSodiumMgFromDiaryEntry({ name: 'Mela', na: 0.75 }).value, 0.75);
  assert.equal(readSodiumMg({ name: 'Kiwi', na: 5 }).value, 5);
  assert.equal(sodiumValueToMg(3, null), 3);
  assert.equal(sodiumValueToMg(3, 'mg'), 3);
  // Solo unità dichiarata g → ×1000
  assert.equal(sodiumValueToMg(0.3, 'g'), 300);
});

test('dayDetail MCP: mela 150g con na salvato 3 → sodiumMg 3 (non 3000)', () => {
  const hist = {
    'trackerStorico_2026-11-20': {
      log: [
        {
          type: 'meal',
          mealId: 'snack_test',
          items: [
            {
              type: 'food',
              name: 'Mela',
              foodDbKey: 'mela',
              grams: 150,
              na: 3,
              kcal: 78,
            },
          ],
        },
      ],
    },
  };
  const detail = buildDayMealsDetail(hist, '2026-11-20');
  assert.equal(detail.meals.length, 1);
  assert.equal(detail.meals[0].sodiumMg, 3);
  assert.equal(detail.meals[0].sodiumUnit, 'mg');
  assert.notEqual(detail.meals[0].sodiumMg, 3000);
});

/** Alimenti freschi tipici a basso Na (fixture post-fix / CREA). */
const FRESH_LOW_SODIUM_FIXTURES = [
  { name: 'Mela', na: 2 },
  { name: 'Kiwi', na: 5 },
  { name: 'Fagiolini', na: 2 },
  { name: 'Peperoni', na: 2 },
  { name: 'Avocado', na: 2 },
  { name: 'Patate', na: 7 },
  { name: 'Cocomero', na: 3 },
  { name: 'Pesca', na: 3 },
  { name: 'Zucchine', na: 1 },
];

test('alimento fresco tipico: sodio catalogo ≤ 50 mg/100g', () => {
  for (const row of FRESH_LOW_SODIUM_FIXTURES) {
    const per100 = readSodiumMgPer100FromCatalogRow(row);
    assert.ok(per100 != null, `${row.name}: na mancante`);
    assert.ok(
      per100 <= 50,
      `${row.name}: sodio ${per100} mg/100g > 50 (sospetto corrotto/×1000)`,
    );
  }
});

test('regressione: se qualcuno moltiplica na<5 ×1000 il test fallisce', () => {
  const raw = 3;
  const wrongHeuristic = raw < 5 ? raw * 1000 : raw;
  const correct = readSodiumMgFromDiaryEntry({ na: raw }).value;
  assert.equal(correct, 3);
  assert.notEqual(correct, wrongHeuristic);
});
