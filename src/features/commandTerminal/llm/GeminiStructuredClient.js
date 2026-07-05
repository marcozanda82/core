import {
  addFoodPayloadSchema,
  logSleepPayloadSchema,
  addWorkoutPayloadSchema,
  terminalCommandEnvelopeSchema,
  consultantResponseSchema,
} from '../contracts/commandSchemas.js';
import { askAI } from '../../../services/aiService.js';
import { generateConsultantSystemInstruction } from '../../../conversation/ConsultantEngine.js';
import {
  buildCombinedConversationText,
  buildGeminiContentsFromChatHistory,
} from '../conversation/mealRegistrationSlots.js';
import {
  formatCurrentSystemTimeContext,
  MEAL_SMART_DEFAULTS_PROMPT_RULES,
} from '../conversation/mealSmartDefaults.js';
import {
  normalizeExactTime,
  parseExactTimeFromUserText,
} from '../conversation/mealLogIntent.js';

const DEFAULT_MODEL = 'gemini-2.5-flash-001';
const CONSULTANT_MODEL = 'gemini-2.5-flash-001';

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

/** True se il testo utente menziona una quantità numerica esplicita. */
function userTextMentionsExplicitQuantity(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/.test(t)
    || /\b(\d+(?:[.,]\d+)?)\s*(?:porzioni?|fette?|pezzi|uova?)\b/.test(t)
    || /\b(?:mangiato|mangiata|preso|presa|bevuto|bevuta)\s+(?:circa\s+)?(\d+)/.test(t)
    || /\b(\d+)\s*(?:grammi|g)\b/.test(t)
  );
}

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

function userTextMentionsExplicitMealType(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /\bcolaz/.test(t)
    || /\b(pranzo|mezzogiorno)\b/.test(t)
    || /\b(cena|sera|serale)\b/.test(t)
    || /\b(snack|spuntino|merenda)\b/.test(t)
    || MEAL_TYPES.some((slot) => new RegExp(`\\b${slot}\\b`).test(t))
  );
}

function userTextMentionsExplicitTime(userText) {
  return Boolean(parseExactTimeFromUserText(userText));
}

/** Normalizza payload ADD_FOOD dal modello: niente grammi/pasto/orario inventati; supporta items[]. */
function sanitizeAddFoodCommand(command, userText, conversationText = '') {
  if (!command || typeof command !== 'object') return command;
  if (asTrimmedString(command.commandType).toUpperCase() !== 'ADD_FOOD') return command;

  const combinedText = asTrimmedString(conversationText) || asTrimmedString(userText);

  const payload = { ...(command.payload || {}) };
  const hasItems = Array.isArray(payload.items) && payload.items.length > 0;

  const sanitizeItem = (item) => {
    const next = { ...(item || {}) };
    const foodName = asTrimmedString(next.foodName || next.name);
    if (!foodName) return null;
    next.foodName = foodName;

    const gramsNum = Number(next.grams ?? next.qty ?? next.weight);
    if (!Number.isFinite(gramsNum) || gramsNum <= 0) {
      delete next.grams;
    } else if (!userTextMentionsExplicitQuantity(combinedText)) {
      delete next.grams;
    } else {
      next.grams = Math.round(gramsNum);
    }
    delete next.name;
    delete next.qty;
    delete next.weight;
    return next;
  };

  if (hasItems) {
    payload.items = payload.items.map(sanitizeItem).filter(Boolean);
  } else {
    const single = sanitizeItem({
      foodName: payload.foodName,
      grams: payload.grams,
    });
    if (single) {
      payload.items = [single];
    }
    delete payload.foodName;
    delete payload.grams;
  }

  const mealRaw = asTrimmedString(payload.mealType).toLowerCase();
  if (!mealRaw || !MEAL_TYPES.includes(mealRaw) || !userTextMentionsExplicitMealType(combinedText)) {
    delete payload.mealType;
  } else {
    payload.mealType = mealRaw;
  }

  const timeFromPayload = normalizeExactTime(payload.exactTime || payload.timeString);
  const timeFromUser = parseExactTimeFromUserText(combinedText);
  if (userTextMentionsExplicitTime(combinedText)) {
    const resolvedTime = timeFromPayload || timeFromUser;
    if (resolvedTime) {
      payload.timeString = resolvedTime;
      payload.exactTime = resolvedTime;
    } else {
      delete payload.timeString;
      delete payload.exactTime;
    }
  } else {
    delete payload.timeString;
    delete payload.exactTime;
  }

  return { ...command, payload };
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
  constructor({ model = DEFAULT_MODEL } = {}) {
    this.model = model || DEFAULT_MODEL;
  }

  buildSystemInstruction(commandHint, { hasImages = false } = {}) {
    const fixedHint = asTrimmedString(commandHint).toUpperCase();
    const includeSleepRules = fixedHint === 'LOG_SLEEP' || hasImages;
    const includeFoodRules = fixedHint === 'ADD_FOOD' || fixedHint === 'UNKNOWN';
    const parts = [
      'Sei Kentu Command Terminal.',
      'Rispondi SOLO con JSON valido e conforme allo schema fornito.',
      'Non aggiungere markdown, spiegazioni o testo fuori dal JSON.',
    ];

    if (includeFoodRules) {
      parts.push(
        "REGOLA ADD_FOOD (multi-alimento): Se l'utente elenca PIU alimenti, devi estrarre TUTTI in payload.items[] — uno oggetto per ciascun alimento. Non troncare al primo.",
        "REGOLA ADD_FOOD (orario): Se l'utente indica un orario esplicito (es. 'ore 14.45', 'alle 20:30'), estrailo in HH:mm in payload.timeString ed exactTime. Se NON indica orario, ometti exactTime — il sistema usera l'ora corrente.",
        "REGOLA ADD_FOOD (entity resolution): Estrai SOLO foodName grezzo e grams per ogni alimento. NON inventare foodDbKey né macronutrienti: li risolve il codice locale dal DB.",
        "REGOLA ADD_FOOD (pasto gia consumato): Se l'utente descrive un pasto gia mangiato con grammature esplicite (es. 'per pranzo ho mangiato 230g di gnocchi, 100g di passato di pomodoro'), estrai OGNI alimento con il suo peso in items[].",
        "REGOLA ADD_FOOD: Se l'utente dichiara di aver mangiato qualcosa MA NON specifica la quantità in grammi/porzioni, NON DEVI in alcun modo inventare, dedurre o stimare il peso. Devi obbligatoriamente restituire il campo 'grams' vuoto (null/undefined/omesso). Sarà il sistema a richiedere il dato mancante all'utente.",
        "Includi grams SOLO se l'utente ha scritto un numero esplicito (es. 200g, 150 grammi). Valori tipici come 100g di default sono VIETATI se non detti dall'utente.",
        MEAL_SMART_DEFAULTS_PROMPT_RULES,
        "Se l'utente indica esplicitamente tipo pasto o orario, estraili nel payload. Se omette tipo pasto o orario, ometti i campi — il codice applica Smart Defaults da [CURRENT_SYSTEM_TIME].",
        "Questa logica NON si applica a richieste di consiglio pasto (ADVICE): quelle sono gestite dal consulente, non da ADD_FOOD.",
      );
    }

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
    chatHistory = [],
  }) {
    const responseSchema = getEnvelopeSchemaForIntent(asTrimmedString(commandHint).toUpperCase());
    const imageParts = Array.isArray(images)
      ? images
          .map((src) => imageDataUrlToInlinePart(src))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const normalizedUserText = asTrimmedString(userText);
    const contents = buildGeminiContentsFromChatHistory(chatHistory);
    const conversationText = buildCombinedConversationText(normalizedUserText, chatHistory);
    const systemTimeCtx = formatCurrentSystemTimeContext();
    const userPromptText =
      normalizedUserText ||
      (imageParts.length > 0
        ? 'Analizza lo screenshot allegato (app fitness/sonno in italiano, es. Xiaomi Fitness) ed estrai durata sonno, fase Profondo e punteggio punti per LOG_SLEEP.'
        : '');
    const systemInstruction = this.buildSystemInstruction(commandHint, { hasImages: imageParts.length > 0 });
    const userPrompt = [
      systemTimeCtx.header,
      `Richiesta utente: ${userPromptText}`,
      `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_FOOD'
        ? 'Registrazione pasto: usa payload.items[] con TUTTI gli alimenti menzionati (anche da cronologia). Se l utente indica orario esplicito, compila exactTime in HH:mm. Se omette tipo pasto o orario, ometti i campi — Smart Defaults li deducono da CURRENT_SYSTEM_TIME.'
        : null,
      'Produci esclusivamente l envelope commandType/payload/uiMessage/confidence/requiresConfirmation.',
    ]
      .filter(Boolean)
      .join('\n');
    const generationConfig = {
      temperature,
      response_mime_type: 'application/json',
      responseMimeType: 'application/json',
      response_schema: responseSchema,
      responseSchema,
    };
    const rawText = await askAI(userPrompt, systemInstruction, {
      temperature,
      images: imageParts.length > 0 ? images : undefined,
      responseSchema,
      generationConfig,
      contents: contents.length > 0 ? contents : undefined,
    });
    console.log('RAW_GEMINI_RESPONSE:', rawText);
    const cleaned = unwrapJsonText(rawText);
    if (!cleaned) throw new Error('Gemini returned empty structured response');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned malformed JSON');
    }
    parsed = sanitizeAddFoodCommand(parsed, normalizedUserText, conversationText);
    return {
      command: parsed,
      rawText,
      model: this.model,
    };
  }

  /**
   * Risposta strutturata consulente (JSON): adviceMessage + suggestedAction opzionale.
   * @param {{ prompt: string, systemInstruction?: string, temperature?: number }} params
   */
  async generateConsultantResponse({ prompt, systemInstruction, temperature = 0.35, chatHistory = [] } = {}) {
    const userPrompt = asTrimmedString(prompt);
    if (!userPrompt) throw new Error('Consultant prompt is empty');

    const system =
      asTrimmedString(systemInstruction)
      || generateConsultantSystemInstruction();

    const contents = buildGeminiContentsFromChatHistory(chatHistory);
    const systemTimeCtx = formatCurrentSystemTimeContext();

    const generationConfig = {
      temperature,
      response_mime_type: 'application/json',
      responseMimeType: 'application/json',
      response_schema: consultantResponseSchema,
      responseSchema: consultantResponseSchema,
    };

    const rawText = await askAI(
      `${systemTimeCtx.header}\n${userPrompt}`,
      system,
      {
        model: CONSULTANT_MODEL,
        temperature,
        responseSchema: consultantResponseSchema,
        generationConfig,
        contents: contents.length > 0 ? contents : undefined,
      },
    );

    const cleaned = unwrapJsonText(rawText);
    if (!cleaned) throw new Error('Consultant LLM returned empty response');

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Consultant LLM returned malformed JSON');
    }

    const adviceMessage = asTrimmedString(parsed?.adviceMessage);
    if (!adviceMessage) throw new Error('Consultant response missing adviceMessage');

    let suggestedAction = null;
    if (parsed?.suggestedAction && typeof parsed.suggestedAction === 'object') {
      suggestedAction = parsed.suggestedAction;
    }

    let mealProposals = [];
    if (Array.isArray(parsed?.mealProposals)) {
      mealProposals = parsed.mealProposals;
    }

    return {
      adviceMessage,
      suggestedAction,
      mealProposals,
      rawText,
      model: CONSULTANT_MODEL,
    };
  }
}

export const geminiStructuredClient = new GeminiStructuredClient();
