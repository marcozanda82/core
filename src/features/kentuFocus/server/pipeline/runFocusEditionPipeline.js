/**
 * Pipeline end-to-end Focus (locale / emulator):
 * tracker → normalize → dossier → editorial → Gemini(sim) → validate → publish → memory.
 *
 * Nessuna callable pubblica. Nessun trigger. Gate sonno prima del publish.
 */

import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import { extractFocusSignals } from '../../editorial/extractFocusSignals.js';
import { addCalendarDays, isIsoDateString } from '../../normalize/focusDateUtils.js';
import { MAIN_NIGHT_STATUS } from '../../normalize/resolveMainNightSleep.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { publishFocusEdition } from '../publish/publishFocusEdition.js';
import { AdminRtdbTrackerReader } from '../reader/AdminRtdbTrackerReader.js';
import { buildDossierInputFromTracker } from '../reader/buildDossierInputFromTracker.js';
import {
  countSelectedArticles,
  createFocusPipelineReport,
} from './focusPipelineDiag.js';

/**
 * @param {{
 *   uid: string,
 *   publicationDate: string,
 *   analysisDate?: string,
 *   db?: import('firebase-admin/database').Database,
 *   reader?: object,
 *   persistence?: object,
 *   historyDays?: number,
 *   horizon?: 'd7'|'d30'|'d90',
 *   needD90?: boolean,
 *   targets?: object|null,
 *   bodyWeightKg?: number|null,
 *   bodyMeasuredOn?: string|null,
 *   loadProfileContext?: boolean,
 *   ownerId?: string,
 *   nowIso?: string,
 *   locale?: string,
 *   explicitRegen?: boolean,
 *   requireSleep?: boolean,
 *   geminiProvider?: { generate: Function }|null,
 *   simulatedGeminiOutput?: string|object|null,
 *   allowStealInterrupted?: boolean,
 * }} input
 *
 * I4-G: adminAllowPublishWithoutSleep / allowPublishWithoutSleep sono IGNORATI
 * sull’entry point ordinario (mai bypass sonno da client o richieste normali).
 */
export async function runFocusEditionPipeline(input) {
  const t0 = Date.now();
  const timingsMs = {};
  const notes = [];

  const uid = String(input.uid || '').trim();
  const publicationDate = input.publicationDate;
  if (!uid) {
    return failResult('uid_required', publicationDate, timingsMs, notes);
  }
  if (!isIsoDateString(publicationDate)) {
    return failResult('publicationDate_invalid', publicationDate, timingsMs, notes);
  }

  const analysisDate = input.analysisDate || addCalendarDays(publicationDate, -1);
  // Gate sonno: default on. Solo test hook interno con requireSleep:false esplicito
  // (mai da CLI admin / callable). Bypass flags client → ignorati.
  const requireSleep = input.requireSleep !== false;
  const explicitRegen = Boolean(input.explicitRegen);
  if (input.adminAllowPublishWithoutSleep || input.allowPublishWithoutSleep) {
    notes.push('ignored_client_sleep_bypass_flag');
  }

  const reader = input.reader
    || (input.db ? new AdminRtdbTrackerReader(input.db, {
      maxHistoryDays: input.historyDays,
    }) : null);
  if (!reader) {
    return failResult('reader_or_db_required', publicationDate, timingsMs, notes, {
      analysisDate,
    });
  }
  if (typeof reader.resetStats === 'function') reader.resetStats();

  const persistence = input.persistence
    || (input.db ? new AdminRtdbFocusPersistence(input.db) : null);
  if (!persistence) {
    return failResult('persistence_or_db_required', publicationDate, timingsMs, notes, {
      analysisDate,
    });
  }

  const tRead = Date.now();
  let built;
  try {
    built = await buildDossierInputFromTracker({
      uid,
      reader,
      publicationDate,
      analysisDate,
      historyDays: input.historyDays,
      horizon: input.horizon,
      needD90: input.needD90,
      targets: input.targets,
      bodyWeightKg: input.bodyWeightKg,
      bodyMeasuredOn: input.bodyMeasuredOn,
      loadProfileContext: input.loadProfileContext,
    });
  } catch (err) {
    timingsMs.readMs = Date.now() - tRead;
    return failResult(err?.message || 'tracker_read_failed', publicationDate, timingsMs, notes, {
      analysisDate,
    });
  }
  timingsMs.readMs = Date.now() - tRead;

  const sleepGate = built.sleepGate;
  const stats = built.readStats || {};
  if (built.horizonPlan) {
    notes.push(`horizon:${built.horizonPlan.horizon}:${built.horizonPlan.policy}`);
  }
  if (built.userContext?.targetsProvenance?.conflict) {
    notes.push(`targets_conflict:${built.userContext.targetsProvenance.conflict.join('|')}`);
  }
  if (built.userContext?.bodyProvenance?.conflict) {
    notes.push(`body_conflict:${built.userContext.bodyProvenance.conflict}`);
  }

  // Gate sonno: ordinaria + explicitRegen richiedono notte attendibile.
  if (requireSleep) {
    if (sleepGate.sleepAmbiguous || sleepGate.status === MAIN_NIGHT_STATUS.ambiguous) {
      notes.push('blocked_sleep_ambiguous');
      if (explicitRegen) notes.push('explicit_regen_does_not_bypass_sleep');
      return {
        ok: false,
        publicationDate,
        analysisDate,
        error: 'sleep_ambiguous',
        sleepGate,
        userContext: built.userContext,
        report: createFocusPipelineReport({
          publicationDate,
          analysisDate,
          dailyRecords: stats.reads,
          approxBytes: stats.approxBytes,
          presentDays: stats.presentDays,
          missingDays: stats.missingDays,
          historyDaysRequested: built.historyDays,
          timingsMs: { ...timingsMs, totalMs: Date.now() - t0 },
          sleepStatus: sleepGate.status,
          sleepReason: sleepGate.reason,
          sleepAvailable: false,
          sleepAmbiguous: true,
          publishOk: false,
          error: 'sleep_ambiguous',
          notes,
        }),
      };
    }
    if (!sleepGate.sleepAvailable) {
      notes.push('blocked_sleep_required');
      if (explicitRegen) notes.push('explicit_regen_does_not_bypass_sleep');
      return {
        ok: false,
        publicationDate,
        analysisDate,
        error: 'sleep_required',
        sleepGate,
        userContext: built.userContext,
        report: createFocusPipelineReport({
          publicationDate,
          analysisDate,
          dailyRecords: stats.reads,
          approxBytes: stats.approxBytes,
          presentDays: stats.presentDays,
          missingDays: stats.missingDays,
          historyDaysRequested: built.historyDays,
          timingsMs: { ...timingsMs, totalMs: Date.now() - t0 },
          sleepStatus: sleepGate.status,
          sleepReason: sleepGate.reason,
          sleepAvailable: false,
          sleepAmbiguous: false,
          publishOk: false,
          error: 'sleep_required',
          notes,
        }),
      };
    }
  } else {
    notes.push('sleep_gate_disabled_requireSleep_false');
  }

  let candidateCount = null;
  try {
    const dossierPreview = buildFocusDossier({
      uid: 'pipeline',
      ...built.dossierInput,
      generatedAt: input.nowIso || new Date().toISOString(),
    });
    const signals = extractFocusSignals(dossierPreview);
    candidateCount = Array.isArray(signals) ? signals.length : null;
  } catch {
    candidateCount = null;
  }

  const tPub = Date.now();
  const published = await publishFocusEdition({
    uid,
    persistence,
    dossierInput: built.dossierInput,
    ownerId: input.ownerId || `pipeline_${publicationDate}`,
    explicitRegen,
    allowStealInterrupted: input.allowStealInterrupted !== false,
    locale: input.locale || 'it-IT',
    nowIso: input.nowIso,
    geminiProvider: input.geminiProvider ?? null,
    simulatedGeminiOutput: input.simulatedGeminiOutput ?? null,
  });
  timingsMs.publishMs = Date.now() - tPub;
  timingsMs.totalMs = Date.now() - t0;

  const rev = published.revisionDoc;
  const selectedArticles = countSelectedArticles({
    lead: rev?.lead,
    goodNews: rev?.goodNews,
    features: rev?.features,
    concerns: rev?.concerns,
  });
  const proseSource = rev?.aiBriefRef?.proseSource
    ?? rev?.proseSource
    ?? null;
  const usedFallback = rev?.aiBriefRef?.usedFallback ?? null;
  const proseDiag = rev?.aiBriefRef?.diag ?? null;

  if (published.idempotentReplay) notes.push('idempotent_replay');
  if (published.error && published.ok) notes.push(`memory_note:${published.error}`);

  const report = createFocusPipelineReport({
    publicationDate,
    analysisDate,
    dailyRecords: stats.reads,
    approxBytes: stats.approxBytes,
    presentDays: stats.presentDays,
    missingDays: stats.missingDays,
    historyDaysRequested: built.historyDays,
    timingsMs,
    candidateCount,
    selectedArticles,
    hasCoach: Boolean(rev?.coach),
    openingMode: rev?.openingMode ?? null,
    proseSource,
    usedFallback,
    validationOk: published.ok ? true : null,
    proseDiag,
    sleepStatus: sleepGate.status,
    sleepReason: sleepGate.reason,
    sleepAvailable: sleepGate.sleepAvailable,
    sleepAmbiguous: sleepGate.sleepAmbiguous,
    publishOk: published.ok,
    revision: published.revision ?? null,
    idempotentReplay: published.idempotentReplay ?? false,
    error: published.ok ? null : published.error,
    recovered: Boolean(published.idempotentReplay && notes.includes('idempotent_replay')),
    notes,
  });

  return {
    ok: published.ok,
    publicationDate,
    analysisDate,
    error: published.error,
    sleepGate,
    userContext: built.userContext,
    horizonPlan: built.horizonPlan,
    publishResult: published,
    dossierInput: built.dossierInput,
    report,
  };
}

function failResult(error, publicationDate, timingsMs, notes, extra = {}) {
  return {
    ok: false,
    publicationDate: publicationDate || null,
    analysisDate: extra.analysisDate || null,
    error,
    sleepGate: null,
    publishResult: null,
    dossierInput: null,
    report: createFocusPipelineReport({
      publicationDate: publicationDate || null,
      analysisDate: extra.analysisDate || null,
      timingsMs: { ...timingsMs, totalMs: timingsMs.totalMs || 0 },
      publishOk: false,
      error,
      notes: [...notes, error],
    }),
  };
}
