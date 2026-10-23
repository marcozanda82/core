/**
 * P6.11c — confini applicativi pilota (offline, zero Firebase reale, zero Gemini).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertFocusPilotExecutionBound,
  buildFocusPilotBoundInput,
} from '../admin/assertFocusPilotExecutionBound.js';
import {
  createPilotGuardedAdminDatabase,
  FOCUS_PILOT_GUARDED_DB_METHODS,
  FOCUS_PILOT_ADMIN_METHODS_UNCOVERED,
} from '../admin/createPilotGuardedAdminDatabase.js';
import { createPilotAdminApp } from '../admin/createPilotAdminApp.js';
import {
  createFocusPilotContext,
  createFocusPilotContextFromInput,
} from '../admin/focusPilotContext.js';
import {
  createFocusPilotPathGuard,
  parseFocusPilotPathSegments,
} from '../admin/focusPilotPathGuard.js';
import {
  assertFocusPilotConnectionAllowed,
  FOCUS_PILOT_CONNECTION_BLOCKED,
  validateFocusPilotConfig,
} from '../admin/focusPilotConfig.v1.js';
import {
  FOCUS_PILOT_RUNTIME_INACTIVE,
  FOCUS_PILOT_TEST_HARNESS,
  resolveFocusPilotContext,
  runFocusPilotEdition,
} from '../admin/runFocusPilotEdition.js';
import {
  assertFocusAdminRuntime,
} from '../admin/runFocusAdminEdition.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';

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

function makeContext(overrides = {}) {
  const r = createFocusPilotContextFromInput(validInput(overrides));
  assert.equal(r.ok, true, r.error);
  return r.context;
}

test('P6.11c-1 contesto immutabile + UID/data corretti accettati', () => {
  const ctx = makeContext();
  assert.equal(Object.isFrozen(ctx), true);
  assert.equal(ctx.mode, 'pilot');
  assert.equal(ctx.explicitRegenAllowed, false);
  assert.equal(ctx.geminiAllowed, false);
  assert.equal(ctx.connectionActivated, false);

  const bound = assertFocusPilotExecutionBound(ctx, {
    uid: FICTIONAL.pilotUid,
    publicationDate: FICTIONAL.publicationDate,
    explicitRegen: false,
    geminiProvider: null,
    allowedUids: FICTIONAL.pilotUid,
    projectId: FICTIONAL.expectedProjectId,
  });
  assert.equal(bound.ok, true, bound.error);

  const forced = buildFocusPilotBoundInput(ctx, {
    explicitRegen: true,
    geminiProvider: { fake: true },
    uid: 'other_user_xxxxxxxx',
  });
  assert.equal(forced.explicitRegen, false);
  assert.equal(forced.geminiProvider, null);
  assert.equal(forced.uid, FICTIONAL.pilotUid);
});

test('P6.11c-2 UID differente rifiutato', () => {
  const ctx = makeContext();
  const bound = assertFocusPilotExecutionBound(ctx, {
    uid: 'other_user_fixture_99',
    publicationDate: FICTIONAL.publicationDate,
    explicitRegen: false,
  });
  assert.equal(bound.ok, false);
  assert.equal(bound.error, 'pilot_uid_mismatch');
});

test('P6.11c-3 data differente rifiutata', () => {
  const ctx = makeContext();
  const bound = assertFocusPilotExecutionBound(ctx, {
    uid: FICTIONAL.pilotUid,
    publicationDate: '2026-10-18',
    explicitRegen: false,
  });
  assert.equal(bound.ok, false);
  assert.equal(bound.error, 'pilot_publication_date_mismatch');
});

test('P6.11c-4 regen rifiutata anche con flag abilitanti', async () => {
  const ctx = makeContext();
  const had = process.env.FOCUS_ADMIN_ALLOW_REGEN;
  try {
    process.env.FOCUS_ADMIN_ALLOW_REGEN = '1';
    const bound = assertFocusPilotExecutionBound(ctx, {
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      explicitRegen: true,
      geminiProvider: null,
    });
    assert.equal(bound.ok, false);
    assert.equal(bound.error, 'pilot_regen_forbidden');

    const run = await runFocusPilotEdition({
      pilotContext: ctx,
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      explicitRegen: true,
      adminToken: 'p611c-strong-token-01',
    });
    assert.equal(run.ok, false);
    assert.equal(run.error, 'pilot_regen_forbidden');
  } finally {
    if (had == null) delete process.env.FOCUS_ADMIN_ALLOW_REGEN;
    else process.env.FOCUS_ADMIN_ALLOW_REGEN = had;
  }
});

test('P6.11c-5 Gemini provider rifiutato nel pilota', () => {
  const ctx = makeContext();
  const bound = assertFocusPilotExecutionBound(ctx, {
    uid: FICTIONAL.pilotUid,
    publicationDate: FICTIONAL.publicationDate,
    explicitRegen: false,
    geminiProvider: { generate: () => {} },
  });
  assert.equal(bound.ok, false);
  assert.equal(bound.error, 'pilot_gemini_forbidden');
});

test('P6.11c allowlist multipla / secondo UID rifiutati', () => {
  const ctx = makeContext();
  assert.equal(
    assertFocusPilotExecutionBound(ctx, {
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      allowedUids: `${FICTIONAL.pilotUid},other_user_xx`,
    }).error,
    'pilot_allowlist_multiple_forbidden',
  );
  assert.equal(
    assertFocusPilotExecutionBound(ctx, {
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      allowedUids: 'other_user_fixture_99',
    }).error,
    'pilot_allowlist_uid_mismatch',
  );
});

test('P6.11c-6 letture diario altro UID rifiutate', () => {
  const guard = createFocusPilotPathGuard(makeContext());
  const r = guard.assertRead(
    'users/other_user_fixture_99/tracker_data/trackerStorico_2026-10-16',
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'pilot_path_uid_mismatch');
});

test('P6.11c-7 scritture tracker rifiutate', async () => {
  const ctx = makeContext();
  const db = createPilotGuardedAdminDatabase(ctx, createMockAdminRtdb());
  await assert.rejects(
    () => db.ref(`users/${FICTIONAL.pilotUid}/tracker_data/trackerStorico_2026-10-16`).set({ x: 1 }),
    (err) => err && err.code === 'pilot_path_users_write_forbidden',
  );
});

test('P6.11c-8 scritture Focus altri UID rifiutate', async () => {
  const ctx = makeContext();
  const db = createPilotGuardedAdminDatabase(ctx, createMockAdminRtdb());
  await assert.rejects(
    () => db.ref('kentu_focus/other_user_fixture_99/editorial_memory').set({ a: 1 }),
    (err) => err && err.code === 'pilot_path_uid_mismatch',
  );
});

test('P6.11c-9 path con prefissi UID simili rifiutati', () => {
  const guard = createFocusPilotPathGuard(makeContext());
  const similar = `${FICTIONAL.pilotUid}x`;
  assert.equal(
    guard.assertRead(`users/${similar}/tracker_data/trackerStorico_2026-10-16`).error,
    'pilot_path_uid_mismatch',
  );
  assert.equal(
    guard.assertWrite(`kentu_focus/${similar}/editorial_memory`).error,
    'pilot_path_uid_mismatch',
  );
  // Prefisso testuale ambiguo: stringa startsWith non deve bastare
  assert.equal(
    guard.assertRead(
      `users/${FICTIONAL.pilotUid.slice(0, -1)}/profile_targets`,
    ).error,
    'pilot_path_uid_mismatch',
  );
});

test('P6.11c-10 traversal e segmenti malformati rifiutati', () => {
  assert.equal(
    parseFocusPilotPathSegments('../kentu_focus/x').error,
    'pilot_path_traversal_forbidden',
  );
  assert.equal(
    parseFocusPilotPathSegments('kentu_focus/../users/a').error,
    'pilot_path_traversal_forbidden',
  );
  assert.equal(parseFocusPilotPathSegments('').error, 'pilot_path_empty');
  assert.equal(parseFocusPilotPathSegments('/kentu_focus/a').error, 'pilot_path_malformed');
  assert.equal(
    parseFocusPilotPathSegments('kentu_focus//editorial_memory').error,
    'pilot_path_malformed',
  );

  const guard = createFocusPilotPathGuard(makeContext());
  assert.equal(
    guard.assertWrite(`kentu_focus/${FICTIONAL.pilotUid}`).error,
    'pilot_path_focus_root_forbidden',
  );
  assert.equal(
    guard.assertWrite(`kentu_focus/${FICTIONAL.pilotUid}/archive_index`).error,
    'pilot_path_archive_root_write_forbidden',
  );
});

test('P6.11c-11 multi-path: una destinazione vietata → respinge intero update prima dell\'invio', async () => {
  const ctx = makeContext();
  const inner = createMockAdminRtdb();
  const db = createPilotGuardedAdminDatabase(ctx, inner);
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const metaPath = `kentu_focus/${uid}/editions/${date}/meta`;

  await assert.rejects(
    () => db.ref().update({
      [metaPath]: { ok: true },
      [`users/${uid}/tracker_data/trackerStorico_2026-10-16`]: { evil: true },
    }),
    (err) => err && err.code === 'pilot_path_users_write_forbidden',
  );
  // Niente scritto (né meta né tracker)
  assert.equal(inner._get(metaPath), undefined);
  assert.equal(
    inner._get(`users/${uid}/tracker_data/trackerStorico_2026-10-16`),
    undefined,
  );
});

test('P6.11c-12 lettura archive stesso UID consentita (più date)', () => {
  const guard = createFocusPilotPathGuard(makeContext());
  const uid = FICTIONAL.pilotUid;
  assert.equal(guard.assertRead(`kentu_focus/${uid}/archive_index`).ok, true);
  assert.equal(guard.assertRead(`kentu_focus/${uid}/archive_index/2026-10-10`).ok, true);
  assert.equal(guard.assertRead(`kentu_focus/${uid}/archive_index/2026-10-17`).ok, true);
});

test('P6.11c-13 percorsi barriera / memory_event / report consentiti', () => {
  const guard = createFocusPilotPathGuard(makeContext());
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const reads = [
    `users/${uid}/tracker_data/trackerStorico_2026-10-16`,
    `users/${uid}/profile_targets`,
    `users/${uid}/body_metrics`,
    `kentu_focus/${uid}/editions/${date}/meta`,
    `kentu_focus/${uid}/editions/${date}/rev/1`,
    `kentu_focus/${uid}/editions/${date}/memory_events/1`,
    `kentu_focus/${uid}/jobs/${date}`,
    `kentu_focus/${uid}/archive_index/${date}`,
    `kentu_focus/${uid}/editorial_memory`,
  ];
  for (const p of reads) {
    assert.equal(guard.assertRead(p).ok, true, `read ${p}`);
  }
  const writes = [
    `kentu_focus/${uid}/editions/${date}/meta`,
    `kentu_focus/${uid}/editions/${date}/rev/1`,
    `kentu_focus/${uid}/editions/${date}/memory_events/1`,
    `kentu_focus/${uid}/jobs/${date}`,
    `kentu_focus/${uid}/jobs/${date}/status`,
    `kentu_focus/${uid}/archive_index/${date}`,
    `kentu_focus/${uid}/editorial_memory`,
  ];
  for (const p of writes) {
    assert.equal(guard.assertWrite(p).ok, true, `write ${p}`);
  }
});

test('P6.11c guarded db: lettura tracker ok, scrittura Focus ok', async () => {
  const ctx = makeContext();
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const day = `users/${uid}/tracker_data/trackerStorico_2026-10-16`;
  const meta = `kentu_focus/${uid}/editions/${date}/meta`;
  const inner = createMockAdminRtdb({ [day]: { sleep: 1 } });
  const db = createPilotGuardedAdminDatabase(ctx, inner);

  const snap = await db.ref(day).once('value');
  assert.deepEqual(snap.val(), { sleep: 1 });

  const tx = await db.ref(meta).transaction(() => ({ currentRevision: 1 }));
  assert.equal(tx.committed, true);
  assert.equal(inner._get(meta)?.currentRevision, 1);
});

test('P6.11c-14 emulatore ordinario: runtime invariato (nessuna regressione gate)', () => {
  const had = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  try {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    assert.equal(assertFocusAdminRuntime().ok, true);
    assert.equal(assertFocusAdminRuntime().emulator, true);
  } finally {
    if (had == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
  }
});

test('P6.11c-15 produzione bloccata con qualsiasi combinazione di flag', async () => {
  const ctx = makeContext();
  const hadEmu = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  const hadRegen = process.env.FOCUS_ADMIN_ALLOW_REGEN;
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';
    process.env.FOCUS_ADMIN_ALLOW_REGEN = '1';

    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');
    assert.equal(assertFocusPilotConnectionAllowed().error, FOCUS_PILOT_CONNECTION_BLOCKED);
    assert.equal(createPilotAdminApp({
      expectedProjectId: FICTIONAL.expectedProjectId,
      expectedDatabaseUrl: FICTIONAL.expectedDatabaseUrl,
      enableFlag: '1',
    }).activated, false);

    const pilot = await runFocusPilotEdition({
      pilotContext: ctx,
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      adminToken: 'p611c-strong-token-01',
    });
    assert.equal(pilot.ok, false);
    assert.equal(pilot.error, FOCUS_PILOT_RUNTIME_INACTIVE);
    assert.equal(pilot.activated, false);

    // Anche con mock test-harness, runtime non-emulator resta bloccato
    const pilotWithMock = await runFocusPilotEdition({
      pilotContext: ctx,
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      adminToken: 'p611c-strong-token-01',
      [FOCUS_PILOT_TEST_HARNESS]: { mockDb: createMockAdminRtdb() },
    });
    assert.equal(pilotWithMock.ok, false);
    assert.equal(pilotWithMock.error, 'non_emulator_admin_blocked_in_i4h');

    // offlineDb pubblico → rifiutato (wiring chiuso P6.11e)
    const legacyOffline = await runFocusPilotEdition({
      pilotContext: ctx,
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      adminToken: 'p611c-strong-token-01',
      offlineDb: createMockAdminRtdb(),
    });
    assert.equal(legacyOffline.ok, false);
    assert.equal(legacyOffline.error, 'pilot_offline_db_override_forbidden');
  } finally {
    if (hadEmu == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = hadEmu;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
    if (hadRegen == null) delete process.env.FOCUS_ADMIN_ALLOW_REGEN;
    else process.env.FOCUS_ADMIN_ALLOW_REGEN = hadRegen;
  }
});

test('P6.11c binding vale anche fuori CLI (resolve + assert)', () => {
  const validated = validateFocusPilotConfig(validInput());
  assert.equal(validated.ok, true);
  const resolved = resolveFocusPilotContext({ pilotConfig: validated.config });
  assert.equal(resolved.ok, true);
  // Discordanza projectId
  assert.equal(
    assertFocusPilotExecutionBound(resolved.context, {
      uid: FICTIONAL.pilotUid,
      publicationDate: FICTIONAL.publicationDate,
      projectId: 'other-project-id',
    }).error,
    'pilot_project_id_mismatch',
  );
});

test('P6.11c metodi protetti documentati; uncovered espliciti', () => {
  assert.ok(FOCUS_PILOT_GUARDED_DB_METHODS.includes('ref.update'));
  assert.ok(FOCUS_PILOT_GUARDED_DB_METHODS.includes('ref.transaction'));
  assert.ok(FOCUS_PILOT_ADMIN_METHODS_UNCOVERED.length >= 1);
});

test('P6.11c contesto rifiuta config con connectionActivated', () => {
  const validated = validateFocusPilotConfig(validInput());
  assert.equal(validated.ok, true);
  const poisoned = {
    ...validated.config,
    connectionActivated: true,
  };
  const rejected = createFocusPilotContext(poisoned);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'pilot_context_connection_must_be_inactive');
});
