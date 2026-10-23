/**
 * P6.11e — chiusura bypass wiring pilota (offline, zero Firebase reale).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFocusAdminPublishOperatorReport,
} from '../admin/buildFocusAdminPublishOperatorReport.js';
import {
  createPilotGuardedAdminDatabase,
} from '../admin/createPilotGuardedAdminDatabase.js';
import { createPilotAdminApp } from '../admin/createPilotAdminApp.js';
import {
  createFocusPilotContextFromInput,
} from '../admin/focusPilotContext.js';
import {
  assertFocusPilotConnectionAllowed,
  FOCUS_PILOT_CONNECTION_BLOCKED,
} from '../admin/focusPilotConfig.v1.js';
import {
  assertFocusPilotWiringClosed,
  FOCUS_PILOT_RUNTIME_INACTIVE,
  FOCUS_PILOT_TEST_HARNESS,
  runFocusPilotEdition,
  runFocusPilotEditionWithTestMock,
} from '../admin/runFocusPilotEdition.js';
import { assertFocusAdminRuntime } from '../admin/runFocusAdminEdition.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { AdminRtdbTrackerReader } from '../reader/AdminRtdbTrackerReader.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';
import {
  createEmptyEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import {
  PUBLISH_BARRIER_STABLE,
} from '../memory/publishBarrier.js';

const FICTIONAL = {
  expectedProjectId: 'ghostapp-prod-fixture',
  expectedDatabaseUrl:
    'https://ghostapp-prod-fixture-default-rtdb.europe-west1.firebasedatabase.app',
  pilotUid: 'pilot_user_fixture_01',
  publicationDate: '2026-10-17',
};

const TOKEN = 'p611e-strong-token-01xx';

function makeContext() {
  const r = createFocusPilotContextFromInput({
    ...FICTIONAL,
    explicitRegen: false,
    geminiProvider: null,
    requireFallbackProse: true,
    schedulingEnabled: false,
    parallelExecutionEnabled: false,
    adminTokenConfigured: true,
  });
  assert.equal(r.ok, true, r.error);
  return r.context;
}

function basePilotInput(ctx, extra = {}) {
  return {
    pilotContext: ctx,
    uid: FICTIONAL.pilotUid,
    publicationDate: FICTIONAL.publicationDate,
    adminToken: TOKEN,
    ...extra,
  };
}

test('P6.11e wiring: persistence grezza rifiutata', async () => {
  const ctx = makeContext();
  const raw = createMockAdminRtdb();
  const persistence = new AdminRtdbFocusPersistence(raw);
  assert.equal(
    assertFocusPilotWiringClosed({ persistence }).error,
    'pilot_persistence_override_forbidden',
  );
  const run = await runFocusPilotEdition(basePilotInput(ctx, { persistence }));
  assert.equal(run.ok, false);
  assert.equal(run.error, 'pilot_persistence_override_forbidden');
});

test('P6.11e wiring: reader grezzo rifiutato', async () => {
  const ctx = makeContext();
  const raw = createMockAdminRtdb();
  const reader = new AdminRtdbTrackerReader(raw);
  assert.equal(
    assertFocusPilotWiringClosed({ reader }).error,
    'pilot_reader_override_forbidden',
  );
  const run = await runFocusPilotEdition(basePilotInput(ctx, { reader }));
  assert.equal(run.ok, false);
  assert.equal(run.error, 'pilot_reader_override_forbidden');
});

test('P6.11e: nessun accesso a _inner sul guarded db', () => {
  const ctx = makeContext();
  const raw = createMockAdminRtdb();
  const guarded = createPilotGuardedAdminDatabase(ctx, raw);
  assert.equal(Object.prototype.hasOwnProperty.call(guarded, '_inner'), false);
  assert.equal(guarded._inner, undefined);
  assert.equal('inner' in guarded, false);
  assert.equal(Object.isFrozen(guarded), true);
  assert.throws(() => {
    guarded._inner = raw;
  });
  assert.equal(guarded._inner, undefined);
});

test('P6.11e: ref.parent / ref.root → deny, nessun escape', () => {
  const ctx = makeContext();
  const guarded = createPilotGuardedAdminDatabase(ctx, createMockAdminRtdb());
  const path = `kentu_focus/${FICTIONAL.pilotUid}/editorial_memory`;
  const ref = guarded.ref(path);
  assert.throws(() => ref.parent, (err) => err && err.code === 'pilot_ref_parent_forbidden');
  assert.throws(() => ref.root, (err) => err && err.code === 'pilot_ref_root_forbidden');
});

test('P6.11e: db / offlineDb dopo binding → rifiutati', async () => {
  const ctx = makeContext();
  const raw = createMockAdminRtdb();
  assert.equal(
    (await runFocusPilotEdition(basePilotInput(ctx, { db: raw }))).error,
    'pilot_raw_db_override_forbidden',
  );
  assert.equal(
    (await runFocusPilotEdition(basePilotInput(ctx, { offlineDb: raw }))).error,
    'pilot_offline_db_override_forbidden',
  );
});

test('P6.11e: uid/data diversi e regen rifiutati', async () => {
  const ctx = makeContext();
  assert.equal(
    (await runFocusPilotEdition(basePilotInput(ctx, {
      uid: 'other_user_fixture_99',
    }))).error,
    'pilot_uid_mismatch',
  );
  assert.equal(
    (await runFocusPilotEdition(basePilotInput(ctx, {
      publicationDate: '2026-10-18',
    }))).error,
    'pilot_publication_date_mismatch',
  );
  assert.equal(
    (await runFocusPilotEdition(basePilotInput(ctx, {
      explicitRegen: true,
    }))).error,
    'pilot_regen_forbidden',
  );
});

test('P6.11e: multi-path con destinazione vietata → nessuna scrittura', async () => {
  const ctx = makeContext();
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const metaPath = `kentu_focus/${uid}/editions/${date}/meta`;
  const evil = `users/${uid}/tracker_data/trackerStorico_2026-10-16`;
  const inner = createMockAdminRtdb();
  const db = createPilotGuardedAdminDatabase(ctx, inner);

  await assert.rejects(
    () => db.ref().update({
      [metaPath]: { currentRevision: 1 },
      [evil]: { x: 1 },
    }),
    (err) => err && err.code === 'pilot_path_users_write_forbidden',
  );
  assert.equal(inner._get(metaPath), undefined);
  assert.equal(inner._get(evil), undefined);
});

test('P6.11e positivo: adapter interni su guarded — tracker + Focus ops', async () => {
  const ctx = makeContext();
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const dayPath = `users/${uid}/tracker_data/trackerStorico_2026-10-16`;
  const inner = createMockAdminRtdb({
    [dayPath]: { sleepHours: 7 },
    [`users/${uid}/profile_targets`]: { calories: 2000 },
    [`users/${uid}/body_metrics`]: { m1: { weightKg: 70, date: '2026-10-16' } },
  });
  const guarded = createPilotGuardedAdminDatabase(ctx, inner);
  const reader = new AdminRtdbTrackerReader(guarded);
  const persistence = new AdminRtdbFocusPersistence(guarded);

  const day = await reader.getDayNode(uid, '2026-10-16');
  assert.deepEqual(day, { sleepHours: 7 });
  const targets = await reader.getProfileTargets(uid);
  assert.equal(targets.calories, 2000);

  const memPath = `kentu_focus/${uid}/editorial_memory`;
  await guarded.ref(memPath).transaction(() => ({
    ...createEmptyEditorialMemory(),
    publishBarrier: PUBLISH_BARRIER_STABLE,
  }));
  const mem = await persistence.getEditorialMemory(uid);
  assert.ok(mem);

  const jobPath = `kentu_focus/${uid}/jobs/${date}`;
  await guarded.ref(jobPath).transaction(() => ({
    status: 'succeeded',
    publishedRevision: 1,
  }));
  const job = await persistence.getJob(uid, date);
  assert.equal(job.status, 'succeeded');

  const revPath = `kentu_focus/${uid}/editions/${date}/rev/1`;
  await guarded.ref(revPath).transaction(() => ({
    schemaVersion: '1.0.0',
    kind: 'FocusEditionRevision',
    publicationDate: date,
    analysisDate: '2026-10-16',
    revision: 1,
    status: 'published',
  }));
  const rev = await persistence.getRevision(uid, date, 1);
  assert.equal(rev.revision, 1);

  const evtPath = `kentu_focus/${uid}/editions/${date}/memory_events/1`;
  await guarded.ref(evtPath).transaction(() => ({
    schemaVersion: '1.0.0',
    kind: 'FocusMemoryEvent',
    publicationDate: date,
    revision: 1,
  }));
  const evt = await persistence.getMemoryEvent(uid, date, 1);
  assert.equal(evt.revision, 1);

  const archPath = `kentu_focus/${uid}/archive_index/${date}`;
  await guarded.ref().update({
    [archPath]: {
      schemaVersion: '1.0.0',
      kind: 'FocusArchiveIndexEntry',
      publicationDate: date,
      revision: 1,
    },
  });
  const archive = await persistence.listArchiveIndex(uid, { limit: 5 });
  assert.equal(archive.length, 1);
  assert.equal(archive[0].publicationDate, date);
});

test('P6.11e positivo: report P6.10a invariato su persistence guarded', async () => {
  const ctx = makeContext();
  const uid = FICTIONAL.pilotUid;
  const date = FICTIONAL.publicationDate;
  const inner = createMockAdminRtdb();
  const guarded = createPilotGuardedAdminDatabase(ctx, inner);
  const persistence = new AdminRtdbFocusPersistence(guarded);

  await guarded.ref(`kentu_focus/${uid}/editions/${date}/meta`).transaction(() => ({
    schemaVersion: '1.0.0',
    kind: 'FocusEdition',
    publicationDate: date,
    analysisDate: '2026-10-16',
    currentRevision: 1,
    status: 'published',
    headline: 'H',
    teaser: 'T',
    publishedAt: '2026-10-17T08:00:00.000Z',
  }));
  await guarded.ref(`kentu_focus/${uid}/editions/${date}/rev/1`).transaction(() => ({
    schemaVersion: '1.0.0',
    kind: 'FocusEditionRevision',
    publicationDate: date,
    analysisDate: '2026-10-16',
    revision: 1,
    status: 'published',
    publishedAt: '2026-10-17T08:00:00.000Z',
    lead: { headlineSeed: 'H', summarySeed: 'T' },
  }));
  await guarded.ref(`kentu_focus/${uid}/jobs/${date}`).transaction(() => ({
    status: 'succeeded',
    publishedRevision: 1,
  }));
  await guarded.ref(`kentu_focus/${uid}/editions/${date}/memory_events/1`).transaction(() => ({
    schemaVersion: '1.0.0',
    kind: 'FocusMemoryEvent',
    publicationDate: date,
    revision: 1,
    contentFingerprint: 'fp',
  }));
  await guarded.ref(`kentu_focus/${uid}/editorial_memory`).transaction(() => ({
    ...createEmptyEditorialMemory(),
    publishBarrier: PUBLISH_BARRIER_STABLE,
    lastAppliedEdition: `${date}#1`,
  }));

  const report = await buildFocusAdminPublishOperatorReport({
    uid,
    publicationDate: date,
    pipelineOk: true,
    publishResult: {
      ok: true,
      revision: 1,
      memoryStatus: 'applied',
      editionMeta: {
        currentRevision: 1,
        status: 'published',
      },
      job: { status: 'succeeded', publishedRevision: 1 },
      memory: {
        ...createEmptyEditorialMemory(),
        publishBarrier: PUBLISH_BARRIER_STABLE,
        lastAppliedEdition: `${date}#1`,
      },
    },
    persistence,
  });
  assert.equal(report.kind, 'FocusAdminPublishOperatorReport');
  assert.equal(typeof report.operatorSafe, 'boolean');
});

test('P6.11e ingresso mock dedicato: helper + Symbol; offlineDb pubblico no', async () => {
  const ctx = makeContext();
  const had = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  try {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    process.env.FOCUS_ADMIN_TOKEN = TOKEN;
    process.env.FOCUS_ADMIN_ALLOWED_UIDS = FICTIONAL.pilotUid;
    process.env.FOCUS_ADMIN_EXPECTED_PROJECT = FICTIONAL.expectedProjectId;

    // Helper test dedicato raggiunge wiring chiuso (può fallire su auth/pipeline ma non su override)
    const viaHelper = await runFocusPilotEditionWithTestMock(
      basePilotInput(ctx),
      createMockAdminRtdb(),
    );
    assert.equal(viaHelper.wiringClosed, true);
    assert.equal(viaHelper.guarded, true);
    // Nessun adapter grezzo accettato: errore ≠ override
    assert.notEqual(viaHelper.error, 'pilot_persistence_override_forbidden');
    assert.notEqual(viaHelper.error, 'pilot_reader_override_forbidden');

    const viaSymbol = await runFocusPilotEdition({
      ...basePilotInput(ctx),
      [FOCUS_PILOT_TEST_HARNESS]: { mockDb: createMockAdminRtdb() },
    });
    assert.equal(viaSymbol.wiringClosed, true);

    // Senza harness → inattivo
    const noMock = await runFocusPilotEdition(basePilotInput(ctx));
    assert.equal(noMock.error, FOCUS_PILOT_RUNTIME_INACTIVE);
  } finally {
    if (had == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had;
    delete process.env.FOCUS_ADMIN_TOKEN;
    delete process.env.FOCUS_ADMIN_ALLOWED_UIDS;
    delete process.env.FOCUS_ADMIN_EXPECTED_PROJECT;
  }
});

test('P6.11e produzione rimane bloccata', async () => {
  const ctx = makeContext();
  const hadEmu = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';

    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');
    assert.equal(assertFocusPilotConnectionAllowed().error, FOCUS_PILOT_CONNECTION_BLOCKED);
    assert.equal(createPilotAdminApp({ enableFlag: '1' }).activated, false);

    const r = await runFocusPilotEditionWithTestMock(
      basePilotInput(ctx),
      createMockAdminRtdb(),
    );
    assert.equal(r.ok, false);
    assert.equal(r.error, 'non_emulator_admin_blocked_in_i4h');
  } finally {
    if (hadEmu == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = hadEmu;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
  }
});
