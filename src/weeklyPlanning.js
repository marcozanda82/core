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

/** Tipi giorno selezionabili nell’UI settimanale (subset; `refeed` resta nel modello per uso futuro). */
/** @type {WeeklyPlanDayType[]} */
export const WEEKLY_PLAN_UI_DAY_TYPES = ['deficit', 'maintenance', 'training'];

/** @type {WeeklyPlanDayType[]} */
export const WEEKLY_PLAN_DAY_TYPES = ['deficit', 'maintenance', 'training', 'refeed'];

/** Obiettivo macro settimanale (3 opzioni UI). */
export const WEEKLY_PLAN_GOAL_OPTIONS = [
  { id: 'recomposition', label: 'Ricomposizione' },
  { id: 'cut', label: 'Deficit' },
  { id: 'bulk', label: 'Surplus' },
];

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
