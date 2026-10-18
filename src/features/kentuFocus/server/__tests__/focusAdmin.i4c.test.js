/**
 * I4-C — concorrenza / crash recovery su RTDB emulator + Admin adapter.
 * Richiede FIREBASE_DATABASE_EMULATOR_HOST (via firebase emulators:exec).
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { loadFocusLocalRules } from '../emulator/loadFocusRules.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import {
  publishFocusEdition,
  repairFocusMemoryAfterPublish,
} from '../publish/publishFocusEdition.js';
import { focusArchiveIndexPath, focusEditionMetaPath } from '../paths/focusRtdbPaths.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);

function richInput() {
  const fixture = buildFullDayFixture();
  return {
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
  };
}

/** @type {import('firebase-admin/database').Database | null} */
let db = null;

before(async () => {
  if (!EMULATOR) return;
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules();
});

after(async () => {
  if (!db) return;
  await db.ref('kentu_focus').set(null);
  await deleteEmulatorAdminApp();
});

async function clearUid(uid) {
  await db.ref(`kentu_focus/${uid}`).set(null);
}

test('I4-C.1 due richieste identiche → una pubblicazione', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_idemp';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const a = await publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1', nowIso: '2026-10-17T08:05:00.000Z',
  });
  const b = await publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1', nowIso: '2026-10-17T08:06:00.000Z',
  });
  assert.equal(a.ok, true, a.error);
  assert.equal(b.ok, true, b.error);
  assert.equal(b.idempotentReplay, true);
  assert.equal(a.revision, 1);
  assert.equal(b.revision, 1);
  const rev2 = await persistence.getRevision(uid, PUBLICATION_DATE, 2);
  assert.equal(rev2, null);
});

test('I4-C.2 due richieste concorrenti → una sola revisione', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_conc';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const [a, b] = await Promise.all([
    publishFocusEdition({ uid, persistence, dossierInput, ownerId: 'wa' }),
    publishFocusEdition({ uid, persistence, dossierInput, ownerId: 'wb' }),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  const fails = [a, b].filter((r) => !r.ok);
  assert.equal(oks.length, 1, JSON.stringify({ a, b }));
  assert.equal(fails.length, 1);
  assert.ok(
    ['job_already_running', 'job_owner_mismatch', 'cannot_mark_running', 'job_owner_mismatch_on_publish']
      .includes(fails[0].error)
      || String(fails[0].error || '').includes('job_'),
    fails[0].error,
  );
  const pub = await persistence.getPublishedEdition(uid, PUBLICATION_DATE);
  assert.equal(pub.meta?.currentRevision, 1);
});

test('I4-C.3 lease scaduto e riassegnato — vecchio owner non pubblica', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_lease';
  await clearUid(uid);
  const p2 = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const claimOld = await p2.claimJob(uid, PUBLICATION_DATE, {
    ownerId: 'old2',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'fp2',
  });
  await p2.updateJobIfOwner(uid, PUBLICATION_DATE, 'old2', claimOld.job.leaseVersion, {
    status: FOCUS_JOB_STATUS.running,
  });
  await p2.expireLeaseNow(uid, PUBLICATION_DATE);
  const claimNew = await p2.claimJob(uid, PUBLICATION_DATE, {
    ownerId: 'new2',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'fp2',
  });
  assert.equal(claimNew.ok, true, claimNew.error);
  assert.equal(claimNew.job.ownerId, 'new2');
  assert.ok(claimNew.job.leaseVersion > claimOld.job.leaseVersion);

  const { buildEssentialEditionFromSelection } = await import('../publish/buildEssentialEdition.js');
  const { selectFocusEditorial } = await import('../../editorial/selectFocusEditorial.js');
  const { buildFocusDossier } = await import('../../build/buildFocusDossier.js');
  const dossier = buildFocusDossier({ uid, ...dossierInput });
  const selection = selectFocusEditorial({ dossier, memory: createEmptyEditorialMemory() });
  const builtEd = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: 'fp2',
  });
  await p2.saveRevisionImmutable(uid, PUBLICATION_DATE, builtEd.revisionDoc);
  const pubOld = await p2.publishCurrentRevision(uid, PUBLICATION_DATE, {
    ownerId: 'old2',
    leaseVersion: claimOld.job.leaseVersion,
    editionMeta: builtEd.editionMeta,
    archiveEntry: builtEd.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(pubOld.ok, false);
  assert.equal(pubOld.error, 'job_owner_mismatch_on_publish');
});

test('I4-C.4 overwrite rev 1 → errore', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_ow';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const first = await publishFocusEdition({
    uid, persistence, dossierInput: richInput(), ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  const again = await persistence.saveRevisionImmutable(
    uid,
    PUBLICATION_DATE,
    first.revisionDoc,
  );
  assert.equal(again.ok, false);
  assert.equal(again.error, 'revision_already_exists');
});

test('I4-C.5 rev 2 mentre rev 1 resta leggibile', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_rev2';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const first = await publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  const second = await publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1', explicitRegen: true,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.revision, 2);
  const r1 = await persistence.getRevision(uid, PUBLICATION_DATE, 1);
  const r2 = await persistence.getRevision(uid, PUBLICATION_DATE, 2);
  assert.ok(r1);
  assert.ok(r2);
  const pub = await persistence.getPublishedEdition(uid, PUBLICATION_DATE);
  assert.equal(pub.meta.currentRevision, 2);
});

test('I4-C.6 interruzione prima del commit', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_int_pre';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const claim = await persistence.claimJob(uid, PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'will-interrupt',
  });
  await persistence.updateJobIfOwner(uid, PUBLICATION_DATE, 'w1', claim.job.leaseVersion, {
    status: FOCUS_JOB_STATUS.running,
  });
  await persistence.markJobInterrupted(uid, PUBLICATION_DATE);
  const result = await publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1', allowStealInterrupted: true,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
});

test('I4-C.7 interruzione dopo commit prima della memoria', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_int_mem';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const result = await publishFocusEdition({
    uid, persistence, dossierInput: richInput(), ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  await db.ref(`kentu_focus/${uid}/editorial_memory`).set(createEmptyEditorialMemory());
  const repaired = await repairFocusMemoryAfterPublish({
    uid,
    persistence,
    publicationDate: PUBLICATION_DATE,
    selection: {
      publicationDate: PUBLICATION_DATE,
      lead: result.revisionDoc.lead,
      goodNews: result.revisionDoc.goodNews,
      features: result.revisionDoc.features,
      concerns: result.revisionDoc.concerns,
      coach: result.revisionDoc.coach,
    },
  });
  assert.equal(repaired.ok, true);
  const again = await repairFocusMemoryAfterPublish({
    uid, persistence, publicationDate: PUBLICATION_DATE,
  });
  assert.equal(again.alreadyApplied, true);
});

test('I4-C.8 retry dopo pubblicazione riuscita', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_retry';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();
  const a = await publishFocusEdition({ uid, persistence, dossierInput, ownerId: 'w1' });
  const b = await publishFocusEdition({ uid, persistence, dossierInput, ownerId: 'w2' });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.idempotentReplay, true);
  assert.equal(a.revision, b.revision);
});

test('I4-C.9 fallimento indice → repair puntatori', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_arch_fail';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db, { failArchiveOnce: true });
  const dossierInput = richInput();
  // claim + build manually to hit publish with fail hook
  const claim = await persistence.claimJob(uid, PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'arch-fail',
  });
  await persistence.updateJobIfOwner(uid, PUBLICATION_DATE, 'w1', claim.job.leaseVersion, {
    status: FOCUS_JOB_STATUS.running,
  });
  const { buildFocusDossier } = await import('../../build/buildFocusDossier.js');
  const { selectFocusEditorial } = await import('../../editorial/selectFocusEditorial.js');
  const { buildEssentialEditionFromSelection } = await import('../publish/buildEssentialEdition.js');
  const dossier = buildFocusDossier({ uid, ...dossierInput });
  const selection = selectFocusEditorial({
    dossier,
    memory: createEmptyEditorialMemory(),
  });
  const built = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: 'arch-fail',
  });
  await persistence.saveRevisionImmutable(uid, PUBLICATION_DATE, built.revisionDoc);
  const pub = await persistence.publishCurrentRevision(uid, PUBLICATION_DATE, {
    ownerId: 'w1',
    leaseVersion: claim.job.leaseVersion,
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(pub.ok, false);
  assert.equal(pub.error, 'archive_update_failed');
  const archSnap = await db.ref(focusArchiveIndexPath(uid, PUBLICATION_DATE)).get();
  assert.equal(archSnap.exists(), false);
  const metaSnap = await db.ref(focusEditionMetaPath(uid, PUBLICATION_DATE)).get();
  assert.equal(metaSnap.exists(), true);

  const repaired = await persistence.repairPublishPointers(uid, PUBLICATION_DATE, {
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(repaired.ok, true);
  const arch2 = await db.ref(focusArchiveIndexPath(uid, PUBLICATION_DATE)).get();
  assert.equal(arch2.exists(), true);
  const job = await persistence.getJob(uid, PUBLICATION_DATE);
  assert.equal(job.status, FOCUS_JOB_STATUS.succeeded);
});

test('I4-C.10 lettura archivio durante pubblicazione', { skip: !EMULATOR }, async () => {
  const uid = 'i4c_arch_read';
  await clearUid(uid);
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richInput();

  const midReads = [];
  const publishPromise = publishFocusEdition({
    uid, persistence, dossierInput, ownerId: 'w1',
  });
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const list = await persistence.listArchiveIndex(uid, { limit: 10 });
    midReads.push(list);
  }
  const result = await publishPromise;
  assert.equal(result.ok, true, result.error);

  for (const list of midReads) {
    for (const entry of list) {
      assert.ok(entry.publicationDate);
      assert.ok(Number.isInteger(entry.revision) && entry.revision >= 1);
      assert.ok(entry.headline != null || entry.teaser != null);
      // se compare la data in publish, meta e archive sono già coerenti (update atomico)
      if (entry.publicationDate === PUBLICATION_DATE) {
        const pub = await persistence.getPublishedEdition(uid, PUBLICATION_DATE);
        assert.equal(pub.meta?.currentRevision, entry.revision);
      }
    }
  }
  const finalList = await persistence.listArchiveIndex(uid, { limit: 10 });
  assert.ok(finalList.some((e) => e.publicationDate === PUBLICATION_DATE));
});
