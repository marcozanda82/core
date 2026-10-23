/**
 * Orchestratore deterministico I4-B: dossier → selection → edizione tecnica → persist.
 * Nessuna Gemini. Memoria aggiornata solo dopo publish riuscito.
 */

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
  normalizeEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../../editorial/selectFocusEditorial.js';
import { applyWrittenEditionToRevision } from '../../editorial/writing/applyWrittenEditionToRevision.js';
import { generateFocusWrittenEdition } from '../../editorial/writing/generateFocusWrittenEdition.js';
import {
  assessMemoryEventRecoverability,
  buildFocusMemoryEvent,
  memoryEventToPublishEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import {
  createFocusPublishResult,
  FOCUS_JOB_STATUS,
} from '../contracts/focusPersistence.v1.js';
import { stableFingerprint } from '../sanitize/rtdbSanitize.js';
import { validateFocusEditionRevision } from '../validate/validateFocusEdition.js';
import { buildEssentialEditionFromSelection } from './buildEssentialEdition.js';
import { publishRevisionWithBarrier } from './publishRevisionWithBarrier.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  readPublishCoordination,
} from '../memory/publishBarrier.js';
import {
  commitCurrentOnlyMemoryAfterPublish,
  isSupersedingPublishedRevision,
} from '../memory/commitCurrentOnlyMemoryAfterPublish.js';
import { buildSelectionMemoryForExplicitRegen } from '../memory/buildSelectionMemoryForExplicitRegen.js';

/**
 * @param {{
 *   uid: string,
 *   persistence: import('../persist/MemoryFocusPersistence.js').MemoryFocusPersistence,
 *   dossierInput: object,
 *   ownerId?: string,
 *   explicitRegen?: boolean,
 *   allowStealInterrupted?: boolean,
 *   locale?: string,
 *   nowIso?: string,
 *   simulatedGeminiOutput?: string|object|null,
 *   geminiProvider?: { generate: Function }|null,
 * }} input
 */
export async function publishFocusEdition(input) {
  const uid = String(input.uid || '').trim();
  const persistence = input.persistence;
  if (!uid) {
    return createFocusPublishResult({
      ok: false,
      publicationDate: '',
      error: 'uid_required',
    });
  }
  if (!persistence) {
    return createFocusPublishResult({
      ok: false,
      publicationDate: '',
      error: 'persistence_required',
    });
  }

  const dossierInput = input.dossierInput || {};
  const publicationDate = dossierInput.publicationDate;
  const analysisDate = dossierInput.analysisDate;
  const ownerId = input.ownerId || `owner_${uid}`;
  const explicitRegen = Boolean(input.explicitRegen);

  const fingerprintPayload = {
    analysisDate,
    publicationDate,
    // fingerprint dei nodi giorno (non dell'intero history array per stabilità)
    analysisDayNode: dossierInput.analysisDayNode,
    publicationDayNode: dossierInput.publicationDayNode,
    targets: dossierInput.targets ?? null,
    bodyWeightKg: dossierInput.bodyWeightKg ?? null,
    explicitRegen,
  };
  const inputFingerprint = stableFingerprint(fingerprintPayload);

  const claim = await persistence.claimJob(uid, publicationDate, {
    ownerId,
    analysisDate,
    inputFingerprint,
    explicitRegen,
    allowStealInterrupted: input.allowStealInterrupted !== false,
  });

  if (!claim.ok) {
    return createFocusPublishResult({
      ok: false,
      publicationDate,
      job: claim.job ?? null,
      error: claim.error || 'claim_failed',
    });
  }

  // Replay idempotente: nessuna acquisizione barriera; verifica stati esistenti
  if (claim.replay && claim.job?.status === FOCUS_JOB_STATUS.succeeded) {
    const published = await persistence.getPublishedEdition(uid, publicationDate);
    const expectedRev = Number(claim.job.publishedRevision);
    if (!published.meta || Number(published.meta.currentRevision) !== expectedRev) {
      return createFocusPublishResult({
        ok: false,
        publicationDate,
        job: claim.job,
        error: 'idempotent_replay_pointers_inconsistent',
      });
    }
    const memory = await persistence.getEditorialMemory(uid);
    const coord = readPublishCoordination(memory);
    return {
      ...createFocusPublishResult({
        ok: true,
        publicationDate,
        revision: published.meta.currentRevision,
        editionMeta: published.meta,
        revisionDoc: published.revision,
        job: claim.job,
        memory,
        idempotentReplay: true,
      }),
      // diagnostica: barriera bloccata non cancellata silenziosamente
      barrierDiagnostic: coord.publishBarrier === PUBLISH_BARRIER_PUBLISHING
        ? 'publish_barrier_still_held'
        : null,
    };
  }

  const job = claim.job;
  const leaseVersion = job.leaseVersion;

  const running = await persistence.updateJobIfOwner(
    uid,
    publicationDate,
    ownerId,
    leaseVersion,
    { status: FOCUS_JOB_STATUS.running },
  );
  if (!running.ok) {
    return createFocusPublishResult({
      ok: false,
      publicationDate,
      error: running.error || 'cannot_mark_running',
      job: running.job ?? job,
    });
  }

  try {
    // Stato persistito: CAS / commit post-pointer. Non usarlo per selezione in regen.
    const memoryBefore = normalizeEditorialMemory(
      await persistence.getEditorialMemory(uid),
    );

    const existingMeta = (await persistence.getPublishedEdition(uid, publicationDate)).meta;
    let revisionNumber = 1;
    if (explicitRegen) {
      revisionNumber = (existingMeta?.currentRevision || 0) + 1;
    } else if (existingMeta?.currentRevision) {
      // stessa fingerprint già gestita via replay; qui non dovrebbe sovrascrivere
      revisionNumber = existingMeta.currentRevision;
    }

    // P6.7.2p: selezione/scrittura su memoria prior-dates-only se si sostituisce una rev.
    let selectionMemory = memoryBefore;
    if (explicitRegen && Number(existingMeta?.currentRevision) >= 1) {
      const selMem = await buildSelectionMemoryForExplicitRegen({
        uid,
        persistence,
        publicationDate,
        updatedAt: input.nowIso || new Date().toISOString(),
      });
      if (!selMem.ok) {
        await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
          status: FOCUS_JOB_STATUS.failed,
          error: selMem.error || 'selection_memory_unrecoverable',
        }).catch(() => null);
        return createFocusPublishResult({
          ok: false,
          publicationDate,
          error: selMem.error || 'selection_memory_unrecoverable',
          job: await persistence.getJob(uid, publicationDate),
        });
      }
      selectionMemory = normalizeEditorialMemory(selMem.memory);
    }

    const dossier = buildFocusDossier({
      uid,
      ...dossierInput,
      generatedAt: input.nowIso || new Date().toISOString(),
    });

    const selection = selectFocusEditorial({
      dossier,
      memory: selectionMemory,
      dossierContentHash: inputFingerprint,
    });

    const generated = await generateFocusWrittenEdition({
      selection,
      memory: selectionMemory,
      locale: input.locale || 'it-IT',
      rawAiOutput: input.simulatedGeminiOutput ?? null,
      geminiProvider: input.geminiProvider ?? null,
    });

    const essential = buildEssentialEditionFromSelection({
      selection,
      revision: revisionNumber,
      inputFingerprint,
      dossierContentHash: inputFingerprint,
      publishedAt: input.nowIso || new Date().toISOString(),
    });
    essential.revisionDoc.aiBriefRef = {
      schemaVersion: generated.aiBrief.schemaVersion,
      openingMode: generated.aiBrief.openingMode,
      proseSource: generated.proseSource,
      usedFallback: generated.usedFallback,
      diag: generated.diag,
    };

    const built = applyWrittenEditionToRevision(essential, generated.written);

    const validation = validateFocusEditionRevision(built.revisionDoc);
    if (!validation.ok) {
      await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
        status: FOCUS_JOB_STATUS.failed,
        error: validation.errors.join(','),
      });
      return createFocusPublishResult({
        ok: false,
        publicationDate,
        error: `validation_failed:${validation.errors.join(',')}`,
        job: await persistence.getJob(uid, publicationDate),
      });
    }

    // Se revisione già esiste e non è regen → tentativo overwrite bloccato
    const saveRev = await persistence.saveRevisionImmutable(
      uid,
      publicationDate,
      built.revisionDoc,
    );
    if (!saveRev.ok) {
      if (saveRev.error === 'revision_already_exists' && !explicitRegen) {
        // ripresa: revisione già scritta — richiede memory_event prima del publish
        return resumeAfterRevisionSaved({
          uid,
          persistence,
          publicationDate,
          ownerId,
          leaseVersion,
          revisionNumber,
          built,
          memoryBefore,
          selection,
          nowIso: input.nowIso,
        });
      }
      await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
        status: FOCUS_JOB_STATUS.failed,
        error: saveRev.error,
      });
      return createFocusPublishResult({
        ok: false,
        publicationDate,
        error: saveRev.error,
        job: await persistence.getJob(uid, publicationDate),
      });
    }

    const eventGate = await ensureMemoryEventSaved({
      uid,
      persistence,
      publicationDate,
      revision: revisionNumber,
      selection,
      capturedAt: input.nowIso || new Date().toISOString(),
    });
    if (!eventGate.ok) {
      await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
        status: FOCUS_JOB_STATUS.interrupted,
        error: eventGate.error,
        targetRevision: revisionNumber,
      }).catch(() => null);
      return createFocusPublishResult({
        ok: false,
        publicationDate,
        revision: revisionNumber,
        revisionDoc: built.revisionDoc,
        error: eventGate.error,
        job: await persistence.getJob(uid, publicationDate),
      });
    }

    const published = await publishRevisionWithBarrier({
      uid,
      persistence,
      publicationDate,
      ownerId,
      leaseVersion,
      editionMeta: built.editionMeta,
      archiveEntry: built.archiveEntry,
      publishedRevision: revisionNumber,
    });

    if (!published.ok) {
      // revisione + memory_event salvati ma publish fallito → riprendibile
      // se barrier ancora held (crash/parziale), resta diagnosticabile
      await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
        status: FOCUS_JOB_STATUS.interrupted,
        error: published.error,
        targetRevision: revisionNumber,
      }).catch(() => null);

      return createFocusPublishResult({
        ok: false,
        publicationDate,
        revision: revisionNumber,
        revisionDoc: built.revisionDoc,
        error: published.error || 'publish_failed',
        job: await persistence.getJob(uid, publicationDate),
      });
    }

    const editionKey = eventGate.memoryEvent.editionKey;
    const memResult = await applyMemoryAfterPointersPublished({
      uid,
      persistence,
      publicationDate,
      ownerId,
      leaseVersion,
      revisionNumber,
      editionKey,
      memoryBefore,
      memoryEvent: eventGate.memoryEvent,
      updatedAt: input.nowIso || new Date().toISOString(),
    });

    const archiveList = await persistence.listArchiveIndex(uid, {
      endAt: publicationDate,
      limit: 1,
    });

    return {
      ...createFocusPublishResult({
        ok: true,
        publicationDate,
        revision: revisionNumber,
        editionMeta: published.editionMeta,
        revisionDoc: built.revisionDoc,
        archiveEntry: archiveList[0] || built.archiveEntry,
        job: await persistence.getJob(uid, publicationDate),
        memory: memResult.memory,
        idempotentReplay: false,
        error: memResult.ok ? null : memResult.error,
      }),
      memoryStatus: memResult.memoryStatus,
      memoryPersisted: memResult.memoryPersisted,
    };
  } catch (err) {
    await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
      status: FOCUS_JOB_STATUS.interrupted,
      error: err?.message || 'orchestrator_error',
    }).catch(() => null);

    return createFocusPublishResult({
      ok: false,
      publicationDate,
      error: err?.message || 'orchestrator_error',
      job: await persistence.getJob(uid, publicationDate),
    });
  }
}

/**
 * Persiste (o conferma) lo snapshot memory_event prima di qualsiasi publish.
 * @param {{
 *   uid: string,
 *   persistence: object,
 *   publicationDate: string,
 *   revision: number,
 *   selection: object,
 *   capturedAt?: string,
 * }} input
 */
async function ensureMemoryEventSaved(input) {
  const {
    uid,
    persistence,
    publicationDate,
    revision,
    selection,
    capturedAt,
  } = input;
  if (typeof persistence.saveMemoryEventImmutable !== 'function'
    || typeof persistence.getMemoryEvent !== 'function') {
    return { ok: false, error: 'memory_event_persistence_unavailable' };
  }

  const memoryEvent = buildFocusMemoryEvent({
    publicationDate,
    revision,
    selection,
    capturedAt: capturedAt || null,
  });

  const saved = await persistence.saveMemoryEventImmutable(
    uid,
    publicationDate,
    memoryEvent,
  );
  if (!saved.ok) {
    return { ok: false, error: saved.error || 'memory_event_save_failed' };
  }

  const stored = saved.memoryEvent
    || await persistence.getMemoryEvent(uid, publicationDate, revision);
  const recoverability = assessMemoryEventRecoverability(stored, {
    publicationDate,
    revision,
  });
  if (!recoverability.recoverable) {
    return {
      ok: false,
      error: recoverability.reason || 'memory_event_missing',
    };
  }
  return { ok: true, memoryEvent: stored, alreadyExists: Boolean(saved.alreadyExists) };
}

/**
 * Ripresa: revisione già su disco; memory_event obbligatorio prima del publish.
 */
async function resumeAfterRevisionSaved(ctx) {
  const {
    uid,
    persistence,
    publicationDate,
    ownerId,
    leaseVersion,
    revisionNumber,
    built,
    memoryBefore,
    selection,
    nowIso,
  } = ctx;

  const eventGate = await ensureMemoryEventSaved({
    uid,
    persistence,
    publicationDate,
    revision: revisionNumber,
    selection,
    capturedAt: nowIso || new Date().toISOString(),
  });
  if (!eventGate.ok) {
    await persistence.updateJobIfOwner(uid, publicationDate, ownerId, leaseVersion, {
      status: FOCUS_JOB_STATUS.interrupted,
      error: eventGate.error,
      targetRevision: revisionNumber,
    }).catch(() => null);
    return createFocusPublishResult({
      ok: false,
      publicationDate,
      revision: revisionNumber,
      revisionDoc: built.revisionDoc,
      error: eventGate.error,
      job: await persistence.getJob(uid, publicationDate),
    });
  }

  const published = await publishRevisionWithBarrier({
    uid,
    persistence,
    publicationDate,
    ownerId,
    leaseVersion,
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: revisionNumber,
  });

  if (!published.ok) {
    // forse già pubblicato da altro worker — verifica senza acquisire barriera
    const existing = await persistence.getPublishedEdition(uid, publicationDate);
    if (existing.meta?.currentRevision === revisionNumber) {
      const editionKey = eventGate.memoryEvent.editionKey;
      const memResult = await applyMemoryAfterPointersPublished({
        uid,
        persistence,
        publicationDate,
        ownerId,
        leaseVersion,
        revisionNumber,
        editionKey,
        memoryBefore: memoryBefore || createEmptyEditorialMemory(),
        memoryEvent: eventGate.memoryEvent,
        updatedAt: nowIso || new Date().toISOString(),
      });
      const coord = readPublishCoordination(await persistence.getEditorialMemory(uid));
      return {
        ...createFocusPublishResult({
          ok: true,
          publicationDate,
          revision: revisionNumber,
          editionMeta: existing.meta,
          revisionDoc: existing.revision,
          job: await persistence.getJob(uid, publicationDate),
          memory: memResult.memory,
          idempotentReplay: true,
          error: memResult.ok ? null : memResult.error,
        }),
        memoryStatus: memResult.memoryStatus,
        memoryPersisted: memResult.memoryPersisted,
        barrierDiagnostic: coord.publishBarrier === PUBLISH_BARRIER_PUBLISHING
          ? 'publish_barrier_still_held'
          : null,
      };
    }
    return createFocusPublishResult({
      ok: false,
      publicationDate,
      revision: revisionNumber,
      error: published.error,
      job: await persistence.getJob(uid, publicationDate),
    });
  }

  const editionKey = eventGate.memoryEvent.editionKey;
  const memResult = await applyMemoryAfterPointersPublished({
    uid,
    persistence,
    publicationDate,
    ownerId,
    leaseVersion,
    revisionNumber,
    editionKey,
    memoryBefore: memoryBefore || createEmptyEditorialMemory(),
    memoryEvent: eventGate.memoryEvent,
    updatedAt: nowIso || new Date().toISOString(),
  });

  return {
    ...createFocusPublishResult({
      ok: true,
      publicationDate,
      revision: revisionNumber,
      editionMeta: published.editionMeta,
      revisionDoc: built.revisionDoc,
      job: await persistence.getJob(uid, publicationDate),
      memory: memResult.memory,
      idempotentReplay: true,
      error: memResult.ok ? null : memResult.error,
    }),
    memoryStatus: memResult.memoryStatus,
    memoryPersisted: memResult.memoryPersisted,
  };
}

/**
 * Memoria post-pointer: incremental per prima revisione; current-only rebuild su sostitutive.
 * Puntatori già pubblicati → non degradare ok pubblicazione se memoria pending.
 */
async function applyMemoryAfterPointersPublished(ctx) {
  const {
    uid,
    persistence,
    publicationDate,
    ownerId,
    leaseVersion,
    revisionNumber,
    editionKey,
    memoryBefore,
    memoryEvent,
    updatedAt,
  } = ctx;

  if (isSupersedingPublishedRevision(revisionNumber)) {
    const committed = await commitCurrentOnlyMemoryAfterPublish({
      uid,
      persistence,
      updatedAt,
    });
    if (committed.ok && committed.memoryPersisted) {
      await persistence.updateJobIfOwner(
        uid,
        publicationDate,
        ownerId,
        leaseVersion,
        { memoryAppliedKey: editionKey },
      ).catch(() => null);
    }
    return {
      ok: committed.ok,
      memoryPersisted: Boolean(committed.memoryPersisted),
      memoryStatus: committed.memoryStatus || 'pending',
      memory: committed.memory ?? (await persistence.getEditorialMemory(uid)),
      error: committed.ok ? null : (committed.error || 'memory_current_only_commit_failed'),
      details: committed.details ?? null,
    };
  }

  const nextMemory = applyEditorialMemoryAfterPublish(
    memoryBefore || createEmptyEditorialMemory(),
    {
      ...memoryEventToPublishEvent(memoryEvent),
      updatedAt,
    },
  );
  const memResult = await persistence.applyEditorialMemoryIfNeeded(
    uid,
    nextMemory,
    editionKey,
  );
  return {
    ok: Boolean(memResult.ok),
    memoryPersisted: Boolean(memResult.ok),
    memoryStatus: memResult.ok
      ? (memResult.alreadyApplied ? 'unchanged' : 'applied')
      : 'pending',
    memory: memResult.ok
      ? (memResult.memory || null)
      : (await persistence.getEditorialMemory(uid)),
    error: memResult.ok ? null : (memResult.error || 'memory_apply_failed'),
  };
}

/**
 * Completa memory se edizione già published ma memory non applicata.
 */
export async function repairFocusMemoryAfterPublish(input) {
  const { uid, persistence, publicationDate, selection } = input;
  const published = await persistence.getPublishedEdition(uid, publicationDate);
  if (!published.meta) {
    return { ok: false, error: 'edition_missing' };
  }
  const revision = published.meta.currentRevision;
  const editionKey = `${publicationDate}#${revision}`;
  const memoryBefore = normalizeEditorialMemory(
    await persistence.getEditorialMemory(uid),
  );
  if (memoryBefore.lastAppliedEdition === editionKey) {
    return { ok: true, alreadyApplied: true, memory: memoryBefore };
  }
  const nextMemory = applyEditorialMemoryAfterPublish(memoryBefore, {
    publicationDate,
    revision,
    selection: selection || {
      publicationDate,
      lead: published.revision?.lead,
      goodNews: published.revision?.goodNews || [],
      features: published.revision?.features || [],
      concerns: published.revision?.concerns || [],
      coach: published.revision?.coach,
    },
  });
  return persistence.applyEditorialMemoryIfNeeded(uid, nextMemory, editionKey);
}
