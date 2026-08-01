/**
 * Compensazione Esplicita (Ghost Car) — piano di rientro opzionale, mai automatico.
 * Target Totale = Base + Burn + Strategy Delta + Compensazione Esplicita.
 */

import { addDays, differenceInCalendarDays } from '../calendarDateUtils';
import { getTodayString } from '../coreEngine';

/** Soglia |ΣΔ − Ghost| per mostrare «Pianifica Rientro». */
export const COMPENSATION_DEVIATION_TRIGGER_KCAL = 150;

/** Tetto suggerito per lo spalmatura giornaliera (±kcal). */
export const COMPENSATION_MAX_DAILY_SUGGEST_KCAL = 250;

/** Limiti input manuali. */
export const COMPENSATION_DAYS_MIN = 1;
export const COMPENSATION_DAYS_MAX = 21;
export const COMPENSATION_DAILY_ABS_MAX = 800;

/**
 * Proposta di rientro: spalmatura con tetto ±250 kcal/g.
 * dailyDelta ha segno opposto allo scostamento (surplus → taglio).
 *
 * @param {number} deviationKcal real − ghost (Σ)
 * @returns {{
 *   totalDeviation: number,
 *   days: number,
 *   dailyDelta: number,
 *   totalCorrection: number,
 * }}
 */
export function proposeCompensationPlan(deviationKcal) {
  const totalDeviation = Math.round(Number(deviationKcal) || 0);
  const abs = Math.abs(totalDeviation);
  if (abs < 1) {
    return {
      totalDeviation: 0,
      days: 0,
      dailyDelta: 0,
      totalCorrection: 0,
    };
  }

  let days = Math.max(
    COMPENSATION_DAYS_MIN,
    Math.ceil(abs / COMPENSATION_MAX_DAILY_SUGGEST_KCAL),
  );
  days = Math.min(COMPENSATION_DAYS_MAX, days);

  let dailyDelta = -Math.round(totalDeviation / days);
  while (
    Math.abs(dailyDelta) > COMPENSATION_MAX_DAILY_SUGGEST_KCAL
    && days < COMPENSATION_DAYS_MAX
  ) {
    days += 1;
    dailyDelta = -Math.round(totalDeviation / days);
  }

  return {
    totalDeviation,
    days,
    dailyDelta,
    totalCorrection: days * dailyDelta,
  };
}

/**
 * Normalizza payload piano da salvare.
 * @param {object} raw
 * @param {string} [fallbackStartIso]
 * @returns {{
 *   dailyDelta: number,
 *   days: number,
 *   startDate: string,
 *   totalDeviation: number,
 *   createdAt: string,
 * } | null}
 */
export function normalizeActiveCompensation(raw, fallbackStartIso = null) {
  if (!raw || typeof raw !== 'object') return null;
  const days = Math.max(
    COMPENSATION_DAYS_MIN,
    Math.min(COMPENSATION_DAYS_MAX, Math.round(Number(raw.days) || 0)),
  );
  const dailyDelta = Math.max(
    -COMPENSATION_DAILY_ABS_MAX,
    Math.min(COMPENSATION_DAILY_ABS_MAX, Math.round(Number(raw.dailyDelta) || 0)),
  );
  if (days < 1 || dailyDelta === 0) return null;

  const startDate = String(raw.startDate || fallbackStartIso || getTodayString()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  return {
    dailyDelta,
    days,
    startDate,
    totalDeviation: Math.round(Number(raw.totalDeviation) || 0),
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

/**
 * @param {object | null | undefined} comp
 * @param {string} dateIso
 * @returns {{
 *   isActive: boolean,
 *   dailyDelta: number,
 *   dayIndex: number,
 *   daysRemaining: number,
 *   endDate: string | null,
 *   plan: object | null,
 * }}
 */
export function resolveActiveCompensationOnDate(comp, dateIso) {
  const plan = normalizeActiveCompensation(comp);
  const date = String(dateIso || getTodayString()).slice(0, 10);
  if (!plan) {
    return {
      isActive: false,
      dailyDelta: 0,
      dayIndex: -1,
      daysRemaining: 0,
      endDate: null,
      plan: null,
    };
  }

  const endDate = addDays(plan.startDate, plan.days - 1);
  const dayIndex = differenceInCalendarDays(plan.startDate, date);
  const isActive = Number.isFinite(dayIndex) && dayIndex >= 0 && dayIndex < plan.days;

  return {
    isActive,
    dailyDelta: isActive ? plan.dailyDelta : 0,
    dayIndex: isActive ? dayIndex : -1,
    daysRemaining: isActive ? plan.days - dayIndex : 0,
    endDate,
    plan,
  };
}

/**
 * Delta giornaliero da aggiungere all'equazione dogmatica.
 * @param {object | null | undefined} comp
 * @param {string} [dateIso]
 * @returns {number}
 */
export function resolveActiveCompensationDailyDelta(comp, dateIso) {
  return resolveActiveCompensationOnDate(comp, dateIso).dailyDelta;
}
