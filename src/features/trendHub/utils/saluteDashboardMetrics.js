import { TRACKER_STORICO_KEY } from '../../../coreEngine';
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
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight as resolveMorningSleepFromHistory,
} from './saluteHistorySeries';

export const SLEEP_TARGET_HOURS = DEFAULT_SLEEP_HOURS;
export { REFERENCE_HEIGHT_CM };
export { resolveMorningSleepFromHistory as resolveMorningSleepForInsight };

/** Soglia clinica WHtR: girovita critico = altezza × 0.5 (multi-utente). */
export const WHTR_LIMIT_RATIO = 0.5;

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
 *   },
 * }}
 */
export function calculateLongevityScore(input = {}) {
  const {
    cardioMinutesTotal = 0,
    uniqueMuscleGroups = null,
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

  // —— Pesi: 5 gruppi unici (petto, schiena, gambe, braccia, core) ——
  let uniqueGroups = Number(uniqueMuscleGroups);
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
