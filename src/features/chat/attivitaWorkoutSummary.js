import { getTodayString } from '../../coreEngine';
import { getWorkoutActivityTypeDef } from '../../activityCatalog';
import { collectLoggedWorkoutsNewestFirst } from '../workout/lastWorkoutMemory';
import { workoutDurationMinutes } from '../trendHub/utils/saluteHistorySeries';
import { MUSCLE_CYLINDER_DEFS, resolveMuscleCylinderId } from '../salaComandi/engines/fourCylinderEngine';

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const TYPE_LABELS = {
  pesi: 'Forza',
  workout: 'Forza',
  camminata: 'Camminata',
  corsa: 'Corsa',
  cardio: 'Cardio',
  hiit: 'HIIT',
  liss: 'Cardio',
};

const CARDIO_TYPES = new Set(['cardio', 'hiit', 'liss', 'camminata', 'corsa']);

function parseIsoDate(iso) {
  const raw = String(iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysBetween(fromIso, toIso) {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function workoutTypeLabel(typeId) {
  const id = String(typeId || '').toLowerCase();
  if (TYPE_LABELS[id]) return TYPE_LABELS[id];
  return getWorkoutActivityTypeDef(id)?.label || 'Allenamento';
}

export function workoutTypeIcon(typeId) {
  const id = String(typeId || '').toLowerCase();
  return getWorkoutActivityTypeDef(id)?.icon || '🏋️';
}

export function formatDurationMinutes(minutes) {
  const min = Math.max(0, Math.round(Number(minutes) || 0));
  if (min <= 0) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (rest === 0) return h === 1 ? '1 h' : `${h} h`;
  return `${h} h ${rest} min`;
}

export function formatWorkoutClock(entry) {
  const t = Number(entry?.time ?? entry?.mealTime);
  if (!Number.isFinite(t)) return '';
  const hours = Math.floor(t);
  const mins = Math.round((t - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(Math.min(59, mins)).padStart(2, '0')}`;
}

function muscleNamesFromEntry(entry) {
  const raw = entry?.muscles ?? entry?.muscleGroups ?? entry?.groups ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item) => String(item || '').trim()).filter(Boolean);
}

export function workoutDisplayTitle(entry, typeId) {
  const muscles = muscleNamesFromEntry(entry);
  if (muscles.length) return muscles.join(', ');
  const desc = String(entry?.desc || entry?.name || entry?.activity || '').trim();
  if (desc) return desc;
  return workoutTypeLabel(typeId);
}

export function workoutNotes(entry) {
  const raw = String(entry?.notes || entry?.note || entry?.comment || entry?.workoutNotes || '').trim();
  if (!raw) return '';
  const title = String(entry?.desc || entry?.name || '').trim();
  if (title && raw.toLowerCase() === title.toLowerCase()) return '';
  return raw;
}

export function formatLastWorkoutBanner(item, todayIso) {
  if (!item) return 'Nessun allenamento in archivio';
  const date = parseIsoDate(item.date);
  if (!date) return `Ultimo workout: ${workoutDisplayTitle(item.entry, item.typeId)}`;
  const weekday = WEEKDAYS[date.getDay()];
  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];
  const delta = daysBetween(item.date, todayIso);
  let relative = '';
  if (delta === 0) relative = 'oggi';
  else if (delta === 1) relative = 'ieri';
  else if (delta > 1) relative = `${delta} giorni fa`;
  const relBit = relative ? ` (${relative})` : '';
  const title = workoutDisplayTitle(item.entry, item.typeId);
  return `Ultimo workout: ${weekday} ${day} ${month}${relBit} — ${title}`;
}

function cylinderLabel(id) {
  return MUSCLE_CYLINDER_DEFS.find((def) => def.id === id)?.label || id;
}

function countMusclesThisMonth(items) {
  const scores = new Map();
  items.forEach((item) => {
    if (CARDIO_TYPES.has(String(item.typeId || '').toLowerCase())) return;
    const names = muscleNamesFromEntry(item.entry);
    const ids = new Set();
    names.forEach((name) => {
      const cyl = resolveMuscleCylinderId(name);
      if (cyl) ids.add(cyl);
    });
    ids.forEach((id) => scores.set(id, (scores.get(id) || 0) + 1));
  });
  let bestId = null;
  let best = 0;
  scores.forEach((count, id) => {
    if (count > best) {
      best = count;
      bestId = id;
    }
  });
  return bestId ? { id: bestId, label: cylinderLabel(bestId), count: best } : null;
}

/**
 * Feed + KPI per il cruscotto Attività (oggi + storico).
 */
export function buildAttivitaWorkoutSummary({
  dailyLog = [],
  fullHistory = {},
  todayIso = null,
} = {}) {
  const today = String(todayIso || getTodayString()).slice(0, 10);
  const all = collectLoggedWorkoutsNewestFirst({
    dailyLog,
    fullHistory,
    todayIso: today,
  }).map((item) => {
    const minutes = workoutDurationMinutes(item.entry);
    return {
      ...item,
      id: String(item.entry?.id || `${item.date}:${item.time}:${item.typeId}`),
      minutes,
      typeLabel: workoutTypeLabel(item.typeId),
      icon: workoutTypeIcon(item.typeId),
      title: workoutDisplayTitle(item.entry, item.typeId),
      clock: formatWorkoutClock(item.entry),
      notes: workoutNotes(item.entry),
      isToday: item.date === today,
      isCardio: CARDIO_TYPES.has(String(item.typeId || '').toLowerCase()),
    };
  });

  const todayWorkouts = all.filter((item) => item.isToday);
  const monthPrefix = today.slice(0, 7);
  const monthWorkouts = all.filter((item) => String(item.date).startsWith(monthPrefix));
  const monthMinutes = monthWorkouts.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const cardioMonth = monthWorkouts.filter((item) => item.isCardio);
  const cardioAvg = cardioMonth.length
    ? Math.round(cardioMonth.reduce((sum, item) => sum + (item.minutes || 0), 0) / cardioMonth.length)
    : 0;
  const topMuscle = countMusclesThisMonth(monthWorkouts);

  let thirdStat;
  if (topMuscle) {
    thirdStat = { label: 'Più allenato', value: topMuscle.label };
  } else if (cardioAvg > 0) {
    thirdStat = { label: 'Cardio medio', value: formatDurationMinutes(cardioAvg) };
  } else {
    thirdStat = { label: 'Più allenato', value: '—' };
  }

  return {
    today,
    todayWorkouts,
    history: all,
    lastWorkout: all[0] || null,
    lastWorkoutBanner: formatLastWorkoutBanner(all[0] || null, today),
    monthSessions: monthWorkouts.length,
    monthMinutes,
    monthDurationLabel: formatDurationMinutes(monthMinutes),
    thirdStat,
  };
}
