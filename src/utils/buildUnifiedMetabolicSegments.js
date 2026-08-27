import { METABOLIC_PHASES } from '../features/salaComandi/utils/metabolicPhaseConfig';
import {
  buildPostMealPhaseMarkersForWindow,
} from '../features/salaComandi/utils/metabolicPhaseEngine';
import {
  collectMetabolicTimelineMeals,
  resolveMealTimeFromLogItem,
} from '../features/salaComandi/utils/metabolicPhaseColors';
import { parseDecimalHourFromValue } from '../features/salaComandi/utils/mealConsumedTime';

const DAY_END = 24;
const WORKOUT_RECOVERY_HOURS = 2;

function resolveWorkoutStartHour(entry) {
  const fromMeal = parseDecimalHourFromValue(entry?.mealTime ?? entry?.time);
  if (fromMeal != null) return fromMeal;
  const end = parseDecimalHourFromValue(entry?.endTime);
  const duration = Number(entry?.duration);
  if (end != null && Number.isFinite(duration) && duration > 0) {
    return Math.max(0, end - duration);
  }
  return null;
}

/** Ora decimale sicura 0–24, null se invalida. */
function clampHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(DAY_END, n));
}

function collectProjectionMealHours(activeLog, options = {}) {
  const { todayMealTimes, yesterdayLastMealTime } = collectMetabolicTimelineMeals(activeLog, options);
  if (todayMealTimes.length > 0) {
    return { meals: [...todayMealTimes].sort((a, b) => a - b), yesterdayLastMealTime };
  }

  const mealTimesObj = options.mealTimesObj ?? null;
  const fallback = new Set();
  for (const item of activeLog || []) {
    if (!item || (item.type !== 'food' && item.type !== 'recipe' && item.type !== 'ghost_meal')) continue;
    const resolved =
      resolveMealTimeFromLogItem(item, mealTimesObj)
      ?? parseDecimalHourFromValue(item.mealTime ?? item.time);
    const clamped = clampHour(resolved);
    if (clamped != null) fallback.add(clamped);
  }

  return {
    meals: [...fallback].sort((a, b) => a - b),
    yesterdayLastMealTime,
  };
}

/**
 * Marker fase basati su fasce standard post-pasto (90min digestione, 240min assorbimento).
 */
function appendPhaseMarkersForMeal(markers, mealHour, windowStart, windowEnd, idPrefix, fromYesterday = false) {
  const built = buildPostMealPhaseMarkersForWindow(
    mealHour,
    windowStart,
    windowEnd,
    idPrefix,
    fromYesterday,
  );
  markers.push(...built);
}

/**
 * Marker metabolici per l'intera giornata (0–24h).
 * Ogni pasto proietta tutte le fasi fino al pasto successivo o a mezzanotte.
 */
export function buildUnifiedMetabolicSegments(activeLog, options = {}) {
  const { meals, yesterdayLastMealTime } = collectProjectionMealHours(activeLog, options);
  const markers = [];

  if (meals.length === 0) {
    if (yesterdayLastMealTime != null) {
      appendPhaseMarkersForMeal(markers, yesterdayLastMealTime, 0, DAY_END, 'yesterday', true);
    }
    return markers;
  }

  if (yesterdayLastMealTime != null && meals[0] > 0.001) {
    appendPhaseMarkersForMeal(markers, yesterdayLastMealTime, 0, meals[0], 'yesterday', true);
  }

  meals.forEach((mealHour, index) => {
    const windowEnd = index + 1 < meals.length ? meals[index + 1] : DAY_END;
    appendPhaseMarkersForMeal(
      markers,
      mealHour,
      mealHour,
      windowEnd,
      `meal${index}`,
      false,
    );
  });

  return markers.filter(
    (marker) =>
      marker
      && Number.isFinite(marker.hour)
      && marker.phase?.iconPath,
  );
}

/** Overlay allenamento: consumo energetico + fascia recupero (Riga 2). */
export function buildUnifiedWorkoutOverlays(activeLog) {
  const overlays = [];

  (activeLog || [])
    .filter((entry) => entry && (entry.type === 'workout' || entry.type === 'activity'))
    .forEach((entry, idx) => {
      const startHour = resolveWorkoutStartHour(entry);
      if (startHour == null) return;

      const duration = Number.isFinite(Number(entry.duration)) && Number(entry.duration) > 0
        ? Number(entry.duration)
        : 1;
      const endHour = Math.min(DAY_END, startHour + duration);
      const recoveryEnd = Math.min(DAY_END, endHour + WORKOUT_RECOVERY_HOURS);
      const label = entry.name || entry.desc || 'Allenamento';
      const baseId = entry.id || `workout_${idx}_${startHour}`;

      overlays.push({
        id: `${baseId}_active`,
        kind: 'workout_active',
        startHour,
        endHour,
        label,
        color: 'rgba(239, 68, 68, 0.55)',
        borderColor: '#ef4444',
      });

      if (recoveryEnd > endHour + 0.01) {
        overlays.push({
          id: `${baseId}_recovery`,
          kind: 'workout_recovery',
          startHour: endHour,
          endHour: recoveryEnd,
          label: 'Recupero',
          color: 'rgba(59, 130, 246, 0.35)',
          borderColor: '#3b82f6',
        });
      }
    });

  return overlays;
}

export function buildUnifiedOperationalNodes(mealNodes = [], ghostMealNodes = [], activityNodes = []) {
  const nodes = [];

  mealNodes.forEach((node) => {
    nodes.push({
      id: node.id,
      kind: 'meal',
      time: node.time,
      label: node.mealType || 'Pasto',
      icon: node.icon || '🍽️',
      kcal: node.kcal,
      raw: node,
    });
  });

  ghostMealNodes.forEach((node) => {
    nodes.push({
      id: node.id,
      kind: 'ghost_meal',
      time: node.time,
      label: node.title || node.mealType || 'Pasto previsto',
      icon: '📝',
      raw: node,
    });
  });

  activityNodes.forEach((node) => {
    nodes.push({
      id: node.id,
      kind: 'workout',
      time: node.time,
      duration: node.duration ?? 1,
      label: node.name || node.desc || 'Allenamento',
      icon: node.icon || '🏋️',
      kcal: node.kcal ?? node.cal,
      raw: node,
    });
  });

  return nodes.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
}

export function buildUnifiedTimelineData(activeLog, options = {}, nodeSources = {}) {
  return {
    operationalNodes: buildUnifiedOperationalNodes(
      nodeSources.mealNodes,
      nodeSources.ghostMealNodes,
      nodeSources.activityNodes,
    ),
    metabolicSegments: buildUnifiedMetabolicSegments(activeLog, options),
    workoutOverlays: buildUnifiedWorkoutOverlays(activeLog),
  };
}
