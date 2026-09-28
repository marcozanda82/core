export const DRAFT_TYPES = Object.freeze({
  meal: 'meal',
  workout: 'workout',
  unknown: 'unknown',
});

const MEAL_KEYWORDS = [
  'mangiato',
  'pranzo',
  'cena',
  'colazione',
  'pane',
  'sardine',
];

const WORKOUT_KEYWORDS = [
  'fatto',
  'allenamento',
  'addominali',
  'pettorali',
  'manubri',
  'corsa',
  'passi',
];

function includesKeyword(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * Pre-categorizza una bozza vocale dal testo intero.
 * @param {string} rawText
 * @returns {'meal' | 'workout' | 'unknown'}
 */
export function inferDraftType(rawText) {
  const haystack = String(rawText || '').toLowerCase();
  if (!haystack.trim()) return DRAFT_TYPES.unknown;
  if (includesKeyword(haystack, MEAL_KEYWORDS)) return DRAFT_TYPES.meal;
  if (includesKeyword(haystack, WORKOUT_KEYWORDS)) return DRAFT_TYPES.workout;
  return DRAFT_TYPES.unknown;
}

export function isDraftType(value) {
  return value === DRAFT_TYPES.meal
    || value === DRAFT_TYPES.workout
    || value === DRAFT_TYPES.unknown;
}

/**
 * Bozza Inbox in attesa di convalida utente.
 * @param {string} rawText
 * @param {{ id?: string, timestamp?: number }} [extras]
 */
export function createPendingInboxDraft(rawText, extras = {}) {
  const text = String(rawText || '').trim();
  const timestamp = Number(extras.timestamp);
  const stamp = Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : Date.now();
  const id = String(extras.id || '').trim()
    || `inbox_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    rawText: text,
    inferredType: inferDraftType(text),
    timestamp: stamp,
    status: 'pending',
  };
}

export function toastMessageForDraftType(inferredType) {
  if (inferredType === DRAFT_TYPES.meal) {
    return 'Bozza pasto salvata in attesa di convalida';
  }
  if (inferredType === DRAFT_TYPES.workout) {
    return 'Bozza allenamento registrata';
  }
  return 'Bozza salvata in attesa di convalida';
}

const GEMINI_DRAFT_SPLIT_SYSTEM = [
  'Sei un parser di diari alimentari.',
  'Dalla frase parlata estrai SOLO gli alimenti o bevande distinti.',
  'Spezza elenchi con virgole, "e", "ed", "+", ";" anche senza grammi.',
  'Togli prefissi tipo "ho mangiato", "per pranzo", orari.',
  'Non unire alimenti diversi in una sola stringa.',
  'Rispondi SOLO con JSON: {"foods":["pasta","pesto","carote"]}.',
].join(' ');

const GEMINI_DRAFT_SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    foods: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['foods'],
};

function parseFoodsJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  try {
    const parsed = JSON.parse(candidate);
    const foods = Array.isArray(parsed?.foods) ? parsed.foods : [];
    return foods.map((name) => String(name || '').trim()).filter((name) => name.length >= 2);
  } catch {
    return [];
  }
}

/**
 * Spezza una frase vocale grezza in alimenti tramite Gemini.
 * Fallback locale se l'AI non risponde.
 * @param {string} rawText
 * @returns {Promise<string[]>}
 */
export async function parseDraftWithGemini(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  let names = [];
  try {
    const { askAI } = await import('../services/aiService.js');
    const raw = await askAI(
      `Frase da spezzare in alimenti:\n"""${text}"""`,
      GEMINI_DRAFT_SPLIT_SYSTEM,
      {
        temperature: 0,
        responseSchema: GEMINI_DRAFT_SPLIT_SCHEMA,
        generationConfig: { temperature: 0, maxOutputTokens: 512 },
      },
    );
    names = parseFoodsJson(raw);
  } catch (error) {
    console.warn('[parseDraftWithGemini] Gemini split failed', error);
  }

  if (names.length === 0) {
    try {
      const { extractBareFoodNamesFromText } = await import(
        '../features/commandTerminal/conversation/mealLogIntent.js'
      );
      names = extractBareFoodNamesFromText(text);
    } catch {
      names = [];
    }
  }

  return names.length > 0 ? names : [text];
}
