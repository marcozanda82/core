/**
 * Verifica write client di dayTargetSnapshot sotto tracker_data/trackerStorico_YYYY-MM-DD
 * e persistenza focus_day_scores kds-4 (regole produzione).
 * Richiede emulatore Auth+Database già attivi.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../kentuFocus/server/emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../../kentuFocus/server/emulator/createEmulatorAuthToken.js';
import {
  emulatorRestPut,
  loadFocusLocalRules,
} from '../../kentuFocus/server/emulator/loadFocusRules.js';
import { buildDayTargetSnapshot } from '../resolveDayTargetKcal.js';

const UID = 'day_target_snapshot_rules_user';
const DATE = '2026-11-10';
const STORICO = `trackerStorico_${DATE}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');

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
  await db.ref(`users/${UID}/tracker_data`).set(null);
  await db.ref(`users/${UID}/focus_day_scores`).set(null);
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('dayTargetSnapshot: update client su trackerStorico accettato (nessuna validate campo giorno)', async () => {
  assert.ok(token);
  const dayPath = `users/${UID}/tracker_data/${STORICO}`;
  await db.ref(dayPath).set({
    data: DATE,
    log: [],
    autopilotCorrection: 0,
  });

  const dayTargetSnapshot = buildDayTargetSnapshot({
    base: 2456,
    burnRaw: 400,
    burnCounted: 200,
    kcalSource: 'estimated',
    autopilot: 40,
    strategy: 0,
    compensation: -50,
    total: 2646,
    rulesVersion: 'dtr-1',
  });

  // Stesso shape del client: update parziale su autopilotCorrection + dayTargetSnapshot.
  const res = await emulatorRestPut(
    dayPath,
    {
      data: DATE,
      log: [],
      autopilotCorrection: 40,
      dayTargetSnapshot,
    },
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);

  const snap = await db.ref(`${dayPath}/dayTargetSnapshot`).get();
  assert.equal(snap.val()?.total, 2646);
  assert.equal(snap.val()?.rulesVersion, 'dtr-1');
  assert.equal(snap.val()?.kcalSource, 'estimated');
});

test('dayTargetSnapshot: PUT diretto del solo figlio accettato', async () => {
  const payload = buildDayTargetSnapshot({
    base: 2456,
    burnRaw: 0,
    burnCounted: 0,
    kcalSource: 'user',
    autopilot: 0,
    strategy: 0,
    compensation: 0,
    total: 2456,
  });
  const res = await emulatorRestPut(
    `users/${UID}/tracker_data/${STORICO}/dayTargetSnapshot`,
    payload,
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);
});

test('focus_day_scores kds-4: write client autenticato accettata', async () => {
  const payload = {
    version: 'kds-4',
    reliability: 'high',
    dataVersion: 'fnv1a-testkds4',
    score: 0.72,
    cylinders: {
      alimentazione: {
        status: 'on_track',
        keyFact: '2400 kcal · target 2456',
        signals: ['late_first_meal'],
        value: 0.85,
      },
      sonno: {
        status: 'on_track',
        keyFact: '7 h 30',
        signals: [],
        value: 1,
      },
      movimento: {
        status: 'halfway',
        keyFact: 'oggi 20 min',
        signals: [],
        value: 0.6,
      },
      forza: {
        status: 'on_track',
        keyFact: 'parte alta quel giorno',
        signals: [],
        value: 1,
      },
    },
  };
  const res = await emulatorRestPut(
    `users/${UID}/focus_day_scores/${DATE}`,
    payload,
    { idToken: token },
  );
  assert.equal(res.statusCode, 200, `atteso 200, got ${res.statusCode} ${res.raw}`);
  assert.equal(res.denied, false, res.raw);
  const snap = await db.ref(`users/${UID}/focus_day_scores/${DATE}`).get();
  assert.equal(snap.val()?.version, 'kds-4');
});

test('focus_day_scores kds-4: shape legacy cardio senza movimento rifiutata', async () => {
  const payload = {
    version: 'kds-4',
    reliability: 'high',
    dataVersion: 'fnv1a-bad',
    score: 0.5,
    cylinders: {
      alimentazione: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
      sonno: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
      forza: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
      cardio: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
    },
  };
  const res = await emulatorRestPut(
    `users/${UID}/focus_day_scores/2026-11-09`,
    payload,
    { idToken: token },
  );
  assert.ok(
    res.statusCode >= 400 || res.denied,
    `atteso deny, got ${res.statusCode} ${res.raw}`,
  );
});
