/**
 * forceIntensity — force-ci-1.
 * 0.5 × min(1, giorniForzaSett / obiettivo)
 * + 0.5 × (gruppi principali coperti negli ultimi 7 giorni / 5)
 */

import { FORCE_CI_VERSION } from './versions.js';
import { computeCostanzaForza, normalizeWeeklyGoalDays } from './costanzaForza.js';

export { FORCE_CI_VERSION };

/**
 * Carica blu (0–1) senza gate score/forza enabled — quelli restano in computeDayScore.
 * @param {string} date
 * @param {object|null|undefined} fullHistory
 * @param {{ weeklyGoalDays?: number }} [opts]
 * @returns {number}
 */
export function forceLoadConsistency(date, fullHistory, opts = {}) {
  const asOf = String(date || '').slice(0, 10);
  const snap = computeCostanzaForza({
    fullHistory,
    asOfDate: asOf,
    weeklyGoalDays: normalizeWeeklyGoalDays(opts.weeklyGoalDays),
  });
  const goal = snap.weeklyGoalDays;
  const dayPart = goal > 0 ? Math.min(1, snap.forceDaysThisWeek / goal) : 0;
  const coverPart = snap.forceCiGroupTotal > 0
    ? snap.forceCiCoveredCount / snap.forceCiGroupTotal
    : 0;
  const value = 0.5 * dayPart + 0.5 * coverPart;
  return Math.min(1, Math.round(value * 1000) / 1000);
}
