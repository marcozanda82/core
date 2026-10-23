/**
 * Adapter in-memoria per test I4-B.
 * Serializza le mutazioni per chiave job (mutex) per modellare contention.
 * Non dichiara atomicità RTDB: documenta i punti che in produzione richiedono transaction.
 */

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  evaluateEditorialMemoryReplace,
} from '../memory/editorialMemoryCommit.js';
import {
  evaluateAcquirePublishBarrier,
  evaluateAssertPublishBarrierHeld,
  evaluateReleasePublishBarrier,
  preservePublishCoordination,
} from '../memory/publishBarrier.js';
import {
  validateFocusMemoryEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import {
  FOCUS_JOB_STATUS,
  createFocusGenerationJob,
} from '../contracts/focusPersistence.v1.js';
import { toRtdbJson } from '../sanitize/rtdbSanitize.js';
import {
  validateFocusArchiveIndexEntry,
  validateFocusEditionMeta,
  validateFocusEditionRevision,
  validateFocusGenerationJob,
} from '../validate/validateFocusEdition.js';
import { FOCUS_PERSISTENCE_ATOMICITY_NOTES } from './FocusPersistencePort.js';

export class MemoryFocusPersistence {
  constructor() {
    /** @type {Map<string, object>} */
    this.jobs = new Map();
    /** @type {Map<string, object>} */
    this.revisions = new Map();
    /** @type {Map<string, object>} */
    this.editionMeta = new Map();
    /** @type {Map<string, object>} */
    this.archiveIndex = new Map();
    /** @type {Map<string, object>} */
    this.memoryByUid = new Map();
    /** @type {Map<string, object>} */
    this.memoryEvents = new Map();
    /** @type {Map<string, Promise<void>>} */
    this.locks = new Map();
    this.atomicityNotes = FOCUS_PERSISTENCE_ATOMICITY_NOTES;
    /** Test hook: simula fallimento salvataggio memory_event una volta. */
    this._failMemoryEventOnce = false;
    /** Test hook: simula fallimento replace memoria una volta. */
    this._failMemoryReplaceOnce = false;
  }

  memoryLockKey(uid) {
    return `${uid}::editorial_memory`;
  }

  /** @param {string} key @param {() => Promise<T>} fn @returns {Promise<T>} */
  async withLock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const chained = prev.then(() => gate);
    this.locks.set(key, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }

  jobKey(uid, publicationDate) {
    return `${uid}::job::${publicationDate}`;
  }

  revKey(uid, publicationDate, revision) {
    return `${uid}::rev::${publicationDate}::${revision}`;
  }

  metaKey(uid, publicationDate) {
    return `${uid}::meta::${publicationDate}`;
  }

  archiveKey(uid, publicationDate) {
    return `${uid}::arch::${publicationDate}`;
  }

  memoryEventKey(uid, publicationDate, revision) {
    return `${uid}::memevt::${publicationDate}::${Number(revision)}`;
  }

  async getJob(uid, publicationDate) {
    const job = this.jobs.get(this.jobKey(uid, publicationDate));
    return job ? toRtdbJson(job) : null;
  }

  /**
   * Claim / verify job. Idempotent se stesso fingerprint già succeeded.
   */
  async claimJob(uid, publicationDate, claim) {
    return this.withLock(this.jobKey(uid, publicationDate), async () => {
      const key = this.jobKey(uid, publicationDate);
      const existing = this.jobs.get(key);

      if (existing?.status === FOCUS_JOB_STATUS.succeeded
        && existing.inputFingerprint === claim.inputFingerprint
        && !claim.explicitRegen) {
        return {
          ok: true,
          replay: true,
          job: toRtdbJson(existing),
        };
      }

      if (existing?.status === FOCUS_JOB_STATUS.running
        || existing?.status === FOCUS_JOB_STATUS.claimed
        || existing?.status === FOCUS_JOB_STATUS.committing) {
        if (existing.ownerId === claim.ownerId
          && existing.inputFingerprint === claim.inputFingerprint) {
          return { ok: true, job: toRtdbJson(existing), replay: false };
        }
        return { ok: false, error: 'job_already_running', job: toRtdbJson(existing) };
      }

      if (existing?.status === FOCUS_JOB_STATUS.interrupted && !claim.allowStealInterrupted) {
        // ripresa solo dallo stesso owner o con allowStealInterrupted
        if (existing.ownerId && existing.ownerId !== claim.ownerId) {
          return { ok: false, error: 'job_interrupted_other_owner', job: toRtdbJson(existing) };
        }
      }

      const leaseVersion = (existing?.leaseVersion || 0) + 1;
      const nextRevisionHint = claim.explicitRegen
        ? ((this.editionMeta.get(this.metaKey(uid, publicationDate))?.currentRevision || 0) + 1)
        : (this.editionMeta.get(this.metaKey(uid, publicationDate))?.currentRevision || 1);

      const job = createFocusGenerationJob({
        publicationDate,
        analysisDate: claim.analysisDate,
        status: FOCUS_JOB_STATUS.claimed,
        ownerId: claim.ownerId,
        leaseVersion,
        inputFingerprint: claim.inputFingerprint,
        explicitRegen: Boolean(claim.explicitRegen),
        targetRevision: claim.explicitRegen ? nextRevisionHint : (existing?.publishedRevision ? existing.publishedRevision : 1),
        createdAt: existing?.createdAt,
        publishedRevision: existing?.publishedRevision ?? null,
        memoryAppliedKey: existing?.memoryAppliedKey ?? null,
      });

      const v = validateFocusGenerationJob(job);
      if (!v.ok) return { ok: false, error: v.errors.join(',') };

      this.jobs.set(key, toRtdbJson(job));
      return { ok: true, job: toRtdbJson(job), replay: false };
    });
  }

  async updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, patch) {
    return this.withLock(this.jobKey(uid, publicationDate), async () => {
      const key = this.jobKey(uid, publicationDate);
      const existing = this.jobs.get(key);
      if (!existing) return { ok: false, error: 'job_missing' };
      if (existing.ownerId !== ownerId || existing.leaseVersion !== leaseVersion) {
        return { ok: false, error: 'job_owner_mismatch', job: toRtdbJson(existing) };
      }
      const next = toRtdbJson({
        ...existing,
        ...patch,
        ownerId: existing.ownerId,
        leaseVersion: existing.leaseVersion,
        updatedAt: new Date().toISOString(),
      });
      const v = validateFocusGenerationJob(next);
      if (!v.ok) return { ok: false, error: v.errors.join(',') };
      this.jobs.set(key, next);
      return { ok: true, job: next };
    });
  }

  async saveRevisionImmutable(uid, publicationDate, revisionDoc) {
    const revision = Number(revisionDoc?.revision);
    const key = this.revKey(uid, publicationDate, revision);
    if (this.revisions.has(key)) {
      return { ok: false, error: 'revision_already_exists' };
    }
    const v = validateFocusEditionRevision(revisionDoc);
    if (!v.ok) return { ok: false, error: v.errors.join(',') };
    this.revisions.set(key, toRtdbJson(revisionDoc));
    return { ok: true };
  }

  async getRevision(uid, publicationDate, revision) {
    const doc = this.revisions.get(this.revKey(uid, publicationDate, revision));
    return doc ? toRtdbJson(doc) : null;
  }

  /**
   * Create-only su (publicationDate, revision).
   * Stesso contentFingerprint → idempotente; contenuto diverso → conflitto.
   * @param {string} uid
   * @param {string} publicationDate
   * @param {object} memoryEvent
   */
  async saveMemoryEventImmutable(uid, publicationDate, memoryEvent) {
    if (this._failMemoryEventOnce) {
      this._failMemoryEventOnce = false;
      return { ok: false, error: 'memory_event_save_failed' };
    }
    const validation = validateFocusMemoryEvent(memoryEvent);
    if (!validation.ok) {
      return { ok: false, error: `memory_event_invalid:${validation.errors.join(',')}` };
    }
    if (memoryEvent.publicationDate !== publicationDate) {
      return { ok: false, error: 'memory_event_date_mismatch' };
    }
    const key = this.memoryEventKey(uid, publicationDate, memoryEvent.revision);
    const existing = this.memoryEvents.get(key);
    if (existing) {
      if (existing.contentFingerprint === memoryEvent.contentFingerprint) {
        return {
          ok: true,
          alreadyExists: true,
          memoryEvent: toRtdbJson(existing),
        };
      }
      return {
        ok: false,
        error: 'memory_event_conflict',
        memoryEvent: toRtdbJson(existing),
      };
    }
    const stored = toRtdbJson(memoryEvent);
    this.memoryEvents.set(key, stored);
    return { ok: true, alreadyExists: false, memoryEvent: stored };
  }

  async getMemoryEvent(uid, publicationDate, revision) {
    const doc = this.memoryEvents.get(
      this.memoryEventKey(uid, publicationDate, revision),
    );
    return doc ? toRtdbJson(doc) : null;
  }

  /**
   * Acquisisce barriera publishing + bump generation (TX su editorial_memory).
   * @param {string} uid
   * @param {{ attemptId: string, jobDate: string }} input
   */
  async acquirePublishBarrier(uid, input) {
    return this.withLock(this.memoryLockKey(uid), async () => {
      const current = this.memoryByUid.has(uid)
        ? toRtdbJson(this.memoryByUid.get(uid))
        : null;
      const decision = evaluateAcquirePublishBarrier(current, input);
      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error,
          coordination: decision.coordination,
        };
      }
      this.memoryByUid.set(uid, decision.memory);
      return { ok: true, hold: decision.hold, memory: decision.memory };
    });
  }

  /**
   * Rilascio condizionato: solo attemptId + epoch/generation corrispondenti.
   * @param {string} uid
   * @param {{ attemptId: string, publishGeneration: number, publishBarrierEpoch: number }} hold
   */
  async releasePublishBarrier(uid, hold) {
    return this.withLock(this.memoryLockKey(uid), async () => {
      const current = this.memoryByUid.has(uid)
        ? toRtdbJson(this.memoryByUid.get(uid))
        : null;
      const decision = evaluateReleasePublishBarrier(current, hold);
      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error,
          coordination: decision.coordination,
          memory: current,
        };
      }
      this.memoryByUid.set(uid, decision.memory);
      return { ok: true, memory: decision.memory, coordination: decision.coordination };
    });
  }

  /**
   * @param {string} uid
   * @param {{ attemptId: string, publishGeneration: number, publishBarrierEpoch: number }} hold
   */
  async assertPublishBarrierHeld(uid, hold) {
    return this.withLock(this.memoryLockKey(uid), async () => {
      const current = this.memoryByUid.has(uid)
        ? toRtdbJson(this.memoryByUid.get(uid))
        : null;
      const decision = evaluateAssertPublishBarrierHeld(current, hold);
      return {
        ok: decision.ok,
        error: decision.error,
        coordination: decision.coordination,
      };
    });
  }

  /**
   * Pubblica solo se owner/lease ancora validi, memory_event presente e barrierHold valido.
   * In RTDB: update atomico multi-path.
   */
  async publishCurrentRevision(uid, publicationDate, opts) {
    return this.withLock(this.jobKey(uid, publicationDate), async () => {
      const jobKey = this.jobKey(uid, publicationDate);
      const job = this.jobs.get(jobKey);
      if (!job) return { ok: false, error: 'job_missing' };
      if (job.ownerId !== opts.ownerId || job.leaseVersion !== opts.leaseVersion) {
        return { ok: false, error: 'job_owner_mismatch_on_publish' };
      }

      if (!opts?.barrierHold) {
        return { ok: false, error: 'barrier_hold_required', job: toRtdbJson(job) };
      }
      const mem = this.memoryByUid.has(uid)
        ? toRtdbJson(this.memoryByUid.get(uid))
        : null;
      const held = evaluateAssertPublishBarrierHeld(mem, opts.barrierHold);
      if (!held.ok) {
        return { ok: false, error: held.error || 'barrier_not_held', job: toRtdbJson(job) };
      }

      const rev = this.revisions.get(
        this.revKey(uid, publicationDate, opts.publishedRevision),
      );
      if (!rev) return { ok: false, error: 'revision_missing' };

      const memoryEvent = this.memoryEvents.get(
        this.memoryEventKey(uid, publicationDate, opts.publishedRevision),
      );
      if (!memoryEvent) {
        return { ok: false, error: 'memory_event_missing' };
      }

      const metaV = validateFocusEditionMeta(opts.editionMeta);
      if (!metaV.ok) return { ok: false, error: metaV.errors.join(',') };
      const archV = validateFocusArchiveIndexEntry(opts.archiveEntry);
      if (!archV.ok) return { ok: false, error: archV.errors.join(',') };

      // Conserva meta precedente in memoria storica interna (simulazione non-overwrite rev)
      this.editionMeta.set(this.metaKey(uid, publicationDate), toRtdbJson(opts.editionMeta));
      this.archiveIndex.set(this.archiveKey(uid, publicationDate), toRtdbJson(opts.archiveEntry));

      const nextJob = toRtdbJson({
        ...job,
        status: FOCUS_JOB_STATUS.succeeded,
        publishedRevision: opts.publishedRevision,
        updatedAt: new Date().toISOString(),
      });
      this.jobs.set(jobKey, nextJob);

      return {
        ok: true,
        editionMeta: toRtdbJson(opts.editionMeta),
        job: nextJob,
      };
    });
  }

  async getPublishedEdition(uid, publicationDate) {
    const meta = this.editionMeta.get(this.metaKey(uid, publicationDate)) || null;
    if (!meta) return { meta: null, revision: null };
    const revision = this.revisions.get(
      this.revKey(uid, publicationDate, meta.currentRevision),
    ) || null;
    return {
      meta: toRtdbJson(meta),
      revision: revision ? toRtdbJson(revision) : null,
    };
  }

  /**
   * Indice ordinato per chiave data ISO (lessicografico = cronologico).
   */
  async listArchiveIndex(uid, opts = {}) {
    const limit = Math.max(1, Math.min(365, Number(opts.limit) || 30));
    const prefix = `${uid}::arch::`;
    let dates = [...this.archiveIndex.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .sort(); // ascending ISO

    if (opts.startAt) dates = dates.filter((d) => d >= opts.startAt);
    if (opts.endAt) dates = dates.filter((d) => d <= opts.endAt);

    // tipicamente archivio inverso (più recenti prima)
    dates = dates.reverse().slice(0, limit);
    return dates.map((d) => toRtdbJson(this.archiveIndex.get(this.archiveKey(uid, d))));
  }

  async getEditorialMemory(uid) {
    const mem = this.memoryByUid.get(uid);
    return mem ? toRtdbJson(mem) : null;
  }

  async applyEditorialMemoryIfNeeded(uid, nextMemory, editionKey) {
    const current = this.memoryByUid.get(uid) || createEmptyEditorialMemory();
    if (current.lastAppliedEdition === editionKey) {
      return { ok: true, alreadyApplied: true, memory: toRtdbJson(current) };
    }
    if (nextMemory?.lastAppliedEdition !== editionKey) {
      return { ok: false, error: 'memory_edition_key_mismatch' };
    }
    const stored = preservePublishCoordination(toRtdbJson(nextMemory), current);
    this.memoryByUid.set(uid, stored);

    // marca sul job se presente
    const publicationDate = String(editionKey).split('#')[0];
    const job = this.jobs.get(this.jobKey(uid, publicationDate));
    if (job) {
      this.jobs.set(this.jobKey(uid, publicationDate), toRtdbJson({
        ...job,
        memoryAppliedKey: editionKey,
        updatedAt: new Date().toISOString(),
      }));
    }

    return { ok: true, alreadyApplied: false, memory: stored };
  }

  /**
   * Sostituisce editorial_memory solo se il cursore letto è ancora invariato.
   * Non usato dal publish in questa fase. Richiede authority authoritative_replay_v1.
   *
   * @param {string} uid
   * @param {{
   *   expected: { lastAppliedEdition?: string|null, stateFingerprint: string },
   *   nextMemory: object,
   *   authority: string,
   * }} input
   */
  async replaceEditorialMemoryIfUnchanged(uid, input) {
    return this.withLock(this.memoryLockKey(uid), async () => {
      if (this._failMemoryReplaceOnce) {
        this._failMemoryReplaceOnce = false;
        return {
          ok: false,
          committed: false,
          conflict: false,
          unchanged: false,
          error: 'memory_replace_transaction_failed',
          memory: this.memoryByUid.has(uid)
            ? toRtdbJson(this.memoryByUid.get(uid))
            : null,
        };
      }

      const current = this.memoryByUid.has(uid)
        ? toRtdbJson(this.memoryByUid.get(uid))
        : null;

      const decision = evaluateEditorialMemoryReplace({
        current,
        expected: input?.expected,
        nextMemory: input?.nextMemory,
        authority: input?.authority,
      });

      if (decision.action === 'reject') {
        return {
          ok: false,
          committed: false,
          conflict: false,
          unchanged: false,
          error: decision.error,
          memory: current,
          cursor: decision.cursor,
        };
      }
      if (decision.action === 'conflict') {
        return {
          ok: false,
          committed: false,
          conflict: true,
          unchanged: false,
          error: decision.error,
          memory: decision.memory,
          cursor: decision.cursor,
        };
      }
      if (decision.action === 'unchanged') {
        return {
          ok: true,
          committed: false,
          conflict: false,
          unchanged: true,
          memory: decision.memory,
          cursor: decision.cursor,
        };
      }

      this.memoryByUid.set(uid, decision.memory);
      return {
        ok: true,
        committed: true,
        conflict: false,
        unchanged: false,
        memory: decision.memory,
        cursor: decision.cursor,
      };
    });
  }

  /** Test helper: marca job interrupted senza pubblicare. */
  async markJobInterrupted(uid, publicationDate) {
    return this.withLock(this.jobKey(uid, publicationDate), async () => {
      const key = this.jobKey(uid, publicationDate);
      const job = this.jobs.get(key);
      if (!job) return { ok: false, error: 'job_missing' };
      const next = toRtdbJson({
        ...job,
        status: FOCUS_JOB_STATUS.interrupted,
        updatedAt: new Date().toISOString(),
      });
      this.jobs.set(key, next);
      return { ok: true, job: next };
    });
  }
}
