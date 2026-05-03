/**
 * Smoke test manuale per foodCommandEngine (senza UI / SalaComandi / Firebase).
 *
 * La catena JS importa `foodUtils` → `coreEngine.jsx`. Esegui dalla root progetto:
 *
 * npx esbuild ./src/dev/testFoodCommandEngine.js --bundle --platform=node --format=esm --alias:@=./src --loader:.jsx=jsx --outfile=./src/dev/.foodCommandTestRun.mjs && node ./src/dev/.foodCommandTestRun.mjs
 */

import { parseFoodCommandIntent } from '../features/salaComandi/engines/foodCommandEngine.js';

const foodDbMock = {
  CREA_YOG_GRC: {
    desc: 'yogurt greco',
    kcal: 130,
    prot: 10,
    carb: 4,
    fat: 6,
    defaultQty: 150,
  },
  CREA_YOG_GRC_0: {
    desc: 'yogurt greco 0%',
    kcal: 60,
    prot: 10,
    carb: 6,
    fat: 0,
    defaultQty: 170,
  },
  CREA_CAFFE: {
    desc: 'caffè',
    kcal: 2,
    prot: 0,
    carb: 0,
    fat: 0,
    defaultQty: 30,
  },
  CREA_PANE: {
    desc: 'pane',
    kcal: 250,
    prot: 9,
    carb: 50,
    fat: 2,
    defaultQty: 50,
  },
  CREA_MARM: {
    desc: 'marmellata',
    kcal: 250,
    prot: 0,
    carb: 62,
    fat: 0,
    defaultQty: 20,
  },
  CREA_UOVA: {
    desc: 'uova',
    kcal: 140,
    prot: 12,
    carb: 1,
    fat: 10,
    defaultQty: 100,
  },
};

/** Ordine: elementi più recenti per primi — coerente con findRecentFoodHabit */
const flatLogMock = [
  { type: 'food', desc: 'yogurt greco', qta: 200 },
  { type: 'food', desc: 'caffè', qta: 25 },
];

const prompts = [
  'yogurt greco 170g',
  'un caffè',
  'pane e marmellata',
  '2 uova',
  'kefir proteico xyz',
];

function printCase(text) {
  const out = parseFoodCommandIntent({
    text,
    foodDb: foodDbMock,
    flatLog: flatLogMock,
    mealContext: null,
  });

  console.log('\n---');
  console.log('input:', JSON.stringify(text));
  console.log('status globale:', out.status);
  console.log('intent:', out.intent);
  console.log('requiresUserAction:', out.requiresUserAction);

  for (let i = 0; i < out.items.length; i += 1) {
    const it = out.items[i];
    console.log(`  [item ${i}]`, {
      rawName: it.rawName,
      status: it.status,
      quantity: it.quantity,
      suggestedQuantity: it.suggestedQuantity,
      quantitySource: it.quantitySource,
      matchedFoodDesc: it.matchedFood?.desc ?? null,
      candidatesLen: Array.isArray(it.candidates) ? it.candidates.length : 0,
    });
  }
}

console.log('[testFoodCommandEngine] foodDb keys:', Object.keys(foodDbMock).length);

for (const p of prompts) {
  printCase(p);
}

console.log('\n[testFoodCommandEngine] fatto.\n');
