import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCondimentEntries,
  classifyCondiment,
  withCondiments,
} from '../condiments.js';

test('la pasta propone un cucchiaio di extravergine e sale normale', () => {
  const pasta = { id: 'pasta-1', name: 'Pasta al pomodoro' };
  const offer = classifyCondiment(pasta);
  assert.equal(offer.category, 'pasta');
  assert.deepEqual(offer.defaults, { oil: '10', salt: 'normal', oilType: 'evo' });
  const entries = buildCondimentEntries(pasta, offer.defaults);
  const oil = entries.find((item) => item.condimentKind === 'oil');
  const salt = entries.find((item) => item.condimentKind === 'salt');
  assert.equal(oil.grams, 10);
  assert.equal(oil.inflammationFactor, -1);
  assert.equal(oil.estimated, true);
  assert.equal(oil.condimentOf, 'pasta-1');
  assert.equal(salt.grams, 1.5);
  assert.equal(salt.sodiumMg, 600);
  assert.equal(salt.na, 600);
  assert.equal(salt.estimated, true);
});

test('niente per frutta, bevande, prodotti già conditi, ricette con olio e lessi', () => {
  assert.equal(classifyCondiment({ id: '1', name: 'Mela' }), null);
  assert.equal(classifyCondiment({ id: '1', name: 'Caffè espresso' }), null);
  assert.equal(classifyCondiment({ id: '1', name: 'Pesto pronto' }), null);
  assert.equal(classifyCondiment({ id: '1', name: 'Pasta', ingredients: [{ name: 'olio evo' }] }), null);
  assert.equal(classifyCondiment({ id: '1', name: 'Pollo lesso' }), null);
  const grill = classifyCondiment({ id: '1', name: 'Salmone alla griglia' });
  assert.equal(grill.category, 'pesce');
  assert.equal(grill.defaults.oil, '5');
  assert.equal(grill.defaults.salt, 'little');
});

test('il condimento non viene agganciato due volte', () => {
  const once = withCondiments([{ id: 'p', name: 'Spaghetti', type: 'food' }]);
  const twice = withCondiments(once);
  assert.equal(twice.filter((item) => item.condimentKind === 'oil').length, 1);
  assert.equal(twice.filter((item) => item.condimentKind === 'salt').length, 1);
});

test('pasta 70 g + un cucchiaio d’olio somma ~90 kcal di olio ai totali', () => {
  const pasta = {
    id: 'pasta-70',
    name: 'Pasta',
    type: 'food',
    grams: 70,
    qta: 70,
    kcal: 245,
    prot: 8,
    carb: 49,
    fat: 1,
    condiment: { oil: '10', salt: 'normal', oilType: 'evo' },
  };
  const items = withCondiments([pasta]);
  const oil = items.find((item) => item.condimentKind === 'oil');
  assert.ok(oil);
  assert.equal(oil.kcal, 88);
  const totalKcal = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);
  assert.equal(totalKcal, 245 + 88);
});
