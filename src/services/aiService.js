import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';
import { recordUsage } from './apiUsageDiary';
import { logSystemError } from '../utils/devToolsPersistence';

const callAiFunction = httpsCallable(functions, 'callGemini');

function extractAiText(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const textPart = parts.find((part) => typeof part?.text === 'string');
    if (textPart?.text != null) return textPart.text;
  }
  return '';
}

function buildPromptWithHistory(promptText, options = null) {
  const opts = options || {};
  let prompt = String(promptText ?? '');

  // I tag [MEMORIA DI SISTEMA - ...] nei turni Assistente (mealProposals/mealDraft)
  // sono iniettati da buildGeminiContentsFromChatHistory e devono restare nel testo appiattito.
  if (opts.systemInstruction && Array.isArray(opts.contents) && opts.contents.length > 0) {
    const history = opts.contents
      .map((entry) => {
        const role = entry?.role === 'model' ? 'Assistente' : 'Utente';
        const text = (entry?.parts || [])
          .map((part) => part?.text)
          .filter(Boolean)
          .join('\n');
        return text ? `${role}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
    if (history) prompt = `${history}\n\nUtente: ${prompt}`;
  }

  return prompt;
}

function unwrapCallableError(error) {
  const code = String(error?.code || '');
  const details = error?.details;
  const message = String(error?.message || '').trim();

  if (typeof details === 'string' && details.trim()) {
    throw new Error(details.trim());
  }

  if (message && message !== 'internal' && message !== 'INTERNAL') {
    throw new Error(message);
  }

  if (code === 'functions/failed-precondition') {
    throw new Error('AI non configurata sul server (GEMINI_API_KEY mancante).');
  }
  if (code === 'functions/not-found' || code === 'functions/unavailable') {
    throw new Error(
      'Cloud Function callGemini non raggiungibile. Verifica deploy su europe-west1 e la connessione.',
    );
  }
  if (code === 'functions/internal') {
    throw new Error('Errore interno callGemini. Controlla i log Firebase Functions.');
  }

  throw new Error(message || code || 'Errore AI sconosciuto');
}

/** @param {unknown} error */
export function isAbortError(error) {
  if (!error || typeof error !== 'object') return false;
  const name = String(error.name || '');
  const code = error.code;
  return name === 'AbortError' || code === 20 || code === 'ABORT_ERR';
}

export function createAbortError(message = 'Aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/** Timeout client-side per sbloccare l'UI su reti lente/assenti (ms). */
export const ASK_AI_TIMEOUT_MS = 30_000;

export const ASK_AI_TIMEOUT_MESSAGE =
  'La connessione è troppo lenta o assente. Riprova.';

/**
 * @param {number} ms
 * @param {string} message
 * @returns {{ promise: Promise<never>, clear: () => void }}
 */
function createTimeoutRace(ms, message) {
  let timerId = null;
  const promise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const error = new Error(message);
      error.name = 'TimeoutError';
      error.code = 'ASK_AI_TIMEOUT';
      reject(error);
    }, ms);
  });
  return {
    promise,
    clear: () => {
      if (timerId != null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}

/**
 * Chiamata AI centralizzata via Firebase Cloud Function callGemini (Google Gemini nativo).
 * @param {string} prompt
 * @param {string} [systemInstruction]
 * @param {object} [options] — images, image, temperature, responseSchema, generationConfig, contents, model, signal, timeoutMs
 */
export async function askAI(prompt, systemInstruction = '', options = {}) {
  const opts = options || {};
  const signal = opts.signal instanceof AbortSignal ? opts.signal : null;
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
    ? Math.floor(Number(opts.timeoutMs))
    : ASK_AI_TIMEOUT_MS;

  if (signal?.aborted) {
    throw createAbortError();
  }

  const payload = {
    prompt: buildPromptWithHistory(prompt, opts),
    systemInstruction: systemInstruction || opts.systemInstruction || '',
    model: opts.model || 'gemini-3.7-flash',
  };

  if (opts.images?.length) payload.images = opts.images;
  if (opts.image) payload.image = opts.image;
  if (opts.contents) payload.contents = opts.contents;
  if (opts.temperature != null) payload.temperature = opts.temperature;
  if (opts.responseSchema) payload.responseSchema = opts.responseSchema;
  if (opts.generationConfig) payload.generationConfig = opts.generationConfig;

  let abortListener = null;
  const abortPromise = signal
    ? new Promise((_, reject) => {
        abortListener = () => reject(createAbortError());
        signal.addEventListener('abort', abortListener, { once: true });
      })
    : null;

  const timeoutRace = createTimeoutRace(timeoutMs, ASK_AI_TIMEOUT_MESSAGE);

  let result;
  try {
    // httpsCallable non espone AbortSignal nativo: race client-side (abort + timeout 30s).
    const racers = [callAiFunction(payload), timeoutRace.promise];
    if (abortPromise) racers.push(abortPromise);
    result = await Promise.race(racers);
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error?.code === 'ASK_AI_TIMEOUT' || error?.name === 'TimeoutError') {
      console.warn('[askAI] timeout', timeoutMs, 'ms');
      throw new Error(ASK_AI_TIMEOUT_MESSAGE);
    }
    console.error('[askAI] callable error', error?.code, error?.message, error?.details);
    void logSystemError(error, 'Gemini API Call');
    unwrapCallableError(error);
  } finally {
    timeoutRace.clear();
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const data = result.data;
  if (data?.usage) {
    recordUsage(data.usage);
  }

  const text = extractAiText(data);
  if (!text) {
    console.warn('AI response missing text payload', { data });
  }
  return text;
}

/** Retrocompatibilità: stessa firma usata da chat, MealBuilder e modali grafico. */
export async function callGeminiAPIWithRotation(promptText, options = null) {
  const opts = options || {};
  return askAI(promptText, opts.systemInstruction || '', opts);
}
