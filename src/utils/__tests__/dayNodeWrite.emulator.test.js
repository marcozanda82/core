/**
 * Emulatore Auth+Database — rev obbligatoria sulle regole + writer transazionale.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../../features/kentuFocus/server/emulator/createEmulatorAuthToken.js';
import {
  emulatorRestPatch,
  emulatorRestPut,
  loadFocusLocalRules,
} from '../../features/kentuFocus/server/emulator/loadFocusRules.js';
import { mergeDayNodeWrite } from '../dayNodeWrite.js';

const UID = 'day_rev_emu_user';
const DATE = '2026-11-10';
const STORICO = `trackerStorico_${DATE}`;
const DAY_PATH = `users/${UID}/tracker_data/${STORICO}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

/** @type {import('firebase-admin/database').Database | null} */
let adminDb = null;
/** @type {string|null} */
let token = null;

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
});

after(async () => {
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
  assert.equal(node.log[0].foodName, 'Pera');
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
