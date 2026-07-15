/**
 * KentuPhysiologyEngine — facade sui motori fisiologici esistenti (nessuna duplicazione).
 * Espone la valutazione giornaliera dei 4 pilastri ufficiali KentuOS.
 */
import { buildNutritionContextForState } from '../../../conversation/ConsultantEngine.js';
import { computeSleepEngineSnapshot } from '../../../hooks/useSleepEngine.js';
import {
  buildMetabolicSnapshot,
  formatMetabolicRelativeDuration,
} from '../utils/metabolicStateEngine.js';

/** @typedef {'ok' | 'warning' | 'alert'} PillarStatus */

/**
 * @typedef {Object} PillarEvaluation
 * @property {PillarStatus} status
 * @property {string} summary
 * @property {string} value
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @returns {boolean}
 */
function hasMealLogged(log) {
  return log.some((entry) => {
    const type = String(entry?.type || '').toLowerCase();
    return type === 'meal' || type === 'ghost_meal';
  });
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @returns {boolean}
 */
function hasWorkoutLogged(log) {
  return log.some((entry) => {
    const type = String(entry?.type || '').toLowerCase();
    return type === 'workout' || type === 'ghost_workout';
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} sleepEntry
 * @returns {string | null}
 */
function formatSleepQualityLabel(sleepEntry) {
  if (!sleepEntry) return null;
  const numeric = Number(
    sleepEntry.qualityScore ?? sleepEntry.score ?? sleepEntry.scoreTotal ?? sleepEntry.quality,
  );
  if (Number.isFinite(numeric)) {
    if (numeric <= 5 && numeric >= 1) return `Qualità ${Math.round(numeric)}`;
    if (numeric <= 100) return `Qualità ${Math.round(numeric / 20) || 1}/5`;
  }
  const label = String(sleepEntry.quality ?? sleepEntry.sleepQuality ?? sleepEntry.rating ?? '').trim();
  return label || null;
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @param {{ userTargets?: object, dynamicDailyKcal?: number } & Record<string, unknown>} [options]
 * @returns {PillarEvaluation}
 */
function evaluateNutritionPillar(log, options = {}) {
  const hasMeal = hasMealLogged(log);
  const nutrition = buildNutritionContextForState({
    activeLog: log,
    userTargets: options.userTargets,
    dynamicDailyKcal: options.dynamicDailyKcal,
    ...options.appState,
  });
  const budget = nutrition.remainingBudget || {};
  const kcalRemaining = num(budget.kcal, NaN);

  if (!hasMeal) {
    return {
      status: 'warning',
      summary: 'Nessun pasto registrato',
      value: '—',
    };
  }

  if (!Number.isFinite(kcalRemaining)) {
    return {
      status: 'warning',
      summary: 'Macro non calcolabili',
      value: '—',
    };
  }

  if (kcalRemaining < -250) {
    return {
      status: 'alert',
      summary: 'Budget calorico superato',
      value: `${Math.round(kcalRemaining)} kcal`,
    };
  }

  if (kcalRemaining > 600) {
    return {
      status: 'warning',
      summary: 'Ampio margine calorico residuo',
      value: `${Math.round(kcalRemaining)} kcal`,
    };
  }

  const proRemaining = num(budget.pro, NaN);
  const macroHint = Number.isFinite(proRemaining)
    ? `P ${Math.round(proRemaining)}g`
    : '';

  return {
    status: 'ok',
    summary: 'Macro a target',
    value: macroHint
      ? `${Math.round(kcalRemaining)} kcal · ${macroHint}`
      : `${Math.round(kcalRemaining)} kcal`,
  };
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @returns {PillarEvaluation}
 */
function evaluateTrainingPillar(log) {
  const workouts = log.filter((entry) => {
    const type = String(entry?.type || '').toLowerCase();
    return type === 'workout' || type === 'ghost_workout';
  });

  if (workouts.length === 0) {
    return {
      status: 'warning',
      summary: 'Allenamento non registrato',
      value: '—',
    };
  }

  const last = workouts[workouts.length - 1];
  const subType = String(last?.subType || last?.workoutType || '').trim();
  const label = subType || 'Workout registrato';

  return {
    status: 'ok',
    summary: 'Workout registrato',
    value: label,
  };
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @returns {PillarEvaluation}
 */
function evaluateSleepPillar(log) {
  const sleep = computeSleepEngineSnapshot(log);

  if (!sleep.hasSleepData) {
    return {
      status: 'alert',
      summary: 'Sonno non registrato',
      value: '—',
    };
  }

  const hours = sleep.totalSleepHours;
  const hoursLabel = hours >= 1
    ? `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`
    : `${Math.round(hours * 60)}m`;
  const qualityLabel = formatSleepQualityLabel(sleep.mainNightSleep);
  const summary = qualityLabel
    ? `${hoursLabel}, ${qualityLabel}`
    : hoursLabel;

  let status = /** @type {PillarStatus} */ ('ok');
  if (sleep.recoveryScore < 45 || hours < 5) status = 'alert';
  else if (sleep.recoveryScore < 65 || hours < 6.5) status = 'warning';

  return {
    status,
    summary,
    value: `${Math.round(sleep.recoveryScore)}% recupero`,
  };
}

/**
 * @param {ReturnType<typeof buildMetabolicSnapshot>} metabolic
 * @returns {PillarEvaluation}
 */
function evaluateFastingPillar(metabolic) {
  const hours = metabolic?.hoursSinceLastMeal;

  if (hours == null || !Number.isFinite(Number(hours))) {
    return {
      status: 'warning',
      summary: 'Digiuno non calcolabile',
      value: 'Nessun pasto di riferimento',
    };
  }

  const h = Math.max(0, Number(hours));
  const durationLabel = formatMetabolicRelativeDuration(h);
  const summary = `${durationLabel} digiuno in corso`;

  let status = /** @type {PillarStatus} */ ('ok');
  if (h < 2) status = 'warning';
  else if (h > 20) status = 'alert';
  else if (h > 16) status = 'warning';

  return {
    status,
    summary,
    value: `${Math.round(h * 10) / 10}h`,
  };
}

/**
 * Valuta i 4 pilastri fisiologici della giornata corrente.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} activeLog — log del giorno
 * @param {Record<string, unknown> | null | undefined} history — storico Firebase (fullHistory)
 * @param {{
 *   userTargets?: object,
 *   dynamicDailyKcal?: number,
 *   biometrics?: object,
 *   now?: Date,
 *   anchorDate?: string,
 *   referenceMs?: number,
 *   appState?: Record<string, unknown>,
 * }} [options]
 * @returns {Record<'NUTRITION' | 'TRAINING' | 'SLEEP' | 'FASTING', PillarEvaluation>}
 */
export function evaluateDailyPillars(activeLog, history = {}, options = {}) {
  const log = Array.isArray(activeLog) ? activeLog : [];
  const fullHistory = history != null && typeof history === 'object' ? history : {};

  const metabolic = buildMetabolicSnapshot(fullHistory, log, {
    biometrics: options.biometrics,
    now: options.now,
    anchorDate: options.anchorDate,
    referenceMs: options.referenceMs,
  });

  return {
    NUTRITION: evaluateNutritionPillar(log, options),
    TRAINING: evaluateTrainingPillar(log),
    SLEEP: evaluateSleepPillar(log),
    FASTING: evaluateFastingPillar(metabolic),
  };
}
