/**
 * Emulatore Auth+Database — rev obbligatoria sulle regole + writer transazionale.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getDatabase, goOffline } from 'firebase/database';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
  getFocusEmulatorProjectId,
} from '../../features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../../features/kentuFocus/server/emulator/createEmulatorAuthToken.js';
import {
  emulatorRestPatch,
  emulatorRestPut,
  loadFocusLocalRules,
} from '../../features/kentuFocus/server/emulator/loadFocusRules.js';
import {
  mergeDayNodeWrite,
  saveDayNodeWithRev,
  saveDayNodeWithRevRetry,
} from '../dayNodeWrite.js';

const UID = 'day_rev_emu_user';
const DATE = '2026-11-10';
const STORICO = `trackerStorico_${DATE}`;
const DAY_PATH = `users/${UID}/tracker_data/${STORICO}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

/** @type {import('firebase-admin/database').Database | null} */
let adminDb = null;
/** @type {string|null} */
let token = null;
/** @type {import('firebase/app').FirebaseApp | null} */
let clientApp = null;
/** @type {import('firebase/database').Database | null} */
let clientDb = null;

async function adminSaveWithRev(managedFields, expectedRev) {
  const tx = await adminDb.ref(DAY_PATH).transaction((current) => {
    const merged = mergeDayNodeWrite(current, managedFields, {
      expectedRev,
      uid: UID,
      now: Date.now(),
    });
    if (!merged.ok) return undefined;
    return merged.next;
  });
  return {
    committed: tx.committed,
    node: tx.snapshot.exists() ? tx.snapshot.val() : null,
  };
}

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const admin = createEmulatorAdminApp();
  adminDb = admin.db;
  await loadFocusLocalRules(path.join(ROOT, 'database.rules.json'));
  token = await createEmulatorIdToken(UID);
  await adminDb.ref(`users/${UID}/tracker_data`).set(null);

  const projectId = getFocusEmulatorProjectId();
  const name = `day-rev-client-${Date.now()}`;
  // Stesso ns dell'admin emulator (`?ns=demo-kentu-focus`), altrimenti get/transaction
  // vedono un albero vuoto e “creano” rev=1 su un DB parallelo.
  clientApp = initializeApp({
    apiKey: 'fake-api-key',
    projectId,
    databaseURL: `http://127.0.0.1:9000?ns=${projectId}`,
  }, name);
  const auth = getAuth(clientApp);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  clientDb = getDatabase(clientApp);
  const { admin: adminSdk } = createEmulatorAdminApp();
  const customToken = await adminSdk.auth().createCustomToken(UID);
  await signInWithCustomToken(auth, customToken);
});

after(async () => {
  if (clientDb) {
    try { goOffline(clientDb); } catch { /* ignore */ }
  }
  if (clientApp) {
    try { await signOut(getAuth(clientApp)); } catch { /* ignore */ }
    await deleteApp(clientApp).catch(() => {});
    clientApp = null;
    clientDb = null;
  }
  await deleteEmulatorAdminApp();
});

test('regole: client vecchio set() senza rev → rifiutato', async () => {
  assert.ok(token);
  const res = await emulatorRestPut(
    DAY_PATH,
    { data: DATE, log: [{ id: 'old', type: 'food', foodName: 'Mela' }], mealTimes: {} },
    { idToken: token },
  );
  assert.equal(res.denied, true, `atteso deny, got ${res.statusCode} ${res.raw}`);
});

test('regole: client nuovo crea giorno con rev=1 → ok', async () => {
  const res = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: [{ id: 'a', type: 'food', foodName: 'Pera', grams: 120 }],
      mealTimes: {},
      dayTargetSnapshot: { total: 2516 },
      rev: 1,
      writeProtocol: 1,
      revBy: UID,
      revAt: Date.now(),
    },
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, res.raw);
  assert.equal(res.denied, false, res.raw);
  const live = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live.rev, 1);
  assert.equal(live.dayTargetSnapshot.total, 2516);
});

test('regole: set senza incrementare rev → rifiutato; rev+1 → ok', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [],
    dayTargetSnapshot: { total: 2456 },
    customTargets: { kcal: 2600 },
    rev: 3,
  });

  const stale = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: [{ id: 'x', type: 'food', foodName: 'Stale' }],
      mealTimes: {},
      rev: 3,
    },
    { idToken: token },
  );
  assert.equal(stale.denied, true, stale.raw);

  const noRev = await emulatorRestPut(
    DAY_PATH,
    { data: DATE, log: [], mealTimes: {} },
    { idToken: token },
  );
  assert.equal(noRev.denied, true, noRev.raw);

  const ok = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: [{ id: 'y', type: 'food', foodName: 'Fresh' }],
      mealTimes: {},
      dayTargetSnapshot: { total: 2456 },
      customTargets: { kcal: 2600 },
      rev: 4,
      writeProtocol: 1,
      revBy: UID,
      revAt: Date.now(),
    },
    { idToken: token },
  );
  assert.equal(ok.denied, false, ok.raw);
  const live = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live.rev, 4);
  assert.equal(live.log[0].foodName, 'Fresh');
  assert.equal(live.dayTargetSnapshot.total, 2456);
});

test('regole: PATCH dei soli campi senza rev → rifiutato', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [],
    dayTargetSnapshot: { total: 2808 },
    rev: 1,
  });
  const res = await emulatorRestPatch(
    DAY_PATH,
    { log: [{ id: 'z', type: 'food', foodName: 'Yogurt' }], hasEditedNodes: true },
    { idToken: token },
  );
  assert.equal(res.denied, true, res.raw);
  assert.equal((await adminDb.ref(DAY_PATH).get()).val().dayTargetSnapshot.total, 2808);
});

test('writer: salvataggio non cancella dayTargetSnapshot né customTargets', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ id: 'old', type: 'food', foodName: 'Mela', grams: 100 }],
    mealTimes: {},
    manualNodes: [],
    dayTargetSnapshot: { total: 2516, base: 2456, rulesVersion: 'dtr-1' },
    customTargets: { kcal: 2600, source: 'test' },
    secretServerField: 'keep-me',
    rev: 1,
  });

  const { committed, node } = await adminSaveWithRev({
    data: DATE,
    log: [{ id: 'new', type: 'food', foodName: 'Pera', grams: 120 }],
    mealTimes: { snack: 16 },
    manualNodes: [],
    hasEditedNodes: true,
  }, 1);

  assert.equal(committed, true);
  // merge-by-id: voce solo-server (Mela) resta; Pera si aggiunge
  assert.equal(node.log.length, 2);
  assert.ok(node.log.some((row) => row.foodName === 'Mela'));
  assert.ok(node.log.some((row) => row.foodName === 'Pera'));
  assert.equal(node.dayTargetSnapshot.total, 2516);
  assert.equal(node.customTargets.kcal, 2600);
  assert.equal(node.secretServerField, 'keep-me');
  assert.equal(node.rev, 2);
});

test('due client in parallelo: uno vince, l\'altro confligge poi riapplica', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [],
    dayTargetSnapshot: { total: 2456 },
    rev: 10,
  });

  const [a, b] = await Promise.all([
    adminSaveWithRev({
      data: DATE,
      log: [{ id: 'a', type: 'food', foodName: 'ClientA', grams: 50 }],
      mealTimes: {},
      manualNodes: [],
      hasEditedNodes: true,
    }, 10),
    adminSaveWithRev({
      data: DATE,
      log: [{ id: 'b', type: 'food', foodName: 'ClientB', grams: 80 }],
      mealTimes: {},
      manualNodes: [],
      hasEditedNodes: true,
    }, 10),
  ]);

  const winners = [a, b].filter((r) => r.committed);
  const losers = [a, b].filter((r) => !r.committed);
  assert.equal(winners.length, 1, 'esattamente un client deve vincere');
  assert.equal(losers.length, 1);

  const afterConflict = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(afterConflict.rev, 11);
  assert.equal(afterConflict.dayTargetSnapshot.total, 2456);

  // Il perdente rilegge e riapplica con la rev fresca.
  const retry = await adminSaveWithRev({
    data: DATE,
    log: [
      ...(afterConflict.log || []),
      { id: 'b2', type: 'food', foodName: 'ClientB-retry', grams: 80 },
    ],
    mealTimes: {},
    manualNodes: [],
    hasEditedNodes: true,
  }, afterConflict.rev);
  assert.equal(retry.committed, true);
  assert.equal(retry.node.rev, 12);
  assert.ok(retry.node.log.some((item) => item.foodName === 'ClientB-retry'));
  assert.equal(retry.node.dayTargetSnapshot.total, 2456);
});

test('regole: giorno legacy senza rev → primo salvataggio con rev=1 accettato', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ id: 'legacy', type: 'food', foodName: 'Mela', grams: 100 }],
    mealTimes: {},
    dayTargetSnapshot: { total: 1845, autopilot: -155 },
    autopilotCorrection: -155,
  });
  const live0 = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live0.rev, undefined);

  const denied = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: live0.log,
      mealTimes: {},
      dayTargetSnapshot: live0.dayTargetSnapshot,
      autopilotCorrection: -100,
    },
    { idToken: token },
  );
  assert.equal(denied.denied, true, 'client vecchio senza rev deve restare rifiutato');

  const ok = await emulatorRestPut(
    DAY_PATH,
    {
      ...live0,
      autopilotCorrection: -100,
      dayTargetSnapshot: { ...live0.dayTargetSnapshot, autopilot: -100, total: 1900 },
      rev: 1,
      writeProtocol: 1,
      revBy: UID,
      revAt: Date.now(),
    },
    { idToken: token },
  );
  assert.equal(ok.denied, false, ok.raw);
  const live = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live.rev, 1);
  assert.equal(live.log[0].foodName, 'Mela');
  assert.equal(live.autopilotCorrection, -100);
});

test('regole: nodo a rev=8, scrittura con rev=1 → permission_denied (stato tipo oggi)', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ type: 'meal', mealId: 'pranzo_1', desc: 'Pranzo', items: [] }],
    mealTimes: {},
    dayTargetSnapshot: { total: 1845, autopilot: -155, rulesVersion: 'dtr-1' },
    autopilotCorrection: -155,
    rev: 8,
    revBy: UID,
    revAt: Date.now(),
  });

  const stale = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      autopilotCorrection: -120,
      dayTargetSnapshot: { total: 1880, autopilot: -120, rulesVersion: 'dtr-1' },
      rev: 1,
      writeProtocol: 1,
      revBy: UID,
      revAt: Date.now(),
    },
    { idToken: token },
  );
  assert.equal(stale.denied, true, stale.raw);
  assert.equal((await adminDb.ref(DAY_PATH).get()).val().rev, 8);
  assert.equal((await adminDb.ref(DAY_PATH).get()).val().log[0].mealId, 'pranzo_1');
});

test('client writer: autopilot su giorno a rev=8 (come oggi) senza perdere il log', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [
      {
        type: 'meal',
        mealId: 'pranzo_1',
        desc: 'Pranzo',
        items: [{ id: 'food_1', type: 'food', foodName: 'Pane', grams: 160, kcal: 445 }],
      },
    ],
    mealTimes: { pranzo_1: 7.28 },
    manualNodes: [{ id: 'c1', type: 'stimulant', label: 'Caffè' }],
    dayTargetSnapshot: { total: 1845, autopilot: -155, rulesVersion: 'dtr-1' },
    autopilotCorrection: -155,
    rev: 8,
    revBy: UID,
    revAt: Date.now(),
  });

  const { node } = await saveDayNodeWithRevRetry({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: {
      autopilotCorrection: -120,
      dayTargetSnapshot: { total: 1880, autopilot: -120, rulesVersion: 'dtr-1' },
    },
    expectedRev: null, // cache client senza rev → prima era permission_denied
  });

  assert.equal(node.rev, 9);
  assert.equal(node.autopilotCorrection, -120);
  assert.equal(node.dayTargetSnapshot.total, 1880);
  assert.equal(node.log[0].mealId, 'pranzo_1');
  assert.equal(node.log[0].items[0].foodName, 'Pane');
  assert.equal(node.manualNodes[0].label, 'Caffè');
});

test('client writer: salvataggio pasto su oggi (merge log + bump rev)', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ type: 'sleep', id: 'sleep_1', hours: 7 }],
    mealTimes: {},
    dayTargetSnapshot: { total: 2000, rulesVersion: 'dtr-1' },
    rev: 2,
    revBy: UID,
    revAt: Date.now(),
  });

  const { node } = await saveDayNodeWithRev({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: {
      data: DATE,
      log: [
        { type: 'sleep', id: 'sleep_1', hours: 7 },
        {
          type: 'meal',
          mealId: 'cena_1',
          desc: 'Cena',
          items: [{ id: 'f2', type: 'food', foodName: 'Yogurt', grams: 150 }],
        },
      ],
      mealTimes: { cena_1: 20 },
      hasEditedNodes: true,
    },
    expectedRev: 2,
  });

  assert.equal(node.rev, 3);
  assert.equal(node.log.length, 2);
  assert.equal(node.log[1].items[0].foodName, 'Yogurt');
  assert.equal(node.dayTargetSnapshot.total, 2000);
});

test('bozza: consume su external_drafts + pasto sul giorno nello stesso flusso', async () => {
  const draftId = 'cd_meal_rev_test_0001';
  const draftPath = `users/${UID}/external_drafts/meals/${draftId}`;
  await adminDb.ref(draftPath).set({
    draftId,
    kind: 'meals',
    status: 'pending',
    createdAt: Date.now(),
    origin: 'claude',
    rawText: 'yogurt 150g',
    items: [{ foodName: 'Yogurt', grams: 150 }],
  });
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [],
    mealTimes: {},
    rev: 4,
    revBy: UID,
    revAt: Date.now(),
  });

  const consumedAt = Date.now();
  const draftPatch = await emulatorRestPatch(
    draftPath,
    { status: 'consumed', consumedAt },
    { idToken: token },
  );
  assert.equal(draftPatch.denied, false, draftPatch.raw);

  const { node } = await saveDayNodeWithRevRetry({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: {
      data: DATE,
      log: [{
        type: 'meal',
        mealId: 'from_draft',
        desc: 'Bozza',
        items: [{ id: 'd1', type: 'food', foodName: 'Yogurt', grams: 150, entrySource: 'draft' }],
      }],
      mealTimes: { from_draft: 13 },
      hasEditedNodes: true,
    },
    expectedRev: 4,
  });

  assert.equal(node.rev, 5);
  assert.equal(node.log[0].items[0].foodName, 'Yogurt');
  const draft = (await adminDb.ref(draftPath).get()).val();
  assert.equal(draft.status, 'consumed');
  assert.equal(draft.rawText, 'yogurt 150g');
  assert.equal(draft.items[0].foodName, 'Yogurt');
});

test('caso conflitto: retry riapplica il pasto sul dato fresco (non lo scarta)', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ type: 'sleep', id: 'sleep_keep', hours: 7 }],
    mealTimes: {},
    dayTargetSnapshot: { total: 2000 },
    rev: 6,
    writeProtocol: 1,
    revBy: UID,
    revAt: Date.now(),
  });

  const mealPatch = {
    data: DATE,
    log: [
      { type: 'sleep', id: 'sleep_keep', hours: 7 },
      {
        type: 'meal',
        mealId: 'race_meal',
        desc: 'Pranzo',
        items: [{ id: 'f_race', foodName: 'Pane', grams: 100 }],
      },
    ],
    mealTimes: { race_meal: 7.28 },
    hasEditedNodes: true,
  };

  // expectedRev stantia (5 vs 6): prima passata confligge, retry rilegge e riapplica.
  const retried = await saveDayNodeWithRevRetry({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: mealPatch,
    expectedRev: 5,
  });

  assert.equal(retried.node.rev, 7);
  assert.ok(retried.node.log.some((row) => row.mealId === 'race_meal'));
  assert.equal(retried.node.log.find((row) => row.mealId === 'race_meal').items[0].foodName, 'Pane');
  assert.equal(retried.node.writeProtocol, 1);
  assert.equal(retried.node.dayTargetSnapshot.total, 2000);
});

test('conflitto: client con stato vecchio non cancella caffè / voci solo-server', async () => {
  // Server fresco: sonno + 2 caffè (come oggi 2026-11-20 mattina).
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [
      { type: 'sleep', id: 'sleep_keep' },
      {
        type: 'meal',
        mealId: 'other_client_meal',
        desc: 'Snack',
        items: [{ id: 'f_other', foodName: 'Mela', grams: 100 }],
      },
    ],
    manualNodes: [
      { id: 'coffee_645', type: 'stimulant', subtype: 'caffè', label: 'Caffè espresso amaro', time: 6.75 },
      { id: 'coffee_930', type: 'stimulant', subtype: 'caffè', label: 'Caffè espresso amaro', time: 9.5 },
    ],
    mealTimes: { other_client_meal: 11 },
    dayTargetSnapshot: { total: 2000 },
    rev: 20,
    writeProtocol: 1,
    revBy: UID,
    revAt: Date.now(),
  });

  // Client stantio: solo sonno, manualNodes vuoto, rev attesa 19; aggiunge un pasto.
  // Prima: sostituzione array → wipe caffè + meal altrui. Ora: merge per id.
  const stalePatch = {
    data: DATE,
    log: [
      { type: 'sleep', id: 'sleep_keep' },
      {
        type: 'meal',
        mealId: 'stale_client_meal',
        desc: 'Pranzo',
        items: [{ id: 'f_stale', foodName: 'Pane', grams: 80 }],
      },
    ],
    mealTimes: { stale_client_meal: 13 },
    manualNodes: [],
    hasEditedNodes: true,
  };

  const { node } = await saveDayNodeWithRevRetry({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: stalePatch,
    expectedRev: 19,
  });

  assert.equal(node.rev, 21);
  assert.ok(node.log.some((row) => row.id === 'sleep_keep'));
  assert.ok(node.log.some((row) => row.mealId === 'other_client_meal'), 'pasto dell’altro client conservato');
  assert.ok(node.log.some((row) => row.mealId === 'stale_client_meal'), 'pasto del client stantio aggiunto');
  assert.equal(node.manualNodes.length, 2);
  assert.ok(node.manualNodes.some((n) => n.id === 'coffee_645'));
  assert.ok(node.manualNodes.some((n) => n.id === 'coffee_930'));
  assert.equal(node.mealTimes.other_client_meal, 11);
  assert.equal(node.mealTimes.stale_client_meal, 13);
});

test('caso rifiuto: set senza writeProtocol / senza rev → deny (app vecchia)', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [],
    rev: 2,
    writeProtocol: 1,
  });

  const noProtocol = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: [{ id: 'old', type: 'food', foodName: 'Mela' }],
      mealTimes: {},
      rev: 3,
      revBy: UID,
      revAt: Date.now(),
    },
    { idToken: token },
  );
  assert.equal(noProtocol.denied, true, noProtocol.raw);

  const noRev = await emulatorRestPut(
    DAY_PATH,
    {
      data: DATE,
      log: [{ id: 'old', type: 'food', foodName: 'Mela' }],
      mealTimes: {},
      writeProtocol: 1,
    },
    { idToken: token },
  );
  assert.equal(noRev.denied, true, noRev.raw);
  assert.equal((await adminDb.ref(DAY_PATH).get()).val().rev, 2);
});

test('noop: secondo salvataggio identico non bumpa rev (skip)', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ type: 'sleep', id: 'sleep_1' }],
    manualNodes: [{ id: 'c1', type: 'stimulant', label: 'Caffè' }],
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
    rev: 12,
    writeProtocol: 1,
    revBy: UID,
    revAt: Date.now(),
  });

  const patch = {
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
  };
  const first = await saveDayNodeWithRev({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: patch,
    expectedRev: 12,
  });
  assert.equal(first.skipped, true);
  assert.equal(first.rev, 12);

  const second = await saveDayNodeWithRevRetry({
    db: clientDb,
    uid: UID,
    dateStr: DATE,
    managedFields: patch,
    expectedRev: 12,
  });
  assert.equal(second.skipped, true);
  assert.equal(second.rev, 12);
  assert.equal((await adminDb.ref(DAY_PATH).get()).val().rev, 12);
});

test('idle 10 min senza azioni: zero scritture sul giorno (simulato)', async () => {
  // Non aspettiamo 10 minuti reali: N ritentativi identici come effect/timer idle.
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [
      { type: 'sleep', id: 'sleep_1' },
      { type: 'sleep', id: 'sleep_2' },
    ],
    manualNodes: [
      { id: 'coffee_a', type: 'stimulant', label: 'Caffè', time: 6.75 },
      { id: 'coffee_b', type: 'stimulant', label: 'Caffè', time: 9.5 },
    ],
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
    rev: 40,
    writeProtocol: 1,
    revBy: UID,
    revAt: Date.now(),
  });

  const idlePatch = {
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
  };
  // ~1 tick / 30s per 10 min ≈ 20; usiamo 24 per margine.
  const ticks = 24;
  let writes = 0;
  for (let i = 0; i < ticks; i += 1) {
    const result = await saveDayNodeWithRevRetry({
      db: clientDb,
      uid: UID,
      dateStr: DATE,
      managedFields: idlePatch,
      expectedRev: 40,
    });
    if (!result.skipped) writes += 1;
  }
  assert.equal(writes, 0);
  const live = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live.rev, 40);
  assert.equal(live.manualNodes.length, 2);
  assert.equal(live.log.length, 2);
});

test('caso offline: saveDayNodeWithRev fallisce senza scrivere', async () => {
  await adminDb.ref(DAY_PATH).set({
    data: DATE,
    log: [{ id: 'keep', type: 'food', foodName: 'Yogurt' }],
    rev: 3,
    writeProtocol: 1,
  });

  const desc = Object.getOwnPropertyDescriptor(globalThis.navigator || {}, 'onLine');
  const hadNav = typeof globalThis.navigator !== 'undefined';
  if (!hadNav) {
    globalThis.navigator = { onLine: false };
  } else {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  }

  let err = null;
  try {
    await saveDayNodeWithRev({
      db: clientDb,
      uid: UID,
      dateStr: DATE,
      managedFields: {
        log: [{ id: 'keep', type: 'food', foodName: 'Yogurt' }, { id: 'new', type: 'food', foodName: 'Pane' }],
      },
      expectedRev: 3,
    });
  } catch (e) {
    err = e;
  } finally {
    if (!hadNav) {
      delete globalThis.navigator;
    } else if (desc) {
      Object.defineProperty(globalThis.navigator, 'onLine', desc);
    } else {
      Object.defineProperty(globalThis.navigator, 'onLine', {
        configurable: true,
        writable: true,
        value: true,
      });
    }
  }

  assert.ok(err);
  assert.equal(String(err.code || '').includes('unavailable') || /offline/i.test(String(err.message)), true);
  const live = (await adminDb.ref(DAY_PATH).get()).val();
  assert.equal(live.rev, 3);
  assert.equal(live.log.length, 1);
  assert.equal(live.log[0].foodName, 'Yogurt');
});
