/**
 * Adapter Gemini per anteprima Focus — usa callGemini (Cloud Function).
 * Nessuna API key nel client. Nessuna seconda infrastruttura.
 * Import di askAI lazy: i test offline possono passare askAiFn senza caricare Firebase.
 */

export const FOCUS_ASKAI_DEFAULT_MODEL = 'gemini-3.8-flash';

/**
 * Gemini 3.8 Flash: `minimal` non supportato; `low` = latenza minima.
 * Override via opts.thinkingLevel / opts.generationConfig.thinkingConfig.
 */
export const FOCUS_ASKAI_THINKING_LEVEL = 'low';

/**
 * @param {{
 *   askAiFn?: Function,
 *   model?: string,
 *   temperature?: number,
 *   timeoutMs?: number,
 *   signal?: AbortSignal|null,
 *   responseSchema?: object|null,
 *   generationConfig?: object|null,
 *   thinkingLevel?: string|null,
 *   callTag?: string|null,
 * }} [opts]
 */
export function createAskAiFocusGeminiProvider(opts = {}) {
  const model = opts.model || FOCUS_ASKAI_DEFAULT_MODEL;
  const thinkingLevel = opts.thinkingLevel != null
    ? opts.thinkingLevel
    : FOCUS_ASKAI_THINKING_LEVEL;
  let calls = 0;

  return {
    model,
    thinkingLevel,
    getCallCount: () => calls,
    /**
     * @param {{ systemText: string, userText: string, timeoutMs?: number }} prompt
     */
    async generate(prompt) {
      calls += 1;
      try {
        const ask = typeof opts.askAiFn === 'function'
          ? opts.askAiFn
          : (await import('../../../../services/aiService.js')).askAI;
        const callTimeout = Number.isFinite(Number(prompt?.timeoutMs)) && Number(prompt.timeoutMs) > 0
          ? Math.floor(Number(prompt.timeoutMs))
          : opts.timeoutMs;
        const baseGen = opts.generationConfig && typeof opts.generationConfig === 'object'
          ? { ...opts.generationConfig }
          : {};
        if (thinkingLevel && !baseGen.thinkingConfig) {
          baseGen.thinkingConfig = { thinkingLevel: String(thinkingLevel) };
        }
        const text = await ask(prompt.userText, prompt.systemText, {
          model,
          temperature: opts.temperature ?? 0.35,
          timeoutMs: callTimeout,
          signal: opts.signal || undefined,
          responseSchema: opts.responseSchema || undefined,
          generationConfig: Object.keys(baseGen).length ? baseGen : undefined,
          callTag: opts.callTag || 'focus_ai_coach',
        });
        if (!text || !String(text).trim()) {
          return { ok: false, text: null, diag: 'empty_text', status: null };
        }
        return { ok: true, text: String(text), diag: 'ok', status: 200 };
      } catch (err) {
        const name = String(err?.name || '');
        const code = err?.code;
        if (name === 'AbortError' || code === 20 || code === 'ABORT_ERR') {
          return { ok: false, text: null, diag: 'aborted', status: null, error: err?.message };
        }
        const msg = String(err?.message || err || 'gemini_error');
        let diag = 'network_error';
        if (/timeout|lenta|assente/i.test(msg)) diag = 'timeout';
        else if (/GEMINI_API_KEY|non configurata/i.test(msg)) diag = 'missing_api_key';
        else if (/429|quota/i.test(msg)) diag = 'http_429';
        return {
          ok: false,
          text: null,
          diag,
          status: null,
          error: msg,
        };
      }
    },
  };
}
