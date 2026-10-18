/**
 * Brief giornata normalizzata per aggregatori storici (input fixture / CF).
 */

import { normalizeFoodEvents } from '../normalize/normalizeFoodEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { finiteNumber } from '../normalize/logUtils.js';

/**
 * @param {{
 *   date: string,
 *   dayNode?: object|null,
 *   sleepNode?: object|null,
 *   sleepStorageDate?: string,
 *   bodyWeightKg?: number|null,
 * }} input
 */
export function buildDayBrief(input) {
  const date = input.date;
  if (!isIsoDateString(date)) {
    throw new Error(`buildDayBrief: date non ISO: ${date}`);
  }

  const food = normalizeFoodEvents(input.dayNode);
  const activity = normalizeWorkoutEvents(input.dayNode);
  const sleepStorageDate = input.sleepStorageDate || addCalendarDays(date, 1);
  const sleepPack = normalizeSleepNight(input.sleepNode ?? null, {
    publicationDate: sleepStorageDate,
    lastMealHour: food.nutrition.lastMealHour?.value ?? null,
  });

  const weight = finiteNumber(input.bodyWeightKg);
  const hours = sleepPack.sleep.hours?.provenance === 'missing'
    ? null
    : sleepPack.sleep.hours?.value;

  return {
    date,
    hasFood: food.hasFood,
    hasWorkout: activity.hasWorkout,
    sleepAvailable: sleepPack.sleepAvailable,
    nutrition: {
      kcal: food.hasFood || (food.kentuTotals?.kcal ?? 0) > 0
        ? food.kentuTotals.kcal
        : null,
      proteinG: food.kentuTotals?.prot ?? null,
      carbG: food.kentuTotals?.carb ?? null,
      fatG: food.kentuTotals?.fatTotal ?? null,
      fiberG: food.kentuTotals?.fibre ?? null,
    },
    sleep: {
      hours: sleepPack.sleepAvailable ? hours : null,
    },
    activity: {
      workoutKcal: activity.activity.workoutKcalTotal?.value ?? null,
      cardioMinutes: activity.activity.cardioMinutes?.value ?? null,
      workoutCount: activity.activity.workouts.length,
    },
    body: {
      weightKg: weight,
    },
    foodItems: food.foodItemsForFrequency.map((item) => ({
      ...item,
      date,
    })),
  };
}
