import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  interpretAssistedMealInput,
  parseAssistedMealLocal,
  QUANTITY_SOURCE,
  serializeAssistedMealDraft,
} from '../assistedMealPipeline.js';
import { getUserFoodPreferenceContext } from '../userFoodPreferenceContext.js';
import {
  estimateAssistedSaveInteractions,
  shouldAskMealClarification,
} from '../shouldAskMealClarification.js';

/** Baseline interpretativa misurata PRIMA delle modifiche Step 7. */
const BASELINE_20 = [
  { in: '150 g pollo', n: 1, grams: [150], source: ['explicit'], name: ['Pollo'] },
  { in: 'pollo', n: 1, grams: [100], source: ['estimated'], name: ['Pollo'] },
  { in: 'petto di pollo', n: 1, grams: [100], source: ['estimated'], name: ['Petto di pollo'] },
  { in: '120 g pasta', n: 1, grams: [120], source: ['explicit'], name: ['Pasta'] },
  { in: 'pasta', n: 1, grams: [100], source: ['estimated'], name: ['Pasta'] },
  { in: 'un piatto di pasta', n: 1, grams: [100], source: ['estimated'], name: ['Piatto di pasta'] },
  { in: 'una mela', n: 1, grams: [150], source: ['household'], name: ['Mela'] },
  { in: 'due mele', n: 1, grams: [180], source: ['database'], name: ['Due mele'] },
  { in: "un cucchiaio d'olio", n: 1, grams: [10], source: ['household'], name: ['Olio'] },
  { in: 'due fette di pane', n: 1, grams: [50], source: ['household'], name: ['Pane'] },
  { in: 'una scatoletta di tonno', n: 1, grams: [56], source: ['household'], name: ['Tonno'] },
  { in: 'uno yogurt', n: 1, grams: [125], source: ['database'], name: ['Yogurt'] },
  { in: 'il mio yogurt', n: 1, grams: [125], source: ['database'], name: ['Yogurt'] },
  { in: 'la solita colazione', n: 1, grams: [100], source: ['estimated'], name: ['La solita'] },
  { in: 'ho mangiato pasta pollo e olio', n: 2, grams: [100, 100], source: ['estimated', 'estimated'], name: ['Pasta pollo', 'Olio'] },
  { in: '120 g pasta 150 g pollo 10 g olio', n: 1, grams: [120], source: ['explicit'], name: ['Pasta 150 g pollo 10 g olio'] },
  { in: 'panino con prosciutto e formaggio', n: 1, grams: [50], source: ['database'], name: ['Panino con prosciutto e formaggio'] },
  { in: 'pizza margherita', n: 1, grams: [100], source: ['estimated'], name: ['Pizza margherita'] },
  { in: 'carbonara al ristorante', n: 1, grams: [100], source: ['estimated'], name: ['Carbonara al ristorante'] },
  { in: 'caffè e cornetto', n: 2, grams: [30, 50], source: ['database', 'database'], name: ['Caffè', 'Cornetto'] },
];

const CASES_20 = BASELINE_20.map((row) => row.in);

function snapshot(draft) {
  return {
    n: draft.items.length,
    grams: draft.items.map((i) => i.grams),
    source: draft.items.map((i) => i.quantitySource),
    name: draft.items.map((i) => i.foodName),
    disamb: draft.items.filter((i) => i.identityAmbiguous).length,
    followUp: 0,
    interactions: estimateAssistedSaveInteractions(draft).total,
    habitual: draft.habitualMealRequested || null,
  };
}

async function bothSources(text, context = {}) {
  const textDraft = await interpretAssistedMealInput(text, { ...context, source: 'text' });
  const voiceDraft = await interpretAssistedMealInput(text, { ...context, source: 'voice' });
  return { textDraft, voiceDraft };
}

test('testo/voce invariante sui 20 casi', async () => {
  for (const phrase of CASES_20) {
    const { textDraft, voiceDraft } = await bothSources(phrase);
    assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  }
});

test('20 casi: numerali, piatto, compositi, ristorante', async () => {
  const dueMele = parseAssistedMealLocal('due mele');
  assert.equal(dueMele.items[0].grams, 300);
  assert.equal(dueMele.items[0].quantitySource, QUANTITY_SOURCE.household);
  assert.match(dueMele.items[0].foodName, /mel/i);

  const uova = parseAssistedMealLocal('tre uova');
  assert.equal(uova.items[0].grams, 180);
  assert.equal(uova.items[0].quantitySource, QUANTITY_SOURCE.household);

  const piatto = parseAssistedMealLocal('un piatto di pasta');
  assert.match(piatto.items[0].foodName, /^pasta$/i);
  assert.equal(piatto.items[0].quantitySource, QUANTITY_SOURCE.estimated);
  assert.equal(piatto.items[0].grams, 200);
  assert.equal(shouldAskMealClarification(piatto.items[0]).ask, false);

  const list = parseAssistedMealLocal('ho mangiato pasta pollo e olio');
  assert.equal(list.items.length, 3);

  const grams = parseAssistedMealLocal('120 g pasta 150 g pollo 10 g olio');
  assert.equal(grams.items.length, 3);
  assert.deepEqual(grams.items.map((i) => i.grams), [120, 150, 10]);
  assert.ok(grams.items.every((i) => i.quantitySource === QUANTITY_SOURCE.explicit));

  const panino = parseAssistedMealLocal('panino con prosciutto e formaggio');
  assert.equal(panino.items.length, 1);

  const pizza = parseAssistedMealLocal('pizza margherita');
  assert.equal(pizza.items.length, 1);
  assert.equal(pizza.items[0].quantitySource, QUANTITY_SOURCE.estimated);

  const resto = parseAssistedMealLocal('carbonara al ristorante');
  assert.equal(resto.items.length, 1);
  assert.equal(resto.items[0].restaurantGuess, true);
  assert.match(resto.items[0].foodName, /carbonara/i);
  assert.equal(shouldAskMealClarification(resto.items[0]).ask, false);

  const solita = parseAssistedMealLocal('la solita colazione');
  assert.equal(solita.items.length, 0);
  assert.equal(solita.habitualMealRequested, 'colazione');
  assert.equal(solita.habitualMealResolved, false);
});

test('Profilo A: il mio yogurt dominante', async () => {
  const memory = {
    userFoodAliases: { yogurt: 'yogurt_x' },
    userPortions: { yogurt: 170 },
    personalFoods: [{
      foodDbKey: 'yogurt_x',
      name: 'Yogurt X',
      usageCount: 12,
      gramsSamples: [170, 170, 170, 160],
    }],
  };
  const { textDraft, voiceDraft } = await bothSources('il mio yogurt', memory);
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].preferredFoodDbKey, 'yogurt_x');
  assert.equal(textDraft.items[0].grams, 170);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.userHistory);
  assert.equal(textDraft.items[0].identityAmbiguous, false);
  assert.equal(shouldAskMealClarification(textDraft.items[0]).ask, false);
  assert.equal(estimateAssistedSaveInteractions(textDraft).disambiguationTaps, 0);
});

test('Profilo B: yogurt X e Y quasi pari → disambiguazione tray', () => {
  const pref = getUserFoodPreferenceContext('yogurt', {
    personalFoods: [
      { foodDbKey: 'yogurt_x', name: 'Yogurt X', usageCount: 6 },
      { foodDbKey: 'yogurt_y', name: 'Yogurt Y', usageCount: 5 },
    ],
  });
  assert.equal(pref.decision, 'ambiguous');
  const draft = parseAssistedMealLocal('yogurt', {
    personalFoods: [
      { foodDbKey: 'yogurt_x', name: 'Yogurt X', usageCount: 6 },
      { foodDbKey: 'yogurt_y', name: 'Yogurt Y', usageCount: 5 },
    ],
  });
  assert.equal(draft.items[0].identityAmbiguous, true);
  assert.equal(shouldAskMealClarification(draft.items[0]).channel, 'tray');
  assert.equal(estimateAssistedSaveInteractions(draft).chatFollowups, 0);
});

test('Profilo C: due fette del mio pane', () => {
  const draft = parseAssistedMealLocal('due fette del mio pane', {
    userFoodAliases: { pane: 'pane_int' },
    personalFoods: [{
      foodDbKey: 'pane_int',
      name: 'Pane integrale',
      usageCount: 9,
      lastGrams: 60,
    }],
  });
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].grams, 50);
  assert.equal(draft.items[0].quantitySource, QUANTITY_SOURCE.household);
  assert.equal(draft.items[0].preferredFoodDbKey, 'pane_int');
});

test('clarification: estimated non chiede grammi', () => {
  const pasta = parseAssistedMealLocal('pasta').items[0];
  const decision = shouldAskMealClarification(pasta);
  assert.equal(decision.ask, false);
  assert.equal(decision.reason, 'estimate_ok');
});

test('piatto usa history se c’è, altrimenti estimated', () => {
  const withHist = parseAssistedMealLocal('un piatto di pasta', { userPortions: { pasta: 90 } });
  assert.equal(withHist.items[0].grams, 90);
  assert.equal(withHist.items[0].quantitySource, QUANTITY_SOURCE.userHistory);
});

test('recency da sola non auto-matcha', () => {
  const pref = getUserFoodPreferenceContext('yogurt', {
    personalFoods: [
      { foodDbKey: 'yogurt_new', name: 'Yogurt nuovo', usageCount: 1, lastUsedAt: 9 },
      { foodDbKey: 'yogurt_old', name: 'Yogurt vecchio', usageCount: 1, lastUsedAt: 1 },
    ],
  });
  assert.notEqual(pref.decision, 'auto');
});

test('20 casi: snapshot dopo vs baseline (niente score inventati)', async () => {
  const after = [];
  for (const row of BASELINE_20) {
    const draft = await interpretAssistedMealInput(row.in, { source: 'text' });
    after.push({ in: row.in, before: row, after: snapshot(draft) });
  }

  const changed = after.filter((row) => (
    row.before.n !== row.after.n
    || JSON.stringify(row.before.grams) !== JSON.stringify(row.after.grams)
    || JSON.stringify(row.before.source) !== JSON.stringify(row.after.source)
  ));
  assert.ok(changed.length >= 4, 'attesi miglioramenti su mele, piatto, lista, grammi multipli, solita');
  const mele = after.find((r) => r.in === 'due mele');
  assert.equal(mele.after.grams[0], 300);
  const multi = after.find((r) => r.in.startsWith('120 g pasta 150'));
  assert.equal(multi.after.n, 3);
  const mix = after.find((r) => r.in.includes('pasta pollo'));
  assert.equal(mix.after.n, 3);
  const solita = after.find((r) => r.in === 'la solita colazione');
  assert.equal(solita.after.n, 0);
});
