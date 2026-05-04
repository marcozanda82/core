/**
 * Coach giornaliero: regole su dati reali, tono leggero, anti-spam per fascia oraria.
 */

import { toCanonicalMealType } from './coreEngine';

export const AI_COACH_PREFS_KEY = 'ai_coach_prefs_v1';
export const AI_COACH_PERIOD_KEY = 'ai_coach_period_budget_v1';

export const COACH_RULE = {
  NO_FOOD: 'no_food',
  CAL_LOW: 'cal_low',
  CAL_HIGH: 'cal_high',
  LIGHT_BREAKFAST: 'light_breakfast',
  LOW_PROT: 'low_prot',
};

function safeLsGet(key) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function safeLsSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(val));
    }
  } catch (_) {}
}

/** Fascia giorno locale (max 1 suggerimento per fascia). */
export function getCoachPeriod(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return 'evening';
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

export function readCoachPeriodBudget(todayStr) {
  const raw = safeLsGet(AI_COACH_PERIOD_KEY);
  if (!raw || raw.date !== todayStr) {
    return { date: todayStr, morning: false, afternoon: false, evening: false };
  }
  return {
    date: todayStr,
    morning: !!raw.morning,
    afternoon: !!raw.afternoon,
    evening: !!raw.evening,
  };
}

export function consumeCoachPeriod(todayStr, period) {
  const cur = readCoachPeriodBudget(todayStr);
  cur[period] = true;
  cur.date = todayStr;
  safeLsSet(AI_COACH_PERIOD_KEY, cur);
}

export function readCoachPrefs() {
  const raw = safeLsGet(AI_COACH_PREFS_KEY);
  return raw && typeof raw === 'object'
    ? { ignored: raw.ignored || {}, accepted: raw.accepted || {} }
    : { ignored: {}, accepted: {} };
}

export function recordCoachIgnore(ruleId) {
  const id = String(ruleId || '').trim();
  if (!id) return;
  const p = readCoachPrefs();
  const prev = p.ignored[id] || { count: 0, days: [] };
  const days = Array.isArray(prev.days) ? [...prev.days] : [];
  const today = new Date().toISOString().slice(0, 10);
  if (!days.includes(today)) days.push(today);
  while (days.length > 14) days.shift();
  p.ignored[id] = { count: (Number(prev.count) || 0) + 1, days };
  safeLsSet(AI_COACH_PREFS_KEY, p);
}

export function recordCoachAccept(ruleId) {
  const id = String(ruleId || '').trim();
  if (!id) return;
  const p = readCoachPrefs();
  p.accepted[id] = (Number(p.accepted[id]) || 0) + 1;
  const ign = p.ignored[id];
  if (ign && Number(ign.count) > 0) {
    p.ignored[id] = { ...ign, count: Math.max(0, Number(ign.count) - 1) };
  }
  safeLsSet(AI_COACH_PREFS_KEY, p);
}

/** Dopo N ignore recenti, sopprimi la regola per un po'. */
export function shouldSuppressRule(ruleId) {
  const id = String(ruleId || '').trim();
  if (!id) return false;
  const row = readCoachPrefs().ignored[id];
  if (!row || Number(row.count) < 4) return false;
  const days = Array.isArray(row.days) ? row.days : [];
  const last = days[days.length - 1];
  if (!last) return false;
  const t = Date.parse(`${last}T23:59:59`);
  return Date.now() - t < 3 * 24 * 60 * 60 * 1000;
}

/**
 * @param {Array} todayMeals — opzionale; se assente si usa solo i totali da `analysis`.
 */
export function buildDayState(meals, targetCalories, analysis) {
  const a = analysis || {};
  const totalCalories =
    a.totalCalories != null
      ? Number(a.totalCalories)
      : (meals || []).reduce((s, m) => {
        const sub = (m?.foods || []).reduce((t, f) => t + (Number(f?.kcal) || 0), 0);
        return s + sub;
      }, 0);

  const tgt = targetCalories != null && Number.isFinite(Number(targetCalories)) ? Number(targetCalories) : null;

  return {
    totalCalories,
    targetCalories: tgt,
    calorieGap: tgt != null ? tgt - totalCalories : null,
    mealCount:
      a.mealSlotsWithFood != null
        ? a.mealSlotsWithFood
        : (meals || []).filter((m) => (m?.foods || []).length > 0).length,
    ...a,
  };
}

/**
 * Analizza il log giornaliero (voci food/recipe).
 * @param {function} toCanon — es. toCanonicalMealType
 */
export function analyzeTodayFromLog(log, toCanon = toCanonicalMealType) {
  const dist = { colazione: 0, pranzo: 0, cena: 0, snack: 0 };
  let totalCalories = 0;
  let totalProt = 0;
  const slots = new Set();
  let foodCount = 0;

  (log || []).forEach((e) => {
    if (!e || (e.type !== 'food' && e.type !== 'recipe')) return;
    foodCount += 1;
    const raw = String(e.mealType || 'snack').split('_')[0];
    const k0 = toCanon(raw);
    const k = ['colazione', 'pranzo', 'cena', 'snack'].includes(k0) ? k0 : 'snack';
    const kcal = Number(e.kcal ?? e.cal) || 0;
    const prot = Number(e.prot ?? e.proteine) || 0;
    totalCalories += kcal;
    totalProt += prot;
    dist[k] += kcal;
    slots.add(k);
  });

  const mealSlotsWithFood = slots.size;
  const breakfastShare = totalCalories > 0 ? dist.colazione / totalCalories : 0;
  const protPerKcal = totalCalories > 0 ? totalProt / totalCalories : 0;

  return {
    totalCalories,
    totalProt,
    calorieDistribution: dist,
    mealSlotsWithFood,
    foodCount,
    breakfastShare,
    protPerKcal,
  };
}

function pickMealTypeForAction(ruleId, decimalHour) {
  const h = Number(decimalHour) || 12;
  if (ruleId === COACH_RULE.NO_FOOD) return h < 11.5 ? 'colazione' : 'pranzo';
  if (ruleId === COACH_RULE.CAL_LOW) return h < 16 ? 'pranzo' : 'cena';
  if (ruleId === COACH_RULE.LIGHT_BREAKFAST) return 'colazione';
  if (ruleId === COACH_RULE.LOW_PROT) return h < 15 ? 'pranzo' : 'cena';
  return 'snack';
}

/**
 * @param {object} input
 * @param {Array} input.todayLog — log piatto (activeLog)
 * @param {number} input.targetCalories
 * @param {number} input.decimalHour — ora locale (getWallClockDecimalHour)
 * @param {string} input.todayStr — YYYY-MM-DD
 * @param {function} [input.toCanonicalMealType]
 */
export function evaluateAiDayCoach(input) {
  const {
    todayLog = [],
    userHistory: _userHistory = [],
    targetCalories,
    decimalHour,
    todayStr,
    toCanonicalMealType: toCanon = toCanonicalMealType,
  } = input || {};

  const analysis = analyzeTodayFromLog(todayLog, toCanon);
  const state = buildDayState(null, targetCalories, analysis);
  const h = Number(decimalHour);
  const period = getCoachPeriod(h);
  const budget = readCoachPeriodBudget(String(todayStr || '').slice(0, 10) || new Date().toISOString().slice(0, 10));

  if (budget[period]) {
    if (import.meta.env?.DEV) {
      logAiCoachDevOnce(state, null, { reason: 'period_budget', period });
    }
    return { suggestion: null, state, period };
  }

  const tgt = state.targetCalories;
  const rules = [];

  if (analysis.foodCount === 0 && h >= 10) {
    rules.push({
      id: COACH_RULE.NO_FOOD,
      priority: 85,
      message: 'Non hai ancora registrato nulla oggi 👀',
      action: { label: '✨ Crea pasto', mealType: pickMealTypeForAction(COACH_RULE.NO_FOOD, h) },
    });
  }

  if (tgt != null && tgt > 0 && state.calorieGap != null && state.calorieGap > 600 && h >= 13) {
    rules.push({
      id: COACH_RULE.CAL_LOW,
      priority: 72,
      message: 'Sei un po’ basso di energia oggi',
      action: { label: '✨ Crea pasto', mealType: pickMealTypeForAction(COACH_RULE.CAL_LOW, h) },
    });
  }

  if (tgt != null && tgt > 0 && state.totalCalories > tgt * 1.2) {
    rules.push({
      id: COACH_RULE.CAL_HIGH,
      priority: 88,
      message: 'Hai già superato un po’ il target di oggi',
      action: null,
    });
  }

  if (analysis.totalCalories > 180 && analysis.breakfastShare < 0.12 && h >= 11 && h < 14) {
    rules.push({
      id: COACH_RULE.LIGHT_BREAKFAST,
      priority: 58,
      message: 'Colazione leggera oggi — se ti va, recupera senza stress',
      action: { label: '✨ Crea pasto', mealType: pickMealTypeForAction(COACH_RULE.LIGHT_BREAKFAST, h) },
    });
  }

  if (analysis.totalCalories > 350 && h >= 14 && (analysis.totalProt < 45 || analysis.protPerKcal < 0.07)) {
    rules.push({
      id: COACH_RULE.LOW_PROT,
      priority: 62,
      message: 'Le proteine potrebbero essere un po’ basse — un pasto ricco ti aiuta',
      action: { label: '✨ Crea pasto', mealType: pickMealTypeForAction(COACH_RULE.LOW_PROT, h) },
    });
  }

  rules.sort((a, b) => b.priority - a.priority);

  let chosen = null;
  for (let i = 0; i < rules.length; i += 1) {
    if (!shouldSuppressRule(rules[i].id)) {
      chosen = rules[i];
      break;
    }
  }

  const suggestion = chosen
    ? {
        message: chosen.message,
        ruleId: chosen.id,
        priority: chosen.priority,
        action: chosen.action,
      }
    : null;

  if (import.meta.env?.DEV) {
    logAiCoachDevOnce(state, suggestion, { period });
  }

  return { suggestion, state, period };
}

/** Evita log DEV ripetuti con stesso stato/suggerimento tra re-render React. */
let __aiCoachDevLogKey = '';
function logAiCoachDevOnce(state, suggestion, extra) {
  if (!import.meta.env?.DEV) return;
  const key = [
    extra?.reason ?? '',
    extra?.period ?? '',
    state?.totalCalories ?? '',
    state?.mealCount ?? '',
    state?.foodCount ?? '',
    state?.totalProt ?? '',
    suggestion?.ruleId ?? '',
    suggestion?.message ?? '',
  ].join('|');
  if (key === __aiCoachDevLogKey) return;
  __aiCoachDevLogKey = key;
  // eslint-disable-next-line no-console
  console.log('[AI COACH]', state, suggestion, extra);
}
