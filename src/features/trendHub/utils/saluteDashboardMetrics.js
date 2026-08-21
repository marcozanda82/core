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

export const SLEEP_TARGET_HOURS = DEFAULT_SLEEP_HOURS;
export { REFERENCE_HEIGHT_CM, PROGRESSION_MIN_NUTRITION_DAY_KCAL };
export { resolveMorningSleepFromHistory as resolveMorningSleepForInsight };

/** Soglia clinica WHtR: girovita critico = altezza × 0.5 (multi-utente). */
export const WHTR_LIMIT_RATIO = 0.5;

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

/**
 * Punteggio Longevità 0–100 — architettura a due stadi:
 * 1) Motore comportamentale (max 100): cardio + pesi (gruppi unici) + sonno, ciascuno max 33.33
 * 2) Filtro strutturale WHtR multi-utente: soglia = altezza_utente × 0.5
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
 * }} input
 * @returns {{
 *   finalScore: number,
 *   baseScore: number,
 *   breakdown: {
 *     cardioScore: number,
 *     weightsScore: number,
 *     sleepScore: number,
 *     whtrMultiplier: number,
 *     cardioMins: number,
 *     uniqueGroups: number,
 *     sleepAvg: number | null,
 *     userHeight: number,
 *     criticalThreshold: number,
 *     muscleStimulusPillars?: Record<string, { direct: number, indirect: number, total: number }>,
 *   },
 * }}
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
  } = input && typeof input === 'object' ? input : {};

  // Altezza reale profilo (multi-utente); fallback 174 solo se dati mancanti
  const rawHeight = heightCm ?? height;
  const userHeight = Number(rawHeight) > 0 ? Number(rawHeight) : REFERENCE_HEIGHT_CM;
  // Soglia clinica personalizzata: WHtR 0.5
  const criticalThreshold = userHeight * WHTR_LIMIT_RATIO;
  const pillarMax = 100 / 3; // ≈ 33.333…

  // —— Cardio: target 150 min nei 14 giorni ——
  const cardioMins = Math.max(0, Number(cardioMinutesTotal) || 0);
  const cardioScoreRaw = Math.min((cardioMins / 150) * pillarMax, pillarMax);
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
    ? Math.min((sleepAvg / 7) * pillarMax, pillarMax)
    : 0;

  const baseScore = Math.max(
    0,
    Math.min(100, cardioScore + weightsScore + sleepScore),
  );

  // —— Filtro strutturale WHtR (soglia dinamica per utente) ——
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
      whtrMultiplier: Math.round(coefficient * 1000) / 1000,
      cardioMins: Math.round(cardioMins),
      uniqueGroups,
      sleepAvg,
      userHeight: Math.round(userHeight * 10) / 10,
      criticalThreshold: Math.round(criticalThreshold * 10) / 10,
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

/** Target sessioni training in 14 giorni (≈ 4/settimana). */
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
 * Punteggio Progressione 0–100 — aderenza 14gg su Nutrizione, Allenamento, Sonno.
 *
 * Nutrizione: media solo su giorni COMPLETATI (non oggi) con hasNutrition / kcal >= 300.
 * Se nessun giorno valido → stato neutro (pilastro pieno + awaitingData).
 *
 * @param {Array<object> | object} logs
 * @param {object} [userTargets]
 */
export function calculateProgressionScore(logs, userTargets = {}) {
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

  // —— Allenamento ——
  const workoutSessions = precomputedSessions != null
    ? precomputedSessions
    : days.reduce((sum, day) => sum + (Math.max(0, Math.round(Number(day?.workoutSessions) || 0))), 0);
  const trainingRatio = sessionTarget > 0 ? workoutSessions / sessionTarget : 0;
  const trainingScore = Math.min(
    PROGRESSION_PILLAR_MAX,
    Math.max(0, trainingRatio) * PROGRESSION_PILLAR_MAX,
  );
  const trainingPct = Math.round(
    Math.max(0, Math.min(100, (trainingScore / PROGRESSION_PILLAR_MAX) * 100)),
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
