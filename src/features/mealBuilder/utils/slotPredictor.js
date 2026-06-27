import { collectFoodEntriesFromFullHistory } from '../hooks/usePredictiveFoodBlocks';
import { getMealSlotForDecimalHour } from './timeSlotUtils';

export const SLOT_PREDICTOR_LOOKBACK_DAYS = 30;
export const SLOT_PREDICTOR_WINDOW_MINUTES = 45;

export const MEAL_SLOT_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

const CANONICAL_MEAL_SLOTS = ['colazione', 'pranzo', 'cena', 'snack'];

export function normalizeMealSlotType(mealType) {
  const base = String(mealType || '').split('_')[0].trim().toLowerCase();
  if (base === 'spuntino') return 'snack';
  return CANONICAL_MEAL_SLOTS.includes(base) ? base : 'snack';
}

export function normalizeDecimalHour(time) {
  const hour = Number(time);
  if (!Number.isFinite(hour)) return null;
  return ((hour % 24) + 24) % 24;
}

/**
 * Differenza circolare in minuti tra due ore decimali (0–24).
 */
export function circularMinuteDistance(aHour, bHour) {
  const aMin = normalizeDecimalHour(aHour) * 60;
  const bMin = normalizeDecimalHour(bHour) * 60;
  if (aMin == null || bMin == null) return Infinity;

  let diff = Math.abs(aMin - bMin);
  if (diff > 12 * 60) diff = 24 * 60 - diff;
  return diff;
}

export function isWithinMealTimeWindow(
  mealTime,
  targetTime,
  windowMinutes = SLOT_PREDICTOR_WINDOW_MINUTES,
) {
  const meal = normalizeDecimalHour(mealTime);
  const target = normalizeDecimalHour(targetTime);
  if (meal == null || target == null) return false;
  return circularMinuteDistance(meal, target) <= windowMinutes;
}

function resolveDayKey(entry) {
  if (entry?._dayKey) return String(entry._dayKey);
  const ms = Number(entry?._loggedAtMs);
  if (Number.isFinite(ms) && ms > 0) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  return 'unknown';
}

function resolveMealSessionKey(entry) {
  const dayKey = resolveDayKey(entry);
  const batchId = entry?.batchId;
  if (batchId != null && String(batchId).trim() !== '') {
    return `${dayKey}|batch:${String(batchId).trim()}`;
  }

  const mealTime = Number(entry?.mealTime ?? entry?.time);
  const mealType = normalizeMealSlotType(entry?.mealType);
  if (Number.isFinite(mealTime)) {
    return `${dayKey}|${mealTime.toFixed(3)}|${mealType}`;
  }

  const id = String(entry?.id ?? entry?.foodDbKey ?? '').trim();
  return `${dayKey}|${mealType}|${id || 'solo'}`;
}

/**
 * Sessioni pasto uniche (tipo + orario) dagli ultimi N giorni.
 */
export function collectMealSessionsFromHistory(fullHistory, options = {}) {
  const lookbackDays = Math.max(
    1,
    Number(options.lookbackDays) || SLOT_PREDICTOR_LOOKBACK_DAYS,
  );
  const entries = collectFoodEntriesFromFullHistory(fullHistory, { lookbackDays });
  const sessions = new Map();

  entries.forEach((entry) => {
    const mealTime = Number(entry?.mealTime ?? entry?.time);
    if (!Number.isFinite(mealTime)) return;

    const mealType = normalizeMealSlotType(entry?.mealType);
    const sessionKey = resolveMealSessionKey(entry);

    if (!sessions.has(sessionKey)) {
      sessions.set(sessionKey, {
        mealType,
        mealTime: normalizeDecimalHour(mealTime),
        dayKey: resolveDayKey(entry),
      });
    }
  });

  return Array.from(sessions.values());
}

/**
 * Predice colazione / pranzo / cena / snack dall'orario e dalla cronologia (±45 min, 30 gg).
 * Fallback: fasce orarie generiche se non ci sono dati nel range.
 */
export function getLearnedMealSlot(time, history, options = {}) {
  const targetTime = normalizeDecimalHour(time);
  const fallback = getMealSlotForDecimalHour(
    targetTime ?? time,
  );

  if (targetTime == null) return fallback;

  const windowMinutes = Number(options.windowMinutes) || SLOT_PREDICTOR_WINDOW_MINUTES;
  const sessions = collectMealSessionsFromHistory(history, options);
  const inWindow = sessions.filter((session) =>
    isWithinMealTimeWindow(session.mealTime, targetTime, windowMinutes),
  );

  if (inWindow.length === 0) {
    return fallback;
  }

  const counts = new Map();
  inWindow.forEach(({ mealType }) => {
    counts.set(mealType, (counts.get(mealType) || 0) + 1);
  });

  let bestSlot = fallback;
  let bestCount = 0;

  for (const [slot, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestSlot = slot;
      continue;
    }

    if (count === bestCount && slot === fallback) {
      bestSlot = slot;
    }
  }

  return bestSlot;
}

export function getLearnedMealSlotLabel(time, history, options = {}) {
  const slot = getLearnedMealSlot(time, history, options);
  return MEAL_SLOT_LABELS[slot] || slot || 'Pasto';
}

export function getLearnedMealSlotMeta(time, history, options = {}) {
  const slot = getLearnedMealSlot(time, history, options);
  const fallback = getMealSlotForDecimalHour(normalizeDecimalHour(time) ?? time);
  return {
    slot,
    label: MEAL_SLOT_LABELS[slot] || slot || 'Pasto',
    isLearned: slot !== fallback || collectMealSessionsFromHistory(history, options).some(
      (session) => isWithinMealTimeWindow(
        session.mealTime,
        normalizeDecimalHour(time),
        options.windowMinutes || SLOT_PREDICTOR_WINDOW_MINUTES,
      ),
    ),
  };
}
