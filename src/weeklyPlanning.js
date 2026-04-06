/**
 * Struttura piano settimanale (calorie / tipo giorno).
 * Non collegata ai pasti o al log giornaliero in questa fase.
 */

/** @typedef {'deficit' | 'maintenance' | 'training' | 'refeed'} WeeklyPlanDayType */

/**
 * @typedef {object} WeeklyPlanDay
 * @property {WeeklyPlanDayType} type
 * @property {number} kcalTarget
 */

/**
 * @typedef {object} WeeklyPlanState
 * @property {string} goal
 * @property {number} weeklyKcalTarget
 * @property {Record<string, WeeklyPlanDay>} days — chiave consigliata: ISO date `YYYY-MM-DD`
 */

/** @type {WeeklyPlanDayType[]} */
export const WEEKLY_PLAN_DAY_TYPES = ['deficit', 'maintenance', 'training', 'refeed'];

/**
 * @param {WeeklyPlanDayType} type
 * @param {number} kcalTarget
 * @returns {WeeklyPlanDay}
 */
export function createWeeklyPlanDay(type, kcalTarget = 0) {
  return { type, kcalTarget: Number(kcalTarget) || 0 };
}

/**
 * Stato iniziale allineato a `useState` in SalaComandi.
 * @returns {WeeklyPlanState}
 */
export function createInitialWeeklyPlan() {
  return {
    goal: 'recomposition',
    weeklyKcalTarget: 0,
    days: {},
  };
}
