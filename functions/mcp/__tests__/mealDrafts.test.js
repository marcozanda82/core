/**
 * Bozze pasto MCP: controlli sui dati, permessi, annotazioni e rifiuti (senza emulatore).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  buildExternalMealDraftRecord,
  validateMealDraftInput,
  toolCreateMealDraft,
  toolDeleteDraft,
} from '../mealDrafts.js';
import { buildMcpScopes, hasMcpScope, normalizeMcpScopes } from '../scopes.js';
import { createKentuMcpServer } from '../createServer.js';

const NOW = Date.parse('2026-11-19T17:00:00Z');

function validInput(overrides = {}) {
  return {
    date: '2026-11-19',
    slot: 'pranzo',
    time: '13:15',
    items: [
      { name: 'pasta integrale', grams: 80, note: 'con 1 cucchiaio di olio' },
      { name: 'merluzzo', grams: null },
    ],
    originalText: 'ho mangiato pasta integrale 80g e merluzzo',
    idempotencyKey: 'pranzo-2026-11-19-a',
    ...overrides,
  };
}

test('scopes: gettoni senza campo restano solo read', () => {
  assert.deepEqual(normalizeMcpScopes(undefined), ['read']);
  assert.deepEqual(normalizeMcpScopes({ 0: 'read', 1: 'drafts:write' }), ['read', 'drafts:write']);
  assert.deepEqual(normalizeMcpScopes(['admin', 'drafts:write']), ['read', 'drafts:write']);
  assert.equal(hasMcpScope(undefined, 'drafts:write'), false);
  assert.deepEqual(buildMcpScopes(false), ['read']);
  assert.deepEqual(buildMcpScopes(true), ['read', 'drafts:write']);
});

test('validateMealDraftInput: normalizza un input valido', () => {
  const out = validateMealDraftInput(validInput({ date: 'today' }), NOW);
  assert.equal(out.date, '2026-11-19');
  assert.equal(out.slot, 'pranzo');
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].grams, 80);
  assert.equal(out.items[1].grams, null);
  assert.equal(out.items[1].note, '');
});

test('validateMealDraftInput: rifiuta formati fuori schema', () => {
  const bad = [
    validInput({ date: '2026-12-31' }),
    validInput({ date: '19/11/2026' }),
    validInput({ slot: 'merenda' }),
    validInput({ time: '25:00' }),
    validInput({ time: '9:30' }),
    validInput({ items: [] }),
    validInput({ items: Array.from({ length: 21 }, (_, i) => ({ name: `cibo ${i}` })) }),
    validInput({ items: [{ name: 'x' }] }),
    validInput({ items: [{ name: 'pane', grams: 0 }] }),
    validInput({ items: [{ name: 'pane', grams: 12.5 }] }),
    validInput({ items: [{ name: 'pane', grams: 5000 }] }),
    validInput({ items: [{ name: 'pane', kcal: 300 }] }),
    validInput({ items: [{ name: 'pane', note: 'n'.repeat(201) }] }),
    validInput({ originalText: '   ' }),
    validInput({ originalText: 'a'.repeat(2001) }),
    validInput({ idempotencyKey: 'short' }),
    validInput({ idempotencyKey: 'chiave con spazi!' }),
  ];
  for (const input of bad) {
    assert.throws(() => validateMealDraftInput(input, NOW), (error) => error.code === 'invalid_input');
  }
});

test('buildExternalMealDraftRecord: forma salvata con origine claude e voci pending', () => {
  const normalized = validateMealDraftInput(validInput(), NOW);
  const record = buildExternalMealDraftRecord({
    id: 'cd_abc_12345678', normalized, tokenId: 't_1', now: NOW, idemHash: 'h',
  });
  assert.equal(record.origin, 'claude');
  assert.equal(record.source, 'claude');
  assert.equal(record.status, 'pending');
  assert.equal(record.slotHint, 'pranzo');
  assert.equal(record.timeHHmm, '13:15');
  assert.equal(record.items[0].foodName, 'pasta integrale');
  assert.equal(record.items[0].note, 'con 1 cucchiaio di olio');
  assert.equal(record.items[1].grams, undefined);
  assert.ok(record.items.every((item) => item.status === 'pending'));
});

test('scope mancante: create/delete rifiutati prima di toccare il database', async () => {
  const ctx = { uid: 'u1', tokenId: 't1', scopes: ['read'] };
  await assert.rejects(
    () => toolCreateMealDraft(null, ctx, validInput(), NOW),
    (error) => error.code === 'missing_scope',
  );
  await assert.rejects(
    () => toolDeleteDraft(null, ctx, { draftId: 'cd_abc_12345678' }, NOW),
    (error) => error.code === 'missing_scope',
  );
});

async function connectClient(scopes) {
  const server = createKentuMcpServer({ uid: 'u1', db: null, tokenId: 't1', scopes });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

test('server MCP: readOnlyHint sui tool di lettura, non sulle scritture', async () => {
  const { client, server } = await connectClient(['read']);
  const { tools } = await client.listTools();
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  for (const name of ['kentu_get_day', 'kentu_get_evenings', 'kentu_get_period', 'kentu_search_food', 'kentu_list_drafts']) {
    assert.equal(byName[name]?.annotations?.readOnlyHint, true, name);
  }
  assert.equal(byName.kentu_create_meal_draft.annotations.readOnlyHint, false);
  assert.equal(byName.kentu_delete_draft.annotations.readOnlyHint, false);
  assert.equal(byName.kentu_delete_draft.annotations.destructiveHint, true);
  await client.close();
  await server.close();
});

test('server MCP: schema stretto rifiuta campi extra e slot fuori elenco', async () => {
  const { client, server } = await connectClient(['read', 'drafts:write']);
  const badSlot = await client.callTool({
    name: 'kentu_create_meal_draft',
    arguments: validInput({ slot: 'merenda' }),
  });
  assert.equal(badSlot.isError, true);
  const extraField = await client.callTool({
    name: 'kentu_create_meal_draft',
    arguments: validInput({ items: [{ name: 'pane', grams: 50, kcal: 130 }] }),
  });
  assert.equal(extraField.isError, true);
  await client.close();
  await server.close();
});

test('server MCP: gettone solo lettura → errore leggibile missing_scope', async () => {
  const { client, server } = await connectClient(['read']);
  const res = await client.callTool({ name: 'kentu_create_meal_draft', arguments: validInput() });
  assert.equal(res.isError, true);
  const body = JSON.parse(res.content[0].text);
  assert.equal(body.error, 'missing_scope');
  await client.close();
  await server.close();
});
