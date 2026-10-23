/**
 * P6.10a — Report operatore post-pubblicazione Focus.
 * Solo lettura dagli adapter admin. Nessuna scrittura / recovery / nuova publish.
 *
 * Distingue: dichiarato dal publish · verificato dallo store · non verificabile.
 * Nessun assente → stato positivo.
 */

import { buildFocusMemoryEditionKey } from '../contracts/focusMemoryEvent.v1.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  PUBLISH_BARRIER_STABLE,
  readPublishCoordination,
} from '../memory/publishBarrier.js';

export const FOCUS_ADMIN_PUBLISH_OPERATOR_REPORT_KIND = 'FocusAdminPublishOperatorReport';
export const FOCUS_ADMIN_PUBLISH_OPERATOR_REPORT_VERSION = '1.0.0';

const MEMORY_OK = new Set(['applied', 'unchanged']);

/**
 * @param {unknown} value
 * @returns {'applied'|'unchanged'|'pending'|null}
 */
function normalizeDeclaredMemoryStatus(value) {
  if (value === 'applied' || value === 'unchanged' || value === 'pending') {
    return value;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {'stable'|'publishing'|null}
 */
function normalizeDeclaredBarrier(value) {
  if (value === PUBLISH_BARRIER_STABLE || value === PUBLISH_BARRIER_PUBLISHING) {
    return value;
  }
  return null;
}

/**
 * @param {PromiseSettledResult<any>} settled
 * @param {string} label
 */
function readSettled(settled, label, issues) {
  if (settled.status === 'rejected') {
    issues.push(`store_read_failed:${label}`);
    return { ok: false, value: null, error: 'store_read_failed' };
  }
  return { ok: true, value: settled.value, error: null };
}

/**
 * Costruisce il report operatore. Read-only sullo store.
 *
 * @param {{
 *   uid: string,
 *   publicationDate: string,
 *   publishResult?: object|null,
 *   pipelineOk?: boolean|null,
 *   pipelineError?: string|null,
 *   persistence?: {
 *     getPublishedEdition?: Function,
 *     getJob?: Function,
 *     getEditorialMemory?: Function,
 *     getMemoryEvent?: Function,
 *     getRevision?: Function,
 *   }|null,
 * }} input
 */
export async function buildFocusAdminPublishOperatorReport(input = {}) {
  const warnings = [];
  const blockingIssues = [];
  const publicationDate = input.publicationDate != null
    ? String(input.publicationDate)
    : null;
  const uid = String(input.uid || '').trim();
  const publishResult = input.publishResult && typeof input.publishResult === 'object'
    ? input.publishResult
    : null;
  const persistence = input.persistence && typeof input.persistence === 'object'
    ? input.persistence
    : null;

  const declaredOk = publishResult ? Boolean(publishResult.ok) : null;
  const declaredError = publishResult?.error != null
    ? String(publishResult.error)
    : (input.pipelineError != null ? String(input.pipelineError) : null);
  const declaredRevision = Number.isFinite(Number(publishResult?.revision))
    ? Number(publishResult.revision)
    : null;
  const declaredMeta = publishResult?.editionMeta && typeof publishResult.editionMeta === 'object'
    ? publishResult.editionMeta
    : null;
  const declaredJob = publishResult?.job && typeof publishResult.job === 'object'
    ? publishResult.job
    : null;
  const declaredMemoryStatus = normalizeDeclaredMemoryStatus(publishResult?.memoryStatus);
  const declaredIdempotentReplay = publishResult
    ? Boolean(publishResult.idempotentReplay)
    : null;

  let declaredBarrier = null;
  if (publishResult?.barrierDiagnostic === 'publish_barrier_still_held') {
    declaredBarrier = PUBLISH_BARRIER_PUBLISHING;
  } else if (publishResult?.memory && typeof publishResult.memory === 'object') {
    declaredBarrier = readPublishCoordination(publishResult.memory).publishBarrier;
  }

  /** @type {{
   *   meta: object|null,
   *   revisionDoc: object|null,
   *   job: object|null,
   *   memory: object|null,
   *   memoryEvent: object|null,
   *   metaReadable: boolean,
   *   jobReadable: boolean,
   *   memoryReadable: boolean,
   *   memoryEventReadable: boolean,
   *   revisionReadable: boolean,
   * }} */
  const store = {
    meta: null,
    revisionDoc: null,
    job: null,
    memory: null,
    memoryEvent: null,
    metaReadable: false,
    jobReadable: false,
    memoryReadable: false,
    memoryEventReadable: false,
    revisionReadable: false,
  };

  if (!persistence) {
    blockingIssues.push('persistence_unavailable');
  } else if (!uid || !publicationDate) {
    blockingIssues.push('verification_context_incomplete');
  } else {
    const reads = await Promise.allSettled([
      typeof persistence.getPublishedEdition === 'function'
        ? persistence.getPublishedEdition(uid, publicationDate)
        : Promise.reject(new Error('getPublishedEdition_missing')),
      typeof persistence.getJob === 'function'
        ? persistence.getJob(uid, publicationDate)
        : Promise.reject(new Error('getJob_missing')),
      typeof persistence.getEditorialMemory === 'function'
        ? persistence.getEditorialMemory(uid)
        : Promise.reject(new Error('getEditorialMemory_missing')),
    ]);

    const editionRead = readSettled(reads[0], 'published_edition', blockingIssues);
    const jobRead = readSettled(reads[1], 'job', blockingIssues);
    const memoryRead = readSettled(reads[2], 'editorial_memory', blockingIssues);

    if (editionRead.ok) {
      store.metaReadable = true;
      store.meta = editionRead.value?.meta ?? null;
      store.revisionDoc = editionRead.value?.revision ?? null;
      store.revisionReadable = true;
    }
    if (jobRead.ok) {
      store.jobReadable = true;
      store.job = jobRead.value ?? null;
    }
    if (memoryRead.ok) {
      store.memoryReadable = true;
      store.memory = memoryRead.value ?? null;
    }

    const verifiedRevision = Number.isFinite(Number(store.meta?.currentRevision))
      ? Number(store.meta.currentRevision)
      : (Number.isFinite(Number(store.job?.publishedRevision))
        ? Number(store.job.publishedRevision)
        : declaredRevision);

    if (
      verifiedRevision != null
      && typeof persistence.getMemoryEvent === 'function'
    ) {
      try {
        store.memoryEvent = await persistence.getMemoryEvent(
          uid,
          publicationDate,
          verifiedRevision,
        );
        store.memoryEventReadable = true;
      } catch {
        blockingIssues.push('store_read_failed:memory_event');
        store.memoryEventReadable = false;
        store.memoryEvent = null;
      }
    } else if (verifiedRevision != null) {
      blockingIssues.push('store_read_failed:memory_event');
    }

    if (
      store.meta
      && Number.isFinite(Number(store.meta.currentRevision))
      && typeof persistence.getRevision === 'function'
      && !store.revisionDoc
    ) {
      try {
        store.revisionDoc = await persistence.getRevision(
          uid,
          publicationDate,
          Number(store.meta.currentRevision),
        );
        store.revisionReadable = true;
      } catch {
        blockingIssues.push('store_read_failed:revision');
        store.revisionReadable = false;
      }
    }
  }

  const verifiedCurrentRevision = store.metaReadable
    && store.meta
    && Number.isFinite(Number(store.meta.currentRevision))
    ? Number(store.meta.currentRevision)
    : null;
  const verifiedEditionStatus = store.metaReadable && store.meta?.status != null
    ? String(store.meta.status)
    : null;
  const verifiedJobPublishedRevision = store.jobReadable
    && store.job
    && Number.isFinite(Number(store.job.publishedRevision))
    ? Number(store.job.publishedRevision)
    : null;
  const verifiedJobStatus = store.jobReadable && store.job?.status != null
    ? String(store.job.status)
    : null;

  const pointerInconsistencies = [];
  if (
    verifiedCurrentRevision != null
    && verifiedJobPublishedRevision != null
    && verifiedCurrentRevision !== verifiedJobPublishedRevision
  ) {
    pointerInconsistencies.push('meta_currentRevision_ne_job_publishedRevision');
  }
  if (
    declaredRevision != null
    && verifiedCurrentRevision != null
    && declaredRevision !== verifiedCurrentRevision
  ) {
    pointerInconsistencies.push('declared_revision_ne_meta_currentRevision');
  }
  if (
    declaredRevision != null
    && verifiedJobPublishedRevision != null
    && declaredRevision !== verifiedJobPublishedRevision
  ) {
    pointerInconsistencies.push('declared_revision_ne_job_publishedRevision');
  }
  if (
    store.metaReadable
    && store.meta
    && verifiedCurrentRevision != null
    && store.revisionReadable
    && !store.revisionDoc
  ) {
    pointerInconsistencies.push('meta_points_to_missing_revision_doc');
  }
  if (pointerInconsistencies.length) {
    blockingIssues.push(...pointerInconsistencies.map((c) => `pointer:${c}`));
  }

  // --- memoryStatus: store inference (mai positivo da assente) ---
  let verifiedMemoryStatus = 'unverifiable';
  let memoryEditionKey = null;
  if (!store.memoryReadable) {
    verifiedMemoryStatus = 'unverifiable';
  } else if (verifiedCurrentRevision == null) {
    verifiedMemoryStatus = 'unverifiable';
  } else {
    memoryEditionKey = buildFocusMemoryEditionKey(publicationDate, verifiedCurrentRevision);
    const lastApplied = store.memory?.lastAppliedEdition != null
      ? String(store.memory.lastAppliedEdition)
      : null;
    if (lastApplied === memoryEditionKey) {
      verifiedMemoryStatus = 'applied';
    } else if (store.meta && verifiedEditionStatus) {
      // edizione presente ma memoria non punta alla rev corrente
      verifiedMemoryStatus = 'pending';
    } else if (declaredOk === true || verifiedJobStatus === 'succeeded') {
      verifiedMemoryStatus = 'pending';
    } else {
      // niente edizione pubblicata verificata → non inventare "applied"
      verifiedMemoryStatus = 'unverifiable';
    }
  }

  /** Stato operatore: store batte il dichiarato; unchanged solo se dichiarato + store match */
  let operatorMemoryStatus = 'unverifiable';
  if (verifiedMemoryStatus === 'pending') {
    operatorMemoryStatus = 'pending';
  } else if (verifiedMemoryStatus === 'applied') {
    operatorMemoryStatus = declaredMemoryStatus === 'unchanged' ? 'unchanged' : 'applied';
  } else if (verifiedMemoryStatus === 'unverifiable') {
    operatorMemoryStatus = 'unverifiable';
    if (declaredMemoryStatus != null) {
      warnings.push('memory_status_declared_but_store_unverifiable');
    }
  }

  // --- publishBarrier ---
  let verifiedBarrier = 'unverifiable';
  if (store.memoryReadable) {
    verifiedBarrier = readPublishCoordination(store.memory).publishBarrier;
  }

  // --- memory_event ---
  let verifiedMemoryEvent = 'unverifiable';
  const memoryEventRevision = verifiedCurrentRevision ?? declaredRevision;
  if (!store.memoryEventReadable || memoryEventRevision == null) {
    verifiedMemoryEvent = 'unverifiable';
  } else if (store.memoryEvent && typeof store.memoryEvent === 'object') {
    verifiedMemoryEvent = 'present';
  } else {
    verifiedMemoryEvent = 'absent';
  }

  const editionPublishedVerified = Boolean(
    store.metaReadable
    && store.meta
    && verifiedCurrentRevision != null
    && (
      verifiedEditionStatus === 'published'
      || verifiedEditionStatus === 'published_fallback'
      || verifiedJobStatus === 'succeeded'
    ),
  );

  if (editionPublishedVerified && operatorMemoryStatus === 'pending') {
    warnings.push('edition_published_memory_not_applied');
    blockingIssues.push('memory_pending_after_publish');
  }
  if (editionPublishedVerified && verifiedBarrier === PUBLISH_BARRIER_PUBLISHING) {
    warnings.push('edition_published_barrier_still_publishing');
    blockingIssues.push('publish_barrier_publishing');
  }
  if (editionPublishedVerified && verifiedMemoryEvent === 'absent') {
    warnings.push('memory_event_missing_for_current_revision');
    blockingIssues.push('memory_event_absent');
  }
  if (editionPublishedVerified && verifiedMemoryEvent === 'unverifiable') {
    blockingIssues.push('memory_event_unverifiable');
  }
  if (editionPublishedVerified && verifiedBarrier === 'unverifiable') {
    blockingIssues.push('publish_barrier_unverifiable');
  }
  if (editionPublishedVerified && operatorMemoryStatus === 'unverifiable') {
    blockingIssues.push('memory_status_unverifiable');
  }
  if (declaredOk === true && !store.metaReadable) {
    blockingIssues.push('published_claimed_but_meta_unreadable');
  }
  if (
    declaredMemoryStatus != null
    && verifiedMemoryStatus !== 'unverifiable'
    && (
      (MEMORY_OK.has(declaredMemoryStatus) && verifiedMemoryStatus === 'pending')
      || (declaredMemoryStatus === 'pending' && verifiedMemoryStatus === 'applied')
    )
  ) {
    warnings.push('memory_status_declared_store_mismatch');
    blockingIssues.push('memory_status_mismatch');
  }
  if (
    declaredBarrier != null
    && verifiedBarrier !== 'unverifiable'
    && declaredBarrier !== verifiedBarrier
  ) {
    warnings.push('publish_barrier_declared_store_mismatch');
  }

  const publishOutcome = (() => {
    if (declaredOk === true && editionPublishedVerified && pointerInconsistencies.length === 0) {
      return 'succeeded';
    }
    if (declaredOk === false || input.pipelineOk === false) {
      return 'failed';
    }
    if (declaredOk === true && !editionPublishedVerified) {
      return 'unverifiable';
    }
    if (editionPublishedVerified) {
      return 'succeeded';
    }
    return 'unverifiable';
  })();

  const essentialOk = (
    publishOutcome === 'succeeded'
    && MEMORY_OK.has(operatorMemoryStatus)
    && verifiedBarrier === PUBLISH_BARRIER_STABLE
    && verifiedMemoryEvent === 'present'
    && pointerInconsistencies.length === 0
    && !blockingIssues.some((i) => i.startsWith('store_read_failed:'))
  );

  const operatorSafe = essentialOk && blockingIssues.length === 0;

  if (declaredOk === true && !operatorSafe) {
    warnings.push('operator_must_not_treat_as_safe_success');
  }

  return {
    kind: FOCUS_ADMIN_PUBLISH_OPERATOR_REPORT_KIND,
    schemaVersion: FOCUS_ADMIN_PUBLISH_OPERATOR_REPORT_VERSION,
    operatorSafe,
    summary: {
      publishOutcome,
      publicationDate,
      requestedRevision: declaredRevision,
      currentRevision: verifiedCurrentRevision,
      editionStatus: verifiedEditionStatus,
      jobPublishedRevision: verifiedJobPublishedRevision,
      memoryStatus: operatorMemoryStatus,
      publishBarrier: verifiedBarrier === 'unverifiable'
        ? 'unverifiable'
        : verifiedBarrier,
      memoryEvent: verifiedMemoryEvent,
      idempotentReplay: declaredIdempotentReplay,
      warningCount: warnings.length,
      blockingIssueCount: blockingIssues.length,
    },
    warnings: [...new Set(warnings)],
    blockingIssues: [...new Set(blockingIssues)],
    publication: {
      declared: {
        ok: declaredOk,
        error: declaredError,
        revision: declaredRevision,
        editionStatus: declaredMeta?.status != null ? String(declaredMeta.status) : null,
        currentRevision: declaredMeta?.currentRevision != null
          && Number.isFinite(Number(declaredMeta.currentRevision))
          ? Number(declaredMeta.currentRevision)
          : null,
        jobPublishedRevision: declaredJob?.publishedRevision != null
          && Number.isFinite(Number(declaredJob.publishedRevision))
          ? Number(declaredJob.publishedRevision)
          : null,
        jobStatus: declaredJob?.status != null ? String(declaredJob.status) : null,
        idempotentReplay: declaredIdempotentReplay,
      },
      verified: store.metaReadable || store.jobReadable
        ? {
          editionStatus: verifiedEditionStatus,
          currentRevision: verifiedCurrentRevision,
          jobPublishedRevision: verifiedJobPublishedRevision,
          jobStatus: verifiedJobStatus,
          revisionDocPresent: Boolean(store.revisionDoc),
          metaReadable: store.metaReadable,
          jobReadable: store.jobReadable,
        }
        : null,
      verification: !store.metaReadable && !store.jobReadable
        ? 'unverifiable'
        : (pointerInconsistencies.length
          ? 'mismatch'
          : (declaredOk === true && editionPublishedVerified ? 'matched' : 'partial')),
    },
    memory: {
      declared: declaredMemoryStatus,
      verified: verifiedMemoryStatus,
      status: operatorMemoryStatus,
      editionKey: memoryEditionKey,
      lastAppliedEditionPresent: store.memoryReadable
        ? store.memory?.lastAppliedEdition != null
        : null,
      storeReadable: store.memoryReadable,
    },
    publishBarrier: {
      declared: normalizeDeclaredBarrier(declaredBarrier),
      verified: verifiedBarrier,
      status: verifiedBarrier,
      storeReadable: store.memoryReadable,
    },
    memoryEvent: {
      declared: null,
      verified: verifiedMemoryEvent,
      status: verifiedMemoryEvent,
      revisionChecked: memoryEventRevision,
      storeReadable: store.memoryEventReadable,
    },
    pointers: {
      inconsistencies: pointerInconsistencies,
      verification: pointerInconsistencies.length
        ? 'mismatch'
        : (store.metaReadable && store.jobReadable ? 'matched' : 'unverifiable'),
    },
  };
}

/**
 * Sottoinsieme sicuro per CLI (già senza PII / prose / credenziali).
 * @param {object|null|undefined} report
 */
export function sanitizeFocusAdminPublishOperatorReport(report) {
  if (!report || typeof report !== 'object') return null;
  if (report.kind !== FOCUS_ADMIN_PUBLISH_OPERATOR_REPORT_KIND) return null;
  return {
    kind: report.kind,
    schemaVersion: report.schemaVersion,
    operatorSafe: Boolean(report.operatorSafe),
    summary: report.summary && typeof report.summary === 'object'
      ? { ...report.summary }
      : null,
    warnings: Array.isArray(report.warnings)
      ? report.warnings.filter((w) => typeof w === 'string' && w.length < 120)
      : [],
    blockingIssues: Array.isArray(report.blockingIssues)
      ? report.blockingIssues.filter((w) => typeof w === 'string' && w.length < 120)
      : [],
    publication: report.publication ?? null,
    memory: report.memory ?? null,
    publishBarrier: report.publishBarrier ?? null,
    memoryEvent: report.memoryEvent ?? null,
    pointers: report.pointers ?? null,
  };
}
