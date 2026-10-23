/**
 * Protocollo barriera atomica di pubblicazione (P6.7.2l).
 * Metadati co-locati su editorial_memory. Nessuna I/O.
 */

import { toRtdbJson } from '../sanitize/rtdbSanitize.js';

export const PUBLISH_BARRIER_STABLE = 'stable';
export const PUBLISH_BARRIER_PUBLISHING = 'publishing';

export const PUBLISH_COORDINATION_KEYS = Object.freeze([
  'publishGeneration',
  'publishBarrier',
  'publishBarrierEpoch',
  'publishBarrierAttemptId',
  'publishBarrierJobDate',
]);

/**
 * @param {unknown} memory
 */
export function readPublishCoordination(memory) {
  const m = memory && typeof memory === 'object' ? memory : null;
  const generation = Number(m?.publishGeneration);
  const epoch = Number(m?.publishBarrierEpoch);
  return {
    publishGeneration: Number.isFinite(generation) ? generation : 0,
    publishBarrier: m?.publishBarrier === PUBLISH_BARRIER_PUBLISHING
      ? PUBLISH_BARRIER_PUBLISHING
      : PUBLISH_BARRIER_STABLE,
    publishBarrierEpoch: Number.isFinite(epoch) ? epoch : 0,
    publishBarrierAttemptId: m?.publishBarrierAttemptId != null
      ? String(m.publishBarrierAttemptId)
      : null,
    publishBarrierJobDate: m?.publishBarrierJobDate != null
      ? String(m.publishBarrierJobDate)
      : null,
  };
}

/**
 * Copia i metadati di coordinamento da `from` a `target` (mutate copy).
 * @param {object} target
 * @param {object|null|undefined} from
 */
export function preservePublishCoordination(target, from) {
  const coord = readPublishCoordination(from);
  return toRtdbJson({
    ...target,
    publishGeneration: coord.publishGeneration,
    publishBarrier: coord.publishBarrier,
    publishBarrierEpoch: coord.publishBarrierEpoch,
    publishBarrierAttemptId: coord.publishBarrierAttemptId,
    publishBarrierJobDate: coord.publishBarrierJobDate,
  });
}

/**
 * @param {object|null|undefined} current
 * @param {{ attemptId: string, jobDate: string }} input
 */
export function evaluateAcquirePublishBarrier(current, input) {
  const attemptId = String(input?.attemptId || '').trim();
  const jobDate = String(input?.jobDate || '').trim();
  if (!attemptId) {
    return { ok: false, error: 'barrier_attempt_id_required' };
  }
  if (!jobDate) {
    return { ok: false, error: 'barrier_job_date_required' };
  }

  const coord = readPublishCoordination(current);
  if (coord.publishBarrier === PUBLISH_BARRIER_PUBLISHING) {
    return {
      ok: false,
      error: 'barrier_busy',
      coordination: coord,
    };
  }

  const nextGeneration = coord.publishGeneration + 1;
  const base = current && typeof current === 'object'
    ? toRtdbJson(current)
    : {};
  const nextMemory = toRtdbJson({
    ...base,
    publishGeneration: nextGeneration,
    publishBarrier: PUBLISH_BARRIER_PUBLISHING,
    publishBarrierEpoch: nextGeneration,
    publishBarrierAttemptId: attemptId,
    publishBarrierJobDate: jobDate,
  });

  return {
    ok: true,
    memory: nextMemory,
    hold: {
      attemptId,
      jobDate,
      publishGeneration: nextGeneration,
      publishBarrierEpoch: nextGeneration,
    },
  };
}

/**
 * @param {object|null|undefined} current
 * @param {{ attemptId: string, publishGeneration: number, publishBarrierEpoch: number }} hold
 */
export function evaluateReleasePublishBarrier(current, hold) {
  const coord = readPublishCoordination(current);
  const attemptId = String(hold?.attemptId || '').trim();
  const generation = Number(hold?.publishGeneration);
  const epoch = Number(hold?.publishBarrierEpoch);

  if (!attemptId) {
    return { ok: false, error: 'barrier_attempt_id_required', coordination: coord };
  }
  if (coord.publishBarrier !== PUBLISH_BARRIER_PUBLISHING) {
    return { ok: false, error: 'barrier_not_publishing', coordination: coord };
  }
  if (coord.publishBarrierAttemptId !== attemptId) {
    return { ok: false, error: 'barrier_owner_mismatch', coordination: coord };
  }
  if (coord.publishGeneration !== generation || coord.publishBarrierEpoch !== epoch) {
    return { ok: false, error: 'barrier_epoch_mismatch', coordination: coord };
  }

  const base = current && typeof current === 'object' ? toRtdbJson(current) : {};
  const nextMemory = toRtdbJson({
    ...base,
    publishGeneration: coord.publishGeneration,
    publishBarrier: PUBLISH_BARRIER_STABLE,
    publishBarrierEpoch: coord.publishBarrierEpoch,
    publishBarrierAttemptId: null,
    publishBarrierJobDate: null,
  });

  return { ok: true, memory: nextMemory, coordination: readPublishCoordination(nextMemory) };
}

/**
 * Verifica che il tentativo detenga ancora la barriera (fencing pre-pointer).
 * @param {object|null|undefined} current
 * @param {{ attemptId: string, publishGeneration: number, publishBarrierEpoch: number }} hold
 */
export function evaluateAssertPublishBarrierHeld(current, hold) {
  const coord = readPublishCoordination(current);
  const attemptId = String(hold?.attemptId || '').trim();
  const generation = Number(hold?.publishGeneration);
  const epoch = Number(hold?.publishBarrierEpoch);

  if (coord.publishBarrier !== PUBLISH_BARRIER_PUBLISHING) {
    return { ok: false, error: 'barrier_not_held', coordination: coord };
  }
  if (!attemptId || coord.publishBarrierAttemptId !== attemptId) {
    return { ok: false, error: 'barrier_owner_mismatch', coordination: coord };
  }
  if (coord.publishGeneration !== generation || coord.publishBarrierEpoch !== epoch) {
    return { ok: false, error: 'barrier_epoch_mismatch', coordination: coord };
  }
  return { ok: true, coordination: coord };
}
