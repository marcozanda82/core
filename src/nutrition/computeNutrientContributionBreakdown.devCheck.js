/**
 * Smoke check manuale (dev): non importare dall’app.
 *
 * Esempio: dalla root progetto, con tooling che supporta ESM:
 *   node --experimental-vm-modules src/nutrition/computeNutrientContributionBreakdown.devCheck.js
 * Oppure incollare `runComputeNutrientContributionBreakdownDevCheck()` in console dev.
 */

import { computeNutrientContributionBreakdown } from './computeNutrientContributionBreakdown.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

export function runComputeNutrientContributionBreakdownDevCheck() {
  const foods = [
    { id: 'a', name: 'Pollo', qty: 150, prot: 35, kcal: 200 },
    { id: 'b', name: 'Riso', qty: 100, prot: 7, kcal: 130 },
    null,
    { id: 'badqty', name: 'Zero g', qty: 0, prot: 10 },
    { name: 'Implicit portion', prot: 8 },
    { id: 'nan', name: 'Bad prot', qty: 50, prot: Number.NaN },
  ];

  const p = computeNutrientContributionBreakdown(foods, 'protein');
  assert(p.nutrientKey === 'protein', 'preserva nutrientKey richiesto');
  assert(p.totalNutrientAmount === 35 + 7 + 8, 'total prot');
  assert(p.items.length === 3, 'solo righe valide');
  assert(p.items[0].foodId === 'a' && p.items[0].contributionPct > 60, 'ordine DESC');
  assert(Math.abs(p.items.reduce((s, i) => i.contributionPct + s, 0) - 100) < 0.05, 'pct ~100');

  const alias = computeNutrientContributionBreakdown(
    [
      { id: '1', name: 'X', qty: 100, fibre: 4 },
      { id: '2', name: 'Y', qty: 100, fibre: 6 },
    ],
    'fiber',
  );
  assert(alias.totalNutrientAmount === 10, 'alias fiber → fibre');

  const sug = computeNutrientContributionBreakdown(
    [{ id: 'z', name: 'Barretta', qty: 40, zuccheri: 5 }],
    'sugars',
  );
  assert(sug.totalNutrientAmount === 5 && sug.items[0].nutrientAmount === 5, 'zuccheri');

  const zero = computeNutrientContributionBreakdown([{ id: 'z', name: 'N', qty: 10, prot: 0 }], 'prot');
  assert(zero.items.length === 0 && zero.totalNutrientAmount === 0, 'prot 0 escluso');

  const emptyTotal = computeNutrientContributionBreakdown([], 'kcal');
  assert(emptyTotal.items.length === 0 && emptyTotal.totalNutrientAmount === 0, 'empty');

  const badKey = computeNutrientContributionBreakdown([{ qty: 50, prot: 1 }], '');
  assert(badKey.items.length === 0, 'chiave vuota');

  // eslint-disable-next-line no-console -- dev helper
  console.log('[computeNutrientContributionBreakdown.devCheck] OK');
}
