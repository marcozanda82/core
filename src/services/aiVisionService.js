import { askAI } from './aiService.js';

/** Allineato a callGemini (GEMINI_MODEL server); override via options.model se la CF lo supporta. */
const VISION_MODEL = 'gemini-3.7-flash';

const LABEL_VISION_SYSTEM = [
  'Sei un estrattore dati.',
  'Leggi questa etichetta nutrizionale e restituisci ESCLUSIVAMENTE un JSON valido con questa struttura:',
  '{"kcal": numero, "pro": numero, "carbo": numero, "fat": numero}.',
  'I valori devono essere riferiti a 100g di prodotto.',
  'Se un valore non è leggibile, metti 0.',
  'Niente markdown, niente testo fuori dal JSON, niente spiegazioni.',
].join(' ');

const LABEL_VISION_USER = [
  'Estrai i macronutrienti per 100g dall\'etichetta nell\'immagine.',
  'Rispondi solo con il JSON richiesto.',
].join(' ');

const MACROS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kcal: { type: 'number' },
    pro: { type: 'number' },
    carbo: { type: 'number' },
    fat: { type: 'number' },
  },
  required: ['kcal', 'pro', 'carbo', 'fat'],
};

function clampNonNeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeMacrosPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    kcal: Math.round(clampNonNeg(raw.kcal ?? raw.cal ?? raw.calories)),
    pro: Math.round(clampNonNeg(raw.pro ?? raw.prot ?? raw.protein) * 10) / 10,
    carbo: Math.round(clampNonNeg(raw.carbo ?? raw.carb ?? raw.carbs ?? raw.carbohydrates) * 10) / 10,
    fat: Math.round(clampNonNeg(raw.fat ?? raw.fatTotal ?? raw.grassi) * 10) / 10,
  };
}

function parseMacrosJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  let candidate = raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidate = fenced[1].trim();

  const brace = candidate.match(/\{[\s\S]*\}/);
  if (brace?.[0]) candidate = brace[0];

  try {
    return normalizeMacrosPayload(JSON.parse(candidate));
  } catch {
    return null;
  }
}

/**
 * Estrae macronutrienti /100g da foto etichetta via Gemini Vision (callGemini).
 *
 * @param {string} base64Image — base64 puro o data URL
 * @param {{ signal?: AbortSignal, model?: string }} [options]
 * @returns {Promise<{ kcal: number, pro: number, carbo: number, fat: number }>}
 */
export async function extractMacrosFromImage(base64Image, options = {}) {
  const raw = String(base64Image || '').trim();
  if (!raw) throw new Error('missing_image');

  const text = await askAI(LABEL_VISION_USER, LABEL_VISION_SYSTEM, {
    model: options.model || VISION_MODEL,
    image: raw,
    temperature: 0,
    generationConfig: { temperature: 0 },
    responseSchema: MACROS_RESPONSE_SCHEMA,
    signal: options.signal,
  });

  const macros = parseMacrosJson(text);
  if (!macros) {
    throw new Error('vision_parse_failed');
  }
  return macros;
}

export { LABEL_VISION_SYSTEM, VISION_MODEL };
