import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
  buildMissingValuesFixture,
} from '../../__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../../__tests__/fixtures/focusHistoryFixtures.js';
import {
  FOCUS_JOB_STATUS,
  FOCUS_PERSISTENCE_SCHEMA_VERSION,
} from '../contracts/focusPersistence.v1.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { FOCUS_PERSISTENCE_ATOMICITY_NOTES } from '../persist/FocusPersistencePort.js';
import { FocusSanitizeError, sanitizeForRtdb, stableFingerprint } from '../sanitize/rtdbSanitize.js';
import {
  publishFocusEdition,
  repairFocusMemoryAfterPublish,
} from '../publish/publishFocusEdition.js';
import { validateFocusEditionRevision } from '../validate/validateFocusEdition.js';
import { focusArchiveIndexRootPath, focusRootPath } from '../paths/focusRtdbPaths.js';
import { FOCUS_PACKAGING_STATUS } from '../proposed/packagingNode20.js';

function richDossierInput() {
  const fixture = buildFullDayFixture();
  return {
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
  };
}

test('I4-B sanitize: rifiuta NaN/Infinity, rimuove undefined', () => {
  assert.throws(() => sanitizeForRtdb({ a: NaN }), FocusSanitizeError);
  assert.throws(() => sanitizeForRtdb({ a: Infinity }), FocusSanitizeError);
  const cleaned = sanitizeForRtdb({ a: 1, b: undefined, c: null });
  assert.deepEqual(cleaned, { a: 1, c: null });
  assert.ok(stableFingerprint({ x: 1 }).startsWith('fnv1a_'));
});

test('I4-B paths kentu_focus', () => {
  assert.equal(focusRootPath('u1'), 'kentu_focus/u1');
  assert.equal(focusArchiveIndexRootPath('u1'), 'kentu_focus/u1/archive_index');
  assert.ok(FOCUS_PERSISTENCE_ATOMICITY_NOTES.leaseTtlInsufficient);
  assert.equal(FOCUS_PACKAGING_STATUS.includedInFunctionsDeployToday, false);
});

test('I4-B publish happy path + memoria dopo successo', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'user_a',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'worker_1',
    nowIso: '2026-10-17T08:05:00.000Z',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
  assert.equal(result.revisionDoc.schemaVersion, FOCUS_PERSISTENCE_SCHEMA_VERSION);
  assert.equal(result.revisionDoc.technicalOnly, false);
  assert.equal(result.revisionDoc.proseSource, 'fallback');
  assert.ok(result.revisionDoc.editorialNotes.includes('prose_source_fallback'));
  assert.equal(result.revisionDoc.immutable, true);
  assert.ok(result.memory?.lastAppliedEdition === `${PUBLICATION_DATE}#1`);
  const listed = await persistence.listArchiveIndex('user_a', { limit: 10 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].publicationDate, PUBLICATION_DATE);
});

test('I4-B idempotenza: due richieste identiche → una pubblicazione', async () => {
  const persistence = new MemoryFocusPersistence();
  const input = {
    uid: 'user_b',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'worker_1',
  };
  const a = await publishFocusEdition(input);
  const b = await publishFocusEdition(input);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.idempotentReplay, true);
  assert.equal(a.revision, b.revision);
  const keys = [...persistence.revisions.keys()].filter((k) => k.includes('user_b'));
  assert.equal(keys.length, 1);
});

test('I4-B concorrenza: due publish paralleli → una sola revisione', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const [a, b] = await Promise.all([
    publishFocusEdition({
      uid: 'user_c_par',
      persistence,
      dossierInput,
      ownerId: 'w_a',
    }),
    publishFocusEdition({
      uid: 'user_c_par',
      persistence,
      dossierInput,
      ownerId: 'w_b',
    }),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  const fails = [a, b].filter((r) => !r.ok);
  assert.equal(oks.length, 1, `expected one success, got ${JSON.stringify([a, b])}`);
  assert.equal(fails.length, 1);
  assert.ok(
    fails[0].error === 'job_already_running'
      || fails[0].error === 'job_owner_mismatch'
      || fails[0].error === 'cannot_mark_running'
      || fails[0].error === 'job_owner_mismatch_on_publish',
    fails[0].error,
  );
  const keys = [...persistence.revisions.keys()].filter((k) => k.includes('user_c_par'));
  assert.equal(keys.length, 1);
});

test('I4-B concorrenza: secondo claim mentre running → reject', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const fp = 'manual';
  // claim manuale worker 1
  const c1 = await persistence.claimJob('user_c', PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: fp,
  });
  assert.equal(c1.ok, true);
  await persistence.updateJobIfOwner('user_c', PUBLICATION_DATE, 'w1', c1.job.leaseVersion, {
    status: FOCUS_JOB_STATUS.running,
  });
  const c2 = await persistence.claimJob('user_c', PUBLICATION_DATE, {
    ownerId: 'w2',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: fp,
  });
  assert.equal(c2.ok, false);
  assert.equal(c2.error, 'job_already_running');
});

test('I4-B job interrupted → ripresa stesso fingerprint pubblica una volta', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  // Prima run: claim + mark interrupted prima del publish completo
  const claim = await persistence.claimJob('user_d', PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: stableFingerprint({
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      analysisDayNode: dossierInput.analysisDayNode,
      publicationDayNode: dossierInput.publicationDayNode,
      targets: dossierInput.targets ?? null,
      bodyWeightKg: dossierInput.bodyWeightKg ?? null,
      explicitRegen: false,
    }),
  });
  await persistence.markJobInterrupted('user_d', PUBLICATION_DATE);
  assert.equal((await persistence.getJob('user_d', PUBLICATION_DATE)).status, 'interrupted');

  const result = await publishFocusEdition({
    uid: 'user_d',
    persistence,
    dossierInput,
    ownerId: 'w1',
    allowStealInterrupted: true,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revision, 1);
});

test('I4-B pubblicazione ok ma memory mancante → repair idempotente', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'user_e',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true);
  // simula crash post-publish: reset memory
  persistence.memoryByUid.set('user_e', createEmptyEditorialMemory());
  const repaired = await repairFocusMemoryAfterPublish({
    uid: 'user_e',
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
    uid: 'user_e',
    persistence,
    publicationDate: PUBLICATION_DATE,
  });
  assert.equal(again.alreadyApplied, true);
});

test('I4-B regen esplicita crea nuova revisione e conserva la vecchia', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const first = await publishFocusEdition({
    uid: 'user_f',
    persistence,
    dossierInput,
    ownerId: 'w1',
  });
  assert.equal(first.revision, 1);
  const second = await publishFocusEdition({
    uid: 'user_f',
    persistence,
    dossierInput,
    ownerId: 'w1',
    explicitRegen: true,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.revision, 2);
  const rev1 = await persistence.getRevision('user_f', PUBLICATION_DATE, 1);
  const rev2 = await persistence.getRevision('user_f', PUBLICATION_DATE, 2);
  assert.ok(rev1);
  assert.ok(rev2);
  assert.equal(rev1.revision, 1);
  assert.equal(rev2.revision, 2);
  const published = await persistence.getPublishedEdition('user_f', PUBLICATION_DATE);
  assert.equal(published.meta.currentRevision, 2);
});

test('I4-B tentativo overwrite revisione → errore', async () => {
  const persistence = new MemoryFocusPersistence();
  const first = await publishFocusEdition({
    uid: 'user_g',
    persistence,
    dossierInput: richDossierInput(),
    ownerId: 'w1',
  });
  const again = await persistence.saveRevisionImmutable(
    'user_g',
    PUBLICATION_DATE,
    first.revisionDoc,
  );
  assert.equal(again.ok, false);
  assert.equal(again.error, 'revision_already_exists');
});

test('I4-B owner mismatch al commit finale', async () => {
  const persistence = new MemoryFocusPersistence();
  const dossierInput = richDossierInput();
  const claim = await persistence.claimJob('user_h', PUBLICATION_DATE, {
    ownerId: 'w1',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'fp1',
  });
  // un altro worker non può publishare con lease sbagliato
  const published = await persistence.publishCurrentRevision('user_h', PUBLICATION_DATE, {
    ownerId: 'w2',
    leaseVersion: claim.job.leaseVersion,
    editionMeta: {
      schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
      kind: 'FocusEdition',
      publicationDate: PUBLICATION_DATE,
      analysisDate: ANALYSIS_DATE,
      currentRevision: 1,
      status: 'published',
      headline: 'x',
      teaser: 'y',
      publishedAt: new Date().toISOString(),
    },
    archiveEntry: {
      schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
      kind: 'FocusArchiveIndexEntry',
      publicationDate: PUBLICATION_DATE,
      analysisDate: ANALYSIS_DATE,
      revision: 1,
      status: 'published',
      headline: 'x',
      teaser: 'y',
      publishedAt: new Date().toISOString(),
    },
    publishedRevision: 1,
  });
  assert.equal(published.ok, false);
  assert.equal(published.error, 'job_owner_mismatch_on_publish');
});

test('I4-B dati insufficienti: edizione vuota ammessa, niente articoli inventati', async () => {
  const persistence = new MemoryFocusPersistence();
  const result = await publishFocusEdition({
    uid: 'user_i',
    persistence,
    dossierInput: buildMissingValuesFixture(),
    ownerId: 'w1',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.revisionDoc.lead, null);
  assert.equal(result.revisionDoc.goodNews.length, 0);
  assert.ok(result.revisionDoc.editorialNotes.includes('prose_source_fallback'));
  assert.ok(result.revisionDoc.editorialNotes.includes('no_unvalidated_ai_prose'));
  const v = validateFocusEditionRevision(result.revisionDoc);
  assert.equal(v.ok, true, v.errors.join(','));
});

test('I4-B metriche missing non possono avere value non-null in validazione', () => {
  const bad = {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusEditionRevision',
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    revision: 1,
    status: 'published',
    openingMode: 'neutral',
    lead: {
      id: 'news_x',
      role: 'lead',
      claimType: 'fact',
      headlineSeed: 'x',
      summarySeed: 'y',
      refs: ['sleep.deepMin'],
      metrics: [{ path: 'sleep.deepMin', value: 60, provenance: 'missing' }],
    },
    goodNews: [],
    features: [],
    concerns: [],
    coach: null,
    omitted: [],
    editorialNotes: [],
    immutable: true,
    technicalOnly: true,
    publishedAt: new Date().toISOString(),
  };
  const v = validateFocusEditionRevision(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('unreliable_metric')));
});

test('I4-B archive index ordinato e limitato', async () => {
  const persistence = new MemoryFocusPersistence();
  for (const date of ['2026-10-15', '2026-10-16', '2026-10-17']) {
    persistence.archiveIndex.set(`user_j::arch::${date}`, {
      schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
      kind: 'FocusArchiveIndexEntry',
      publicationDate: date,
      analysisDate: date,
      revision: 1,
      status: 'published',
      headline: date,
      teaser: 't',
      publishedAt: `${date}T08:00:00.000Z`,
    });
  }
  const page = await persistence.listArchiveIndex('user_j', { limit: 2 });
  assert.equal(page.length, 2);
  assert.equal(page[0].publicationDate, '2026-10-17');
  assert.equal(page[1].publicationDate, '2026-10-16');
});
