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
  'Sei un parser LETTERALE di diari alimentari. Non sei uno chef.',
  'DEVI estrarre gli alimenti in modo LETTERALE 1:1. La dicitura esatta va conservata: "pasta integrale" resta "pasta integrale", MAI "pasta".',
  'È SEVERAMENTE VIETATO combinare ingredienti, inventare ricette, accorciare i nomi o omettere cibi non menzionati.',
  'Se l\'utente dice "pasta integrale, passato di pomodoro, merluzzo" devi restituire 3 elementi separati. Non fonderli MAI in "merluzzo al pomodoro" o simili.',
  'Se manca la grammatura NON scartare l\'alimento: metti quantita "" e il sistema userà 100g stimati.',
  'Spezza elenchi con virgole, "e", "ed", "+", ";" anche senza grammi.',
  'Togli solo prefissi tipo "ho mangiato", "per pranzo", orari. Non riformulare i nomi.',
  'DEVI SEMPRE restituire un Array JSON PIATTO di oggetti { "nome", "quantita" }.',
  'Vietato annidare alimenti, vietato un oggetto singolo al posto di una lista, vietato wrappare in other keys se non {"alimenti":[...]}.',
  'quantita: stringa così com\'è (es. "80g") oppure "" se assente. Vietato inventare grammi.',
  'Esempio: [{"nome":"pasta integrale","quantita":""},{"nome":"passato di pomodoro","quantita":""},{"nome":"merluzzo","quantita":""}]',
].join(' ');

const GEMINI_DRAFT_SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    alimenti: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          quantita: { type: 'string' },
        },
        required: ['nome'],
      },
    },
  },
  required: ['alimenti'],
};

function parseQuantitaToGrams(quantita) {
  const raw = String(quantita || '').trim().replace(',', '.');
  if (!raw) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function normalizeParsedAlimento(entry) {
  if (typeof entry === 'string') {
    const nome = entry.trim();
    return nome.length >= 2 ? { nome, quantita: '', grams: 100 } : null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const nome = String(entry.nome || entry.foodName || entry.name || '').trim();
  if (nome.length < 2) return null;
  const quantita = String(entry.quantita || entry.qty || entry.grams || '').trim();
  const grams = parseQuantitaToGrams(quantita) ?? parseQuantitaToGrams(entry.grams);
  return { nome, quantita, grams: grams ?? 100 };
}

function parseFoodsJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const arrayStart = fenced.indexOf('[');
  const arrayEnd = fenced.lastIndexOf(']');
  const objStart = fenced.indexOf('{');
  const objEnd = fenced.lastIndexOf('}');
  const candidates = [];
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(fenced.slice(arrayStart, arrayEnd + 1));
  }
  if (objStart >= 0 && objEnd > objStart) {
    candidates.push(fenced.slice(objStart, objEnd + 1));
  }
  candidates.push(fenced);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.alimenti)
          ? parsed.alimenti
          : (Array.isArray(parsed?.foods)
            ? parsed.foods
            : (Array.isArray(parsed?.items) ? parsed.items : [])));
      const names = list.map(normalizeParsedAlimento).filter(Boolean);
      if (names.length > 0) return names;
    } catch {
      /* next candidate */
    }
  }
  return [];
}

/**
 * Spezza una frase vocale/testuale in alimenti LETTERALI tramite Gemini.
 * @param {string} rawText
 * @returns {Promise<Array<{ nome: string, quantita: string, grams: number|null }>>}
 */
export async function parseDraftWithGemini(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  let parsed = [];
  try {
    const { askAI } = await import('../services/aiService.js');
    const raw = await askAI(
      `Frase da spezzare in alimenti LETTERALI (niente ricette inventate):\n"""${text}"""`,
      GEMINI_DRAFT_SPLIT_SYSTEM,
      {
        temperature: 0,
        responseSchema: GEMINI_DRAFT_SPLIT_SCHEMA,
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      },
    );
    parsed = parseFoodsJson(raw);
  } catch (error) {
    console.warn('[parseDraftWithGemini] Gemini split failed', error);
  }

  if (parsed.length === 0) {
    try {
      const { extractBareFoodNamesFromText } = await import(
        '../features/commandTerminal/conversation/mealLogIntent.js'
      );
      parsed = extractBareFoodNamesFromText(text).map((nome) => ({
        nome,
        quantita: '',
        grams: null,
      }));
    } catch {
      parsed = [];
    }
  }

  return parsed;
}
