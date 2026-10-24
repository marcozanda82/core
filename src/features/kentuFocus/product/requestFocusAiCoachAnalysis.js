/**
 * Orchestratore coach AI Kentu Focus.
 * Usa askAI / callGemini — nessuna scrittura Firebase, nessun HealthAnalyzer.
 * askAiFn iniettabile per test offline (nessuna chiamata reale nei test).
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

/**
 * Cache in-memory per sessione pagina (non persistita).
 * key → { binding, analysis, createdAt }
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
      };
    }
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const run = (async () => {
    const systemText = buildFocusAiCoachSystemInstruction();
    const userText = buildFocusAiCoachUserPrompt(built.dossier);
    const provider = createAskAiFocusGeminiProvider({
      askAiFn: input.askAiFn,
      model: FOCUS_AI_COACH_MODEL,
      temperature: 0.35,
      signal: input.signal || null,
    });

    let raw;
    try {
      raw = await provider.generate({ systemText, userText });
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        reason: 'provider_throw',
        userMessage: 'Il servizio AI non ha risposto. Riprova tra poco.',
        analysis: null,
        binding: built.binding,
        error: err?.message || String(err),
      };
    }

    if (!raw?.ok || !raw.text) {
      const msg = raw?.diag === 'timeout'
        ? 'La risposta AI sta impiegando troppo: riprova tra poco.'
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
      };
    }

    const validated = validateFocusAiCoachResponse(raw.text);
    if (!validated.ok || !validated.analysis) {
      return {
        ok: false,
        status: 'validation_failed',
        reason: validated.reason || 'validation_failed',
        userMessage: 'La risposta AI non ha superato i controlli di qualità. Resta valido il commento deterministico sotto le card.',
        analysis: null,
        binding: built.binding,
      };
    }

    memoryCache.set(key, {
      binding: built.binding,
      analysis: validated.analysis,
      createdAt: Date.now(),
    });

    return {
      ok: true,
      status: 'ready',
      reason: null,
      userMessage: null,
      analysis: validated.analysis,
      binding: built.binding,
      fromCache: false,
      // Esporta schema usato (utile test / debug senza chiamare Gemini)
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
