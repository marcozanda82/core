import { METABOLIC_PHASES } from '../features/salaComandi/utils/metabolicPhaseConfig';
import {
  calculateMealKinetics,
  KINETIC_ABSORPTION_PHASE,
  KINETIC_GASTRIC_PHASE,
  POST_ABSORPTION_PHASE_OFFSETS,
} from '../features/metabolic/MetabolicKinetics';
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

/**
 * Ora di inizio fase sull'asse 0–24.
 * @param {number} mealHour
 * @param {number} phaseMinHours
 * @param {boolean} fromYesterday
 */
function phaseStartClockHour(mealHour, phaseMinHours, fromYesterday = false) {
  const meal = Number(mealHour);
  const offset = Number(phaseMinHours);
  if (!Number.isFinite(meal) || !Number.isFinite(offset)) return null;
  const raw = fromYesterday ? offset + meal - DAY_END : meal + offset;
  return clampHour(raw);
}

function phaseEndClockHour(mealHour, phaseMaxHours, fromYesterday = false) {
  const meal = Number(mealHour);
  const maxH = Number(phaseMaxHours);
  if (!Number.isFinite(meal) || !Number.isFinite(maxH)) return null;
  const raw = fromYesterday ? maxH + meal - DAY_END : meal + maxH;
  return clampHour(raw);
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
 * Aggrega voci diario allo stesso slot orario pasto (per cinetica macro).
 */
function buildMealAggregateAtHour(activeLog, mealHour, mealTimesObj) {
  const items = [];
  for (const item of activeLog || []) {
    if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
    const resolved =
      resolveMealTimeFromLogItem(item, mealTimesObj)
      ?? parseDecimalHourFromValue(item.mealTime ?? item.time);
    if (resolved == null || Math.abs(Number(resolved) - mealHour) > 0.02) continue;
    items.push(item);
  }
  if (items.length === 0) return null;
  const kcal = items.reduce((sum, entry) => sum + (Number(entry.kcal ?? entry.cal) || 0), 0);
  return { type: 'meal', time: mealHour, items, kcal };
}

function pushPhaseMarker(markers, { idPrefix, phase, mealHour, offsetHours, fromYesterday, winStart, winEnd }) {
  const hour = phaseStartClockHour(mealHour, offsetHours, fromYesterday);
  if (hour == null || hour < winStart - 0.001 || hour >= winEnd - 0.001) return false;

  const phaseEndOffset = Number.isFinite(phase.maxHours) ? phase.maxHours : DAY_END + 48;
  const phaseEnd = phaseEndClockHour(mealHour, phaseEndOffset, fromYesterday);
  const endHour = phaseEnd != null ? Math.min(winEnd, phaseEnd) : winEnd;

  markers.push({
    id: `${idPrefix}_${phase.id}_${hour.toFixed(2)}`,
    phase,
    phaseId: phase.id,
    hour,
    label: phase.label,
    startHour: hour,
    endHour: endHour > hour ? endHour : Math.min(winEnd, hour + 0.5),
    mealHour,
  });

  return endHour >= winEnd - 0.001;
}

/**
 * Marker fase basati su calculateMealKinetics (onset, picco, fine assorbimento, post-fasting).
 */
function appendKineticPhaseMarkersForMeal(
  markers,
  mealHour,
  activeLog,
  mealTimesObj,
  windowStart,
  windowEnd,
  idPrefix,
  fromYesterday = false,
) {
  const winStart = clampHour(windowStart);
  const winEnd = clampHour(windowEnd);
  if (winStart == null || winEnd == null || winEnd <= winStart + 0.001) return;

  const mealNode = buildMealAggregateAtHour(activeLog, mealHour, mealTimesObj);
  if (!mealNode) {
    appendPhaseMarkersForMeal(markers, mealHour, windowStart, windowEnd, idPrefix, fromYesterday);
    return;
  }

  const { onsetDelay, duration, peakTime } = calculateMealKinetics(mealNode);
  const absorptionEnd = onsetDelay + duration;

  const kineticMarkers = [
    { offset: 0, phase: KINETIC_GASTRIC_PHASE },
    { offset: onsetDelay, phase: KINETIC_ABSORPTION_PHASE },
    { offset: peakTime, phase: KINETIC_ABSORPTION_PHASE },
    { offset: absorptionEnd, phase: METABOLIC_PHASES[2] },
    ...POST_ABSORPTION_PHASE_OFFSETS
      .filter((entry) => entry.offsetFromAbsorptionEnd > 0)
      .map((entry) => ({
        offset: absorptionEnd + entry.offsetFromAbsorptionEnd,
        phase: entry.phase,
      })),
  ];

  for (const marker of kineticMarkers) {
    const reachedWindowEnd = pushPhaseMarker(markers, {
      idPrefix,
      phase: marker.phase,
      mealHour,
      offsetHours: marker.offset,
      fromYesterday,
      winStart,
      winEnd,
    });
    if (reachedWindowEnd) break;
  }
}

/**
 * Aggiunge un marker icona per ogni transizione di fase dentro [windowStart, windowEnd).
 */
function appendPhaseMarkersForMeal(markers, mealHour, windowStart, windowEnd, idPrefix, fromYesterday = false) {
  const winStart = clampHour(windowStart);
  const winEnd = clampHour(windowEnd);
  if (winStart == null || winEnd == null || winEnd <= winStart + 0.001) return;

  for (const phase of METABOLIC_PHASES) {
    const hour = phaseStartClockHour(mealHour, phase.minHours, fromYesterday);
    if (hour == null || hour < winStart - 0.001 || hour >= winEnd - 0.001) {
      continue;
    }

    const phaseEnd = phaseEndClockHour(
      mealHour,
      Number.isFinite(phase.maxHours) ? phase.maxHours : DAY_END + 48,
      fromYesterday,
    );
    const endHour = phaseEnd != null ? Math.min(winEnd, phaseEnd) : winEnd;

    markers.push({
      id: `${idPrefix}_${phase.id}_${hour.toFixed(2)}`,
      phase,
      phaseId: phase.id,
      hour,
      label: phase.label,
      startHour: hour,
      endHour: endHour > hour ? endHour : Math.min(winEnd, hour + 0.5),
      mealHour,
    });

    if (endHour >= winEnd - 0.001) break;
  }
}

/**
 * Marker metabolici per l'intera giornata (0–24h).
 * Ogni pasto proietta tutte le fasi fino al pasto successivo o a mezzanotte.
 */
export function buildUnifiedMetabolicSegments(activeLog, options = {}) {
  const mealTimesObj = options.mealTimesObj ?? null;
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
    appendKineticPhaseMarkersForMeal(
      markers,
      mealHour,
      activeLog,
      mealTimesObj,
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
