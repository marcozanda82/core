import { addDays } from '../../calendarDateUtils.js';
import { getTodayString, toCanonicalMealType } from '../../coreEngine.jsx';
import {
  collectDayEntries,
  entryDecimalHour,
  extractDecimalHour,
} from './HabitEngine.js';

export const SMART_QUICK_LOOKBACK_DAYS = 30;
export const SMART_QUICK_MAX_SLOTS = 4;

/** Fasce orarie per il menu Rapidi (ora locale, [start, end)). */
export const TIME_BANDS = Object.freeze({
  night: Object.freeze({ id: 'night', label: 'Notte', start: 0, end: 6 }),
  morning: Object.freeze({ id: 'morning', label: 'Mattina', start: 6, end: 12 }),
  afternoon: Object.freeze({ id: 'afternoon', label: 'Pomeriggio', start: 12, end: 18 }),
  evening: Object.freeze({ id: 'evening', label: 'Sera', start: 18, end: 24 }),
});

const CANONICAL_MEALS = new Set(['colazione', 'snack', 'pranzo', 'cena']);

const MEAL_ITEMS = Object.freeze({
  colazione: {
    id: 'colazione',
    icon: '🍳',
    label: 'Colazione',
    action: 'startGuidedMeal',
    mealType: 'colazione',
  },
  snack: {
    id: 'snack',
    icon: '🍎',
    label: 'Spuntino',
    action: 'startGuidedMeal',
    mealType: 'snack',
  },
  pranzo: {
    id: 'pranzo',
    icon: '🍽️',
    label: 'Pranzo',
    action: 'startGuidedMeal',
    mealType: 'pranzo',
  },
  cena: {
    id: 'cena',
    icon: '🌙',
    label: 'Cena',
    action: 'startGuidedMeal',
    mealType: 'cena',
  },
});

/** Azioni singole del vocabolario «Tutti» (niente alimenti, niente report). */
const ACTION_ITEMS = Object.freeze({
  acqua: { id: 'acqua', icon: '💧', label: 'Acqua', action: 'shortcut', shortcutId: 'acqua' },
  caffe: { id: 'caffe', icon: '☕', label: 'Caffè', action: 'shortcut', shortcutId: 'caffe' },
  te: { id: 'te', icon: '🍵', label: 'Tè', action: 'shortcut', shortcutId: 'tea' },
  energy: { id: 'energy', icon: '🥤', label: 'Energy', action: 'shortcut', shortcutId: 'energy' },
  alcool: { id: 'alcool', icon: '🍷', label: 'Alcol', action: 'send', message: 'Alcol' },
  integratori: {
    id: 'integratori',
    icon: '💊',
    label: 'Integratori',
    action: 'send',
    message: 'Integratori',
  },
  allenamento: {
    id: 'allenamento',
    icon: '🏋️',
    label: 'Allenamento',
    action: 'openActivity',
    defaultTab: 'pesi',
  },
  camminata: {
    id: 'camminata',
    icon: '🚶',
    label: 'Camminata',
    action: 'openActivity',
    defaultTab: 'camminata',
  },
  corsa: {
    id: 'corsa',
    icon: '🏃',
    label: 'Corsa',
    action: 'openActivity',
    defaultTab: 'corsa',
  },
  peso: { id: 'peso', icon: '⚖️', label: 'Peso', action: 'send', message: 'Peso' },
  pisolino: {
    id: 'pisolino',
    icon: '😴',
    label: 'Pisolino',
    action: 'shortcut',
    shortcutId: 'pisolino',
  },
  meditazione: {
    id: 'meditazione',
    icon: '🧘',
    label: 'Meditazione',
    action: 'send',
    message: 'Meditazione',
  },
  sonno: { id: 'sonno', icon: '🌙', label: 'Sonno', action: 'send', message: 'Sonno' },
});

export const SMART_QUICK_ACTION_CATALOG = Object.freeze({
  ...MEAL_ITEMS,
  ...ACTION_ITEMS,
});

/**
 * @param {number} decimalHour
 * @returns {{ id: string, label: string, start: number, end: number }}
 */
export function resolveTimeBand(decimalHour) {
  const h = Number(decimalHour);
  const hour = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
  if (hour >= TIME_BANDS.morning.start && hour < TIME_BANDS.morning.end) return TIME_BANDS.morning;
  if (hour >= TIME_BANDS.afternoon.start && hour < TIME_BANDS.afternoon.end) return TIME_BANDS.afternoon;
  if (hour >= TIME_BANDS.evening.start && hour < TIME_BANDS.evening.end) return TIME_BANDS.evening;
  return TIME_BANDS.night;
}

/**
 * @param {number} decimalHour
 * @param {{ start: number, end: number }} band
 * @returns {boolean}
 */
export function isHourInBand(decimalHour, band) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h) || !band) return false;
  const hour = ((h % 24) + 24) % 24;
  if (band.start < band.end) return hour >= band.start && hour < band.end;
  return hour >= band.start || hour < band.end;
}

function catalogItem(id) {
  const item = SMART_QUICK_ACTION_CATALOG[id];
  if (!item) return null;
  return { ...item };
}

function parseClockToDecimal(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours + minutes / 60;
}

function actionDecimalHour(entry) {
  const direct = entryDecimalHour(entry);
  if (direct != null) return direct;
  const fromClock = parseClockToDecimal(entry?.time ?? entry?.mealTime ?? entry?.sleepStart);
  if (fromClock != null) return fromClock;
  return extractDecimalHour(entry?.sleepStart)
    ?? extractDecimalHour(entry?.wakeTime)
    ?? extractDecimalHour(entry?.start);
}

function isFoodLike(entry) {
  const type = String(entry?.type || '').toLowerCase();
  return type === 'food' || type === 'recipe' || type === 'meal';
}

function canonicalMealId(entry) {
  const raw = String(entry?.mealType || '').trim();
  if (!raw) return null;
  const canonical = toCanonicalMealType(raw.split('_')[0]) || raw.split('_')[0].toLowerCase();
  return CANONICAL_MEALS.has(canonical) ? canonical : null;
}

function stimulantActionId(entry) {
  const sub = String(entry?.subtype || entry?.subType || entry?.kind || '').toLowerCase();
  if (sub.includes('energy')) return 'energy';
  if (sub.includes('tè') || sub.includes('te') || sub.includes('tea') || sub.includes('tisana')) {
    return 'te';
  }
  return 'caffe';
}

function workoutActionId(entry) {
  const type = String(entry?.type || '').toLowerCase();
  if (type === 'work' || type === 'cognitive') return null;
  const sub = String(entry?.subType || entry?.workoutType || entry?.activityType || '')
    .trim()
    .toLowerCase();
  if (sub === 'camminata') return 'camminata';
  if (sub === 'corsa') return 'corsa';
  if (type === 'workout') return 'allenamento';
  return null;
}

/**
 * Mappa una voce di diario a un'azione Rapidi. I singoli alimenti non hanno id azione:
 * solo lo slot pasto (colazione/snack/pranzo/cena) o un'azione del vocabolario.
 *
 * @param {object} entry
 * @param {string} dateStr
 * @returns {{ id: string, uniqueKey: string } | null}
 */
export function classifyDiaryEntryAsQuickAction(entry, dateStr) {
  if (!entry || typeof entry !== 'object') return null;
  const type = String(entry.type || '').toLowerCase();
  if (
    type === 'ghost_meal'
    || type === 'unassigned_drafts'
    || type === 'ghost_workout'
  ) {
    return null;
  }

  const date = String(dateStr || '').slice(0, 10);
  const entryId = String(entry.id || entry.key || `${type}_${Math.random()}`);

  if (isFoodLike(entry)) {
    const mealId = canonicalMealId(entry);
    if (!mealId) return null;
    const slot = String(entry.mealType || mealId).trim() || mealId;
    return { id: mealId, uniqueKey: `${date}|meal|${slot}` };
  }

  if (type === 'water') return { id: 'acqua', uniqueKey: `${date}|acqua|${entryId}` };
  if (type === 'stimulant') {
    const id = stimulantActionId(entry);
    return { id, uniqueKey: `${date}|${id}|${entryId}` };
  }
  if (type === 'alcohol') return { id: 'alcool', uniqueKey: `${date}|alcool|${entryId}` };
  if (type === 'supplements') {
    return { id: 'integratori', uniqueKey: `${date}|integratori|${entryId}` };
  }
  if (type === 'workout') {
    const id = workoutActionId(entry);
    if (!id) return null;
    return { id, uniqueKey: `${date}|${id}|${entryId}` };
  }
  if (type === 'weight' || type === 'pesata') {
    return { id: 'peso', uniqueKey: `${date}|peso|${entryId}` };
  }
  if (type === 'nap') return { id: 'pisolino', uniqueKey: `${date}|pisolino|${entryId}` };
  if (type === 'meditation') {
    return { id: 'meditazione', uniqueKey: `${date}|meditazione|${entryId}` };
  }
  if (type === 'sleep') return { id: 'sonno', uniqueKey: `${date}|sonno|${entryId}` };
  return null;
}

function dayCombinedEntries(fullHistory, dateStr, liveToday) {
  if (liveToday && dateStr === liveToday.date) {
    const log = Array.isArray(liveToday.dailyLog) ? liveToday.dailyLog : [];
    const manual = Array.isArray(liveToday.manualNodes) ? liveToday.manualNodes : [];
    if (log.length > 0 || manual.length > 0) return [...log, ...manual];
  }
  return collectDayEntries(fullHistory, dateStr).combined;
}

/**
 * Classifica e limita a max 4 azioni più frequenti nella fascia oraria corrente.
 *
 * @param {{
 *   fullHistory?: object,
 *   dailyLog?: object[],
 *   manualNodes?: object[],
 *   now?: Date,
 *   lookbackDays?: number,
 *   limit?: number,
 * }} [opts]
 * @returns {{
 *   band: { id: string, label: string, start: number, end: number },
 *   decimalHour: number,
 *   items: object[],
 *   counts: Record<string, number>,
 * }}
 */
export function rankSmartQuickActions(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const lookbackDays = Math.max(
    1,
    Math.min(90, Number(opts.lookbackDays) || SMART_QUICK_LOOKBACK_DAYS),
  );
  const limit = Math.max(0, Math.min(8, Number(opts.limit) || SMART_QUICK_MAX_SLOTS));
  const decimalHour = now.getHours() + now.getMinutes() / 60;
  const band = resolveTimeBand(decimalHour);
  const anchorDate = getTodayString();

  const liveToday = {
    date: anchorDate,
    dailyLog: opts.dailyLog,
    manualNodes: opts.manualNodes,
  };

  const seen = new Set();
  const counts = Object.create(null);

  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const dateStr = addDays(anchorDate, -offset);
    const combined = dayCombinedEntries(opts.fullHistory || {}, dateStr, liveToday);
    for (const entry of combined) {
      const hour = actionDecimalHour(entry);
      if (hour == null || !isHourInBand(hour, band)) continue;
      const classified = classifyDiaryEntryAsQuickAction(entry, dateStr);
      if (!classified || !SMART_QUICK_ACTION_CATALOG[classified.id]) continue;
      if (seen.has(classified.uniqueKey)) continue;
      seen.add(classified.uniqueKey);
      counts[classified.id] = (counts[classified.id] || 0) + 1;
    }
  }

  const ranked = Object.entries(counts)
    .sort((a, b) => {
      const byCount = b[1] - a[1];
      if (byCount !== 0) return byCount;
      return String(a[0]).localeCompare(String(b[0]));
    })
    .slice(0, limit)
    .map(([id, count]) => {
      const item = catalogItem(id);
      return item ? { ...item, count } : null;
    })
    .filter(Boolean);

  return {
    band,
    decimalHour,
    items: ranked,
    counts,
  };
}
