/**
 * I4-F — reader profilo/peso + orizzonti + gate sonno su emulator.
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import { extractFocusSignals } from '../../editorial/extractFocusSignals.js';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import { emulatorRestGet, loadFocusLocalRules } from '../emulator/loadFocusRules.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { runFocusEditionPipeline } from '../pipeline/runFocusEditionPipeline.js';
import { FOCUS_HISTORY_HORIZON_DAYS } from '../reader/focusHistoryHorizon.js';
import { bodyMetricsRootPath, profileTargetsPath } from '../paths/userDataRtdbPaths.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildAmbiguousSleepTrackerMap,
  buildFullTrackerDayMap,
  buildNoSleepTrackerMap,
  clearUserFocusAndTracker,
  seedTrackerMap,
} from './fixtures/i4eTrackerFixtures.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);

/** @type {import('firebase-admin/database').Database | null} */
let db = null;

before(async () => {
  if (!EMULATOR) return;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules();
});

after(async () => {
  if (!db) return;
  await db.ref('kentu_focus').set(null);
  await db.ref('users').set(null);
  await deleteEmulatorAdminApp();
});

async function seedProfileAndBody(uid, profileTargets, bodyMetrics) {
  if (profileTargets) {
    await db.ref(profileTargetsPath(uid)).set(profileTargets);
  }
  if (bodyMetrics) {
    await db.ref(bodyMetricsRootPath(uid)).set(bodyMetrics);
  }
}

const PROFILE = {
  profile: {
    weight: 80,
    targetCalories: 2300,
    proteinTarget: 150,
  },
  targets: {
    kcal: 2300,
    prot: 150,
    targetHistory: [
      { effectiveDate: '2026-10-01', targets: { kcal: 2300, prot: 150 } },
    ],
  },
};

const BODY = {
  a: { date: '2026-10-15', weight: 78.4, timestamp: 1 },
};

test('I4-F.1 target+peso da RTDB; assenti; conflitto', { skip: !EMULATOR }, async () => {
  const uid = 'i4f_targets';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 14 }));
  await seedProfileAndBody(uid, PROFILE, BODY);

  const withData = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, horizon: 'd7',
  });
  assert.equal(withData.ok, true, withData.error);
  assert.equal(withData.dossierInput.targets.proteinG, 150);
  assert.equal(withData.dossierInput.bodyWeightKg, 78.4);
  assert.ok(withData.report.notes.some((n) => n.startsWith('horizon:d7')));
  const sigs = extractFocusSignals(buildFocusDossier({
    uid: 'x', ...withData.dossierInput,
  }));
  assert.ok(sigs.some((s) => s.id === 'sig_protein_near_target'));
  assert.ok(sigs.some((s) => s.id === 'sig_body_weight_logged'));

  const uid2 = 'i4f_notargets';
  await clearUserFocusAndTracker(db, uid2);
  await seedTrackerMap(db, uid2, buildFullTrackerDayMap({ historyDays: 14 }));
  const no = await runFocusEditionPipeline({
    uid: uid2, db, publicationDate: PUBLICATION_DATE, horizon: 'd7',
  });
  assert.equal(no.ok, true, no.error);
  assert.equal(no.dossierInput.targets, null);
  assert.equal(no.dossierInput.bodyWeightKg, null);

  const uid3 = 'i4f_conflict';
  await clearUserFocusAndTracker(db, uid3);
  await seedTrackerMap(db, uid3, buildFullTrackerDayMap({ historyDays: 14 }));
  await seedProfileAndBody(uid3, {
    profile: { weight: 90, targetCalories: 2800, proteinTarget: 150 },
    targets: {
      kcal: 2000,
      prot: 150,
      targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 2000, prot: 150 } }],
    },
  }, BODY);
  const c = await runFocusEditionPipeline({
    uid: uid3, db, publicationDate: PUBLICATION_DATE, horizon: 'd7',
  });
  assert.equal(c.ok, true, c.error);
  assert.ok(c.report.notes.some((n) => n.includes('targets_conflict') || n.includes('body_conflict')));
});

test('I4-F.2 orizzonti 7/30/90 — letture e timing', { skip: !EMULATOR }, async () => {
  const uid = 'i4f_horiz';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 90 }));
  await seedProfileAndBody(uid, PROFILE, BODY);

  const measures = [];
  for (const horizon of ['d7', 'd30', 'd90']) {
    await db.ref(`kentu_focus/${uid}`).set(null);
    const out = await runFocusEditionPipeline({
      uid, db, publicationDate: PUBLICATION_DATE, horizon,
    });
    assert.equal(out.ok, true, `${horizon}: ${out.error}`);
    measures.push({
      horizon,
      historyDays: out.horizonPlan.historyDays,
      reads: out.report.reads.dailyRecords,
      approxBytes: out.report.reads.approxBytes,
      readMs: out.report.timingsMs.readMs,
      publishMs: out.report.timingsMs.publishMs,
      totalMs: out.report.timingsMs.totalMs,
    });
  }
  assert.equal(measures[0].historyDays, FOCUS_HISTORY_HORIZON_DAYS.d7);
  assert.equal(measures[1].historyDays, FOCUS_HISTORY_HORIZON_DAYS.d30);
  assert.equal(measures[2].historyDays, FOCUS_HISTORY_HORIZON_DAYS.d90);
  assert.ok(measures[0].reads < measures[1].reads);
  assert.ok(measures[1].reads < measures[2].reads);
  console.log('I4F_HORIZON_MEASURES', JSON.stringify(measures));
});

test('I4-F.3 sonno ambiguo; regen e bypass client non aprono il gate', { skip: !EMULATOR }, async () => {
  const uid = 'i4f_sleep';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildAmbiguousSleepTrackerMap());
  const amb = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
    explicitRegen: true,
  });
  assert.equal(amb.error, 'sleep_ambiguous');

  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildNoSleepTrackerMap());
  const regen = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
    explicitRegen: true,
    allowPublishWithoutSleep: true,
    adminAllowPublishWithoutSleep: true,
  });
  assert.equal(regen.error, 'sleep_required');
  assert.ok(regen.report.notes.includes('ignored_client_sleep_bypass_flag'));
});

test('I4-F.4 due edizioni + client archive; copertura insufficiente', { skip: !EMULATOR }, async () => {
  const uid = 'i4f_mem';
  await clearUserFocusAndTracker(db, uid);
  const pub1 = '2026-10-16';
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({
    analysisDate: '2026-10-15', publicationDate: pub1, historyDays: 14,
  }));
  await seedProfileAndBody(uid, PROFILE, BODY);
  const e1 = await runFocusEditionPipeline({
    uid, db, publicationDate: pub1, horizon: 'd7',
  });
  assert.equal(e1.ok, true, e1.error);

  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 14 }));
  const e2 = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, horizon: 'd7',
  });
  assert.equal(e2.ok, true, e2.error);
  const mem = await new AdminRtdbFocusPersistence(db).getEditorialMemory(uid);
  assert.ok(mem.lastAppliedEdition.includes(PUBLICATION_DATE));

  const token = await createEmulatorIdToken(uid);
  const meta = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/meta`,
    { idToken: token },
  );
  assert.equal(meta.denied, false, meta.raw);
  const arch = await emulatorRestGet(`kentu_focus/${uid}/archive_index`, { idToken: token });
  assert.equal(arch.denied, false, arch.raw);
  const job = await emulatorRestGet(
    `kentu_focus/${uid}/jobs/${PUBLICATION_DATE}`,
    { idToken: token },
  );
  assert.equal(job.denied, true, job.raw);

  // Storico thin: pochi giorni
  const uidThin = 'i4f_thin';
  await clearUserFocusAndTracker(db, uidThin);
  await seedTrackerMap(db, uidThin, buildFullTrackerDayMap({ historyDays: 3 }));
  await seedProfileAndBody(uidThin, PROFILE, null);
  const thin = await runFocusEditionPipeline({
    uid: uidThin, db, publicationDate: PUBLICATION_DATE, horizon: 'd30',
  });
  assert.equal(thin.ok, true, thin.error);
  assert.ok(thin.report.reads.missingDays > 0);
  const dossier = buildFocusDossier({ uid: 't', ...thin.dossierInput });
  assert.ok(
    dossier.history?.comparisons?.d30_vs_prev30?.available === false
    || dossier.meta?.flags?.historyThin30 === true
    || dossier.history?.d7?.coverage?.nutrition?.sufficiency !== 'ok',
  );
});
