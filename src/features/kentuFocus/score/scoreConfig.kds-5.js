/**
 * Metodo kds-5. Come kds-4 per alimentazione (day target) e sonno;
 * il movimento è la batteria (movementBattery.js), non più 50% oggi + 50% settimana.
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

export {
  ENERGY_CURVE,
  SLEEP_CURVE,
  STRENGTH_CURVE,
} from './scoreConfig.kds-2.js';

export const SCORE_VERSION = 'kds-5';
