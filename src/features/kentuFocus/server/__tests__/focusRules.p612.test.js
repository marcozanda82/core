/**
 * P6.12 — Verifica emulator rules Focus (A/B + anonimo).
 * Carica database.rules.focus.local.json — NON tocca production.
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
  getFocusEmulatorHost,
  getFocusEmulatorProjectId,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  emulatorRestGet,
  emulatorRestPut,
  loadFocusLocalRules,
} from '../emulator/loadFocusRules.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const UID_A = 'user_p612_a';
const UID_B = 'user_p612_b';
const DATE = '2026-10-17';
const DATE_DRAFT = '2026-10-18';

/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {string|null} */
let tokenA = null;
/** @type {string|null} */
let tokenB = null;

before(async () => {
  if (!EMULATOR) return;

  // Isolamento: solo emulator demo, host loopback
  const host = getFocusEmulatorHost();
  assert.match(host, /^127\.0\.0\.1:\d+$/, `emulator host must be loopback: ${host}`);
  assert.equal(getFocusEmulatorProjectId(), 'demo-kentu-focus');
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS, 'no real SA credentials');
  assert.ok(!process.env.FIREBASE_TOKEN, 'no FIREBASE_TOKEN');

  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules();
  await db.ref('kentu_focus').set(null);
  await db.ref('users').set(null);
  await db.ref('planning').set(null);
  await db.ref('weeklyPlanning').set(null);

  tokenA = await createEmulatorIdToken(UID_A);
  tokenB = await createEmulatorIdToken(UID_B);

  // Edizione pubblicata A: currentRevision=1, rev1 + rev2 preparatoria
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/meta`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusEdition',
    publicationDate: DATE,
    currentRevision: 1,
    status: 'published',
    headline: 'Pubblicata',
    teaser: 'ok',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/rev/1`).set({
    revision: 1,
    status: 'published',
    headlineSeed: 'rev1',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/rev/2`).set({
    revision: 2,
    status: 'published',
    headlineSeed: 'prep-not-current',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/memory_events/1`).set({
    kind: 'FocusMemoryEvent',
    secret: true,
  });
  await db.ref(`kentu_focus/${UID_A}/archive_index/${DATE}`).set({
    publicationDate: DATE,
    revision: 1,
    headline: 'Pubblicata',
  });
  await db.ref(`kentu_focus/${UID_A}/jobs/${DATE}`).set({
    status: 'running',
    ownerId: 'worker-secret',
  });
  await db.ref(`kentu_focus/${UID_A}/dossiers/${DATE}`).set({ secret: true });
  await db.ref(`kentu_focus/${UID_A}/editorial_memory`).set({
    lastAppliedEdition: `${DATE}#1`,
  });

  // Meta non pubblicata (job / prep) — currentRevision punta a rev 1
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE_DRAFT}/meta`).set({
    publicationDate: DATE_DRAFT,
    currentRevision: 1,
    status: 'committing',
    headline: 'Bozza-segreta',
    teaser: 'non-pubblicare',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE_DRAFT}/rev/1`).set({
    revision: 1,
    headlineSeed: 'draft-body',
  });

  // B: edizione propria
  await db.ref(`kentu_focus/${UID_B}/editions/${DATE}/meta`).set({
    currentRevision: 1,
    status: 'published',
    headline: 'Solo B',
  });
  await db.ref(`kentu_focus/${UID_B}/editions/${DATE}/rev/1`).set({
    revision: 1,
    headlineSeed: 'b-rev',
  });
});

after(async () => {
  if (!EMULATOR) return;
  await deleteEmulatorAdminApp();
});

test('P6.12 skip senza emulator', { skip: EMULATOR }, () => {
  assert.ok(true);
});

test('P6.12 isolamento: host loopback + progetto demo', { skip: !EMULATOR }, () => {
  assert.match(getFocusEmulatorHost(), /^127\.0\.0\.1:/);
  assert.equal(getFocusEmulatorProjectId(), 'demo-kentu-focus');
});

// --- A: owner meta + archive ---
test('P6.12-A owner legge meta published e archive_index', { skip: !EMULATOR }, async () => {
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

  const list = await emulatorRestGet(`kentu_focus/${UID_A}/archive_index`, {
    idToken: tokenA,
  });
  assert.equal(list.denied, false, list.raw);
});

// --- B/C: solo currentRevision ---
test('P6.12-B/C solo rev corrente; prep e precedenti negate', { skip: !EMULATOR }, async () => {
  const r1 = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(r1.denied, false, r1.raw);

  const r2 = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/2`, {
    idToken: tokenA,
  });
  assert.equal(r2.denied, true, `prep rev2: ${r2.raw}`);

  // Bump currentRevision → 2 (sempre published): rev1 diventa non corrente
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/meta/currentRevision`).set(2);
  const r1after = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(r1after.denied, true, `previous rev1: ${r1after.raw}`);
  const r2after = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/rev/2`, {
    idToken: tokenA,
  });
  assert.equal(r2after.denied, false, r2after.raw);
  // ripristina per altri test
  await db.ref(`kentu_focus/${UID_A}/editions/${DATE}/meta/currentRevision`).set(1);
});

// --- D/E: cross-user + anon ---
test('P6.12-D/E altro utente e anonimo negati su Focus', { skip: !EMULATOR }, async () => {
  const cross = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/meta`, {
    idToken: tokenB,
  });
  assert.equal(cross.denied, true, cross.raw);

  const anon = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/meta`, {});
  assert.equal(anon.denied, true, anon.raw);

  const anonArch = await emulatorRestGet(`kentu_focus/${UID_A}/archive_index`, {});
  assert.equal(anonArch.denied, true, anonArch.raw);
});

// --- F: nessuna scrittura client ---
test('P6.12-F owner non scrive Focus (meta/rev/memory/job/archive/memory)', { skip: !EMULATOR }, async () => {
  const paths = [
    `kentu_focus/${UID_A}/editions/${DATE}/meta`,
    `kentu_focus/${UID_A}/editions/${DATE}/rev/1`,
    `kentu_focus/${UID_A}/editions/${DATE}/memory_events/1`,
    `kentu_focus/${UID_A}/jobs/${DATE}`,
    `kentu_focus/${UID_A}/archive_index/${DATE}`,
    `kentu_focus/${UID_A}/editorial_memory`,
  ];
  for (const p of paths) {
    const put = await emulatorRestPut(p, { hacked: true }, { idToken: tokenA });
    assert.equal(put.denied, true, `write ${p}: ${put.raw}`);
  }
});

// --- G: jobs/dossiers/editorial_memory/memory_events non leggibili ---
test('P6.12-G path interni non leggibili dal client', { skip: !EMULATOR }, async () => {
  for (const p of [
    `kentu_focus/${UID_A}/jobs/${DATE}`,
    `kentu_focus/${UID_A}/dossiers/${DATE}`,
    `kentu_focus/${UID_A}/editorial_memory`,
    `kentu_focus/${UID_A}/editions/${DATE}/memory_events/1`,
  ]) {
    const r = await emulatorRestGet(p, { idToken: tokenA });
    assert.equal(r.denied, true, `read ${p}: ${r.raw}`);
  }
});

// --- H: padri non elencabili ---
test('P6.12-H padri kentu_focus/{uid} e editions/{date} negati', { skip: !EMULATOR }, async () => {
  const root = await emulatorRestGet(`kentu_focus/${UID_A}`, { idToken: tokenA });
  assert.equal(root.denied, true, root.raw);
  const ed = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}`, {
    idToken: tokenA,
  });
  assert.equal(ed.denied, true, ed.raw);
  const focusRoot = await emulatorRestGet('kentu_focus', { idToken: tokenA });
  assert.equal(focusRoot.denied, true, focusRoot.raw);
});

// --- I: rami GhostApp invariati ---
test('P6.12-I users/planning/weeklyPlanning invariati', { skip: !EMULATOR }, async () => {
  for (const root of ['users', 'planning', 'weeklyPlanning']) {
    const ok = await emulatorRestPut(
      `${root}/${UID_A}/probe`,
      { v: 1 },
      { idToken: tokenA },
    );
    assert.equal(ok.denied, false, `${root} own write: ${ok.raw}`);
    const cross = await emulatorRestPut(
      `${root}/${UID_B}/probe`,
      { v: 1 },
      { idToken: tokenA },
    );
    assert.equal(cross.denied, true, `${root} cross write: ${cross.raw}`);
    const readOwn = await emulatorRestGet(`${root}/${UID_A}/probe`, { idToken: tokenA });
    assert.equal(readOwn.denied, false, `${root} own read: ${readOwn.raw}`);
    const readCross = await emulatorRestGet(`${root}/${UID_B}/probe`, { idToken: tokenA });
    assert.equal(readCross.denied, true, `${root} cross read: ${readCross.raw}`);
  }
});

// --- J: escalation antenati / multipath ---
test('P6.12-J no escalation via antenati o PUT deep', { skip: !EMULATOR }, async () => {
  const putUid = await emulatorRestPut(
    `kentu_focus/${UID_A}`,
    {
      editions: {
        [DATE]: {
          meta: { status: 'published', currentRevision: 99, headline: 'escalated' },
        },
      },
    },
    { idToken: tokenA },
  );
  assert.equal(putUid.denied, true, putUid.raw);

  const putEditions = await emulatorRestPut(
    `kentu_focus/${UID_A}/editions/${DATE}`,
    { meta: { status: 'published', currentRevision: 99 } },
    { idToken: tokenA },
  );
  assert.equal(putEditions.denied, true, putEditions.raw);

  // Meta non deve essere stata alterata
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE}/meta`, {
    idToken: tokenA,
  });
  assert.equal(meta.denied, false, meta.raw);
  assert.equal(meta.body?.currentRevision, 1);
  assert.equal(meta.body?.headline, 'Pubblicata');
});

// --- Meta non pubblicata + meta incoerente ---
test('P6.12 meta non published: owner non legge meta né rev', { skip: !EMULATOR }, async () => {
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE_DRAFT}/meta`, {
    idToken: tokenA,
  });
  assert.equal(meta.denied, true, `draft meta: ${meta.raw}`);

  const rev = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${DATE_DRAFT}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(rev.denied, true, `draft rev via incoherent meta: ${rev.raw}`);
});

test('P6.12 meta published_fallback leggibile', { skip: !EMULATOR }, async () => {
  const d = '2026-10-19';
  await db.ref(`kentu_focus/${UID_A}/editions/${d}/meta`).set({
    currentRevision: 1,
    status: 'published_fallback',
    headline: 'Fallback',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${d}/rev/1`).set({
    revision: 1,
    headlineSeed: 'fb',
  });
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${d}/meta`, {
    idToken: tokenA,
  });
  assert.equal(meta.denied, false, meta.raw);
  const rev = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${d}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(rev.denied, false, rev.raw);
});

test('P6.12 meta incoerente: currentRevision set ma status assente → deny rev', { skip: !EMULATOR }, async () => {
  const d = '2026-10-20';
  await db.ref(`kentu_focus/${UID_A}/editions/${d}/meta`).set({
    currentRevision: 1,
    headline: 'senza-status',
  });
  await db.ref(`kentu_focus/${UID_A}/editions/${d}/rev/1`).set({
    revision: 1,
    headlineSeed: 'leak?',
  });
  const meta = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${d}/meta`, {
    idToken: tokenA,
  });
  assert.equal(meta.denied, true, meta.raw);
  const rev = await emulatorRestGet(`kentu_focus/${UID_A}/editions/${d}/rev/1`, {
    idToken: tokenA,
  });
  assert.equal(rev.denied, true, rev.raw);
});
