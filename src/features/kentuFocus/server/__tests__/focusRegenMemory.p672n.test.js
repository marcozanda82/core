/**
 * P6.7.2n — memoria current-only su revisioni sostitutive (explicitRegen).
 * Offline: Memory + Admin mock. Zero Gemini / Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import { buildFocusMemoryEvent } from '../contracts/focusMemoryEvent.v1.js';
import {
  FOCUS_JOB_STATUS,
  FOCUS_PERSISTENCE_SCHEMA_VERSION,
} from '../contracts/focusPersistence.v1.js';
import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
  fingerprintEditorialMemoryPayload,
} from '../memory/editorialMemoryCommit.js';
import {
  rebuildEditorialMemoryFromPublishedPointers,
} from '../memory/focusMemoryReplay.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  readPublishCoordination,
} from '../memory/publishBarrier.js';
import { commitCurrentOnlyMemoryAfterPublish } from '../memory/commitCurrentOnlyMemoryAfterPublish.js';
import { focusEditorialMemoryPath } from '../paths/focusRtdbPaths.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { publishFocusEdition } from '../publish/publishFocusEdition.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';

function richDossierInput(overrides = {}) {
  return {
    ...buildFullDayFixture(),
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
    ...overrides,
  };
}

function memView(memory) {
  return {
    last: memory?.lastAppliedEdition ?? null,
    topics: (memory?.recentTopics || [])
      .map((t) => `${t.topicId}:${t.count14d}:${t.editorialFamily || '-'}`)
      .sort(),
    families: { ...(memory?.cooldown?.families || {}) },
    leads: (memory?.recentLeads || [])
      .map((l) => `${l.publicationDate}:${(l.topicIds || []).join('|')}`)
      .sort(),
  };
}

function expectedCurrentOnly(persistence, uid, updatedAt = '2026-10-17T12:00:00.000Z') {
  return (async () => {
    const archiveEntries = await persistence.listArchiveIndex(uid, { limit: 365 });
    const metasByDate = {};
    const jobsByDate = {};
    const memoryEvents = [];
    for (const entry of archiveEntries) {
      const d = entry.publicationDate;
      const pub = await persistence.getPublishedEdition(uid, d);
      metasByDate[d] = pub.meta;
      jobsByDate[d] = await persistence.getJob(uid, d);
      const rev = pub.meta?.currentRevision;
      if (rev) {
        const evt = await persistence.getMemoryEvent(uid, d, rev);
        if (evt) memoryEvents.push(evt);
      }
    }
    return rebuildEditorialMemoryFromPublishedPointers({
      archiveEntries,
      metasByDate,
      jobsByDate,
      memoryEvents,
      updatedAt,
    });
  })();
}

// --- 1. Publish iniziale #1 ---

test('P6.7.2n.1 publish #1: memoria applicata, lastApplied editionKey', async () => {
  const persistence = new MemoryFocusPersistence();
  const first = await publishFocusEdition({
    uid: 'n1',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.revision, 1);
  assert.equal(first.memoryPersisted ?? true, true);
  assert.equal(first.memory?.lastAppliedEdition, `${PUBLICATION_DATE}#1`);
  assert.ok(await persistence.getMemoryEvent('n1', PUBLICATION_DATE, 1));
});

// --- Preliminare: divergenza API vs allineamento live post-fix ---

test('P6.7.2n preliminare: dopo regen live allineata a current-only (non #1+#2)', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const first = await publishFocusEdition({
    uid: 'n_pre',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  const memAfter1 = await persistence.getEditorialMemory('n_pre');
  assert.equal(memAfter1.lastAppliedEdition, `${PUBLICATION_DATE}#1`);

  const second = await publishFocusEdition({
    uid: 'n_pre',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.revision, 2);
  // edizione pubblicata anche se memoria fosse pending
  assert.equal(
    (await persistence.getPublishedEdition('n_pre', PUBLICATION_DATE)).meta?.currentRevision,
    2,
  );
  assert.ok(await persistence.getMemoryEvent('n_pre', PUBLICATION_DATE, 1));
  assert.ok(await persistence.getMemoryEvent('n_pre', PUBLICATION_DATE, 2));

  const live = await persistence.getEditorialMemory('n_pre');
  assert.equal(live.lastAppliedEdition, `${PUBLICATION_DATE}#2`);
  assert.equal(second.memoryPersisted, true);
  assert.ok(second.memoryStatus === 'applied' || second.memoryStatus === 'unchanged');

  const expected = await expectedCurrentOnly(persistence, 'n_pre', live.updatedAt);
  assert.equal(expected.ok, true, expected.error);
  assert.equal(
    fingerprintEditorialMemoryPayload(live),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
  // #1 non lascia tracce “extra” rispetto al solo #2
  assert.deepEqual(memView(live).topics, memView(expected.memory).topics);
});

// --- 2–3. Regen #2 + seconda applicazione senza doppio conteggio ---

test('P6.7.2n.2–3 regen #2 current-only + seconda applicazione idempotente', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  await publishFocusEdition({
    uid: 'n2',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  const after1 = memView(await persistence.getEditorialMemory('n2'));

  const regen = await publishFocusEdition({
    uid: 'n2',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, true, regen.error);
  const after2 = memView(await persistence.getEditorialMemory('n2'));
  assert.equal(after2.last, `${PUBLICATION_DATE}#2`);
  // non è semplicemente “#1 + qualcosa”: last è #2 e payload = replay #2
  assert.notEqual(after2.last, after1.last);

  const again = await commitCurrentOnlyMemoryAfterPublish({
    uid: 'n2',
    persistence,
    updatedAt: '2026-10-17T20:00:00.000Z',
  });
  assert.equal(again.ok, true, again.error);
  assert.ok(again.memoryStatus === 'unchanged' || again.memoryStatus === 'applied');
  const afterAgain = memView(await persistence.getEditorialMemory('n2'));
  assert.deepEqual(afterAgain.topics, after2.topics);
  assert.deepEqual(afterAgain.leads, after2.leads);
});

// --- 4. Altre date: ricostruzione coerente ---

test('P6.7.2n.4 regen con altra data in archivio: rebuild multi-data coerente', async () => {
  const persistence = new MemoryFocusPersistence();
  const dayA = richDossierInput({
    analysisDate: '2026-10-15',
    publicationDate: '2026-10-16',
  });
  const dayB = richDossierInput();

  const pubA = await publishFocusEdition({
    uid: 'n4',
    persistence,
    dossierInput: dayA,
    ownerId: 'w1',
  });
  assert.equal(pubA.ok, true, pubA.error);

  const pubB1 = await publishFocusEdition({
    uid: 'n4',
    persistence,
    dossierInput: dayB,
    ownerId: 'w1',
  });
  assert.equal(pubB1.ok, true, pubB1.error);

  const regenB = await publishFocusEdition({
    uid: 'n4',
    persistence,
    dossierInput: dayB,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regenB.ok, true, regenB.error);
  assert.equal(regenB.memoryPersisted, true);

  const live = await persistence.getEditorialMemory('n4');
  const expected = await expectedCurrentOnly(persistence, 'n4', live.updatedAt);
  assert.equal(expected.ok, true);
  assert.equal(
    fingerprintEditorialMemoryPayload(live),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
  assert.ok(expected.appliedEditionKeys.includes('2026-10-16#1'));
  assert.ok(expected.appliedEditionKeys.includes(`${PUBLICATION_DATE}#2`));
  assert.equal(expected.appliedEditionKeys.includes(`${PUBLICATION_DATE}#1`), false);
});

// --- 5. Snapshot mancante: nessuna sostituzione parziale ---

test('P6.7.2n.5 snapshot necessario mancante → pending, no partial, pointer ok', async () => {
  const persistence = new MemoryFocusPersistence();
  const first = await publishFocusEdition({
    uid: 'n5',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(first.ok, true);

  // Archivio fantasma su data SUCCESSIVA: non entra in selectionMemory prior-only (P6.7.2p),
  // ma blocca il commit current-only post-pointer (nessuna sostituzione parziale).
  const ghostDate = '2026-10-20';
  persistence.archiveIndex.set(persistence.archiveKey('n5', ghostDate), {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusArchiveIndexEntry',
    publicationDate: ghostDate,
    analysisDate: '2026-10-19',
    revision: 1,
    status: 'published',
    headline: 'ghost',
    teaser: 'ghost',
    publishedAt: '2026-10-20T08:00:00.000Z',
  });
  persistence.editionMeta.set(persistence.metaKey('n5', ghostDate), {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusEdition',
    publicationDate: ghostDate,
    analysisDate: '2026-10-19',
    currentRevision: 1,
    status: 'published',
    headline: 'ghost',
    teaser: 'ghost',
    publishedAt: '2026-10-20T08:00:00.000Z',
  });
  persistence.jobs.set(persistence.jobKey('n5', ghostDate), {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusGenerationJob',
    publicationDate: ghostDate,
    analysisDate: '2026-10-19',
    status: FOCUS_JOB_STATUS.succeeded,
    ownerId: 'w1',
    leaseVersion: 1,
    publishedRevision: 1,
    inputFingerprint: 'ghost',
  });

  const before = await persistence.getEditorialMemory('n5');
  const beforeFp = fingerprintEditorialMemoryPayload(before);

  const regen = await publishFocusEdition({
    uid: 'n5',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
    explicitRegen: true,
  });
  // pointer aggiornati
  assert.equal(regen.ok, true, regen.error);
  assert.equal(
    (await persistence.getPublishedEdition('n5', PUBLICATION_DATE)).meta?.currentRevision,
    2,
  );
  // memoria non sostituita parzialmente
  assert.equal(regen.memoryPersisted, false);
  assert.equal(regen.memoryStatus, 'pending');
  assert.ok(regen.error);
  const after = await persistence.getEditorialMemory('n5');
  assert.equal(fingerprintEditorialMemoryPayload(after), beforeFp);
});

// --- 6. Conflitto stato memoria ---

test('P6.7.2n.6 conflitto concorrente → nessuna sovrascrittura', async () => {
  const persistence = new MemoryFocusPersistence();
  await publishFocusEdition({
    uid: 'n6',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  await publishFocusEdition({
    uid: 'n6',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
    explicitRegen: true,
  });

  const current = await persistence.getEditorialMemory('n6');
  const staleCursor = buildEditorialMemoryCursor(current);
  // mutazione concorrente
  persistence.memoryByUid.set('n6', {
    ...current,
    updatedAt: '2099-01-01T00:00:00.000Z',
    recentTopics: [
      ...(current.recentTopics || []),
      {
        topicId: 'concurrent_only',
        lastDates: [PUBLICATION_DATE],
        count14d: 99,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });

  const conflicted = await persistence.replaceEditorialMemoryIfUnchanged('n6', {
    expected: staleCursor,
    nextMemory: {
      ...createEmptyEditorialMemory(),
      lastAppliedEdition: `${PUBLICATION_DATE}#2`,
      updatedAt: '2099-01-02T00:00:00.000Z',
    },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.conflict, true);
  const stored = await persistence.getEditorialMemory('n6');
  assert.ok(stored.recentTopics.some((t) => t.topicId === 'concurrent_only'));
});

// --- 7. Fencing lease (limite documentato) ---

test('P6.7.2n.7 lease perso: pointer bloccati dal fencing; memoria non usa lease', async () => {
  const persistence = new MemoryFocusPersistence();
  await publishFocusEdition({
    uid: 'n7',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  // Secondo publish con lease rubato mid-flight è coperto da p672m (job_owner_mismatch).
  // Qui: commit memoria post-pointer dipende da CAS memoria + barriera, non dal lease.
  const acq = await persistence.acquirePublishBarrier('n7', {
    attemptId: 'fence',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true);
  const blocked = await commitCurrentOnlyMemoryAfterPublish({
    uid: 'n7',
    persistence,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'publication_in_progress');
  await persistence.releasePublishBarrier('n7', acq.hold);
});

// --- 8. Barriera publishing ---

test('P6.7.2n.8 barriera publishing → nessun recovery/commit corrente', async () => {
  const persistence = new MemoryFocusPersistence();
  await publishFocusEdition({
    uid: 'n8',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  await persistence.acquirePublishBarrier('n8', {
    attemptId: 'pub',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(
    readPublishCoordination(await persistence.getEditorialMemory('n8')).publishBarrier,
    PUBLISH_BARRIER_PUBLISHING,
  );
  const out = await commitCurrentOnlyMemoryAfterPublish({ uid: 'n8', persistence });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'publication_in_progress');
  assert.equal(out.memoryPersisted, false);
});

// --- 9. Publish normale senza regen ---

test('P6.7.2n.9 publish senza regen resta coerente (incremental = current-only a 1 rev)', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'n9',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
  const live = await persistence.getEditorialMemory('n9');
  const expected = await expectedCurrentOnly(persistence, 'n9', live.updatedAt);
  assert.equal(expected.ok, true);
  assert.equal(
    fingerprintEditorialMemoryPayload(live),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
});

// --- Admin mock parity ---

test('P6.7.2n Admin mock: regen allinea a current-only', async () => {
  const db = createMockAdminRtdb({
    [focusEditorialMemoryPath('na')]: createEmptyEditorialMemory(),
  });
  const persistence = new AdminRtdbFocusPersistence(db);
  const dossierInput = richDossierInput();
  const first = await publishFocusEdition({
    uid: 'na',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  const second = await publishFocusEdition({
    uid: 'na',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.revision, 2);
  assert.equal(second.memoryPersisted, true);
  const live = await persistence.getEditorialMemory('na');
  const expected = await expectedCurrentOnly(persistence, 'na', live.updatedAt);
  assert.equal(expected.ok, true);
  assert.equal(
    fingerprintEditorialMemoryPayload(live),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
});
