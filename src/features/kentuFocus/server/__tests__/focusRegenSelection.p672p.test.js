/**
 * P6.7.2p — selectionMemory prior-dates-only durante explicitRegen.
 * Offline: MemoryPersistence. Zero Gemini / Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import {
  createEmptyEditorialMemory,
  normalizeEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../../editorial/selectFocusEditorial.js';
import {
  PUBLICATION_DATE,
  buildFullDayFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import {
  FOCUS_JOB_STATUS,
  FOCUS_PERSISTENCE_SCHEMA_VERSION,
} from '../contracts/focusPersistence.v1.js';
import { fingerprintEditorialMemoryPayload } from '../memory/editorialMemoryCommit.js';
import { buildSelectionMemoryForExplicitRegen } from '../memory/buildSelectionMemoryForExplicitRegen.js';
import { rebuildEditorialMemoryFromPublishedPointers } from '../memory/focusMemoryReplay.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { publishFocusEdition } from '../publish/publishFocusEdition.js';
import { PUBLISH_BARRIER_STABLE, readPublishCoordination } from '../memory/publishBarrier.js';

function rich(overrides = {}) {
  return {
    ...buildFullDayFixture(),
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
    ...overrides,
  };
}

function slim(sel) {
  const item = (x) => (x ? {
    topicId: x.topicId,
    family: x.editorialFamily || null,
  } : null);
  return {
    lead: item(sel.lead),
    continuity: (sel.continuity || []).map(item),
    coach: sel.coach?.templateId || null,
  };
}

async function expectedCurrentOnly(persistence, uid, updatedAt) {
  const archiveEntries = await persistence.listArchiveIndex(uid, { limit: 365 });
  const metasByDate = {};
  const jobsByDate = {};
  const memoryEvents = [];
  for (const entry of archiveEntries) {
    const d = entry.publicationDate;
    const pub = await persistence.getPublishedEdition(uid, d);
    metasByDate[d] = pub.meta;
    jobsByDate[d] = await persistence.getJob(uid, d);
    const evt = await persistence.getMemoryEvent(uid, d, pub.meta.currentRevision);
    if (evt) memoryEvents.push(evt);
  }
  return rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries,
    metasByDate,
    jobsByDate,
    memoryEvents,
    updatedAt,
  });
}

test('P6.7.2p.1–3 #1 lead sonno; regen #2 lead di nuovo candidabile; continuity prior-only', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = rich();

  const first = await publishFocusEdition({
    uid: 'p1',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.revision, 1);
  const evt1 = await persistence.getMemoryEvent('p1', PUBLICATION_DATE, 1);
  assert.equal(evt1.selection.lead?.topicId, 'sleep_weekly_rhythm');

  // Controfattuale: selezione con live (include #1) vs prior-only
  const memLive = normalizeEditorialMemory(await persistence.getEditorialMemory('p1'));
  const priorBuilt = await buildSelectionMemoryForExplicitRegen({
    uid: 'p1',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  assert.equal(priorBuilt.ok, true, priorBuilt.error);
  const dossier = buildFocusDossier({ uid: 'p1', ...dossierInput });
  const selLive = selectFocusEditorial({
    dossier,
    memory: memLive,
    dossierContentHash: 'x',
  });
  const selPrior = selectFocusEditorial({
    dossier,
    memory: priorBuilt.memory,
    dossierContentHash: 'x',
  });
  assert.equal(selLive.lead, null, 'live include #1 deve sopprimere lead sonno');
  assert.equal(selPrior.lead?.topicId, 'sleep_weekly_rhythm');

  const regen = await publishFocusEdition({
    uid: 'p1',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, true, regen.error);
  assert.equal(regen.revision, 2);

  const evt2 = await persistence.getMemoryEvent('p1', PUBLICATION_DATE, 2);
  assert.equal(evt2.selection.lead?.topicId, 'sleep_weekly_rhythm');
  assert.deepEqual(
    (evt2.selection.continuity || []).map((c) => c.topicId).sort(),
    (selPrior.continuity || []).map((c) => c.topicId).sort(),
  );
  // non la selezione "soppressa"
  assert.notDeepEqual(
    (evt2.selection.continuity || []).map((c) => c.topicId).sort(),
    (selLive.continuity || []).map((c) => c.topicId).sort(),
  );
});

test('P6.7.2p.4–5 date precedenti preservate; cooldown altra data ancora efficace', async () => {
  const persistence = new MemoryFocusPersistence();
  const dayA = rich({
    analysisDate: '2026-10-15',
    publicationDate: '2026-10-16',
  });
  const dayB = rich();

  const pubA = await publishFocusEdition({
    uid: 'p45',
    persistence,
    dossierInput: dayA,
    ownerId: 'w1',
  });
  assert.equal(pubA.ok, true, pubA.error);
  const evtA = await persistence.getMemoryEvent('p45', '2026-10-16', 1);
  assert.equal(evtA.selection.lead?.topicId, 'sleep_weekly_rhythm');

  const pubB1 = await publishFocusEdition({
    uid: 'p45',
    persistence,
    dossierInput: dayB,
    ownerId: 'w1',
  });
  assert.equal(pubB1.ok, true, pubB1.error);

  const prior = await buildSelectionMemoryForExplicitRegen({
    uid: 'p45',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  assert.equal(prior.ok, true, prior.error);
  assert.equal(prior.memory.lastAppliedEdition, '2026-10-16#1');
  assert.ok((prior.memory.recentTopics || []).length > 0);
  // cooldown da 2026-10-16 ancora presente
  assert.equal(prior.memory.cooldown.topics.sleep_weekly_rhythm, '2026-10-19');

  const dossierB = buildFocusDossier({ uid: 'p45', ...dayB });
  const selWithPrior = selectFocusEditorial({
    dossier: dossierB,
    memory: prior.memory,
    dossierContentHash: 'b',
  });
  // stesso lead della data precedente → ancora in cooldown su 2026-10-17
  assert.equal(selWithPrior.lead, null);

  const regen = await publishFocusEdition({
    uid: 'p45',
    persistence,
    dossierInput: dayB,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, true, regen.error);
  const evt2 = await persistence.getMemoryEvent('p45', PUBLICATION_DATE, 2);
  // Canonica: lead assente omesso (undefined ≡ null)
  assert.equal(evt2.selection.lead ?? null, null);
  // memoria finale conserva effetti della data A (current-only include A + B#2)
  const final = await persistence.getEditorialMemory('p45');
  assert.ok(
    (final.recentTopics || []).some((t) => t.lastDates?.includes('2026-10-16'))
      || final.lastAppliedEdition === `${PUBLICATION_DATE}#2`,
  );
  const expected = await expectedCurrentOnly(persistence, 'p45', final.updatedAt);
  assert.equal(expected.ok, true);
  assert.equal(
    fingerprintEditorialMemoryPayload(final),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
});

test('P6.7.2p.6 snapshot storico mancante → regen bloccato senza pubblicazione', async () => {
  const persistence = new MemoryFocusPersistence();
  await publishFocusEdition({
    uid: 'p6',
    persistence,
    dossierInput: rich({
      analysisDate: '2026-10-15',
      publicationDate: '2026-10-16',
    }),
    ownerId: 'w1',
  });
  await publishFocusEdition({
    uid: 'p6',
    persistence,
    dossierInput: rich(),
    ownerId: 'w1',
  });

  // rovina snapshot della data precedente
  persistence.memoryEvents.delete(persistence.memoryEventKey('p6', '2026-10-16', 1));

  const beforeMeta = (await persistence.getPublishedEdition('p6', PUBLICATION_DATE)).meta;
  assert.equal(beforeMeta.currentRevision, 1);

  const regen = await publishFocusEdition({
    uid: 'p6',
    persistence,
    dossierInput: rich(),
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, false);
  assert.ok(
    regen.error === 'selection_memory_unrecoverable'
      || regen.error === 'memory_unrecoverable'
      || String(regen.error).includes('missing')
      || String(regen.error).includes('unrecoverable'),
    regen.error,
  );
  const afterMeta = (await persistence.getPublishedEdition('p6', PUBLICATION_DATE)).meta;
  assert.equal(afterMeta.currentRevision, 1);
  assert.equal(await persistence.getRevision('p6', PUBLICATION_DATE, 2), null);
  const job = await persistence.getJob('p6', PUBLICATION_DATE);
  assert.ok(
    job.status === FOCUS_JOB_STATUS.failed
      || job.status === FOCUS_JOB_STATUS.interrupted
      || job.status === FOCUS_JOB_STATUS.succeeded,
  );
});

test('P6.7.2p.7 publish ordinario senza regressione', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'p7',
    persistence,
    dossierInput: rich(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
  const evt = await persistence.getMemoryEvent('p7', PUBLICATION_DATE, 1);
  assert.equal(evt.selection.lead?.topicId, 'sleep_weekly_rhythm');
  const coord = readPublishCoordination(await persistence.getEditorialMemory('p7'));
  assert.equal(coord.publishBarrier, PUBLISH_BARRIER_STABLE);
});

test('P6.7.2p.8–9 memory_event #2 e memoria finale current-only', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = rich();
  await publishFocusEdition({
    uid: 'p89',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  const prior = await buildSelectionMemoryForExplicitRegen({
    uid: 'p89',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  const dossier = buildFocusDossier({ uid: 'p89', ...dossierInput });
  const expectedSel = selectFocusEditorial({
    dossier,
    memory: prior.memory,
    dossierContentHash: 'z',
  });

  const regen = await publishFocusEdition({
    uid: 'p89',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, true, regen.error);
  assert.equal(regen.memoryPersisted, true);

  const evt2 = await persistence.getMemoryEvent('p89', PUBLICATION_DATE, 2);
  assert.equal(evt2.selection.lead?.topicId, expectedSel.lead?.topicId);
  assert.deepEqual(slim(evt2.selection), slim(expectedSel));

  const final = await persistence.getEditorialMemory('p89');
  assert.equal(final.lastAppliedEdition, `${PUBLICATION_DATE}#2`);
  const expected = await expectedCurrentOnly(persistence, 'p89', final.updatedAt);
  assert.equal(expected.ok, true);
  assert.equal(
    fingerprintEditorialMemoryPayload(final),
    fingerprintEditorialMemoryPayload(expected.memory),
  );
  assert.equal(expected.appliedEditionKeys.includes(`${PUBLICATION_DATE}#1`), false);
  assert.ok(expected.appliedEditionKeys.includes(`${PUBLICATION_DATE}#2`));
});

test('P6.7.2p.10 barriera/generation/CAS invariati su regen ok', async () => {
  const persistence = new MemoryFocusPersistence();
  await publishFocusEdition({
    uid: 'p10',
    persistence,
    dossierInput: rich(),
    ownerId: 'w1',
  });
  const before = readPublishCoordination(await persistence.getEditorialMemory('p10'));
  const regen = await publishFocusEdition({
    uid: 'p10',
    persistence,
    dossierInput: rich(),
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(regen.ok, true, regen.error);
  const after = readPublishCoordination(await persistence.getEditorialMemory('p10'));
  assert.equal(after.publishBarrier, PUBLISH_BARRIER_STABLE);
  assert.ok(after.publishGeneration > before.publishGeneration);
  assert.equal(after.publishBarrierAttemptId, null);
});

test('P6.7.2p helper: prior vuoto → empty fedele; non fallback su failure', async () => {
  const persistence = new MemoryFocusPersistence();
  // nessuna archive → empty ok
  const empty = await buildSelectionMemoryForExplicitRegen({
    uid: 'ph',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.memory.lastAppliedEdition, null);

  await publishFocusEdition({
    uid: 'ph',
    persistence,
    dossierInput: rich({
      analysisDate: '2026-10-15',
      publicationDate: '2026-10-16',
    }),
    ownerId: 'w1',
  });
  // pointer prior inconsistenti
  persistence.editionMeta.set(persistence.metaKey('ph', '2026-10-16'), {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusEdition',
    publicationDate: '2026-10-16',
    analysisDate: '2026-10-15',
    currentRevision: 99,
    status: 'published',
    headline: 'x',
    teaser: 'y',
    publishedAt: '2026-10-16T08:00:00.000Z',
  });
  const bad = await buildSelectionMemoryForExplicitRegen({
    uid: 'ph',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
  assert.notEqual(bad.memory, createEmptyEditorialMemory());
});
