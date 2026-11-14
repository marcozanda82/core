/**
 * Metodo kds-1. Ogni soglia sta qui, con il motivo.
 * Cambiare un numero significa un metodo nuovo: lo storico non si ricalcola da solo.
 */

export const SCORE_VERSION = 'kds-1';

/** Punteggio di un cilindro. I no_data non hanno un punto: escono dalla media. */
export const CYLINDER_POINTS = Object.freeze({
  /** In linea con la soglia del cilindro. */
  on_track: 1,
  /** A metà strada: entra nel punteggio, non è un giorno sulla rotta. */
  halfway: 0.55,
  /** Fuori soglia. Resta nel punteggio, pesa poco. */
  off_track: 0.15,
});

/**
 * Pesi iniziali. Somma 1.
 * Se un cilindro è no_data il suo peso si redistribuisce sugli altri.
 */
export const CYLINDER_WEIGHTS = Object.freeze({
  /** Il giorno si legge prima dall'energia. */
  alimentazione: 0.4,
  /** Durata della notte e distanza dall'ultimo pasto. */
  sonno: 0.25,
  /** Minuti degli ultimi 7 giorni, non il singolo giorno. */
  cardio: 0.2,
  /** Finestra mobile dei gruppi, non la seduta di oggi. */
  forza: 0.15,
});

/** Sotto due cilindri con un dato il giorno non ha un punteggio. */
export const MIN_CYLINDERS_WITH_DATA = 2;

/** Giorni sulla rotta: il punteggio del giorno è almeno questo. */
export const ON_TRACK_DAY_SCORE = 0.75;

/**
 * Un giorno in questa fascia mette in pausa la scia, una volta sola.
 * 0,75 è già «sulla rotta» e non entra qui.
 */
export const STREAK_PAUSE_SCORE_MIN = 0.5;

/** Scia: almeno tre giorni sulla rotta. Il giorno giallo in mezzo non conta come giorno della scia. */
export const STREAK_MIN_DAYS = 3;

/** Quanti giorni gialli può contenere una scia prima di spezzarsi. */
export const STREAK_MAX_PAUSE_DAYS = 1;

/** Copertura minima dei giorni passati. Sotto questa soglia la media del periodo è null. */
export const PERIOD_COVERAGE_MIN = 0.6;

/** Questi stati non ricevono un punteggio, anche se i cilindri avrebbero un numero. */
export const NULL_SCORE_STATUSES = Object.freeze([
  'future',
  'in_progress',
  'hole',
  'paused',
]);

/** Affidabilità bassa: il giorno non è chiuso, oppure è segnato come approssimato. */
export const LOW_RELIABILITY_STATUSES = Object.freeze([
  'unconfirmed',
  'approximate',
]);

/** Entrano nella media del periodo. */
export const PERIOD_MEAN_STATUSES = Object.freeze(['closed', 'late']);

/**
 * Alimentazione: scostamento assoluto dall'obiettivo, in più o in meno.
 * Il segnale energy_low_day resta quello storico (solo deficit oltre il 25%) e viene citato quando scatta.
 */
export const ENERGY_BANDS = Object.freeze({
  /** Entro ±15% dell'obiettivo: on_track. Il 15% è incluso. */
  onTrackMaxDeviation: 0.15,
  /** Tra il 15% escluso e il 25% incluso: halfway. Oltre il 25%: off_track. */
  halfwayMaxDeviation: 0.25,
});

/**
 * Sonno del giorno D: notte registrata la mattina dopo (D+1), la stessa regola di Focus.
 * Se quella notte non c'è, il cilindro è no_data. Non si riusa la notte del giorno prima.
 */
export const SLEEP_BANDS = Object.freeze({
  /** Da 7 ore in su, 7 incluso: on_track. */
  onTrackMinHours: 7,
  /** Da 6 ore incluso fino a 7 escluso: halfway. Sotto le 6: off_track. */
  halfwayMinHours: 6,
  /** Ultimo pasto a meno di 2 ore dall'addormentamento: il cilindro peggiora di un livello. */
  mealBufferPenaltyHours: 2,
  /** Il segnale già esistente meal_within_3h_of_bedtime scatta sotto le 3 ore. Non sposta il livello kds-1. */
  existingMealSignalHours: 3,
  /** L'orario di addormentamento conta se è registrato o ricavato. calculated è l'alias storico di derived. */
  usableBedtimeProvenance: Object.freeze(['recorded', 'derived', 'calculated']),
});

/**
 * Forza, per macro-gruppo. «N giorni fa»: oggi = 0.
 * Ultimi 7 giorni = stimolo a distanza 0–7: halfway si apre a «fermo da 8».
 * Il giorno a distanza 7 resta quindi on_track, così non resta una distanza senza regola.
 * Il core è mappato ma non entra nel giudizio: non allenarlo non penalizza.
 */
export const STRENGTH_WINDOW = Object.freeze({
  /** Sessioni guardate all'indietro, oggi incluso. */
  windowDays: 30,
  /** Stimolo negli ultimi 7 giorni (distanza 0–7). */
  onTrackMaxDaysSince: 7,
  /** Primo giorno della fascia halfway: fermo da 8 giorni. */
  halfwayMinDaysSince: 8,
  /** Ultimo giorno della fascia halfway: fermo da 10. Da 11 in poi è off_track. */
  halfwayMaxDaysSince: 10,
  /**
   * Mappatura chip → macro.
   * Parte alta: Petto, Dorso, Spalle, bicipiti, tricipiti, avambracci.
   * Parte bassa: Gambe.
   * Core, facoltativo: abs, Core.
   */
  macros: Object.freeze({
    parte_bassa: Object.freeze(['Gambe']),
    parte_alta: Object.freeze(['Petto', 'Dorso', 'Spalle', 'bicipiti', 'tricipiti', 'avambracci']),
    core: Object.freeze(['abs', 'Core']),
  }),
  /** Solo questi macro, se compaiono negli ultimi 30 giorni, devono essere freschi. */
  obligationMacros: Object.freeze(['parte_bassa', 'parte_alta']),
  macroLabels: Object.freeze({
    parte_bassa: 'parte bassa',
    parte_alta: 'parte alta',
    core: 'core',
  }),
  /** Una seduta Total Body copre parte alta e parte bassa, quel giorno. Non obbliga il core. */
  totalBodyGroup: 'Total Body',
});

/**
 * Cardio: somma dei minuti aerobici degli ultimi 7 giorni, oggi incluso, contro 150.
 * 0 minuti è un dato (off_track), non un no_data: la finestra è stata letta.
 * Il giorno di riposo da solo non sposta il cilindro: conta la somma.
 */
export const CARDIO_WINDOW = Object.freeze({
  windowDays: 7,
  /** Da 150 minuti in su: on_track. 150 è incluso. */
  onTrackMinMinutes: 150,
  /** Da 75 incluso a 149: halfway. Sotto 75: off_track. */
  halfwayMinMinutes: 75,
});

/** Id registrato quando assessNova4CritiqueProfile trova almeno un ultra-processato sfavorevole. */
export const NOVA4_CRITIQUE_SIGNAL_ID = 'nova4_critique';
