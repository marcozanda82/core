/**
 * Brief giornata normalizzata per aggregatori storici (input fixture / CF).
 */

import { normalizeFoodEvents } from '../normalize/normalizeFoodEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import {
  classifyFocusActivity,
  normalizeWorkoutEvents,
} from '../normalize/normalizeWorkoutEvents.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { finiteNumber, getLogArray, getManualNodesArray } from '../normalize/logUtils.js';

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
  const wakeTime = sleepPack.sleep.wakeTime?.provenance === 'missing'
    ? null
    : sleepPack.sleep.wakeTime?.value;
  const bedtime = sleepPack.sleep.bedtime?.provenance === 'missing'
    ? null
    : sleepPack.sleep.bedtime?.value;
  const qualityStars = sleepPack.sleep.qualityStars?.provenance === 'missing'
    ? null
    : sleepPack.sleep.qualityStars?.value;

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
      nightEndedOn: sleepStorageDate,
      wakeTime: sleepPack.sleepAvailable ? wakeTime : null,
      bedtime: sleepPack.sleepAvailable ? bedtime : null,
      bedtimeProvenance: sleepPack.sleep.bedtime?.provenance || 'missing',
      bedtimeSource: sleepPack.sleep.bedtime?.source || null,
      wakeProvenance: sleepPack.sleep.wakeTime?.provenance || 'missing',
      qualityStars: sleepPack.sleepAvailable ? qualityStars : null,
      partial: Boolean(sleepPack.sleepPartial),
      mainNightStatus: sleepPack.sleep.mainNightStatus || null,
      mainNightReason: sleepPack.sleep.mainNightReason || null,
    },
    sleepStorageDate,
    activity: {
      workoutKcal: activity.activity.workoutKcalTotal?.value ?? null,
      /** Minuti label-aerobici (non intensità moderata verificata). */
      cardioMinutes: activity.activity.cardioMinutes?.value ?? null,
      aerobicMinutes: activity.activity.aerobicMinutes?.value ?? null,
      walkingMinutes: activity.activity.walkingMinutes?.value ?? null,
      moderateIntensityMinutes: activity.activity.moderateIntensityMinutes?.value ?? null,
      vigorousIntensityMinutes: activity.activity.vigorousIntensityMinutes?.value ?? null,
      workoutCount: activity.activity.workouts.length,
      /** Sessioni euristiche strength (non prova di intensità). */
      strengthSessionCount: countStrengthSessions(input.dayNode),
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

/** @param {object|null|undefined} dayNode */
function countStrengthSessions(dayNode) {
  const fromLog = getLogArray(dayNode).filter((e) => e && e.type === 'workout');
  const fromManual = getManualNodesArray(dayNode).filter((e) => e && e.type === 'workout');
  let n = 0;
  for (const entry of [...fromLog, ...fromManual]) {
    if (classifyFocusActivity(entry).kind === 'strength') n += 1;
  }
  return n;
}
