/**
 * Contratto HealthSnapshot v1.0 — adapter Salute (KentuOS).
 * Solo tipi e costanti. Nessuna dipendenza da UI o motori esistenti.
 */

/** @typedef {'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'INFERRED'} CertaintyLevel */

export const CERTAINTY_LEVELS = Object.freeze({
  MEASURED: 'MEASURED',
  CALCULATED: 'CALCULATED',
  ESTIMATED: 'ESTIMATED',
  INFERRED: 'INFERRED',
});

/** @typedef {'MANUAL' | 'WEARABLE' | 'CHAT'} SleepSource */

export const SLEEP_SOURCES = Object.freeze({
  MANUAL: 'MANUAL',
  WEARABLE: 'WEARABLE',
  CHAT: 'CHAT',
});

/** @typedef {'DIGESTION' | 'ABSORPTION' | 'FASTING'} MetabolicPhaseId */

export const METABOLIC_PHASE_IDS = Object.freeze({
  DIGESTION: 'DIGESTION',
  ABSORPTION: 'ABSORPTION',
  FASTING: 'FASTING',
});

export const MUSCLE_DISTRICT_IDS = Object.freeze([
  'legs',
  'chest',
  'back_shoulders',
  'arms',
  'core',
]);

/**
 * @typedef {object} NutritionDaySummary
 * @property {string} dateStr
 * @property {number} calories
 * @property {number} proteinGrams
 * @property {number} fiberGrams
 */

/**
 * @typedef {object} NutritionHistory7d
 * @property {number} avgCalories
 * @property {number} avgProteinGrams
 * @property {number} avgFiberGrams
 * @property {number} daysLogged
 * @property {NutritionDaySummary[]} days
 */

/**
 * @typedef {object} NutritionSnapshot
 * @property {number} calories
 * @property {number} targetCalories
 * @property {number} proteinGrams
 * @property {number} targetProteinGrams
 * @property {number} fiberGrams
 * @property {number} targetFiberGrams
 * @property {number | null} lastMealTimestamp
 * @property {NutritionHistory7d} history7d
 * @property {{ calories: CertaintyLevel, targets: CertaintyLevel, lastMealTimestamp: CertaintyLevel, history7d: CertaintyLevel }} certainty
 */

/**
 * @typedef {object} SleepHistory7d
 * @property {number} avgHours
 * @property {number} wakeTimeVariability
 */

/**
 * @typedef {object} SleepSnapshot
 * @property {number} hours
 * @property {number} wakeTime ore decimali 0–24
 * @property {number} bedtimeCalculated wrap 24h di (wakeTime − hours)
 * @property {number} quality 1–5; 0 se assente
 * @property {SleepSource} source
 * @property {number | null} dinnerSleepBuffer ore decimali bedtimeCalculated − ultimo pasto; null se manca un polo
 * @property {boolean} hasSleepData
 * @property {SleepHistory7d} history7d
 * @property {{ hours: CertaintyLevel, wakeTime: CertaintyLevel, bedtimeCalculated: CertaintyLevel, quality: CertaintyLevel, source: CertaintyLevel, dinnerSleepBuffer: CertaintyLevel, history7d: CertaintyLevel }} certainty
 */

/**
 * @typedef {object} TodayWorkoutSummary
 * @property {string} type
 * @property {number} durationMin
 */

/**
 * @typedef {object} ActivitySnapshot
 * @property {number} cardioMinutes7d
 * @property {number} cardioTarget7d
 * @property {Record<string, number>} muscleDecay
 * @property {number | null} lastWorkoutTimestamp
 * @property {TodayWorkoutSummary[]} todayWorkouts
 * @property {{ cardioMinutes7d: CertaintyLevel, cardioTarget7d: CertaintyLevel, muscleDecay: CertaintyLevel, lastWorkoutTimestamp: CertaintyLevel }} certainty
 */

/**
 * @typedef {object} MetabolicSnapshot
 * @property {number} fastingHoursCurrent
 * @property {number} glycemicPenalty moltiplicatore (neutro = 1)
 * @property {MetabolicPhaseId} currentPhase
 * @property {{ fastingHoursCurrent: CertaintyLevel, glycemicPenalty: CertaintyLevel, currentPhase: CertaintyLevel }} certainty
 */

/**
 * @typedef {object} SystemicSnapshot
 * @property {object | null} fourCylinders copia immutabile dello stato 4 cilindri
 * @property {number} systemicFatigue 0–1
 * @property {{ fourCylinders: CertaintyLevel, systemicFatigue: CertaintyLevel }} certainty
 */

/**
 * @typedef {object} HealthSnapshot
 * @property {number} timestamp epoch ms di costruzione
 * @property {string} dateStr YYYY-MM-DD
 * @property {NutritionSnapshot} nutrition
 * @property {SleepSnapshot} sleep
 * @property {ActivitySnapshot} activity
 * @property {MetabolicSnapshot} metabolic
 * @property {SystemicSnapshot} systemic
 */

/**
 * Input crudo dell'adapter. Nessuna lettura di `users/{uid}/sleep_logs`.
 *
 * @typedef {object} HealthSnapshotSourceData
 * @property {object | null | undefined} trackerStoricoDay nodo `trackerStorico_{date}` (log, mealTimes, data)
 * @property {object | Array | null | undefined} trackerStoricoWeek mappa o array degli ultimi ~7 nodi giorno
 * @property {object | null | undefined} kineticsData `{ glycemicPenalty?, metabolicPenalty?, fastingHoursCurrent?, currentPhase?, hoursSinceLastMeal? }`
 * @property {object | null | undefined} fourCylinderData stato `physiology_model.fourCylinder`
 * @property {object | null | undefined} [userTargets] `{ kcal?, prot?, fibre? }`
 * @property {number | null | undefined} [nowMs]
 * @property {string | null | undefined} [dateStr]
 */

export const DEFAULT_NUTRITION_TARGETS = Object.freeze({
  kcal: 2000,
  prot: 150,
  fibre: 30,
});

export const DEFAULT_CARDIO_TARGET_7D_MINUTES = 150;

export const DEFAULT_GLYCEMIC_PENALTY = 1;

/** Soglie allineate al motore fasi (1.5h digestione, 4h fine assorbimento) — duplicate locali, no import. */
export const PHASE_DIGESTION_HOURS = 1.5;
export const PHASE_ABSORPTION_END_HOURS = 4;

export const EMPTY_MUSCLE_DECAY = Object.freeze({
  legs: 0,
  chest: 0,
  back_shoulders: 0,
  arms: 0,
  core: 0,
});
