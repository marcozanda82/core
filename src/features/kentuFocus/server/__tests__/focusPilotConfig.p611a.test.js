/**
 * P6.11a — profilo pilota validabile offline; produzione irraggiungibile.
 * Zero Firebase reale. Zero Gemini.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPilotAdminApp,
  deletePilotAdminApp,
} from '../admin/createPilotAdminApp.js';
import {
  FOCUS_PILOT_CONNECTION_BLOCKED,
  assertFocusPilotConnectionAllowed,
  assertFocusPilotDatabaseUrlCoherence,
  assertFocusPilotSingleUid,
  parseFocusPilotConfigFromEnvWithOverrides,
  sanitizeFocusPilotConfigResult,
  validateFocusPilotConfig,
} from '../admin/focusPilotConfig.v1.js';
import { assertFocusAdminRuntime } from '../admin/runFocusAdminEdition.js';

const FICTIONAL = {
  expectedProjectId: 'ghostapp-prod-fixture',
  expectedDatabaseUrl:
    'https://ghostapp-prod-fixture-default-rtdb.europe-west1.firebasedatabase.app',
  pilotUid: 'pilot_user_fixture_01',
  publicationDate: '2026-10-17',
};

function validInput(overrides = {}) {
  return {
    ...FICTIONAL,
    explicitRegen: false,
    geminiProvider: null,
    requireFallbackProse: true,
    schedulingEnabled: false,
    parallelExecutionEnabled: false,
    adminTokenConfigured: true,
    ...overrides,
  };
}

test('P6.11a profilo valido (fittizio) → ok, connectionActivated false', () => {
  const r = validateFocusPilotConfig(validInput());
  assert.equal(r.ok, true, r.errors?.join(','));
  assert.equal(r.config.connectionActivated, false);
  assert.equal(r.config.explicitRegen, false);
  assert.equal(r.config.geminiProvider, null);
  assert.equal(r.config.operatorReportRequired, true);
});

test('P6.11a più UID / wildcard / vuoto → respinti', () => {
  assert.equal(
    validateFocusPilotConfig(validInput({ pilotUid: 'a,b' })).errors.includes(
      'pilot_uid_multiple_forbidden',
    ),
    true,
  );
  assert.equal(assertFocusPilotSingleUid('uid_a,uid_b').error, 'pilot_uid_multiple_forbidden');
  assert.equal(assertFocusPilotSingleUid('uid_*').error, 'pilot_uid_wildcard_forbidden');
  assert.equal(assertFocusPilotSingleUid('').error, 'pilot_uid_required');
  assert.equal(assertFocusPilotSingleUid(null).error, 'pilot_uid_required');
});

test('P6.11a projectId / databaseURL incongruenti → respinti', () => {
  assert.equal(
    assertFocusPilotDatabaseUrlCoherence(
      'ghostapp-prod-fixture',
      'https://other-project-default-rtdb.europe-west1.firebasedatabase.app',
    ).error,
    'pilot_database_url_project_mismatch',
  );
  const r = validateFocusPilotConfig(validInput({
    expectedDatabaseUrl:
      'https://totally-different-default-rtdb.europe-west1.firebasedatabase.app',
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('pilot_database_url_project_mismatch'));
});

test('P6.11a demo / emulator URL non accettati come pilota reale', () => {
  assert.equal(
    assertFocusPilotDatabaseUrlCoherence(
      'demo-kentu-focus',
      'https://demo-kentu-focus-default-rtdb.firebaseio.com',
    ).error,
    'pilot_database_url_demo_forbidden',
  );
  assert.equal(
    assertFocusPilotDatabaseUrlCoherence(
      'ghostapp-prod-fixture',
      'http://127.0.0.1:9000?ns=ghostapp-prod-fixture',
    ).error,
    'pilot_database_url_https_required',
  );
  assert.equal(
    assertFocusPilotDatabaseUrlCoherence(
      'ghostapp-prod-fixture',
      'https://localhost:9000/?ns=ghostapp-prod-fixture',
    ).error,
    'pilot_database_url_emulator_forbidden',
  );
  const demoProject = validateFocusPilotConfig(validInput({
    expectedProjectId: 'demo-kentu-focus',
    expectedDatabaseUrl: 'https://demo-kentu-focus-default-rtdb.firebaseio.com',
  }));
  assert.equal(demoProject.ok, false);
  assert.ok(demoProject.errors.includes('pilot_project_demo_forbidden'));
});

test('P6.11a regen vietata; data assente/invalida respinta', () => {
  const regen = validateFocusPilotConfig(validInput({ explicitRegen: true }));
  assert.ok(regen.errors.includes('pilot_regen_forbidden'));

  assert.ok(
    validateFocusPilotConfig(validInput({ publicationDate: null }))
      .errors.includes('pilot_publication_date_required'),
  );
  assert.ok(
    validateFocusPilotConfig(validInput({ publicationDate: '17-10-2026' }))
      .errors.includes('pilot_publication_date_invalid'),
  );

  const withGemini = validateFocusPilotConfig(validInput({
    geminiProvider: { generate: async () => ({}) },
  }));
  assert.ok(withGemini.errors.includes('pilot_gemini_forbidden'));

  const sched = validateFocusPilotConfig(validInput({ schedulingEnabled: true }));
  assert.ok(sched.errors.includes('pilot_scheduling_forbidden'));
});

test('P6.11a sanitize: niente UID completo / token / secret nei diagnostici', () => {
  const uid = 'abcdefghijklmnop';
  const r = validateFocusPilotConfig(validInput({ pilotUid: uid }));
  const safe = sanitizeFocusPilotConfigResult(r);
  const blob = JSON.stringify(safe);
  assert.ok(!blob.includes(uid));
  assert.ok(!blob.includes('fictional-token'));
  assert.ok(safe.config.subject.startsWith('uid:'));
  assert.equal(safe.config.expectedDatabaseHost.includes('ghostapp-prod-fixture'), true);
  assert.ok(!blob.includes('FOCUS_ADMIN_TOKEN'));
  assert.equal(safe.connectionGate.error, FOCUS_PILOT_CONNECTION_BLOCKED);
});

test('P6.11a produzione bloccata anche con tutti i flag impostati', () => {
  const had = {
    emu: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    allow: process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR,
    pilot: process.env.FOCUS_PILOT_ENABLE,
    run: process.env.FOCUS_PILOT_RUN,
  };
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';
    process.env.FOCUS_PILOT_ENABLE = '1';
    process.env.FOCUS_PILOT_RUN = '1';

    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');
    assert.equal(assertFocusPilotConnectionAllowed().error, FOCUS_PILOT_CONNECTION_BLOCKED);

    const app = createPilotAdminApp({
      expectedProjectId: FICTIONAL.expectedProjectId,
      expectedDatabaseUrl: FICTIONAL.expectedDatabaseUrl,
      enableFlag: '1',
      credentialsPath: 'C:\\secrets\\should-not-load.json',
    });
    assert.equal(app.ok, false);
    assert.equal(app.db, null);
    assert.equal(app.activated, false);
    assert.equal(app.error, FOCUS_PILOT_CONNECTION_BLOCKED);
  } finally {
    if (had.emu == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had.emu;
    if (had.allow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = had.allow;
    if (had.pilot == null) delete process.env.FOCUS_PILOT_ENABLE;
    else process.env.FOCUS_PILOT_ENABLE = had.pilot;
    if (had.run == null) delete process.env.FOCUS_PILOT_RUN;
    else process.env.FOCUS_PILOT_RUN = had.run;
  }
});

test('P6.11a createPilotAdminApp non inizializza SDK; delete no-op', async () => {
  const a = createPilotAdminApp();
  assert.equal(a.app, null);
  assert.equal(a.databaseURL, null);
  const d = await deletePilotAdminApp();
  assert.equal(d.ok, true);
  assert.equal(d.deleted, false);
});

test('P6.11a override regen in parse env → ancora errore contratto', () => {
  const env = {
    FOCUS_PILOT_EXPECTED_PROJECT: FICTIONAL.expectedProjectId,
    FOCUS_PILOT_EXPECTED_DATABASE_URL: FICTIONAL.expectedDatabaseUrl,
    FOCUS_PILOT_UID: FICTIONAL.pilotUid,
    FOCUS_PILOT_PUBLICATION_DATE: FICTIONAL.publicationDate,
    FOCUS_ADMIN_TOKEN: 'fictional-token-16chars',
  };
  const r = parseFocusPilotConfigFromEnvWithOverrides(env, { explicitRegen: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('pilot_regen_forbidden'));
});

test('P6.11a I4-H non-emulator block invariato (non_emulator_admin_blocked_in_i4h)', () => {
  const had = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';
    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');
  } finally {
    if (had == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
  }
});
