import {
  addFoodPayloadSchema,
  logSleepPayloadSchema,
  addWorkoutPayloadSchema,
  terminalCommandEnvelopeSchema,
} from '../contracts/commandSchemas.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function unwrapJsonText(rawText) {
  const text = asTrimmedString(rawText);
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return text;
}

function getEnvelopeSchemaForIntent(commandHint) {
  if (commandHint === 'ADD_FOOD') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ADD_FOOD'] },
        payload: addFoodPayloadSchema,
      },
    };
  }
  if (commandHint === 'ADD_WORKOUT') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ADD_WORKOUT'] },
        payload: addWorkoutPayloadSchema,
      },
    };
  }
  if (commandHint === 'LOG_SLEEP') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['LOG_SLEEP'] },
        payload: logSleepPayloadSchema,
      },
    };
  }
  return terminalCommandEnvelopeSchema;
}

function imageDataUrlToInlinePart(imageSrc) {
  const imgBase64 = asTrimmedString(imageSrc);
  if (!imgBase64) return null;

  const base64Data = asTrimmedString(
    imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64,
  );
  if (!base64Data) return null;

  const mimeType =
    asTrimmedString(((imgBase64.split(';')[0] || '').split(':')[1] || '')) || 'image/jpeg';

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };
}

export class GeminiStructuredClient {
  constructor({
    apiKey = '',
    getApiKey = null,
    model = DEFAULT_MODEL,
    apiBaseUrl = DEFAULT_API_BASE,
    fetchImpl = null,
  } = {}) {
    this.apiKey = apiKey;
    this.getApiKey = typeof getApiKey === 'function' ? getApiKey : null;
    this.model = model || DEFAULT_MODEL;
    this.apiBaseUrl = apiBaseUrl || DEFAULT_API_BASE;
    this.fetchImpl = fetchImpl;
  }

  resolveFetchImpl() {
    if (typeof this.fetchImpl === 'function') {
      if (typeof window !== 'undefined' && this.fetchImpl === window.fetch) {
        return window.fetch.bind(window);
      }
      return this.fetchImpl;
    }
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch.bind(window);
    }
    if (typeof fetch === 'function') {
      // Global fetch call path (non-window runtimes).
      return (...args) => fetch(...args);
    }
    throw new Error('No fetch implementation available');
  }

  resolveApiKey() {
    const dynamic = this.getApiKey ? asTrimmedString(this.getApiKey()) : '';
    const direct = asTrimmedString(this.apiKey);
    const resolved = dynamic || direct;
    if (!resolved) throw new Error('GeminiStructuredClient missing API key');
    return resolved;
  }

  buildSystemInstruction(commandHint, { hasImages = false } = {}) {
    const fixedHint = asTrimmedString(commandHint).toUpperCase();
    const includeSleepRules = fixedHint === 'LOG_SLEEP' || hasImages;
    const parts = [
      'Sei Kentu Command Terminal.',
      'Rispondi SOLO con JSON valido e conforme allo schema fornito.',
      'Non aggiungere markdown, spiegazioni o testo fuori dal JSON.',
    ];

    if (includeSleepRules) {
      parts.push(
        "Se l'utente carica lo screenshot di un'app di monitoraggio del sonno (es. Xiaomi Fitness, smartwatch), analizza l'immagine e restituisci l'intento LOG_SLEEP con payload numerico.",
        `REGOLA DI ESTRAZIONE SONNO (FORMATO ITALIANO):
- Trova il tempo totale di sonno espresso come 'X h Y min' o 'X ore Y min' (es. 5 h 55 min).
- Converti OBBLIGATORIAMENTE questo valore in un numero decimale usando la formula: Ore + (Minuti / 60). Esempio: 5 ore e 55 min diventa 5.91. Usa questo valore numerico per 'durationHours'.
- Cerca la voce 'Profondo' (es. 1 ora 43 min) e fai la stessa conversione decimale per 'deepSleepPhase' (es. 1.71).
- Cerca il numero grande dei punti (es. '80 punti') e inseriscilo come intero in 'qualityScore'.`,
        "Non restituire MAI durationHours = 0. Se non riesci a leggere i valori, imposta uiMessage con un messaggio chiaro e NON inventare numeri.",
      );
    }

    parts.push(
      fixedHint
        ? `Intent target prioritario: ${fixedHint}.`
        : 'Se l intent non e chiaro, usa il comando piu plausibile e segnala requiresConfirmation=true.',
    );

    return parts.join(' ');
  }

  async generateStructuredCommand({
    userText,
    contextBundle,
    commandHint = 'UNKNOWN',
    temperature = 0,
    images = [],
  }) {
    const apiKey = this.resolveApiKey();
    const responseSchema = getEnvelopeSchemaForIntent(asTrimmedString(commandHint).toUpperCase());
    const imageParts = Array.isArray(images)
      ? images
          .map((src) => imageDataUrlToInlinePart(src))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const normalizedUserText = asTrimmedString(userText);
    const userPromptText =
      normalizedUserText ||
      (imageParts.length > 0
        ? 'Analizza lo screenshot allegato (app fitness/sonno in italiano, es. Xiaomi Fitness) ed estrai durata sonno, fase Profondo e punteggio punti per LOG_SLEEP.'
        : '');
    const payload = {
      system_instruction: {
        parts: [{ text: this.buildSystemInstruction(commandHint, { hasImages: imageParts.length > 0 }) }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `Richiesta utente: ${userPromptText}`,
                `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
                'Produci esclusivamente l envelope commandType/payload/uiMessage/confidence/requiresConfirmation.',
              ].join('\n'),
            },
            ...imageParts,
          ],
        },
      ],
      generationConfig: {
        temperature,
        response_mime_type: 'application/json',
        responseMimeType: 'application/json',
        response_schema: responseSchema,
        responseSchema,
      },
    };
    const endpoint = `${this.apiBaseUrl}/models/${this.model}:generateContent?key=${apiKey}`;
    const fetchFn = this.resolveFetchImpl();
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }
    const data = await response.json();
    console.log('RAW_GEMINI_RESPONSE:', data);
    const rawText =
      data?.candidates?.[0]?.content?.parts?.find((p) => typeof p?.text === 'string')?.text || '';
    const cleaned = unwrapJsonText(rawText);
    if (!cleaned) throw new Error('Gemini returned empty structured response');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned malformed JSON');
    }
    return {
      command: parsed,
      rawText,
      model: this.model,
    };
  }
}

export const geminiStructuredClient = new GeminiStructuredClient();
