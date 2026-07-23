import { askAI } from './aiService';
import { macroGoalLabel } from '../features/training/waveSchema';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    daily_targets: {
      type: 'object',
      properties: {
        kcal: { type: 'number' },
        pro: { type: 'number' },
        cho: { type: 'number' },
        fat: { type: 'number' },
      },
      required: ['kcal', 'pro', 'cho', 'fat'],
    },
    micro_notes: { type: 'string' },
    focus_giornata: { type: 'string' },
  },
  required: ['daily_targets', 'micro_notes', 'focus_giornata'],
};

function buildSystemPrompt(macroGoal) {
  const goalLabel = macroGoalLabel(macroGoal);
  return [
    'Sei il motore nutrizionale di KentuOS. Il tuo compito è calcolare i target di macronutrienti giornalieri e fornire indicazioni sui micronutrienti.',
    `L'obiettivo principale dell'utente in questa fase è: ${goalLabel}. Adatta i macro (specialmente il deficit o surplus calorico base) per rispettare questo obiettivo PRIMA di applicare il moltiplicatore giornaliero dell'onda.`,
    "Devi calcolare le Kcal totali moltiplicando le Kcal Base (già orientate all'obiettivo globale) per il Moltiplicatore TDEE dell'onda.",
    'Mantieni le proteine ottimali per uno sportivo (circa 2-2.2g/kg di peso corporeo), regola i carboidrati in base all\'intensità e al tipo di allenamento, e i grassi di conseguenza.',
    'Restituisci SOLO un oggetto JSON.',
  ].join(' ');
}

function unwrapJsonText(rawText) {
  const text = String(rawText ?? '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function roundMacro(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

/**
 * @param {unknown} parsed
 */
export function normalizeAiTargetPayload(parsed) {
  const targets = parsed?.daily_targets && typeof parsed.daily_targets === 'object'
    ? parsed.daily_targets
    : {};
  return {
    daily_targets: {
      kcal: roundMacro(targets.kcal),
      pro: roundMacro(targets.pro ?? targets.prot ?? targets.protein),
      cho: roundMacro(targets.cho ?? targets.carb ?? targets.carbs),
      fat: roundMacro(targets.fat ?? targets.fatTotal),
    },
    micro_notes: String(parsed?.micro_notes ?? '').trim(),
    focus_giornata: String(parsed?.focus_giornata ?? '').trim(),
  };
}

/**
 * Genera target metabolici giornalieri via Gemini 3.6 Flash (JSON forzato).
 *
 * @param {number} baseKcal
 * @param {number} userWeight — kg
 * @param {{
 *   dayIndex?: number,
 *   title?: string,
 *   type?: string,
 *   tdeeMultiplier?: number,
 *   waveName?: string,
 *   macroGoal?: string,
 *   timeTag?: string | null,
 *   exactTime?: string | null,
 * }} waveContext
 */
export async function generateDailyMetabolicTargets(baseKcal, userWeight, waveContext = {}) {
  const kcal = Number(baseKcal);
  const weight = Number(userWeight);
  const multiplier = Number(waveContext?.tdeeMultiplier);
  const safeKcal = Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 2000;
  const safeWeight = Number.isFinite(weight) && weight > 0 ? Math.round(weight * 10) / 10 : 75;
  const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const macroGoal = String(waveContext?.macroGoal || '').trim() || 'mantenimento';
  const goalLabel = macroGoalLabel(macroGoal);
  const exactTime = String(waveContext?.exactTime || '').trim() || 'n/d';
  const timeTag = String(waveContext?.timeTag || '').trim() || 'n/d';

  const systemPrompt = buildSystemPrompt(macroGoal);

  const userPrompt = [
    'Calcola i target metabolici di oggi con questi dati:',
    `- Obiettivo globale (macroGoal): ${goalLabel} (${macroGoal})`,
    `- Kcal Base: ${safeKcal}`,
    `- Peso corporeo: ${safeWeight} kg`,
    `- Onda: ${String(waveContext?.waveName || 'n/d')}`,
    `- Giorno microciclo: ${Number(waveContext?.dayIndex) || 0}`,
    `- Titolo sessione: ${String(waveContext?.title || 'n/d')}`,
    `- Tipo giorno: ${String(waveContext?.type || 'n/d')}`,
    `- Fascia allenamento (timeTag): ${timeTag}`,
    `- Orario esatto allenamento: ${exactTime}`,
    `- Moltiplicatore TDEE: ${safeMult}`,
    '',
    'Prima orienta il budget calorico all’obiettivo globale, poi applica: Kcal totali ≈ Kcal Base × Moltiplicatore TDEE.',
    'Considera l’orario della sessione per distribuire i carboidrati (più CHO intorno al workout).',
    'Restituisci SOLO JSON con daily_targets { kcal, pro, cho, fat }, micro_notes, focus_giornata.',
  ].join('\n');

  const rawText = await askAI(userPrompt, systemPrompt, {
    model: 'gemini-3.6-flash',
    temperature: 0.35,
    responseSchema: RESPONSE_SCHEMA,
    generationConfig: {
      temperature: 0.35,
      responseMimeType: 'application/json',
      response_mime_type: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      response_schema: RESPONSE_SCHEMA,
      maxOutputTokens: 1024,
    },
  });

  const cleaned = unwrapJsonText(rawText);
  if (!cleaned) throw new Error('Risposta AI vuota per i target metabolici.');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Risposta AI non è JSON valido.');
  }

  const normalized = normalizeAiTargetPayload(parsed);
  if (!normalized.daily_targets.kcal) {
    normalized.daily_targets.kcal = Math.round(safeKcal * safeMult);
  }
  return normalized;
}
