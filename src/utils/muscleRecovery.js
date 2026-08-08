/**
 * Tracker stimolo muscolare — Accumulo Dinamico (re-export SSOT).
 *
 * Preferire `utils/hypertrophyMath.js` per nuovi calcoli.
 */

import {
  HYPERTROPHY_SESSION_BOOST,
  HYPERTROPHY_STIMULUS_CAP,
  HYPERTROPHY_DAILY_DECAY,
  HYPERTROPHY_DECAY_HORIZON_DAYS,
  hypertrophySessionResidual,
  computePillarStimulusPercent,
  hypertrophyTriageLabel,
} from './hypertrophyMath.js';

/**
 * Residuo % di una sessione dopo N giorni (curva non-lineare).
 * @param {number} daysElapsed
 * @returns {number}
 */
export function weeklyStimulusPercentFromSessions(sessionCount) {
  const n = Math.max(0, Math.floor(Number(sessionCount) || 0));
  if (n <= 0) return 0;
  return Math.min(HYPERTROPHY_STIMULUS_CAP, n * HYPERTROPHY_SESSION_BOOST);
}

/**
 * @deprecated Preferire hypertrophySessionResidual / computePillarStimulusPercent.
 * Mantenuto per compat: mappa ore residue → % (non è più il modello sismografi).
 *
 * @param {number|string|Date|null|undefined} completedAt
 * @param {number} [hoursToRecover=72]
 * @returns {number} 0–100
 */
export function calculateStimulusDecay(completedAt, hoursToRecover = 72) {
  const completedMs = new Date(completedAt).getTime();
  const recoveryHours = Number(hoursToRecover);
  if (!Number.isFinite(completedMs) || !Number.isFinite(recoveryHours) || recoveryHours <= 0) {
    return 0;
  }

  const elapsedMs = Math.max(0, Date.now() - completedMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours >= recoveryHours) return 0;

  const remainingRatio = 1 - (elapsedHours / recoveryHours);
  return Math.max(0, Math.min(100, Math.round(remainingRatio * 100)));
}

export {
  HYPERTROPHY_SESSION_BOOST,
  HYPERTROPHY_STIMULUS_CAP,
  HYPERTROPHY_DAILY_DECAY,
  HYPERTROPHY_DECAY_HORIZON_DAYS,
  hypertrophySessionResidual,
  computePillarStimulusPercent,
  hypertrophyTriageLabel,
};

export default calculateStimulusDecay;
