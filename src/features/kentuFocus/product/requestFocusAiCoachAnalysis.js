/**
 * Orchestratore coach AI Kentu Focus 2.0.
 * askAI / callGemini + persistenza multidispositivo (store iniettabile).
 */

import { buildFocusAiCoachDossier, canBuildFocusAiCoachDossier } from './buildFocusAiCoachDossier.js';
import {
  FOCUS_AI_COACH_MODEL,
  FOCUS_AI_COACH_RESPONSE_SCHEMA,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
} from './buildFocusAiCoachPrompt.js';
import { validateFocusAiCoachResponse } from './validateFocusAiCoachResponse.js';
import { createAskAiFocusGeminiProvider } from '../editorial/writing/createAskAiFocusGeminiProvider.js';
import {
  buildFocusAiAnalysisRecord,
  getDefaultMemoryFocusAiAnalysisStore,
} from './focusAiAnalysisPersistence.js';
import {
  FOCUS_AI_COACH_RETRY_MIN_REMAINING_MS,
  resolveFocusAiCoachTimeoutMs,
} from './focusAiCoachTimeouts.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import {
  FOCUS_OFF_WAIT_TIMEOUT_MS,
  focusWindowNeedsOffCatalog,
  waitFocusOffCatalogForAnalysis,
} from './waitFocusOffCatalogForAnalysis.js';
import { formatBannedPhraseRetryHint } from './focusAiCoachBannedUserPhrases.js';

export { focusAiAnalysisBasePath } from './focusAiAnalysisPersistence.js';

/**
 * Diagnostica minima (niente contenuti diario).
 * @param {object} payload
 */
function isFocusAiCoachDev() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true;
  } catch {
    /* ignore */
  }
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function logFocusAiCoachDiag(payload) {
  if (!isFocusAiCoachDev()) return;
  try {
    // eslint-disable-next-line no-console
    console.info('[FocusAiCoach]', JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** ~4 chars ≈ 1 token (stima grezza). */
function estimateTokens(chars) {
  const n = Number(chars);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 4);
}

/**
 * Cache in-memory per sessione pagina.
 * key → { binding, analysis, createdAt, record }
 */
const memoryCache = new Map();

/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

/**
 * Contatore DEV dei retry per regola validatore (solo log, nessuna UI).
 * @type {Map<string, number>}
 */
const focusAiCoachRetryCountsByRule = new Map();

/**
 * @param {string|null|undefined} reason
 * @param {{ requestId?: string, periodId?: string, skipped?: boolean }} [extra]
 */
function recordFocusAiCoachRetry(reason, extra = {}) {
  const rule = String(reason || 'unknown');
  const count = (focusAiCoachRetryCountsByRule.get(rule) || 0) + 1;
  focusAiCoachRetryCountsByRule.set(rule, count);
  /** @type {Record<string, number>} */
  const totals = {};
  for (const [k, v] of focusAiCoachRetryCountsByRule.entries()) totals[k] = v;
  logFocusAiCoachDiag({
    phase: 'retry_counter',
    rule,
    count,
    skipped: Boolean(extra.skipped),
    totals,
    requestId: extra.requestId || null,
    periodId: extra.periodId || null,
  });
}

/**
 * @param {{ uid: string, periodId: string, analysisDate: string, publicationDate: string, dataVersion: string }} binding
 */
export function focusAiCoachCacheKey(binding) {
  return [
    binding.uid,
    binding.periodId,
    binding.analysisDate,
    binding.publicationDate,
    binding.dataVersion,
  ].join('|');
}

export function __resetFocusAiCoachMemoryForTests() {
  memoryCache.clear();
  inflight.clear();
  focusAiCoachRetryCountsByRule.clear();
}

/** Snapshot contatori retry (test / debug). */
export function __getFocusAiCoachRetryCountsForTests() {
  return Object.fromEntries(focusAiCoachRetryCountsByRule.entries());
}

/**
 * @param {string} key
 * @param {object} binding
 */
export function peekFocusAiCoachMemory(key, binding) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (
    hit.binding?.uid !== binding.uid
    || hit.binding?.periodId !== binding.periodId
    || hit.binding?.analysisDate !== binding.analysisDate
    || hit.binding?.publicationDate !== binding.publicationDate
    || hit.binding?.dataVersion !== binding.dataVersion
  ) {
    return null;
  }
  return hit;
}

/**
 * @param {{
 *   session: object,
 *   askAiFn?: Function,
 *   signal?: AbortSignal|null,
 *   force?: boolean,
 *   persistence?: object|null,
 *   foodCatalogs?: object|null,
 *   offWaitTimeoutMs?: number,
 *   waitOffFn?: Function,
 *   peekOffFn?: Function,
 * }} input
 */
export async function requestFocusAiCoachAnalysis(input) {
  const session = input?.session;
  const gate = canBuildFocusAiCoachDossier(session);
  if (!gate.ok) {
    return {
      ok: false,
      status: 'blocked',
      reason: gate.reason,
      userMessage: gate.reason === 'session_not_real_diary'
        ? 'L’analisi AI è disponibile solo con il tuo diario reale in sessione, non in anteprima dimostrativa.'
        : 'Sessione Focus incompleta: impossibile preparare l’analisi AI.',
      analysis: null,
      binding: null,
    };
  }

  let foodCatalogs = input?.foodCatalogs
    || session?.foodCatalogs
    || null;

  const fullHistory = session?.fullHistory && typeof session.fullHistory === 'object'
    ? session.fullHistory
    : null;
  const analysisDate = String(session?.analysisDate || '').trim();
  const windowDays = session?.periodId === 'mese' ? 30 : session?.periodId === 'settimana' ? 7 : 1;
  /** @type {string[]} */
  const windowDates = [];
  if (fullHistory && isIsoDateString(analysisDate)) {
    for (let i = Math.max(windowDays, 7) - 1; i >= 0; i -= 1) {
      windowDates.push(addCalendarDays(analysisDate, -i));
    }
  }

  const timing = {
    requestStartedAt: Date.now(),
    offWaitMs: 0,
    dossierBuildMs: 0,
    geminiMs: 0,
    validateMs: 0,
    retryGeminiMs: 0,
    retryValidateMs: 0,
    totalMs: null,
  };

  let offWaitMeta = { attempted: false, timedOut: false, offReady: false };
  if (focusWindowNeedsOffCatalog(foodCatalogs, fullHistory, windowDates)) {
    offWaitMeta.attempted = true;
    const tOff0 = Date.now();
    const waited = await waitFocusOffCatalogForAnalysis({
      timeoutMs: Number.isFinite(input?.offWaitTimeoutMs)
        ? Number(input.offWaitTimeoutMs)
        : FOCUS_OFF_WAIT_TIMEOUT_MS,
      waitFn: input?.waitOffFn,
      peekFn: input?.peekOffFn,
    });
    timing.offWaitMs = Date.now() - tOff0;
    offWaitMeta.timedOut = Boolean(waited.timedOut);
    offWaitMeta.offReady = Boolean(waited.offReady);
    foodCatalogs = {
      ...(foodCatalogs && typeof foodCatalogs === 'object' ? foodCatalogs : {}),
      ...waited.catalogsPatch,
      offReady: waited.offReady,
    };
  }

  const tDossier0 = Date.now();
  const built = buildFocusAiCoachDossier(session, { foodCatalogs });
  timing.dossierBuildMs = Date.now() - tDossier0;
  if (!built.ok || !built.dossier || !built.binding) {
    return {
      ok: false,
      status: 'blocked',
      reason: built.reason || 'dossier_failed',
      userMessage: 'Non riesco a preparare i dati per l’analisi AI.',
      analysis: null,
      binding: null,
      timing,
    };
  }

  // Limiti dossier: catalogo OFF incompleto dopo timeout
  if (built.dossier.nutrition?.foodQuality?.completeness === 'partial') {
    const limits = Array.isArray(built.dossier.technicalNotes)
      ? built.dossier.technicalNotes
      : [];
    built.dossier.generationLimits = [
      ...(built.dossier.generationLimits || []),
      'Catalogo Open Food Facts non pronto entro il timeout: classificazione NOVA/qualità alimentare incompleta (completeness=partial, reason=off_catalog_not_ready). Non trattare gli alimenti non classificati come verificati.',
      ...limits.filter((x) => typeof x === 'string'),
    ].slice(0, 6);
  }
  built.dossier.offWaitMeta = offWaitMeta;

  const persistence = input.persistence || getDefaultMemoryFocusAiAnalysisStore();
  const key = focusAiCoachCacheKey(built.binding);

  if (!input.force) {
    const cached = peekFocusAiCoachMemory(key, built.binding);
    if (cached?.analysis) {
      return {
        ok: true,
        status: 'cached',
        reason: null,
        userMessage: null,
        analysis: cached.analysis,
        binding: built.binding,
        fromCache: true,
        persistenceKind: 'memory_session',
        record: cached.record || null,
      };
    }

    // Recupero multidispositivo / altro client sullo stesso store
    try {
      const remote = await persistence.readCurrent({
        uid: built.binding.uid,
        periodId: built.binding.periodId,
        windowKey: built.binding.windowKey || built.binding.analysisDate,
        currentDataVersion: built.binding.dataVersion,
      });
      if (remote.ok && remote.record?.analysis && !remote.record.diaryStale) {
        memoryCache.set(key, {
          binding: built.binding,
          analysis: remote.record.analysis,
          record: remote.record,
          createdAt: Date.now(),
        });
        return {
          ok: true,
          status: 'cached',
          reason: null,
          userMessage: null,
          analysis: remote.record.analysis,
          binding: built.binding,
          fromCache: true,
          fromPersistence: true,
          persistenceKind: persistence.kind || 'unknown',
          record: remote.record,
        };
      }
      if (remote.ok && remote.record?.diaryStale && remote.record.analysis && !input.force) {
        // Espone analisi precedente come stale senza nuova chiamata
        return {
          ok: true,
          status: 'stale_available',
          reason: 'diary_changed_since_generation',
          userMessage: remote.record.freshnessNote,
          analysis: remote.record.analysis,
          binding: {
            ...built.binding,
            dataVersion: remote.record.dataVersion,
          },
          expectedFreshDataVersion: built.binding.dataVersion,
          fromCache: true,
          fromPersistence: true,
          diaryStale: true,
          record: remote.record,
        };
      }
    } catch {
      // persistenza opzionale
    }
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const requestStartedAt = timing.requestStartedAt;
  const requestId = `fac_${requestStartedAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) && Number(input.timeoutMs) > 0
    ? Math.floor(Number(input.timeoutMs))
    : resolveFocusAiCoachTimeoutMs(built.binding.periodId);

  const run = (async () => {
    const t0 = Date.now();
    const systemText = buildFocusAiCoachSystemInstruction();
    const userText = buildFocusAiCoachUserPrompt(built.dossier, { generatedAt: new Date() });
    const dossierChars = (() => {
      try {
        return JSON.stringify(built.dossier || {}).length;
      } catch {
        return null;
      }
    })();
    let schemaChars = null;
    try {
      schemaChars = JSON.stringify(FOCUS_AI_COACH_RESPONSE_SCHEMA).length;
    } catch {
      schemaChars = null;
    }
    const sizes = {
      dossierChars,
      dossierEstTokens: estimateTokens(dossierChars),
      userPromptChars: userText.length,
      userEstTokens: estimateTokens(userText.length),
      systemChars: systemText.length,
      systemEstTokens: estimateTokens(systemText.length),
      schemaChars,
      schemaEstTokens: estimateTokens(schemaChars),
    };

    logFocusAiCoachDiag({
      phase: 'start',
      requestId,
      periodId: built.binding.periodId,
      analysisDate: built.binding.analysisDate,
      timeoutMs,
      offWaitMs: timing.offWaitMs,
      dossierBuildMs: timing.dossierBuildMs,
      offWaitMeta,
      sizes,
      thinkingLevel: 'low',
      force: Boolean(input.force),
      note: 'timeouts: CF callGemini=120s; httpsCallable race client-side; OFF wait default 8s; thinkingLevel=low',
    });

    const provider = createAskAiFocusGeminiProvider({
      askAiFn: input.askAiFn,
      model: FOCUS_AI_COACH_MODEL,
      temperature: 0.4,
      signal: input.signal || null,
      timeoutMs,
      responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
      thinkingLevel: 'low',
      callTag: 'focus_ai_coach',
    });

    let raw;
    const tProvider0 = Date.now();
    try {
      raw = await provider.generate({ systemText, userText });
    } catch (err) {
      timing.geminiMs = Date.now() - tProvider0;
      timing.totalMs = Date.now() - t0;
      logFocusAiCoachDiag({
        phase: 'provider_throw',
        requestId,
        periodId: built.binding.periodId,
        ms: timing.geminiMs,
        timing,
        errorType: err?.name || 'Error',
        error: err?.message || String(err),
      });
      return {
        ok: false,
        status: 'error',
        reason: 'provider_throw',
        userMessage: 'Il servizio AI non ha risposto. Riprova tra poco.',
        analysis: null,
        binding: built.binding,
        error: err?.message || String(err),
        requestId,
        timing,
        sizes,
      };
    }

    timing.geminiMs = Date.now() - tProvider0;
    logFocusAiCoachDiag({
      phase: 'provider_done',
      requestId,
      periodId: built.binding.periodId,
      ms: timing.geminiMs,
      diag: raw?.diag || null,
      ok: Boolean(raw?.ok),
      responseChars: raw?.text ? String(raw.text).length : 0,
      timing,
      sizes,
    });

    if (!raw?.ok || !raw.text) {
      timing.totalMs = Date.now() - t0;
      const msg = raw?.diag === 'timeout'
        ? 'Sta impiegando più del previsto. Attendi un momento e riprova.'
        : raw?.diag === 'aborted'
          ? 'Analisi interrotta.'
          : 'Non sono riuscito a preparare il rapporto. Puoi riprovare.';
      logFocusAiCoachDiag({
        phase: 'provider_failed',
        requestId,
        reason: raw?.diag || 'empty_ai',
        timing,
        sizes,
      });
      return {
        ok: false,
        status: 'error',
        reason: raw?.diag || 'empty_ai',
        userMessage: msg,
        analysis: null,
        binding: built.binding,
        error: raw?.error || null,
        requestId,
        timing,
        sizes,
      };
    }

    const tVal0 = Date.now();
    let validated = validateFocusAiCoachResponse(raw.text, {
      dossier: built.dossier,
      requireSummary: true,
    });
    timing.validateMs = Date.now() - tVal0;
    logFocusAiCoachDiag({
      phase: 'validated',
      attempt: 1,
      requestId,
      periodId: built.binding.periodId,
      ms: timing.validateMs,
      ok: Boolean(validated.ok),
      reason: validated.reason || null,
      failedRules: validated.failedRules || null,
      bannedHits: validated.bannedHits || null,
      droppedEventRefs: validated.droppedEventRefs || null,
    });

    // Una sola retry se la regola è correggibile e resta tempo sufficiente
    const isRetryable = !validated.ok && validated.severity !== 'blocking';
    const canRetry = isRetryable
      && (
        validated.reason === 'banned_user_facing_phrase'
        || /_too_long$/.test(String(validated.reason || ''))
        || validated.reason === 'summary_item_invalid'
        || validated.reason === 'claimLayers_required'
        || validated.reason === 'claimLayers_incomplete'
        || validated.reason === 'quantitativeProposal_required'
        || validated.reason === 'todayAction_index_invalid'
        || validated.reason === 'todayAction_refs_incompatible'
        || validated.reason === 'todayAction_has_or_alternative'
        || validated.reason === 'summary_todayAction_invalid'
        || validated.reason === 'summary_todayAction_missing'
        || validated.reason === 'action_quantity_mismatch'
      );
    if (canRetry) {
      const elapsed = Date.now() - t0;
      const remainingMs = timeoutMs - elapsed;
      const skipRetry = remainingMs < FOCUS_AI_COACH_RETRY_MIN_REMAINING_MS;
      let retryHint = '';
      if (validated.reason === 'banned_user_facing_phrase' && Array.isArray(validated.bannedHits)) {
        retryHint = formatBannedPhraseRetryHint(validated.bannedHits);
      } else if (validated.reason === 'action_quantity_mismatch') {
        retryHint = [
          'RETRY: todayAction.text e recommendedAction devono usare gli stessi orari e grammi.',
          'todayAction = { text, toImproveIndex, eventRefs }; una sola leva senza alternative « o ».',
          'headline top-level = summary.headline.',
        ].join(' ');
      } else if (/todayAction_/.test(String(validated.reason || ''))) {
        retryHint = [
          'RETRY: todayAction deve essere { "text", "toImproveIndex", "eventRefs" }.',
          'toImproveIndex deve puntare a una voce di toImprove; eventRefs compatibili (intersezione o stessa area).',
          'Una sola leva: niente alternative con « o ». Se il momento è già passato, usa «Domani a…».',
        ].join(' ');
      } else if (/_too_long$/.test(String(validated.reason || ''))) {
        const fr = validated.failedRules?.[0];
        retryHint = [
          'RETRY: un campo summary era troppo lungo.',
          fr?.message || validated.reason,
          'Accorcia headline (≤70), wentWell/toImprove text (≤120), todayAction.text (≤140).',
        ].join(' ');
      } else {
        retryHint = [
          'RETRY: la risposta non rispettava lo schema summary.',
          `Motivo: ${validated.reason}.`,
          'wentWell/toImprove = oggetti { text, area, eventRefs }; todayAction = { text, toImproveIndex, eventRefs }.',
          'eventRefs: solo alias e1, e2, … da eventIndex.aliases.',
          'Includi claimLayers e la chiave quantitativeProposal (anche null).',
        ].join(' ');
      }
      recordFocusAiCoachRetry(validated.reason, {
        requestId,
        periodId: built.binding.periodId,
        skipped: skipRetry,
      });
      logFocusAiCoachDiag({
        phase: 'validation_retry',
        requestId,
        periodId: built.binding.periodId,
        reason: validated.reason,
        failedRules: validated.failedRules || null,
        remainingMs,
        skipRetry,
      });
      if (!skipRetry) {
        try {
          const tRetry0 = Date.now();
          const retryRaw = await provider.generate({
            systemText,
            userText: `${userText}\n\n${retryHint}`,
            timeoutMs: remainingMs,
          });
          timing.retryGeminiMs = Date.now() - tRetry0;
          if (retryRaw?.ok && retryRaw.text) {
            raw = retryRaw;
            const tValRetry = Date.now();
            validated = validateFocusAiCoachResponse(raw.text, {
              dossier: built.dossier,
              requireSummary: true,
            });
            timing.retryValidateMs = Date.now() - tValRetry;
            logFocusAiCoachDiag({
              phase: 'validated_after_retry',
              attempt: 2,
              requestId,
              periodId: built.binding.periodId,
              ok: Boolean(validated.ok),
              reason: validated.reason || null,
              failedRules: validated.failedRules || null,
              bannedHits: validated.bannedHits || null,
              timing,
            });
          }
        } catch (err) {
          logFocusAiCoachDiag({
            phase: 'validation_retry_throw',
            requestId,
            errorType: err?.name || 'Error',
            error: err?.message || String(err),
          });
        }
      }
    }

    // Retryable ancora fallita → soft-accept con correzioni automatiche
    if (!validated.ok && validated.severity !== 'blocking' && raw?.text) {
      const priorReason = validated.reason;
      const salvaged = validateFocusAiCoachResponse(raw.text, {
        dossier: built.dossier,
        requireSummary: true,
        salvage: true,
      });
      if (salvaged.ok && salvaged.analysis) {
        logFocusAiCoachDiag({
          phase: 'soft_accept',
          requestId,
          periodId: built.binding.periodId,
          priorReason,
          autoFixes: salvaged.autoFixes || [],
        });
        validated = salvaged;
      }
    }

    if (!validated.ok || !validated.analysis) {
      timing.totalMs = Date.now() - t0;
      const afterRetry = timing.retryGeminiMs > 0 || timing.retryValidateMs > 0;
      const errorPayload = {
        reason: validated.reason || 'validation_failed',
        failedRules: validated.failedRules || null,
        bannedHits: validated.bannedHits || null,
        droppedEventRefs: validated.droppedEventRefs || null,
        severity: validated.severity || null,
        timing,
        sizes,
        requestId,
      };
      logFocusAiCoachDiag({
        phase: 'validation_failed',
        ...errorPayload,
      });
      return {
        ok: false,
        status: afterRetry ? 'validation_failed_after_retry' : 'validation_failed',
        reason: validated.reason || 'validation_failed',
        userMessage: 'Non sono riuscito a preparare il rapporto. Puoi riprovare.',
        analysis: null,
        binding: built.binding,
        requestId,
        bannedHits: validated.bannedHits || null,
        failedRules: validated.failedRules || null,
        droppedEventRefs: validated.droppedEventRefs || null,
        severity: validated.severity || null,
        timing,
        sizes,
        error: errorPayload,
      };
    }

    let revisionSeq = 1;
    const windowKey = built.binding.windowKey || built.binding.analysisDate;
    try {
      const prev = await persistence.readCurrent({
        uid: built.binding.uid,
        periodId: built.binding.periodId,
        windowKey,
      });
      if (prev.ok && prev.record?.revisionSeq) {
        revisionSeq = Number(prev.record.revisionSeq) + 1;
      }
      // Non sovrascrivere una revisione generata da una richiesta avviata dopo questa.
      if (
        prev.ok
        && prev.record
        && Number(prev.record.clientRequestStartedAt || 0) > requestStartedAt
      ) {
        logFocusAiCoachDiag({
          phase: 'superseded_before_save',
          requestId,
          periodId: built.binding.periodId,
          newerRequestStartedAt: prev.record.clientRequestStartedAt,
          totalMs: Date.now() - t0,
        });
        memoryCache.set(key, {
          binding: built.binding,
          analysis: prev.record.analysis,
          record: prev.record,
          createdAt: Date.now(),
        });
        return {
          ok: true,
          status: 'ready',
          reason: 'superseded_by_newer_request',
          userMessage: null,
          analysis: prev.record.analysis,
          binding: built.binding,
          fromCache: false,
          fromPersistence: true,
          record: prev.record,
          requestId,
          _meta: {
            model: FOCUS_AI_COACH_MODEL,
            responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
          },
        };
      }
    } catch {
      revisionSeq = 1;
    }

    const record = {
      ...buildFocusAiAnalysisRecord(
        built.binding,
        validated.analysis,
        built.dossier,
        revisionSeq,
      ),
      clientRequestStartedAt: requestStartedAt,
      clientRequestId: requestId,
      definitive: built.definitive !== false,
      foodQualityCompleteness: built.foodQualityCompleteness || 'complete',
      foodQualityCompletenessReason: built.foodQualityCompletenessReason || null,
      offWaitTimedOut: Boolean(offWaitMeta.timedOut),
    };

    try {
      // Re-check immediato pre-write (race con altro client/retry)
      try {
        const again = await persistence.readCurrent({
          uid: built.binding.uid,
          periodId: built.binding.periodId,
          windowKey,
        });
        if (
          again.ok
          && again.record
          && Number(again.record.clientRequestStartedAt || 0) > requestStartedAt
        ) {
          logFocusAiCoachDiag({
            phase: 'superseded_pre_write',
            requestId,
            periodId: built.binding.periodId,
            totalMs: Date.now() - t0,
          });
          return {
            ok: true,
            status: 'ready',
            reason: 'superseded_by_newer_request',
            userMessage: null,
            analysis: again.record.analysis,
            binding: built.binding,
            fromCache: false,
            fromPersistence: true,
            record: again.record,
            requestId,
            _meta: {
              model: FOCUS_AI_COACH_MODEL,
              responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
            },
          };
        }
        if (again.ok && again.record?.revisionSeq) {
          const next = Number(again.record.revisionSeq) + 1;
          if (next > revisionSeq) {
            record.revisionSeq = next;
            record.revisionId = `r${next}_${Date.now().toString(36)}`;
          }
        }
      } catch {
        /* ignore */
      }

      const saved = await persistence.saveRevision({
        uid: built.binding.uid,
        periodId: built.binding.periodId,
        windowKey,
        record,
      });
      if (!saved?.ok) {
        memoryCache.set(key, {
          binding: built.binding,
          analysis: validated.analysis,
          record: null,
          createdAt: Date.now(),
        });
        logFocusAiCoachDiag({
          phase: 'persist_failed',
          requestId,
          periodId: built.binding.periodId,
          totalMs: Date.now() - t0,
        });
        return {
          ok: true,
          status: 'ready',
          reason: 'persist_failed',
          userMessage: null,
          analysis: validated.analysis,
          binding: built.binding,
          fromCache: false,
          persistError: saved?.reason || saved?.error || 'persist_failed',
          requestId,
          _meta: {
            model: FOCUS_AI_COACH_MODEL,
            responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
          },
        };
      }
    } catch (err) {
      memoryCache.set(key, {
        binding: built.binding,
        analysis: validated.analysis,
        record: null,
        createdAt: Date.now(),
      });
      logFocusAiCoachDiag({
        phase: 'persist_throw',
        requestId,
        periodId: built.binding.periodId,
        totalMs: Date.now() - t0,
      });
      return {
        ok: true,
        status: 'ready',
        reason: 'persist_failed',
        userMessage: null,
        analysis: validated.analysis,
        binding: built.binding,
        fromCache: false,
        persistError: err?.message || String(err),
        requestId,
        _meta: {
          model: FOCUS_AI_COACH_MODEL,
          responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
        },
      };
    }

    memoryCache.set(key, {
      binding: built.binding,
      analysis: validated.analysis,
      record,
      createdAt: Date.now(),
    });

    logFocusAiCoachDiag({
      phase: 'complete',
      requestId,
      periodId: built.binding.periodId,
      totalMs: Date.now() - t0,
      revisionId: record.revisionId,
    });

    return {
      ok: true,
      status: 'ready',
      reason: null,
      userMessage: null,
      analysis: validated.analysis,
      binding: built.binding,
      fromCache: false,
      fromPersistence: true,
      persistenceKind: persistence.kind || 'unknown',
      record,
      requestId,
      _meta: {
        model: FOCUS_AI_COACH_MODEL,
        responseSchema: FOCUS_AI_COACH_RESPONSE_SCHEMA,
      },
    };
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Carica analisi salvata senza nuova chiamata Gemini.
 * @param {{
 *   uid: string,
 *   periodId: string,
 *   windowKey: string,
 *   currentDataVersion?: string|null,
 *   persistence?: object|null,
 * }} input
 */
export async function loadFocusAiAnalysisFromStore(input) {
  const persistence = input.persistence || getDefaultMemoryFocusAiAnalysisStore();
  return persistence.readCurrent({
    uid: input.uid,
    periodId: input.periodId,
    windowKey: input.windowKey,
    currentDataVersion: input.currentDataVersion || null,
  });
}

/**
 * @param {{ uid: string, periodId?: string|null, persistence?: object|null }} input
 */
export async function listFocusAiAnalysisHistory(input) {
  const persistence = input.persistence || getDefaultMemoryFocusAiAnalysisStore();
  return persistence.listIndex({
    uid: input.uid,
    periodId: input.periodId || null,
  });
}

/**
 * Solo per test / documentazione: prompt + dossier senza rete.
 * @param {object} session
 */
export function previewFocusAiCoachPayload(session) {
  const gate = canBuildFocusAiCoachDossier(session);
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, dossier: null, systemText: null, userText: null };
  }
  const built = buildFocusAiCoachDossier(session);
  if (!built.ok) {
    return { ok: false, reason: built.reason, dossier: null, systemText: null, userText: null };
  }
  return {
    ok: true,
    reason: null,
    binding: built.binding,
    dossier: built.dossier,
    systemText: buildFocusAiCoachSystemInstruction(),
    userText: buildFocusAiCoachUserPrompt(built.dossier, { generatedAt: new Date() }),
  };
}
