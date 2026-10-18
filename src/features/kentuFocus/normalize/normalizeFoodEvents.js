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
import { parseDecimalHour } from './focusDateUtils.js';
import { dedupeByIdWithStats, finiteNumber, getLogArray, getManualNodesArray } from './logUtils.js';

const FOOD_TYPES = new Set(['food', 'recipe']);

/** @param {unknown} mealType */
export function normalizeMealType(mealType) {
  const t = String(mealType || '').trim().toLowerCase();
  if (t === 'colazione' || t === 'pranzo' || t === 'cena' || t === 'snack') return t;
  return 'unknown';
}

/**
 * @param {object} item
 * @param {Record<string, number>} [mealTimes]
 */
export function resolveFoodClockHour(item, mealTimes) {
  const direct = parseDecimalHour(item?.mealTime ?? item?.time ?? item?.clockHour);
  if (direct != null) return direct;
  const mt = normalizeMealType(item?.mealType);
  if (mt !== 'unknown' && mealTimes && mealTimes[mt] != null) {
    return parseDecimalHour(mealTimes[mt]);
  }
  return null;
}

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
 * @param {{ targets?: { kcal?: number, proteinG?: number } }} [opts]
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

  /** @type {Map<string, { mealType: string, clockHour: number|null, kcal: number, itemCount: number }>} */
  const mealMap = new Map();

  for (const item of foods) {
    const itemKcal = Number(item.kcal || item.cal || 0) || 0;
    const name = foodDisplayName(item);
    if (name) names.add(name.toLowerCase());
    const mealType = normalizeMealType(item.mealType);
    if (mealType === 'unknown') unclassifiedCount += 1;

    const clockHour = resolveFoodClockHour(item, mealTimes);
    const prev = mealMap.get(mealType) || {
      mealType,
      clockHour: null,
      kcal: 0,
      itemCount: 0,
    };
    prev.kcal += itemKcal;
    prev.itemCount += 1;
    if (prev.clockHour == null && clockHour != null) prev.clockHour = clockHour;
    else if (clockHour != null && prev.clockHour != null) {
      prev.clockHour = Math.max(prev.clockHour, clockHour);
    }
    mealMap.set(mealType, prev);
  }

  const mealOrder = ['colazione', 'pranzo', 'snack', 'cena', 'unknown'];
  const meals = mealOrder
    .filter((k) => mealMap.has(k))
    .map((k) => {
      const m = mealMap.get(k);
      return {
        mealType: m.mealType,
        clockHour: m.clockHour == null
          ? missingMetric()
          : focusMetric(m.clockHour, { provenance: FOCUS_PROVENANCE.recorded }),
        kcal: focusMetric(Math.round(m.kcal * 10) / 10, {
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeFoodEvents',
        }),
        itemCount: m.itemCount,
      };
    });

  let lastMealHour = null;
  for (const m of meals) {
    const h = m.clockHour?.value;
    if (typeof h === 'number' && Number.isFinite(h)) {
      if (lastMealHour == null || h > lastMealHour) lastMealHour = h;
    }
  }

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
    foodItemsForFrequency: foods.map((item) => ({
      id: item.id != null ? String(item.id) : undefined,
      type: item.type === 'recipe' ? 'recipe' : 'food',
      foodDbKey: item.foodDbKey != null ? String(item.foodDbKey) : null,
      name: foodDisplayName(item),
      mealType: normalizeMealType(item.mealType),
    })),
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
            source: 'profile_targets',
          }),
        proteinG: targetProtein == null
          ? missingMetric()
          : focusMetric(targetProtein, {
            provenance: FOCUS_PROVENANCE.recorded,
            source: 'profile_targets',
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
      },
      lastMealHour: lastMealHour == null
        ? missingMetric()
        : focusMetric(lastMealHour, {
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeFoodEvents',
        }),
    },
  };
}

/** @deprecated use isUnresolvedMealDraftItem — kept for test imports */
export function isUnresolvedFoodItem(item) {
  if (!item || typeof item !== 'object') return true;
  return isUnresolvedMealDraftItem(item);
}
