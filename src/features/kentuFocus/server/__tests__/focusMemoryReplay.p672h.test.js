/**
 * P6.7.2h — motore puro di replay memoria editoriale.
 * Offline, nessuna persistenza, nessun publish.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import {
  buildFocusMemoryEvent,
  memoryEventToPublishEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';
import {
  assertPublishedPointersConsistent,
  compareFocusEditionRefs,
  isSupersededRevision,
  planEditorialMemoryReplay,
  rebuildEditorialMemoryFromEvents,
  rebuildEditorialMemoryFromPublishedPointers,
  resolveAuthoritativePublishedEditions,
  resolveCurrentRevisionForDate,
  selectMemoryEventsForPublishedEditions,
  sortFocusEditionRefs,
} from '../memory/focusMemoryReplay.js';

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
    capturedAt: `${publicationDate}T08:00:00.000Z`,
  });
}

function archiveEntry(publicationDate, revision) {
  return {
    schemaVersion: '1.0.0',
    kind: 'FocusArchiveIndexEntry',
    publicationDate,
    analysisDate: publicationDate,
    revision,
    status: 'published',
    headline: 'h',
    teaser: 't',
    publishedAt: `${publicationDate}T09:00:00.000Z`,
  };
}

function meta(publicationDate, currentRevision) {
  return {
    schemaVersion: '1.0.0',
    kind: 'FocusEdition',
    publicationDate,
    analysisDate: publicationDate,
    currentRevision,
    status: 'published',
    headline: 'h',
    teaser: 't',
    publishedAt: `${publicationDate}T09:00:00.000Z`,
  };
}

function job(publicationDate, publishedRevision, status = FOCUS_JOB_STATUS.succeeded) {
  return {
    schemaVersion: '1.0.0',
    kind: 'FocusGenerationJob',
    publicationDate,
    analysisDate: publicationDate,
    status,
    publishedRevision,
    memoryAppliedKey: null,
  };
}

function memView(memory) {
  return {
    last: memory?.lastAppliedEdition ?? null,
    topics: (memory?.recentTopics || [])
      .map((t) => `${t.topicId}:${t.count14d}:${t.editorialFamily || '-'}:${t.evidenceFingerprint || '-'}`)
      .sort(),
    families: { ...(memory?.cooldown?.families || {}) },
    scaleFp: { ...(memory?.cooldown?.scaleFingerprints || {}) },
    coach: (memory?.recentCoach || []).map((c) => `${c.publicationDate}:${c.templateId}`),
    experiments: (memory?.activeExperiments || []).map(
      (e) => `${e.templateId}:${(e.metricPaths || []).join('|')}`,
    ),
  };
}

const EVT_17_1 = makeEvent('2026-10-17', 1, {
  lead: news({
    topicId: 'sleep_weekly_rhythm',
    editorialFamily: 'sleep_routine',
    editorialScale: 'week_interpretation',
    evidenceFingerprint: 'fp-sleep-17',
  }),
  continuity: [
    news({ topicId: 'protein_near_target', editorialScale: 'episode' }),
    news({ topicId: 'workout_logged', editorialScale: 'episode' }),
  ],
  // Niente coach qui: maxOpenExperiments=1; il follow-up si verifica su EVT_18_1.
});

const EVT_17_2 = makeEvent('2026-10-17', 2, {
  lead: news({
    topicId: 'sleep_hours_adequate',
    editorialFamily: null,
    editorialScale: 'episode',
    evidenceFingerprint: 'fp-hours-17b',
  }),
  continuity: [
    news({ topicId: 'documentation_complete', editorialScale: 'episode' }),
  ],
});

const EVT_18_1 = makeEvent('2026-10-18', 1, {
  lead: news({
    topicId: 'sleep_weekly_rhythm',
    editorialFamily: 'sleep_routine',
    editorialScale: 'week_interpretation',
    evidenceFingerprint: 'fp-sleep-18',
  }),
  continuity: [
    news({ topicId: 'protein_near_target', editorialScale: 'episode' }),
    news({ topicId: 'workout_logged', editorialScale: 'episode' }),
  ],
  centerpiece: news({
    topicId: 'strength_month_arc',
    editorialScale: 'month_transformation',
    evidenceFingerprint: 'fp-month-18',
    editorialFamily: null,
  }),
  coach: {
    templateId: 'PROTEIN_HIT',
    textSeed: 'proteine',
    horizonDays: 3,
    followUp: { metricPaths: ['day.nutrition.totals.proteinG'] },
  },
});

const EVT_17_10 = makeEvent('2026-10-17', 10, {
  lead: news({ topicId: 'late_revision_topic', editorialScale: 'episode' }),
});

test('P6.7.2h ordinamento numerico date+revisione (#2 prima di #10)', () => {
  const refs = [
    { publicationDate: '2026-10-17', revision: 10 },
    { publicationDate: '2026-10-18', revision: 1 },
    { publicationDate: '2026-10-17', revision: 2 },
    { publicationDate: '2026-10-17', revision: 1 },
  ];
  const sorted = sortFocusEditionRefs(refs);
  assert.deepEqual(
    sorted.map((r) => `${r.publicationDate}#${r.revision}`),
    ['2026-10-17#1', '2026-10-17#2', '2026-10-17#10', '2026-10-18#1'],
  );
  assert.ok(compareFocusEditionRefs(
    { publicationDate: '2026-10-17', revision: 2 },
    { publicationDate: '2026-10-17', revision: 10 },
  ) < 0);
});

test('P6.7.2h current revision e superseded', () => {
  const cur = resolveCurrentRevisionForDate({
    publicationDate: '2026-10-17',
    archiveRevision: 2,
    metaCurrentRevision: 2,
  });
  assert.equal(cur.ok, true);
  assert.equal(cur.revision, 2);
  assert.equal(
    isSupersededRevision(
      { publicationDate: '2026-10-17', revision: 1 },
      { publicationDate: '2026-10-17', revision: 2 },
    ),
    true,
  );
  assert.equal(
    isSupersededRevision(
      { publicationDate: '2026-10-17', revision: 2 },
      { publicationDate: '2026-10-17', revision: 2 },
    ),
    false,
  );
});

test('P6.7.2h 17→18 replay ordinato preserva continuity/family/scale/fp/coach', () => {
  const result = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [
      archiveEntry('2026-10-18', 1),
      archiveEntry('2026-10-17', 1),
    ],
    metasByDate: {
      '2026-10-17': meta('2026-10-17', 1),
      '2026-10-18': meta('2026-10-18', 1),
    },
    jobsByDate: {
      '2026-10-17': job('2026-10-17', 1),
      '2026-10-18': job('2026-10-18', 1),
    },
    memoryEvents: [EVT_18_1, EVT_17_1],
    updatedAt: '2026-10-18T12:00:00.000Z',
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.appliedEditionKeys, ['2026-10-17#1', '2026-10-18#1']);
  const view = memView(result.memory);
  assert.equal(view.last, '2026-10-18#1');
  assert.ok(view.topics.some((t) => t.startsWith('protein_near_target:2:')));
  assert.ok(view.topics.some((t) => t.startsWith('workout_logged:2:')));
  assert.ok(view.topics.some((t) => t.includes('sleep_weekly_rhythm:2:sleep_routine:fp-sleep-18')));
  assert.ok(view.topics.some((t) => t.includes('strength_month_arc:1')));
  assert.equal(view.families.sleep_routine, '2026-10-25');
  assert.ok(view.scaleFp['week_interpretation::sleep_weekly_rhythm::fp-sleep-18']);
  assert.ok(view.scaleFp['month_transformation::strength_month_arc::fp-month-18']);
  assert.ok(view.coach.includes('2026-10-18:PROTEIN_HIT'));
  assert.ok(view.experiments.some((e) => e.includes('PROTEIN_HIT:day.nutrition.totals.proteinG')));
});

test('P6.7.2h revisione #2 sostituisce #1 (current-only, #1 escluso)', () => {
  const resolved = resolveAuthoritativePublishedEditions({
    archiveEntries: [archiveEntry('2026-10-17', 2)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 2) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 2) },
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.editions.map((e) => e.editionKey), ['2026-10-17#2']);

  const selected = selectMemoryEventsForPublishedEditions({
    editions: resolved.editions,
    memoryEvents: [EVT_17_1, EVT_17_2],
  });
  assert.equal(selected.ok, true);
  assert.deepEqual(selected.events.map((e) => e.editionKey), ['2026-10-17#2']);
  assert.ok(selected.excludedExtras.includes('2026-10-17#1'));

  const rebuilt = rebuildEditorialMemoryFromEvents(selected.events);
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.memory.lastAppliedEdition, '2026-10-17#2');
  const topics = memView(rebuilt.memory).topics;
  assert.ok(topics.some((t) => t.startsWith('sleep_hours_adequate:')));
  assert.ok(topics.some((t) => t.startsWith('documentation_complete:')));
  assert.equal(topics.some((t) => t.startsWith('sleep_weekly_rhythm:')), false);
  assert.equal(topics.some((t) => t.startsWith('protein_near_target:')), false);
});

test('P6.7.2h snapshot #1 presente ma mai pubblicato: escluso', () => {
  // Solo il 18 è in archive; evento 17 esiste ma non pubblicato
  const plan = planEditorialMemoryReplay({
    archiveEntries: [archiveEntry('2026-10-18', 1)],
    metasByDate: { '2026-10-18': meta('2026-10-18', 1) },
    jobsByDate: { '2026-10-18': job('2026-10-18', 1) },
    memoryEvents: [EVT_17_1, EVT_18_1],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.editions.map((e) => e.editionKey), ['2026-10-18#1']);
  assert.ok(plan.excludedExtras.includes('2026-10-17#1'));
  assert.deepEqual(plan.events.map((e) => e.editionKey), ['2026-10-18#1']);
});

test('P6.7.2h gap 17→18 con tutti gli eventi: replay completo', () => {
  const result = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [
      archiveEntry('2026-10-17', 1),
      archiveEntry('2026-10-18', 1),
    ],
    metasByDate: {
      '2026-10-17': meta('2026-10-17', 1),
      '2026-10-18': meta('2026-10-18', 1),
    },
    jobsByDate: {
      '2026-10-17': job('2026-10-17', 1),
      '2026-10-18': job('2026-10-18', 1),
    },
    memoryEventsByKey: {
      '2026-10-17#1': EVT_17_1,
      '2026-10-18#1': EVT_18_1,
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.appliedEditionKeys, ['2026-10-17#1', '2026-10-18#1']);
});

test('P6.7.2h snapshot mancante → memory_unrecoverable, nessuna memoria parziale', () => {
  const result = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [
      archiveEntry('2026-10-17', 1),
      archiveEntry('2026-10-18', 1),
    ],
    metasByDate: {
      '2026-10-17': meta('2026-10-17', 1),
      '2026-10-18': meta('2026-10-18', 1),
    },
    jobsByDate: {
      '2026-10-17': job('2026-10-17', 1),
      '2026-10-18': job('2026-10-18', 1),
    },
    memoryEvents: [EVT_18_1], // manca 17
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_unrecoverable');
  assert.equal(result.memory, null);
  assert.ok(result.missing?.some((m) => m.editionKey === '2026-10-17#1'));
});

test('P6.7.2h snapshot invalido → memory_unrecoverable', () => {
  const bad = {
    ...EVT_17_1,
    contentFingerprint: 'tampered',
  };
  const result = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [archiveEntry('2026-10-17', 1)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 1) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 1) },
    memoryEvents: [bad],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_unrecoverable');
  assert.equal(result.memory, null);
  assert.ok(result.invalid?.length);
});

test('P6.7.2h puntatori archive/meta/job discordanti → errore esplicito', () => {
  const consistent = assertPublishedPointersConsistent({
    publicationDate: '2026-10-17',
    archiveEntry: archiveEntry('2026-10-17', 1),
    meta: meta('2026-10-17', 1),
    job: job('2026-10-17', 1),
  });
  assert.equal(consistent.ok, true);

  const mismatch = resolveAuthoritativePublishedEditions({
    archiveEntries: [archiveEntry('2026-10-17', 1)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 2) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 1) },
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'published_pointers_inconsistent');
  assert.ok(mismatch.conflicts?.length);

  const rebuilt = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [archiveEntry('2026-10-17', 1)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 2) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 1) },
    memoryEvents: [EVT_17_1],
  });
  assert.equal(rebuilt.ok, false);
  assert.equal(rebuilt.memory, null);
});

test('P6.7.2h replay ripetuto: stesso risultato, nessun incremento conteggi', () => {
  const input = {
    archiveEntries: [
      archiveEntry('2026-10-17', 1),
      archiveEntry('2026-10-18', 1),
    ],
    metasByDate: {
      '2026-10-17': meta('2026-10-17', 1),
      '2026-10-18': meta('2026-10-18', 1),
    },
    jobsByDate: {
      '2026-10-17': job('2026-10-17', 1),
      '2026-10-18': job('2026-10-18', 1),
    },
    memoryEvents: [EVT_17_1, EVT_18_1],
    updatedAt: '2026-10-18T12:00:00.000Z',
  };
  const a = rebuildEditorialMemoryFromPublishedPointers(input);
  const b = rebuildEditorialMemoryFromPublishedPointers(input);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(memView(a.memory), memView(b.memory));
  assert.deepEqual(a.memory, b.memory);

  // Gli eventi originali non sono mutati
  assert.equal(EVT_17_1.selection.continuity.length, 2);
  assert.equal(EVT_17_1.editionKey, '2026-10-17#1');
});

test('P6.7.2h current-only vs accumulo live #1+#2: divergenza esplicita', () => {
  // Live odierno su regen: applica #2 sopra memoria che già ha #1
  const liveAccumulated = applyEditorialMemoryAfterPublish(
    applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      ...memoryEventToPublishEvent(EVT_17_1),
      updatedAt: 't1',
    }),
    {
      ...memoryEventToPublishEvent(EVT_17_2),
      updatedAt: 't2',
    },
  );

  // Recovery autorevole: solo #2 (archive/meta/job puntano a 2)
  const currentOnly = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [archiveEntry('2026-10-17', 2)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 2) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 2) },
    memoryEvents: [EVT_17_1, EVT_17_2],
    updatedAt: 't2',
  });
  assert.equal(currentOnly.ok, true);

  const liveView = memView(liveAccumulated);
  const recoveryView = memView(currentOnly.memory);

  assert.equal(liveView.last, '2026-10-17#2');
  assert.equal(recoveryView.last, '2026-10-17#2');
  // Stesso lastApplied, corpo diverso: la divergenza non va mascherata
  assert.notDeepEqual(liveView.topics, recoveryView.topics);
  assert.ok(liveView.topics.some((t) => t.startsWith('sleep_weekly_rhythm:')));
  assert.equal(recoveryView.topics.some((t) => t.startsWith('sleep_weekly_rhythm:')), false);
  assert.ok(liveView.families.sleep_routine);
  assert.equal(Object.keys(recoveryView.families).length, 0);
});

test('P6.7.2h rebuildEditorialMemoryFromEvents non scrive e fallisce su ordine invertito', () => {
  const ok = rebuildEditorialMemoryFromEvents([EVT_17_1, EVT_18_1]);
  assert.equal(ok.ok, true);
  assert.equal(ok.memory.lastAppliedEdition, '2026-10-18#1');

  const badOrder = rebuildEditorialMemoryFromEvents([EVT_18_1, EVT_17_1]);
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.error, 'memory_events_out_of_order');
  assert.equal(badOrder.memory, null);
});

test('P6.7.2h #2 e #10 con pointer su #10: solo #10 nel replay', () => {
  const result = rebuildEditorialMemoryFromPublishedPointers({
    archiveEntries: [archiveEntry('2026-10-17', 10)],
    metasByDate: { '2026-10-17': meta('2026-10-17', 10) },
    jobsByDate: { '2026-10-17': job('2026-10-17', 10) },
    memoryEvents: [EVT_17_2, EVT_17_10, EVT_17_1],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.appliedEditionKeys, ['2026-10-17#10']);
  assert.ok(result.excludedExtras.includes('2026-10-17#1'));
  assert.ok(result.excludedExtras.includes('2026-10-17#2'));
  assert.ok(
    memView(result.memory).topics.some((t) => t.startsWith('late_revision_topic:')),
  );
});
