import {
  collectFoodEntriesFromFullHistory,
  flattenLogToFoodEntries,
} from '../../mealBuilder/hooks/usePredictiveFoodBlocks';
import {
  METABOLIC_PHASES,
  METABOLIC_OVERLOAD_PHASE,
} from './metabolicPhaseConfig';
import {
  addDays,
  computeAccumuloSNC,
  getLogFromStoricoTree,
  getTodayString,
} from '../../../coreEngine';

export { METABOLIC_PHASES, METABOLIC_OVERLOAD_PHASE } from './metabolicPhaseConfig';

function resolveEntryLoggedAtMs(entry, dayKey) {
  const direct = Number(
    entry?.lastUsedAt ?? entry?.lastUsed ?? entry?.timestamp ?? entry?.loggedAt ?? entry?._loggedAtMs,
  );
  if (Number.isFinite(direct) && direct > 0) return direct;

  const mealTime = Number(entry?.mealTime ?? entry?.time);
  if (!Number.isFinite(mealTime) || !dayKey) return 0;

  const baseDate = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return 0;

  const hours = Math.floor(mealTime);
  const minutes = Math.round((mealTime - hours) * 60);
  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate.getTime();
}

function enrichActiveLogEntries(activeLog, dayKey) {
  return flattenLogToFoodEntries(activeLog).map((entry) => ({
    ...entry,
    _dayKey: dayKey,
    _loggedAtMs: resolveEntryLoggedAtMs(entry, dayKey),
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
 * Ore trascorse dall'ultimo pasto loggato (fullHistory + log giornaliero attivo).
 * @returns {number|null} null se nessun pasto trovato nel lookback
 */
export function getHoursSinceLastMeal(fullHistory, activeLog, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const anchorDate = options.anchorDate ?? now.toISOString().slice(0, 10);
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 60);
  const referenceMs = Number.isFinite(Number(options.referenceMs))
    ? Number(options.referenceMs)
    : resolveReferenceMs(anchorDate, now);

  const seen = new Set();
  const candidates = [];

  collectFoodEntriesFromFullHistory(fullHistory, { lookbackDays, anchorDate }).forEach((entry) => {
    const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(entry);
  });

  if (Array.isArray(activeLog) && activeLog.length > 0) {
    enrichActiveLogEntries(activeLog, anchorDate).forEach((entry) => {
      const key = `${entry._dayKey}|${entry.mealTime}|${entry.desc}|${entry.id ?? entry.foodDbKey ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(entry);
    });
  }

  let lastMs = null;

  candidates.forEach((entry) => {
    const loggedAt = resolveEntryLoggedAtMs(entry, entry._dayKey);
    if (!loggedAt || loggedAt > referenceMs) return;
    if (lastMs == null || loggedAt > lastMs) {
      lastMs = loggedAt;
    }
  });

  if (lastMs == null) return null;
  return Math.max(0, (referenceMs - lastMs) / 3600000);
}

export function getMetabolicPhaseIndex(hoursSinceLastMeal) {
  const hours = Math.max(0, Number(hoursSinceLastMeal) || 0);
  const idx = METABOLIC_PHASES.findIndex(
    (phase) => hours >= phase.minHours && hours < phase.maxHours,
  );
  return idx >= 0 ? idx : METABOLIC_PHASES.length - 1;
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
  const qualityLabel = String(
    sleepEntry.quality ?? sleepEntry.sleepQuality ?? sleepEntry.rating ?? '',
  ).toLowerCase();

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

function buildTimeBasedMetabolicState(hoursSinceLastMeal) {
  const hours = hoursSinceLastMeal == null ? 0 : Math.max(0, Number(hoursSinceLastMeal) || 0);
  const phaseIndex = getMetabolicPhaseIndex(hours);
  const phase = METABOLIC_PHASES[phaseIndex];
  const nextPhase = phaseIndex < METABOLIC_PHASES.length - 1
    ? METABOLIC_PHASES[phaseIndex + 1]
    : null;

  const hoursUntilNext = nextPhase
    ? Math.max(0, nextPhase.minHours - hours)
    : null;

  return {
    hoursSinceLastMeal: hours,
    hasMealLogged: hoursSinceLastMeal != null,
    phase,
    phaseIndex,
    nextPhase,
    hoursUntilNext,
    progressInPhase: phase.maxHours === Infinity
      ? 1
      : Math.min(1, Math.max(0, (hours - phase.minHours) / (phase.maxHours - phase.minHours))),
  };
}

/**
 * Stato metabolico corrente + prossima fase e countdown.
 * @param {number|null} hoursSinceLastMeal
 * @param {{ stressLevel?: number, sleepQuality?: number|null, recoveryScore?: number }|null} [biometrics]
 */
export function getMetabolicState(hoursSinceLastMeal, biometrics = null) {
  const timeBasedState = buildTimeBasedMetabolicState(hoursSinceLastMeal);
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

export function buildMetabolicSnapshot(fullHistory, activeLog, options = {}) {
  const biometrics = options.biometrics
    ?? resolveMetabolicBiometrics(fullHistory, activeLog, options);
  const hoursSinceLastMeal = getHoursSinceLastMeal(fullHistory, activeLog, options);
  return getMetabolicState(hoursSinceLastMeal, biometrics);
}
