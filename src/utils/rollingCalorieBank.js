/**
 * Rolling Balance — Banca delle Calorie (debito metabolico 48h).
 * Solo surplus (sgarri) genera auto-compensation negativa. Nessun credito da deficit.
 */

import { addDays } from '../calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import { computeDayEnergySnapshot } from '../features/energyBalance/energyBalanceMath';
import { dayHasFoodLog, isDayIntentionalFast } from './dayTrackingStatus';

/** Lookback: ieri + avantieri. */
export const ROLLING_LOOKBACK_DAYS = 2;

/** Hard cap assoluto sulla decurtazione giornaliera (kcal). */
export const ROLLING_AUTO_CAP_ABS_KCAL = 600;

/** Frazione massima del targetCalories base dogmatica. */
export const ROLLING_AUTO_CAP_FRACTION = 0.30;

export const KENTU_GHOST_AUTOPILOT_LS_KEY = 'kentu_ghost_autopilot_global';

/**
 * Tetto safety (valore negativo o 0): −min(30% base, 600).
 * @param {number} settingsBaseKcal
 * @returns {number}
 */
export function resolveRollingAutoCapKcal(settingsBaseKcal) {
  const base = Math.max(0, Math.round(Number(settingsBaseKcal) || 0));
  if (base <= 0) return -ROLLING_AUTO_CAP_ABS_KCAL;
  const fromFraction = Math.round(base * ROLLING_AUTO_CAP_FRACTION);
  return -Math.min(ROLLING_AUTO_CAP_ABS_KCAL, Math.max(0, fromFraction));
}

/**
 * Target operativo per il lookback: base dogmatica stabile (senza carryover / burn).
 * @param {number} settingsBaseKcal
 * @param {object | null | undefined} userTargets
 * @returns {number}
 */
function resolveLookbackOperationalTarget(settingsBaseKcal, userTargets) {
  const fromSettings = Math.round(Number(settingsBaseKcal) || 0);
  if (fromSettings > 0) return fromSettings;
  const fromTargets = Math.round(
    Number(userTargets?.baseKcal)
    || Number(userTargets?.kcal)
    || 0,
  );
  return fromTargets > 0 ? fromTargets : 2000;
}

/**
 * Calcola debito 48h e autoCompensationDelta per "oggi" (asOfDate).
 * Giorni senza tracking non entrano nel saldo (niente debito inventato).
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   settingsBaseKcal?: number | null,
 *   asOfDate?: string | null,
 * }} input
 * @returns {{
 *   asOfDate: string,
 *   lookbackDates: string[],
 *   dayBalances: Array<{ date: string, intakeKcal: number, targetKcal: number, balance: number, hasTrackable: boolean, surplusDebt: number }>,
 *   netDebt48h: number,
 *   autoCapKcal: number,
 *   autoCompensationDelta: number,
 *   remainingDebtAfterCap: number,
 * }}
 */
export function computeRollingCalorieDebt(input = {}) {
  const asOfDate = String(input.asOfDate || getTodayString()).slice(0, 10);
  const tree = input.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : {};
  const userTargets = input.userTargets && typeof input.userTargets === 'object'
    ? input.userTargets
    : {};
  const operationalTarget = resolveLookbackOperationalTarget(
    input.settingsBaseKcal,
    userTargets,
  );
  const autoCapKcal = resolveRollingAutoCapKcal(operationalTarget);

  /** @type {string[]} */
  const lookbackDates = [];
  for (let i = 1; i <= ROLLING_LOOKBACK_DAYS; i += 1) {
    lookbackDates.push(addDays(asOfDate, -i));
  }

  /** @type {Array<object>} */
  const dayBalances = [];
  let netDebt48h = 0;

  for (const date of lookbackDates) {
    const dayNode = tree[TRACKER_STORICO_KEY(date)];
    const log = getLogFromStoricoTree(tree, date) || [];
    const intentional = isDayIntentionalFast(dayNode);
    const hasFood = dayHasFoodLog(log);
    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal: operationalTarget,
      date,
      isIntentionalFast: intentional,
    });
    const hasTrackable = hasFood || intentional || snapshot.hasTrackableData === true;
    const balance = hasTrackable ? Math.round(Number(snapshot.kcalBalance) || 0) : 0;
    // Solo debito da surplus; i deficit non generano credito automatico.
    const surplusDebt = hasTrackable && balance > 0 ? balance : 0;
    netDebt48h += surplusDebt;

    dayBalances.push({
      date,
      intakeKcal: Math.round(Number(snapshot.intakeKcal) || 0),
      targetKcal: operationalTarget,
      balance,
      hasTrackable,
      surplusDebt,
    });
  }

  netDebt48h = Math.max(0, Math.round(netDebt48h));
  const rawAuto = netDebt48h > 0 ? -netDebt48h : 0;
  // Cap: non più negativo di autoCapKcal (es. −600).
  const autoCompensationDelta = rawAuto < 0
    ? Math.max(rawAuto, autoCapKcal)
    : 0;
  const remainingDebtAfterCap = Math.max(0, netDebt48h + autoCompensationDelta);

  return {
    asOfDate,
    lookbackDates,
    dayBalances,
    netDebt48h,
    autoCapKcal,
    autoCompensationDelta,
    remainingDebtAfterCap,
  };
}

/**
 * @param {unknown} raw
 * @param {boolean} [defaultOn=true]
 * @returns {boolean}
 */
export function normalizeGhostAutoPilotEnabled(raw, defaultOn = true) {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false' || raw === 'off') return false;
  return defaultOn === true;
}

/**
 * @returns {boolean}
 */
export function readGhostAutoPilotFromLocalStorage() {
  try {
    const raw = localStorage.getItem(KENTU_GHOST_AUTOPILOT_LS_KEY);
    if (raw == null || raw === '') return true;
    return normalizeGhostAutoPilotEnabled(raw, true);
  } catch {
    return true;
  }
}

/**
 * @param {boolean} enabled
 */
export function writeGhostAutoPilotToLocalStorage(enabled) {
  try {
    localStorage.setItem(KENTU_GHOST_AUTOPILOT_LS_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export default computeRollingCalorieDebt;
