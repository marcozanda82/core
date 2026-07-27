/**
 * Wave Nutrition — generazione AI dei target periodizzati per Training Block.
 * Utility pura: nessuna UI. Fallback locale da collegare in un secondo step.
 */

import { askAI } from '../../services/aiService';

/** Schema Structured Output richiesto all'AI (e inoltrato a callGemini come responseSchema). */
export const WAVE_NUTRITION_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  required: ['nutritionDays'],
  properties: {
    nutritionDays: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'dayIndex',
          'targetKcal',
          'targetCarb',
          'targetProt',
          'targetFat',
        ],
        properties: {
          dayIndex: { type: 'number' },
          targetKcal: { type: 'number' },
          targetCarb: { type: 'number' },
          targetProt: { type: 'number' },
          targetFat: { type: 'number' },
        },
      },
    },
  },
});

/**
 * System prompt Wave Nutrition (preparatore atletico d'élite).
 * Esportato per test / audit.
 */
export const WAVE_NUTRITION_SYSTEM_PROMPT = `Sei un preparatore atletico e nutrizionista d'élite specializzato in periodizzazione calorica ondulatoria (Wave Nutrition).

Il tuo compito è generare target giornalieri di kcal e macronutrienti per una sequenza di giorni di allenamento, partendo dal TDEE di mantenimento dell'atleta e dall'obiettivo macro del blocco.

REGOLE WAVE NUTRITION (obbligatorie):

1) macroGoal = "bulk"
   - Base = TDEE + surplus complessivo.
   - Giorni "pesi" / workout di spinta: surplus ALTO.
   - Giorni "rest": surplus MINIMO o mantenimento (vicino al TDEE).
   - Cardio/HIIT: surplus moderato, inferiore ai giorni di pesi.

2) macroGoal = "cut"
   - Base = TDEE − deficit complessivo.
   - Giorni "rest" o "cardio": deficit PROFONDO.
   - Giorni "pesi": mantenimento o micro-deficit (proteggi la performance).
   - HIIT: deficit moderato, non quanto il rest.

3) macroGoal = "recomp" (o "maintain" se passato come recomp-like)
   - Media settimanale ≈ TDEE.
   - Giorni di spinta (pesi/HIIT): leggero SURPLUS.
   - Giorni "rest": leggero DEFICIT.
   - Cardio: intorno al TDEE o micro-deficit.

4) MACRONUTRIENTI
   - Proteine: ALTE e QUASI COSTANTI ogni giorno (~2.0 g/kg se il peso è noto; altrimenti ~25–30% delle kcal).
   - Grassi: QUASI COSTANTI (~20–25% delle kcal).
   - Carboidrati: variabile PRINCIPALE — alti nei giorni di workout (pesi/HIIT), più bassi nei rest.

5) VINCOLI NUMERICI
   - targetKcal, targetProt, targetCarb, targetFat devono essere numeri interi ≥ 0.
   - targetKcal tipicamente tra 1200 e 5000.
   - La somma kcal da macro (prot×4 + carb×4 + fat×9) deve essere coerente con targetKcal (±3%).
   - nutritionDays DEVE avere ESATTAMENTE tanti elementi quanti i giorni in input, con dayIndex allineati a quelli forniti.

6) OUTPUT
   - Rispondi SOLO con JSON valido conforme allo schema richiesto.
   - Nessun markdown, nessun testo fuori dal JSON.`;

/**
 * @param {string} raw
 * @returns {object | null}
 */
function parseJsonObjectFromAiText(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const direct = JSON.parse(unfenced);
    if (direct && typeof direct === 'object') return direct;
  } catch {
    /* fall through */
  }

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const sliced = JSON.parse(unfenced.slice(start, end + 1));
    if (sliced && typeof sliced === 'object') return sliced;
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {unknown} day
 * @param {number} fallbackIndex
 * @returns {{ dayIndex: number, type: string, title: string, muscles: string[] }}
 */
function summarizeDayForPrompt(day, fallbackIndex) {
  const src = day && typeof day === 'object' ? day : {};
  const dayIndex = Number.isFinite(Number(src.dayIndex))
    ? Math.floor(Number(src.dayIndex))
    : fallbackIndex;
  const type = String(src.type || 'pesi').trim().toLowerCase() || 'pesi';
  const title = String(src.title || '').trim();
  const muscles = Array.isArray(src.muscles)
    ? src.muscles.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  return { dayIndex, type, title, muscles };
}

/**
 * Valida e normalizza l'output AI.
 * @param {object} parsed
 * @param {Array<object>} daysArray
 * @returns {{ nutritionDays: Array<{ dayIndex: number, targetKcal: number, targetCarb: number, targetProt: number, targetFat: number }> } | null}
 */
function sanitizePeriodizedTargets(parsed, daysArray) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rawDays = Array.isArray(parsed.nutritionDays) ? parsed.nutritionDays : null;
  if (!rawDays || rawDays.length !== daysArray.length) return null;

  const expectedIndexes = daysArray.map((d, i) => (
    Number.isFinite(Number(d?.dayIndex)) ? Math.floor(Number(d.dayIndex)) : i
  ));

  const nutritionDays = [];
  for (let i = 0; i < rawDays.length; i += 1) {
    const row = rawDays[i];
    if (!row || typeof row !== 'object') return null;
    const dayIndex = Number.isFinite(Number(row.dayIndex))
      ? Math.floor(Number(row.dayIndex))
      : expectedIndexes[i];
    if (dayIndex !== expectedIndexes[i]) return null;

    const targetKcal = Math.round(Number(row.targetKcal));
    const targetCarb = Math.round(Number(row.targetCarb));
    const targetProt = Math.round(Number(row.targetProt));
    const targetFat = Math.round(Number(row.targetFat));

    if (![targetKcal, targetCarb, targetProt, targetFat].every((n) => Number.isFinite(n) && n >= 0)) {
      return null;
    }
    if (targetKcal < 1200 || targetKcal > 5000) return null;

    nutritionDays.push({
      dayIndex,
      targetKcal,
      targetCarb,
      targetProt,
      targetFat,
    });
  }

  return { nutritionDays };
}

/**
 * Genera target nutrizionali periodizzati (Wave Nutrition) via Gemini Structured Output.
 * Non collegata alla UI: in caso di errore restituisce null.
 *
 * @param {number} userTdee — TDEE di mantenimento (kcal)
 * @param {string} macroGoal — 'bulk' | 'cut' | 'recomp' | 'maintain'
 * @param {Array<object>} daysArray — giorni del Training Block (type, dayIndex, title, muscles, …)
 * @param {{ weightKg?: number } | null} [options]
 * @returns {Promise<{ nutritionDays: Array<{ dayIndex: number, targetKcal: number, targetCarb: number, targetProt: number, targetFat: number }> } | null>}
 */
export async function generatePeriodizedTargets(
  userTdee,
  macroGoal,
  daysArray,
  options = null,
) {
  try {
    const tdee = Math.round(Number(userTdee));
    if (!Number.isFinite(tdee) || tdee < 1200 || tdee > 5000) return null;
    if (!Array.isArray(daysArray) || daysArray.length < 1) return null;

    const goal = String(macroGoal || 'maintain').trim().toLowerCase() || 'maintain';
    const weightKg = Number(options?.weightKg);
    const weightHint = Number.isFinite(weightKg) && weightKg > 0
      ? Math.round(weightKg * 10) / 10
      : null;

    const daysSummary = daysArray.map((d, i) => summarizeDayForPrompt(d, i));

    const userPrompt = [
      'Genera i target Wave Nutrition per questo blocco di allenamento.',
      '',
      `TDEE_mantenimento_kcal: ${tdee}`,
      `macroGoal: ${goal}`,
      weightHint != null ? `peso_kg: ${weightHint}` : 'peso_kg: sconosciuto (usa 25–30% kcal per le proteine)',
      `giorni_count: ${daysSummary.length}`,
      '',
      'daysArray:',
      JSON.stringify(daysSummary, null, 2),
      '',
      'Restituisci un oggetto JSON con chiave "nutritionDays" (stessa lunghezza di daysArray).',
      'Ogni elemento: dayIndex, targetKcal, targetCarb, targetProt, targetFat (interi).',
    ].join('\n');

    const rawText = await askAI(userPrompt, WAVE_NUTRITION_SYSTEM_PROMPT, {
      temperature: 0.25,
      responseSchema: WAVE_NUTRITION_RESPONSE_SCHEMA,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
      },
    });

    const parsed = parseJsonObjectFromAiText(rawText);
    const sanitized = sanitizePeriodizedTargets(parsed, daysArray);
    return sanitized;
  } catch (err) {
    console.warn('[generatePeriodizedTargets] failed:', err?.message || err);
    return null;
  }
}

export default generatePeriodizedTargets;
