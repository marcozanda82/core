/**
 * Contratto HealthSystemState v1.0 — motore decisionale Salute (KentuOS).
 * Solo tipi e costanti. Nessuna dipendenza da React / UI / salaComandi.
 */

import { CERTAINTY_LEVELS } from './healthSnapshot.types.js';

export { CERTAINTY_LEVELS };

/** @typedef {'OPTIMAL' | 'FLEXION' | 'OVERLOAD' | 'NEUTRAL'} PillarState */

export const PILLAR_STATES = Object.freeze({
  OPTIMAL: 'OPTIMAL',
  FLEXION: 'FLEXION',
  OVERLOAD: 'OVERLOAD',
  NEUTRAL: 'NEUTRAL',
});

/** @typedef {'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'} DriverDirection */

export const DRIVER_DIRECTIONS = Object.freeze({
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
  NEUTRAL: 'NEUTRAL',
});

export const PILLAR_IDS = Object.freeze({
  METABOLISM: 'metabolism',
  NUTRITION: 'nutrition',
  ACTIVITY: 'activity',
  RECOVERY: 'recovery',
});

export const DRIVER_IDS = Object.freeze({
  SLEEP_DATA_MISSING: 'SLEEP_DATA_MISSING',
  SLEEP_DURATION: 'SLEEP_DURATION',
  SLEEP_QUALITY: 'SLEEP_QUALITY',
  WAKE_REGULARITY: 'WAKE_REGULARITY',
  DINNER_SLEEP_BUFFER: 'DINNER_SLEEP_BUFFER',
  SYSTEMIC_FATIGUE: 'SYSTEMIC_FATIGUE',
  CALORIE_ADHERENCE: 'CALORIE_ADHERENCE',
  PROTEIN_ADHERENCE: 'PROTEIN_ADHERENCE',
  FIBER_ADHERENCE: 'FIBER_ADHERENCE',
  NUTRITION_CONSISTENCY: 'NUTRITION_CONSISTENCY',
  CARDIO_LOAD_7D: 'CARDIO_LOAD_7D',
  MUSCLE_STIMULUS: 'MUSCLE_STIMULUS',
  TRAINING_TODAY: 'TRAINING_TODAY',
  GLYCEMIC_PENALTY: 'GLYCEMIC_PENALTY',
  METABOLIC_PHASE: 'METABOLIC_PHASE',
});

export const ACTION_IDS = Object.freeze({
  LOG_SLEEP: 'LOG_SLEEP',
  PROTECT_RECOVERY: 'PROTECT_RECOVERY',
  REDUCE_LOAD: 'REDUCE_LOAD',
  EARLIER_DINNER: 'EARLIER_DINNER',
  HIT_PROTEIN: 'HIT_PROTEIN',
  ADD_FIBER: 'ADD_FIBER',
  ADD_CARDIO: 'ADD_CARDIO',
  STIMULATE_LAG_MUSCLE: 'STIMULATE_LAG_MUSCLE',
  STABILIZE_WAKE: 'STABILIZE_WAKE',
  MAINTAIN_COURSE: 'MAINTAIN_COURSE',
});

/** Pesi di confidenza per ranking: score = magnitude * severity * confidenceWeight */
export const CONFIDENCE_WEIGHTS = Object.freeze({
  MEASURED: 1,
  CALCULATED: 0.85,
  INFERRED: 0.65,
  ESTIMATED: 0.4,
});

/** Severità per direzione: i driver negativi emergono prima nel ranking operativo. */
export const SEVERITY_WEIGHTS = Object.freeze({
  NEGATIVE: 1,
  POSITIVE: 0.5,
  NEUTRAL: 0.25,
});

export const GLOBAL_DRIVER_LIMIT = 3;

export const PILLAR_SCORE_WEIGHTS = Object.freeze({
  recovery: 0.28,
  nutrition: 0.26,
  activity: 0.24,
  metabolism: 0.22,
});

/** Baseline usata per pilastri NEUTRAL (dati in attesa) e fallback dello score globale. */
export const NEUTRAL_SCORE_BASELINE = 75;

/** Sotto questa frazione del target calorico la giornata nutrizionale è ancora incompleta. */
export const NUTRITION_INCOMPLETE_TARGET_RATIO = 0.1;

/** Prima di quest'ora (locale) l'assenza di allenamento odierno non è un deficit. */
export const ACTIVITY_PENDING_HOUR_END = 16;

/**
 * @typedef {import('./healthSnapshot.types.js').CertaintyLevel} CertaintyLevel
 */

/**
 * @typedef {object} Driver
 * @property {string} id
 * @property {DriverDirection} direction
 * @property {number} magnitude 0–1
 * @property {CertaintyLevel} certainty
 */

/**
 * @typedef {object} Action
 * @property {string} id
 * @property {string} text
 * @property {number} priority più alto = più urgente
 */

/**
 * @typedef {object} Insight
 * @property {string} text
 * @property {CertaintyLevel} certainty
 */

/**
 * @typedef {object} PillarEvidence
 * @property {string} type
 * @property {*} data
 */

/**
 * @typedef {object} Pillar
 * @property {PillarState} state
 * @property {number} score 0–100
 * @property {Driver[]} drivers
 * @property {Insight} insight
 * @property {PillarEvidence} evidence
 */

/**
 * @typedef {object} DriverRankRow
 * @property {string} id
 * @property {number} rankScore
 * @property {number} magnitude
 * @property {number} severity
 * @property {number} confidenceWeight
 * @property {DriverDirection} direction
 * @property {string} pillar
 */

/**
 * @typedef {object} ReasoningTrace
 * @property {DriverRankRow[]} driverScores
 * @property {string | null} selectedActionId
 * @property {Array<{ id: string, reason: string }>} rejectedActions
 * @property {Record<string, number>} pillarScores
 */

/**
 * @typedef {object} HealthSystemState
 * @property {number} score 0–100
 * @property {{ metabolism: Pillar, nutrition: Pillar, activity: Pillar, recovery: Pillar }} pillars
 * @property {Driver[]} globalDrivers top 3
 * @property {Action | null} primaryAction
 * @property {ReasoningTrace} reasoningTrace
 */
