import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

const callAiFunction = httpsCallable(functions, 'callOpenAI');

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

/** OpenAI json_object richiede la parola "json" nei messaggi quando response_format è JSON. */
function ensureJsonKeywordSafeguard(prompt, systemInstruction = '') {
  const safePrompt = String(prompt ?? '');
  const safeSystemInstruction = String(systemInstruction ?? '');
  const combinedText = `${safePrompt} ${safeSystemInstruction}`.toLowerCase();
  if (combinedText.includes('json')) {
    return { prompt: safePrompt, systemInstruction: safeSystemInstruction };
  }
  return {
    prompt: `${safePrompt}\n\nIMPORTANTE: Rispondi esclusivamente in formato JSON.`,
    systemInstruction: safeSystemInstruction,
  };
}

/**
 * Chiamata AI centralizzata via Firebase Cloud Function (BFF).
 * @param {string} prompt
 * @param {string} [systemInstruction]
 * @param {object} [options] — images, image, temperature, responseSchema, generationConfig, contents
 */
export async function askAI(prompt, systemInstruction = '', options = {}) {
  const opts = options || {};
  const resolvedSystemInstruction = systemInstruction || opts.systemInstruction || '';
  const { prompt: safePrompt, systemInstruction: safeSystemInstruction } = ensureJsonKeywordSafeguard(
    buildPromptWithHistory(prompt, opts),
    resolvedSystemInstruction,
  );
  const payload = {
    prompt: safePrompt,
    systemInstruction: safeSystemInstruction,
  };

  if (opts.images?.length) payload.images = opts.images;
  if (opts.image) payload.image = opts.image;
  if (opts.contents) payload.contents = opts.contents;
  if (opts.temperature != null) payload.temperature = opts.temperature;
  if (opts.responseSchema) payload.responseSchema = opts.responseSchema;
  if (opts.generationConfig) payload.generationConfig = opts.generationConfig;

  const result = await callAiFunction(payload);
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
