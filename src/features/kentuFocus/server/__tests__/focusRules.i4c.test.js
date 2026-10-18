/**
 * I4-C — security rules su RTDB emulator (Auth emulator + idToken).
 * database.rules.focus.local.json — NON modifica database.rules.json produzione.
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  emulatorRestGet,
  emulatorRestPut,
  loadFocusLocalRules,
} from '../emulator/loadFocusRules.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const UID_A = 'user_rules_a';
const UID_B = 'user_rules_b';
const DATE = '2026-10-17';

/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {string|null} */
let tokenA = null;
/** @type {string|null} */
let tokenB = null;

before(async () => {
  if (!EMULATOR) return;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules();
  await db.ref('kentu_focus').set(null);
  await db.ref('users').set(null);

  tokenA = await createEmulatorIdToken(UID_A);
  tokenB = await createEmulatorIdToken(UID_B);

  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/meta`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusEdition',
    publicationDate: DATE,
    analysisDate: '2026-10-16',
    currentRevision: 1,
    status: 'published',
    headline: 'Pubblicata',
    teaser: 'ok',
    publishedAt: '2026-10-17T08:00:00.000Z',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/rev/1`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusEditionRevision',
    revision: 1,
    headlineSeed: 'rev1',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/rev/2`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusEditionRevision',
    revision: 2,
    headlineSeed: 'prep-unpublished',
  });
  await db.ref(`kentu_focus/${UID_A}/archive_index/${DATE}`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusArchiveIndexEntry',
    publicationDate: DATE,
    revision: 1,
    headline: 'Pubblicata',
  });
  await db.ref(`kentu_focus/${UID_A}/archive_index/2026-10-15`).set({
    publicationDate: '2026-10-15',
    revision: 1,
    headline: 'old',
  });
  await db.ref(`kentu_focus/${UID_A}/jobs/${DATE}`).set({
    status: 'running',
    ownerId: 'secret-worker',
  });
  await db.ref(`kentu_focus/${UID_A}/dossiers/${DATE}`).set({ secret: true });
  await db.ref(`kentu_focus/${UID_A}/editorial_memory`).set({ lastAppliedEdition: `${DATE}#1` });
  await db.ref(`kentu_focus/${UID_B}/editions/${DATE}/meta`).set({
    currentRevision: 1,
    headline: 'B only',
  });
});

after(async () => {
  if (!EMULATOR) return;
  await deleteEmulatorAdminApp();
});

test('I4-C rules skip senza emulator', { skip: EMULATOR }, () => {
  assert.ok(true);
});

test('I4-C rules: A legge propria meta e archive', { skip: !EMULATOR }, async () => {
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/meta`, {
    idToken: tokenA,
  });
  assert.equal(meta.denied, false, meta.raw);
  assert.equal(meta.body?.headline, 'Pubblicata');

  const arch = await emulatorRestGet(`kentu_focus/${UID_A}/archive_index/${DATE}`, {
    idToken: tokenA,
  });
  assert.equal(arch.denied, false, arch.raw);
  assert.equal(arch.body?.revision, 1);
});

test('I4-C rules: A legge rev 1 (corrente), NON rev 2 preparatoria', { skip: !EMULATOR }, async () => {
  const r1 = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(r1.denied, false, r1.raw);
  assert.equal(r1.body?.revision, 1);

  const r2 = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/2`, {
    idToken: tokenA,
  });
  assert.equal(r2.denied, true, `rev2 should be denied: ${r2.raw}`);
});

test('I4-C rules: A non scrive Focus', { skip: !EMULATOR }, async () => {
  const put = await emulatorRestPut(
    `kentu_focus/${UID_A}/editions/${DATE}/meta`,
    { hacked: true },
    { idToken: tokenA },
  );
  assert.equal(put.denied, true, put.raw);

  const putJob = await emulatorRestPut(
    `kentu_focus/${UID_A}/jobs/${DATE}`,
    { status: 'succeeded' },
    { idToken: tokenA },
  );
  assert.equal(putJob.denied, true, putJob.raw);
});

test('I4-C rules: A non legge dati di B', { skip: !EMULATOR }, async () => {
  const metaB = await emulatorRestGet(`kentu_focus/${UID_B}/editions/${DATE}/meta`, {
    idToken: tokenA,
  });
  assert.equal(metaB.denied, true, metaB.raw);
});

test('I4-C rules: A non legge jobs/dossiers/memory', { skip: !EMULATOR }, async () => {
  const job = await emulatorRestGet(`kentu_focus/${UID_A}/jobs/${DATE}`, { idToken: tokenA });
  assert.equal(job.denied, true, job.raw);
  const dos = await emulatorRestGet(`kentu_focus/${UID_A}/dossiers/${DATE}`, { idToken: tokenA });
  assert.equal(dos.denied, true, dos.raw);
  const mem = await emulatorRestGet(`kentu_focus/${UID_A}/editorial_memory`, { idToken: tokenA });
  assert.equal(mem.denied, true, mem.raw);
});

test('I4-C rules: unauthenticated negato', { skip: !EMULATOR }, async () => {
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/meta`, {});
  assert.equal(meta.denied, true, meta.raw);
});

test('I4-C rules: Admin bypass — operazioni backend OK', { skip: !EMULATOR }, async () => {
  await db.ref(`kentu_focus/${UID_A}/jobs/${DATE}/status`).set('succeeded');
  const snap = await db.ref(`kentu_focus/${UID_A}/jobs/${DATE}/status`).get();
  assert.equal(snap.val(), 'succeeded');
});

test('I4-C rules: users/planning/weeklyPlanning invariati (A scrive users)', { skip: !EMULATOR }, async () => {
  const put = await emulatorRestPut(`users/${UID_A}/ping`, { ok: 1 }, { idToken: tokenA });
  assert.equal(put.denied, false, put.raw);
  const cross = await emulatorRestPut(`users/${UID_B}/ping`, { ok: 1 }, { idToken: tokenA });
  assert.equal(cross.denied, true, cross.raw);
  // B token può scrivere il proprio users
  const putB = await emulatorRestPut(`users/${UID_B}/ping`, { ok: 1 }, { idToken: tokenB });
  assert.equal(putB.denied, false, putB.raw);
});

test('I4-C rules: lettura nodo padre editions non espone rev preparatorie', { skip: !EMULATOR }, async () => {
  const parent = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}`, {
    idToken: tokenA,
  });
  assert.equal(parent.denied, true, parent.raw);

  const root = await emulatorRestGet(`kentu_focus/${UID_A}`, { idToken: tokenA });
  assert.equal(root.denied, true, root.raw);
});

test('I4-C rules: archive_index leggibile (chiavi data)', { skip: !EMULATOR }, async () => {
  const list = await emulatorRestGet(`kentu_focus/${UID_A}/archive_index`, {
    idToken: tokenA,
  });
  assert.equal(list.denied, false, list.raw);
  assert.ok(list.body);
  assert.ok(list.body['2026-10-15']);
  assert.ok(list.body[DATE]);
});
