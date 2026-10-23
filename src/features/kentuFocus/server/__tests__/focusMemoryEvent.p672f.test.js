/**
 * P6.7.2f — snapshot memory_event fedele, create-only, gate pre-publish.
 * Offline: MemoryFocusPersistence. Zero Gemini / Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../../editorial/selectFocusEditorial.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import {
  assessMemoryEventRecoverability,
  buildFocusMemoryEvent,
  computeMemoryEventContentFingerprint,
  memoryEventToPublishEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { focusEditionMemoryEventPath } from '../paths/focusRtdbPaths.js';
import { publishFocusEdition } from '../publish/publishFocusEdition.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';

function richDossierInput(overrides = {}) {
  const fixture = buildFullDayFixture();
  return {
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
    ...overrides,
  };
}

function buildSelection(dossierInput = richDossierInput()) {
  const dossier = buildFocusDossier({
    uid: 'p672f',
    ...dossierInput,
  });
  return selectFocusEditorial({
    dossier,
    memory: createEmptyEditorialMemory(),
    dossierContentHash: 'p672f',
  });
}

function memView(memory) {
  return {
    last: memory?.lastAppliedEdition ?? null,
    topics: (memory?.recentTopics || [])
      .map((t) => `${t.topicId}:${t.count14d}:${t.editorialFamily || '-'}:${t.evidenceFingerprint || '-'}`)
      .sort(),
    families: { ...(memory?.cooldown?.families || {}) },
    scaleFp: { ...(memory?.cooldown?.scaleFingerprints || {}) },
    leads: (memory?.recentLeads || []).map((l) => `${l.publicationDate}:${(l.topicIds || []).join('|')}`),
    coach: (memory?.recentCoach || []).map((c) => `${c.publicationDate}:${c.templateId}`),
    experiments: (memory?.activeExperiments || []).map((e) => `${e.id}:${(e.metricPaths || []).join('|')}`),
  };
}

test('P6.7.2f path memory_events sibling di rev', () => {
  assert.equal(
    focusEditionMemoryEventPath('u1', PUBLICATION_DATE, 1),
    `kentu_focus/u1/editions/${PUBLICATION_DATE}/memory_events/1`,
  );
});

test('P6.7.2f evento completo e fedele alla selection (continuity/family/scale/fp)', () => {
  const selection = buildSelection();
  assert.ok(
    selection.lead || (selection.continuity && selection.continuity.length > 0),
    'fixture deve produrre pezzi memoria',
  );

  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
    capturedAt: '2026-10-17T08:00:00.000Z',
  });

  assert.equal(event.schemaVersion, '1.0.0');
  assert.equal(event.kind, 'FocusMemoryEvent');
  assert.equal(event.editionKey, `${PUBLICATION_DATE}#1`);
  assert.equal(event.publicationDate, PUBLICATION_DATE);
  assert.equal(event.revision, 1);
  assert.ok(event.contentFingerprint.startsWith('fnv1a_'));

  assert.equal(
    Boolean(event.selection.continuity?.length),
    Boolean(selection.continuity?.length),
  );
  assert.equal(
    event.selection.centerpiece?.topicId ?? null,
    selection.centerpiece?.topicId ?? null,
  );

  if (selection.lead) {
    assert.equal(event.selection.lead.topicId, selection.lead.topicId);
    // Canonica RTDB: campi null omessi (undefined ≡ assenza ≡ null)
    assert.equal(
      event.selection.lead.editorialFamily ?? null,
      selection.lead.editorialFamily || null,
    );
    assert.equal(
      event.selection.lead.editorialScale ?? null,
      selection.lead.editorialScale || null,
    );
    assert.equal(
      event.selection.lead.evidenceFingerprint ?? null,
      selection.lead.evidenceFingerprint || null,
    );
  }

  for (let i = 0; i < (selection.continuity || []).length; i += 1) {
    const src = selection.continuity[i];
    const slim = event.selection.continuity[i];
    assert.equal(slim.topicId, src.topicId);
    assert.equal(slim.editorialFamily ?? null, src.editorialFamily || null);
    assert.equal(slim.editorialScale ?? null, src.editorialScale || null);
    assert.equal(slim.evidenceFingerprint ?? null, src.evidenceFingerprint || null);
  }

  // Nessuna prosa / seed giornalistici nel contratto minimo
  assert.equal(Object.prototype.hasOwnProperty.call(event.selection.lead || {}, 'headlineSeed'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event.selection.lead || {}, 'body'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'articles'), false);
});

test('P6.7.2f snapshot → applyEditorialMemoryAfterPublish identico alla selection', () => {
  const selection = buildSelection();
  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
  });
  const fromSelection = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
    updatedAt: '2026-10-17T08:00:00.000Z',
  });
  const fromEvent = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
    ...memoryEventToPublishEvent(event),
    updatedAt: '2026-10-17T08:00:00.000Z',
  });
  assert.deepEqual(memView(fromEvent), memView(fromSelection));
});

test('P6.7.2f stessa chiave + stesso contenuto → idempotente', async () => {
  const persistence = new MemoryFocusPersistence();
  const selection = buildSelection();
  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
  });
  const a = await persistence.saveMemoryEventImmutable('u_idemp', PUBLICATION_DATE, event);
  const b = await persistence.saveMemoryEventImmutable('u_idemp', PUBLICATION_DATE, event);
  assert.equal(a.ok, true);
  assert.equal(a.alreadyExists, false);
  assert.equal(b.ok, true);
  assert.equal(b.alreadyExists, true);
  assert.equal(b.memoryEvent.contentFingerprint, a.memoryEvent.contentFingerprint);
  assert.equal(persistence.memoryEvents.size, 1);
});

test('P6.7.2f stessa chiave + contenuto differente → conflitto esplicito', async () => {
  const persistence = new MemoryFocusPersistence();
  const selection = buildSelection();
  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
  });
  const first = await persistence.saveMemoryEventImmutable('u_conflict', PUBLICATION_DATE, event);
  assert.equal(first.ok, true);

  const altered = {
    ...event,
    selection: {
      ...event.selection,
      continuity: [
        ...(event.selection.continuity || []),
        {
          id: 'news_extra',
          topicId: 'forced_extra_topic',
          editorialFamily: null,
          editorialScale: 'episode',
          evidenceFingerprint: 'fp-extra',
        },
      ],
    },
  };
  // fingerprint ricalcolato dal caller malevolo / diverso builder (forma canonica)
  altered.contentFingerprint = computeMemoryEventContentFingerprint({
    editionKey: altered.editionKey,
    publicationDate: altered.publicationDate,
    revision: altered.revision,
    selection: altered.selection,
  });

  const second = await persistence.saveMemoryEventImmutable('u_conflict', PUBLICATION_DATE, altered);
  assert.equal(second.ok, false);
  assert.equal(second.error, 'memory_event_conflict');
  const stored = await persistence.getMemoryEvent('u_conflict', PUBLICATION_DATE, 1);
  assert.equal(stored.contentFingerprint, event.contentFingerprint);
});

test('P6.7.2f fallimento salvataggio evento → nessuna nuova pubblicazione', async () => {
  const persistence = new MemoryFocusPersistence();
  persistence._failMemoryEventOnce = true;
  const result = await publishFocusEdition({
    uid: 'u_fail_evt',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_event_save_failed');
  const published = await persistence.getPublishedEdition('u_fail_evt', PUBLICATION_DATE);
  assert.equal(published.meta, null);
  const rev = await persistence.getRevision('u_fail_evt', PUBLICATION_DATE, 1);
  assert.ok(rev, 'revisione può esistere, ma non pubblicata');
  const evt = await persistence.getMemoryEvent('u_fail_evt', PUBLICATION_DATE, 1);
  assert.equal(evt, null);
  const job = await persistence.getJob('u_fail_evt', PUBLICATION_DATE);
  assert.equal(job.status, FOCUS_JOB_STATUS.interrupted);
});

test('P6.7.2f snapshot salvato + pubblicazione fallita → distinguibile e riprendibile', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const selection = buildSelection(dossierInput);
  const claim = await persistence.claimJob('u_resume', PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'will-mismatch',
  });
  await persistence.updateJobIfOwner(
    'u_resume',
    PUBLICATION_DATE,
    'w1',
    claim.job.leaseVersion,
    { status: FOCUS_JOB_STATUS.running },
  );

  // Simula: revisione + evento già su disco, publish owner mismatch
  const { buildEssentialEditionFromSelection } = await import('../publish/buildEssentialEdition.js');
  const built = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: 'fp-resume',
  });
  const saveRev = await persistence.saveRevisionImmutable(
    'u_resume',
    PUBLICATION_DATE,
    built.revisionDoc,
  );
  assert.equal(saveRev.ok, true);
  const event = buildFocusMemoryEvent({
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
  });
  const saveEvt = await persistence.saveMemoryEventImmutable(
    'u_resume',
    PUBLICATION_DATE,
    event,
  );
  assert.equal(saveEvt.ok, true);

  const pubNoHold = await persistence.publishCurrentRevision('u_resume', PUBLICATION_DATE, {
    ownerId: 'other',
    leaseVersion: claim.job.leaseVersion,
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: 1,
  });
  assert.equal(pubNoHold.ok, false);
  // Memory: owner mismatch prima del check hold
  assert.equal(pubNoHold.error, 'job_owner_mismatch_on_publish');

  const mid = await persistence.getPublishedEdition('u_resume', PUBLICATION_DATE);
  assert.equal(mid.meta, null);
  assert.ok(await persistence.getRevision('u_resume', PUBLICATION_DATE, 1));
  assert.ok(await persistence.getMemoryEvent('u_resume', PUBLICATION_DATE, 1));

  // Ripresa con owner corretto: evento idempotente, poi publish con barriera
  const acq = await persistence.acquirePublishBarrier('u_resume', {
    attemptId: 'resume_w1',
    jobDate: PUBLICATION_DATE,
  });
  assert.equal(acq.ok, true, acq.error);
  const pubOk = await persistence.publishCurrentRevision('u_resume', PUBLICATION_DATE, {
    ownerId: 'w1',
    leaseVersion: claim.job.leaseVersion,
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: 1,
    barrierHold: acq.hold,
  });
  assert.equal(pubOk.ok, true, pubOk.error);
  const rel = await persistence.releasePublishBarrier('u_resume', acq.hold);
  assert.equal(rel.ok, true, rel.error);
  const againEvt = await persistence.saveMemoryEventImmutable(
    'u_resume',
    PUBLICATION_DATE,
    event,
  );
  assert.equal(againEvt.ok, true);
  assert.equal(againEvt.alreadyExists, true);
  const published = await persistence.getPublishedEdition('u_resume', PUBLICATION_DATE);
  assert.equal(published.meta?.currentRevision, 1);
});

test('P6.7.2f replay pubblicazione non sovrascrive lo snapshot', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const first = await publishFocusEdition({
    uid: 'u_replay',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(first.ok, true, first.error);
  const before = await persistence.getMemoryEvent('u_replay', PUBLICATION_DATE, 1);
  assert.ok(before);

  const second = await publishFocusEdition({
    uid: 'u_replay',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.idempotentReplay, true);
  const after = await persistence.getMemoryEvent('u_replay', PUBLICATION_DATE, 1);
  assert.deepEqual(after, before);
  assert.equal(persistence.memoryEvents.size, 1);
});

test('P6.7.2f edizione storica senza snapshot → non dichiarata recuperabile', async () => {
  const persistence = new MemoryFocusPersistence();
  // Simula edizione pubblicata “vecchia” senza memory_event
  const selection = buildSelection();
  const { buildEssentialEditionFromSelection } = await import('../publish/buildEssentialEdition.js');
  const built = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: 'legacy',
  });
  const claim = await persistence.claimJob('u_legacy', PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'legacy',
  });
  await persistence.updateJobIfOwner(
    'u_legacy',
    PUBLICATION_DATE,
    'w1',
    claim.job.leaseVersion,
    { status: FOCUS_JOB_STATUS.running },
  );
  await persistence.saveRevisionImmutable('u_legacy', PUBLICATION_DATE, built.revisionDoc);
  // bypass gate: inserisce meta/archive direttamente (solo test storico)
  persistence.editionMeta.set(
    persistence.metaKey('u_legacy', PUBLICATION_DATE),
    built.editionMeta,
  );
  persistence.archiveIndex.set(
    persistence.archiveKey('u_legacy', PUBLICATION_DATE),
    built.archiveEntry,
  );
  persistence.jobs.set(persistence.jobKey('u_legacy', PUBLICATION_DATE), {
    ...claim.job,
    status: FOCUS_JOB_STATUS.succeeded,
    publishedRevision: 1,
  });

  const evt = await persistence.getMemoryEvent('u_legacy', PUBLICATION_DATE, 1);
  assert.equal(evt, null);
  const assess = assessMemoryEventRecoverability(evt, {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
  });
  assert.equal(assess.recoverable, false);
  assert.equal(assess.reason, 'memory_event_missing');
});

test('P6.7.2f publishFocusEdition salva memory_event prima del publish riuscito', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'u_happy',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  const evt = await persistence.getMemoryEvent('u_happy', PUBLICATION_DATE, 1);
  assert.ok(evt);
  assert.equal(evt.editionKey, `${PUBLICATION_DATE}#1`);
  assert.ok(Array.isArray(evt.selection.continuity));
  const assess = assessMemoryEventRecoverability(evt, {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
  });
  assert.equal(assess.recoverable, true);
});
