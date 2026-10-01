import { computeTotali } from '../../useBiochimico.js';
import { excludeEditingMealSlotFromLog } from './excludeEditingMealSlotFromLog.js';
import { classifyMacroVsTarget } from './classifyMacroVsTarget.js';
import { normalizeDraftMealToLogFoods } from './normalizeDraftMealToLogFoods.js';

function roundKcal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function emptyMacros() {
  return { kcal: 0, prot: 0, carb: 0, fat: 0 };
}

function macrosFromTotali(totali) {
  return {
    kcal: roundKcal(totali?.kcal ?? totali?.cal ?? 0),
    prot: roundMacro(totali?.prot ?? totali?.pro ?? 0),
    carb: roundMacro(totali?.carb ?? totali?.carbo ?? totali?.cho ?? 0),
    fat: roundMacro(totali?.fatTotal ?? totali?.fat ?? 0),
  };
}

function resolveEffectiveTargets(effectiveTargets = {}) {
  const kcal = Object.prototype.hasOwnProperty.call(effectiveTargets, 'kcal')
    ? roundKcal(effectiveTargets.kcal)
    : roundKcal(effectiveTargets.effectiveDailyKcal);
  return {
    kcal,
    prot: roundMacro(effectiveTargets.prot ?? effectiveTargets.pro ?? 0),
    carb: roundMacro(effectiveTargets.carb ?? effectiveTargets.carbo ?? effectiveTargets.cho ?? 0),
    fat: roundMacro(effectiveTargets.fat ?? effectiveTargets.fatTotal ?? 0),
  };
}

function resolveLogBefore(currentDailyLog, editingContext) {
  const log = Array.isArray(currentDailyLog) ? currentDailyLog : [];
  const slotItems = editingContext?.slotItems
    ?? editingContext?.excludeSlotItems
    ?? null;
  if (Array.isArray(slotItems) && slotItems.length > 0) {
    return excludeEditingMealSlotFromLog(log, slotItems);
  }
  return log;
}

function signedRemaining(target, after) {
  return {
    kcal: roundKcal(target.kcal - after.kcal),
    prot: roundMacro(target.prot - after.prot),
    carb: roundMacro(target.carb - after.carb),
    fat: roundMacro(target.fat - after.fat),
  };
}

function statusFromAfterVsTarget(after, target) {
  return {
    kcal: classifyMacroVsTarget(after.kcal, target.kcal),
    prot: classifyMacroVsTarget(after.prot, target.prot),
    carb: classifyMacroVsTarget(after.carb, target.carb),
    fat: classifyMacroVsTarget(after.fat, target.fat),
  };
}

function gapRatioFromRemaining(remaining, target) {
  const ratio = (rem, tgt) => {
    const t = Number(tgt);
    if (!Number.isFinite(t) || t === 0) return null;
    const v = Number(rem) / t;
    if (!Number.isFinite(v)) return null;
    return Math.round(v * 10000) / 10000;
  };
  return {
    prot: ratio(remaining.prot, target.prot),
    carb: ratio(remaining.carb, target.carb),
    fat: ratio(remaining.fat, target.fat),
    kcal: ratio(remaining.kcal, target.kcal),
  };
}

/**
 * Projection Engine: stato giorno + bozza → situazione dopo conferma.
 * Read-only, locale, senza Gemini.
 *
 * @param {{
 *   effectiveTargets?: object,
 *   currentDailyLog?: unknown[],
 *   draftMeal?: unknown,
 *   editingContext?: { slotItems?: unknown[] } | null,
 * }} [input]
 */
export function projectDayNutrition(input = {}) {
  const target = resolveEffectiveTargets(input.effectiveTargets || {});
  const logBefore = resolveLogBefore(input.currentDailyLog, input.editingContext);
  const before = macrosFromTotali(computeTotali(logBefore));
  const draftFoods = normalizeDraftMealToLogFoods(input.draftMeal);
  const meal = macrosFromTotali(computeTotali(draftFoods));
  const after = {
    kcal: roundKcal(before.kcal + meal.kcal),
    prot: roundMacro(before.prot + meal.prot),
    carb: roundMacro(before.carb + meal.carb),
    fat: roundMacro(before.fat + meal.fat),
  };
  const remaining = signedRemaining(target, after);

  return {
    target,
    before,
    meal,
    after,
    remaining,
    status: statusFromAfterVsTarget(after, target),
    gapRatio: gapRatioFromRemaining(remaining, target),
  };
}

export function emptyDayNutritionProjection() {
  const z = emptyMacros();
  return {
    target: z,
    before: z,
    meal: z,
    after: z,
    remaining: z,
    status: {
      kcal: 'neutral',
      prot: 'neutral',
      carb: 'neutral',
      fat: 'neutral',
    },
    gapRatio: {
      prot: null,
      carb: null,
      fat: null,
      kcal: null,
    },
  };
}
