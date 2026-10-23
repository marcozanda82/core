/**
 * P6.10a — Report operatore pubblicazione Focus (offline, mock persistence).
 * Nessun Firebase reale, nessuna scrittura, nessun recovery.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFocusAdminPublishOperatorReport,
  sanitizeFocusAdminPublishOperatorReport,
} from '../admin/buildFocusAdminPublishOperatorReport.js';
import {
  assertFocusAdminRuntime,
  sanitizeFocusAdminCliResult,
} from '../admin/runFocusAdminEdition.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  PUBLISH_BARRIER_STABLE,
} from '../memory/publishBarrier.js';

const DATE = '2026-10-17';
const UID = 'pilot_op_01';

function meta(revision = 1, status = 'published') {
  return {
    kind: 'FocusEdition',
    publicationDate: DATE,
    analysisDate: '2026-10-16',
    currentRevision: revision,
    status,
  };
}

function job(revision = 1, status = 'succeeded') {
  return {
    status,
    publishedRevision: revision,
    targetRevision: revision,
  };
}

function memoryApplied(revision = 1, barrier = PUBLISH_BARRIER_STABLE) {
  return {
    lastAppliedEdition: `${DATE}#${revision}`,
    publishBarrier: barrier,
    publishGeneration: 1,
    publishBarrierEpoch: 1,
  };
}

function memoryEvent(revision = 1) {
  return {
    kind: 'FocusMemoryEvent',
    editionKey: `${DATE}#${revision}`,
    publicationDate: DATE,
    revision,
  };
}

/**
 * @param {{
 *   meta?: object|null,
 *   revision?: object|null,
 *   job?: object|null,
 *   memory?: object|null,
 *   memoryEvent?: object|null,
 *   fail?: Partial<Record<'edition'|'job'|'memory'|'memoryEvent'|'revision', boolean>>,
 * }} opts
 */
function createMockPersistence(opts = {}) {
  const fail = opts.fail || {};
  return {
    async getPublishedEdition() {
      if (fail.edition) throw new Error('edition_boom');
      return {
        meta: opts.meta === undefined ? meta() : opts.meta,
        revision: opts.revision === undefined ? { revision: 1 } : opts.revision,
      };
    },
    async getJob() {
      if (fail.job) throw new Error('job_boom');
      return opts.job === undefined ? job() : opts.job;
    },
    async getEditorialMemory() {
      if (fail.memory) throw new Error('memory_boom');
      return opts.memory === undefined ? memoryApplied() : opts.memory;
    },
    async getMemoryEvent(_uid, _date, rev) {
      if (fail.memoryEvent) throw new Error('mev_boom');
      if (opts.memoryEvent === undefined) return memoryEvent(rev);
      return opts.memoryEvent;
    },
    async getRevision() {
      if (fail.revision) throw new Error('rev_boom');
      return opts.revision === undefined ? { revision: 1 } : opts.revision;
    },
  };
}

function publishOk(overrides = {}) {
  return {
    ok: true,
    publicationDate: DATE,
    revision: 1,
    editionMeta: meta(),
    job: job(),
    memory: memoryApplied(),
    idempotentReplay: false,
    memoryStatus: 'applied',
    memoryPersisted: true,
    error: null,
    ...overrides,
  };
}

test('P6.10a successo completo → operatorSafe true', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk(),
    pipelineOk: true,
    persistence: createMockPersistence(),
  });

  assert.equal(report.operatorSafe, true);
  assert.equal(report.summary.publishOutcome, 'succeeded');
  assert.equal(report.summary.memoryStatus, 'applied');
  assert.equal(report.summary.publishBarrier, PUBLISH_BARRIER_STABLE);
  assert.equal(report.summary.memoryEvent, 'present');
  assert.equal(report.summary.currentRevision, 1);
  assert.equal(report.summary.jobPublishedRevision, 1);
  assert.equal(report.summary.editionStatus, 'published');
  assert.equal(report.summary.idempotentReplay, false);
  assert.equal(report.memory.declared, 'applied');
  assert.equal(report.memory.verified, 'applied');
  assert.equal(report.publishBarrier.verified, PUBLISH_BARRIER_STABLE);
  assert.equal(report.memoryEvent.verified, 'present');
  assert.equal(report.pointers.verification, 'matched');
  assert.equal(report.blockingIssues.length, 0);
  assert.ok(!report.warnings.includes('edition_published_memory_not_applied'));
});

test('P6.10a pubblicazione ok + memoria pending → non sicuro + avviso esplicito', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk({
      memoryStatus: 'pending',
      memoryPersisted: false,
      error: 'memory_apply_failed',
      memory: {
        lastAppliedEdition: null,
        publishBarrier: PUBLISH_BARRIER_STABLE,
      },
    }),
    pipelineOk: true,
    persistence: createMockPersistence({
      memory: {
        lastAppliedEdition: '2026-10-10#1',
        publishBarrier: PUBLISH_BARRIER_STABLE,
      },
    }),
  });

  assert.equal(report.operatorSafe, false);
  assert.equal(report.summary.publishOutcome, 'succeeded');
  assert.equal(report.summary.memoryStatus, 'pending');
  assert.equal(report.memory.declared, 'pending');
  assert.equal(report.memory.verified, 'pending');
  assert.ok(report.warnings.includes('edition_published_memory_not_applied'));
  assert.ok(report.blockingIssues.includes('memory_pending_after_publish'));
});

test('P6.10a barriera publishing → non sicuro', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk({
      barrierDiagnostic: 'publish_barrier_still_held',
      memory: memoryApplied(1, PUBLISH_BARRIER_PUBLISHING),
    }),
    pipelineOk: true,
    persistence: createMockPersistence({
      memory: memoryApplied(1, PUBLISH_BARRIER_PUBLISHING),
    }),
  });

  assert.equal(report.operatorSafe, false);
  assert.equal(report.summary.publishBarrier, PUBLISH_BARRIER_PUBLISHING);
  assert.equal(report.publishBarrier.declared, PUBLISH_BARRIER_PUBLISHING);
  assert.equal(report.publishBarrier.verified, PUBLISH_BARRIER_PUBLISHING);
  assert.ok(report.warnings.includes('edition_published_barrier_still_publishing'));
  assert.ok(report.blockingIssues.includes('publish_barrier_publishing'));
});

test('P6.10a memory_event mancante → non sicuro', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk(),
    pipelineOk: true,
    persistence: createMockPersistence({ memoryEvent: null }),
  });

  assert.equal(report.operatorSafe, false);
  assert.equal(report.summary.memoryEvent, 'absent');
  assert.equal(report.memoryEvent.verified, 'absent');
  assert.ok(report.warnings.includes('memory_event_missing_for_current_revision'));
  assert.ok(report.blockingIssues.includes('memory_event_absent'));
});

test('P6.10a puntatori discordanti → mismatch + non sicuro', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk({
      revision: 2,
      editionMeta: meta(2),
      job: job(2),
    }),
    pipelineOk: true,
    persistence: createMockPersistence({
      meta: meta(2),
      job: job(1),
      memory: memoryApplied(2),
      memoryEvent: memoryEvent(2),
      revision: { revision: 2 },
    }),
  });

  assert.equal(report.operatorSafe, false);
  assert.ok(
    report.pointers.inconsistencies.includes('meta_currentRevision_ne_job_publishedRevision'),
  );
  assert.equal(report.pointers.verification, 'mismatch');
  assert.ok(
    report.blockingIssues.some((i) => i.includes('meta_currentRevision_ne_job_publishedRevision')),
  );
});

test('P6.10a stato non leggibile → unverifiable, mai stato positivo inventato', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk({ memoryStatus: 'applied' }),
    pipelineOk: true,
    persistence: createMockPersistence({
      fail: { edition: true, job: true, memory: true, memoryEvent: true },
    }),
  });

  assert.equal(report.operatorSafe, false);
  assert.equal(report.summary.publishOutcome, 'unverifiable');
  assert.equal(report.summary.memoryStatus, 'unverifiable');
  assert.equal(report.summary.publishBarrier, 'unverifiable');
  assert.equal(report.summary.memoryEvent, 'unverifiable');
  assert.equal(report.memory.declared, 'applied');
  assert.equal(report.memory.verified, 'unverifiable');
  assert.ok(report.warnings.includes('memory_status_declared_but_store_unverifiable'));
  assert.ok(report.blockingIssues.some((i) => i.startsWith('store_read_failed:')));
  assert.ok(!MEMORY_OK_FALSE_POSITIVE(report));
});

function MEMORY_OK_FALSE_POSITIVE(report) {
  return report.operatorSafe === true
    || report.summary.memoryStatus === 'applied'
    || report.summary.publishBarrier === PUBLISH_BARRIER_STABLE;
}

test('P6.10a replay idempotente + store coerente → operatorSafe true', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk({
      idempotentReplay: true,
      memoryStatus: 'unchanged',
    }),
    pipelineOk: true,
    persistence: createMockPersistence(),
  });

  assert.equal(report.operatorSafe, true);
  assert.equal(report.summary.idempotentReplay, true);
  assert.equal(report.summary.memoryStatus, 'unchanged');
  assert.equal(report.memory.declared, 'unchanged');
  assert.equal(report.memory.verified, 'applied');
  assert.equal(report.publication.declared.idempotentReplay, true);
});

test('P6.10a senza persistence → non verificabile / non sicuro', async () => {
  const report = await buildFocusAdminPublishOperatorReport({
    uid: UID,
    publicationDate: DATE,
    publishResult: publishOk(),
    pipelineOk: true,
    persistence: null,
  });

  assert.equal(report.operatorSafe, false);
  assert.ok(report.blockingIssues.includes('persistence_unavailable'));
  assert.equal(report.summary.memoryStatus, 'unverifiable');
  assert.equal(report.summary.publishBarrier, 'unverifiable');
});

test('P6.10a sanitize: niente headline / teaser / UID / prose', () => {
  const raw = {
    kind: 'FocusAdminPublishOperatorReport',
    schemaVersion: '1.0.0',
    operatorSafe: false,
    summary: {
      publishOutcome: 'succeeded',
      publicationDate: DATE,
      memoryStatus: 'pending',
      publishBarrier: PUBLISH_BARRIER_STABLE,
      memoryEvent: 'present',
      warningCount: 1,
      blockingIssueCount: 1,
    },
    warnings: ['edition_published_memory_not_applied'],
    blockingIssues: ['memory_pending_after_publish'],
    publication: { declared: { ok: true }, verified: null, verification: 'partial' },
    memory: { declared: 'pending', verified: 'pending', status: 'pending' },
    publishBarrier: { status: PUBLISH_BARRIER_STABLE },
    memoryEvent: { status: 'present' },
    pointers: { inconsistencies: [], verification: 'matched' },
    // campi che non devono filtrare nel sanitize se presenti per errore
    headline: 'SEGRETO PERSONALE',
    teaser: 'nota privata',
  };

  const safe = sanitizeFocusAdminPublishOperatorReport(raw);
  const blob = JSON.stringify(safe);
  assert.ok(!blob.includes('SEGRETO'));
  assert.ok(!blob.includes('nota privata'));
  assert.equal(safe.operatorSafe, false);
  assert.ok(safe.warnings.includes('edition_published_memory_not_applied'));

  const cli = sanitizeFocusAdminCliResult({
    ok: true,
    operatorSafe: false,
    operatorReport: raw,
    publicationDate: DATE,
    analysisDate: '2026-10-16',
    revision: 1,
    idempotentReplay: false,
    editionSummary: {
      headline: 'Headline sensibile',
      teaser: 'Teaser privato',
      currentRevision: 1,
      status: 'published',
    },
  }, { uid: 'abcdefghijklmnop', projectId: 'demo-kentu-focus' });

  assert.equal(cli.operatorSafe, false);
  assert.ok(cli.operatorReport);
  assert.equal(cli.operatorReport.summary.memoryStatus, 'pending');
  const cliBlob = JSON.stringify(cli);
  assert.ok(!cliBlob.includes('Headline sensibile'));
  assert.ok(!cliBlob.includes('abcdefghijklmnop'));
});

test('P6.10a runtime produzione resta bloccato (assertFocusAdminRuntime invariato)', () => {
  const had = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    assert.equal(assertFocusAdminRuntime().error, 'emulator_required');

    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';
    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');
  } finally {
    if (had == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
  }
});
