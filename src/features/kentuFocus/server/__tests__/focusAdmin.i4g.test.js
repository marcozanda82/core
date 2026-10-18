/**
 * I4-G — entry point admin + gate sonno + auth (emulator).
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import {
  assertFocusAdminAuthorization,
  assertFocusAdminRuntime,
  runFocusAdminEdition,
} from '../admin/runFocusAdminEdition.js';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import { emulatorRestGet, loadFocusLocalRules } from '../emulator/loadFocusRules.js';
import { runFocusEditionPipeline } from '../pipeline/runFocusEditionPipeline.js';
import { bodyMetricsRootPath, profileTargetsPath } from '../paths/userDataRtdbPaths.js';
import {
  PUBLICATION_DATE,
  buildFullTrackerDayMap,
  buildNoSleepTrackerMap,
  clearUserFocusAndTracker,
  seedTrackerMap,
} from './fixtures/i4eTrackerFixtures.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const ADMIN_TOKEN = 'i4g-test-admin-token';
const EXPECTED_PROJECT = 'demo-kentu-focus';
const ALLOWED = 'i4g_admin_ok,i4g_admin_nosleep,i4g_ordinary';

/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {string|null} */
let projectId = null;

before(async () => {
  if (!EMULATOR) return;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  process.env.FOCUS_ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.FOCUS_ADMIN_ALLOWED_UIDS = ALLOWED;
  process.env.FOCUS_ADMIN_EXPECTED_PROJECT = EXPECTED_PROJECT;
  const app = createEmulatorAdminApp();
  db = app.db;
  projectId = app.projectId;
  await loadFocusLocalRules();
});

after(async () => {
  if (!db) return;
  await db.ref('kentu_focus').set(null);
  await db.ref('users').set(null);
  await deleteEmulatorAdminApp();
  delete process.env.FOCUS_ADMIN_TOKEN;
  delete process.env.FOCUS_ADMIN_ALLOWED_UIDS;
  delete process.env.FOCUS_ADMIN_EXPECTED_PROJECT;
  delete process.env.FOCUS_ADMIN_ALLOW_REGEN;
});

test('I4-G admin auth: token richiesto; runtime emulator', () => {
  const rt = assertFocusAdminRuntime();
  if (EMULATOR) assert.equal(rt.ok, true);
  else assert.equal(rt.error, 'emulator_required');

  assert.equal(assertFocusAdminAuthorization({ adminToken: 'wrong' }).ok, false);
  assert.equal(
    assertFocusAdminAuthorization({ adminToken: ADMIN_TOKEN, expectedToken: ADMIN_TOKEN }).ok,
    true,
  );
});

test('I4-G admin edition: happy path + unauthorized + no sleep bypass', { skip: !EMULATOR }, async () => {
  const uid = 'i4g_admin_ok';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 14 }));
  await db.ref(profileTargetsPath(uid)).set({
    profile: { weight: 80 },
    targets: {
      targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 2300, prot: 150 } }],
    },
  });
  await db.ref(bodyMetricsRootPath(uid)).set({
    a: { date: '2026-10-15', weight: 78.4 },
  });

  const rateLimitState = { lastAtMs: 0, minIntervalMs: 0 };

  const denied = await runFocusAdminEdition({
    uid,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: 'bad',
    projectId,
    rateLimitState,
  });
  assert.equal(denied.error, 'admin_unauthorized');

  const notAllowed = await runFocusAdminEdition({
    uid: 'not_in_allowlist_xx',
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId,
    rateLimitState,
  });
  assert.equal(notAllowed.error, 'admin_uid_not_allowlisted');

  const wrongProject = await runFocusAdminEdition({
    uid,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId: 'other-project-id',
    rateLimitState,
  });
  assert.equal(wrongProject.error, 'admin_project_mismatch');

  const ok = await runFocusAdminEdition({
    uid,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId,
    horizon: 'd7',
    rateLimitState,
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.revision, 1);
  assert.ok(ok.editionSummary?.headline);
  assert.ok(!('dossierInput' in ok));
  assert.ok(!JSON.stringify(ok).includes(ADMIN_TOKEN));
  assert.ok(ok.authContext?.subject);
  assert.ok(!JSON.stringify(ok.authContext).includes(uid));

  // Client legge solo edizione pubblicata
  const token = await createEmulatorIdToken(uid);
  const meta = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/meta`,
    { idToken: token },
  );
  assert.equal(meta.denied, false, meta.raw);
  const parent = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}`,
    { idToken: token },
  );
  assert.equal(parent.denied, true, parent.raw);

  // Replay idempotente
  const replay = await runFocusAdminEdition({
    uid,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId,
    horizon: 'd7',
    rateLimitState,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotentReplay, true);

  // Regen esplicita senza env → rifiutata (niente regen silenziosa)
  const regenDenied = await runFocusAdminEdition({
    uid,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId,
    explicitRegen: true,
    rateLimitState,
  });
  assert.equal(regenDenied.error, 'admin_regen_not_enabled');

  // No sleep → admin non bypassa
  const uid2 = 'i4g_admin_nosleep';
  await clearUserFocusAndTracker(db, uid2);
  await seedTrackerMap(db, uid2, buildNoSleepTrackerMap());
  const nosleep = await runFocusAdminEdition({
    uid: uid2,
    publicationDate: PUBLICATION_DATE,
    db,
    adminToken: ADMIN_TOKEN,
    projectId,
    rateLimitState,
  });
  assert.equal(nosleep.error, 'sleep_required');
});

test('I4-G pipeline: pubblicazione ordinaria valida; flag bypass ignorato', { skip: !EMULATOR }, async () => {
  const uid = 'i4g_ordinary';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 14 }));
  await db.ref(profileTargetsPath(uid)).set({
    targets: {
      targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 2300, prot: 150 } }],
    },
  });
  const out = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, horizon: 'd7',
    adminAllowPublishWithoutSleep: true,
  });
  assert.equal(out.ok, true, out.error);
  assert.ok(out.report.notes.includes('ignored_client_sleep_bypass_flag'));
});
