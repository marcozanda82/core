/**
 * Adapter Gemini dedicato a Focus — locale / futuro Functions.
 * Non passa da callGemini HTTP; non logga prompt con dati personali.
 */

import {
  DEFAULT_GEMINI_MODEL,
  extractGeminiText,
  normalizeGenerationConfig,
  postGeminiGenerateContent,
  sanitizeGeminiModel,
} from './geminiHttpCore.js';

export const FOCUS_GEMINI_DIAG = Object.freeze({
  ok: 'ok',
  missing_api_key: 'missing_api_key',
  timeout: 'timeout',
  http_429: 'http_429',
  http_5xx: 'http_5xx',
  http_4xx: 'http_4xx',
  empty_text: 'empty_text',
  parse_error: 'parse_error',
  aborted: 'aborted',
  network_error: 'network_error',
  budget_exhausted: 'budget_exhausted',
});

/**
 * Provider finto per test deterministici senza rete.
 */
export class FakeGeminiProvider {
  /**
   * @param {{
   *   responses?: Array<{ text?: string, status?: number, delayMs?: number, throwCode?: string }>,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.queue = Array.isArray(opts.responses) ? [...opts.responses] : [];
    this.calls = 0;
  }

  /**
   * @param {{ systemText: string, userText: string }} _prompt
   */
  async generate(_prompt) {
    this.calls += 1;
    const next = this.queue.shift() || { text: '' };
    if (next.delayMs) {
      await new Promise((r) => setTimeout(r, next.delayMs));
    }
    if (next.throwCode === 'timeout') {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.timeout, status: null };
    }
    if (next.status === 429) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.http_429, status: 429 };
    }
    if (next.status >= 500) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.http_5xx, status: next.status };
    }
    if (next.status >= 400) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.http_4xx, status: next.status };
    }
    const text = next.text ?? '';
    if (!text) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.empty_text, status: 200 };
    }
    return { ok: true, text, diag: FOCUS_GEMINI_DIAG.ok, status: 200 };
  }
}

/**
 * Provider live — usa GEMINI_API_KEY da env (mai loggata).
 */
export class LiveGeminiProvider {
  /**
   * @param {{
   *   apiKey?: string|null,
   *   model?: string,
   *   timeoutMs?: number,
   *   maxOutputTokens?: number,
   *   maxCalls?: number,
   *   maxRetries?: number,
   *   fetchImpl?: typeof fetch,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? null;
    this.model = sanitizeGeminiModel(opts.model || DEFAULT_GEMINI_MODEL);
    this.timeoutMs = Number(opts.timeoutMs) || 45_000;
    this.maxOutputTokens = Number(opts.maxOutputTokens) || 2048;
    this.maxCalls = Number.isFinite(opts.maxCalls) ? opts.maxCalls : 3;
    this.maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : 1;
    this.fetchImpl = opts.fetchImpl;
    this.calls = 0;
  }

  /**
   * @param {{ systemText: string, userText: string }} prompt
   */
  async generate(prompt) {
    if (!this.apiKey || !String(this.apiKey).trim()) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.missing_api_key, status: null };
    }
    if (this.calls >= this.maxCalls) {
      return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.budget_exhausted, status: null };
    }

    const merged = [
      '[SISTEMA]',
      String(prompt.systemText || ''),
      '',
      '[UTENTE]',
      String(prompt.userText || ''),
    ].join('\n');

    // Non loggare merged (può contenere dati sanitizzati ma comunque sensibili).
    let attempt = 0;
    let lastDiag = FOCUS_GEMINI_DIAG.network_error;
    let lastStatus = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      this.calls += 1;
      if (this.calls > this.maxCalls) {
        return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.budget_exhausted, status: null };
      }

      try {
        const { response, rawBody } = await postGeminiGenerateContent({
          apiKey: String(this.apiKey).trim(),
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: merged }] }],
          generationConfig: normalizeGenerationConfig({
            temperature: 0.3,
            maxOutputTokens: this.maxOutputTokens,
          }),
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
        });

        lastStatus = response.status;
        if (response.status === 429) {
          lastDiag = FOCUS_GEMINI_DIAG.http_429;
          if (attempt <= this.maxRetries) continue;
          return { ok: false, text: null, diag: lastDiag, status: 429 };
        }
        if (response.status >= 500) {
          lastDiag = FOCUS_GEMINI_DIAG.http_5xx;
          if (attempt <= this.maxRetries) continue;
          return { ok: false, text: null, diag: lastDiag, status: response.status };
        }
        if (!response.ok) {
          return {
            ok: false,
            text: null,
            diag: FOCUS_GEMINI_DIAG.http_4xx,
            status: response.status,
          };
        }

        let data;
        try {
          data = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.parse_error, status: 200 };
        }
        const text = extractGeminiText(data);
        if (!text) {
          return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.empty_text, status: 200 };
        }
        return { ok: true, text, diag: FOCUS_GEMINI_DIAG.ok, status: 200 };
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (/abort/i.test(msg)) {
          return { ok: false, text: null, diag: FOCUS_GEMINI_DIAG.timeout, status: null };
        }
        lastDiag = FOCUS_GEMINI_DIAG.network_error;
        if (attempt <= this.maxRetries) continue;
        return { ok: false, text: null, diag: lastDiag, status: lastStatus };
      }
    }

    return { ok: false, text: null, diag: lastDiag, status: lastStatus };
  }
}
