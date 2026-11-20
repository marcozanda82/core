import assert from 'node:assert/strict';
import test from 'node:test';
import {
  externalDraftToInboxBlock,
  isExternalInboxBlock,
  summarizeExternalMealDrafts,
} from '../externalMealDrafts.js';
import {
  appendUnassignedDraftBlock,
  extractUnassignedDraftBlocks,
  formatInboxDraftCardLabel,
  isClaudeDraftBlock,
  isUnresolvedMealDraftItem,
  normalizeInboxDraftBlock,
  serializeUnassignedDraftsForFirebase,
} from '../../../utils/mealDraftStatus.js';
import { withCondimentsOnResolved } from '../../mealEngine/canonicalMealCommit.js';

function claudeDraft(overrides = {}) {
  return {
    id: 'cd_abc_0123abcd',
    schemaVersion: 1,
    origin: 'claude',
    source: 'claude',
    date: '2026-11-19',
    slotHint: 'cena',
    timeHHmm: '20:30',
    items: [
      { id: 'cd_abc_0123abcd_i0', foodName: 'Pasta al pomodoro', grams: 90, note: 'olio non specificato', status: 'pending' },
      { id: 'cd_abc_0123abcd_i1', foodName: 'Insalata', status: 'pending' },
    ],
    rawText: 'stasera pasta al pomodoro 90g e insalata',
    createdAt: 1_763_500_000_000,
    status: 'pending',
    ...overrides,
  };
}

test('una bozza Claude in attesa diventa un blocco Inbox con origine, ora, pasto suggerito e note', () => {
  const block = externalDraftToInboxBlock('cd_abc_0123abcd', claudeDraft());
  assert.ok(block);
  assert.equal(block.id, 'ext_cd_abc_0123abcd');
  assert.equal(block.externalDraftId, 'cd_abc_0123abcd');
  assert.equal(block.externalDate, '2026-11-19');
  assert.equal(block.source, 'claude');
  assert.equal(block.slotHint, 'cena');
  assert.equal(block.timeHHmm, '20:30');
  assert.equal(block.inferredType, 'meal');
  assert.equal(block.rawText, 'stasera pasta al pomodoro 90g e insalata');
  assert.equal(isExternalInboxBlock(block), true);
  assert.equal(isClaudeDraftBlock(block), true);

  const [pasta, insalata] = block.items;
  assert.equal(pasta.foodName, 'Pasta al pomodoro');
  assert.equal(pasta.grams, 90);
  assert.equal(pasta.quantitySource, 'explicit');
  assert.equal(pasta.note, 'olio non specificato');
  assert.equal(pasta.status, 'raw');
  assert.equal(isUnresolvedMealDraftItem(pasta), true, 'passa sempre dalla lavagna di riconoscimento');
  assert.equal(insalata.grams, undefined);
  assert.equal(insalata.quantitySource, undefined);
});

test('le bozze già convalidate o eliminate non entrano nell\'Inbox', () => {
  assert.equal(externalDraftToInboxBlock('a', claudeDraft({ status: 'consumed' })), null);
  assert.equal(externalDraftToInboxBlock('a', claudeDraft({ status: 'deleted' })), null);
  assert.equal(externalDraftToInboxBlock('a', claudeDraft({ date: 'ieri' })), null);
  assert.equal(isExternalInboxBlock({ id: 'inbox_1' }), false);
});

test('riepilogo: bozze del giorno aperto, contatore per gli altri giorni, totale', () => {
  const node = {
    d1: claudeDraft({ date: '2026-11-19', createdAt: 3 }),
    d2: claudeDraft({ date: '2026-11-19', createdAt: 1 }),
    d3: claudeDraft({ date: '2026-11-18', createdAt: 2 }),
    d4: claudeDraft({ date: '2026-11-17', createdAt: 4 }),
    d5: claudeDraft({ date: '2026-11-17', createdAt: 5 }),
    d6: claudeDraft({ date: '2026-11-17', status: 'consumed' }),
  };
  const summary = summarizeExternalMealDrafts(node, '2026-11-19');
  assert.deepEqual(summary.blocks.map((b) => b.externalDraftId), ['d2', 'd1']);
  assert.deepEqual(summary.otherDays, [
    { date: '2026-11-18', count: 1 },
    { date: '2026-11-17', count: 2 },
  ]);
  assert.equal(summary.totalPending, 5);

  const empty = summarizeExternalMealDrafts(null, '2026-11-19');
  assert.deepEqual(empty, { blocks: [], otherDays: [], totalPending: 0 });
});

test('etichetta scheda: «da Claude» con le voci strutturate, non il testo originale', () => {
  const block = externalDraftToInboxBlock('cd_abc_0123abcd', claudeDraft());
  assert.equal(
    formatInboxDraftCardLabel(block),
    'Bozza pasto da Claude 20:30 - Pasta al pomodoro, Insalata',
  );
  const voice = normalizeInboxDraftBlock({
    id: 'inbox_1', createdAt: 1, timeHHmm: '13:00', rawText: 'un panino', inferredType: 'meal',
    items: [{ foodName: 'Panino', status: 'raw' }], source: 'voice',
  });
  assert.equal(formatInboxDraftCardLabel(voice), 'Bozza pasto 13:00 - un panino');
});

test('annulla: il blocco ripristinato resta una bozza Claude del giorno, senza legame esterno', () => {
  const external = externalDraftToInboxBlock('cd_abc_0123abcd', claudeDraft());
  const restored = normalizeInboxDraftBlock(external);
  assert.equal(restored.externalDraftId, undefined);
  assert.equal(isExternalInboxBlock(restored), false);
  assert.equal(restored.source, 'claude');
  assert.equal(restored.slotHint, 'cena');
  assert.equal(restored.items[0].note, 'olio non specificato');
});

test('origine e pasto suggerito sopravvivono a log e serializzazione Firebase', () => {
  const log = appendUnassignedDraftBlock([], {
    id: 'inbox_42',
    items: [{ foodName: 'Riso', grams: 80, status: 'raw', note: 'basmati' }],
    createdAt: 42,
    timeHHmm: '12:30',
    rawText: 'riso 80g',
    inferredType: 'meal',
    source: 'voice',
    slotHint: 'pranzo',
  });
  const [block] = extractUnassignedDraftBlocks(log);
  assert.equal(block.source, 'voice');
  assert.equal(block.slotHint, 'pranzo');
  assert.equal(block.items[0].note, 'basmati');

  const node = serializeUnassignedDraftsForFirebase(log);
  assert.equal(node.blocks[0].source, 'voice');
  assert.equal(node.blocks[0].slotHint, 'pranzo');

  const hostile = normalizeInboxDraftBlock({
    id: 'x', createdAt: 1, items: [{ foodName: 'Mela', status: 'raw' }],
    source: '<script>', slotHint: 'merenda',
  });
  assert.equal(hostile.source, undefined);
  assert.equal(hostile.slotHint, undefined);
});

test('condimenti alla convalida: solo piatti risolti, senza duplicare', () => {
  const pasta = { id: 'p1', foodName: 'Pasta al pomodoro', grams: 90, kcal: 320, mealType: 'cena', mealTime: 20.5 };
  const rawRice = { id: 'r1', foodName: 'Riso', status: 'raw', kcal: 0 };
  const apple = { id: 'm1', foodName: 'Mela', grams: 150, kcal: 80 };

  const out = withCondimentsOnResolved([pasta, rawRice, apple]);
  const extras = out.filter((item) => item.condimentOf);
  assert.deepEqual(extras.map((item) => item.id).sort(), ['p1::olio', 'p1::sale']);
  assert.equal(out.find((item) => item.id === 'p1::olio').grams, 10);
  assert.equal(out.find((item) => item.id === 'p1::olio').mealType, 'cena');

  const again = withCondimentsOnResolved(out);
  assert.equal(again.filter((item) => item.condimentOf).length, 2);

  assert.deepEqual(withCondimentsOnResolved([]), []);
  assert.deepEqual(withCondimentsOnResolved(null), []);
});
