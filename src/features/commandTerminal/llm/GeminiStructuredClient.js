import {
  addFoodPayloadSchema,
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
  return terminalCommandEnvelopeSchema;
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

  buildSystemInstruction(commandHint) {
    const fixedHint = asTrimmedString(commandHint).toUpperCase();
    return [
      'Sei Kentu Command Terminal.',
      'Rispondi SOLO con JSON valido e conforme allo schema fornito.',
      'Non aggiungere markdown, spiegazioni o testo fuori dal JSON.',
      fixedHint
        ? `Intent target prioritario: ${fixedHint}.`
        : 'Se l intent non è chiaro, usa il comando più plausibile e segnala requiresConfirmation=true.',
    ].join(' ');
  }

  async generateStructuredCommand({
    userText,
    contextBundle,
    commandHint = 'UNKNOWN',
    temperature = 0,
  }) {
    const apiKey = this.resolveApiKey();
    const responseSchema = getEnvelopeSchemaForIntent(asTrimmedString(commandHint).toUpperCase());
    const payload = {
      system_instruction: {
        parts: [{ text: this.buildSystemInstruction(commandHint) }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `Richiesta utente: ${asTrimmedString(userText)}`,
                `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
                'Produci esclusivamente l envelope commandType/payload/uiMessage/confidence/requiresConfirmation.',
              ].join('\n'),
            },
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
