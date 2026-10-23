/**
 * Adapter Firebase Admin RTDB — compatibile FocusPersistencePort.
 * Destinato agli emulatori in I4-C (FIREBASE_DATABASE_EMULATOR_HOST).
 *
 * Atomicità (vedi docs/i4cRtdbAssumptions.md):
 * - claimJob / updateJobIfOwner → transaction su jobs/{date}
 * - saveRevisionImmutable → transaction create-only su rev/{n}
 * - publishCurrentRevision → transaction gate `committing` + update() multi-path
 *   (meta + archive_index + job status/revision) in un unico commit atomico
 * - applyEditorialMemoryIfNeeded → transaction su editorial_memory
 */

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  validateFocusMemoryEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import {
  FOCUS_JOB_STATUS,
  createFocusGenerationJob,
} from '../contracts/focusPersistence.v1.js';
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
  focusArchiveIndexPath,
  focusArchiveIndexRootPath,
  focusEditionMemoryEventPath,
  focusEditionMetaPath,
  focusEditionRevisionPath,
  focusEditorialMemoryPath,
  focusJobPath,
} from '../paths/focusRtdbPaths.js';
import { toRtdbJson } from '../sanitize/rtdbSanitize.js';
import {
  validateFocusArchiveIndexEntry,
  validateFocusEditionMeta,
  validateFocusEditionRevision,
  validateFocusGenerationJob,
} from '../validate/validateFocusEdition.js';
import { FOCUS_PERSISTENCE_ATOMICITY_NOTES } from './FocusPersistencePort.js';

const ACTIVE_LEASE_STATUSES = new Set([
  FOCUS_JOB_STATUS.claimed,
  FOCUS_JOB_STATUS.running,
  FOCUS_JOB_STATUS.committing,
]);

function isLeaseExpired(job, nowMs) {
  if (!job?.leaseExpiresAt) return false;
  const t = Date.parse(job.leaseExpiresAt);
  return Number.isFinite(t) && t <= nowMs;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {{
 *   failArchiveOnce?: boolean,
 *   defaultLeaseMs?: number,
 * }} [testHooks]
 */
export class AdminRtdbFocusPersistence {
  constructor(db, testHooks = {}) {
    if (!db) throw new Error('AdminRtdbFocusPersistence: db richiesto');
    this.db = db;
    this.testHooks = testHooks;
    this.atomicityNotes = {
      ...FOCUS_PERSISTENCE_ATOMICITY_NOTES,
      claimJob: 'RTDB transaction on jobs/{publicationDate}',
      saveRevisionImmutable: 'RTDB transaction create-only on editions/.../rev/{n}',
      saveMemoryEventImmutable:
        'RTDB transaction create-only on editions/.../memory_events/{n}; same contentFingerprint → idempotent',
      publishCurrentRevision:
        'RTDB transaction → committing, then assert barrierHold, then atomic multi-path update(meta+archive+job)',
      applyEditorialMemoryIfNeeded:
        'RTDB transaction on editorial_memory keyed by lastAppliedEdition; preserves publishGeneration/barrier',
      replaceEditorialMemoryIfUnchanged:
        'RTDB transaction on editorial_memory; abort if publishing barrier or fingerprint/generation mismatch',
      acquirePublishBarrier:
        'RTDB transaction on editorial_memory: bump generation, set publishing + attemptId',
      releasePublishBarrier:
        'RTDB transaction on editorial_memory: release only if attemptId+epoch+generation match',
      leaseTtlInsufficient: true,
    };
    /** @type {boolean} */
    this._failArchiveOnce = Boolean(testHooks.failArchiveOnce);
    /** @type {boolean} */
    this._failMemoryReplaceOnce = Boolean(testHooks.failMemoryReplaceOnce);
  }

  ref(path) {
    return this.db.ref(path);
  }

  /**
   * Transaction RTDB (applyLocally=false).
   * Per update di nodi esistenti: passare `prime=true` così il primo pulse `null`
   * non abortisce — si usa il valore letto via get() e il server ritenta con i dati reali.
   *
   * @param {import('firebase-admin/database').Reference} reference
   * @param {(current: any) => any} updateFn
   * @param {{ prime?: boolean }} [opts]
   */
  async runTx(reference, updateFn, opts = {}) {
    let primed = null;
    if (opts.prime) {
      const snap = await reference.get();
      primed = snap.exists() ? snap.val() : null;
    }
    return reference.transaction((current) => {
      // Solo se il caller ha chiesto prime: coalesciamo null-pulse iniziale.
      const view = opts.prime ? (current ?? primed) : current;
      // Se stiamo aggiornando e non c'è nulla né in pulse né in prime → abort.
      // Se current è null ma primed c'è, updateFn riceve primed e ritorna un valore
      // → il protocollo ritenta con i dati server (vedi probe I4-C).
      return updateFn(view, current);
    }, undefined, false);
  }

  async getJob(uid, publicationDate) {
    const snap = await this.ref(focusJobPath(uid, publicationDate)).get();
    return snap.exists() ? toRtdbJson(snap.val()) : null;
  }

  async claimJob(uid, publicationDate, claim) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseMs = Number(this.testHooks.defaultLeaseMs) || 60_000;
    const path = focusJobPath(uid, publicationDate);
    const metaPath = focusEditionMetaPath(uid, publicationDate);

    const metaSnap = await this.ref(metaPath).get();
    const currentRevision = metaSnap.exists()
      ? Number(metaSnap.val()?.currentRevision) || 0
      : 0;

    let resultError = null;
    let replay = false;

    const tx = await this.runTx(this.ref(path), (existing) => {
      resultError = null;
      replay = false;

      if (existing?.status === FOCUS_JOB_STATUS.succeeded
        && existing.inputFingerprint === claim.inputFingerprint
        && !claim.explicitRegen) {
        replay = true;
        return existing;
      }

      const expired = isLeaseExpired(existing, nowMs);
      const active = existing && ACTIVE_LEASE_STATUSES.has(existing.status);

      if (active && !expired) {
        if (existing.ownerId === claim.ownerId
          && existing.inputFingerprint === claim.inputFingerprint) {
          return existing;
        }
        resultError = 'job_already_running';
        return;
      }

      if (existing?.status === FOCUS_JOB_STATUS.interrupted && !claim.allowStealInterrupted) {
        if (existing.ownerId && existing.ownerId !== claim.ownerId) {
          resultError = 'job_interrupted_other_owner';
          return;
        }
      }

      if (active && expired && claim.allowStealExpiredLease === false) {
        resultError = 'job_lease_expired_steal_denied';
        return;
      }

      const leaseVersion = (existing?.leaseVersion || 0) + 1;
      const targetRevision = claim.explicitRegen
        ? currentRevision + 1
        : (existing?.publishedRevision || currentRevision || 1);

      return createFocusGenerationJob({
        publicationDate,
        analysisDate: claim.analysisDate,
        status: FOCUS_JOB_STATUS.claimed,
        ownerId: claim.ownerId,
        leaseVersion,
        inputFingerprint: claim.inputFingerprint,
        explicitRegen: Boolean(claim.explicitRegen),
        targetRevision,
        createdAt: existing?.createdAt,
        publishedRevision: existing?.publishedRevision ?? null,
        memoryAppliedKey: existing?.memoryAppliedKey ?? null,
        leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
        updatedAt: nowIso,
      });
    });

    if (replay) {
      return { ok: true, replay: true, job: toRtdbJson(tx.snapshot.val()) };
    }
    if (!tx.committed) {
      const job = tx.snapshot.exists() ? toRtdbJson(tx.snapshot.val()) : null;
      return { ok: false, error: resultError || 'claim_aborted', job };
    }
    const job = toRtdbJson(tx.snapshot.val());
    const v = validateFocusGenerationJob(job);
    if (!v.ok) return { ok: false, error: v.errors.join(','), job };
    return { ok: true, replay: false, job };
  }

  async updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, patch) {
    const jobRef = this.ref(focusJobPath(uid, publicationDate));
    let err = null;
    const tx = await this.runTx(jobRef, (existing) => {
      err = null;
      if (!existing) {
        err = 'job_missing';
        return;
      }
      if (existing.ownerId !== ownerId || existing.leaseVersion !== leaseVersion) {
        err = 'job_owner_mismatch';
        return;
      }
      return toRtdbJson({
        ...existing,
        ...patch,
        ownerId: existing.ownerId,
        leaseVersion: existing.leaseVersion,
        updatedAt: new Date().toISOString(),
      });
    }, { prime: true });
    if (!tx.committed) {
      const job = tx.snapshot.exists() ? toRtdbJson(tx.snapshot.val()) : null;
      return { ok: false, error: err || 'update_aborted', job };
    }
    const job = toRtdbJson(tx.snapshot.val());
    const v = validateFocusGenerationJob(job);
    if (!v.ok) return { ok: false, error: v.errors.join(','), job };
    return { ok: true, job };
  }

  async saveRevisionImmutable(uid, publicationDate, revisionDoc) {
    const revision = Number(revisionDoc?.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      return { ok: false, error: 'revision_invalid' };
    }
    const v = validateFocusEditionRevision(revisionDoc);
    if (!v.ok) return { ok: false, error: v.errors.join(',') };

    const path = focusEditionRevisionPath(uid, publicationDate, revision);
    let existed = false;
    const tx = await this.runTx(this.ref(path), (current) => {
      if (current != null) {
        existed = true;
        return;
      }
      return toRtdbJson(revisionDoc);
    });
    if (existed || !tx.committed) {
      return { ok: false, error: 'revision_already_exists' };
    }
    return { ok: true };
  }

  async getRevision(uid, publicationDate, revision) {
    const snap = await this.ref(
      focusEditionRevisionPath(uid, publicationDate, revision),
    ).get();
    return snap.exists() ? toRtdbJson(snap.val()) : null;
  }

  /**
   * Create-only su memory_events/{revision}. Stesso fingerprint → idempotente.
   * @param {string} uid
   * @param {string} publicationDate
   * @param {object} memoryEvent
   */
  async saveMemoryEventImmutable(uid, publicationDate, memoryEvent) {
    const validation = validateFocusMemoryEvent(memoryEvent);
    if (!validation.ok) {
      return { ok: false, error: `memory_event_invalid:${validation.errors.join(',')}` };
    }
    if (memoryEvent.publicationDate !== publicationDate) {
      return { ok: false, error: 'memory_event_date_mismatch' };
    }
    const path = focusEditionMemoryEventPath(
      uid,
      publicationDate,
      memoryEvent.revision,
    );
    let conflict = false;
    let alreadyExists = false;
    let existingVal = null;
    const tx = await this.runTx(this.ref(path), (current) => {
      conflict = false;
      alreadyExists = false;
      existingVal = current;
      if (current != null) {
        if (current.contentFingerprint === memoryEvent.contentFingerprint) {
          alreadyExists = true;
          return current;
        }
        conflict = true;
        return;
      }
      return toRtdbJson(memoryEvent);
    });

    if (conflict) {
      return {
        ok: false,
        error: 'memory_event_conflict',
        memoryEvent: existingVal ? toRtdbJson(existingVal) : null,
      };
    }
    if (alreadyExists) {
      return {
        ok: true,
        alreadyExists: true,
        memoryEvent: toRtdbJson(tx.snapshot.val()),
      };
    }
    if (!tx.committed) {
      return { ok: false, error: 'memory_event_save_failed' };
    }
    return {
      ok: true,
      alreadyExists: false,
      memoryEvent: toRtdbJson(tx.snapshot.val()),
    };
  }

  async getMemoryEvent(uid, publicationDate, revision) {
    const snap = await this.ref(
      focusEditionMemoryEventPath(uid, publicationDate, revision),
    ).get();
    return snap.exists() ? toRtdbJson(snap.val()) : null;
  }

  async acquirePublishBarrier(uid, input) {
    let decision = null;
    const tx = await this.runTx(this.ref(focusEditorialMemoryPath(uid)), (current) => {
      decision = evaluateAcquirePublishBarrier(
        current == null ? null : current,
        input,
      );
      if (!decision.ok) return;
      return toRtdbJson(decision.memory);
    }, { prime: true });

    if (!decision?.ok) {
      return {
        ok: false,
        error: decision?.error || 'barrier_acquire_failed',
        coordination: decision?.coordination,
      };
    }
    if (!tx.committed) {
      return { ok: false, error: 'barrier_acquire_failed' };
    }
    return {
      ok: true,
      hold: decision.hold,
      memory: toRtdbJson(tx.snapshot.val()),
    };
  }

  async releasePublishBarrier(uid, hold) {
    let decision = null;
    const tx = await this.runTx(this.ref(focusEditorialMemoryPath(uid)), (current) => {
      decision = evaluateReleasePublishBarrier(
        current == null ? null : current,
        hold,
      );
      if (!decision.ok) return;
      return toRtdbJson(decision.memory);
    }, { prime: true });

    if (!decision?.ok) {
      return {
        ok: false,
        error: decision?.error || 'barrier_release_failed',
        coordination: decision?.coordination,
        memory: tx.snapshot?.exists?.() ? toRtdbJson(tx.snapshot.val()) : null,
      };
    }
    if (!tx.committed) {
      return { ok: false, error: 'barrier_release_failed' };
    }
    return {
      ok: true,
      memory: toRtdbJson(tx.snapshot.val()),
      coordination: decision.coordination,
    };
  }

  async assertPublishBarrierHeld(uid, hold) {
    const snap = await this.ref(focusEditorialMemoryPath(uid)).get();
    const current = snap.exists() ? toRtdbJson(snap.val()) : null;
    const decision = evaluateAssertPublishBarrierHeld(current, hold);
    return {
      ok: decision.ok,
      error: decision.error,
      coordination: decision.coordination,
    };
  }

  /**
   * Gate transaction su job → assert barrierHold → update() atomico meta+archive+job.
   * `barrierHold` obbligatorio (P6.7.2m).
   */
  async publishCurrentRevision(uid, publicationDate, opts) {
    if (!opts?.barrierHold) {
      return { ok: false, error: 'barrier_hold_required' };
    }

    const metaV = validateFocusEditionMeta(opts.editionMeta);
    if (!metaV.ok) return { ok: false, error: metaV.errors.join(',') };
    const archV = validateFocusArchiveIndexEntry(opts.archiveEntry);
    if (!archV.ok) return { ok: false, error: archV.errors.join(',') };

    const revSnap = await this.ref(
      focusEditionRevisionPath(uid, publicationDate, opts.publishedRevision),
    ).get();
    if (!revSnap.exists()) return { ok: false, error: 'revision_missing' };

    const held = await this.assertPublishBarrierHeld(uid, opts.barrierHold);
    if (!held.ok) {
      return { ok: false, error: held.error || 'barrier_not_held' };
    }

    let gateError = null;
    const jobPath = focusJobPath(uid, publicationDate);
    const jobRef = this.ref(jobPath);

    const gate = await this.runTx(jobRef, (job) => {
      gateError = null;
      if (!job) {
        gateError = 'job_missing';
        return;
      }
      if (job.ownerId !== opts.ownerId || job.leaseVersion !== opts.leaseVersion) {
        gateError = 'job_owner_mismatch_on_publish';
        return;
      }
      if (job.status === FOCUS_JOB_STATUS.succeeded
        && job.publishedRevision === opts.publishedRevision) {
        return job;
      }
      if (
        job.status !== FOCUS_JOB_STATUS.running
        && job.status !== FOCUS_JOB_STATUS.claimed
        && job.status !== FOCUS_JOB_STATUS.committing
        && job.status !== FOCUS_JOB_STATUS.interrupted
      ) {
        gateError = `job_status_not_publishable:${job.status}`;
        return;
      }
      return toRtdbJson({
        ...job,
        status: FOCUS_JOB_STATUS.committing,
        targetRevision: opts.publishedRevision,
        updatedAt: new Date().toISOString(),
      });
    }, { prime: true });

    if (!gate.committed) {
      return {
        ok: false,
        error: gateError || 'publish_gate_aborted',
        job: gate.snapshot.exists() ? toRtdbJson(gate.snapshot.val()) : null,
      };
    }

    // Fencing: ri-verifica barriera dopo gate job, prima dei pointer.
    // Solo il proprietario del hold può rilasciare → niente unlock concorrente esterno.
    const heldAfterGate = await this.assertPublishBarrierHeld(uid, opts.barrierHold);
    if (!heldAfterGate.ok) {
      return {
        ok: false,
        error: heldAfterGate.error || 'barrier_not_held',
        job: gate.snapshot.exists() ? toRtdbJson(gate.snapshot.val()) : null,
      };
    }

    const eventSnap = await this.ref(
      focusEditionMemoryEventPath(uid, publicationDate, opts.publishedRevision),
    ).get();
    if (!eventSnap.exists()) return { ok: false, error: 'memory_event_missing' };

    // Test hook: simula fallimento indice (non atomico rotto a posteriori)
    if (this._failArchiveOnce) {
      this._failArchiveOnce = false;
      // Solo meta+job, senza archive → viola intenzionalmente per test recovery
      await this.ref().update({
        [focusEditionMetaPath(uid, publicationDate)]: toRtdbJson(opts.editionMeta),
        [`${jobPath}/status`]: FOCUS_JOB_STATUS.succeeded,
        [`${jobPath}/publishedRevision`]: opts.publishedRevision,
        [`${jobPath}/updatedAt`]: new Date().toISOString(),
        [`${jobPath}/error`]: 'archive_update_failed_simulated',
      });
      return { ok: false, error: 'archive_update_failed', partial: true };
    }

    const nowIso = new Date().toISOString();
    // Unico update atomico: meta + archive + esito job
    await this.ref().update({
      [focusEditionMetaPath(uid, publicationDate)]: toRtdbJson(opts.editionMeta),
      [focusArchiveIndexPath(uid, publicationDate)]: toRtdbJson(opts.archiveEntry),
      [`${jobPath}/status`]: FOCUS_JOB_STATUS.succeeded,
      [`${jobPath}/publishedRevision`]: opts.publishedRevision,
      [`${jobPath}/error`]: null,
      [`${jobPath}/updatedAt`]: nowIso,
    });

    return {
      ok: true,
      editionMeta: toRtdbJson(opts.editionMeta),
      job: await this.getJob(uid, publicationDate),
    };
  }

  /**
   * Ripara meta+archive se job succeeded/committing ma puntatori incompleti.
   * Richiede barrierHold valido (nessuna scorciatoia sui pointer). Separato da recovery memoria.
   */
  async repairPublishPointers(uid, publicationDate, {
    editionMeta,
    archiveEntry,
    publishedRevision,
    barrierHold,
  }) {
    if (!barrierHold) {
      return { ok: false, error: 'barrier_hold_required' };
    }
    const held = await this.assertPublishBarrierHeld(uid, barrierHold);
    if (!held.ok) {
      return { ok: false, error: held.error || 'barrier_not_held' };
    }

    const job = await this.getJob(uid, publicationDate);
    if (!job) return { ok: false, error: 'job_missing' };
    if (
      job.status !== FOCUS_JOB_STATUS.succeeded
      && job.status !== FOCUS_JOB_STATUS.committing
    ) {
      return { ok: false, error: 'job_not_in_repairable_state' };
    }
    const rev = publishedRevision || job.publishedRevision || job.targetRevision;
    if (!rev) return { ok: false, error: 'revision_unknown' };
    const revDoc = await this.getRevision(uid, publicationDate, rev);
    if (!revDoc) return { ok: false, error: 'revision_missing' };

    const meta = editionMeta || {
      schemaVersion: revDoc.schemaVersion,
      kind: 'FocusEdition',
      publicationDate,
      analysisDate: revDoc.analysisDate,
      currentRevision: rev,
      status: revDoc.status,
      headline: revDoc.lead?.headlineSeed || 'Edizione Kentu Focus',
      teaser: revDoc.lead?.summarySeed || 'Edizione tecnica',
      publishedAt: revDoc.publishedAt,
      inputFingerprint: revDoc.inputFingerprint,
      dossierContentHash: revDoc.dossierContentHash,
    };
    const arch = archiveEntry || {
      schemaVersion: revDoc.schemaVersion,
      kind: 'FocusArchiveIndexEntry',
      publicationDate,
      analysisDate: revDoc.analysisDate,
      revision: rev,
      status: revDoc.status,
      headline: meta.headline,
      teaser: meta.teaser,
      publishedAt: meta.publishedAt,
    };

    const jobPath = focusJobPath(uid, publicationDate);
    await this.ref().update({
      [focusEditionMetaPath(uid, publicationDate)]: toRtdbJson(meta),
      [focusArchiveIndexPath(uid, publicationDate)]: toRtdbJson(arch),
      [`${jobPath}/status`]: FOCUS_JOB_STATUS.succeeded,
      [`${jobPath}/publishedRevision`]: rev,
      [`${jobPath}/error`]: null,
      [`${jobPath}/updatedAt`]: new Date().toISOString(),
    });
    return { ok: true, editionMeta: toRtdbJson(meta) };
  }

  async getPublishedEdition(uid, publicationDate) {
    const metaSnap = await this.ref(focusEditionMetaPath(uid, publicationDate)).get();
    if (!metaSnap.exists()) return { meta: null, revision: null };
    const meta = toRtdbJson(metaSnap.val());
    const revision = await this.getRevision(uid, publicationDate, meta.currentRevision);
    return { meta, revision };
  }

  async listArchiveIndex(uid, opts = {}) {
    const limit = Math.max(1, Math.min(365, Number(opts.limit) || 30));
    let q = this.ref(focusArchiveIndexRootPath(uid)).orderByKey();
    if (opts.startAt) q = q.startAt(opts.startAt);
    if (opts.endAt) q = q.endAt(opts.endAt);
    // Più recenti: limitToLast poi reverse in memoria
    const snap = await q.limitToLast(limit).get();
    if (!snap.exists()) return [];
    const rows = [];
    snap.forEach((child) => {
      rows.push(toRtdbJson(child.val()));
    });
    return rows.reverse();
  }

  async getEditorialMemory(uid) {
    const snap = await this.ref(focusEditorialMemoryPath(uid)).get();
    return snap.exists() ? toRtdbJson(snap.val()) : null;
  }

  async applyEditorialMemoryIfNeeded(uid, nextMemory, editionKey) {
    let alreadyApplied = false;
    let mismatch = false;
    const tx = await this.runTx(this.ref(focusEditorialMemoryPath(uid)), (current) => {
      alreadyApplied = false;
      mismatch = false;
      const cur = current || createEmptyEditorialMemory();
      if (cur.lastAppliedEdition === editionKey) {
        alreadyApplied = true;
        return cur;
      }
      if (nextMemory?.lastAppliedEdition !== editionKey) {
        mismatch = true;
        return;
      }
      return preservePublishCoordination(toRtdbJson(nextMemory), cur);
    }, { prime: true });

    if (mismatch || (!tx.committed && !alreadyApplied)) {
      return { ok: false, error: 'memory_edition_key_mismatch' };
    }
    const memory = toRtdbJson(tx.snapshot.val());

    const publicationDate = String(editionKey).split('#')[0];
    const jobPath = focusJobPath(uid, publicationDate);
    const jobSnap = await this.ref(jobPath).get();
    if (jobSnap.exists()) {
      await this.ref(jobPath).update({
        memoryAppliedKey: editionKey,
        updatedAt: new Date().toISOString(),
      });
    }

    return { ok: true, alreadyApplied, memory };
  }

  /**
   * Sostituisce editorial_memory solo se il cursore letto è ancora invariato.
   * Transazione RTDB atomica. Authority authoritative_replay_v1 obbligatoria.
   *
   * @param {string} uid
   * @param {{
   *   expected: { lastAppliedEdition?: string|null, stateFingerprint: string },
   *   nextMemory: object,
   *   authority: string,
   * }} input
   */
  async replaceEditorialMemoryIfUnchanged(uid, input) {
    if (this._failMemoryReplaceOnce) {
      this._failMemoryReplaceOnce = false;
      const snap = await this.ref(focusEditorialMemoryPath(uid)).get();
      return {
        ok: false,
        committed: false,
        conflict: false,
        unchanged: false,
        error: 'memory_replace_transaction_failed',
        memory: snap.exists() ? toRtdbJson(snap.val()) : null,
      };
    }

    let decision = null;
    const tx = await this.runTx(this.ref(focusEditorialMemoryPath(uid)), (current) => {
      decision = evaluateEditorialMemoryReplace({
        current: current == null ? null : current,
        expected: input?.expected,
        nextMemory: input?.nextMemory,
        authority: input?.authority,
      });
      if (decision.action === 'reject' || decision.action === 'conflict') {
        return;
      }
      if (decision.action === 'unchanged') {
        return current == null ? null : toRtdbJson(current);
      }
      return toRtdbJson(decision.memory);
    }, { prime: true });

    if (!decision) {
      return {
        ok: false,
        committed: false,
        conflict: false,
        unchanged: false,
        error: 'memory_replace_transaction_failed',
        memory: null,
      };
    }

    if (decision.action === 'reject') {
      return {
        ok: false,
        committed: false,
        conflict: false,
        unchanged: false,
        error: decision.error,
        memory: tx.snapshot?.exists?.() ? toRtdbJson(tx.snapshot.val()) : null,
        cursor: decision.cursor,
      };
    }

    if (decision.action === 'conflict' || !tx.committed) {
      const snapVal = tx.snapshot?.exists?.() ? toRtdbJson(tx.snapshot.val()) : null;
      return {
        ok: false,
        committed: false,
        conflict: true,
        unchanged: false,
        error: decision.action === 'conflict'
          ? decision.error
          : 'memory_conflict_state',
        memory: snapVal,
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

    return {
      ok: true,
      committed: true,
      conflict: false,
      unchanged: false,
      memory: toRtdbJson(tx.snapshot.val()),
      cursor: decision.cursor,
    };
  }

  async markJobInterrupted(uid, publicationDate) {
    const snap = await this.ref(focusJobPath(uid, publicationDate)).get();
    if (!snap.exists()) return { ok: false, error: 'job_missing' };
    await this.ref(focusJobPath(uid, publicationDate)).update({
      status: FOCUS_JOB_STATUS.interrupted,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, job: await this.getJob(uid, publicationDate) };
  }

  /** Test: forza scadenza lease immediata. */
  async expireLeaseNow(uid, publicationDate) {
    await this.ref(focusJobPath(uid, publicationDate)).update({
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}
