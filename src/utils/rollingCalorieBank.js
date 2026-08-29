/**
 * Rolling Balance — Banca delle Calorie (debito/surplus metabolico 48h).
 * Autopilota a 3 zone: rientro rapido 48h, protetto 72h, cap max di sicurezza.
 */

import { addDays } from '../calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import { computeDayEnergySnapshot } from '../features/energyBalance/energyBalanceMath';
import { dayHasFoodLog, isDayIntentionalFast } from './dayTrackingStatus';

/** Lookback: ieri + avantieri (cicli chiusi). Mai il giorno in corso. */
export const ROLLING_LOOKBACK_DAYS = 2;

/** ~10–12% TDEE: tetto die non stressogeno. */
export const AUTOPILOT_MAX_DAILY_TDEE_FRACTION = 0.11;

/** Fallback TDEE se il profilo non lo espone. */
export const AUTOPILOT_TDEE_FALLBACK_KCAL = 2000;

/** Hard cap legacy (solo display / fallback). */
export const ROLLING_AUTO_CAP_ABS_KCAL = 600;

/** Frazione legacy sul target base. */
export const ROLLING_AUTO_CAP_FRACTION = 0.30;

export const KENTU_GHOST_AUTOPILOT_LS_KEY = 'kentu_ghost_autopilot_global';

export const AUTOPILOT_ZONE = Object.freeze({
  NONE: 0,
  FAST_48H: 1,
  PROTECTED_72H: 2,
  CAP_MAX: 3,
});

/**
 * TDEE operativo per il tetto die: profilo → baseKcal → settings → 2000.
 * @param {{ tdee?: unknown, userProfile?: object, userTargets?: object, settingsBaseKcal?: unknown }} input
 * @returns {number}
 */
export function resolveAutopilotTdeeKcal(input = {}) {
  const candidates = [
    input.tdee,
    input.userProfile?.tdee,
    input.userTargets?.baseKcal,
    input.settingsBaseKcal,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const n = Math.round(Number(candidates[i]) || 0);
    if (n > 0) return n;
  }
  return AUTOPILOT_TDEE_FALLBACK_KCAL;
}

/**
 * Delta massimo die non stressogeno (~11% TDEE).
 * @param {unknown} tdee
 * @returns {number}
 */
export function resolveMaxDailyDelta(tdee) {
  const base = Math.round(Number(tdee) || 0);
  const safe = base > 0 ? base : AUTOPILOT_TDEE_FALLBACK_KCAL;
  return Math.max(0, Math.round(safe * AUTOPILOT_MAX_DAILY_TDEE_FRACTION));
}

/**
 * Tetto safety legacy (valore negativo o 0): −min(30% base, 600).
 * @param {number} settingsBaseKcal
 * @returns {number}
 */
export function resolveRollingAutoCapKcal(settingsBaseKcal) {
  const maxDaily = resolveMaxDailyDelta(settingsBaseKcal);
  if (maxDaily > 0) return -maxDaily;
  const base = Math.max(0, Math.round(Number(settingsBaseKcal) || 0));
  if (base <= 0) return -ROLLING_AUTO_CAP_ABS_KCAL;
  const fromFraction = Math.round(base * ROLLING_AUTO_CAP_FRACTION);
  return -Math.min(ROLLING_AUTO_CAP_ABS_KCAL, Math.max(0, fromFraction));
}

/**
 * Strategia Autopilota a 3 zone sul debito/surplus 48h.
 * dailyCorrection ha il segno del debito; autoCompensationDelta = −dailyCorrection
 * (targetEffettivo = targetManuale − dailyCorrection).
 *
 * @param {unknown} debito48h
 * @param {unknown} maxDailyDelta
 * @returns {{
 *   zone: number,
 *   days: number,
 *   dailyCorrection: number,
 *   autoCompensationDelta: number,
 *   fullRecovery: boolean,
 *   remainingDebtAfterCap: number,
 *   strategy: { days: number, label: string, fullRecovery: boolean, icon: string },
 * }}
 */
export function resolveAutopilotZoneStrategy(debito48h, maxDailyDelta) {
  const debt = Math.round(Number(debito48h) || 0);
  const cap = Math.max(0, Math.round(Number(maxDailyDelta) || 0));
  const absDebt = Math.abs(debt);

  if (absDebt === 0 || cap <= 0) {
    return {
      zone: AUTOPILOT_ZONE.NONE,
      days: 0,
      dailyCorrection: 0,
      autoCompensationDelta: 0,
      fullRecovery: true,
      remainingDebtAfterCap: 0,
      strategy: {
        days: 0,
        label: 'In fascia',
        fullRecovery: true,
        icon: '🛡️',
      },
    };
  }

  let zone = AUTOPILOT_ZONE.CAP_MAX;
  let dailyCorrection = debt > 0 ? cap : -cap;
  let strategy = {
    days: 3,
    label: 'Rientro controllato al tetto di sicurezza',
    fullRecovery: false,
    icon: '🛡️',
  };

  if (absDebt <= cap * 2) {
    zone = AUTOPILOT_ZONE.FAST_48H;
    dailyCorrection = Math.round(debt / 2);
    strategy = {
      days: 2,
      label: 'Rientro rapido (48h)',
      fullRecovery: true,
      icon: '⚡',
    };
  } else if (absDebt <= cap * 3) {
    zone = AUTOPILOT_ZONE.PROTECTED_72H;
    dailyCorrection = Math.round(debt / 3);
    strategy = {
      days: 3,
      label: 'Rientro protetto (72h - Anti-stress)',
      fullRecovery: true,
      icon: '🛡️',
    };
  }

  const autoCompensationDelta = -dailyCorrection;
  const recoveredToday = Math.abs(dailyCorrection);
  const remainingDebtAfterCap = strategy.fullRecovery
    ? 0
    : Math.max(0, absDebt - recoveredToday);

  return {
    zone,
    days: strategy.days,
    dailyCorrection,
    autoCompensationDelta,
    fullRecovery: strategy.fullRecovery,
    remainingDebtAfterCap,
    strategy,
  };
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
 * Calcola debito 48h (segno: + surplus, − deficit) e strategia Autopilota 3 zone.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   userProfile?: object | null,
 *   settingsBaseKcal?: number | null,
 *   tdee?: number | null,
 *   asOfDate?: string | null,
 * }} input
 * @returns {{
 *   asOfDate: string,
 *   lookbackDates: string[],
 *   dayBalances: Array<{ date: string, intakeKcal: number, targetKcal: number, balance: number, hasTrackable: boolean, surplusDebt: number }>,
 *   netDebt48h: number,
 *   tdee: number,
 *   maxDailyDelta: number,
 *   autoCapKcal: number,
 *   autoCompensationDelta: number,
 *   dailyCorrection: number,
 *   remainingDebtAfterCap: number,
 *   zone: number,
 *   strategy: { days: number, label: string, fullRecovery: boolean, icon: string },
 *   fullRecovery: boolean,
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
  const tdee = resolveAutopilotTdeeKcal({
    tdee: input.tdee,
    userProfile: input.userProfile,
    userTargets,
    settingsBaseKcal: input.settingsBaseKcal,
  });
  const maxDailyDelta = resolveMaxDailyDelta(tdee);
  const autoCapKcal = -maxDailyDelta;

  /** @type {string[]} */
  const lookbackDates = [];
  for (let i = 1; i <= ROLLING_LOOKBACK_DAYS; i += 1) {
    lookbackDates.push(addDays(asOfDate, -i));
  }

  /** @type {Array<object>} */
  const dayBalances = [];
  let netDebt48h = 0;

  const todayIso = getTodayString();
  for (const date of lookbackDates) {
    if (date >= todayIso) continue;

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
    const surplusDebt = hasTrackable && balance > 0 ? balance : 0;
    netDebt48h += balance;

    dayBalances.push({
      date,
      intakeKcal: Math.round(Number(snapshot.intakeKcal) || 0),
      targetKcal: operationalTarget,
      balance,
      hasTrackable,
      surplusDebt,
    });
  }

  netDebt48h = Math.round(netDebt48h);
  const zonePlan = resolveAutopilotZoneStrategy(netDebt48h, maxDailyDelta);

  return {
    asOfDate,
    lookbackDates,
    dayBalances,
    netDebt48h,
    tdee,
    maxDailyDelta,
    autoCapKcal,
    autoCompensationDelta: zonePlan.autoCompensationDelta,
    dailyCorrection: zonePlan.dailyCorrection,
    remainingDebtAfterCap: zonePlan.remainingDebtAfterCap,
    zone: zonePlan.zone,
    strategy: zonePlan.strategy,
    fullRecovery: zonePlan.fullRecovery,
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
