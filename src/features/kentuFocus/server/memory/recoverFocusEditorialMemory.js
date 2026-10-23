/**
 * Orchestratore di recovery memoria editoriale (P6.7.2j) — solo offline.
 * Integra piano P6.7.2h + replace atomico P6.7.2i.
 * NON collegato a publish/pipeline. NON usa repairFocusMemoryAfterPublish.
 *
 * Garanzia effettiva: re-validazione dei pointer pubblicati DOPO il rebuild e
 * PRIMA del replace (fingerprint piano + contentFingerprint eventi).
 *
 * Impedimento attivazione produzione: archive/meta/job + editorial_memory non
 * condividono una transazione unica; resta una finestra TOCTOU fra la
 * re-validazione e `replaceEditorialMemoryIfUnchanged`. Il solo fingerprint
 * della memoria non copre cambi di revisione pubblicata.
 */

import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
  canonicalizeJsonValue,
  fingerprintEditorialMemoryPayload,
} from './editorialMemoryCommit.js';
import {
  planEditorialMemoryReplay,
  rebuildEditorialMemoryFromEvents,
  resolveAuthoritativePublishedEditions,
} from './focusMemoryReplay.js';
import { stableFingerprint } from '../sanitize/rtdbSanitize.js';

/** @typedef {'applied'|'pending'|'unrecoverable'} FocusMemoryStatus */
/** @typedef {'already_aligned'|'recovered'|'pending_recoverable'|'unrecoverable'|'conflict'|'persistence_error'|'plan_stale'} FocusMemoryRecoveryStatus */

/**
 * Fingerprint del piano pubblicato autorevole (solo date+revisioni correnti).
 * @param {Array<{ publicationDate: string, revision: number }>} editions
 */
export function fingerprintAuthoritativePublishPlan(editions) {
  const rows = (Array.isArray(editions) ? editions : []).map((e) => ({
    publicationDate: e.publicationDate,
    revision: Number(e.revision),
  }));
  return stableFingerprint(canonicalizeJsonValue(rows));
}

/**
 * Carica archive + meta + job per tutte le date archiviate.
 * @param {object} persistence
 * @param {string} uid
 */
export async function loadAuthoritativePublishSnapshot(persistence, uid) {
  if (!persistence || typeof persistence.listArchiveIndex !== 'function') {
    return { ok: false, error: 'persistence_required' };
  }
  const archiveEntries = await persistence.listArchiveIndex(uid, { limit: 365 });
  const metasByDate = {};
  const jobsByDate = {};
  for (const entry of archiveEntries || []) {
    const publicationDate = entry?.publicationDate;
    if (!publicationDate) continue;
    const published = typeof persistence.getPublishedEdition === 'function'
      ? await persistence.getPublishedEdition(uid, publicationDate)
      : { meta: null };
    metasByDate[publicationDate] = published?.meta ?? null;
    jobsByDate[publicationDate] = typeof persistence.getJob === 'function'
      ? await persistence.getJob(uid, publicationDate)
      : null;
  }
  return {
    ok: true,
    archiveEntries: archiveEntries || [],
    metasByDate,
    jobsByDate,
  };
}

/**
 * @param {object} persistence
 * @param {string} uid
 * @param {Array<{ publicationDate: string, revision: number, editionKey: string }>} editions
 */
export async function loadMemoryEventsForEditions(persistence, uid, editions) {
  /** @type {Record<string, object>} */
  const memoryEventsByKey = {};
  for (const edition of editions || []) {
    const evt = await persistence.getMemoryEvent(
      uid,
      edition.publicationDate,
      edition.revision,
    );
    if (evt) {
      memoryEventsByKey[edition.editionKey] = evt;
    }
  }
  return memoryEventsByKey;
}

/**
 * @param {{
 *   ok: boolean,
 *   editionPublished: boolean,
 *   memoryStatus: FocusMemoryStatus,
 *   recoveryStatus: FocusMemoryRecoveryStatus,
 *   memory?: object|null,
 *   memoryPersisted?: boolean,
 *   editions?: object[]|null,
 *   appliedEditionKeys?: string[]|null,
 *   planFingerprint?: string|null,
 *   liveSemanticsNote?: string|null,
 *   error?: string|null,
 *   details?: object,
 * }} partial
 */
function result(partial) {
  return {
    ok: Boolean(partial.ok),
    editionPublished: Boolean(partial.editionPublished),
    memoryStatus: partial.memoryStatus,
    recoveryStatus: partial.recoveryStatus,
    memory: partial.memory ?? null,
    memoryPersisted: Boolean(partial.memoryPersisted),
    editions: partial.editions ?? null,
    appliedEditionKeys: partial.appliedEditionKeys ?? null,
    planFingerprint: partial.planFingerprint ?? null,
    liveSemanticsNote: partial.liveSemanticsNote
      ?? 'recovery_uses_current_revision_only; live_superseding_regen_commits_current_only_via_P672n',
    error: partial.error ?? null,
    details: partial.details ?? null,
  };
}

/**
 * Recovery esplicito offline.
 *
 * @param {{
 *   uid: string,
 *   persistence: object,
 *   updatedAt?: string,
 *   commit?: boolean,
 *   hooks?: { afterRebuild?: Function },
 * }} input
 * `commit` default true; se false diagnostica senza replace.
 */
export async function recoverFocusEditorialMemory(input) {
  const shouldCommit = input?.commit !== false;
  const uid = String(input?.uid || '').trim();
  const persistence = input?.persistence;
  if (!uid) {
    return result({
      ok: false,
      editionPublished: false,
      memoryStatus: 'unrecoverable',
      recoveryStatus: 'persistence_error',
      error: 'uid_required',
    });
  }
  if (!persistence
    || typeof persistence.replaceEditorialMemoryIfUnchanged !== 'function'
    || typeof persistence.getEditorialMemory !== 'function'
    || typeof persistence.getMemoryEvent !== 'function') {
    return result({
      ok: false,
      editionPublished: false,
      memoryStatus: 'unrecoverable',
      recoveryStatus: 'persistence_error',
      error: 'persistence_required',
    });
  }

  const snap1 = await loadAuthoritativePublishSnapshot(persistence, uid);
  if (!snap1.ok) {
    return result({
      ok: false,
      editionPublished: false,
      memoryStatus: 'unrecoverable',
      recoveryStatus: 'persistence_error',
      error: snap1.error,
    });
  }

  const editionPublished = (snap1.archiveEntries || []).length > 0;

  const published = resolveAuthoritativePublishedEditions({
    archiveEntries: snap1.archiveEntries,
    metasByDate: snap1.metasByDate,
    jobsByDate: snap1.jobsByDate,
  });
  if (!published.ok) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: 'unrecoverable',
      recoveryStatus: 'unrecoverable',
      error: published.error,
      details: {
        conflicts: published.conflicts,
        errors: published.errors,
      },
    });
  }

  const memoryEventsByKey = await loadMemoryEventsForEditions(
    persistence,
    uid,
    published.editions,
  );

  const plan = planEditorialMemoryReplay({
    archiveEntries: snap1.archiveEntries,
    metasByDate: snap1.metasByDate,
    jobsByDate: snap1.jobsByDate,
    memoryEventsByKey,
  });

  if (!plan.ok) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: 'unrecoverable',
      recoveryStatus: 'unrecoverable',
      error: plan.error,
      editions: plan.editions || published.editions,
      details: {
        missing: plan.missing,
        invalid: plan.invalid,
        conflicts: plan.conflicts,
        errors: plan.errors,
      },
    });
  }

  const planFingerprint = fingerprintAuthoritativePublishPlan(plan.editions);

  const memoryBefore = await persistence.getEditorialMemory(uid);
  const expectedCursor = buildEditorialMemoryCursor(memoryBefore);

  const rebuilt = rebuildEditorialMemoryFromEvents(plan.events, {
    updatedAt: input?.updatedAt || new Date().toISOString(),
  });
  if (!rebuilt.ok) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: editionPublished ? 'pending' : 'unrecoverable',
      recoveryStatus: 'unrecoverable',
      error: rebuilt.error,
      editions: plan.editions,
      planFingerprint,
      details: rebuilt.details,
      memory: memoryBefore,
      memoryPersisted: false,
    });
  }

  const beforePayload = fingerprintEditorialMemoryPayload(memoryBefore);
  const nextPayload = fingerprintEditorialMemoryPayload(rebuilt.memory);
  const wasPendingRecoverable = beforePayload !== nextPayload;

  if (typeof input?.hooks?.afterRebuild === 'function') {
    await input.hooks.afterRebuild({
      uid,
      persistence,
      plan,
      planFingerprint,
      memoryBefore,
      rebuiltMemory: rebuilt.memory,
    });
  }

  // Re-validazione pointer + eventi (obbligatoria; non basta il fingerprint memoria)
  const snap2 = await loadAuthoritativePublishSnapshot(persistence, uid);
  if (!snap2.ok) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: wasPendingRecoverable ? 'pending' : 'applied',
      recoveryStatus: 'persistence_error',
      error: snap2.error,
      editions: plan.editions,
      planFingerprint,
      memory: memoryBefore,
      memoryPersisted: false,
      details: {
        note: 'pointer_reload_failed_after_rebuild',
        pendingRecoverable: wasPendingRecoverable,
      },
    });
  }

  const published2 = resolveAuthoritativePublishedEditions({
    archiveEntries: snap2.archiveEntries,
    metasByDate: snap2.metasByDate,
    jobsByDate: snap2.jobsByDate,
  });
  if (!published2.ok) {
    return result({
      ok: false,
      editionPublished: (snap2.archiveEntries || []).length > 0,
      memoryStatus: 'pending',
      recoveryStatus: 'plan_stale',
      error: 'publish_plan_invalid_after_rebuild',
      editions: plan.editions,
      planFingerprint,
      memory: memoryBefore,
      memoryPersisted: false,
      details: {
        conflicts: published2.conflicts,
        errors: published2.errors,
        pendingRecoverable: wasPendingRecoverable,
      },
    });
  }

  const planFingerprint2 = fingerprintAuthoritativePublishPlan(published2.editions);
  if (planFingerprint2 !== planFingerprint) {
    return result({
      ok: false,
      editionPublished: true,
      memoryStatus: 'pending',
      recoveryStatus: 'plan_stale',
      error: 'publish_plan_changed',
      editions: plan.editions,
      planFingerprint,
      memory: memoryBefore,
      memoryPersisted: false,
      details: {
        previousPlanFingerprint: planFingerprint,
        currentPlanFingerprint: planFingerprint2,
        previousEditions: plan.editions,
        currentEditions: published2.editions,
        pendingRecoverable: true,
      },
    });
  }

  const events2 = await loadMemoryEventsForEditions(
    persistence,
    uid,
    plan.editions,
  );
  for (const edition of plan.editions) {
    const a = memoryEventsByKey[edition.editionKey];
    const b = events2[edition.editionKey];
    if (!b || !a || a.contentFingerprint !== b.contentFingerprint) {
      return result({
        ok: false,
        editionPublished: true,
        memoryStatus: 'pending',
        recoveryStatus: 'plan_stale',
        error: 'memory_event_changed',
        editions: plan.editions,
        planFingerprint,
        memory: memoryBefore,
        memoryPersisted: false,
        details: {
          editionKey: edition.editionKey,
          pendingRecoverable: wasPendingRecoverable,
        },
      });
    }
  }

  if (!wasPendingRecoverable) {
    return result({
      ok: true,
      editionPublished,
      memoryStatus: 'applied',
      recoveryStatus: 'already_aligned',
      memory: memoryBefore,
      memoryPersisted: true,
      editions: plan.editions,
      appliedEditionKeys: rebuilt.appliedEditionKeys,
      planFingerprint,
    });
  }

  if (!shouldCommit) {
    return result({
      ok: true,
      editionPublished,
      memoryStatus: 'pending',
      recoveryStatus: 'pending_recoverable',
      memory: memoryBefore,
      memoryPersisted: false,
      editions: plan.editions,
      appliedEditionKeys: rebuilt.appliedEditionKeys,
      planFingerprint,
      details: {
        note: 'rebuild_ok_commit_disabled',
        rebuiltLastAppliedEdition: rebuilt.memory?.lastAppliedEdition ?? null,
      },
    });
  }

  const replaceResult = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected: expectedCursor,
    nextMemory: rebuilt.memory,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });

  if (replaceResult.conflict) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: 'pending',
      recoveryStatus: 'conflict',
      error: replaceResult.error || 'memory_conflict',
      editions: plan.editions,
      planFingerprint,
      memory: replaceResult.memory ?? memoryBefore,
      memoryPersisted: false,
      details: {
        pendingRecoverable: true,
        replace: {
          ok: replaceResult.ok,
          conflict: replaceResult.conflict,
          error: replaceResult.error,
        },
      },
    });
  }

  if (!replaceResult.ok) {
    return result({
      ok: false,
      editionPublished,
      memoryStatus: 'pending',
      recoveryStatus: 'persistence_error',
      error: replaceResult.error || 'memory_replace_failed',
      editions: plan.editions,
      planFingerprint,
      memory: memoryBefore,
      memoryPersisted: false,
      details: {
        pendingRecoverable: true,
        replace: {
          ok: replaceResult.ok,
          error: replaceResult.error,
        },
      },
    });
  }

  const persisted = await persistence.getEditorialMemory(uid);
  return result({
    ok: true,
    editionPublished,
    memoryStatus: 'applied',
    recoveryStatus: replaceResult.unchanged ? 'already_aligned' : 'recovered',
    memory: persisted,
    memoryPersisted: true,
    editions: plan.editions,
    appliedEditionKeys: rebuilt.appliedEditionKeys,
    planFingerprint,
    details: {
      wasPendingRecoverable: true,
    },
  });
}
