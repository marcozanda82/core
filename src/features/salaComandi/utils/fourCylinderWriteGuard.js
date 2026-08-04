import {
  muscleDecaySum,
  sanitizeFourCylinderState,
} from '../engines/fourCylinderEngine';
import { getLogFromStoricoTree, TRACKER_STORICO_KEY, getTodayString } from '../../../coreEngine';
import { addDays } from '../../../calendarDateUtils';

/** Lookback Data Guard: allenamenti recenti + decay 0 ⇒ scrittura bloccata. */
export const FOUR_CYLINDER_WRITE_GUARD_LOOKBACK_DAYS = 5;

/**
 * @typedef {object} FourCylinderWriteGuardContext
 * @property {object | null} [fullHistory]
 * @property {string | null} [anchorDateIso]
 */

/** @type {FourCylinderWriteGuardContext} */
let guardContext = {
  fullHistory: null,
  anchorDateIso: null,
};

/**
 * Contesto storico per la Data Guard (aggiornato da boot / sync diario).
 * @param {FourCylinderWriteGuardContext} next
 */
export function setFourCylinderWriteGuardContext(next = {}) {
  guardContext = {
    fullHistory: next.fullHistory !== undefined ? next.fullHistory : guardContext.fullHistory,
    anchorDateIso: next.anchorDateIso !== undefined
      ? next.anchorDateIso
      : guardContext.anchorDateIso,
  };
}

/**
 * @returns {FourCylinderWriteGuardContext}
 */
export function getFourCylinderWriteGuardContext() {
  return { ...guardContext };
}

/**
 * Scan minimale: esiste almeno un workout negli ultimi lookbackDays?
 * (Indipendente da fourCylinderRebuild per evitare cicli di import.)
 *
 * @param {object | null | undefined} fullHistory
 * @param {string} anchorDateIso
 * @param {number} lookbackDays
 * @returns {boolean}
 */
function hasRecentWorkoutInHistory(fullHistory, anchorDateIso, lookbackDays) {
  if (!fullHistory || typeof fullHistory !== 'object') return false;
  if (Object.keys(fullHistory).length === 0) return false;
  const anchor = String(anchorDateIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
  const days = Math.max(1, Math.floor(Number(lookbackDays) || 5));

  for (let i = 0; i < days; i += 1) {
    const dateIso = addDays(anchor, -i);
    const log = getLogFromStoricoTree(fullHistory, dateIso) || [];
    for (const entry of log) {
      if (entry && entry.type === 'workout') return true;
    }
    const nodes = fullHistory?.[TRACKER_STORICO_KEY(dateIso)]?.manualNodes || [];
    for (const node of nodes) {
      if (node && node.isGhost !== true && node.type === 'workout') return true;
    }
  }
  return false;
}

/**
 * Sanity check pre-scrittura Firebase.
 * Blocca decay muscolare tutto-zero se esistono allenamenti negli ultimi N giorni.
 *
 * @param {unknown} nextFourCylinderState
 * @param {{
 *   fullHistory?: object | null,
 *   anchorDateIso?: string | null,
 *   lookbackDays?: number,
 *   source?: string,
 * }} [options]
 * @returns {{ ok: true, state: import('../engines/fourCylinderEngine').FourCylinderState }
 *   | { ok: false, reason: string, decaySum: number, hasRecentWorkout: boolean }}
 */
export function evaluateFourCylinderWriteGuard(nextFourCylinderState, options = {}) {
  const state = sanitizeFourCylinderState(nextFourCylinderState);
  const decaySum = muscleDecaySum(state.decay);
  const fullHistory = options.fullHistory !== undefined
    ? options.fullHistory
    : guardContext.fullHistory;
  const anchorDateIso = String(
    options.anchorDateIso
      || guardContext.anchorDateIso
      || getTodayString(),
  ).slice(0, 10);
  const lookbackDays = Math.max(
    3,
    Math.min(5, Math.floor(Number(options.lookbackDays) || FOUR_CYLINDER_WRITE_GUARD_LOOKBACK_DAYS)),
  );

  if (decaySum > 0) {
    return { ok: true, state };
  }

  const hasRecentWorkout = hasRecentWorkoutInHistory(
    fullHistory,
    anchorDateIso,
    lookbackDays,
  );

  if (!hasRecentWorkout) {
    return { ok: true, state };
  }

  const source = options.source || 'persistFourCylinderState';
  const reason = `[fourCylinder:DataGuard] BLOCKED write from ${source}: `
    + `muscle decay sum === 0 but workouts exist in last ${lookbackDays} days `
    + `(anchor=${anchorDateIso}). Refusing to corrupt physiology_model/fourCylinder.`;

  return {
    ok: false,
    reason,
    decaySum,
    hasRecentWorkout: true,
  };
}
