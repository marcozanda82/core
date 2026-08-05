import { addDays } from '../../../calendarDateUtils';
import {
  normalizeMuscleGroupArray,
  WORKOUT_MUSCLE_GROUP_DEFS,
} from '../../../activityCatalog';
import {
  MUSCLE_CYLINDER_IDS,
  resolveMuscleCylinderId,
} from '../../salaComandi/engines/fourCylinderEngine';
import {
  applySpilloverSession,
  countSufficientlyStimulatedPillars,
  createEmptyMuscleSpilloverStimulus,
  finalizeMuscleSpilloverTotals,
  foldSpilloverStimulusToPillars,
  resolveSpilloverMuscleKey,
} from './muscleSpillover.js';
import { computeTotali } from '../../../useBiochimico';
import {
  computeSleepEngineSnapshot,
  mergeSleepEngineInputLog,
} from '../../../hooks/useSleepEngine';
import { readWaistCm } from './healthBiometrics';
import { DEFAULT_SLEEP_HOURS } from './sleepLogs';
import {
  selectDayLogFromStoricoNode,
  selectStoricoDayNode,
} from './healthContextSelectors';

export const REFERENCE_HEIGHT_CM = 174;
export const LONGEVITY_WINDOW_DAYS = 14;
export const SLEEP_GHOST_LOOKBACK_DAYS = 7;

/** I 5 pilastri pesi per longevità (petto, schiena, gambe, braccia, core). */
export const LONGEVITY_MUSCLE_PILLARS = Object.freeze([...MUSCLE_CYLINDER_IDS]);

const CARDIO_TYPE_RE = /^(cardio|hiit|misto)$/i;
const CARDIO_TEXT_RE = /cardio|corsa|bike|cycling|nuoto|swim|hiit|elliptical/i;

const MUSCLE_DEF_BY_ID = new Map(
  WORKOUT_MUSCLE_GROUP_DEFS.map((d) => [String(d.id).toLowerCase(), d]),
);

/**
 * Log sonno per lo snapshot: diario + eventuali nap in `manualNodes` dello stesso giorno.
 */
export function selectSleepEngineLogFromDayNode(dayNode) {
  const dayLog = selectDayLogFromStoricoNode(dayNode);
  const naps = Array.isArray(dayNode?.manualNodes) ? dayNode.manualNodes : [];
  return mergeSleepEngineInputLog(dayLog, naps);
}

/**
 * Single Source of Truth — stesso diario dell'Arco Energetico:
 * ore = somma di tutti i blocchi sleep (+ nap); qualità = notte principale.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dayLog
 * @returns {{ hours: number, quality: string, recordedAt: number, source: 'daily_log', entry: object } | null}
 */
export function extractMainNightSleepFromDayLog(dayLog) {
  const snap = computeSleepEngineSnapshot(dayLog);
  if (!snap.hasSleepData || !(snap.totalSleepHours > 0)) return null;
  const qualityEntry = snap.mainNightSleep || snap.sleepEntries[0] || null;
  return {
    hours: Math.round(snap.totalSleepHours * 100) / 100,
    quality: mapDiarySleepQualityForInsight(qualityEntry || {}),
    recordedAt: Number(qualityEntry?.timestamp) || Date.now(),
    source: 'daily_log',
    entry: qualityEntry,
  };
}

/**
 * Mappa qualità diario → poor/ok/good per Insight IA (non cambia le ore).
 * @param {Record<string, unknown>} entry
 * @returns {'poor'|'ok'|'good'}
 */
export function mapDiarySleepQualityForInsight(entry) {
  const numeric = Number(entry?.qualityScore ?? entry?.score ?? entry?.scoreTotal);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
    if (numeric >= 70) return 'good';
    if (numeric < 40) return 'poor';
    return 'ok';
  }
  // quality a stelle 1–5
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 5) {
    if (numeric >= 4) return 'good';
    if (numeric <= 2) return 'poor';
    return 'ok';
  }
  const label = String(entry?.quality ?? entry?.sleepQuality ?? entry?.rating ?? '').toLowerCase();
  if (!label) return 'ok';
  if (label === 'poor' || label.includes('scars') || label.includes('pess') || label.includes('bad')) {
    return 'poor';
  }
  if (label === 'good' || label.includes('buon') || label.includes('ottim') || label.includes('eccell')) {
    return 'good';
  }
  if (label === 'ok' || label.includes('discret')) return 'ok';
  return 'ok';
}

/**
 * Sonno mattina = sola fonte diario (Arco Energetico).
 * Preferisce `todayLog` / `activeLog` se è il giorno di oggi; altrimenti nodo fullHistory.
 *
 * @param {null} _ignoredSleepLogsEntry — accettato per non rompere call sites, IGNORATO
 * @param {{
 *   todayDate?: string,
 *   fullHistory?: object | null,
 *   activeLog?: Array,
 *   todayLog?: Array | null,
 *   activeLogIsToday?: boolean,
 * }} options
 */
export function resolveMorningSleepForInsight(_ignoredSleepLogsEntry, options = {}) {
  const {
    todayDate = '',
    fullHistory = null,
    activeLog = [],
    todayLog = null,
    activeLogIsToday = false,
  } = options;

  // Speculare all'Arco: quando si guarda oggi, activeLog È la fonte live
  if (activeLogIsToday && Array.isArray(activeLog) && activeLog.length > 0) {
    const fromActive = extractMainNightSleepFromDayLog(activeLog);
    if (fromActive) return fromActive;
  }

  if (Array.isArray(todayLog) && todayLog.length > 0) {
    const fromToday = extractMainNightSleepFromDayLog(todayLog);
    if (fromToday) return fromToday;
  }

  const dateKey = String(todayDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const fromHistory = extractMainNightSleepFromDayLog(
      selectSleepEngineLogFromDayNode(selectStoricoDayNode(fullHistory, dateKey)),
    );
    if (fromHistory) return fromHistory;
  }

  // Ultimo fallback: activeLog anche se non oggi (meglio di nulla)
  return extractMainNightSleepFromDayLog(activeLog);
}

/**
 * Serie sonno SOLO da diario storico (fullHistory), stessa selezione notte principale.
 * Nessun `sleep_logs`.
 */
export function buildUnifiedSleepSeries({
  fullHistory = null,
  todayDate = '',
  lookbackDays = SLEEP_GHOST_LOOKBACK_DAYS,
  todayLiveLog = null,
} = {}) {
  const today = String(todayDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];

  const out = [];
  for (let i = lookbackDays; i >= 0; i -= 1) {
    const dateStr = addDays(today, -i);
    const dayLog = dateStr === today && Array.isArray(todayLiveLog) && todayLiveLog.length > 0
      ? todayLiveLog
      : selectSleepEngineLogFromDayNode(selectStoricoDayNode(fullHistory, dateStr));
    const night = extractMainNightSleepFromDayLog(dayLog);
    if (night) {
      out.push({
        date: dateStr,
        hours: night.hours,
        quality: night.quality,
        source: night.source,
      });
    }
  }
  return out;
}

/**
 * Baseline ghost: media notti precedenti (escl. oggi) o target 7.5.
 */
export function computeGhostBaselineFromSeries(
  series,
  todayDate,
  targetHours = DEFAULT_SLEEP_HOURS,
) {
  const today = String(todayDate || '').slice(0, 10);
  const prior = (Array.isArray(series) ? series : []).filter(
    (s) => s.date !== today && Number.isFinite(s.hours),
  );
  if (prior.length === 0) {
    return { averageHours: null, sampleSize: 0, targetHours, ghostHours: targetHours };
  }
  const averageHours = Math.round(
    (prior.reduce((s, x) => s + x.hours, 0) / prior.length) * 10,
  ) / 10;
  return {
    averageHours,
    sampleSize: prior.length,
    targetHours,
    ghostHours: averageHours,
  };
}

export function isCardioWorkoutEntry(workout) {
  if (!workout || workout.type !== 'workout') return false;
  const t = String(workout.workoutType || workout.subType || workout.activity || '').trim();
  if (CARDIO_TYPE_RE.test(t)) return true;
  return CARDIO_TEXT_RE.test(String(workout.desc || workout.name || ''));
}

export function isPesiWorkoutEntry(workout) {
  if (!workout || workout.type !== 'workout') return false;
  if (isCardioWorkoutEntry(workout)) return false;
  const t = String(workout.workoutType || workout.subType || '').toLowerCase();
  if (t === 'riposo' || t === 'rest') return false;
  if (t === 'lavoro' || t === 'studio' || t === 'lavoro_pc') return false;
  return t === 'pesi' || t === '' || t === 'workout' || Boolean(workout.muscles);
}

export function workoutDurationMinutes(workout) {
  let d = Number(workout?.duration);
  if (!Number.isFinite(d) || d <= 0) {
    d = Number(workout?.durationMin ?? workout?.minutes ?? workout?.durationMinutes);
  }
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (d > 5) return Math.min(600, Math.round(d));
  return Math.min(600, Math.round(d * 60));
}

/**
 * Mappa chip muscolari di un workout → pilastri longevità (max 5).
 * Total Body conta come tutti e 5.
 * @param {Record<string, unknown>} workout
 * @returns {Set<string>}
 */
export function longevityMusclePillarsFromWorkout(workout) {
  const out = new Set();
  if (!workout || !isPesiWorkoutEntry(workout)) return out;

  const rawMuscles = workout.muscles ?? workout.muscleGroups ?? workout.groups ?? [];
  const labels = [...normalizeMuscleGroupArray(rawMuscles)];

  // Fallback: tipo attività / nome se non ci sono chip
  if (labels.length === 0) {
    const typeHint = String(
      workout.workoutType || workout.subType || workout.activity || workout.name || '',
    ).trim();
    if (typeHint) {
      for (const l of normalizeMuscleGroupArray([typeHint])) labels.push(l);
    }
  }

  for (const label of labels) {
    const key = String(label).toLowerCase();
    const def = MUSCLE_DEF_BY_ID.get(key);
    if (def?.macroGroup === 'total' || (key.includes('total') && key.includes('body'))) {
      LONGEVITY_MUSCLE_PILLARS.forEach((id) => out.add(id));
      continue;
    }
    if (def?.macroGroup && def.macroGroup !== 'total') {
      out.add(def.macroGroup);
      continue;
    }
    const cyl = resolveMuscleCylinderId(label) || resolveMuscleCylinderId(key);
    if (cyl) out.add(cyl);
  }
  return out;
}

/**
 * Chiavi spillover IT allenate in un workout (primari).
 * @param {Record<string, unknown>} workout
 * @returns {string[]}
 */
export function longevitySpilloverPrimariesFromWorkout(workout) {
  if (!workout || !isPesiWorkoutEntry(workout)) return [];

  const rawMuscles = workout.muscles ?? workout.muscleGroups ?? workout.groups ?? [];
  const labels = [...normalizeMuscleGroupArray(rawMuscles)];
  if (labels.length === 0) {
    const typeHint = String(
      workout.workoutType || workout.subType || workout.activity || workout.name || '',
    ).trim();
    if (typeHint) {
      for (const l of normalizeMuscleGroupArray([typeHint])) labels.push(l);
    }
  }

  const primaries = [];
  for (const label of labels) {
    const key = String(label).toLowerCase();
    const def = MUSCLE_DEF_BY_ID.get(key);
    if (def?.macroGroup === 'total' || (key.includes('total') && key.includes('body'))) {
      return ['total'];
    }
    const spilloverKey = resolveSpilloverMuscleKey(label)
      || resolveSpilloverMuscleKey(def?.id)
      || (def?.macroGroup === 'chest' ? 'petto'
        : def?.macroGroup === 'legs' ? 'gambe'
          : def?.macroGroup === 'arms' ? 'braccia'
            : def?.macroGroup === 'core' ? 'core'
              : def?.macroGroup === 'back_shoulders'
                ? (key.includes('spall') ? 'spalle' : 'schiena')
                : null);
    if (spilloverKey && spilloverKey !== 'total') {
      primaries.push(spilloverKey);
    }
  }
  return primaries;
}

/**
 * Finestra longevità 14gg — sonno da diario (SSOT), cardio/pesi da workout log.
 */
export function buildSaluteLongevityWindow({
  fullHistory = null,
  bodyMetricsHistory = [],
  todayDate = '',
  days = LONGEVITY_WINDOW_DAYS,
  todayLiveLog = null,
} = {}) {
  const today = String(todayDate || '').slice(0, 10);
  const windowDays = Math.max(1, Number(days) || LONGEVITY_WINDOW_DAYS);
  const emptyStimulus = createEmptyMuscleSpilloverStimulus();
  const emptyPillars = foldSpilloverStimulusToPillars(emptyStimulus);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return {
      daysSampled: 0,
      cardioMinutesTotal: 0,
      cardioDays: 0,
      pesiSessionCount: 0,
      pesiDays: 0,
      uniqueMuscleGroups: 0,
      uniqueMuscleGroupIds: [],
      muscleStimulus: emptyStimulus,
      muscleStimulusPillars: emptyPillars,
      sleepAvgHours: null,
      sleepNights: 0,
      waistCm: null,
      sleepSeries: [],
    };
  }

  const sleepSeries = buildUnifiedSleepSeries({
    fullHistory,
    todayDate: today,
    lookbackDays: windowDays,
    todayLiveLog,
  });

  let cardioMinutesTotal = 0;
  let cardioDays = 0;
  let pesiSessionCount = 0;
  let pesiDays = 0;
  let daysWithActivity = 0;
  const muscleStimulus = createEmptyMuscleSpilloverStimulus();

  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDays(today, -i);
    const dayLog = dateStr === today && Array.isArray(todayLiveLog) && todayLiveLog.length > 0
      ? todayLiveLog
      : selectDayLogFromStoricoNode(selectStoricoDayNode(fullHistory, dateStr));
    let dayCardio = 0;
    let dayPesi = 0;
    for (const entry of dayLog) {
      if (!entry || entry.type !== 'workout') continue;
      if (isCardioWorkoutEntry(entry)) {
        dayCardio += workoutDurationMinutes(entry);
      } else if (isPesiWorkoutEntry(entry)) {
        dayPesi += 1;
        const primaries = longevitySpilloverPrimariesFromWorkout(entry);
        if (primaries.length > 0) {
          applySpilloverSession(muscleStimulus, primaries);
        }
      }
    }
    if (dayCardio > 0) {
      cardioMinutesTotal += dayCardio;
      cardioDays += 1;
    }
    if (dayPesi > 0) {
      pesiSessionCount += dayPesi;
      pesiDays += 1;
    }
    if (dayCardio > 0 || dayPesi > 0) daysWithActivity += 1;
  }

  finalizeMuscleSpilloverTotals(muscleStimulus);
  const muscleStimulusPillars = foldSpilloverStimulusToPillars(muscleStimulus);
  const stimulated = countSufficientlyStimulatedPillars(muscleStimulusPillars);

  // Media sonno sulle notti disponibili (storico incompleto OK)
  const sleepHoursList = sleepSeries.map((s) => s.hours).filter((h) => Number.isFinite(h) && h > 0);
  const sleepAvgHours = sleepHoursList.length > 0
    ? Math.round((sleepHoursList.reduce((a, b) => a + b, 0) / sleepHoursList.length) * 10) / 10
    : null;

  let waistCm = null;
  const metrics = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  for (let i = metrics.length - 1; i >= 0; i -= 1) {
    const w = readWaistCm(metrics[i]);
    if (w != null) {
      waistCm = w;
      break;
    }
  }

  const daysSampled = Math.max(
    sleepHoursList.length,
    daysWithActivity,
    waistCm != null ? 1 : 0,
  );

  const uniqueMuscleGroupIds = stimulated.ids;

  return {
    daysSampled,
    cardioMinutesTotal,
    cardioDays,
    pesiSessionCount,
    pesiDays,
    uniqueMuscleGroups: stimulated.count,
    uniqueMuscleGroupIds,
    muscleStimulus,
    muscleStimulusPillars,
    sleepAvgHours,
    sleepNights: sleepHoursList.length,
    waistCm,
    sleepSeries,
  };
}

/**
 * Finestra 14gg per Punteggio Progressione — macro giornalieri + sessioni + sonno.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   todayDate?: string,
 *   days?: number,
 *   todayLiveLog?: Array | null,
 *   sleepSeries?: Array<{ date: string, hours: number }> | null,
 * }} args
 */
export function buildProgressionLogsWindow({
  fullHistory = null,
  todayDate = '',
  days = LONGEVITY_WINDOW_DAYS,
  todayLiveLog = null,
  sleepSeries: sleepSeriesIn = null,
} = {}) {
  const today = String(todayDate || '').slice(0, 10);
  const windowDays = Math.max(1, Number(days) || LONGEVITY_WINDOW_DAYS);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return {
      days: [],
      workoutSessionsTotal: 0,
      sleepAvgHours: null,
      windowDays,
    };
  }

  const sleepSeries = Array.isArray(sleepSeriesIn) && sleepSeriesIn.length > 0
    ? sleepSeriesIn
    : buildUnifiedSleepSeries({
      fullHistory,
      todayDate: today,
      lookbackDays: windowDays,
      todayLiveLog,
    });

  const sleepByDate = new Map();
  for (const entry of sleepSeries) {
    const key = String(entry?.date || '').slice(0, 10);
    const hours = Number(entry?.hours);
    if (key && Number.isFinite(hours) && hours > 0) {
      sleepByDate.set(key, hours);
    }
  }

  const dayRows = [];
  let workoutSessionsTotal = 0;

  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDays(today, -i);
    const dayLog = dateStr === today && Array.isArray(todayLiveLog) && todayLiveLog.length > 0
      ? todayLiveLog
      : selectDayLogFromStoricoNode(selectStoricoDayNode(fullHistory, dateStr));

    const totals = computeTotali(Array.isArray(dayLog) ? dayLog : []);
    const kcal = Math.max(0, Math.round(Number(totals.kcal) || 0));
    const prot = Math.max(0, Math.round(Number(totals.prot) || 0));
    const carb = Math.max(0, Math.round(Number(totals.carb) || 0));
    const fat = Math.max(0, Math.round(Number(totals.fatTotal) || 0));
    const hasNutrition = (Array.isArray(dayLog) ? dayLog : []).some(
      (e) => e && (e.type === 'food' || e.type === 'recipe' || e.type === 'meal'),
    ) || kcal > 0;

    let workoutSessions = 0;
    for (const entry of (Array.isArray(dayLog) ? dayLog : [])) {
      if (!entry || entry.type !== 'workout') continue;
      if (isCardioWorkoutEntry(entry) || isPesiWorkoutEntry(entry)) {
        workoutSessions += 1;
      }
    }
    workoutSessionsTotal += workoutSessions;

    dayRows.push({
      date: dateStr,
      kcal,
      prot,
      carb,
      fat,
      hasNutrition,
      workoutSessions,
      sleepHours: sleepByDate.has(dateStr) ? sleepByDate.get(dateStr) : null,
    });
  }

  const sleepHoursList = [...sleepByDate.values()];
  const sleepAvgHours = sleepHoursList.length > 0
    ? Math.round((sleepHoursList.reduce((a, b) => a + b, 0) / sleepHoursList.length) * 10) / 10
    : null;

  return {
    days: dayRows,
    workoutSessionsTotal,
    sleepAvgHours,
    windowDays,
  };
}

/**
 * Log di oggi: live `activeLog` se isToday, altrimenti fullHistory.
 */
export function selectTodayLog(fullHistory, todayDate, activeLogFallback = [], activeLogIsToday = false) {
  if (activeLogIsToday && Array.isArray(activeLogFallback)) {
    return activeLogFallback;
  }
  const dateKey = String(todayDate || '').slice(0, 10);
  const fromHistory = selectDayLogFromStoricoNode(selectStoricoDayNode(fullHistory, dateKey));
  if (fromHistory.length > 0) return fromHistory;
  return Array.isArray(activeLogFallback) ? activeLogFallback : [];
}
