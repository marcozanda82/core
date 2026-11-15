/**
 * Metodo kds-4. Stesse curve di kds-3; cambia il target dell'alimentazione:
 * usa resolveDayTargetKcal (base + burn contato + strategia + autopilota),
 * non più solo la base impostazioni.
 *
 * Fino al lancio lo storico si ricalcola (historyLocked = false).
 */

export {
  HISTORY_LOCKED,
  CYLINDER_WEIGHTS,
  MIN_CYLINDERS_WITH_DATA,
  ON_TRACK_SCORE,
  NULL_SCORE_STATUSES,
  LOW_RELIABILITY_STATUSES,
  MOVEMENT_CURVE,
  PILLAR_STATUS,
  pillarStatusFromValue,
  ACTION_PILLAR_WEIGHTS,
  PERIOD_RULES,
  PERIOD_DATA_STATUSES,
  UNCONFIRMED_PERIOD_WEIGHT,
  isPeriodDataStatus,
  periodDayWeight,
  unconfirmedPeriodNote,
  MEAL_PENALTY_CAP,
  ENERGY_IRREGULAR_PERIOD_PENALTY,
  SCORE_COLORS,
} from './scoreConfig.kds-3.js';

/** Curve energetiche/sonno/forza: ancora quelle di kds-2 usate da kds-3. */
export {
  ENERGY_CURVE,
  SLEEP_CURVE,
  STRENGTH_CURVE,
} from './scoreConfig.kds-2.js';

export const SCORE_VERSION = 'kds-4';
