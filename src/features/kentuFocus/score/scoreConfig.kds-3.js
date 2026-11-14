/**
 * Metodo kds-3. Sostituisce kds-2.
 * Alimentazione, sonno e movimento sono sempre nella media.
 * La forza, se l'utente la attiva, non entra nel punteggio: colora di blu solo
 * una giornata che è già sulla rotta.
 *
 * Fino al lancio lo storico si ricalcola (historyLocked = false).
 * Dopo il lancio historyLocked diventa true.
 */

export const SCORE_VERSION = 'kds-3';

export const HISTORY_LOCKED = false;

export const CYLINDER_WEIGHTS = Object.freeze({
  alimentazione: 0.45,
  sonno: 0.30,
  movimento: 0.25,
});

export const MIN_CYLINDERS_WITH_DATA = 2;

/** Sotto questa soglia la forza non può spingere il colore verso il blu elettrico. */
export const ON_TRACK_SCORE = 0.75;

export const NULL_SCORE_STATUSES = Object.freeze([
  'future',
  'in_progress',
  'hole',
  'paused',
]);

/** Bassa solo se il giorno è approssimato. Il solo «non confermato» è affidabilità media. */
export const LOW_RELIABILITY_STATUSES = Object.freeze([
  'approximate',
]);

/**
 * Movimento equivalente moderato.
 * Camminata ×1. Corsa, bici, nuoto, ellittica, cardio, HIIT e remo ×2
 * (l'equivalenza OMS fra vigoroso e moderato).
 * Il giorno vale metà camminata di oggi e metà minuti equivalenti degli ultimi 7 giorni.
 */
export const MOVEMENT_CURVE = Object.freeze({
  dailyWalkMinutes: 30,
  stepsUnder60: 8000,
  stepsFrom60: 6500,
  ageThreshold: 60,
  weeklyEquivalentMinutes: 150,
  vigorousFactor: 2,
  dailyWeight: 0.5,
  weeklyWeight: 0.5,
  windowDays: 7,
  onTrackMinValue: 0.75,
  halfwayMinValue: 0.45,
  checkInMinutes: Object.freeze({
    poco: 10,
    mezzora: 30,
    ora: 60,
  }),
});

/**
 * Stato del rapporto, dal punteggio continuo.
 * ≥ 0,75 sulla rotta, da 0,45 a 0,75 a metà, sotto 0,45 fuori.
 */
export const PILLAR_STATUS = Object.freeze({
  onTrackMin: 0.75,
  halfwayMin: 0.45,
});

/** Pesi solo per scegliere il pilastro dell'azione. La forza non entra nel punteggio. */
export const ACTION_PILLAR_WEIGHTS = Object.freeze({
  alimentazione: 0.45,
  sonno: 0.30,
  movimento: 0.25,
  forza: 0.15,
});

export const PERIOD_RULES = Object.freeze({
  minCoverage: 0.6,
  onTrackMinScore: 0.75,
  breakBelowScore: 0.5,
  minPublishedStreak: 3,
});

/** Entrano in copertura e media. Fuori: hole, paused, in_progress, future. */
export const PERIOD_DATA_STATUSES = Object.freeze([
  'closed',
  'unconfirmed',
  'approximate',
  'late',
]);

/** Il giorno non confermato pesa meno di un giorno confermato nella media. */
export const UNCONFIRMED_PERIOD_WEIGHT = 0.8;

export function isPeriodDataStatus(dayStatus) {
  return PERIOD_DATA_STATUSES.includes(dayStatus);
}

export function periodDayWeight(dayStatus) {
  return dayStatus === 'unconfirmed' ? UNCONFIRMED_PERIOD_WEIGHT : 1;
}

/**
 * Più della metà dei giorni passati non è confermata.
 * @param {number} unconfirmedDays
 * @param {number} pastDays
 * @returns {string|null}
 */
export function unconfirmedPeriodNote(unconfirmedDays, pastDays) {
  if (!(pastDays > 0) || unconfirmedDays * 2 <= pastDays) return null;
  if (unconfirmedDays === 1) return `1 giorno su ${pastDays} non confermato`;
  return `${unconfirmedDays} giorni su ${pastDays} non confermati`;
}

/**
 * Cena abbondante: stesse soglie di heavy_late_meal, −0,15 come il pasto
 * a meno di 2 ore dal sonno. Le due penalità insieme non passano 0,20.
 * Sul punteggio di periodo, energy_irregular toglie altri 0,15.
 */
export const MEAL_PENALTY_CAP = 0.2;
export const ENERGY_IRREGULAR_PERIOD_PENALTY = 0.15;

/** Dall'arancio-rosso al blu chiaro. La forza, se entra, arriva al blu elettrico. */
export const SCORE_COLORS = Object.freeze({
  orangeRed: '#C2410C',
  lightBlue: '#93C5FD',
  electricBlue: '#2563EB',
  missing: '#111111',
});
