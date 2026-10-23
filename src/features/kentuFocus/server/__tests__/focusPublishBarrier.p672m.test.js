/**
 * P6.7.2m — barrierHold obbligatorio nel publish ordinario.
 * Memory + Admin mock. Zero Firebase reale / Gemini.
 * Non collega recoverFocusEditorialMemory.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../../editorial/selectFocusEditorial.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import { buildFocusMemoryEvent } from '../contracts/focusMemoryEvent.v1.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';
import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
} from '../memory/editorialMemoryCommit.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  PUBLISH_BARRIER_STABLE,
  readPublishCoordination,
} from '../memory/publishBarrier.js';
import { focusEditorialMemoryPath } from '../paths/focusRtdbPaths.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { buildEssentialEditionFromSelection } from '../publish/buildEssentialEdition.js';
import { publishFocusEdition } from '../publish/publishFocusEdition.js';
import {
  buildPublishAttemptId,
  publishRevisionWithBarrier,
} from '../publish/publishRevisionWithBarrier.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';

function richDossierInput() {
  return {
    ...buildFullDayFixture(),
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
  };
}

function buildSelection() {
  const dossier = buildFocusDossier({
    uid: 'p672m',
    ...richDossierInput(),
  });
  return selectFocusEditorial({
    dossier,
    memory: createEmptyEditorialMemory(),
    dossierContentHash: 'p672m',
  });
}

async function preparePublishReady(persistence, uid, ownerId = 'w1') {
  const selection = buildSelection();
  const claim = await persistence.claimJob(uid, PUBLICATION_DATE, {
    ownerId,
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: `fp_${uid}`,
  });
  assert.equal(claim.ok, true, claim.error);
  await persistence.updateJobIfOwner(
    uid,
    PUBLICATION_DATE,
    ownerId,
    claim.job.leaseVersion,
    { status: FOCUS_JOB_STATUS.running },
  );
  const built = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: `fp_${uid}`,
  });
  assert.equal(
    (await persistence.saveRevisionImmutable(uid, PUBLICATION_DATE, built.revisionDoc)).ok,
    true,
  );
  assert.equal(
    (await persistence.saveMemoryEventImmutable(
      uid,
      PUBLICATION_DATE,
      buildFocusMemoryEvent({ publicationDate: PUBLICATION_DATE, revision: 1, selection }),
    )).ok,
    true,
  );
  return { claim, built, leaseVersion: claim.job.leaseVersion, ownerId };
}

test('P6.7.2m Memory: publish senza hold → barrier_hold_required', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m1', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm1');
  const pub = await persistence.publishCurrentRevision('m1', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(pub.ok, false);
  assert.equal(pub.error, 'barrier_hold_required');
  assert.equal((await persistence.getPublishedEdition('m1', PUBLICATION_DATE)).meta, null);
});

test('P6.7.2m Memory: hold sbagliato → rifiutato', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m2', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm2');
  const acq = await persistence.acquirePublishBarrier('m2', {
    attemptId: 'good',
    jobDate: PUBLICATION_DATE,
  });
  const pub = await persistence.publishCurrentRevision('m2', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: { ...acq.hold, attemptId: 'evil' },
  });
  assert.equal(pub.ok, false);
  assert.equal(pub.error, 'barrier_owner_mismatch');
  assert.equal((await persistence.getPublishedEdition('m2', PUBLICATION_DATE)).meta, null);
});

test('P6.7.2m Memory: sequenza helper aggiorna pointer e libera barriera', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m3', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm3');
  const result = await publishRevisionWithBarrier({
    uid: 'm3',
    persistence,
    publicationDate: PUBLICATION_DATE,
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.barrierReleased, true);
  assert.equal(result.pointersUpdated, true);
  const published = await persistence.getPublishedEdition('m3', PUBLICATION_DATE);
  assert.equal(published.meta?.currentRevision, 1);
  const coord = readPublishCoordination(await persistence.getEditorialMemory('m3'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_STABLE);
  assert.ok(coord.publishGeneration >= 1);
});

test('P6.7.2m Memory: publish fallito non dichiarato riuscito; barriera rilasciata se pre-pointer', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m4', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm4');
  const result = await publishRevisionWithBarrier({
    uid: 'm4',
    persistence,
    publicationDate: PUBLICATION_DATE,
    ownerId: 'wrong',
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'job_owner_mismatch_on_publish');
  assert.equal(result.pointersUpdated, false);
  assert.equal(result.barrierReleased, true);
  assert.equal((await persistence.getPublishedEdition('m4', PUBLICATION_DATE)).meta, null);
  assert.equal(
    readPublishCoordination(await persistence.getEditorialMemory('m4')).publishBarrier,
    PUBLISH_BARRIER_STABLE,
  );
});

test('P6.7.2m Memory: recovery non committa durante publishing', async () => {
  const persistence = new MemoryFocusPersistence();
  const mem = {
    ...createEmptyEditorialMemory(),
    lastAppliedEdition: '2026-10-16#1',
    updatedAt: '2026-10-16T10:00:00.000Z',
  };
  persistence.memoryByUid.set('m5', mem);
  await persistence.acquirePublishBarrier('m5', {
    attemptId: 'busy',
    jobDate: PUBLICATION_DATE,
  });
  const replace = await persistence.replaceEditorialMemoryIfUnchanged('m5', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('m5')),
    nextMemory: { ...mem, lastAppliedEdition: `${PUBLICATION_DATE}#1` },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(replace.ok, false);
  assert.equal(replace.error, 'publication_in_progress');
});

test('P6.7.2m Memory: publishFocusEdition happy path + barriera stabile', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'm6',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
  const published = await persistence.getPublishedEdition('m6', PUBLICATION_DATE);
  assert.equal(published.meta?.currentRevision, 1);
  const job = await persistence.getJob('m6', PUBLICATION_DATE);
  assert.equal(job.status, FOCUS_JOB_STATUS.succeeded);
  const arch = await persistence.listArchiveIndex('m6', { limit: 1 });
  assert.equal(arch.length, 1);
  const coord = readPublishCoordination(await persistence.getEditorialMemory('m6'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_STABLE);
  assert.ok(coord.publishGeneration >= 1);
});

test('P6.7.2m Memory: replay idempotente senza nuova barriera', async () => {
  const persistence = new MemoryFocusPersistence();
  const input = {
    uid: 'm7',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  };
  const first = await publishFocusEdition(input);
  assert.equal(first.ok, true, first.error);
  const genAfterFirst = readPublishCoordination(
    await persistence.getEditorialMemory('m7'),
  ).publishGeneration;

  const second = await publishFocusEdition(input);
  assert.equal(second.ok, true, second.error);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.barrierDiagnostic ?? null, null);
  const coord = readPublishCoordination(await persistence.getEditorialMemory('m7'));
  assert.equal(coord.publishGeneration, genAfterFirst);
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_STABLE);
});

test('P6.7.2m Memory: crash dopo acquire → publishing diagnosticabile', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m8', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm8');
  const attemptId = buildPublishAttemptId({
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    publicationDate: PUBLICATION_DATE,
    publishedRevision: 1,
  });
  const acq = await persistence.acquirePublishBarrier('m8', {
    attemptId,
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);
  // crash: niente publish/release
  assert.equal(
    readPublishCoordination(await persistence.getEditorialMemory('m8')).publishBarrier,
    PUBLISH_BARRIER_PUBLISHING,
  );
  // ripresa stessa attemptId completa e rilascia
  const resumed = await publishRevisionWithBarrier({
    uid: 'm8',
    persistence,
    publicationDate: PUBLICATION_DATE,
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    attemptId,
  });
  assert.equal(resumed.ok, true, resumed.error);
  assert.equal(resumed.resumedBarrier, true);
  assert.equal(
    readPublishCoordination(await persistence.getEditorialMemory('m8')).publishBarrier,
    PUBLISH_BARRIER_STABLE,
  );
});

test('P6.7.2m Memory: lease rubato → publish con hold rifiutato', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('m9', createEmptyEditorialMemory());
  const ready = await preparePublishReady(persistence, 'm9', 'old');
  await persistence.markJobInterrupted('m9', PUBLICATION_DATE);
  const steal = await persistence.claimJob('m9', PUBLICATION_DATE, {
    ownerId: 'new',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'fp_m9',
    allowStealInterrupted: true,
  });
  assert.equal(steal.ok, true);
  const result = await publishRevisionWithBarrier({
    uid: 'm9',
    persistence,
    publicationDate: PUBLICATION_DATE,
    ownerId: 'old',
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'job_owner_mismatch_on_publish');
  assert.equal((await persistence.getPublishedEdition('m9', PUBLICATION_DATE)).meta, null);
});

test('P6.7.2m Admin mock: hold obbligatorio + happy path + recovery bloccata', async () => {
  const db = createMockAdminRtdb({
    [focusEditorialMemoryPath('a1')]: createEmptyEditorialMemory(),
  });
  const persistence = new AdminRtdbFocusPersistence(db);
  const ready = await preparePublishReady(persistence, 'a1');

  const noHold = await persistence.publishCurrentRevision('a1', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(noHold.error, 'barrier_hold_required');

  const ok = await publishRevisionWithBarrier({
    uid: 'a1',
    persistence,
    publicationDate: PUBLICATION_DATE,
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(
    (await persistence.getPublishedEdition('a1', PUBLICATION_DATE)).meta?.currentRevision,
    1,
  );
  assert.equal(
    readPublishCoordination(await persistence.getEditorialMemory('a1')).publishBarrier,
    PUBLISH_BARRIER_STABLE,
  );

  // forza publishing e verifica replace rifiutato
  await persistence.acquirePublishBarrier('a1', {
    attemptId: 'block_recovery',
    jobDate: PUBLICATION_DATE,
  });
  const blocked = await persistence.replaceEditorialMemoryIfUnchanged('a1', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('a1')),
    nextMemory: {
      ...createEmptyEditorialMemory(),
      lastAppliedEdition: `${PUBLICATION_DATE}#1`,
      updatedAt: '2026-10-18T00:00:00.000Z',
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(blocked.error, 'publication_in_progress');
});

test('P6.7.2m Admin mock: repairPublishPointers senza hold → rifiutato', async () => {
  const db = createMockAdminRtdb({
    [focusEditorialMemoryPath('a2')]: createEmptyEditorialMemory(),
  });
  const persistence = new AdminRtdbFocusPersistence(db);
  const ready = await preparePublishReady(persistence, 'a2');
  const noHold = await persistence.repairPublishPointers('a2', PUBLICATION_DATE, {
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(noHold.ok, false);
  assert.equal(noHold.error, 'barrier_hold_required');
});
