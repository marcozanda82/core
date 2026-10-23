/**
 * Sequenza autorizzata: acquire → publish(hold) → verify pointers → release.
 * P6.7.2m. Non collega recovery. Nessun unlock da timeout.
 */

import {
  PUBLISH_BARRIER_PUBLISHING,
  readPublishCoordination,
} from '../memory/publishBarrier.js';

/** Errori chiari pre-pointer: il tentativo può rilasciare la propria barriera. */
const PRE_POINTER_ERRORS = new Set([
  'barrier_hold_required',
  'barrier_not_held',
  'barrier_owner_mismatch',
  'barrier_epoch_mismatch',
  'job_missing',
  'job_owner_mismatch_on_publish',
  'revision_missing',
  'memory_event_missing',
  'publish_gate_aborted',
]);

/**
 * @param {{
 *   ownerId: string,
 *   leaseVersion: number,
 *   publicationDate: string,
 *   publishedRevision: number,
 * }} input
 */
export function buildPublishAttemptId(input) {
  const ownerId = String(input?.ownerId || '').trim() || 'unknown';
  const leaseVersion = Number(input?.leaseVersion) || 0;
  const publicationDate = String(input?.publicationDate || '').trim();
  const revision = Number(input?.publishedRevision) || 0;
  return `pub:${publicationDate}#${revision}:${ownerId}:lv${leaseVersion}`;
}

function isPrePointerFailure(result) {
  if (!result || result.ok) return false;
  if (result.partial) return false;
  const err = String(result.error || '');
  if (PRE_POINTER_ERRORS.has(err)) return true;
  if (err.startsWith('job_status_not_publishable')) return true;
  // errori di validazione meta/archive (stringa composta)
  if (err.includes('schemaVersion') || err.includes('FocusEdition')) return true;
  return false;
}

/**
 * Acquisisce o riprende hold se lo stesso attemptId detiene già la barriera.
 * @param {object} persistence
 * @param {string} uid
 * @param {{ attemptId: string, jobDate: string }} input
 */
export async function acquireOrResumePublishBarrier(persistence, uid, input) {
  const acq = await persistence.acquirePublishBarrier(uid, input);
  if (acq.ok) {
    return { ok: true, hold: acq.hold, memory: acq.memory, resumed: false };
  }
  if (acq.error !== 'barrier_busy') {
    return {
      ok: false,
      error: acq.error || 'barrier_acquire_failed',
      coordination: acq.coordination,
    };
  }

  const memory = await persistence.getEditorialMemory(uid);
  const coord = readPublishCoordination(memory);
  if (
    coord.publishBarrier !== PUBLISH_BARRIER_PUBLISHING
    || coord.publishBarrierAttemptId !== input.attemptId
  ) {
    return {
      ok: false,
      error: 'barrier_busy',
      coordination: coord,
    };
  }

  const hold = {
    attemptId: input.attemptId,
    jobDate: input.jobDate,
    publishGeneration: coord.publishGeneration,
    publishBarrierEpoch: coord.publishBarrierEpoch,
  };
  const held = await persistence.assertPublishBarrierHeld(uid, hold);
  if (!held.ok) {
    return {
      ok: false,
      error: held.error || 'barrier_busy',
      coordination: held.coordination || coord,
    };
  }
  return { ok: true, hold, memory, resumed: true };
}

/**
 * @param {{
 *   uid: string,
 *   persistence: object,
 *   publicationDate: string,
 *   ownerId: string,
 *   leaseVersion: number,
 *   editionMeta: object,
 *   archiveEntry: object,
 *   publishedRevision: number,
 *   attemptId?: string,
 * }} input
 */
export async function publishRevisionWithBarrier(input) {
  const {
    uid,
    persistence,
    publicationDate,
    ownerId,
    leaseVersion,
    editionMeta,
    archiveEntry,
    publishedRevision,
  } = input;

  const attemptId = input.attemptId || buildPublishAttemptId({
    ownerId,
    leaseVersion,
    publicationDate,
    publishedRevision,
  });

  const acq = await acquireOrResumePublishBarrier(persistence, uid, {
    attemptId,
    jobDate: publicationDate,
  });
  if (!acq.ok) {
    return {
      ok: false,
      phase: 'acquire',
      error: acq.error || 'barrier_acquire_failed',
      coordination: acq.coordination,
      hold: null,
      pointersUpdated: false,
    };
  }

  const hold = acq.hold;
  const published = await persistence.publishCurrentRevision(uid, publicationDate, {
    ownerId,
    leaseVersion,
    editionMeta,
    archiveEntry,
    publishedRevision,
    barrierHold: hold,
  });

  if (!published.ok) {
    if (isPrePointerFailure(published)) {
      const rel = await persistence.releasePublishBarrier(uid, hold).catch(() => ({
        ok: false,
        error: 'barrier_release_failed',
      }));
      return {
        ok: false,
        phase: 'publish',
        error: published.error || 'publish_failed',
        hold,
        pointersUpdated: false,
        barrierReleased: Boolean(rel?.ok),
        releaseError: rel?.ok ? null : (rel?.error || null),
        job: published.job ?? null,
      };
    }
    // esito incerto / parziale: non rilasciare
    return {
      ok: false,
      phase: 'publish',
      error: published.error || 'publish_failed',
      hold,
      pointersUpdated: Boolean(published.partial),
      barrierReleased: false,
      partial: Boolean(published.partial),
      job: published.job ?? null,
    };
  }

  const verified = await persistence.getPublishedEdition(uid, publicationDate);
  const currentRevision = Number(verified?.meta?.currentRevision);
  if (currentRevision !== Number(publishedRevision)) {
    return {
      ok: false,
      phase: 'verify',
      error: 'publish_pointers_unconfirmed',
      hold,
      pointersUpdated: false,
      barrierReleased: false,
      editionMeta: verified?.meta ?? null,
      job: published.job ?? null,
    };
  }

  const rel = await persistence.releasePublishBarrier(uid, hold);
  if (!rel.ok) {
    return {
      ok: false,
      phase: 'release',
      error: 'barrier_release_failed',
      hold,
      pointersUpdated: true,
      barrierReleased: false,
      releaseError: rel.error,
      editionMeta: published.editionMeta,
      job: published.job ?? null,
      coordination: rel.coordination,
    };
  }

  return {
    ok: true,
    phase: 'done',
    hold,
    pointersUpdated: true,
    barrierReleased: true,
    resumedBarrier: Boolean(acq.resumed),
    editionMeta: published.editionMeta,
    job: published.job ?? null,
  };
}
