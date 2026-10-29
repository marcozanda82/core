'use strict';
/**
 * Helper HTTP Gemini condiviso (CJS) — nessuna callable.
 * Sorgente canonica per callGemini (functions/index.js).
 * Twin ESM Focus: src/features/kentuFocus/server/gemini/geminiHttpCore.js
 * (allineato; parity check in scripts/verifyGeminiHttpParity.mjs).
 * Non unificare con createRequire in questo step: rischio packaging CF / Vite.
 */

/** v1beta: richiesto per thinkingConfig (thinkingLevel / thinkingBudget). */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

function sanitizeGeminiModel(raw, fallback = DEFAULT_GEMINI_MODEL) {
  const id = String(raw || '').trim();
  if (/^[a-zA-Z0-9._-]+$/.test(id)) return id;
  return fallback;
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeThinkingConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  const levelRaw = raw.thinkingLevel ?? raw.thinking_level;
  if (typeof levelRaw === 'string' && levelRaw.trim()) {
    const level = String(levelRaw).trim().toLowerCase();
    if (/^(minimal|low|medium|high)$/.test(level)) out.thinkingLevel = level;
  }
  const budgetRaw = raw.thinkingBudget ?? raw.thinking_budget;
  const budget = Number(budgetRaw);
  if (Number.isFinite(budget)) out.thinkingBudget = Math.round(budget);
  const includeThoughts = raw.includeThoughts ?? raw.include_thoughts;
  if (typeof includeThoughts === 'boolean') out.includeThoughts = includeThoughts;
  return Object.keys(out).length ? out : null;
}

function normalizeGenerationConfig(rawConfig = {}) {
  const src = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const config = {};
  const temp = Number(src.temperature);
  config.temperature = Number.isFinite(temp) ? temp : 0.3;
  const maxOut = Number(src.maxOutputTokens ?? src.max_output_tokens);
  if (Number.isFinite(maxOut) && maxOut > 0) {
    config.maxOutputTokens = Math.round(maxOut);
  }
  const topP = Number(src.topP ?? src.top_p);
  if (Number.isFinite(topP)) config.topP = topP;
  const topK = Number(src.topK ?? src.top_k);
  if (Number.isFinite(topK)) config.topK = Math.round(topK);
  const stop = src.stopSequences ?? src.stop_sequences;
  if (Array.isArray(stop) && stop.length > 0) {
    config.stopSequences = stop.map((s) => String(s)).filter(Boolean);
  }
  const thinking = normalizeThinkingConfig(src.thinkingConfig ?? src.thinking_config);
  if (thinking) config.thinkingConfig = thinking;
  return config;
}

/**
 * Estrae token usage (input/output/thinking) da usageMetadata Gemini.
 * @param {object|null|undefined} usage
 */
function extractGeminiUsageStats(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokenCount: null,
      candidatesTokenCount: null,
      totalTokenCount: null,
      thoughtsTokenCount: null,
    };
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    promptTokenCount: num(usage.promptTokenCount ?? usage.prompt_token_count),
    candidatesTokenCount: num(usage.candidatesTokenCount ?? usage.candidates_token_count),
    totalTokenCount: num(usage.totalTokenCount ?? usage.total_token_count),
    thoughtsTokenCount: num(
      usage.thoughtsTokenCount
      ?? usage.thoughts_token_count
      ?? usage.thinkingTokenCount
      ?? usage.thinking_token_count,
    ),
  };
}

function extractGeminiText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  const textPart = parts.find((part) => typeof part?.text === 'string');
  return textPart?.text || '';
}

/**
 * @param {{
 *   apiKey: string,
 *   model?: string,
 *   contents: object[],
 *   generationConfig?: object,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} opts
 */
async function postGeminiGenerateContent(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const modelId = sanitizeGeminiModel(opts.model);
  const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${opts.apiKey}`;
  const generationConfig = normalizeGenerationConfig(opts.generationConfig || {});
  const payload = {
    contents: opts.contents,
    generationConfig,
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null;

  let response;
  let rawBody = '';
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });
    rawBody = await response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }

  return { response, rawBody, modelId };
}

module.exports = {
  GEMINI_API_BASE,
  DEFAULT_GEMINI_MODEL,
  sanitizeGeminiModel,
  normalizeGenerationConfig,
  normalizeThinkingConfig,
  extractGeminiText,
  extractGeminiUsageStats,
  postGeminiGenerateContent,
};
