/**
 * Smoke ranking gating prodotto (gelato nella query ecc.).
 *
 * dalla root progetto:
 * npx esbuild ./src/dev/foodCommandRankingSmoke.js --bundle --platform=node --format=esm --alias:@=./src --loader:.jsx=jsx --outfile=./src/dev/.foodCommandRankingSmoke.mjs && node ./src/dev/.foodCommandRankingSmoke.mjs
 */

import assert from 'node:assert';
import { parseFoodCommandIntent } from '../features/salaComandi/engines/foodCommandEngine.js';

const foodDbRankingMock = {
  FRAGOLE: { desc: 'fragole', kcal: 32, carb: 8, defaultQty: 100 },
  FRAGOLA: { desc: 'fragola', kcal: 32, carb: 8, defaultQty: 100 },
  GELATO_ALLA_FRAGOLA: { desc: 'gelato alla fragola', kcal: 200, carb: 26, defaultQty: 100 },
  GELATO: { desc: 'gelato', kcal: 200, carb: 24, defaultQty: 100 },
  YOG_ALLA_FRAGOLA: { desc: 'yogurt alla fragola', kcal: 110, carb: 16, defaultQty: 125 },
  MELA: { desc: 'mela', kcal: 52, carb: 14, defaultQty: 150 },
};

function topDesc(text) {
  const out = parseFoodCommandIntent({
    text,
    foodDb: foodDbRankingMock,
    flatLog: [],
    mealContext: null,
  });
  const it = out.items[0];
  return {
    status: out.status,
    itemStatus: it.status,
    topCandidate: it.candidates[0]?.desc ?? null,
    matched: it.matchedFood?.desc ?? null,
  };
}

{
  const r = topDesc('fragola');
  assert.notStrictEqual(r.itemStatus, 'no_match');
  const td = String(r.topCandidate ?? '');
  assert.ok(
    /^(fragola|fragole)$/i.test(td.trim()),
    `atteso fragola o fragole in cima, primi=${JSON.stringify(td)}`,
  );
}

{
  const r = topDesc('gelato');
  assert.notStrictEqual(r.itemStatus, 'no_match');
  assert.ok(String(r.topCandidate ?? '').toLowerCase().includes('gelato'));
}

{
  const r = topDesc('gelato alla fragola');
  assert.notStrictEqual(r.itemStatus, 'no_match');
  const blob = `${r.matched ?? ''}${r.topCandidate ?? ''}`;
  assert.ok(blob.includes('gelato alla fragola'));
}

{
  const r = topDesc('yogurt fragola');
  assert.notStrictEqual(r.itemStatus, 'no_match');
  const blob = `${r.topCandidate ?? ''}${r.matched ?? ''}`;
  assert.ok(blob.includes('yogurt'));
}

{
  const r = topDesc('fragole');
  assert.notStrictEqual(r.itemStatus, 'no_match');
  assert.ok(/^(fragola|fragole)$/i.test(String(r.topCandidate ?? '').trim()));
}

console.log('foodCommandRankingSmoke OK');
