import { TRACKER_STORICO_KEY } from '../../../coreEngine';
import {
  computeDayMaxFastingWindowHours,
  shiftDateStr,
} from '../../../utils/dayTrackingStatus';
import { flattenLogToFoodEntries } from '../../mealBuilder/hooks/usePredictiveFoodBlocks';
import {
  clamp01,
  MUSCLE_CYLINDER_IDS,
  sanitizeFourCylinderState,
} from '../../salaComandi/engines/fourCylinderEngine';
import { resolveEntryMealConsumedAtMs } from '../../salaComandi/utils/mealConsumedTime';
import { getHoursSinceLastMeal } from '../../salaComandi/utils/metabolicStateEngine';
import { DEFAULT_SLEEP_HOURS } from './sleepLogs';
import {
  LONGEVITY_WINDOW_DAYS,
  PROGRESSION_MIN_NUTRITION_DAY_KCAL,
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight as resolveMorningSleepFromHistory,
} from './saluteHistorySeries';
import { countSufficientlyStimulatedPillars } from './muscleSpillover.js';
import { computeAverageMuscleStimulus } from './muscleTelemetryModel.js';

export const SLEEP_TARGET_HOURS = DEFAULT_SLEEP_HOURS;
export { REFERENCE_HEIGHT_CM, PROGRESSION_MIN_NUTRITION_DAY_KCAL };
export { resolveMorningSleepFromHistory as resolveMorningSleepForInsight };

/** Soglia clinica WHtR: girovita critico = altezza × 0.5 (multi-utente). */
export const WHTR_LIMIT_RATIO = 0.5;

/** Max punti per pilastro Longevità (4 pilastri × 25 = 100). */
export const LONGEVITY_PILLAR_MAX = 25;

/** Target cardio (min) nella finestra 14gg per saturare il pilastro. */
export const LONGEVITY_CARDIO_TARGET_MIN = 150;

/** Target sonno (h) per saturare il pilastro recupero. */
export const LONGEVITY_SLEEP_TARGET_H = 7;

export {
  MUSCLE_STIMULUS_SUFFICIENT_TOTAL,
  muscleSpilloverMatrix,
  SPILLOVER_MUSCLE_KEYS,
  createEmptyMuscleSpilloverStimulus,
  resolveSpilloverMuscleKey,
  applySpilloverSession,
  finalizeMuscleSpilloverTotals,
  foldSpilloverStimulusToPillars,
  countSufficientlyStimulatedPillars,
  muscleStimulusBarSegments,
} from './muscleSpillover.js';

/**
 * Limite girovita (cm) personalizzato: altezza × 0.5.
 * @param {number} [heightCm]
 * @returns {number}
 */
export function waistLimitCmFromHeight(heightCm = REFERENCE_HEIGHT_CM) {
  const userHeight = Number(heightCm) > 0 ? Number(heightCm) : REFERENCE_HEIGHT_CM;
  return Math.round(userHeight * WHTR_LIMIT_RATIO * 10) / 10;
}

/**
 * Media residuo muscolare 0–1 (1 = cilindri pieni / fatica sistemica alta).
 * @param {unknown} fourCylinder
 * @returns {number | null}
 */
export function averageMuscleResidual(fourCylinder) {
  const safe = fourCylinder ? sanitizeFourCylinderState(fourCylinder) : null;
  if (!safe?.decay) return null;
  let sum = 0;
  let n = 0;
  for (const id of MUSCLE_CYLINDER_IDS) {
    const v = Number(safe.decay[id]);
    if (!Number.isFinite(v)) continue;
    sum += clamp01(v);
    n += 1;
  }
  if (n === 0) return null;
  return sum / n;
}

/**
 * Waist-to-Height Ratio. Altezza dal profilo utente; fallback 174 cm solo se mancante.
 * @param {number | null | undefined} waistCm
 * @param {number} [heightCm]
 * @returns {number | null}
 */
export function computeWaistToHeightRatio(waistCm, heightCm = REFERENCE_HEIGHT_CM) {
  const w = Number(waistCm);
  const userHeight = Number(heightCm) > 0 ? Number(heightCm) : REFERENCE_HEIGHT_CM;
  if (!Number.isFinite(w) || w <= 0) return null;
  return Math.round((w / userHeight) * 1000) / 1000;
}

/**
 * Rischio glicemico/metabolico 0–100.
 * Integra digiuno, residuo muscolare e WHtR (girovita/altezza).
 * WHtR &lt; 0.5 → bias verde; digiuno lungo + WHtR buono → verde brillante.
 *
 * @param {{
 *   hoursFasted?: number | null,
 *   fourCylinder?: unknown,
 *   waistCm?: number | null,
 *   heightCm?: number,
 * }} args
 */
export function computeGlycemicRiskPercent({
  hoursFasted = null,
  fourCylinder = null,
  waistCm = null,
  heightCm = REFERENCE_HEIGHT_CM,
} = {}) {
  const hf = Math.max(0, Number(hoursFasted) || 0);
  const muscleRaw = averageMuscleResidual(fourCylinder);
  const m = muscleRaw == null ? 0.12 : clamp01(muscleRaw);
  const whtr = computeWaistToHeightRatio(waistCm, heightCm);

  /** Base rischio da digiuno. */
  let base;
  if (hf <= 0) base = 88;
  else if (hf < 3) base = 88 - (hf / 3) * 16;
  else if (hf < 5) base = 72 - ((hf - 3) / 2) * 22;
  else if (hf < 8) base = 50 - ((hf - 5) / 3) * 12;
  else if (hf < 12) base = 38 - ((hf - 8) / 4) * 12;
  else if (hf < 16) base = 26 - ((hf - 12) / 4) * 10;
  else base = Math.max(8, 16 - (hf - 16) * 0.6);

  const muscleRelief = m * 18;

  // WHtR: <0.5 salutogeno; ≥0.5 / ≥0.6 peggiora la base
  let whtrRelief = 0;
  let whtrPenalty = 0;
  if (whtr != null) {
    if (whtr < 0.46) whtrRelief = 22;
    else if (whtr < 0.5) whtrRelief = 14;
    else if (whtr < 0.55) whtrPenalty = 8;
    else if (whtr < 0.6) whtrPenalty = 16;
    else whtrPenalty = 24;
  }

  let risk = base - muscleRelief - whtrRelief + whtrPenalty;

  // Digiuno lungo + WHtR buono → spinta nel verde brillante
  if (whtr != null && whtr < 0.5 && hf >= 12) {
    risk = Math.min(risk, 18);
  } else if (whtr != null && whtr < 0.5 && hf >= 8) {
    risk = Math.min(risk, 28);
  }

  const inDeepRed = hf < 3 && m <= 0.05 && (whtr == null || whtr >= 0.5);
  if (inDeepRed) {
    const emptiness = 1 - m / 0.05;
    risk = Math.max(risk, 78 + emptiness * 10);
  } else if (!(whtr != null && whtr < 0.5 && hf >= 8)) {
    risk = Math.min(risk, 68);
  }

  const riskPercent = Math.max(0, Math.min(100, Math.round(risk)));
  return {
    riskPercent,
    fastingFactor: Math.min(1, hf / 16),
    muscleFactor: m,
    whtr,
    protection: clamp01(1 - riskPercent / 100),
  };
}

/** Cardio 14gg sotto metà del target longevità (150 min) → sensibilità ridotta. */
export const GLYCEMIC_LOW_CARDIO_MINUTES_14D = 75;

/** Media sonno 14gg sotto 6h → sensibilità ridotta. */
export const GLYCEMIC_LOW_SLEEP_AVG_HOURS = 6;

function mealTimesForDay(fullHistory, dayKey) {
  if (!fullHistory || !dayKey || typeof fullHistory !== 'object') return null;
  const node = fullHistory[TRACKER_STORICO_KEY(dayKey)];
  return node?.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : null;
}

/**
 * Ore dall'ultimo pasto: preferisce oggi (activeLog live), poi digiuno SSOT, poi storico.
 * @returns {number | null}
 */
export function resolveHoursSinceLastMealForGlycemic({
  activeLog = [],
  activeLogIsToday = false,
  todayDate = '',
  fullHistory = null,
  hoursFasted = null,
  now = new Date(),
} = {}) {
  const today = String(todayDate || '').slice(0, 10);
  const referenceMs = now.getTime();

  if (activeLogIsToday && Array.isArray(activeLog) && activeLog.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
    const mealTimesObj = mealTimesForDay(fullHistory, today);
    let lastConsumedMs = null;
    flattenLogToFoodEntries(activeLog).forEach((entry) => {
      const consumedAt = resolveEntryMealConsumedAtMs(entry, today, mealTimesObj);
      if (!consumedAt || consumedAt > referenceMs) return;
      if (lastConsumedMs == null || consumedAt > lastConsumedMs) {
        lastConsumedMs = consumedAt;
      }
    });
    if (lastConsumedMs != null) {
      return Math.max(0, (referenceMs - lastConsumedMs) / 3600000);
    }
  }

  const hf = Number(hoursFasted);
  if (Number.isFinite(hf) && hf >= 0) return hf;

  const fromHistory = getHoursSinceLastMeal(fullHistory, activeLog, {
    now,
    anchorDate: today || now.toISOString().slice(0, 10),
  });
  return fromHistory != null ? fromHistory : null;
}

function formatHoursAgoForAcute(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 0) return '—';
  if (h < 1) {
    const mins = Math.max(1, Math.round(h * 60));
    return `${mins} min fa`;
  }
  const rounded = Math.round(h * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h fa` : `${rounded.toFixed(1)}h fa`;
}

/**
 * Testi spiegazione rischio glicemico (trend 14gg + acuto + WHtR).
 *
 * @param {{
 *   sleepAvgHours?: number | null,
 *   cardioMinutesTotal?: number,
 *   hoursFasted?: number | null,
 *   activeLog?: Array,
 *   activeLogIsToday?: boolean,
 *   todayDate?: string,
 *   fullHistory?: object | null,
 *   whtr?: number | null,
 *   windowDays?: number,
 * }} args
 */
export function buildGlycemicRiskBreakdown(args = {}) {
  const {
    sleepAvgHours = null,
    cardioMinutesTotal = 0,
    hoursFasted = null,
    activeLog = [],
    activeLogIsToday = false,
    todayDate = '',
    fullHistory = null,
    whtr = null,
    windowDays = LONGEVITY_WINDOW_DAYS,
  } = args;

  const sleepAvg = Number(sleepAvgHours);
  const cardioMins = Math.max(0, Number(cardioMinutesTotal) || 0);
  const lowSleep = Number.isFinite(sleepAvg) && sleepAvg > 0 && sleepAvg < GLYCEMIC_LOW_SLEEP_AVG_HOURS;
  const lowCardio = cardioMins < GLYCEMIC_LOW_CARDIO_MINUTES_14D;
  const lowSensitivity = lowSleep || lowCardio;

  const sensitivityLine = lowSensitivity
    ? 'Sensibilità ridotta: carenza di sonno o basso volume cardio negli ultimi giorni.'
    : 'Buona sensibilità: il riposo e il cardio recenti mantengono il metabolismo attivo.';

  const hoursSince = resolveHoursSinceLastMealForGlycemic({
    activeLog,
    activeLogIsToday,
    todayDate,
    fullHistory,
    hoursFasted,
  });

  let acuteLine;
  if (hoursSince == null) {
    acuteLine = 'Nessun pasto recente nel diario: stato acuto neutro fino al prossimo log.';
  } else if (hoursSince < 4) {
    acuteLine = `Fase post-prandiale (${formatHoursAgoForAcute(hoursSince)}). Insulina circolante ancora attiva.`;
  } else if (hoursSince < 12) {
    acuteLine = 'Fase di digiuno iniziale. L\'insulina sta tornando ai livelli basali.';
  } else {
    acuteLine = 'Digiuno profondo. Ottima flessibilità metabolica in corso.';
  }

  const whtrNum = Number(whtr);
  let structuralLine;
  if (Number.isFinite(whtrNum) && whtrNum > 0) {
    structuralLine = whtrNum <= WHTR_LIMIT_RATIO
      ? 'Ottimale (WHtR < 0.5). Nessuna interferenza dal grasso viscerale.'
      : 'Attenzione: il girovita aggiunge una leggera resistenza metabolica di base.';
  } else {
    structuralLine = 'WHtR non disponibile: aggiorna girovita e altezza per il filtro strutturale.';
  }

  return {
    lowSensitivity,
    hoursSinceLastMeal: hoursSince,
    windowDays,
    sleepAvgHours: Number.isFinite(sleepAvg) && sleepAvg > 0 ? sleepAvg : null,
    cardioMinutesTotal: cardioMins,
    whtr: Number.isFinite(whtrNum) ? whtrNum : null,
    lines: {
      sensitivity: sensitivityLine,
      acute: acuteLine,
      structural: structuralLine,
    },
  };
}

const ANTI_INFLAM_FOOD_RE = /olio\s*(evo|extra)|extravergine|salmone|merluzzo|tonno|sgombro|pesce|mandorl|noci|nocciol|avocado|spinaci|broccoli|mirtill|curcuma|zenzero|insalata|verdura|verdure|rucola|cavolo|kale|lino|chia|omega/i;
const GLYCEMIC_GOOD_FOOD_RE = /integrale|avena|legum|lenticch|ceci|fagiol|quinoa|farro|orzo|fibre|broccoli|zucchine|spinaci|insalata|verdura|verdure|patata\s*dolce|riso\s*basmati|yoghurt?\s*greco|yogurt\s*greco/i;
const ULTRA_PROCESSED_FOOD_RE = /snack|patatin|coca|sprite|fanta|brioche|merendin|nutella|gelato|succo|bibita|hamburger|wurstel|würstel|hot\s*dog|chips|dolcium|caramell|energy\s*drink|bevanda\s*zuccher/i;
const NOBLE_PROTEIN_FOOD_RE = /merluzzo|salmone|tonno|pesce|uova|uovo|pollo|tacchino|manzo|vitello|yogurt|yoghurt|skyr|ricotta|fiocchi|tofu|tempeh|legum|lenticch|ceci|fagiol|whey|proteine/i;

/**
 * Estrae nomi alimento da un dayLog (meal items / food entries).
 * @param {unknown} dayLog
 * @returns {string[]}
 */
export function collectFoodNamesFromDayLog(dayLog) {
  const names = [];
  if (!Array.isArray(dayLog)) return names;
  for (const entry of dayLog) {
    if (!entry || typeof entry !== 'object') continue;
    const type = String(entry.type || '').toLowerCase();
    if (type === 'meal' && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        const n = String(item?.name || item?.foodName || item?.label || '').trim();
        if (n) names.push(n);
      }
      continue;
    }
    if (type === 'food' || type === 'recipe' || type === 'single' || !type) {
      const n = String(entry.name || entry.foodName || entry.label || '').trim();
      if (n) names.push(n);
    }
  }
  return names;
}

/**
 * Stima punti qualità cibo (A≤8 + B≤7) da nomi + eventuali label health in foodDb.
 * @param {{
 *   foodNames?: string[],
 *   dayLog?: unknown,
 *   foodDatabase?: Record<string, object>|null,
 * }} [input]
 * @returns {{ antiInflammatoryPts: number, glycemicPts: number, nobleProteinSignal: boolean }}
 */
export function estimateFoodQualityPillarPoints(input = {}) {
  const names = [
    ...(Array.isArray(input.foodNames) ? input.foodNames : []),
    ...collectFoodNamesFromDayLog(input.dayLog),
  ]
    .map((n) => String(n || '').trim())
    .filter(Boolean);

  const db = input.foodDatabase && typeof input.foodDatabase === 'object'
    ? input.foodDatabase
    : null;

  let antiHits = 0;
  let glyHits = 0;
  let ultraHits = 0;
  let nobleProteinSignal = false;
  let labeledAnti = 0;
  let labeledPro = 0;
  let labeledNovaPenalty = 0;
  let labeledCount = 0;

  for (const name of names) {
    if (ANTI_INFLAM_FOOD_RE.test(name)) antiHits += 1;
    if (GLYCEMIC_GOOD_FOOD_RE.test(name)) glyHits += 1;
    if (ULTRA_PROCESSED_FOOD_RE.test(name)) ultraHits += 1;
    if (NOBLE_PROTEIN_FOOD_RE.test(name)) nobleProteinSignal = true;

    if (!db) continue;
    const key = Object.keys(db).find((k) => {
      const row = db[k];
      const rowName = String(row?.name || row?.foodName || k || '').toLowerCase();
      return rowName && name.toLowerCase().includes(rowName.slice(0, Math.min(12, rowName.length)));
    });
    const row = key ? db[key] : null;
    if (!row) continue;
    labeledCount += 1;
    const inflam = Number(row.inflammationFactor);
    if (inflam === -1) labeledAnti += 1;
    if (inflam === 1) labeledPro += 1;
    const nova = Number(row.novaScore);
    if (nova >= 4) labeledNovaPenalty += 1;
    else if (nova <= 2) {
      antiHits += 0.5;
      glyHits += 0.35;
    }
  }

  // Nessun cibo: baseline neutra (non azzerare A+B → evita crollo a “solo proteine”).
  if (names.length === 0) {
    return { antiInflammatoryPts: 4, glycemicPts: 3, nobleProteinSignal: false };
  }

  let anti = Math.min(8, 2 + antiHits * 1.6 + labeledAnti * 1.2);
  anti -= ultraHits * 1.5 + labeledPro * 1.2 + labeledNovaPenalty * 1.5;
  anti = Math.max(0, Math.min(8, Math.round(anti)));

  let gly = Math.min(7, 2 + glyHits * 1.4);
  gly -= ultraHits * 1.4 + labeledNovaPenalty;
  if (labeledCount > 0 && labeledAnti >= labeledPro) gly += 1;
  gly = Math.max(0, Math.min(7, Math.round(gly)));

  return {
    antiInflammatoryPts: anti,
    glycemicPts: gly,
    nobleProteinSignal,
  };
}

/**
 * Stima nutrizione clinica 0–25 senza Insight AI (olistica: A8+B7+C5+D5).
 * @param {{
 *   proteinGrams?: number|null,
 *   proteinTarget?: number|null,
 *   fastingHoursAvg?: number|null,
 *   foodNames?: string[],
 *   dayLog?: unknown,
 *   foodDatabase?: Record<string, object>|null,
 * }} [input]
 */
export function estimateDeterministicLongevityNutrition(input = {}) {
  const prot = Number(input.proteinGrams);
  const target = Number(input.proteinTarget);
  const fasting = Number(input.fastingHoursAvg);
  const quality = estimateFoodQualityPillarPoints(input);

  // C) Proteine funzionali — max 5 (pieno se ~≥75% target o fonti nobili)
  let proteinPoints = 2;
  let proteinStatus = 'MODERATE';
  if (Number.isFinite(prot) && Number.isFinite(target) && target > 0) {
    const ratio = prot / target;
    if (ratio >= 0.85 || (ratio >= 0.7 && quality.nobleProteinSignal)) {
      proteinPoints = 5;
      proteinStatus = 'OPTIMAL';
    } else if (ratio >= 0.7 || (ratio >= 0.55 && quality.nobleProteinSignal)) {
      proteinPoints = 4;
      proteinStatus = 'MODERATE';
    } else if (ratio >= 0.5) {
      proteinPoints = 3;
      proteinStatus = 'MODERATE';
    } else if (ratio >= 0.35) {
      proteinPoints = 2;
      proteinStatus = 'LOW';
    } else {
      proteinPoints = 1;
      proteinStatus = 'LOW';
    }
  } else if (quality.nobleProteinSignal) {
    proteinPoints = 4;
    proteinStatus = 'MODERATE';
  } else if (Number.isFinite(prot) && prot >= 90) {
    proteinPoints = 3;
    proteinStatus = 'MODERATE';
  } else if (Number.isFinite(prot) && prot > 0) {
    proteinPoints = 2;
    proteinStatus = 'LOW';
  } else {
    proteinPoints = 1;
    proteinStatus = 'LOW';
  }

  // D) Digiuno / timing — max 5
  let fastingPoints = 3;
  let fastingWindowEvaluation = 'GOOD';
  if (Number.isFinite(fasting) && fasting > 0) {
    if (fasting >= 14) {
      fastingPoints = 5;
      fastingWindowEvaluation = 'OPTIMAL';
    } else if (fasting >= 12) {
      fastingPoints = 4;
      fastingWindowEvaluation = 'GOOD';
    } else if (fasting >= 10) {
      fastingPoints = 2;
      fastingWindowEvaluation = 'POOR';
    } else {
      fastingPoints = 1;
      fastingWindowEvaluation = 'POOR';
    }
  }

  const antiPts = quality.antiInflammatoryPts;
  const glyPts = quality.glycemicPts;
  const score = Math.max(
    0,
    Math.min(LONGEVITY_PILLAR_MAX, Math.round(antiPts + glyPts + proteinPoints + fastingPoints)),
  );

  const qualityStrong = antiPts + glyPts >= 10;
  const clinicalNoteStrength = qualityStrong
    ? 'Profilo antinfiammatorio e glicemico solido dai log (grassi buoni / fibre / alimenti minimamente processati).'
    : proteinStatus === 'OPTIMAL'
      ? 'Quota proteica funzionale in linea: supporto alla massa magra.'
      : 'Base nutrizionale stimata dai log: genera l\'Insight Clinico per un giudizio clinico completo.';

  let clinicalNoteBottleneck = 'Completa l\'Insight Clinico AI per affinare qualità antinfiammatoria e timing.';
  if (proteinStatus === 'LOW' && qualityStrong) {
    clinicalNoteBottleneck = 'Margine di miglioramento: incrementa leggermente la quota proteica per sostenere la massa magra.';
  } else if (fastingWindowEvaluation === 'POOR') {
    clinicalNoteBottleneck = 'Finestra di digiuno notturno corta: punta a 12–14h.';
  } else if (proteinStatus === 'LOW') {
    clinicalNoteBottleneck = 'Aderenza proteica ancora insufficiente rispetto al target funzionale.';
  } else if (!qualityStrong) {
    clinicalNoteBottleneck = 'Aumenta alimenti antinfiammatori e fonti di fibre per consolidare il pilastro.';
  }

  return {
    score,
    proteinStatus,
    fastingWindowEvaluation,
    clinicalNoteStrength,
    clinicalNoteBottleneck,
    source: 'deterministic_fallback',
    pillarParts: {
      antiInflammatoryPts: antiPts,
      glycemicPts: glyPts,
      proteinPts: proteinPoints,
      fastingPts: fastingPoints,
    },
  };
}

/**
 * Risolve lo score nutrizione 0–25: media Insight AI (3–7gg) → singolo Insight → fallback.
 * @param {{
 *   longevityNutrition?: object|null,
 *   recentNutritionScores?: number[],
 *   proteinGrams?: number|null,
 *   proteinTarget?: number|null,
 *   fastingHoursAvg?: number|null,
 *   foodNames?: string[],
 *   dayLog?: unknown,
 *   foodDatabase?: Record<string, object>|null,
 * }} [input]
 */
export function resolveLongevityNutritionPillar(input = {}) {
  const recent = (Array.isArray(input.recentNutritionScores) ? input.recentNutritionScores : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (recent.length > 0) {
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const score = Math.max(0, Math.min(LONGEVITY_PILLAR_MAX, Math.round(avg)));
    const fromAi = input.longevityNutrition && typeof input.longevityNutrition === 'object'
      ? input.longevityNutrition
      : null;
    return {
      score,
      proteinStatus: fromAi?.proteinStatus || (score >= 18 ? 'OPTIMAL' : score >= 10 ? 'MODERATE' : 'LOW'),
      fastingWindowEvaluation: fromAi?.fastingWindowEvaluation || (score >= 18 ? 'OPTIMAL' : score >= 10 ? 'GOOD' : 'POOR'),
      clinicalNoteStrength: fromAi?.clinicalNoteStrength
        || 'Media nutrizione clinica dagli Insight recenti: profilo alimentare in monitoraggio.',
      clinicalNoteBottleneck: fromAi?.clinicalNoteBottleneck
        || 'Continua a generare Insight Clinico per affinare il pilastro nutrizione.',
      source: 'ai_average',
      sampleSize: recent.length,
    };
  }

  const singleScore = Number(input.longevityNutrition?.score);
  if (Number.isFinite(singleScore)) {
    const ln = input.longevityNutrition;
    return {
      score: Math.max(0, Math.min(LONGEVITY_PILLAR_MAX, Math.round(singleScore))),
      proteinStatus: ln.proteinStatus || 'MODERATE',
      fastingWindowEvaluation: ln.fastingWindowEvaluation || 'GOOD',
      clinicalNoteStrength: String(ln.clinicalNoteStrength || '').trim()
        || 'Insight Clinico: nutrizione valutata sul giorno di analisi.',
      clinicalNoteBottleneck: String(ln.clinicalNoteBottleneck || '').trim()
        || 'Verifica qualità antinfiammatoria, fibre e finestra digiuno.',
      source: 'ai_single',
      sampleSize: 1,
    };
  }

  return {
    ...estimateDeterministicLongevityNutrition({
      proteinGrams: input.proteinGrams,
      proteinTarget: input.proteinTarget,
      fastingHoursAvg: input.fastingHoursAvg,
      foodNames: input.foodNames,
      dayLog: input.dayLog,
      foodDatabase: input.foodDatabase,
    }),
    sampleSize: 0,
  };
}

/**
 * Punteggio Longevità 0–100 — 4 pilastri × 25:
 * Cardio · Forza · Sonno · Nutrizione Clinica & Digiuno (+ filtro WHtR sul totale).
 *
 * @param {{
 *   cardioMinutesTotal?: number,
 *   uniqueMuscleGroups?: number,
 *   muscleStimulusPillars?: Record<string, { direct?: number, indirect?: number, total?: number }> | null,
 *   pesiSessionCount?: number,
 *   sleepAvgHours?: number | null,
 *   waistCm?: number | null,
 *   daysSampled?: number,
 *   sleepNights?: number,
 *   cardioDays?: number,
 *   pesiDays?: number,
 *   heightCm?: number,
 *   height?: number,
 *   windowDays?: number,
 *   longevityNutrition?: object|null,
 *   recentNutritionScores?: number[],
 *   proteinGrams?: number|null,
 *   proteinTarget?: number|null,
 *   fastingHoursAvg?: number|null,
 *   foodNames?: string[],
 *   dayLog?: unknown,
 *   foodDatabase?: Record<string, object>|null,
 * }} input
 */
export function calculateLongevityScore(input = {}) {
  const {
    cardioMinutesTotal = 0,
    uniqueMuscleGroups = null,
    muscleStimulusPillars = null,
    pesiSessionCount = 0,
    sleepAvgHours = null,
    waistCm = null,
    heightCm = null,
    height = null,
    longevityNutrition = null,
    recentNutritionScores = null,
    proteinGrams = null,
    proteinTarget = null,
    fastingHoursAvg = null,
    foodNames = null,
    dayLog = null,
    foodDatabase = null,
  } = input && typeof input === 'object' ? input : {};

  const rawHeight = heightCm ?? height;
  const userHeight = Number(rawHeight) > 0 ? Number(rawHeight) : REFERENCE_HEIGHT_CM;
  const criticalThreshold = userHeight * WHTR_LIMIT_RATIO;
  const pillarMax = LONGEVITY_PILLAR_MAX;

  // —— Cardio: target 150 min nei 14 giorni ——
  const cardioMins = Math.max(0, Number(cardioMinutesTotal) || 0);
  const cardioScoreRaw = Math.min((cardioMins / LONGEVITY_CARDIO_TARGET_MIN) * pillarMax, pillarMax);
  const cardioScore = Number.isFinite(cardioScoreRaw) ? cardioScoreRaw : 0;

  // —— Pesi: pilastri con total (direct+spillover) >= 50 ——
  const fromSpillover = muscleStimulusPillars
    ? countSufficientlyStimulatedPillars(muscleStimulusPillars)
    : null;
  let uniqueGroups = fromSpillover != null
    ? fromSpillover.count
    : Number(uniqueMuscleGroups);
  if (!Number.isFinite(uniqueGroups) || uniqueGroups < 0) {
    uniqueGroups = Math.min(5, Math.max(0, Number(pesiSessionCount) || 0));
  }
  uniqueGroups = Math.max(0, Math.min(5, uniqueGroups));
  const weightsScore = (uniqueGroups / 5) * pillarMax;

  // —— Sonno: media notti disponibili vs target 7h ——
  const sleepAvgNum = Number(sleepAvgHours);
  const sleepAvg = Number.isFinite(sleepAvgNum) && sleepAvgNum > 0 ? sleepAvgNum : null;
  const sleepScore = sleepAvg != null
    ? Math.min((sleepAvg / LONGEVITY_SLEEP_TARGET_H) * pillarMax, pillarMax)
    : 0;

  // —— Nutrizione clinica & digiuno (Insight AI o fallback) ——
  const nutritionPillar = resolveLongevityNutritionPillar({
    longevityNutrition,
    recentNutritionScores,
    proteinGrams,
    proteinTarget,
    fastingHoursAvg,
    foodNames,
    dayLog,
    foodDatabase,
  });
  const nutritionScore = Number(nutritionPillar.score) || 0;

  const baseScore = Math.max(
    0,
    Math.min(100, cardioScore + weightsScore + sleepScore + nutritionScore),
  );

  // —— Filtro strutturale WHtR ——
  const waist = Number(waistCm);
  let coefficient = 1.0;
  if (Number.isFinite(waist) && waist > 0) {
    if (waist <= criticalThreshold) {
      coefficient = 1.0;
    } else {
      const extraCm = waist - criticalThreshold;
      coefficient = Math.max(1.0 - (extraCm * 0.05), 0.1);
    }
  }

  let finalScore = Math.round(baseScore * coefficient);
  if (!Number.isFinite(finalScore)) finalScore = 0;
  finalScore = Math.max(0, Math.min(100, finalScore));

  return {
    finalScore,
    baseScore: Math.round(baseScore * 10) / 10,
    breakdown: {
      cardioScore,
      weightsScore,
      sleepScore,
      nutritionScore,
      longevityNutrition: nutritionPillar,
      whtrMultiplier: Math.round(coefficient * 1000) / 1000,
      cardioMins: Math.round(cardioMins),
      uniqueGroups,
      sleepAvg,
      userHeight: Math.round(userHeight * 10) / 10,
      criticalThreshold: Math.round(criticalThreshold * 10) / 10,
      pillarMax,
      ...(muscleStimulusPillars ? { muscleStimulusPillars } : {}),
    },
  };
}

/**
 * @deprecated
 */
export function computeLongevityScore(args = {}) {
  const result = calculateLongevityScore({
    sleepAvgHours: args.sleepHours ?? null,
    waistCm: args.waistCm ?? null,
    cardioMinutesTotal: args.cardioMinutesTotal ?? 0,
    pesiSessionCount: args.pesiSessionCount ?? 0,
    daysSampled: args.daysSampled ?? 0,
    heightCm: args.heightCm ?? args.height ?? null,
  });
  return { score: result.finalScore, isDerived: false, parts: args, ...result };
}

/**
 * @param {number | null | undefined} hours
 * @returns {string}
 */
export function formatFastingHoursLabel(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins <= 0) return `${whole}h`;
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Media aritmetica delle finestre massime di digiuno giornaliere
 * (`24 − (ultimo − primo pasto)`) su una finestra storica.
 * Esclude oggi (giorno incompleto). Confronta con i 14gg precedenti per il trend.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   todayDate?: string,
 *   windowDays?: number,
 * }} [input]
 * @returns {{
 *   averageHours: number | null,
 *   sampleDays: number,
 *   previousAverageHours: number | null,
 *   previousSampleDays: number,
 *   trend: 'up' | 'down' | 'flat' | 'none',
 *   fastingHistory: Array<{ date: string, dateKey: string, hours: number | null }>,
 * }}
 */
export function computeAverageDailyFastingWindow(input = {}) {
  const {
    fullHistory = null,
    todayDate = '',
    windowDays = LONGEVITY_WINDOW_DAYS,
  } = input && typeof input === 'object' ? input : {};

  const empty = {
    averageHours: null,
    sampleDays: 0,
    previousAverageHours: null,
    previousSampleDays: 0,
    trend: 'none',
    fastingHistory: [],
  };

  const safeToday = String(todayDate || '').slice(0, 10);
  if (!fullHistory || !/^\d{4}-\d{2}-\d{2}$/.test(safeToday)) return empty;

  const days = Math.max(1, Number(windowDays) || LONGEVITY_WINDOW_DAYS);

  const formatDayLabel = (dateStr) => {
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}`;
  };

  /** @param {number} startOffset @param {number} endOffsetExclusive */
  const collectWindow = (startOffset, endOffsetExclusive, { withHistory = false } = {}) => {
    const values = [];
    const history = [];
    // Chronological when building history: oldest → newest
    const offsets = [];
    for (let offset = startOffset; offset < endOffsetExclusive; offset += 1) {
      offsets.push(offset);
    }
    const ordered = withHistory ? [...offsets].reverse() : offsets;

    for (const offset of ordered) {
      const dateStr = shiftDateStr(safeToday, -offset);
      if (!dateStr) continue;
      const dayNode = fullHistory[TRACKER_STORICO_KEY(dateStr)];
      const windowH = computeDayMaxFastingWindowHours(dayNode);
      const hours = windowH != null && Number.isFinite(windowH) ? windowH : null;
      if (hours != null) values.push(hours);
      if (withHistory) {
        history.push({
          date: formatDayLabel(dateStr),
          dateKey: dateStr,
          hours,
        });
      }
    }
    if (values.length === 0) {
      return { averageHours: null, sampleDays: 0, history };
    }
    const sum = values.reduce((acc, v) => acc + v, 0);
    return {
      averageHours: Math.round((sum / values.length) * 10) / 10,
      sampleDays: values.length,
      history,
    };
  };

  // Ultimi 14 giorni completi: ieri … ieri−13 (esclude oggi)
  const current = collectWindow(1, days + 1, { withHistory: true });
  // Precedenti 14: ieri−14 … ieri−27
  const previous = collectWindow(days + 1, days * 2 + 1);

  let trend = 'none';
  if (
    current.averageHours != null
    && previous.averageHours != null
    && previous.sampleDays > 0
  ) {
    const delta = current.averageHours - previous.averageHours;
    if (Math.abs(delta) < 0.3) trend = 'flat';
    else if (delta > 0) trend = 'up';
    else trend = 'down';
  }

  return {
    averageHours: current.averageHours,
    sampleDays: current.sampleDays,
    previousAverageHours: previous.averageHours,
    previousSampleDays: previous.sampleDays,
    trend,
    fastingHistory: current.history || [],
  };
}

/**
 * @param {number | null | undefined} deltaKcal
 * @returns {string}
 */
export function formatCompensationDelta(deltaKcal) {
  const n = Number(deltaKcal);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  if (rounded === 0) return '0 kcal';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} kcal`;
}

/** Max punti per pilastro Progressione (Nutrizione / Allenamento / Riposo). */
export const PROGRESSION_PILLAR_MAX = 100 / 3;

/**
 * @deprecated Il pilastro Allenamento usa la media telemetria 7g, non il conteggio sessioni.
 * Conservato per breakdown diagnostico (sessioni grezze).
 */
export const PROGRESSION_SESSION_TARGET_14D = 8;

/** Target ore sonno per pilastro Riposo. */
export const PROGRESSION_SLEEP_TARGET_HOURS = 7.5;

/**
 * Normalizza target nutrizionali da userTargets / profilo.
 * @param {object | null | undefined} userTargets
 */
export function resolveProgressionNutritionTargets(userTargets = {}) {
  const t = userTargets && typeof userTargets === 'object' ? userTargets : {};
  const kcal = Number(t.kcal ?? t.targetCalories ?? t.calories);
  const prot = Number(t.prot ?? t.protein ?? t.proteinTarget);
  const carb = Number(t.carb ?? t.carbo ?? t.carbs);
  const fat = Number(t.fatTotal ?? t.fat ?? t.fats);
  return {
    kcal: Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 2000,
    prot: Number.isFinite(prot) && prot > 0 ? Math.round(prot) : 150,
    carb: Number.isFinite(carb) && carb > 0 ? Math.round(carb) : 200,
    fat: Number.isFinite(fat) && fat > 0 ? Math.round(fat) : 60,
  };
}

/**
 * Score giornaliero nutrizione 0–1 (prossimità continua).
 * Ignora giorni vuoti / solo caffè (kcal < 300) → null.
 *
 * kcal 60% + proteine 40%: all'80% del target calorie → ~0.8 × peso relativo.
 *
 * @param {{ kcal?: number, calories?: number, prot?: number, protein?: number }} intake
 * @param {{ kcal: number, prot: number }} targets
 * @returns {number | null}
 */
export function scoreProgressionNutritionDay(intake, targets) {
  if (!intake || typeof intake !== 'object') return null;

  const kcal = Math.max(
    0,
    Number(intake.kcal ?? intake.calories) || 0,
  );
  if (kcal < PROGRESSION_MIN_NUTRITION_DAY_KCAL) return null;

  const prot = Math.max(
    0,
    Number(intake.prot ?? intake.protein) || 0,
  );
  const t = targets || resolveProgressionNutritionTargets();
  const targetKcal = Number(t.kcal) > 0 ? Number(t.kcal) : 2000;
  const targetProt = Number(t.prot) > 0 ? Number(t.prot) : 150;

  const kcalScore = Math.max(0, 1 - Math.abs(kcal - targetKcal) / targetKcal);
  const protScore = Math.max(0, 1 - Math.abs(prot - targetProt) / targetProt);

  return Math.max(0, Math.min(1, (kcalScore * 0.6) + (protScore * 0.4)));
}

function resolveTodayIsoFromLogs(days, logs) {
  const fromLogs = String(logs?.todayDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromLogs)) return fromLogs;
  const marked = (Array.isArray(days) ? days : []).find((d) => d?.isToday === true);
  if (marked?.date) return String(marked.date).slice(0, 10);
  // Convenzione buildProgressionLogsWindow: primo elemento = oggi.
  const first = Array.isArray(days) && days[0]?.date ? String(days[0].date).slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : '';
}

function isNutritionDayComplete(day, todayIso) {
  if (day?.nutritionDayComplete === true || day?.dayComplete === true || day?.isComplete === true) {
    return true;
  }
  const date = String(day?.date || '').slice(0, 10);
  if (!todayIso || !date) return true;
  // Oggi escluso dalla media finché non marcato concluso.
  if (date === todayIso || day?.isToday === true) return false;
  return true;
}

function dayQualifiesForNutritionScore(day) {
  if (day?.hasNutrition === true) return true;
  return (Number(day?.kcal) || 0) >= PROGRESSION_MIN_NUTRITION_DAY_KCAL;
}

/**
 * Punteggio Progressione 0–100 — Nutrizione (14gg) + Allenamento (telemetria 7g) + Sonno.
 *
 * Allenamento: media stimolo attuale dei 5 distretti (Abs, Petto, Braccia, Gambe, Schiena).
 * Non usa più workoutsCompleted / workoutsScheduled: un rest day non vale 100%.
 *
 * Nutrizione: media solo su giorni COMPLETATI (non oggi) con hasNutrition / kcal >= 300.
 * Se nessun giorno valido → stato neutro (pilastro pieno + awaitingData).
 *
 * @param {Array<object> | object} logs
 * @param {object} [userTargets]
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   averageStimulus?: number | null,
 * }} [muscleTelemetry]
 */
export function calculateProgressionScore(logs, userTargets = {}, muscleTelemetry = null) {
  const targets = resolveProgressionNutritionTargets(userTargets);
  const sleepTarget = Number(userTargets?.sleepHours ?? userTargets?.sleepTarget)
    > 0
    ? Number(userTargets.sleepHours ?? userTargets.sleepTarget)
    : PROGRESSION_SLEEP_TARGET_HOURS;
  const sessionTarget = Number(userTargets?.sessionTarget14d ?? userTargets?.workoutSessionsTarget)
    > 0
    ? Math.round(Number(userTargets.sessionTarget14d ?? userTargets.workoutSessionsTarget))
    : PROGRESSION_SESSION_TARGET_14D;

  let days = [];
  let precomputedSleepAvg = null;
  let precomputedSessions = null;
  let logsObj = null;

  if (Array.isArray(logs)) {
    days = logs;
  } else if (logs && typeof logs === 'object') {
    logsObj = logs;
    days = Array.isArray(logs.days) ? logs.days : [];
    if (Number.isFinite(Number(logs.sleepAvgHours)) && Number(logs.sleepAvgHours) > 0) {
      precomputedSleepAvg = Number(logs.sleepAvgHours);
    }
    if (Number.isFinite(Number(logs.workoutSessionsTotal))) {
      precomputedSessions = Math.max(0, Math.round(Number(logs.workoutSessionsTotal)));
    }
  }

  const todayIso = resolveTodayIsoFromLogs(days, logsObj);

  // —— Nutrizione: solo giorni precedenti completati con apporto reale ——
  const nutritionDayScores = [];
  const nutritionDaysUsed = [];
  for (const day of days) {
    if (!isNutritionDayComplete(day, todayIso)) continue;
    if (!dayQualifiesForNutritionScore(day)) continue;
    const dayScore = scoreProgressionNutritionDay(day, targets);
    if (dayScore == null || !Number.isFinite(dayScore)) continue;
    nutritionDayScores.push(dayScore);
    nutritionDaysUsed.push(day);
  }

  const nutritionAwaitingData = nutritionDayScores.length === 0;
  const nutritionAvg = nutritionAwaitingData
    ? 1
    : nutritionDayScores.reduce((a, b) => a + b, 0) / nutritionDayScores.length;
  const nutritionScore = Math.min(
    PROGRESSION_PILLAR_MAX,
    nutritionAvg * PROGRESSION_PILLAR_MAX,
  );
  const nutritionPct = Math.round(Math.max(0, Math.min(100, nutritionAvg * 100)));
  const nutritionTolerancePct = nutritionPct;

  let nutritionAvgKcal = null;
  let nutritionAvgProt = null;
  if (nutritionDaysUsed.length > 0) {
    nutritionAvgKcal = Math.round(
      nutritionDaysUsed.reduce((s, d) => s + (Number(d.kcal) || 0), 0) / nutritionDaysUsed.length,
    );
    nutritionAvgProt = Math.round(
      nutritionDaysUsed.reduce((s, d) => s + (Number(d.prot) || 0), 0) / nutritionDaysUsed.length,
    );
  }

  // —— Allenamento: media stimolo 5 distretti (telemetria 7g), non calendario ——
  const workoutSessions = precomputedSessions != null
    ? precomputedSessions
    : days.reduce((sum, day) => sum + (Math.max(0, Math.round(Number(day?.workoutSessions) || 0))), 0);
  const telemetryCtx = {
    ...(logsObj && typeof logsObj === 'object' ? logsObj : {}),
    ...(muscleTelemetry && typeof muscleTelemetry === 'object' ? muscleTelemetry : {}),
  };
  const averageStimulus = computeAverageMuscleStimulus({
    fourCylinder: telemetryCtx.fourCylinder ?? null,
    fullHistory: telemetryCtx.fullHistory ?? null,
    activeLog: telemetryCtx.activeLog ?? telemetryCtx.todayLiveLog ?? null,
    activeDate: telemetryCtx.activeDate ?? telemetryCtx.todayDate ?? todayIso ?? null,
    averageStimulus: telemetryCtx.averageStimulus,
  });
  const trainingPct = Math.round(Math.max(0, Math.min(100, averageStimulus)));
  const trainingScore = Math.min(
    PROGRESSION_PILLAR_MAX,
    (trainingPct / 100) * PROGRESSION_PILLAR_MAX,
  );

  // —— Riposo ——
  let sleepAvg = precomputedSleepAvg;
  if (sleepAvg == null) {
    const sleepList = days
      .map((d) => Number(d?.sleepHours))
      .filter((h) => Number.isFinite(h) && h > 0);
    sleepAvg = sleepList.length > 0
      ? sleepList.reduce((a, b) => a + b, 0) / sleepList.length
      : null;
  }
  const sleepRatio = sleepAvg != null && sleepTarget > 0
    ? sleepAvg / sleepTarget
    : 0;
  const sleepScore = Math.min(
    PROGRESSION_PILLAR_MAX,
    Math.max(0, sleepRatio) * PROGRESSION_PILLAR_MAX,
  );
  const sleepPct = Math.round(
    Math.max(0, Math.min(100, (sleepScore / PROGRESSION_PILLAR_MAX) * 100)),
  );

  const finalScore = Math.max(
    0,
    Math.min(100, Math.round(nutritionScore + trainingScore + sleepScore)),
  );

  return {
    finalScore,
    breakdown: {
      nutritionScore: Math.round(nutritionScore * 10) / 10,
      trainingScore: Math.round(trainingScore * 10) / 10,
      sleepScore: Math.round(sleepScore * 10) / 10,
      nutritionPct,
      trainingPct,
      sleepPct,
      nutritionTolerancePct,
      nutritionDaysScored: nutritionDayScores.length,
      nutritionAwaitingData,
      nutritionAvgKcal,
      nutritionAvgProt,
      nutritionTargetKcal: targets.kcal,
      nutritionTargetProt: targets.prot,
      workoutSessions,
      workoutTarget: sessionTarget,
      averageStimulus: trainingPct,
      sleepAvg: sleepAvg != null ? Math.round(sleepAvg * 10) / 10 : null,
      sleepTarget: Math.round(sleepTarget * 10) / 10,
    },
  };
}

/**
 * @deprecated — usa computeGhostBaselineFromSeries
 */
export function computeSleepGhostBaseline(sleepLogsMap, todayDate, lookbackDays = 7) {
  const targetHours = SLEEP_TARGET_HOURS;
  const map = sleepLogsMap && typeof sleepLogsMap === 'object' ? sleepLogsMap : {};
  const today = String(todayDate || '').slice(0, 10);
  const hoursList = [];
  for (const [dateKey, raw] of Object.entries(map)) {
    if (dateKey === today) continue;
    const h = Number(raw && typeof raw === 'object' ? raw.hours : raw);
    if (Number.isFinite(h) && h > 0) hoursList.push({ date: dateKey, hours: h });
  }
  hoursList.sort((a, b) => a.date.localeCompare(b.date));
  const recent = hoursList.slice(-Math.max(1, lookbackDays));
  if (recent.length === 0) {
    return { averageHours: null, sampleSize: 0, targetHours };
  }
  const averageHours = Math.round(
    (recent.reduce((s, x) => s + x.hours, 0) / recent.length) * 10,
  ) / 10;
  return { averageHours, sampleSize: recent.length, targetHours };
}
