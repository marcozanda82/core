/**
 * Pipeline: selection → AiBrief → (Gemini) → validazione → materialize → edizione.
 * Output AI non validato o con placeholder irrisolti → fallback. Nessuna pubblicazione parziale.
 */

import { buildFocusAiBrief } from '../buildFocusAiBrief.js';
import { buildFocusEditorialPrompt } from './buildFocusEditorialPrompt.js';
import { buildFallbackWrittenEdition } from './buildFallbackWrittenEdition.js';
import { FOCUS_PROSE_SOURCE } from './focusWrittenEdition.v1.js';
import { materializeWrittenEdition } from './materializeAuthorizedProse.js';
import { resolveWrittenEdition } from './resolveWrittenEdition.js';

/**
 * @param {{
 *   selection: object,
 *   memory?: object|null,
 *   locale?: string,
 *   geminiProvider?: { generate: Function }|null,
 *   rawAiOutput?: string|object|null,
 * }} input
 */
export async function generateFocusWrittenEdition(input) {
  const selection = input?.selection;
  if (!selection) throw new Error('generateFocusWrittenEdition: selection richiesta');

  const aiBrief = buildFocusAiBrief({
    selection,
    memory: input.memory,
    locale: input.locale || 'it-IT',
  });
  const prompt = buildFocusEditorialPrompt({ aiBrief });

  /** @type {string|null} */
  let diag = null;
  let rawAi = input.rawAiOutput ?? null;

  if (rawAi == null && input.geminiProvider) {
    const result = await input.geminiProvider.generate({
      systemText: prompt.systemText,
      userText: prompt.userText,
    });
    diag = result.diag || null;
    if (result.ok && result.text) {
      rawAi = stripMarkdownFence(result.text);
    } else {
      rawAi = null;
      diag = diag || 'gemini_unavailable';
    }
  }

  const resolved = resolveWrittenEdition({
    selection,
    rawAiOutput: rawAi,
  });

  let writtenCandidate = resolved.written;
  let proseSource = resolved.proseSource;
  let usedFallback = resolved.usedFallback;
  let aiValidation = resolved.aiValidation;

  let mat = materializeWrittenEdition(writtenCandidate);
  if (!mat.ok) {
    // Placeholder irrisolti / lookalike → scarta e usa fallback deterministico
    const fallback = buildFallbackWrittenEdition({ selection });
    mat = materializeWrittenEdition(fallback);
    writtenCandidate = mat.written;
    proseSource = FOCUS_PROSE_SOURCE.fallback;
    usedFallback = true;
    aiValidation = {
      ok: false,
      errors: [
        ...(aiValidation?.errors || []),
        'materialize_failed',
        ...mat.errors,
      ],
    };
    diag = diag || 'materialize_failed';
  } else {
    writtenCandidate = mat.written;
  }

  // Garanzia: fallback materializzato non deve lasciare placeholder
  if (!mat.ok) {
    writtenCandidate = {
      ...buildFallbackWrittenEdition({ selection }),
      proseSource: FOCUS_PROSE_SOURCE.fallback,
    };
    // strip forzato di eventuali {{ }} residui (non dovrebbe accadere)
    writtenCandidate = stripAllPlaceholders(writtenCandidate);
  }

  return {
    aiBrief,
    prompt,
    written: writtenCandidate,
    proseSource,
    usedFallback,
    aiValidation,
    /** Risposta grezza Gemini (RAM) — utile in diagnostica anteprima; non persistita. */
    rawAiOutput: rawAi,
    diag: usedFallback
      ? (diag || (aiValidation?.ok === false ? 'validation_failed' : 'fallback_default'))
      : 'ok',
  };
}

function stripMarkdownFence(text) {
  const t = String(text || '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1].trim() : t;
}

function stripAllPlaceholders(written) {
  const scrub = (s) => String(s || '').replace(/\{\{[^}]*\}\}/g, '[dato non disponibile]');
  return {
    ...written,
    articles: (written.articles || []).map((a) => ({
      ...a,
      title: scrub(a.title),
      body: scrub(a.body),
    })),
    coach: written.coach
      ? { ...written.coach, title: scrub(written.coach.title), body: scrub(written.coach.body) }
      : null,
  };
}
