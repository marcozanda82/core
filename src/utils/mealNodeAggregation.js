import {
  getTodayString,
  getMealIcon,
  toCanonicalMealType,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import {
  normalizeMealHour,
  resolveMealTimeFromLogItem,
} from '../features/salaComandi/utils/metabolicPhaseColors';
import { getStrategyKey } from './mealTypeNormalization';

/**
 * Aggrega voci food/recipe del log in nodi pasto per timeline.
 * @param {Array<object>} activeLog
 * @param {object} fullHistory
 * @param {string} currentTrackerDate
 */
export function buildComputedMealNodes(activeLog, fullHistory, currentTrackerDate) {
  const anchorDate = currentTrackerDate || getTodayString();
  const mealTimesObj = fullHistory?.[TRACKER_STORICO_KEY(anchorDate)]?.mealTimes ?? {};
  const groups = {};

  (activeLog || []).forEach((f) => {
    if (f.type !== 'food' && f.type !== 'recipe') return;
    const typeKey = f.mealType || 'pasto';
    const resolvedHour =
      resolveMealTimeFromLogItem(f, mealTimesObj)
      ?? normalizeMealHour(
        typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime) ? f.mealTime : 12,
      )
      ?? 12;
    const timeKey = String(resolvedHour);
    const mealId = `${typeKey}_${timeKey}`;
    const foodKcal = Number(f.kcal ?? f.cal ?? 0) || 0;
    if (!groups[mealId]) {
      groups[mealId] = {
        mealId,
        mealType: typeKey,
        originalTypes: new Set(),
        time: resolvedHour,
        strategyKey: getStrategyKey(toCanonicalMealType(String(typeKey).split('_')[0])),
        kcal: 0,
        items: [],
      };
    }
    groups[mealId].kcal += foodKcal;
    groups[mealId].originalTypes.add(f.mealType);
    groups[mealId].items.push({ ...f });
  });

  return Object.values(groups).map((m) => ({
    id: m.mealId,
    mealId: m.mealId,
    type: 'meal',
    time: m.time,
    mealType: m.mealType,
    strategyKey: m.strategyKey,
    kcal: m.kcal ?? 0,
    originalTypes: Array.from(m.originalTypes),
    items: m.items,
    foods: (m.items || []).map((it) => ({ ...it })),
    icon: getMealIcon(String(m.mealType).split('_')[0]),
  }));
}
