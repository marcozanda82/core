/**
 * Rolling Balance — Banca delle Calorie (finestra mobile 3 cicli chiusi).
 * Autopilota: deadband 5% TDEE → standby; oltre, rientro a zero con cap 11% TDEE.
 */

import { addDays } from '../calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import { computeDayEnergySnapshot } from '../features/energyBalance/energyBalanceMath';
import { dayHasFoodLog, isDayIntentionalFast } from './dayTrackingStatus';

/** Lookback: ieri, avantieri, 3 giorni fa (cicli chiusi). Mai il giorno in corso. */
export const ROLLING_LOOKBACK_DAYS = 3;

/** Zona neutra: sotto questa frazione di TDEE l'Autopilota resta in standby. */
export const AUTOPILOT_DEADBAND_FRACTION = 0.05;

/** Tetto die non stressogeno (~11% TDEE). */
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
 * Soglia deadband (~5% TDEE): sotto, correzione = 0.
 * @param {unknown} tdee
 * @returns {number}
 */
export function resolveDeadbandDelta(tdee) {
  const base = Math.round(Number(tdee) || 0);
  const safe = base > 0 ? base : AUTOPILOT_TDEE_FALLBACK_KCAL;
  return Math.max(0, Math.round(safe * AUTOPILOT_DEADBAND_FRACTION));
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
 * Strategia Autopilota: deadband 5% TDEE, poi rientro a zero in 2–3 giorni
 * con clamp giornaliero ±cap (11% TDEE).
 * dailyCorrection ha il segno del debito; autoCompensationDelta = −dailyCorrection
 * (targetEffettivo = targetManuale − dailyCorrection).
 *
 * @param {unknown} netDebt
 * @param {unknown} maxDailyDelta
 * @param {unknown} [deadbandDelta]
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
export function resolveAutopilotZoneStrategy(netDebt, maxDailyDelta, deadbandDelta = 0) {
  const debt = Math.round(Number(netDebt) || 0);
  const cap = Math.max(0, Math.round(Number(maxDailyDelta) || 0));
  const deadband = Math.max(0, Math.round(Number(deadbandDelta) || 0));
  const absDebt = Math.abs(debt);

  const standby = () => ({
    zone: AUTOPILOT_ZONE.NONE,
    days: 0,
    dailyCorrection: 0,
    autoCompensationDelta: 0,
    fullRecovery: true,
    remainingDebtAfterCap: 0,
    strategy: {
      days: 0,
      label: 'Zona neutra · standby (≤5% TDEE)',
      fullRecovery: true,
      icon: '🛡️',
    },
  });

  if (cap <= 0 || absDebt <= deadband) {
    return standby();
  }

  const signed = (absDaily) => (debt > 0 ? absDaily : -absDaily);
  let zone = AUTOPILOT_ZONE.CAP_MAX;
  let days = 3;
  let dailyCorrection = signed(cap);
  let strategy = {
    days: 3,
    label: 'Rientro a zero al tetto di sicurezza',
    fullRecovery: false,
    icon: '🛡️',
  };

  const half = Math.abs(Math.round(debt / 2));
  const third = Math.abs(Math.round(debt / 3));

  if (half > 0 && half <= cap) {
    zone = AUTOPILOT_ZONE.FAST_48H;
    days = 2;
    dailyCorrection = signed(half);
    strategy = {
      days: 2,
      label: 'Rientro a zero (48h)',
      fullRecovery: true,
      icon: '⚡',
    };
  } else if (third > 0 && third <= cap) {
    zone = AUTOPILOT_ZONE.PROTECTED_72H;
    days = 3;
    dailyCorrection = signed(third);
    strategy = {
      days: 3,
      label: 'Rientro a zero (72h)',
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
    days,
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
 * Calcola il debito sulla finestra mobile (3 cicli chiusi) e la strategia Autopilota.
 * `netDebt48h` resta il nome API del saldo netto lookback (ora 3 giorni).
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
 *   deadbandDelta: number,
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
  const deadbandDelta = resolveDeadbandDelta(tdee);
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
  const zonePlan = resolveAutopilotZoneStrategy(netDebt48h, maxDailyDelta, deadbandDelta);

  return {
    asOfDate,
    lookbackDates,
    dayBalances,
    netDebt48h,
    tdee,
    maxDailyDelta,
    deadbandDelta,
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

/**
 * Snapshot immutabile della correzione Autopilota sul nodo diario del giorno.
 * Fallback 0 se il campo non esiste (giorni pre-migrazione).
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeAutopilotCorrection(raw) {
  if (raw == null || raw === '') return 0;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {object | null | undefined} dayNode
 * @returns {number}
 */
export function readAutopilotCorrectionFromDayNode(dayNode) {
  if (!dayNode || typeof dayNode !== 'object') return 0;
  if (!Object.prototype.hasOwnProperty.call(dayNode, 'autopilotCorrection')) return 0;
  return normalizeAutopilotCorrection(dayNode.autopilotCorrection);
}

/**
 * @param {object | null | undefined} fullHistory
 * @param {string | null | undefined} dateIso
 * @returns {number}
 */
export function readAutopilotCorrectionForDate(fullHistory, dateIso) {
  const dateKey = String(dateIso || '').slice(0, 10);
  if (!dateKey || !fullHistory || typeof fullHistory !== 'object') return 0;
  return readAutopilotCorrectionFromDayNode(fullHistory[TRACKER_STORICO_KEY(dateKey)]);
}

/**
 * Preserva `autopilotCorrection` nei payload che fanno `set()` sull'intero nodo giorno.
 * @param {object} payload
 * @param {object | null | undefined} existingDayNode
 * @returns {object}
 */
export function withPreservedAutopilotCorrection(payload, existingDayNode) {
  const next = payload && typeof payload === 'object' ? { ...payload } : {};
  if (Object.prototype.hasOwnProperty.call(existingDayNode || {}, 'autopilotCorrection')) {
    next.autopilotCorrection = readAutopilotCorrectionFromDayNode(existingDayNode);
  }
  return next;
}

export default computeRollingCalorieDebt;
