/**
 * Metodo kds-2. Sostituisce kds-1.
 * Ogni cilindro ha un valore continuo 0–1. Gli stati on_track / halfway / off_track
 * restano per pallini e testi e derivano dalle soglie qui sotto, non dal numero grezzo.
 *
 * Fino al lancio lo storico si ricalcola quando il metodo cambia (historyLocked = false).
 * Dopo il lancio historyLocked diventa true: una versione diversa non si riscrive da sola.
 */

export const SCORE_VERSION = 'kds-2';

/** Dopo il lancio: true. Prima del lancio lo storico di un altro metodo si ricalcola. */
export const HISTORY_LOCKED = false;

export const CYLINDER_WEIGHTS = Object.freeze({
  alimentazione: 0.40,
  sonno: 0.25,
  cardio: 0.20,
  forza: 0.15,
});

/** Sotto due cilindri con dati il giorno non ha punteggio. */
export const MIN_CYLINDERS_WITH_DATA = 2;

export const NULL_SCORE_STATUSES = Object.freeze([
  'future',
  'in_progress',
  'hole',
  'paused',
]);

export const LOW_RELIABILITY_STATUSES = Object.freeze([
  'unconfirmed',
  'approximate',
]);

/**
 * Alimentazione, rispetto al target.
 * 1 entro ±10%. Decresce in linea retta fino a 0,15 a ±35%. Oltre resta 0,15.
 * Poi ×0,8 se c'è almeno un ultra-processato sfavorevole.
 * Poi −0,15 se l'ultimo pasto è a meno di 2 h dall'addormentamento (pavimento 0).
 * Lo stato del pallino guarda solo lo scostamento, prima dei due fattori.
 */
export const ENERGY_CURVE = Object.freeze({
  fullCreditDeviation: 0.10,
  floorDeviation: 0.35,
  floorValue: 0.15,
  ultraProcessedFactor: 0.8,
  lateMealPenalty: 0.15,
  lateMealHours: 2,
  usableBedtimeProvenance: Object.freeze(['recorded', 'derived', 'calculated']),
});

/**
 * Sonno, solo durata. 1 fra 7 e 9 ore.
 * Sotto 7 decresce in linea retta fino a 0,15 a 5 ore; sotto 5 resta 0,15.
 * Sopra 9, specchio: decresce fino a 0,15 a 11 ore; oltre resta 0,15.
 * La qualità (1–5 stelle) entra solo se è registrata: 5 e 4 non muovono il numero,
 * 3 ×0,9, 2 ×0,8, 1 ×0,7. Senza check-in si giudica solo la durata.
 */
export const SLEEP_CURVE = Object.freeze({
  fullMinHours: 7,
  fullMaxHours: 9,
  shortFloorHours: 5,
  longFloorHours: 11,
  floorValue: 0.15,
  qualityFactor: Object.freeze({ 5: 1, 4: 1, 3: 0.9, 2: 0.8, 1: 0.7 }),
});

/**
 * Forza. 1 se ogni macro-gruppo che ha allenato negli ultimi 30 giorni
 * è stato toccato negli ultimi 7. Il più fermo decresce fino a 0,15 a 12 giorni.
 */
export const STRENGTH_CURVE = Object.freeze({
  windowDays: 30,
  fullMaxDaysSince: 7,
  floorDaysSince: 12,
  floorValue: 0.15,
  obligationMacros: Object.freeze(['parte_bassa', 'parte_alta']),
  macroLabels: Object.freeze({
    parte_bassa: 'parte bassa',
    parte_alta: 'parte alta',
  }),
  macros: Object.freeze({
    parte_bassa: Object.freeze(['Gambe']),
    parte_alta: Object.freeze(['Petto', 'Dorso', 'Spalle', 'bicipiti', 'tricipiti', 'avambracci']),
  }),
  totalBodyGroup: 'Total Body',
});

/**
 * Cardio. min(1, minuti degli ultimi 7 giorni / 150).
 * Pallino: 150 in linea, da 75 a 149 a metà, sotto 75 fuori.
 * 0 minuti è un dato, non un'assenza.
 */
export const CARDIO_CURVE = Object.freeze({
  windowDays: 7,
  fullMinutes: 150,
  halfwayMinMinutes: 75,
});

export const NOVA4_CRITIQUE_SIGNAL_ID = 'nova4_critique';

export const PERIOD_RULES = Object.freeze({
  minCoverage: 0.6,
  onTrackMinScore: 0.75,
  breakBelowScore: 0.5,
  minPublishedStreak: 3,
});
