/**
 * Normalizzatore puro eventi alimentari → blocco day.nutrition (senza history).
 * Totali macro allineati a computeTotali (nucleo puro in utils/computeTotaliCore.js).
 */

import { computeTotali } from '../../../utils/computeTotaliCore.js';
import { isUnresolvedMealDraftItem } from '../../../utils/mealDraftStatus.js';
import {
  FOCUS_PROVENANCE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import { dedupeByIdWithStats, finiteNumber, getLogArray, getManualNodesArray } from './logUtils.js';
import {
  compareMealSlots,
  normalizeMealType,
  resolveFocusMealIdentity,
  resolveFoodClockHour,
  resolveFoodClockHourDetailed,
} from './focusMealSlots.js';
import { evaluateDayNutritionPlausibility } from './focusNutritionPlausibility.js';

export {
  normalizeMealType,
  canonicalizeMealType,
  resolveFocusMealIdentity,
  resolveFoodClockHour,
  resolveFoodClockHourDetailed,
} from './focusMealSlots.js';

const FOOD_TYPES = new Set(['food', 'recipe']);

/** @param {object} item */
function foodDisplayName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodDbKey || '').trim();
}

/**
 * Log + manualNodes deduplicati per id (stesso criterio Focus su tutti i tipi).
 * @param {object|null|undefined} analysisDayNode
 */
export function collectDayLogForNutrition(analysisDayNode) {
  return collectDayLogForNutritionWithQuality(analysisDayNode).dayLog;
}

/**
 * @param {object|null|undefined} analysisDayNode
 */
export function collectDayLogForNutritionWithQuality(analysisDayNode) {
  const log = getLogArray(analysisDayNode);
  const manual = getManualNodesArray(analysisDayNode);
  const raw = [...log, ...manual];
  const deduped = dedupeByIdWithStats(raw, (e) => e?.id);
  const totalsRaw = computeTotali(raw);
  const totalsDeduped = computeTotali(deduped.items);
  const nutritionTotalsAffectedByDedupe =
    Number(totalsRaw.kcal) !== Number(totalsDeduped.kcal)
    || Number(totalsRaw.prot) !== Number(totalsDeduped.prot);

  return {
    dayLog: deduped.items,
    quality: {
      duplicatesRemoved: deduped.duplicatesRemoved,
      duplicateIds: deduped.duplicateIds,
      nutritionTotalsAffectedByDedupe,
      kcalBeforeDedupe: Number(totalsRaw.kcal) || 0,
      kcalAfterDedupe: Number(totalsDeduped.kcal) || 0,
    },
  };
}

/**
 * @param {object|null|undefined} analysisDayNode
 * @param {{
 *   targets?: { kcal?: number, proteinG?: number },
 *   targetMeta?: {
 *     referenceDate?: string|null,
 *     proteinSource?: string|null,
 *     kcalSource?: string|null,
 *   },
 * }} [opts]
 */
export function normalizeFoodEvents(analysisDayNode, opts = {}) {
  const mealTimes = analysisDayNode?.mealTimes && typeof analysisDayNode.mealTimes === 'object'
    ? analysisDayNode.mealTimes
    : {};

  const { dayLog, quality } = collectDayLogForNutritionWithQuality(analysisDayNode);
  const foods = dayLog.filter(
    (e) => e && FOOD_TYPES.has(e.type) && !isUnresolvedMealDraftItem(e),
  );

  // Parità Kentu sul log deduplicato Focus (flag se la dedupe altera i totali vs grezzo).
  const totali = computeTotali(dayLog);

  const names = new Set();
  let unclassifiedCount = 0;

  /**
   * Raggruppa per mealSlotId (non per sola categoria): snack_1 ≠ snack_2.
   * @type {Map<string, {
   *   mealSlotId: string,
   *   canonicalMealType: string,
   *   clockHour: number|null,
   *   clockSource: string|null,
   *   itemHours: number[],
   *   kcal: number,
   *   itemCount: number,
   * }>}
   */
  const mealMap = new Map();

  for (const item of foods) {
    const itemKcal = Number(item.kcal || item.cal || 0) || 0;
    const name = foodDisplayName(item);
    if (name) names.add(name.toLowerCase());
    const identity = resolveFocusMealIdentity(item);
    if (identity.canonicalMealType === 'unknown') unclassifiedCount += 1;

    const clock = resolveFoodClockHourDetailed(item, mealTimes);
    const key = identity.mealSlotId;
    const prev = mealMap.get(key) || {
      mealSlotId: identity.mealSlotId,
      canonicalMealType: identity.canonicalMealType,
      clockHour: null,
      clockSource: null,
      itemHours: [],
      kcal: 0,
      itemCount: 0,
    };
    prev.kcal += itemKcal;
    prev.itemCount += 1;
    if (clock.hour != null) {
      prev.itemHours.push(clock.hour);
      if (prev.clockHour == null || clock.hour > prev.clockHour) {
        prev.clockHour = clock.hour;
        prev.clockSource = clock.source;
      }
    }
    mealMap.set(key, prev);
  }

  const mealSlots = [...mealMap.values()].sort(compareMealSlots);
  const meals = mealSlots.map((m) => ({
    mealSlotId: m.mealSlotId,
    mealType: m.canonicalMealType,
    canonicalMealType: m.canonicalMealType,
    clockHour: m.clockHour == null
      ? missingMetric('hour_decimal')
      : focusMetric(m.clockHour, {
        unit: 'hour_decimal',
        provenance: FOCUS_PROVENANCE.recorded,
        source: m.clockSource || undefined,
      }),
    kcal: focusMetric(Math.round(m.kcal * 10) / 10, {
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'normalizeFoodEvents',
    }),
    itemCount: m.itemCount,
  }));

  /** Orari item effettivamente risolti (non inventati). */
  const availableItemHours = mealSlots.flatMap((m) => m.itemHours);
  let firstMealHour = null;
  let lastMealHour = null;
  for (const h of availableItemHours) {
    if (typeof h !== 'number' || !Number.isFinite(h)) continue;
    if (firstMealHour == null || h < firstMealHour) firstMealHour = h;
    if (lastMealHour == null || h > lastMealHour) lastMealHour = h;
  }

  const slotsWithTime = mealSlots.filter((m) => m.clockHour != null).length;
  const timingCoverage = {
    mealSlotsTotal: mealSlots.length,
    mealSlotsWithTime: slotsWithTime,
    itemHoursResolved: availableItemHours.length,
    windowComplete: mealSlots.length > 0 && slotsWithTime === mealSlots.length,
    partial: mealSlots.length > 0 && slotsWithTime > 0 && slotsWithTime < mealSlots.length,
  };

  const hasFood = foods.length > 0;
  const kcal = Number(totali.kcal) || 0;
  const proteinG = Number(totali.prot) || 0;
  const carbG = Number(totali.carb) || 0;
  const fatG = Number(totali.fatTotal) || 0;
  const fiberG = Number(totali.fibre) || 0;
  const hasNutritionTotals = hasFood || kcal > 0 || proteinG > 0 || carbG > 0 || fatG > 0 || fiberG > 0;

  const targetKcal = finiteNumber(opts.targets?.kcal);
  const targetProtein = finiteNumber(opts.targets?.proteinG);

  const round1 = (n) => Math.round(n * 10) / 10;

  const plausibility = evaluateDayNutritionPlausibility(dayLog, {
    fiberG: hasFood ? fiberG : null,
    hasFood,
  });

  return {
    hasFood,
    foodIds: foods.map((f) => f.id).filter(Boolean),
    quality,
    /** Snapshot grezzo per history / parity test */
    kentuTotals: {
      kcal,
      prot: proteinG,
      carb: carbG,
      fatTotal: fatG,
      fibre: fiberG,
      workout: Number(totali.workout) || 0,
    },
    foodItemsForFrequency: foods.map((item) => {
      const identity = resolveFocusMealIdentity(item);
      return {
        id: item.id != null ? String(item.id) : undefined,
        type: item.type === 'recipe' ? 'recipe' : 'food',
        foodDbKey: item.foodDbKey != null ? String(item.foodDbKey) : null,
        name: foodDisplayName(item),
        mealType: identity.canonicalMealType,
        mealSlotId: identity.mealSlotId,
      };
    }),
    nutrition: {
      totals: {
        kcal: hasNutritionTotals
          ? focusMetric(round1(kcal), {
            unit: 'kcal',
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'computeTotali',
          })
          : missingMetric('kcal'),
        proteinG: hasNutritionTotals
          ? focusMetric(round1(proteinG), {
            unit: 'g',
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'computeTotali',
          })
          : missingMetric('g'),
        carbG: hasNutritionTotals
          ? focusMetric(round1(carbG), {
            unit: 'g',
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'computeTotali',
          })
          : missingMetric('g'),
        fatG: hasNutritionTotals
          ? focusMetric(round1(fatG), {
            unit: 'g',
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'computeTotali',
          })
          : missingMetric('g'),
        fiberG: hasNutritionTotals
          ? focusMetric(round1(fiberG), {
            unit: 'g',
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'computeTotali',
          })
          : missingMetric('g'),
      },
      targets: {
        kcal: targetKcal == null
          ? missingMetric()
          : focusMetric(targetKcal, {
            provenance: FOCUS_PROVENANCE.recorded,
            source: opts.targetMeta?.kcalSource || 'profile_targets',
            measuredOn: opts.targetMeta?.referenceDate || undefined,
          }),
        proteinG: targetProtein == null
          ? missingMetric()
          : focusMetric(targetProtein, {
            provenance: FOCUS_PROVENANCE.recorded,
            source: opts.targetMeta?.proteinSource || 'profile_targets',
            measuredOn: opts.targetMeta?.referenceDate || undefined,
          }),
      },
      balance: {
        kcalDeltaVsTarget: hasNutritionTotals && targetKcal != null
          ? focusMetric(round1(kcal - targetKcal), {
            provenance: FOCUS_PROVENANCE.calculated,
            source: 'normalizeFoodEvents',
          })
          : missingMetric(),
      },
      meals,
      foodSummary: {
        uniqueNames: names.size,
        itemsLogged: foods.length,
        unclassifiedCount,
        mealSlotsLogged: mealSlots.length,
      },
      firstMealHour: firstMealHour == null
        ? missingMetric('hour_decimal')
        : focusMetric(firstMealHour, {
          unit: 'hour_decimal',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeFoodEvents',
        }),
      lastMealHour: lastMealHour == null
        ? missingMetric('hour_decimal')
        : focusMetric(lastMealHour, {
          unit: 'hour_decimal',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeFoodEvents',
        }),
      timingCoverage,
      plausibility,
    },
  };
}

/** @deprecated use isUnresolvedMealDraftItem — kept for test imports */
export function isUnresolvedFoodItem(item) {
  if (!item || typeof item !== 'object') return true;
  return isUnresolvedMealDraftItem(item);
}
