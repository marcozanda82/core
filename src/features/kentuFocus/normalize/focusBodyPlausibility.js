/**
 * Metadati plausibilità biometrica Focus — non modifica RTDB / valori grezzi.
 */

import { addCalendarDays, isIsoDateString } from './focusDateUtils.js';
import { finiteNumber } from './logUtils.js';

export const FOCUS_BODY_PLAUSIBILITY = Object.freeze({
  recorded: 'recorded',
  valid_for_analysis: 'valid_for_analysis',
  suspect: 'suspect',
  stale_for_current: 'stale_for_current',
  insufficient_evidence: 'insufficient_evidence',
});

/** Giorni oltre i quali una misura non è “attuale” per la situazione corrente. */
export const FOCUS_BODY_RECENCY_DAYS = 30;

/**
 * @param {object} entry — entry body_metrics grezza o parziale
 * @param {{ analysisDate: string, recencyDays?: number }} opts
 */
export function evaluateBodyMeasurementPlausibility(entry, opts) {
  const analysisDate = opts.analysisDate;
  const recencyDays = Number.isFinite(opts.recencyDays)
    ? Math.max(1, Math.floor(opts.recencyDays))
    : FOCUS_BODY_RECENCY_DAYS;

  const date = typeof entry?.date === 'string'
    ? entry.date.trim().slice(0, 10)
    : (typeof entry?.effectiveDate === 'string' ? entry.effectiveDate.trim().slice(0, 10) : null);
  const weightKg = finiteNumber(entry?.weight ?? entry?.weightKg);
  const bodyFatPct = finiteNumber(entry?.bodyFat ?? entry?.bodyFatPct ?? entry?.bf);

  // muscle senza unità: non interpretare come kg di massa magra.
  const leanExplicitKg = finiteNumber(entry?.leanMass ?? entry?.leanMassKg ?? entry?.muscleMassKg);
  const muscleAmbiguous = finiteNumber(entry?.muscle);
  const hasAmbiguousMuscle = leanExplicitKg == null && muscleAmbiguous != null;

  /** @type {string[]} */
  const reasons = [];
  let physicalOk = weightKg != null && weightKg > 0 && weightKg < 400;

  if (weightKg == null || !(weightKg > 0)) {
    reasons.push('missing_or_non_positive_weight');
    physicalOk = false;
  }
  if (bodyFatPct != null && (bodyFatPct <= 0 || bodyFatPct >= 80)) {
    reasons.push('body_fat_pct_out_of_range');
    physicalOk = false;
  }
  if (leanExplicitKg != null && weightKg != null && leanExplicitKg > weightKg) {
    reasons.push('lean_mass_kg_exceeds_weight');
    physicalOk = false;
  }
  if (leanExplicitKg != null && leanExplicitKg <= 0) {
    reasons.push('lean_mass_non_positive');
    physicalOk = false;
  }
  if (hasAmbiguousMuscle) {
    reasons.push('muscle_field_unit_unspecified_not_used_as_lean_kg');
  }

  let stale = false;
  if (isIsoDateString(analysisDate) && isIsoDateString(date)) {
    const cutoff = addCalendarDays(analysisDate, -recencyDays);
    if (date < cutoff) {
      stale = true;
      reasons.push(`older_than_${recencyDays}_days_vs_analysisDate`);
    }
  } else if (!date) {
    reasons.push('missing_measurement_date');
    physicalOk = false;
  }

  const recorded = weightKg != null && weightKg > 0;
  /** @type {string} */
  let status = FOCUS_BODY_PLAUSIBILITY.insufficient_evidence;
  if (recorded && physicalOk && !stale) {
    status = FOCUS_BODY_PLAUSIBILITY.valid_for_analysis;
  } else if (recorded && physicalOk && stale) {
    status = FOCUS_BODY_PLAUSIBILITY.stale_for_current;
  } else if (recorded && !physicalOk) {
    status = FOCUS_BODY_PLAUSIBILITY.suspect;
  } else if (recorded) {
    status = FOCUS_BODY_PLAUSIBILITY.recorded;
  }

  return {
    status,
    recorded,
    physicalPlausible: physicalOk,
    suitableForCurrentAnalysis: status === FOCUS_BODY_PLAUSIBILITY.valid_for_analysis,
    historicalOk: recorded && physicalOk,
    staleForCurrent: stale,
    leanMassKgUsed: leanExplicitKg,
    muscleFieldIgnoredAsLeanKg: hasAmbiguousMuscle ? muscleAmbiguous : null,
    reasons,
    recencyDays,
    thresholds: {
      bodyFatPctMinExclusive: 0,
      bodyFatPctMaxExclusive: 80,
      recencyDays,
    },
  };
}
