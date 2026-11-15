/**
 * Verifica che le regole RTDB accettino safety_status con version sfv-1/2/3.
 * Richiede emulatore Auth+Database già attivi.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../server/emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../../server/emulator/createEmulatorAuthToken.js';
import {
  emulatorRestPut,
  loadFocusLocalRules,
} from '../../server/emulator/loadFocusRules.js';

const UID = 'safety_rules_sfv2_user';
const DATE = '2026-11-10';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {string|null} */
let token = null;

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules(path.join(ROOT, 'database.rules.json'));
  token = await createEmulatorIdToken(UID);
  await db.ref(`users/${UID}/safety_status`).set(null);
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('sfv-3: write client autenticato accettata dalle regole', async () => {
  assert.ok(token);
  const payload = {
    version: 'sfv-3',
    level: 'watch',
    signals: {
      _count: 1,
      same_district_no_recovery: {
        id: 'same_district_no_recovery',
        area: 'allenamento',
        level: 'watch',
        evidence: { district: 'pettorali', shortGaps: 2 },
      },
    },
  };
  const res = await emulatorRestPut(
    `users/${UID}/safety_status/${DATE}`,
    payload,
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);
  const snap = await db.ref(`users/${UID}/safety_status/${DATE}`).get();
  assert.equal(snap.val()?.version, 'sfv-3');
});

test('sfv-2: write legacy ancora accettata', async () => {
  const payload = {
    version: 'sfv-2',
    level: 'watch',
    signals: {
      _count: 1,
      energy_deficit_sustained: {
        id: 'energy_deficit_sustained',
        area: 'alimentazione',
        level: 'watch',
        evidence: {},
      },
    },
  };
  const res = await emulatorRestPut(
    `users/${UID}/safety_status/2026-11-09`,
    payload,
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);
});

test('sfv-1: write legacy ancora accettata', async () => {
  const payload = {
    version: 'sfv-1',
    level: 'none',
    signals: { _count: 0 },
  };
  const res = await emulatorRestPut(
    `users/${UID}/safety_status/2026-11-07`,
    payload,
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);
});

test('sfv-9: versione sconosciuta rifiutata', async () => {
  const payload = {
    version: 'sfv-9',
    level: 'none',
    signals: { _count: 0 },
  };
  const res = await emulatorRestPut(
    `users/${UID}/safety_status/2026-11-08`,
    payload,
    { idToken: token },
  );
  assert.ok(
    res.statusCode >= 400 || res.denied,
    `atteso deny, got ${res.statusCode} ${res.raw}`,
  );
});
