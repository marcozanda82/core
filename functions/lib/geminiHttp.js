'use strict';
/**
 * Helper HTTP Gemini condiviso (CJS) — nessuna callable.
 * Sorgente canonica per callGemini (functions/index.js).
 * Twin ESM Focus: src/features/kentuFocus/server/gemini/geminiHttpCore.js
 * (allineato; parity check in scripts/verifyGeminiHttpParity.mjs).
 * Non unificare con createRequire in questo step: rischio packaging CF / Vite.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

function sanitizeGeminiModel(raw, fallback = DEFAULT_GEMINI_MODEL) {
  const id = String(raw || '').trim();
  if (/^[a-zA-Z0-9._-]+$/.test(id)) return id;
  return fallback;
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
  return config;
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
  extractGeminiText,
  postGeminiGenerateContent,
};
