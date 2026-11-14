/**
 * Migrazione esplicita dei punteggi già salvati.
 * Non è chiamata all'avvio e persistDayScore non la invoca.
 * Senza execute: true non scrive nulla.
 */

import { computeDayScore } from './computeDayScore.js';
import { SCORE_VERSION } from './scoreConfig.kds-3.js';

/**
 * @param {{
 *   fromVersion?: string|null,
 *   toVersion?: string|null,
 *   dates?: string[],
 *   context?: object,
 *   store?: { write: Function }|null,
 *   execute?: boolean,
 * }} input
 */
export async function migrateDayScores(input = {}) {
  const dates = Array.isArray(input.dates) ? input.dates : [];
  const plan = {
    executed: false,
    fromVersion: input.fromVersion ?? null,
    toVersion: input.toVersion ?? SCORE_VERSION,
    recordCount: dates.length,
    reason: 'La migrazione kds non parte da sola. Va chiamata con execute: true quando un metodo nuovo è pronto a riscrivere lo storico.',
  };
  if (input.execute !== true) return plan;
  if (plan.toVersion !== SCORE_VERSION) {
    return {
      ...plan,
      reason: `Nessun passaggio scritto verso ${plan.toVersion}.`,
    };
  }
  if (!input.store || typeof input.store.write !== 'function') {
    return {
      ...plan,
      reason: 'Manca lo store su cui scrivere.',
    };
  }

  for (const date of dates) {
    const fresh = computeDayScore(date, input.context || {});
    await input.store.write(date, {
      version: fresh.version,
      score: fresh.score,
      reliability: fresh.reliability,
      cylinders: fresh.cylinders,
      dataVersion: fresh.dataVersion,
    });
  }
  return {
    ...plan,
    executed: true,
    reason: null,
  };
}
