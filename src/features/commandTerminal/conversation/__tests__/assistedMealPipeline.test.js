import assert from 'node:assert/strict';
import { test } from 'node:test';

import { projectDayNutrition } from '../../../mealEngine/projectDayNutrition.js';
import {
  interpretAssistedMealInput,
  parseAssistedMealLocal,
  QUANTITY_SOURCE,
  serializeAssistedMealDraft,
} from '../assistedMealPipeline.js';

const TARGETS = { kcal: 2000, prot: 150, carb: 200, fat: 70 };

function asMealFoods(draft) {
  return (draft.items || []).map((item) => ({
    type: 'food',
    kcal: item.grams * 2,
    prot: 0,
    carb: 0,
    fat: 0,
  }));
}

async function bothSources(text, context = {}) {
  const textDraft = await interpretAssistedMealInput(text, { ...context, source: 'text' });
  const voiceDraft = await interpretAssistedMealInput(text, { ...context, source: 'voice' });
  return { textDraft, voiceDraft };
}

test('Caso 1 — esplicito semplice: stesso item, 150 g, explicit', async () => {
  const { textDraft, voiceDraft } = await bothSources('150 g pollo');
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].grams, 150);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.explicit);
  assert.match(textDraft.items[0].foodName, /pollo/i);
});

test('Caso 2 — pasto multiplo: 3 item identici testo/voce', async () => {
  const phrase = '120 g pasta, 150 g pollo, 10 g olio';
  const { textDraft, voiceDraft } = await bothSources(phrase);
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 3);
  assert.deepEqual(
    textDraft.items.map((i) => i.grams),
    [120, 150, 10],
  );
  assert.ok(textDraft.items.every((i) => i.quantitySource === QUANTITY_SOURCE.explicit));
});

test('Caso 3 — un cucchiaio d\'olio non è 100 g, household', async () => {
  const { textDraft, voiceDraft } = await bothSources("un cucchiaio d'olio");
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].grams, 10);
  assert.notEqual(textDraft.items[0].grams, 100);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.household);
  assert.match(textDraft.items[0].foodName, /olio/i);
});

test('Caso 4 — una mela: stessa quantità, household unità', async () => {
  const { textDraft, voiceDraft } = await bothSources('una mela');
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].grams, 150);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.household);
});

test('Caso 5 — pasta senza quantità: stima categoria 200 g, estimated', async () => {
  const { textDraft, voiceDraft } = await bothSources('pasta');
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].grams, 200);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.estimated);
});

test('Caso 6 — il mio yogurt usa user-history', async () => {
  const ctx = { userPortions: { yogurt: 170 } };
  const { textDraft, voiceDraft } = await bothSources('il mio yogurt', ctx);
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].grams, 170);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.userHistory);
});

test('Caso 7 — Gemini failure: fallback locale identico testo/voce', async () => {
  const boom = async () => {
    throw new Error('gemini down');
  };
  const phrase = '150 g pollo';
  const textDraft = await interpretAssistedMealInput(phrase, { source: 'text', geminiParser: boom });
  const voiceDraft = await interpretAssistedMealInput(phrase, { source: 'voice', geminiParser: boom });
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items[0].grams, 150);
  assert.equal(textDraft.parser, 'local');
});

test('Caso 8 — stesso pasto → stessa projection', async () => {
  const phrase = '150 g di petto di pollo, 80 g di riso e 10 g di olio';
  const { textDraft, voiceDraft } = await bothSources(phrase);
  const textProj = projectDayNutrition({
    currentDailyLog: [],
    draftMeal: asMealFoods(textDraft),
    effectiveTargets: TARGETS,
  });
  const voiceProj = projectDayNutrition({
    currentDailyLog: [],
    draftMeal: asMealFoods(voiceDraft),
    effectiveTargets: TARGETS,
  });
  assert.deepEqual(textProj.meal, voiceProj.meal);
  assert.deepEqual(textProj.after, voiceProj.after);
  assert.deepEqual(textProj.remaining, voiceProj.remaining);
});

test('Caso 9 — nome ambiguo: stesso draft pre-resolver', async () => {
  const { textDraft, voiceDraft } = await bothSources('xyzfoobar');
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items.length, 1);
  assert.equal(textDraft.items[0].foodName.toLowerCase(), 'xyzfoobar');
});

test('Caso 10 — 10 g olio vince su household/default', async () => {
  const { textDraft, voiceDraft } = await bothSources('10 g olio');
  assert.deepEqual(serializeAssistedMealDraft(textDraft), serializeAssistedMealDraft(voiceDraft));
  assert.equal(textDraft.items[0].grams, 10);
  assert.equal(textDraft.items[0].quantitySource, QUANTITY_SOURCE.explicit);
});

test('invariante: source metadata non cambia gli item', async () => {
  const phrase = '120 g pasta, 150 g pollo, 10 g olio';
  const a = parseAssistedMealLocal(phrase, { source: 'text' });
  const b = parseAssistedMealLocal(phrase, { source: 'voice' });
  assert.deepEqual(serializeAssistedMealDraft(a), serializeAssistedMealDraft(b));
  assert.equal(a.source, 'text');
  assert.equal(b.source, 'voice');
});
