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
  createFocusPublishResult,
  FOCUS_JOB_STATUS,
} from '../contracts/focusPersistence.v1.js';
import { stableFingerprint } from '../sanitize/rtdbSanitize.js';
import { validateFocusEditionRevision } from '../validate/validateFocusEdition.js';
import { buildEssentialEditionFromSelection } from './buildEssentialEdition.js';

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

  // Replay idempotente: edizione già pubblicata con stesso fingerprint
  if (claim.replay && claim.job?.status === FOCUS_JOB_STATUS.succeeded) {
    const published = await persistence.getPublishedEdition(uid, publicationDate);
    const memory = await persistence.getEditorialMemory(uid);
    return createFocusPublishResult({
      ok: true,
      publicationDate,
      revision: published.meta?.currentRevision ?? claim.job.publishedRevision,
      editionMeta: published.meta,
      revisionDoc: published.revision,
      job: claim.job,
      memory,
      idempotentReplay: true,
    });
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
    const memoryBefore = normalizeEditorialMemory(
      await persistence.getEditorialMemory(uid),
    );

    const dossier = buildFocusDossier({
      uid,
      ...dossierInput,
      generatedAt: input.nowIso || new Date().toISOString(),
    });

    const selection = selectFocusEditorial({
      dossier,
      memory: memoryBefore,
      dossierContentHash: inputFingerprint,
    });

    const existingMeta = (await persistence.getPublishedEdition(uid, publicationDate)).meta;
    let revisionNumber = 1;
    if (explicitRegen) {
      revisionNumber = (existingMeta?.currentRevision || 0) + 1;
    } else if (existingMeta?.currentRevision) {
      // stessa fingerprint già gestita via replay; qui non dovrebbe sovrascrivere
      revisionNumber = existingMeta.currentRevision;
    }

    const generated = await generateFocusWrittenEdition({
      selection,
      memory: memoryBefore,
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
        // ripresa: revisione già scritta, prova publish + memory
        return resumeAfterRevisionSaved({
          uid,
          persistence,
          publicationDate,
          ownerId,
          leaseVersion,
          revisionNumber,
          built,
          memoryBefore,
          inputFingerprint,
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

    const published = await persistence.publishCurrentRevision(uid, publicationDate, {
      ownerId,
      leaseVersion,
      editionMeta: built.editionMeta,
      archiveEntry: built.archiveEntry,
      publishedRevision: revisionNumber,
    });

    if (!published.ok) {
      // revisione salvata ma publish fallito (owner mismatch / crash) → recuperabile
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

    const editionKey = `${publicationDate}#${revisionNumber}`;
    const nextMemory = applyEditorialMemoryAfterPublish(memoryBefore, {
      publicationDate,
      revision: revisionNumber,
      selection,
      updatedAt: input.nowIso || new Date().toISOString(),
    });

    const memResult = await persistence.applyEditorialMemoryIfNeeded(
      uid,
      nextMemory,
      editionKey,
    );

    const archiveList = await persistence.listArchiveIndex(uid, {
      endAt: publicationDate,
      limit: 1,
    });

    return createFocusPublishResult({
      ok: true,
      publicationDate,
      revision: revisionNumber,
      editionMeta: published.editionMeta,
      revisionDoc: built.revisionDoc,
      archiveEntry: archiveList[0] || built.archiveEntry,
      job: await persistence.getJob(uid, publicationDate),
      memory: memResult.memory || nextMemory,
      idempotentReplay: false,
      error: memResult.ok ? null : memResult.error,
    });
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
 * Ripresa: revisione già su disco, manca publish e/o memory.
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
  } = ctx;

  const published = await persistence.publishCurrentRevision(uid, publicationDate, {
    ownerId,
    leaseVersion,
    editionMeta: built.editionMeta,
    archiveEntry: built.archiveEntry,
    publishedRevision: revisionNumber,
  });

  if (!published.ok) {
    // forse già pubblicato da altro worker — verifica
    const existing = await persistence.getPublishedEdition(uid, publicationDate);
    if (existing.meta?.currentRevision === revisionNumber) {
      const editionKey = `${publicationDate}#${revisionNumber}`;
      const selectionStub = {
        publicationDate,
        lead: built.revisionDoc.lead,
        goodNews: built.revisionDoc.goodNews,
        features: built.revisionDoc.features,
        concerns: built.revisionDoc.concerns,
        coach: built.revisionDoc.coach,
      };
      const nextMemory = applyEditorialMemoryAfterPublish(memoryBefore, {
        publicationDate,
        revision: revisionNumber,
        selection: selectionStub,
      });
      const memResult = await persistence.applyEditorialMemoryIfNeeded(
        uid,
        nextMemory,
        editionKey,
      );
      return createFocusPublishResult({
        ok: true,
        publicationDate,
        revision: revisionNumber,
        editionMeta: existing.meta,
        revisionDoc: existing.revision,
        job: await persistence.getJob(uid, publicationDate),
        memory: memResult.memory,
        idempotentReplay: true,
      });
    }
    return createFocusPublishResult({
      ok: false,
      publicationDate,
      revision: revisionNumber,
      error: published.error,
      job: await persistence.getJob(uid, publicationDate),
    });
  }

  const editionKey = `${publicationDate}#${revisionNumber}`;
  const selectionStub = {
    publicationDate,
    lead: built.revisionDoc.lead,
    goodNews: built.revisionDoc.goodNews,
    features: built.revisionDoc.features,
    concerns: built.revisionDoc.concerns,
    coach: built.revisionDoc.coach,
  };
  const nextMemory = applyEditorialMemoryAfterPublish(
    memoryBefore || createEmptyEditorialMemory(),
    {
      publicationDate,
      revision: revisionNumber,
      selection: selectionStub,
    },
  );
  const memResult = await persistence.applyEditorialMemoryIfNeeded(
    uid,
    nextMemory,
    editionKey,
  );

  return createFocusPublishResult({
    ok: true,
    publicationDate,
    revision: revisionNumber,
    editionMeta: published.editionMeta,
    revisionDoc: built.revisionDoc,
    job: await persistence.getJob(uid, publicationDate),
    memory: memResult.memory,
    idempotentReplay: true,
  });
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
