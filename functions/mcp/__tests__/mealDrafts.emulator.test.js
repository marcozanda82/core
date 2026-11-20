/**
 * Bozze pasto MCP sull'emulatore RTDB (Admin, come in produzione).
 * - il server non scrive mai in tracker_data né in focus_day_scores
 * - anti-doppione in transazione
 * - permesso mancante → rifiuto; permesso attivato dal gettone → ok
 * - limite scritture 10/ora e 30/giorno
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../../src/features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import { loadFocusLocalRules } from '../../../src/features/kentuFocus/server/emulator/loadFocusRules.js';
import { createMcpTokenForUid, setMcpTokenScopesForUid } from '../tokens.js';
import { resolveMcpBearer } from '../auth.js';
import { todayInRome } from '../dates.js';
import {
  externalMealDraftsPath,
  mcpWriteQuotaPath,
  toolCreateMealDraft,
  toolDeleteDraft,
  toolListDrafts,
} from '../mealDrafts.js';

const UID = 'mcp_drafts_test_user';
const TODAY = todayInRome();

/** @type {import('firebase-admin/database').Database | null} */
let rawDb = null;
/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {Array<{ op: string, path: string }>} */
const writes = [];
let seededTracker = null;
let seededScores = null;

const WRITE_METHODS = new Set(['set', 'update', 'push', 'remove', 'transaction', 'setWithPriority', 'setPriority']);

function refPath(ref) {
  const url = new URL(ref.toString());
  return decodeURIComponent(url.pathname).replace(/^\/+/, '');
}

function wrapRef(ref) {
  return new Proxy(ref, {
    get(target, prop) {
      if (WRITE_METHODS.has(prop)) {
        return (...args) => {
          writes.push({ op: String(prop), path: refPath(target) });
          return target[prop](...args);
        };
      }
      if (prop === 'child') return (p) => wrapRef(target.child(p));
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Registra ogni scrittura fatta dal server MCP. */
function recordingDb(database) {
  return new Proxy(database, {
    get(target, prop) {
      if (prop === 'ref') return (p) => wrapRef(target.ref(p));
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function input(key, overrides = {}) {
  return {
    date: 'today',
    slot: 'pranzo',
    time: '13:00',
    items: [{ name: 'pasta integrale', grams: 80 }, { name: 'olio extravergine', grams: 10 }],
    originalText: 'pasta integrale 80 g con un cucchiaio di olio',
    idempotencyKey: key,
    ...overrides,
  };
}

async function draftsNode() {
  const snap = await rawDb.ref(externalMealDraftsPath(UID)).get();
  return snap.val() || {};
}

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  rawDb = createEmulatorAdminApp().db;
  db = recordingDb(rawDb);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
  await loadFocusLocalRules(path.join(root, 'database.rules.json'));
  await rawDb.ref(`users/${UID}`).set(null);
  await rawDb.ref(mcpWriteQuotaPath(UID)).set(null);
  await rawDb.ref(`mcp_draft_idem/${UID}`).set(null);

  seededTracker = {
    data: TODAY,
    log: [{ type: 'food', id: 'f1', name: 'mela', kcal: 80, mealType: 'colazione', mealTime: 8 }],
    mealTimes: { colazione: 8 },
  };
  seededScores = { version: 'kds-5', reliability: 'high', dataVersion: 'seed', score: 0.7 };
  await rawDb.ref(`users/${UID}/tracker_data/trackerStorico_${TODAY}`).set(seededTracker);
  await rawDb.ref(`users/${UID}/focus_day_scores/${TODAY}`).set(seededScores);
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('gettone nuovo: solo read → create rifiutato e nessuna bozza scritta', async () => {
  const created = await createMcpTokenForUid(rawDb, UID);
  const auth = await resolveMcpBearer(rawDb, `Bearer ${created.token}`);
  assert.deepEqual(auth.scopes, ['read']);
  const ctx = { uid: UID, tokenId: auth.tokenId, scopes: auth.scopes };
  await assert.rejects(
    () => toolCreateMealDraft(db, ctx, input('scope-missing-0001')),
    (error) => error.code === 'missing_scope',
  );
  assert.deepEqual(await draftsNode(), {});

  await setMcpTokenScopesForUid(rawDb, UID, created.tokenId, { draftsWrite: true });
  const upgraded = await resolveMcpBearer(rawDb, `Bearer ${created.token}`);
  assert.deepEqual(upgraded.scopes, ['read', 'drafts:write']);

  await setMcpTokenScopesForUid(rawDb, UID, created.tokenId, { draftsWrite: false });
  const revoked = await resolveMcpBearer(rawDb, `Bearer ${created.token}`);
  assert.deepEqual(revoked.scopes, ['read']);
});

test('gettone legacy senza scopes resta solo read', async () => {
  const created = await createMcpTokenForUid(rawDb, UID);
  await rawDb.ref(`users/${UID}/mcp_tokens/${created.tokenId}/scopes`).set(null);
  const auth = await resolveMcpBearer(rawDb, `Bearer ${created.token}`);
  assert.deepEqual(auth.scopes, ['read']);
});

const WRITE_CTX = { uid: UID, tokenId: 't_test', scopes: ['read', 'drafts:write'] };

test('anti-doppione: stessa chiave → una sola bozza, anche in parallelo', async () => {
  const first = await toolCreateMealDraft(db, WRITE_CTX, input('pranzo-dup-0001'));
  assert.equal(first.created, true);
  const again = await toolCreateMealDraft(db, WRITE_CTX, input('pranzo-dup-0001'));
  assert.equal(again.duplicate, true);
  assert.equal(again.draft.draftId, first.draft.draftId);

  const parallel = await Promise.all([
    toolCreateMealDraft(db, WRITE_CTX, input('pranzo-par-0002')),
    toolCreateMealDraft(db, WRITE_CTX, input('pranzo-par-0002')),
    toolCreateMealDraft(db, WRITE_CTX, input('pranzo-par-0002')),
  ]);
  assert.equal(parallel.filter((r) => r.created).length, 1);
  const ids = new Set(parallel.map((r) => r.draft.draftId));
  assert.equal(ids.size, 1);

  const node = await draftsNode();
  assert.equal(Object.keys(node).length, 2);
  const stored = node[first.draft.draftId];
  assert.equal(stored.origin, 'claude');
  assert.equal(stored.status, 'pending');
  assert.equal(stored.date, TODAY);
});

test('elenco: solo bozze create da Claude', async () => {
  await rawDb.ref(`${externalMealDraftsPath(UID)}/cd_other_00000000`).set({
    origin: 'kentu', status: 'pending', createdAt: Date.now(), date: TODAY,
  });
  const list = await toolListDrafts(db, WRITE_CTX, { status: 'pending' });
  assert.ok(list.drafts.length >= 2);
  assert.ok(list.drafts.every((d) => d.draftId !== 'cd_other_00000000'));
  await rawDb.ref(`${externalMealDraftsPath(UID)}/cd_other_00000000`).set(null);
});

test('elimina: solo bozze Claude in attesa', async () => {
  const created = await toolCreateMealDraft(db, WRITE_CTX, input('cena-del-0003', { slot: 'cena', time: '20:00' }));
  const id = created.draft.draftId;
  const res = await toolDeleteDraft(db, WRITE_CTX, { draftId: id });
  assert.equal(res.deleted, true);
  const row = (await rawDb.ref(`${externalMealDraftsPath(UID)}/${id}`).get()).val();
  assert.equal(row.status, 'deleted');
  await assert.rejects(
    () => toolDeleteDraft(db, WRITE_CTX, { draftId: id }),
    (error) => error.code === 'not_deletable',
  );

  const consumed = await toolCreateMealDraft(db, WRITE_CTX, input('cena-con-0004', { slot: 'cena', time: '20:30' }));
  await rawDb.ref(`${externalMealDraftsPath(UID)}/${consumed.draft.draftId}/status`).set('consumed');
  await assert.rejects(
    () => toolDeleteDraft(db, WRITE_CTX, { draftId: consumed.draft.draftId }),
    (error) => error.code === 'not_deletable',
  );
  await assert.rejects(
    () => toolDeleteDraft(db, WRITE_CTX, { draftId: 'cd_missing_00000000' }),
    (error) => error.code === 'not_found',
  );
});

test('limite scritture: 10/ora e 30/giorno', async () => {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  await rawDb.ref(mcpWriteQuotaPath(UID)).set({ hourBucket: hour, hourCount: 10, dayKey: TODAY, dayCount: 10 });
  await assert.rejects(
    () => toolCreateMealDraft(db, WRITE_CTX, input('quota-hour-0005'), now),
    (error) => error.code === 'rate_limited' && /ora/.test(error.message),
  );
  await rawDb.ref(mcpWriteQuotaPath(UID)).set({ hourBucket: hour, hourCount: 1, dayKey: TODAY, dayCount: 30 });
  await assert.rejects(
    () => toolCreateMealDraft(db, WRITE_CTX, input('quota-day-0006'), now),
    (error) => error.code === 'rate_limited' && /giorno/.test(error.message),
  );
  await rawDb.ref(mcpWriteQuotaPath(UID)).set(null);
  const ok = await toolCreateMealDraft(db, WRITE_CTX, input('quota-ok-0007'), now);
  assert.equal(ok.created, true);
  const quota = (await rawDb.ref(mcpWriteQuotaPath(UID)).get()).val();
  assert.equal(quota.hourCount, 1);
  assert.equal(quota.dayCount, 1);
});

test('registro: ogni creazione, doppione, eliminazione e rifiuto finisce in mcp_audit', async () => {
  const snap = await rawDb.ref(`users/${UID}/mcp_audit`).get();
  const results = Object.values(snap.val() || {}).map((row) => `${row.tool}:${row.result}`);
  assert.ok(results.includes('kentu_create_meal_draft:created'));
  assert.ok(results.includes('kentu_create_meal_draft:duplicate'));
  assert.ok(results.includes('kentu_create_meal_draft:rejected'));
  assert.ok(results.includes('kentu_delete_draft:deleted'));
});

test('il server non scrive mai in tracker_data né in focus_day_scores', async () => {
  const tracker = (await rawDb.ref(`users/${UID}/tracker_data/trackerStorico_${TODAY}`).get()).val();
  const scores = (await rawDb.ref(`users/${UID}/focus_day_scores/${TODAY}`).get()).val();
  assert.deepEqual(tracker, seededTracker);
  assert.deepEqual(scores, seededScores);

  assert.ok(writes.length > 0);
  const allowed = [
    `users/${UID}/external_drafts/meals/`,
    `users/${UID}/mcp_audit`,
    `mcp_write_quota/${UID}`,
    `mcp_draft_idem/${UID}/`,
  ];
  const outside = writes.filter((w) => !allowed.some((prefix) => w.path.startsWith(prefix)));
  assert.deepEqual(outside, [], JSON.stringify(outside));
  assert.equal(writes.some((w) => /tracker_data|focus_day_scores/.test(w.path)), false);
});
