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
import { resolveFocusAiCoachTimeoutMs } from './focusAiCoachTimeouts.js';

export { focusAiAnalysisBasePath } from './focusAiAnalysisPersistence.js';

/**
 * Diagnostica minima (niente contenuti diario).
 * @param {object} payload
 */
function logFocusAiCoachDiag(payload) {
  try {
    // eslint-disable-next-line no-console
    console.info('[FocusAiCoach]', JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Cache in-memory per sessione pagina.
 * key → { binding, analysis, createdAt, record }
 */
const memoryCache = new Map();

/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

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

  const built = buildFocusAiCoachDossier(session);
  if (!built.ok || !built.dossier || !built.binding) {
    return {
      ok: false,
      status: 'blocked',
      reason: built.reason || 'dossier_failed',
      userMessage: 'Non riesco a preparare i dati per l’analisi AI.',
      analysis: null,
      binding: null,
    };
  }

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

  const requestStartedAt = Date.now();
  const requestId = `fac_${requestStartedAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) && Number(input.timeoutMs) > 0
    ? Math.floor(Number(input.timeoutMs))
    : resolveFocusAiCoachTimeoutMs(built.binding.periodId);

  const run = (async () => {
    const t0 = Date.now();
    const systemText = buildFocusAiCoachSystemInstruction();
    const userText = buildFocusAiCoachUserPrompt(built.dossier);
    const dossierChars = (() => {
      try {
        return JSON.stringify(built.dossier || {}).length;
      } catch {
        return null;
      }
    })();

    logFocusAiCoachDiag({
      phase: 'start',
      requestId,
      periodId: built.binding.periodId,
      timeoutMs,
      dossierChars,
      userPromptChars: userText.length,
      systemChars: systemText.length,
      force: Boolean(input.force),
    });

    const provider = createAskAiFocusGeminiProvider({
      askAiFn: input.askAiFn,
      model: FOCUS_AI_COACH_MODEL,
      temperature: 0.4,
      signal: input.signal || null,
      timeoutMs,
    });

    let raw;
    const tProvider0 = Date.now();
    try {
      raw = await provider.generate({ systemText, userText });
    } catch (err) {
      logFocusAiCoachDiag({
        phase: 'provider_throw',
        requestId,
        periodId: built.binding.periodId,
        ms: Date.now() - tProvider0,
        errorType: err?.name || 'Error',
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
      };
    }

    logFocusAiCoachDiag({
      phase: 'provider_done',
      requestId,
      periodId: built.binding.periodId,
      ms: Date.now() - tProvider0,
      diag: raw?.diag || null,
      ok: Boolean(raw?.ok),
      responseChars: raw?.text ? String(raw.text).length : 0,
    });

    if (!raw?.ok || !raw.text) {
      const msg = raw?.diag === 'timeout'
        ? 'La risposta AI sta impiegando troppo: attendi qualche secondo prima di ritentare (una richiesta precedente potrebbe ancora completarsi sul server).'
        : raw?.diag === 'aborted'
          ? 'Analisi AI interrotta.'
          : 'Analisi AI non disponibile al momento.';
      return {
        ok: false,
        status: 'error',
        reason: raw?.diag || 'empty_ai',
        userMessage: msg,
        analysis: null,
        binding: built.binding,
        error: raw?.error || null,
        requestId,
      };
    }

    const tVal0 = Date.now();
    const validated = validateFocusAiCoachResponse(raw.text, { dossier: built.dossier });
    logFocusAiCoachDiag({
      phase: 'validated',
      requestId,
      periodId: built.binding.periodId,
      ms: Date.now() - tVal0,
      ok: Boolean(validated.ok),
      reason: validated.reason || null,
    });
    if (!validated.ok || !validated.analysis) {
      return {
        ok: false,
        status: 'validation_failed',
        reason: validated.reason || 'validation_failed',
        userMessage: validated.reason === 'editorial_restate_only'
          ? 'La risposta AI era solo un riassunto numerico: non la mostro. Riprova.'
          : validated.reason === 'technical_headline'
            ? 'La risposta aveva un titolo troppo tecnico: non la mostro. Riprova.'
            : validated.reason === 'vague_food_proposal_with_candidates'
              ? 'La proposta alimentare era troppo vaga rispetto agli alimenti del diario: non la mostro. Riprova.'
              : 'La risposta AI non ha superato i controlli di qualità.',
        analysis: null,
        binding: built.binding,
        requestId,
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
    userText: buildFocusAiCoachUserPrompt(built.dossier),
  };
}
