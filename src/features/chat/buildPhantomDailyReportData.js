/**
 * Costruisce il payload PhantomDailyReport dai dati reali del diario (no mock).
 */

import { computeTotali } from '../../useBiochimico.js';
import {
  extractSleepEntries,
  sleepHoursFromEntry,
  pickMainNightSleepEntry,
} from '../../hooks/useSleepEngine.js';

const MEAL_LABELS = Object.freeze({
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  spuntino: 'Spuntino',
  snack: 'Spuntino',
  merenda: 'Merenda',
});

const MEAL_ORDER = ['colazione', 'pranzo', 'spuntino', 'snack', 'merenda', 'cena'];

export function formatItalianDateLabel(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date instanceof Date ? date : new Date(date));
  } catch {
    return new Date().toLocaleDateString('it-IT');
  }
}

function formatSleepHoursLabel(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins <= 0) return `${whole}h`;
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

function formatDecimalHour(value) {
  const dec = Number(value);
  if (!Number.isFinite(dec) || dec < 0) return null;
  const h = Math.floor(dec) % 24;
  const m = Math.min(59, Math.round((dec - Math.floor(dec)) * 60));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function resolveEntryTime(entry) {
  const fromString = String(entry?.timeString || entry?.exactTime || entry?.clock || '').trim();
  if (/^\d{1,2}:\d{2}/.test(fromString)) return fromString.slice(0, 5);
  return (
    formatDecimalHour(entry?.mealTime)
    || formatDecimalHour(entry?.time)
    || '—'
  );
}

function resolveMealKey(entry) {
  const raw = String(entry?.mealType || entry?.meal || entry?.slot || 'pasto')
    .trim()
    .toLowerCase()
    .split('_')[0];
  if (MEAL_LABELS[raw]) return raw;
  if (raw.includes('cola')) return 'colazione';
  if (raw.includes('pran')) return 'pranzo';
  if (raw.includes('cen')) return 'cena';
  if (raw.includes('spunt') || raw.includes('snack') || raw.includes('merend')) return 'spuntino';
  return raw || 'pasto';
}

function foodNameOf(entry) {
  return String(entry?.desc || entry?.name || entry?.foodName || '').trim() || 'Alimento';
}

function isFoodEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isGhost === true) return false;
  const type = String(entry.type || '').toLowerCase();
  return type === 'food' || type === 'recipe';
}

function isWorkoutEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isGhost === true) return false;
  const type = String(entry.type || '').toLowerCase();
  return type === 'workout' || type === 'activity' || type === 'allenamento';
}

/**
 * Raggruppa alimenti per pasto → righe tabella PDF.
 * @param {object[]} dailyLog
 * @returns {Array<{ time: string, meal: string, foods: string, kcal: number, prot: number, carb: number, fat: number }>}
 */
export function buildPhantomMealRowsFromLog(dailyLog = []) {
  const groups = new Map();

  (Array.isArray(dailyLog) ? dailyLog : []).forEach((entry) => {
    if (!isFoodEntry(entry)) return;
    const mealKey = resolveMealKey(entry);
    const prev = groups.get(mealKey) || {
      mealKey,
      meal: MEAL_LABELS[mealKey] || `${mealKey.charAt(0).toUpperCase()}${mealKey.slice(1)}`,
      time: resolveEntryTime(entry),
      foods: [],
      kcal: 0,
      prot: 0,
      carb: 0,
      fat: 0,
      sortTime: Number(entry?.mealTime ?? entry?.time) || 99,
    };

    prev.foods.push(foodNameOf(entry));
    prev.kcal += Number(entry.kcal ?? entry.cal) || 0;
    prev.prot += Number(entry.prot) || 0;
    prev.carb += Number(entry.carb) || 0;
    prev.fat += Number(entry.fatTotal ?? entry.fat) || 0;

    const t = Number(entry?.mealTime ?? entry?.time);
    if (Number.isFinite(t) && t < prev.sortTime) {
      prev.sortTime = t;
      prev.time = resolveEntryTime(entry);
    }

    groups.set(mealKey, prev);
  });

  const rows = Array.from(groups.values()).map((g) => ({
    time: g.time,
    meal: g.meal,
    foods: g.foods.slice(0, 6).join(', ') + (g.foods.length > 6 ? '…' : ''),
    kcal: Math.round(g.kcal),
    prot: Math.round(g.prot * 10) / 10,
    carb: Math.round(g.carb * 10) / 10,
    fat: Math.round(g.fat * 10) / 10,
    _sort: MEAL_ORDER.indexOf(g.mealKey) >= 0
      ? MEAL_ORDER.indexOf(g.mealKey)
      : 50 + g.sortTime,
  }));

  rows.sort((a, b) => a._sort - b._sort);
  return rows.map(({ _sort, ...rest }) => rest);
}

function buildTrainingBlock(dailyLog = []) {
  const workouts = (Array.isArray(dailyLog) ? dailyLog : []).filter(isWorkoutEntry);
  if (workouts.length === 0) {
    return { title: 'Nessun allenamento', durationLabel: '', detail: '' };
  }
  const first = workouts[0];
  const title = String(first.desc || first.name || first.activity || 'Allenamento').trim();
  const minutes = workouts.reduce((acc, w) => {
    const m = Number(w.duration ?? w.minutes ?? w.durationMin);
    return acc + (Number.isFinite(m) && m > 0 ? m : 0);
  }, 0);
  const kcal = workouts.reduce((acc, w) => acc + (Number(w.kcal ?? w.cal) || 0), 0);
  const detailParts = [];
  if (workouts.length > 1) detailParts.push(`${workouts.length} sessioni`);
  if (kcal > 0) detailParts.push(`${Math.round(kcal)} kcal`);
  return {
    title,
    durationLabel: minutes > 0 ? `${Math.round(minutes)} min` : '',
    detail: detailParts.join(' · '),
  };
}

function buildSleepBlock(dailyLog = []) {
  const entries = extractSleepEntries(dailyLog);
  const main = pickMainNightSleepEntry(entries);
  const hours = entries.reduce((acc, e) => acc + sleepHoursFromEntry(e), 0);
  const mainHours = main ? sleepHoursFromEntry(main) : hours;
  return {
    label: formatSleepHoursLabel(mainHours || hours),
    hours: mainHours || hours || 0,
  };
}

/**
 * @param {{
 *   dailyLog?: object[],
 *   userTargets?: object|null,
 *   healthScore?: object|number|null,
 *   userDisplayName?: string,
 *   insight?: string,
 *   reportLabel?: string,
 *   date?: Date|string|null,
 *   overrides?: object|null,
 * }} args
 */
export function buildPhantomDailyReportData({
  dailyLog = [],
  userTargets = null,
  healthScore = null,
  userDisplayName = '',
  insight = '',
  reportLabel = 'DAILY REPORT',
  date = null,
  overrides = null,
} = {}) {
  const log = Array.isArray(dailyLog) ? dailyLog : [];
  const totalsRaw = computeTotali(log);
  const targets = userTargets && typeof userTargets === 'object' ? userTargets : {};

  const kcalValue = Math.round(Number(totalsRaw.kcal) || 0);
  const protValue = Math.round((Number(totalsRaw.prot) || 0) * 10) / 10;
  const carbValue = Math.round((Number(totalsRaw.carb) || 0) * 10) / 10;
  const fatValue = Math.round((Number(totalsRaw.fatTotal ?? totalsRaw.fat) || 0) * 10) / 10;
  const fibreValue = Math.round((Number(totalsRaw.fibre) || 0) * 10) / 10;

  const kcalTarget = Math.round(Number(targets.kcal) || 0) || 0;
  const protTarget = Math.round(Number(targets.prot) || 0) || 0;
  const carbTarget = Math.round(Number(targets.carb) || 0) || 0;
  const fatTarget = Math.round(Number(targets.fatTotal ?? targets.fat) || 0) || 0;
  const fibreTarget = Math.round(Number(targets.fibre) || 0) || 30;

  const scoreRaw = typeof healthScore === 'number'
    ? healthScore
    : Number(healthScore?.score ?? healthScore?.dailyScore ?? healthScore?.value);
  const dailyScore = Number.isFinite(scoreRaw)
    ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
    : 0;

  const recoveryRaw = Number(
    healthScore?.recovery
    ?? healthScore?.recoveryScore
    ?? healthScore?.metrics?.recovery,
  );
  const recoveryValue = Number.isFinite(recoveryRaw)
    ? Math.max(0, Math.min(100, Math.round(recoveryRaw)))
    : dailyScore;

  const meals = buildPhantomMealRowsFromLog(log);
  const sleep = buildSleepBlock(log);
  const training = buildTrainingBlock(log);

  const dateObj = date instanceof Date
    ? date
    : (date ? new Date(date) : new Date());
  const dateLabel = formatItalianDateLabel(
    Number.isNaN(dateObj.getTime()) ? new Date() : dateObj,
  );

  const base = {
    brand: 'Kentu',
    reportLabel: String(reportLabel || 'DAILY REPORT').trim() || 'DAILY REPORT',
    dateLabel,
    userName: String(userDisplayName || '').trim() || 'Utente',
    dailyScore,
    dailyScoreMax: 100,
    calories: { value: kcalValue, target: kcalTarget },
    protein: { value: protValue, target: protTarget, unit: 'g' },
    carbs: { value: carbValue, target: carbTarget, unit: 'g' },
    fat: { value: fatValue, target: fatTarget, unit: 'g' },
    fiber: { value: fibreValue, target: fibreTarget, unit: 'g' },
    sleep,
    recovery: { value: recoveryValue, max: 100 },
    meals,
    totals: {
      kcal: kcalValue,
      prot: protValue,
      carb: carbValue,
      fat: fatValue,
    },
    training,
    insight: String(insight || '').trim(),
  };

  if (overrides && typeof overrides === 'object') {
    // Live totals/meals vincono su snapshot incompleti; dateLabel live se override assente.
    const overrideDate = String(overrides.dateLabel || '').trim();
    return {
      ...base,
      ...overrides,
      dateLabel: overrideDate || base.dateLabel,
      meals: Array.isArray(overrides.meals) && overrides.meals.length > 0
        ? overrides.meals
        : base.meals,
      totals: overrides.totals && typeof overrides.totals === 'object'
        ? { ...base.totals, ...overrides.totals }
        : base.totals,
      calories: overrides.calories && typeof overrides.calories === 'object'
        ? { ...base.calories, ...overrides.calories }
        : base.calories,
      protein: overrides.protein && typeof overrides.protein === 'object'
        ? { ...base.protein, ...overrides.protein }
        : base.protein,
      carbs: overrides.carbs && typeof overrides.carbs === 'object'
        ? { ...base.carbs, ...overrides.carbs }
        : base.carbs,
      fat: overrides.fat && typeof overrides.fat === 'object'
        ? { ...base.fat, ...overrides.fat }
        : base.fat,
      insight: String(overrides.insight || base.insight || '').trim(),
    };
  }

  return base;
}

/** Snapshot vuoto sicuro (nessun mock) per render senza diario. */
export function createEmptyPhantomDailyReportData(extra = {}) {
  return buildPhantomDailyReportData({
    dailyLog: [],
    userTargets: null,
    healthScore: 0,
    ...extra,
  });
}
