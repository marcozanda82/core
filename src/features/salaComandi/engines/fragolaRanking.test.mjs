/**
 * Test ranking mono-parola (fragola/mela) vs composti.
 * node src/features/salaComandi/engines/fragolaRanking.test.mjs
 */
import assert from 'node:assert';
import {
  compoundCarrierConfidencePenalty,
  isStrictBaseFoodLabelForVariants,
  simpleIngredientConfidenceBoost,
  strictSingleWordBaseMatchConfidence,
} from './italianFoodVariants.js';

const variantsFrag = ['fragola', 'fragole'];

function assertFreshPreferred(query) {
  const gel = 'gelato alla fragola';
  const fruit = 'fragole, crude';
  const penG = compoundCarrierConfidencePenalty(gel, query);
  const penF = compoundCarrierConfidencePenalty(fruit, query);
  const boG = simpleIngredientConfidenceBoost(gel, query);
  const boF = simpleIngredientConfidenceBoost(fruit, query);
  assert.ok(penG > penF, `${query}: penalità gelato (${penG}) > frutta (${penF})`);
  assert.ok(boF > boG, `${query}: boost frutta (${boF}) > gelato (${boG})`);

  assert.ok(
    !isStrictBaseFoodLabelForVariants(gel, new Set(variantsFrag)),
    `${query}: gelato non è label base`,
  );
  assert.ok(
    isStrictBaseFoodLabelForVariants(fruit, new Set(variantsFrag)),
    `${query}: fragole crude è base`,
  );
  assert.ok(
    strictSingleWordBaseMatchConfidence(fruit, query, variantsFrag) >= 0.93,
    'confidence strict frutta',
  );
}

assertFreshPreferred('fragola');
assertFreshPreferred('fragole');

const variantsMela = ['mela', 'mele'];
assert.ok(isStrictBaseFoodLabelForVariants('mele', new Set(variantsMela)));
assert.ok(isStrictBaseFoodLabelForVariants('mele, crude', new Set(variantsMela)));
assert.ok(!isStrictBaseFoodLabelForVariants('marmellata di mele', new Set(variantsMela)));

const variantsBanana = ['banana', 'banane'];
assert.ok(isStrictBaseFoodLabelForVariants('banane', new Set(variantsBanana)));

console.log('fragolaRanking.test.mjs OK');
