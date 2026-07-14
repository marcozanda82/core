import {
  getTodayString,
  normalizeLogData,
  toCanonicalMealType,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import { mealIdFromCanonical } from './mealTypeNormalization';

export function fallbackPredictMealType(now) {
  if (now >= 5 && now < 10) return 'colazione';
  if (now >= 10 && now < 12.5) return 'snack';
  if (now >= 12.5 && now < 14.5) return 'pranzo';
  if (now >= 14.5 && now < 19) return 'snack';
  return 'cena';
}

/**
 * Predizione a 3 giorni: media orari ultimi 3 giorni per categoria, match sul più vicino a targetTime.
 * @param {object | null | undefined} fullStorico
 * @param {number | null | undefined} timeDecimal
 * @param {number} [fallbackNowDecimal]
 */
export function predictMealTypeFromHistory(fullStorico, timeDecimal, fallbackNowDecimal) {
  const targetTime =
    typeof timeDecimal === 'number' && !Number.isNaN(timeDecimal)
      ? timeDecimal
      : fallbackNowDecimal;
  if (!fullStorico) return fallbackPredictMealType(targetTime);

  const pastDays = Object.keys(fullStorico)
    .filter((k) => k.startsWith('trackerStorico_') && k !== TRACKER_STORICO_KEY(getTodayString()))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);
  if (pastDays.length === 0) return fallbackPredictMealType(targetTime);

  const timeAcc = {};
  const timeCount = {};
  pastDays.forEach((dayKey) => {
    const mealTimesObj = fullStorico[dayKey]?.mealTimes || {};
    const log = fullStorico[dayKey]?.log || [];
    const flatLog = normalizeLogData(Array.isArray(log) ? log : Object.values(log));
    flatLog.forEach((item) => {
      if (item.type !== 'food' && item.type !== 'recipe') return;
      const canonical = toCanonicalMealType(item.mealType);
      const t = mealTimesObj[item.mealType] ?? item.mealTime;
      if (typeof t === 'number') {
        timeAcc[canonical] = (timeAcc[canonical] || 0) + t;
        timeCount[canonical] = (timeCount[canonical] || 0) + 1;
      }
    });
  });

  let bestMatch = 'pranzo';
  let minDiff = Infinity;
  Object.keys(timeAcc).forEach((canonical) => {
    const avgTime = timeAcc[canonical] / timeCount[canonical];
    const diff = Math.abs(avgTime - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = canonical;
    }
  });
  if (minDiff > 3) return fallbackPredictMealType(targetTime);
  return mealIdFromCanonical(bestMatch);
}
