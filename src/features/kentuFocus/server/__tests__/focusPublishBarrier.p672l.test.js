/**
 * P6.7.2l — barriera atomica di pubblicazione (offline).
 * MemoryFocusPersistence + AdminRtdb su mock. Zero Firebase reale / Gemini.
 * Non collega recovery a publish/pipeline.
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
    uid: 'p672l',
    ...richDossierInput(),
  });
  return selectFocusEditorial({
    dossier,
    memory: createEmptyEditorialMemory(),
    dossierContentHash: 'p672l',
  });
}

function sampleMemory(overrides = {}) {
  const base = createEmptyEditorialMemory();
  return {
    ...base,
    updatedAt: '2026-10-17T10:00:00.000Z',
    lastAppliedEdition: '2026-10-16#1',
    ...overrides,
  };
}

/**
 * Prepara job + revision + memory_event pronti per publishCurrentRevision.
 * @param {MemoryFocusPersistence|AdminRtdbFocusPersistence} persistence
 */
async function preparePublishReady(persistence, uid, {
  ownerId = 'w1',
  revision = 1,
} = {}) {
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
    revision,
    inputFingerprint: `fp_${uid}`,
  });
  const saveRev = await persistence.saveRevisionImmutable(
    uid,
    PUBLICATION_DATE,
    built.revisionDoc,
  );
  assert.equal(saveRev.ok, true, saveRev.error);
  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision,
    selection,
  });
  const saveEvt = await persistence.saveMemoryEventImmutable(
    uid,
    PUBLICATION_DATE,
    event,
  );
  assert.equal(saveEvt.ok, true, saveEvt.error);
  return {
    claim,
    built,
    leaseVersion: claim.job.leaseVersion,
    ownerId,
    selection,
  };
}

function createAdminPersistence(seed = {}) {
  const db = createMockAdminRtdb(seed);
  return { db, persistence: new AdminRtdbFocusPersistence(db) };
}

// --- 1. Acquire e release riusciti ---

test('P6.7.2l.1 Memory: acquire + release riusciti', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u1', sampleMemory());

  const acq = await persistence.acquirePublishBarrier('u1', {
    attemptId: 'att_1',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true, acq.error);
  assert.equal(acq.hold.publishGeneration, 1);
  assert.equal(acq.hold.publishBarrierEpoch, 1);
  assert.equal(acq.hold.attemptId, 'att_1');
  let coord = readPublishCoordination(await persistence.getEditorialMemory('u1'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_PUBLISHING);
  assert.equal(coord.publishBarrierAttemptId, 'att_1');

  const rel = await persistence.releasePublishBarrier('u1', acq.hold);
  assert.equal(rel.ok, true, rel.error);
  coord = readPublishCoordination(await persistence.getEditorialMemory('u1'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_STABLE);
  assert.equal(coord.publishGeneration, 1);
  assert.equal(coord.publishBarrierAttemptId, null);
});

// --- 2. Secondo publish → barrier_busy ---

test('P6.7.2l.2 Memory: secondo acquire → barrier_busy', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u2', sampleMemory());
  const a = await persistence.acquirePublishBarrier('u2', {
    attemptId: 'a',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(a.ok, true);
  const b = await persistence.acquirePublishBarrier('u2', {
    attemptId: 'b',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(b.ok, false);
  assert.equal(b.error, 'barrier_busy');
});

// --- 3. Recovery durante publishing → rifiutato ---

test('P6.7.2l.3 Memory: replace durante publishing → publication_in_progress', async () => {
  const persistence = new MemoryFocusPersistence();
  const base = sampleMemory();
  persistence.memoryByUid.set('u3', base);
  const acq = await persistence.acquirePublishBarrier('u3', {
    attemptId: 'att_pub',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);

  // cursore preso prima (o dopo) — comunque barriera publishing rifiuta
  const expected = buildEditorialMemoryCursor(await persistence.getEditorialMemory('u3'));
  const result = await persistence.replaceEditorialMemoryIfUnchanged('u3', {
    expected,
    nextMemory: {
      ...base,
      lastAppliedEdition: '2026-10-17#1',
      updatedAt: '2026-10-17T12:00:00.000Z',
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'publication_in_progress');
  assert.equal(result.committed, false);
  const mem = await persistence.getEditorialMemory('u3');
  assert.equal(mem.publishBarrier, PUBLISH_BARRIER_PUBLISHING);
  assert.equal(mem.lastAppliedEdition, '2026-10-16#1');
});

// --- 4. Recovery dopo release + CAS corretto → ammesso ---

test('P6.7.2l.4 Memory: replace dopo release con CAS corretto', async () => {
  const persistence = new MemoryFocusPersistence();
  const base = sampleMemory();
  persistence.memoryByUid.set('u4', base);
  const acq = await persistence.acquirePublishBarrier('u4', {
    attemptId: 'att',
    jobDate: PUBLICATION_DATE,
  });
  await persistence.releasePublishBarrier('u4', acq.hold);

  const current = await persistence.getEditorialMemory('u4');
  const expected = buildEditorialMemoryCursor(current);
  assert.equal(expected.publishGeneration, 1);
  assert.equal(expected.publishBarrier, PUBLISH_BARRIER_STABLE);

  const next = {
    ...current,
    lastAppliedEdition: '2026-10-17#1',
    updatedAt: '2026-10-17T13:00:00.000Z',
    // tentativo di abbassare barriera — deve essere preservata
    publishGeneration: 0,
    publishBarrier: PUBLISH_BARRIER_PUBLISHING,
  };
  const result = await persistence.replaceEditorialMemoryIfUnchanged('u4', {
    expected,
    nextMemory: next,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.committed, true);
  const mem = await persistence.getEditorialMemory('u4');
  assert.equal(mem.lastAppliedEdition, '2026-10-17#1');
  assert.equal(mem.publishGeneration, 1);
  assert.equal(mem.publishBarrier, PUBLISH_BARRIER_STABLE);
});

// --- 5. Cambio generation → conflitto ---

test('P6.7.2l.5 Memory: generation cambiata → memory_conflict_generation', async () => {
  const persistence = new MemoryFocusPersistence();
  const base = sampleMemory();
  persistence.memoryByUid.set('u5', base);
  const staleCursor = buildEditorialMemoryCursor(base);
  assert.equal(staleCursor.publishGeneration, 0);

  const acq = await persistence.acquirePublishBarrier('u5', {
    attemptId: 'g',
    jobDate: PUBLICATION_DATE,
  });
  await persistence.releasePublishBarrier('u5', acq.hold);

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u5', {
    expected: staleCursor,
    nextMemory: {
      ...base,
      lastAppliedEdition: '2026-10-17#1',
      updatedAt: '2026-10-18T00:00:00.000Z',
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, 'memory_conflict_generation');
});

// --- 6. Apply normale preserva campi barriera ---

test('P6.7.2l.6 Memory: applyEditorialMemory preserva coordination', async () => {
  const persistence = new MemoryFocusPersistence();
  const base = sampleMemory();
  persistence.memoryByUid.set('u6', base);
  const acq = await persistence.acquirePublishBarrier('u6', {
    attemptId: 'apply_hold',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);

  const next = {
    ...createEmptyEditorialMemory(),
    lastAppliedEdition: `${PUBLICATION_DATE}#1`,
    updatedAt: '2026-10-17T14:00:00.000Z',
    publishGeneration: 99,
    publishBarrier: PUBLISH_BARRIER_STABLE,
  };
  const applied = await persistence.applyEditorialMemoryIfNeeded(
    'u6',
    next,
    `${PUBLICATION_DATE}#1`,
  );
  assert.equal(applied.ok, true, applied.error);
  const mem = await persistence.getEditorialMemory('u6');
  assert.equal(mem.lastAppliedEdition, `${PUBLICATION_DATE}#1`);
  assert.equal(mem.publishGeneration, 1);
  assert.equal(mem.publishBarrier, PUBLISH_BARRIER_PUBLISHING);
  assert.equal(mem.publishBarrierAttemptId, 'apply_hold');
});

// --- 7. Crash prima dei puntatori ---

test('P6.7.2l.7 Memory: crash dopo acquire, prima dei pointer', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u7', sampleMemory());
  const ready = await preparePublishReady(persistence, 'u7');

  const acq = await persistence.acquirePublishBarrier('u7', {
    attemptId: 'crash_pre',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);

  // crash: nessun publishCurrentRevision
  const published = await persistence.getPublishedEdition('u7', PUBLICATION_DATE);
  assert.equal(published.meta, null);
  const coord = readPublishCoordination(await persistence.getEditorialMemory('u7'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_PUBLISHING);

  const recover = await persistence.replaceEditorialMemoryIfUnchanged('u7', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('u7')),
    nextMemory: {
      ...sampleMemory(),
      lastAppliedEdition: `${PUBLICATION_DATE}#1`,
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(recover.error, 'publication_in_progress');

  // ripresa autorizzata può ancora pubblicare con lo stesso hold
  const pub = await persistence.publishCurrentRevision('u7', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(pub.ok, true, pub.error);
});

// --- 8. Crash dopo i puntatori ---

test('P6.7.2l.8 Memory: crash dopo pointer, release non eseguito', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u8', sampleMemory());
  const ready = await preparePublishReady(persistence, 'u8');
  const acq = await persistence.acquirePublishBarrier('u8', {
    attemptId: 'crash_post',
    jobDate: PUBLICATION_DATE,
  });

  const pub = await persistence.publishCurrentRevision('u8', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(pub.ok, true, pub.error);

  // crash: niente release — pubblicazione NON dichiarata completa a livello barriera
  const published = await persistence.getPublishedEdition('u8', PUBLICATION_DATE);
  assert.equal(published.meta?.currentRevision, 1);
  const coord = readPublishCoordination(await persistence.getEditorialMemory('u8'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_PUBLISHING);

  const recover = await persistence.replaceEditorialMemoryIfUnchanged('u8', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('u8')),
    nextMemory: sampleMemory({ lastAppliedEdition: `${PUBLICATION_DATE}#1` }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(recover.error, 'publication_in_progress');

  // solo il proprietario può chiudere
  const rel = await persistence.releasePublishBarrier('u8', acq.hold);
  assert.equal(rel.ok, true, rel.error);
});

// --- 9. Owner/epoch non corrispondenti → release rifiutato ---

test('P6.7.2l.9 Memory: release con owner/epoch errati', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u9', sampleMemory());
  const acq = await persistence.acquirePublishBarrier('u9', {
    attemptId: 'owner_a',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);

  const wrongOwner = await persistence.releasePublishBarrier('u9', {
    ...acq.hold,
    attemptId: 'owner_b',
  });
  assert.equal(wrongOwner.ok, false);
  assert.equal(wrongOwner.error, 'barrier_owner_mismatch');

  const wrongEpoch = await persistence.releasePublishBarrier('u9', {
    ...acq.hold,
    publishBarrierEpoch: 999,
  });
  assert.equal(wrongEpoch.ok, false);
  assert.equal(wrongEpoch.error, 'barrier_epoch_mismatch');

  const coord = readPublishCoordination(await persistence.getEditorialMemory('u9'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_PUBLISHING);
});

// --- 10. Processo obsoleto dopo perdita ownership ---

test('P6.7.2l.10 Memory: processo obsoleto non completa publish', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence.memoryByUid.set('u10', sampleMemory());
  const ready = await preparePublishReady(persistence, 'u10', { ownerId: 'old_w' });
  const acq = await persistence.acquirePublishBarrier('u10', {
    attemptId: 'old_attempt',
    jobDate: PUBLICATION_DATE,
  });

  // A) perdita lease: steal interrupted → old lease non pubblica
  await persistence.markJobInterrupted('u10', PUBLICATION_DATE);
  const steal = await persistence.claimJob('u10', PUBLICATION_DATE, {
    ownerId: 'new_w',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'fp_u10',
    allowStealInterrupted: true,
  });
  assert.equal(steal.ok, true, steal.error);
  assert.notEqual(steal.job.leaseVersion, ready.leaseVersion);

  const staleLeasePub = await persistence.publishCurrentRevision('u10', PUBLICATION_DATE, {
    ownerId: 'old_w',
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(staleLeasePub.ok, false);
  assert.equal(staleLeasePub.error, 'job_owner_mismatch_on_publish');

  // B) perdita barriera: release del proprietario, poi old hold sul publish
  // (new_w ha il job; rilascio barriera solo da old_attempt)
  const rel = await persistence.releasePublishBarrier('u10', acq.hold);
  assert.equal(rel.ok, true);

  await persistence.updateJobIfOwner(
    'u10',
    PUBLICATION_DATE,
    'new_w',
    steal.job.leaseVersion,
    { status: FOCUS_JOB_STATUS.running },
  );

  const staleBarrierPub = await persistence.publishCurrentRevision('u10', PUBLICATION_DATE, {
    ownerId: 'new_w',
    leaseVersion: steal.job.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(staleBarrierPub.ok, false);
  assert.ok(
    staleBarrierPub.error === 'barrier_not_held'
      || staleBarrierPub.error === 'barrier_owner_mismatch'
      || staleBarrierPub.error === 'barrier_epoch_mismatch',
    staleBarrierPub.error,
  );

  const mid = await persistence.getPublishedEdition('u10', PUBLICATION_DATE);
  assert.equal(mid.meta, null);
});

// --- 11. Compatibilità memoria storica senza generation/barrier ---

test('P6.7.2l.11 Memory: memoria legacy senza coordination', async () => {
  const persistence = new MemoryFocusPersistence();
  const legacy = createEmptyEditorialMemory();
  delete legacy.publishGeneration;
  delete legacy.publishBarrier;
  persistence.memoryByUid.set('u11', legacy);

  const cursor = buildEditorialMemoryCursor(legacy);
  assert.equal(cursor.publishGeneration, 0);
  assert.equal(cursor.publishBarrier, PUBLISH_BARRIER_STABLE);

  const acq = await persistence.acquirePublishBarrier('u11', {
    attemptId: 'legacy',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);
  assert.equal(acq.hold.publishGeneration, 1);
  await persistence.releasePublishBarrier('u11', acq.hold);

  const after = await persistence.getEditorialMemory('u11');
  assert.equal(after.publishGeneration, 1);
  assert.equal(after.publishBarrier, PUBLISH_BARRIER_STABLE);
});

// --- 12. Parità Memory / Admin mock ---

test('P6.7.2l.12 Admin mock: parità acquire/busy/release/replace/apply', async () => {
  const { persistence } = createAdminPersistence({
    [focusEditorialMemoryPath('ua')]: sampleMemory(),
  });

  const acq = await persistence.acquirePublishBarrier('ua', {
    attemptId: 'admin_a',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true, acq.error);
  assert.equal(acq.hold.publishGeneration, 1);

  const busy = await persistence.acquirePublishBarrier('ua', {
    attemptId: 'admin_b',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(busy.ok, false);
  assert.equal(busy.error, 'barrier_busy');

  const during = await persistence.replaceEditorialMemoryIfUnchanged('ua', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('ua')),
    nextMemory: sampleMemory({ lastAppliedEdition: '2026-10-17#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(during.error, 'publication_in_progress');

  const applied = await persistence.applyEditorialMemoryIfNeeded(
    'ua',
    {
      ...createEmptyEditorialMemory(),
      lastAppliedEdition: `${PUBLICATION_DATE}#9`,
      updatedAt: '2026-10-17T15:00:00.000Z',
    },
    `${PUBLICATION_DATE}#9`,
  );
  assert.equal(applied.ok, true);
  assert.equal(
    (await persistence.getEditorialMemory('ua')).publishBarrier,
    PUBLISH_BARRIER_PUBLISHING,
  );

  const rel = await persistence.releasePublishBarrier('ua', acq.hold);
  assert.equal(rel.ok, true, rel.error);

  const current = await persistence.getEditorialMemory('ua');
  const okReplace = await persistence.replaceEditorialMemoryIfUnchanged('ua', {
    expected: buildEditorialMemoryCursor(current),
    nextMemory: {
      ...current,
      lastAppliedEdition: '2026-10-18#1',
      updatedAt: '2026-10-18T00:00:00.000Z',
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(okReplace.ok, true, okReplace.error);
  assert.equal(okReplace.committed, true);
  assert.equal(
    (await persistence.getEditorialMemory('ua')).publishGeneration,
    1,
  );
});

test('P6.7.2l.12b Admin mock: fencing publish con barrierHold', async () => {
  const { persistence } = createAdminPersistence({
    [focusEditorialMemoryPath('ub')]: sampleMemory(),
  });
  const ready = await preparePublishReady(persistence, 'ub');
  const acq = await persistence.acquirePublishBarrier('ub', {
    attemptId: 'admin_pub',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);

  const bad = await persistence.publishCurrentRevision('ub', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: { ...acq.hold, attemptId: 'other' },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'barrier_owner_mismatch');

  const ok = await persistence.publishCurrentRevision('ub', PUBLICATION_DATE, {
    ownerId: ready.ownerId,
    leaseVersion: ready.leaseVersion,
    editionMeta: ready.built.editionMeta,
    archiveEntry: ready.built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(ok.ok, true, ok.error);
  await persistence.releasePublishBarrier('ub', acq.hold);
});
