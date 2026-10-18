/**
 * Anteprima Focus in-memory — nessuna persistenza RTDB Focus, nessun Gemini.
 * Le letture Firebase sono delegate a fetchers iniettati (Console / test).
 */

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { applyWrittenEditionToRevision } from '../editorial/writing/applyWrittenEditionToRevision.js';
import { generateFocusWrittenEdition } from '../editorial/writing/generateFocusWrittenEdition.js';
import { MAIN_NIGHT_STATUS } from '../normalize/resolveMainNightSleep.js';
import { buildEssentialEditionFromSelection } from '../server/publish/buildEssentialEdition.js';
import { buildDossierInputFromTracker } from '../server/reader/buildDossierInputFromTracker.js';
import { resolveFocusHistoryDays } from '../server/reader/focusHistoryHorizon.js';
import {
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from '../server/reader/resolveFocusProfileData.js';
import { listRequiredTrackerDates } from '../server/reader/trackerDateWindow.js';
import { validateFocusEditionRevision } from '../server/validate/validateFocusEdition.js';

export const FOCUS_PREVIEW_MAX_READS = 63;

/**
 * Timeout diagnostico: rifiuta il waiter dopo `ms`.
 * Non annulla la Promise sottostante (es. get RTDB già avviata può completare in background).
 * Garantisce solo che non si avviino ulteriori letture dopo il codice rtdb_timeout.
 *
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} code
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(promise, ms, code) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(Object.assign(new Error(code), { code }));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        // Non propagare messaggi grezzi — solo codice tecnico prestabilito
        reject(Object.assign(new Error('rtdb_read_failed'), { code: 'rtdb_read_failed' }));
      },
    );
  });
}

/** @param {unknown} err */
function classifyReadError(err) {
  if (err && typeof err === 'object' && err.code === 'rtdb_timeout') {
    return 'rtdb_timeout';
  }
  return 'rtdb_read_failed';
}

/**
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   horizon?: 'd7'|'d30'|'d90',
 *   maxReads?: number,
 *   perReadTimeoutMs?: number,
 *   fetchDay: (date: string) => Promise<object|null>,
 *   fetchProfileTargets: () => Promise<object|null>,
 *   fetchBodyMetrics: () => Promise<object|null>,
 *   onProgress?: (p: { phase: string, readsCompleted: number, plannedReads: number }) => void,
 * }} input
 */
export async function runFocusLocalPreview(input) {
  const publicationDate = input.publicationDate;
  const analysisDate = input.analysisDate;
  const horizon = input.horizon || 'd30';
  const maxReads = Number.isFinite(input.maxReads) ? input.maxReads : FOCUS_PREVIEW_MAX_READS;
  const perReadTimeoutMs = Number.isFinite(input.perReadTimeoutMs)
    ? input.perReadTimeoutMs
    : 15000;
  const onProgress = typeof input.onProgress === 'function' ? input.onProgress : () => {};

  /** @type {{
   *   ok: boolean,
   *   block: string|null,
   *   phase: string,
   *   publicationDate: string,
   *   analysisDate: string,
   *   historyDays: number|null,
   *   requiredDates: number|null,
   *   plannedReads: number|null,
   *   reads: number,
   *   presentDays: number,
   *   missingDays: number,
   *   sleepStatus: string|null,
   *   articleCount: number|null,
   *   hasCoach: boolean|null,
   *   proseSource: string|null,
   *   usedFallback: boolean|null,
   *   validationOk: boolean|null,
   *   emptyEditorialMemory: true,
   *   writes: 0,
   *   gemini: false,
   *   published: false,
   *   timedOut: boolean,
   *   timeoutCancelsInFlightGet: false,
   * }} */
  const report = {
    ok: false,
    block: null,
    phase: 'init',
    publicationDate,
    analysisDate,
    historyDays: null,
    requiredDates: null,
    plannedReads: null,
    reads: 0,
    presentDays: 0,
    missingDays: 0,
    sleepStatus: null,
    articleCount: null,
    hasCoach: null,
    proseSource: null,
    usedFallback: null,
    validationOk: null,
    emptyEditorialMemory: true,
    writes: 0,
    gemini: false,
    published: false,
    timedOut: false,
    /** Timeout blocca nuove letture; non abortisce la get() già in volo. */
    timeoutCancelsInFlightGet: false,
  };

  try {
    report.phase = 'plan_dates';
    onProgress({ phase: report.phase, readsCompleted: 0, plannedReads: 0 });

    const horizonPlan = resolveFocusHistoryDays({ horizon });
    report.historyDays = horizonPlan.historyDays;
    const requiredDates = listRequiredTrackerDates(
      analysisDate,
      publicationDate,
      horizonPlan.historyDays,
    );
    // Dedup esplicito (listRequiredTrackerDates già usa Set; ridondanza di sicurezza)
    const uniqueDates = [...new Set(requiredDates)];
    report.requiredDates = uniqueDates.length;
    report.plannedReads = uniqueDates.length + 2;

    if (report.plannedReads > maxReads) {
      report.block = 'read_budget_exceeded';
      report.phase = 'blocked_budget';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    report.phase = 'read_tracker';
    onProgress({
      phase: report.phase,
      readsCompleted: 0,
      plannedReads: report.plannedReads,
    });

    /** @type {Record<string, object|null>} */
    const daysByDate = Object.create(null);
    let aborted = false;

    for (const date of uniqueDates) {
      if (aborted) break;
      if (Object.prototype.hasOwnProperty.call(daysByDate, date)) continue;
      try {
        const val = await withTimeout(
          input.fetchDay(date),
          perReadTimeoutMs,
          'rtdb_timeout',
        );
        daysByDate[date] = val && typeof val === 'object' ? val : null;
        report.reads += 1;
        if (daysByDate[date] == null) report.missingDays += 1;
        else report.presentDays += 1;
        onProgress({
          phase: report.phase,
          readsCompleted: report.reads,
          plannedReads: report.plannedReads,
        });
      } catch (err) {
        const code = classifyReadError(err);
        if (code === 'rtdb_timeout') {
          report.block = 'rtdb_timeout';
          report.timedOut = true;
          report.phase = 'blocked_timeout';
          aborted = true;
          return { ok: false, report, revisionDoc: null, missingNotes: [] };
        }
        report.block = 'rtdb_read_failed';
        report.phase = 'blocked_rtdb';
        return { ok: false, report, revisionDoc: null, missingNotes: [] };
      }
    }

    report.phase = 'read_profile';
    onProgress({
      phase: report.phase,
      readsCompleted: report.reads,
      plannedReads: report.plannedReads,
    });

    let profileTargets = null;
    let bodyMetrics = null;
    try {
      profileTargets = await withTimeout(
        input.fetchProfileTargets(),
        perReadTimeoutMs,
        'rtdb_timeout',
      );
      report.reads += 1;
      onProgress({
        phase: report.phase,
        readsCompleted: report.reads,
        plannedReads: report.plannedReads,
      });
      bodyMetrics = await withTimeout(
        input.fetchBodyMetrics(),
        perReadTimeoutMs,
        'rtdb_timeout',
      );
      report.reads += 1;
      onProgress({
        phase: report.phase,
        readsCompleted: report.reads,
        plannedReads: report.plannedReads,
      });
    } catch (err) {
      const code = classifyReadError(err);
      report.block = code;
      report.timedOut = code === 'rtdb_timeout';
      report.phase = code === 'rtdb_timeout' ? 'blocked_timeout' : 'blocked_rtdb';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    if (report.reads > maxReads) {
      report.block = 'read_budget_exceeded';
      report.phase = 'blocked_budget';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    report.phase = 'build_dossier';
    onProgress({
      phase: report.phase,
      readsCompleted: report.reads,
      plannedReads: report.plannedReads,
    });

    const reader = {
      maxHistoryDays: horizonPlan.historyDays,
      async getDayNodes(_uid, dates) {
        const map = new Map();
        for (const d of dates) map.set(d, daysByDate[d] ?? null);
        return map;
      },
      getStats: () => ({
        reads: report.reads,
        presentDays: report.presentDays,
        missingDays: report.missingDays,
        approxBytes: null,
      }),
      async loadFocusUserContext(_uid, aDate) {
        const fromProfile = resolveFocusTargetsFromProfile(profileTargets, aDate);
        const fromBody = resolveFocusBodyWeight(
          bodyMetrics,
          profileTargets?.profile || null,
          aDate,
        );
        return {
          targets: fromProfile.targets,
          bodyWeightKg: fromBody.bodyWeightKg,
          bodyMeasuredOn: fromBody.bodyMeasuredOn,
          targetsProvenance: fromProfile.provenance,
          bodyProvenance: {
            provenance: fromBody.provenance,
            source: fromBody.source,
            conflict: fromBody.conflict,
          },
          diagnostics: {
            targets: fromProfile.diagnostics,
            body: fromBody.diagnostics,
          },
        };
      },
    };

    const built = await buildDossierInputFromTracker({
      uid: 'preview',
      reader,
      publicationDate,
      analysisDate,
      horizon,
    });

    report.sleepStatus = built.sleepGate?.status ?? null;
    if (built.sleepGate?.status !== MAIN_NIGHT_STATUS.selected) {
      report.block = 'sleep_gate';
      report.phase = 'blocked_sleep';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    report.phase = 'editorial';
    onProgress({
      phase: report.phase,
      readsCompleted: report.reads,
      plannedReads: report.plannedReads,
    });

    const memory = createEmptyEditorialMemory();
    let revisionDoc;
    let generated;
    try {
      const dossier = buildFocusDossier({
        uid: 'preview',
        ...built.dossierInput,
        generatedAt: new Date().toISOString(),
      });
      const selection = selectFocusEditorial({ dossier, memory });
      generated = await generateFocusWrittenEdition({
        selection,
        memory,
        geminiProvider: null,
      });
      const essential = buildEssentialEditionFromSelection({
        selection,
        revision: 1,
        inputFingerprint: 'preview-local',
        dossierContentHash: 'preview-local',
        publishedAt: new Date().toISOString(),
      });
      essential.revisionDoc.aiBriefRef = {
        proseSource: generated.proseSource,
        usedFallback: generated.usedFallback,
        diag: generated.diag,
      };
      ({ revisionDoc } = applyWrittenEditionToRevision(essential, generated.written));
    } catch {
      report.block = 'generate_failed';
      report.phase = 'blocked_generate';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    report.proseSource = generated.proseSource ?? null;
    report.usedFallback = generated.usedFallback ?? null;

    report.phase = 'validate';
    onProgress({
      phase: report.phase,
      readsCompleted: report.reads,
      plannedReads: report.plannedReads,
    });

    const validation = validateFocusEditionRevision(revisionDoc);
    report.validationOk = validation.ok === true;
    if (validation.ok !== true) {
      report.block = 'edition_validation_failed';
      report.phase = 'blocked_validation';
      return { ok: false, report, revisionDoc: null, missingNotes: [] };
    }

    const missingNotes = [];
    if (!built.dossierInput.targets) {
      missingNotes.push('Target storici non risolti per analysisDate (missing prudente).');
    }
    if (built.dossierInput.bodyWeightKg == null) {
      missingNotes.push('Peso non attribuito al giorno (missing o solo profilo).');
    }
    if (report.missingDays > 0) {
      missingNotes.push(`Giorni tracker assenti nella finestra: ${report.missingDays}.`);
    }

    const articleCount = [
      revisionDoc.lead,
      ...(revisionDoc.goodNews || []),
      ...(revisionDoc.features || []),
      ...(revisionDoc.concerns || []),
    ].filter(Boolean).length;

    report.ok = true;
    report.block = null;
    report.phase = 'done';
    report.articleCount = articleCount;
    report.hasCoach = Boolean(revisionDoc.coach);
    onProgress({
      phase: report.phase,
      readsCompleted: report.reads,
      plannedReads: report.plannedReads,
    });

    return { ok: true, report, revisionDoc, missingNotes };
  } catch {
    report.block = 'unhandled';
    report.phase = 'blocked_unhandled';
    return { ok: false, report, revisionDoc: null, missingNotes: [] };
  }
}
