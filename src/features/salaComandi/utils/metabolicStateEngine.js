import {
  collectFoodEntriesFromFullHistory,
  flattenLogToFoodEntries,
} from '../../mealBuilder/hooks/usePredictiveFoodBlocks';
import {
  METABOLIC_PHASES,
  METABOLIC_OVERLOAD_PHASE,
} from './metabolicPhaseConfig';
import {
  isFastingBreakerItem,
  filterFastingRelevantMeals,
} from '../../../utils/fastingBreakRules';
import {
  resolveEntryMealConsumedAtMs,
  parseDecimalHourFromValue,
} from './mealConsumedTime';
import {
  getMetabolicPhaseAtTime,
  getMetabolicPhaseIndex,
  POST_MEAL_ABSORPTION_END_HOURS,
  POST_MEAL_DIGESTION_HOURS,
} from './metabolicPhaseEngine';
import {
  addDays,
  computeAccumuloSNC,
  getLogFromStoricoTree,
  getTodayString,
  TRACKER_STORICO_KEY,
} from '../../../coreEngine';

export {
  getMetabolicPhaseAtTime,
  getMetabolicPhaseIndex,
  POST_MEAL_DIGESTION_HOURS,
  POST_MEAL_ABSORPTION_END_HOURS,
} from './metabolicPhaseEngine';

export { METABOLIC_PHASES, METABOLIC_OVERLOAD_PHASE } from './metabolicPhaseConfig';

function mealTimesForDay(fullHistory, dayKey) {
  if (!fullHistory || !dayKey || typeof fullHistory !== 'object') return null;
  const node = fullHistory[TRACKER_STORICO_KEY(dayKey)];
  return node?.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : null;
}

function enrichActiveLogEntries(activeLog, dayKey, fullHistory) {
  const mealTimesObj = mealTimesForDay(fullHistory, dayKey);
  return flattenLogToFoodEntries(activeLog).map((entry) => ({
    ...entry,
    _dayKey: dayKey,
    _consumedAtMs: resolveEntryMealConsumedAtMs(entry, dayKey, mealTimesObj),
  }));
}

function resolveReferenceMs(anchorDate, now) {
  const todayStr = now.toISOString().slice(0, 10);
  if (!anchorDate || anchorDate >= todayStr) {
    return now.getTime();
  }
  const endOfDay = new Date(`${anchorDate}T23:59:59`);
  return Number.isNaN(endOfDay.getTime()) ? now.getTime() : endOfDay.getTime();
}

/**
 * Timestamp ms dell'ultimo pasto consumato (mealTime/time, non loggedAt).
 * Esclude bevande/voci < 10 kcal (caffè amaro, tè, acqua) — non ripartono il timer.
 * @returns {number|null}
 */
export function resolveLastMealConsumedAtMs(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 60);
  const referenceMs = Number.isFinite(Number(options.referenceMs))
    ? Number(options.referenceMs)
    : resolveReferenceMs(anchorDate, now);
  const manualNodes = Array.isArray(options.manualNodes) ? options.manualNodes : [];

  const seen = new Set();
  const candidates = [];

  collectFoodEntriesFromFullHistory(fullHistory, { lookbackDays, anchorDate }).forEach((entry) => {
    const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(entry);
  });

  if (Array.isArray(activeLog) && activeLog.length > 0) {
    enrichActiveLogEntries(activeLog, anchorDate, fullHistory).forEach((entry) => {
      const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(entry);
    });
  }

  // Stimolanti del giorno (caffè zuccherato sì, amaro no) via manualNodes.
  manualNodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const key = `manual|${node.id || ''}|${node.time}|${node.label || node.subtype || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      ...node,
      _dayKey: anchorDate,
      mealTime: node.time ?? node.mealTime,
    });
  });

  // Solo pasti caloricamente rilevanti (>= 10 kcal / breaksFast).
  const pastiValidi = filterFastingRelevantMeals(candidates);

  let lastConsumedMs = null;

  pastiValidi.forEach((entry) => {
    const mealTimesObj = mealTimesForDay(fullHistory, entry._dayKey);
    let consumedAt =
      entry._consumedAtMs
      ?? resolveEntryMealConsumedAtMs(entry, entry._dayKey, mealTimesObj);

    // Fallback stimolanti: solo ora decimale sul giorno ancora.
    if ((!consumedAt || consumedAt <= 0) && entry._dayKey) {
      const hour = parseDecimalHourFromValue(entry.time ?? entry.mealTime);
      if (hour != null) {
        const base = new Date(`${entry._dayKey}T00:00:00`);
        if (!Number.isNaN(base.getTime())) {
          base.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
          consumedAt = base.getTime();
        }
      }
    }

    if (!consumedAt || consumedAt > referenceMs) return;
    if (lastConsumedMs == null || consumedAt > lastConsumedMs) {
      lastConsumedMs = consumedAt;
    }
  });

  return lastConsumedMs;
}

const LAST_MEAL_MS_TOLERANCE = 5 * 60 * 1000;

function collectMealEntryCandidates(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 60);
  const manualNodes = Array.isArray(options.manualNodes) ? options.manualNodes : [];

  const seen = new Set();
  const candidates = [];

  collectFoodEntriesFromFullHistory(fullHistory, { lookbackDays, anchorDate }).forEach((entry) => {
    const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(entry);
  });

  if (Array.isArray(activeLog) && activeLog.length > 0) {
    enrichActiveLogEntries(activeLog, anchorDate, fullHistory).forEach((entry) => {
      const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(entry);
    });
  }

  manualNodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const key = `manual|${node.id || ''}|${node.time}|${node.label || node.subtype || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      ...node,
      _dayKey: anchorDate,
      mealTime: node.time ?? node.mealTime,
    });
  });

  return filterFastingRelevantMeals(candidates);
}

/**
 * Nodo pasto aggregato dell'ultimo pasto consumato (per cinetica macro).
 * @returns {{ type: 'meal', items: object[], kcal: number }|null}
 */
export function resolveLastMealAggregateNode(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const referenceMs = Number.isFinite(Number(options.referenceMs))
    ? Number(options.referenceMs)
    : resolveReferenceMs(anchorDate, now);

  const lastConsumedMs = resolveLastMealConsumedAtMs(fullHistory, activeLog, {
    ...options,
    now,
    anchorDate,
    referenceMs,
  });
  if (lastConsumedMs == null) return null;

  const items = [];
  const seen = new Set();

  collectMealEntryCandidates(fullHistory, activeLog, { ...options, now, anchorDate }).forEach((entry) => {
    if (!isFastingBreakerItem(entry)) return;
    const mealTimesObj = mealTimesForDay(fullHistory, entry._dayKey);
    const consumedAt =
      entry._consumedAtMs
      ?? resolveEntryMealConsumedAtMs(entry, entry._dayKey, mealTimesObj);
    if (!consumedAt || consumedAt > referenceMs) return;
    if (Math.abs(consumedAt - lastConsumedMs) > LAST_MEAL_MS_TOLERANCE) return;

    const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(entry);
  });

  if (items.length === 0) return null;

  const kcal = items.reduce(
    (sum, entry) => sum + (Number(entry.kcal ?? entry.cal) || 0),
    0,
  );

  return { type: 'meal', items, kcal };
}

/**
 * Ore trascorse dall'ultimo pasto loggato (fullHistory + log giornaliero attivo).
 * Usa mealTime/time del diario, non loggedAt di salvataggio.
 * @returns {number|null} null se nessun pasto trovato nel lookback
 */
export function getHoursSinceLastMeal(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const referenceMs = Number.isFinite(Number(options.referenceMs))
    ? Number(options.referenceMs)
    : resolveReferenceMs(anchorDate, now);

  const lastConsumedMs = resolveLastMealConsumedAtMs(fullHistory, activeLog, {
    ...options,
    now,
    anchorDate,
    referenceMs,
  });

  if (lastConsumedMs == null) return null;
  return Math.max(0, (referenceMs - lastConsumedMs) / 3600000);
}

const NIGHT_SLEEP_MIN_HOURS = 3;

function sleepHoursFromEntry(entry) {
  const hours = Number(entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function pickMainNightSleepEntry(sleepEntries) {
  if (!Array.isArray(sleepEntries) || sleepEntries.length === 0) return null;
  let best = null;
  let bestHours = -1;
  sleepEntries.forEach((entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours == null || hours < NIGHT_SLEEP_MIN_HOURS || hours <= bestHours) return;
    bestHours = hours;
    best = entry;
  });
  if (best) return best;
  return sleepEntries.reduce((acc, entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours == null) return acc;
    if (!acc || hours > sleepHoursFromEntry(acc)) return entry;
    return acc;
  }, null);
}

function sleepEntriesFromLog(log) {
  return (Array.isArray(log) ? log : []).filter((entry) => entry?.type === 'sleep');
}

function resolveLastNightSleepEntry(fullHistory, activeLog, anchorDate) {
  const anchor = anchorDate || getTodayString();
  const activeSleep = pickMainNightSleepEntry(sleepEntriesFromLog(activeLog));
  return activeSleep
    ?? pickMainNightSleepEntry(sleepEntriesFromLog(getLogFromStoricoTree(fullHistory, anchor)))
    ?? pickMainNightSleepEntry(sleepEntriesFromLog(getLogFromStoricoTree(fullHistory, addDays(anchor, -1))));
}

/** Ore di sonno dell'ultima notte loggata, o null se assenti. */
export function resolveLastNightSleepHours(fullHistory, activeLog, anchorDate) {
  const sleepEntry = resolveLastNightSleepEntry(fullHistory, activeLog, anchorDate);
  if (!sleepEntry) return null;
  return sleepHoursFromEntry(sleepEntry);
}

/** Punteggio 0–100 dalla qualità sonno dell'ultima notte loggata. */
export function resolveLastNightSleepQuality(fullHistory, activeLog, anchorDate) {
  const sleepEntry = resolveLastNightSleepEntry(fullHistory, activeLog, anchorDate);

  if (!sleepEntry) return null;

  const hours = sleepHoursFromEntry(sleepEntry) ?? 0;
  const qualityRaw = sleepEntry.quality ?? sleepEntry.sleepQuality ?? sleepEntry.rating ?? '';
  const qualityNum = Number(qualityRaw);

  if (Number.isFinite(qualityNum) && qualityNum >= 1 && qualityNum <= 5) {
    let score = Math.round((qualityNum / 5) * 100);
    if (hours >= 7.5) score = Math.min(100, score + 8);
    else if (hours >= 6.5) score = Math.min(100, score + 4);
    else if (hours > 0 && hours < 6) score = Math.max(0, score - 18);
    else if (hours > 0 && hours < 5) score = Math.max(0, score - 32);
    return Math.max(0, Math.min(100, score));
  }

  const qualityLabel = String(qualityRaw).toLowerCase();

  let score = 58;
  if (qualityLabel.includes('ottim') || qualityLabel.includes('eccell')) score = 92;
  else if (qualityLabel.includes('buon') || qualityLabel.includes('good')) score = 78;
  else if (qualityLabel.includes('discret') || qualityLabel.includes('ok')) score = 66;
  else if (qualityLabel.includes('scars') || qualityLabel.includes('pess') || qualityLabel.includes('bad')) {
    score = 26;
  }

  if (hours >= 7.5) score = Math.min(100, score + 8);
  else if (hours >= 6.5) score = Math.min(100, score + 4);
  else if (hours > 0 && hours < 6) score = Math.max(0, score - 18);
  else if (hours > 0 && hours < 5) score = Math.max(0, score - 32);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function resolveRecoveryScore({ stressLevel, sleepQuality, recoveryScore }) {
  if (Number.isFinite(Number(recoveryScore))) {
    return Math.max(0, Math.min(100, Math.round(Number(recoveryScore))));
  }

  const stress = Math.max(0, Math.min(100, Number(stressLevel) || 0));
  const sleep = sleepQuality == null ? 55 : Math.max(0, Math.min(100, Number(sleepQuality)));
  return Math.round(Math.max(0, 100 - stress) * 0.55 + sleep * 0.45);
}

/**
 * Biometriche diario per override metabolico.
 * @returns {{ stressLevel: number, sleepQuality: number|null, sleepHours: number|null, recoveryScore: number }}
 */
export function resolveMetabolicBiometrics(fullHistory, activeLog, options = {}) {
  const stressLevel = Number.isFinite(Number(options.stressLevel))
    ? Math.max(0, Math.min(100, Number(options.stressLevel)))
    : Math.max(0, Math.min(100, Number(computeAccumuloSNC(fullHistory, 60)) || 0));

  const sleepHours = options.sleepHours !== undefined
    ? (options.sleepHours == null ? null : Number(options.sleepHours))
    : resolveLastNightSleepHours(fullHistory, activeLog, options.anchorDate);

  const sleepQuality = options.sleepQuality !== undefined
    ? (options.sleepQuality == null ? null : Math.max(0, Math.min(100, Number(options.sleepQuality))))
    : resolveLastNightSleepQuality(fullHistory, activeLog, options.anchorDate);

  const recoveryScore = resolveRecoveryScore({
    stressLevel,
    sleepQuality,
    recoveryScore: options.recoveryScore,
  });

  return {
    stressLevel,
    sleepQuality,
    sleepHours: Number.isFinite(sleepHours) && sleepHours > 0 ? sleepHours : null,
    recoveryScore,
  };
}

const STRESS_OVERLOAD_THRESHOLD = 75;
const RECOVERY_OVERLOAD_THRESHOLD = 40;
const SLEEP_HOURS_OVERLOAD_THRESHOLD = 4.5;

/** Limite fisiologico massimo di digiuno continuo (ore). Oltre → override Sovraccarico. */
export const MAX_FASTING_HOURS = 72;

function isMetabolicOverloadFromBiometrics(biometrics) {
  if (!biometrics || typeof biometrics !== 'object') return false;

  const stressLevel = Number(biometrics.stressLevel) || 0;
  const recoveryScore = Number(biometrics.recoveryScore);
  const sleepHours = Number(biometrics.sleepHours);

  if (Number.isFinite(sleepHours) && sleepHours > 0 && sleepHours < SLEEP_HOURS_OVERLOAD_THRESHOLD) {
    return true;
  }

  return stressLevel > STRESS_OVERLOAD_THRESHOLD
    || (Number.isFinite(recoveryScore) && recoveryScore < RECOVERY_OVERLOAD_THRESHOLD);
}

function isFastingLimitExceeded(hoursSinceLastMeal) {
  if (hoursSinceLastMeal == null) return false;
  const hours = Math.max(0, Number(hoursSinceLastMeal) || 0);
  return hours >= MAX_FASTING_HOURS;
}

/** @returns {'fasting_limit'|'biometrics'|null} */
export function resolveMetabolicOverloadReason(biometrics, hoursSinceLastMeal = null) {
  if (isFastingLimitExceeded(hoursSinceLastMeal)) return 'fasting_limit';
  if (isMetabolicOverloadFromBiometrics(biometrics)) return 'biometrics';
  return null;
}

export function isMetabolicOverload(biometrics, hoursSinceLastMeal = null) {
  return resolveMetabolicOverloadReason(biometrics, hoursSinceLastMeal) != null;
}

function buildTimeBasedMetabolicState(hoursSinceLastMeal, lastMealNode = null) {
  return getMetabolicPhaseAtTime(hoursSinceLastMeal, lastMealNode);
}

/**
 * Stato metabolico corrente + prossima fase e countdown.
 * @param {number|null} hoursSinceLastMeal
 * @param {{ stressLevel?: number, sleepQuality?: number|null, recoveryScore?: number }|null} [biometrics]
 */
export function getMetabolicState(hoursSinceLastMeal, biometrics = null, lastMealNode = null) {
  const timeBasedState = buildTimeBasedMetabolicState(hoursSinceLastMeal, lastMealNode);
  const overloadReason = resolveMetabolicOverloadReason(
    biometrics,
    timeBasedState.hoursSinceLastMeal,
  );

  if (overloadReason) {
    return {
      ...timeBasedState,
      isOverloadOverride: true,
      overloadReason,
      phase: METABOLIC_OVERLOAD_PHASE,
      phaseIndex: -1,
      nextPhase: null,
      hoursUntilNext: null,
      biometrics,
      underlyingPhase: timeBasedState.phase,
    };
  }

  return {
    ...timeBasedState,
    isOverloadOverride: false,
    overloadReason: null,
    biometrics: biometrics ?? null,
    underlyingPhase: null,
  };
}

export function formatMetabolicCountdown(hoursFraction) {
  if (hoursFraction == null || !Number.isFinite(hoursFraction)) return '—';
  const totalMinutes = Math.max(0, Math.ceil(hoursFraction * 60));
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Durata relativa leggibile (es. "2h e 30m"). */
export function formatMetabolicRelativeDuration(hoursFraction) {
  if (hoursFraction == null || !Number.isFinite(hoursFraction)) return '—';
  const totalMinutes = Math.max(0, Math.ceil(hoursFraction * 60));
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  if (hh === 0) return `${mm}m`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h e ${mm}m`;
}

/** Orario locale HH:mm dal timestamp ms (fuso del dispositivo). */
export function formatLocalClockTime(timestampMs) {
  if (timestampMs == null || !Number.isFinite(Number(timestampMs))) return '—';
  const date = new Date(Number(timestampMs));
  if (Number.isNaN(date.getTime())) return '—';
  const hh = date.getHours();
  const mm = date.getMinutes();
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Istante di clock in cui inizia una fase metabolica, dato l'ultimo pasto e l'offset ore.
 * @param {number|null} lastMealConsumedAtMs
 * @param {number} hoursOffsetFromLastMeal — es. phase.minHours
 * @returns {number|null}
 */
export function resolveMetabolicPhaseClockMs(lastMealConsumedAtMs, hoursOffsetFromLastMeal) {
  if (lastMealConsumedAtMs == null || !Number.isFinite(Number(lastMealConsumedAtMs))) return null;
  const offset = Number(hoursOffsetFromLastMeal);
  if (!Number.isFinite(offset)) return null;
  return lastMealConsumedAtMs + offset * 3600000;
}

/** Etichetta orario locale per l'inizio di una fase (es. "16:30"). */
export function formatMetabolicPhaseClockLabel(lastMealConsumedAtMs, hoursOffsetFromLastMeal) {
  const clockMs = resolveMetabolicPhaseClockMs(lastMealConsumedAtMs, hoursOffsetFromLastMeal);
  return clockMs == null ? '—' : formatLocalClockTime(clockMs);
}

/**
 * Testo combinato: orario assoluto + countdown relativo.
 * Es. "16:30 (tra 2h e 30m)"
 */
export function formatMetabolicPhaseEta(lastMealConsumedAtMs, hoursOffsetFromLastMeal, hoursUntil = null) {
  const clockLabel = formatMetabolicPhaseClockLabel(lastMealConsumedAtMs, hoursOffsetFromLastMeal);
  if (clockLabel === '—') return null;

  const relative =
    hoursUntil != null && Number.isFinite(Number(hoursUntil)) && Number(hoursUntil) > 0
      ? formatMetabolicRelativeDuration(hoursUntil)
      : null;

  return relative ? `${clockLabel} (tra ${relative})` : clockLabel;
}

export function buildMetabolicSnapshot(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const referenceMs = Number.isFinite(Number(options.referenceMs))
    ? Number(options.referenceMs)
    : resolveReferenceMs(anchorDate, now);

  const biometrics = options.biometrics
    ?? resolveMetabolicBiometrics(fullHistory, activeLog, options);
  const lastMealConsumedAtMs = resolveLastMealConsumedAtMs(fullHistory, activeLog, {
    ...options,
    now,
    anchorDate,
    referenceMs,
  });
  const lastMealAggregateNode = resolveLastMealAggregateNode(fullHistory, activeLog, {
    ...options,
    now,
    anchorDate,
    referenceMs,
  });
  const hoursSinceLastMeal = lastMealConsumedAtMs == null
    ? null
    : Math.max(0, (referenceMs - lastMealConsumedAtMs) / 3600000);
  const state = getMetabolicState(hoursSinceLastMeal, biometrics, lastMealAggregateNode);

  const nextPhaseOffsetHours = state.nextTransitionHours != null
    ? state.nextTransitionHours
    : state.nextPhase?.minHours;

  const nextPhaseClockMs = nextPhaseOffsetHours != null && lastMealConsumedAtMs != null
    ? resolveMetabolicPhaseClockMs(lastMealConsumedAtMs, nextPhaseOffsetHours)
    : null;

  return {
    ...state,
    lastMealConsumedAtMs,
    referenceMs,
    nextPhaseClockMs,
    nextPhaseClockLabel: nextPhaseClockMs != null ? formatLocalClockTime(nextPhaseClockMs) : null,
    nextPhaseEtaLabel: state.nextPhase && lastMealConsumedAtMs != null && nextPhaseOffsetHours != null
      ? formatMetabolicPhaseEta(
        lastMealConsumedAtMs,
        nextPhaseOffsetHours,
        state.hoursUntilNext,
      )
      : null,
    lastMealAggregateNode,
    /** Stato digiuno condiviso (Monitor = fonte di verità per UI e avatar). */
    activeFastingStatus: {
      hoursSinceLastMeal,
      phaseId: state?.phase?.id ?? null,
      phaseLabel: state?.phase?.label ?? state?.phase?.name ?? null,
      isFastingActive: hoursSinceLastMeal != null && Number(hoursSinceLastMeal) >= 4,
      lastMealConsumedAtMs,
    },
  };
}
