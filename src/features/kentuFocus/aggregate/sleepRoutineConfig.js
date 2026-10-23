/**
 * Soglie configurabili per analisi routine sonno (P6.2).
 * Nessuna I/O. Valori iniziali da ricognizione P6.1.
 */

/** @typedef {typeof DEFAULT_SLEEP_ROUTINE_THRESHOLDS} SleepRoutineThresholds */

export const DEFAULT_SLEEP_ROUTINE_THRESHOLDS = Object.freeze({
  /** Minimo mattine feriali (wake) per confronti weekday/weekend. */
  minWeekdayWakeNights: 4,
  /** Minimo mattine weekend. */
  minWeekendWakeNights: 2,
  /** Finestra preferita (giorni calendario di nightEndedOn). */
  preferredWindowDaysMin: 14,
  preferredWindowDaysMax: 30,
  /** Minimo notti con wake per IQR/dispersione. */
  minNightsForDispersion: 5,
  /** Minimo bedtime affidabili per lato (recente vs precedente). */
  minNightsForBedtimeShift: 5,
  /** Giorni della finestra “recente” per shift. */
  recentShiftWindowDays: 7,
  /** IQR wake feriale sotto questa soglia (ore) → regolarità alta. */
  stableWakeIqrMaxH: 0.5,
  /** |Δ mediana wake weekend−feriale| minima (ore) per segnale. */
  weekendWakeDeltaMinH: 0.75,
  /** |Δ mediana durata weekend−feriale| minima (ore). */
  durationDeltaMinH: 0.75,
  /** |Δ mediana bedtime| recente vs precedente minima (ore). */
  bedtimeShiftMinH: 0.5,
  /** Riduzione IQR wake (ore) per “regolarità migliorata”. */
  regularityImproveMinH: 0.35,
  /**
   * Se la frazione di notti unusual/ambiguous supera questa soglia,
   * i confronti forti sulla regolarità diventano insufficient_evidence.
   */
  maxAnomalyFractionForStrongClaims: 0.25,
  /** Minimo notti ordinary per confronti feriali/weekend “forti”. */
  minOrdinaryWeekdayWakeNights: 4,
  minOrdinaryWeekendWakeNights: 2,
});

/**
 * @param {Partial<SleepRoutineThresholds>|null|undefined} overrides
 * @returns {SleepRoutineThresholds}
 */
export function resolveSleepRoutineThresholds(overrides) {
  return Object.freeze({
    ...DEFAULT_SLEEP_ROUTINE_THRESHOLDS,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  });
}
