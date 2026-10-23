/**
 * P6.7.2j — orchestratore recoverFocusEditorialMemory (solo offline).
 * MemoryFocusPersistence + Admin mock. Zero Firebase reale / Gemini / publish.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import { buildFocusMemoryEvent, memoryEventToPublishEvent } from '../contracts/focusMemoryEvent.v1.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';
import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
  fingerprintEditorialMemoryPayload,
} from '../memory/editorialMemoryCommit.js';
import { rebuildEditorialMemoryFromEvents } from '../memory/focusMemoryReplay.js';
import { recoverFocusEditorialMemory } from '../memory/recoverFocusEditorialMemory.js';
import { focusEditorialMemoryPath } from '../paths/focusRtdbPaths.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';

function news(partial) {
  return {
    id: partial.id || `news_${partial.topicId}`,
    topicId: partial.topicId,
    editorialFamily: partial.editorialFamily ?? null,
    editorialScale: partial.editorialScale ?? 'episode',
    evidenceFingerprint: partial.evidenceFingerprint ?? null,
  };
}

function makeEvent(publicationDate, revision, selectionPartial) {
  return buildFocusMemoryEvent({
    publicationDate,
    revision,
    selection: {
      publicationDate,
      lead: selectionPartial.lead || null,
      centerpiece: selectionPartial.centerpiece || null,
      goodNews: selectionPartial.goodNews || [],
      features: selectionPartial.features || [],
      continuity: selectionPartial.continuity || [],
      concerns: selectionPartial.concerns || [],
      coach: selectionPartial.coach || null,
    },
  });
}

const EVT_17_1 = makeEvent('2026-10-17', 1, {
  lead: news({
    topicId: 'sleep_weekly_rhythm',
    editorialFamily: 'sleep_routine',
    editorialScale: 'week_interpretation',
    evidenceFingerprint: 'fp-17',
  }),
  continuity: [news({ topicId: 'protein_near_target' })],
});

const EVT_17_2 = makeEvent('2026-10-17', 2, {
  lead: news({
    topicId: 'sleep_hours_adequate',
    editorialScale: 'episode',
    evidenceFingerprint: 'fp-17b',
  }),
  continuity: [news({ topicId: 'documentation_complete' })],
});

const EVT_18_1 = makeEvent('2026-10-18', 1, {
  lead: news({
    topicId: 'sleep_weekly_rhythm',
    editorialFamily: 'sleep_routine',
    editorialScale: 'week_interpretation',
    evidenceFingerprint: 'fp-18',
  }),
  continuity: [news({ topicId: 'protein_near_target' })],
});

function seedPublished(persistence, uid, {
  publicationDate,
  revision,
  event,
  analysisDate = publicationDate,
}) {
  const meta = {
    schemaVersion: '1.0.0',
    kind: 'FocusEdition',
    publicationDate,
    analysisDate,
    currentRevision: revision,
    status: 'published',
    headline: 'h',
    teaser: 't',
    publishedAt: `${publicationDate}T09:00:00.000Z`,
  };
  const archive = {
    schemaVersion: '1.0.0',
    kind: 'FocusArchiveIndexEntry',
    publicationDate,
    analysisDate,
    revision,
    status: 'published',
    headline: 'h',
    teaser: 't',
    publishedAt: `${publicationDate}T09:00:00.000Z`,
  };
  const job = {
    schemaVersion: '1.0.0',
    kind: 'FocusGenerationJob',
    publicationDate,
    analysisDate,
    status: FOCUS_JOB_STATUS.succeeded,
    publishedRevision: revision,
    memoryAppliedKey: null,
    ownerId: 'seed',
    leaseVersion: 1,
  };

  if (persistence instanceof MemoryFocusPersistence) {
    persistence.editionMeta.set(persistence.metaKey(uid, publicationDate), meta);
    persistence.archiveIndex.set(persistence.archiveKey(uid, publicationDate), archive);
    persistence.jobs.set(persistence.jobKey(uid, publicationDate), job);
    persistence.revisions.set(
      persistence.revKey(uid, publicationDate, revision),
      { revision, publicationDate, lead: null },
    );
    persistence.memoryEvents.set(
      persistence.memoryEventKey(uid, publicationDate, revision),
      event,
    );
    return;
  }

  // Admin mock: path-based
  const db = persistence.db;
  const { focusEditionMetaPath, focusArchiveIndexPath, focusJobPath, focusEditionMemoryEventPath, focusEditionRevisionPath } = requirePaths();
  db._set(focusEditionMetaPath(uid, publicationDate), meta);
  db._set(focusArchiveIndexPath(uid, publicationDate), archive);
  db._set(focusJobPath(uid, publicationDate), job);
  db._set(focusEditionRevisionPath(uid, publicationDate, revision), {
    revision,
    publicationDate,
  });
  db._set(focusEditionMemoryEventPath(uid, publicationDate, revision), event);
}

function requirePaths() {
  return {
    focusEditionMetaPath: (uid, d) => `kentu_focus/${uid}/editions/${d}/meta`,
    focusArchiveIndexPath: (uid, d) => `kentu_focus/${uid}/archive_index/${d}`,
    focusJobPath: (uid, d) => `kentu_focus/${uid}/jobs/${d}`,
    focusEditionMemoryEventPath: (uid, d, r) => `kentu_focus/${uid}/editions/${d}/memory_events/${r}`,
    focusEditionRevisionPath: (uid, d, r) => `kentu_focus/${uid}/editions/${d}/rev/${r}`,
  };
}

function memTopics(memory) {
  return (memory?.recentTopics || []).map((t) => `${t.topicId}:${t.count14d}`).sort();
}

test('P6.7.2j memoria assente + snapshot completi → recovered', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_absent';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-18',
    revision: 1,
    event: EVT_18_1,
  });

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.editionPublished, true);
  assert.equal(out.memoryStatus, 'applied');
  assert.equal(out.recoveryStatus, 'recovered');
  assert.equal(out.memoryPersisted, true);
  assert.equal(out.memory?.lastAppliedEdition, '2026-10-18#1');
  assert.deepEqual(out.appliedEditionKeys, ['2026-10-17#1', '2026-10-18#1']);
  assert.equal(
    fingerprintEditorialMemoryPayload(out.memory),
    fingerprintEditorialMemoryPayload(await persistence.getEditorialMemory(uid)),
  );
});

test('P6.7.2j memoria già corretta → already_aligned', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_aligned';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  const rebuilt = rebuildEditorialMemoryFromEvents([EVT_17_1], {
    updatedAt: '2026-10-17T12:00:00.000Z',
  });
  persistence.memoryByUid.set(uid, rebuilt.memory);

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, true);
  assert.equal(out.recoveryStatus, 'already_aligned');
  assert.equal(out.memoryStatus, 'applied');
  assert.equal(out.memoryPersisted, true);
  assert.deepEqual(memTopics(out.memory), memTopics(rebuilt.memory));
});

test('P6.7.2j 17 pending + 18 presente → recovered current-only sequence', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_gap';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-18',
    revision: 1,
    event: EVT_18_1,
  });
  // Solo 18 applicato (gap sul 17)
  const only18 = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
    ...memoryEventToPublishEvent(EVT_18_1),
    updatedAt: 't',
  });
  persistence.memoryByUid.set(uid, only18);

  const diagnose = await recoverFocusEditorialMemory({
    uid,
    persistence,
    commit: false,
  });
  assert.equal(diagnose.recoveryStatus, 'pending_recoverable');
  assert.equal(diagnose.memoryStatus, 'pending');
  assert.equal(diagnose.memoryPersisted, false);
  assert.equal(diagnose.memory?.lastAppliedEdition, '2026-10-18#1');

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, true);
  assert.equal(out.recoveryStatus, 'recovered');
  assert.equal(out.memoryStatus, 'applied');
  assert.equal(out.memory?.lastAppliedEdition, '2026-10-18#1');
  assert.ok(memTopics(out.memory).some((t) => t.startsWith('protein_near_target:2')));
});

test('P6.7.2j revisione #2 sostituisce #1 (current-only; vs accumulo API apply documentato)', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_regen';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 2,
    event: EVT_17_2,
  });
  // Evento #1 a disco ma non pubblicato (sostituito)
  persistence.memoryEvents.set(
    persistence.memoryEventKey(uid, '2026-10-17', 1),
    EVT_17_1,
  );

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, true);
  assert.deepEqual(out.appliedEditionKeys, ['2026-10-17#2']);
  assert.ok(memTopics(out.memory).some((t) => t.startsWith('sleep_hours_adequate:')));
  assert.equal(memTopics(out.memory).some((t) => t.startsWith('sleep_weekly_rhythm:')), false);
  assert.match(out.liveSemanticsNote, /current_revision_only/);

  const liveAccumulated = applyEditorialMemoryAfterPublish(
    applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      ...memoryEventToPublishEvent(EVT_17_1),
      updatedAt: 't1',
    }),
    { ...memoryEventToPublishEvent(EVT_17_2), updatedAt: 't2' },
  );
  assert.notDeepEqual(memTopics(out.memory), memTopics(liveAccumulated));
});

test('P6.7.2j snapshot storico mancante → unrecoverable, store invariato', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_missing';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  persistence.memoryEvents.delete(persistence.memoryEventKey(uid, '2026-10-17', 1));
  persistence.memoryByUid.set(uid, sampleKeep());

  const before = await persistence.getEditorialMemory(uid);
  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, false);
  assert.equal(out.recoveryStatus, 'unrecoverable');
  assert.equal(out.memoryStatus, 'unrecoverable');
  assert.equal(out.editionPublished, true);
  assert.equal(out.memoryPersisted, false);
  assert.deepEqual(await persistence.getEditorialMemory(uid), before);
});

function sampleKeep() {
  const m = createEmptyEditorialMemory();
  m.lastAppliedEdition = 'keep#1';
  m.updatedAt = '2026-01-01T00:00:00.000Z';
  return m;
}

test('P6.7.2j puntatori archive/meta/job discordanti → unrecoverable', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_mismatch';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  const meta = persistence.editionMeta.get(persistence.metaKey(uid, '2026-10-17'));
  persistence.editionMeta.set(persistence.metaKey(uid, '2026-10-17'), {
    ...meta,
    currentRevision: 2,
  });

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, false);
  assert.equal(out.recoveryStatus, 'unrecoverable');
  assert.equal(out.error, 'published_pointers_inconsistent');
});

test('P6.7.2j conflitto memoria durante rebuild', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_mem_conflict';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });

  const out = await recoverFocusEditorialMemory({
    uid,
    persistence,
    hooks: {
      afterRebuild: async () => {
        const other = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
          ...memoryEventToPublishEvent(EVT_17_1),
          updatedAt: 'concurrent',
        });
        // Scrive bypassando replace (simula altro writer / apply live)
        other.recentTopics[0].count14d = 99;
        other.updatedAt = '2026-10-17T99:00:00.000Z';
        persistence.memoryByUid.set(uid, other);
      },
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.recoveryStatus, 'conflict');
  assert.equal(out.memoryStatus, 'pending');
  assert.equal(out.editionPublished, true);
  assert.equal(out.memoryPersisted, false);
  assert.equal((await persistence.getEditorialMemory(uid)).recentTopics[0].count14d, 99);
});

test('P6.7.2j cambio revisione pubblicata durante rebuild → plan_stale, no commit', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_plan_stale';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });

  const out = await recoverFocusEditorialMemory({
    uid,
    persistence,
    hooks: {
      afterRebuild: async () => {
        // Pubblica #2 al posto di #1 (pointer)
        seedPublished(persistence, uid, {
          publicationDate: '2026-10-17',
          revision: 2,
          event: EVT_17_2,
        });
      },
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.recoveryStatus, 'plan_stale');
  assert.equal(out.error, 'publish_plan_changed');
  assert.equal(out.memoryStatus, 'pending');
  assert.equal(out.memoryPersisted, false);
  assert.equal(await persistence.getEditorialMemory(uid), null);
});

test('P6.7.2j due recovery concorrenti — uno recovered, uno conflict', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_race';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-18',
    revision: 1,
    event: EVT_18_1,
  });

  const [a, b] = await Promise.all([
    recoverFocusEditorialMemory({ uid, persistence }),
    recoverFocusEditorialMemory({ uid, persistence }),
  ]);
  const recovered = [a, b].filter((r) => r.recoveryStatus === 'recovered');
  const conflicts = [a, b].filter((r) => r.recoveryStatus === 'conflict');
  const aligned = [a, b].filter((r) => r.recoveryStatus === 'already_aligned');
  // Un writer vince; l’altro confligge oppure vede già allineato.
  assert.ok(recovered.length + aligned.length >= 1);
  assert.ok(recovered.length + conflicts.length + aligned.length === 2);
  assert.ok(recovered.length <= 1);
  const stored = await persistence.getEditorialMemory(uid);
  assert.equal(stored.lastAppliedEdition, '2026-10-18#1');
  const protein = stored.recentTopics.find((t) => t.topicId === 'protein_near_target');
  assert.equal(protein.count14d, 2);
});

test('P6.7.2j secondo recovery senza doppio conteggio', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_twice';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-18',
    revision: 1,
    event: EVT_18_1,
  });

  const first = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(first.recoveryStatus, 'recovered');
  const topics1 = memTopics(first.memory);

  const second = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(second.recoveryStatus, 'already_aligned');
  assert.deepEqual(memTopics(second.memory), topics1);
  assert.equal(
    second.memory.recentTopics.find((t) => t.topicId === 'protein_near_target').count14d,
    2,
  );
});

test('P6.7.2j Admin mock: recovery riuscita', async () => {
  const uid = 'j_admin';
  const db = createMockAdminRtdb();
  const persistence = new AdminRtdbFocusPersistence(db);
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });

  const out = await recoverFocusEditorialMemory({ uid, persistence });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.recoveryStatus, 'recovered');
  assert.equal(out.memoryPersisted, true);
  assert.equal(
    (await persistence.getEditorialMemory(uid)).lastAppliedEdition,
    '2026-10-17#1',
  );
  assert.ok(db._get(focusEditorialMemoryPath(uid)));
});

test('P6.7.2j non espone memoria solo-RAM come applicata', async () => {
  const persistence = new MemoryFocusPersistence();
  const uid = 'j_no_ram';
  seedPublished(persistence, uid, {
    publicationDate: '2026-10-17',
    revision: 1,
    event: EVT_17_1,
  });
  const out = await recoverFocusEditorialMemory({
    uid,
    persistence,
    commit: false,
  });
  assert.equal(out.recoveryStatus, 'pending_recoverable');
  assert.equal(out.memoryStatus, 'pending');
  assert.equal(out.memory, null);
  assert.equal(out.memoryPersisted, false);
  assert.equal(await persistence.getEditorialMemory(uid), null);
});
