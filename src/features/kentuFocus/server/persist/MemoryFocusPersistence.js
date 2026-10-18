/**
 * Adapter in-memoria per test I4-B.
 * Serializza le mutazioni per chiave job (mutex) per modellare contention.
 * Non dichiara atomicità RTDB: documenta i punti che in produzione richiedono transaction.
 */

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
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
    /** @type {Map<string, Promise<void>>} */
    this.locks = new Map();
    this.atomicityNotes = FOCUS_PERSISTENCE_ATOMICITY_NOTES;
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
   * Pubblica solo se owner/lease ancora validi.
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

      const rev = this.revisions.get(
        this.revKey(uid, publicationDate, opts.publishedRevision),
      );
      if (!rev) return { ok: false, error: 'revision_missing' };

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
    const stored = toRtdbJson(nextMemory);
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
