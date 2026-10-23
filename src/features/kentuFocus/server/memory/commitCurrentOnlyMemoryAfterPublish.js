/**
 * Commit memoria current-only dopo promozione puntatori (P6.7.2n).
 * Usato dal percorso regen/sostitutivo — NON attiva recoverFocusEditorialMemory in pipeline.
 * Non sottrae manualmente #1: rebuild da eventi autorevoli + CAS replace.
 */

import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
} from './editorialMemoryCommit.js';
import {
  planEditorialMemoryReplay,
  rebuildEditorialMemoryFromEvents,
  resolveAuthoritativePublishedEditions,
} from './focusMemoryReplay.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  readPublishCoordination,
} from './publishBarrier.js';
import {
  fingerprintAuthoritativePublishPlan,
  loadAuthoritativePublishSnapshot,
  loadMemoryEventsForEditions,
} from './recoverFocusEditorialMemory.js';

/**
 * @param {{
 *   uid: string,
 *   persistence: object,
 *   updatedAt?: string,
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   memoryPersisted: boolean,
 *   memoryStatus: 'applied'|'pending'|'unchanged',
 *   memory: object|null,
 *   appliedEditionKeys?: string[]|null,
 *   planFingerprint?: string|null,
 *   error?: string|null,
 *   details?: object|null,
 * }>}
 */
export async function commitCurrentOnlyMemoryAfterPublish(input) {
  const uid = String(input?.uid || '').trim();
  const persistence = input?.persistence;
  if (!uid || !persistence) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: null,
      error: 'persistence_required',
    };
  }
  if (typeof persistence.replaceEditorialMemoryIfUnchanged !== 'function'
    || typeof persistence.getEditorialMemory !== 'function'
    || typeof persistence.getMemoryEvent !== 'function') {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: null,
      error: 'persistence_required',
    };
  }

  const memoryNow = await persistence.getEditorialMemory(uid);
  const coord = readPublishCoordination(memoryNow);
  if (coord.publishBarrier === PUBLISH_BARRIER_PUBLISHING) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: memoryNow,
      error: 'publication_in_progress',
      details: { coordination: coord },
    };
  }

  const snap = await loadAuthoritativePublishSnapshot(persistence, uid);
  if (!snap.ok) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: memoryNow,
      error: snap.error || 'publish_snapshot_load_failed',
    };
  }

  const published = resolveAuthoritativePublishedEditions({
    archiveEntries: snap.archiveEntries,
    metasByDate: snap.metasByDate,
    jobsByDate: snap.jobsByDate,
  });
  if (!published.ok) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: memoryNow,
      error: published.error || 'publish_plan_invalid',
      details: {
        conflicts: published.conflicts,
        errors: published.errors,
      },
    };
  }

  const memoryEventsByKey = await loadMemoryEventsForEditions(
    persistence,
    uid,
    published.editions,
  );

  const plan = planEditorialMemoryReplay({
    archiveEntries: snap.archiveEntries,
    metasByDate: snap.metasByDate,
    jobsByDate: snap.jobsByDate,
    memoryEventsByKey,
  });

  if (!plan.ok) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: memoryNow,
      error: plan.error || 'memory_rebuild_impossible',
      details: {
        missing: plan.missing,
        invalid: plan.invalid,
        conflicts: plan.conflicts,
        errors: plan.errors,
        note: 'no_partial_substitution',
      },
    };
  }

  const planFingerprint = fingerprintAuthoritativePublishPlan(plan.editions);
  const expected = buildEditorialMemoryCursor(memoryNow);

  const rebuilt = rebuildEditorialMemoryFromEvents(plan.events, {
    updatedAt: input?.updatedAt || new Date().toISOString(),
  });
  if (!rebuilt.ok) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: memoryNow,
      error: rebuilt.error || 'memory_rebuild_failed',
      details: rebuilt.details,
      planFingerprint,
    };
  }

  const replaced = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected,
    nextMemory: rebuilt.memory,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });

  if (!replaced.ok) {
    return {
      ok: false,
      memoryPersisted: false,
      memoryStatus: 'pending',
      memory: replaced.memory ?? memoryNow,
      error: replaced.error || 'memory_replace_failed',
      details: {
        conflict: Boolean(replaced.conflict),
        cursor: replaced.cursor ?? null,
      },
      planFingerprint,
      appliedEditionKeys: rebuilt.appliedEditionKeys,
    };
  }

  if (replaced.unchanged) {
    return {
      ok: true,
      memoryPersisted: true,
      memoryStatus: 'unchanged',
      memory: replaced.memory,
      appliedEditionKeys: rebuilt.appliedEditionKeys,
      planFingerprint,
      error: null,
    };
  }

  return {
    ok: true,
    memoryPersisted: true,
    memoryStatus: 'applied',
    memory: replaced.memory,
    appliedEditionKeys: rebuilt.appliedEditionKeys,
    planFingerprint,
    error: null,
  };
}

/**
 * True quando la revisione pubblicata sostituisce una precedente sulla stessa data.
 * @param {number} publishedRevision
 */
export function isSupersedingPublishedRevision(publishedRevision) {
  return Number(publishedRevision) > 1;
}
