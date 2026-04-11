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

/**
 * Lunedì della settimana locale che contiene `anchor` (ISO date `YYYY-MM-DD` o `Date`).
 * Usato come chiave RTDB `weeklyPlanning/{uid}/{weekStartDate}`.
 * @param {string | Date} [anchor]
 * @returns {string} `YYYY-MM-DD`
 */
export function getWeekStartMondayKeyLocal(anchor) {
  let y;
  let m;
  let d;
  if (anchor instanceof Date && !Number.isNaN(anchor.getTime())) {
    y = anchor.getFullYear();
    m = anchor.getMonth();
    d = anchor.getDate();
  } else {
    const s = String(anchor || '').trim();
    const parts = s.split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      const now = new Date();
      y = now.getFullYear();
      m = now.getMonth();
      d = now.getDate();
    } else {
      y = parts[0];
      m = parts[1] - 1;
      d = parts[2];
    }
  }
  const date = new Date(y, m, d);
  const dow = date.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + delta);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * @param {unknown} raw
 * @returns {WeeklyPlanState}
 */
export function sanitizeWeeklyPlanFromFirebase(raw) {
  const base = createInitialWeeklyPlan();
  if (!raw || typeof raw !== 'object') return base;
  const goal = typeof raw.goal === 'string' && raw.goal.trim() !== '' ? raw.goal.trim() : base.goal;
  const wkt = Number(raw.weeklyKcalTarget);
  const weeklyKcalTarget = Number.isFinite(wkt) ? wkt : 0;
  const days = {};
  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (!v || typeof v !== 'object') continue;
      const key = String(k).trim();
      if (!key) continue;
      const t = v.type;
      const type = WEEKLY_PLAN_DAY_TYPES.includes(t) ? t : 'maintenance';
      days[key] = createWeeklyPlanDay(type, v.kcalTarget);
    }
  }
  return { goal, weeklyKcalTarget, days };
}

/** Firma stabile per confronto locale/remoto (senza `updatedAt`). */
export function weeklyPlanStableJson(plan) {
  const s = sanitizeWeeklyPlanFromFirebase(plan);
  const sortedDays = {};
  Object.keys(s.days)
    .sort()
    .forEach((k) => {
      sortedDays[k] = { type: s.days[k].type, kcalTarget: s.days[k].kcalTarget };
    });
  return JSON.stringify({ goal: s.goal, weeklyKcalTarget: s.weeklyKcalTarget, days: sortedDays });
}

/** Payload RTDB (percorso `weeklyPlanning/`, separato da `planning/` giornaliero). */
export function weeklyPlanToFirebasePayload(plan) {
  const s = sanitizeWeeklyPlanFromFirebase(plan);
  const daysOut = {};
  Object.keys(s.days).forEach((k) => {
    daysOut[k] = { type: s.days[k].type, kcalTarget: s.days[k].kcalTarget };
  });
  return {
    goal: s.goal,
    weeklyKcalTarget: s.weeklyKcalTarget,
    days: daysOut,
    updatedAt: Date.now(),
  };
}

/**
 * Kcal giornaliera per PlanningWizard: da piano settimanale se valido, altrimenti profilo.
 * @param {object | null | undefined} userTargets
 * @param {WeeklyPlanState | null | undefined} weeklyPlan
 * @param {string | null | undefined} planningDateKey `YYYY-MM-DD`
 * @returns {{ kcal: number, fromWeeklyPlan: boolean }}
 */
export function resolvePlanningWizardDailyKcal(userTargets, weeklyPlan, planningDateKey) {
  const profileKcal = Number(userTargets?.kcal ?? 2000) || 2000;
  if (!weeklyPlan || typeof weeklyPlan !== 'object') {
    return { kcal: profileKcal, fromWeeklyPlan: false };
  }
  const key = planningDateKey != null && String(planningDateKey).trim() !== '' ? String(planningDateKey).trim() : '';
  if (!key) {
    return { kcal: profileKcal, fromWeeklyPlan: false };
  }
  const day = weeklyPlan.days?.[key];
  if (!day || typeof day !== 'object') {
    return { kcal: profileKcal, fromWeeklyPlan: false };
  }
  const wk = Number(day.kcalTarget);
  if (!Number.isFinite(wk) || wk <= 0) {
    return { kcal: profileKcal, fromWeeklyPlan: false };
  }
  return { kcal: wk, fromWeeklyPlan: true };
}
