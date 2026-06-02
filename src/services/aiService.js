import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

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

/**
 * Chiamata AI centralizzata via Firebase Cloud Function callGemini (Google Gemini nativo).
 * @param {string} prompt
 * @param {string} [systemInstruction]
 * @param {object} [options] — images, image, temperature, responseSchema, generationConfig, contents, model
 */
export async function askAI(prompt, systemInstruction = '', options = {}) {
  const opts = options || {};
  const payload = {
    prompt: buildPromptWithHistory(prompt, opts),
    systemInstruction: systemInstruction || opts.systemInstruction || '',
    model: opts.model || 'gemini-1.5-flash-latest',
  };

  if (opts.images?.length) payload.images = opts.images;
  if (opts.image) payload.image = opts.image;
  if (opts.contents) payload.contents = opts.contents;
  if (opts.temperature != null) payload.temperature = opts.temperature;
  if (opts.responseSchema) payload.responseSchema = opts.responseSchema;
  if (opts.generationConfig) payload.generationConfig = opts.generationConfig;

  let result;
  try {
    result = await callAiFunction(payload);
  } catch (error) {
    console.error('[askAI] callable error', error?.code, error?.message, error?.details);
    unwrapCallableError(error);
  }

  const text = extractAiText(result.data);
  if (!text) {
    console.warn('AI response missing text payload', { data: result.data });
  }
  return text;
}

/** Retrocompatibilità: stessa firma usata da chat, MealBuilder e modali grafico. */
export async function callGeminiAPIWithRotation(promptText, options = null) {
  const opts = options || {};
  return askAI(promptText, opts.systemInstruction || '', opts);
}
