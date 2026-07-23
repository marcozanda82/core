/**
 * Schema onda (Wave Planner) ancorato a date calendario.
 * `schedule`: { "YYYY-MM-DD": WaveDayEntry }
 */
import {
  getWorkoutActivityLogDescription,
  getWorkoutActivityTypeDef,
  normalizeMuscleGroupArray,
  resolveWorkoutActivityTypeId,
} from '../../activityCatalog';
import {
  ACTIVITY_CATALOG,
  ACTIVITY_OPTIONS,
  HISTORICAL_DEFAULT_BURN,
  buildDayBlockFromPlannerAction,
} from '../weeklyBlocks/activityCatalog';
import {
  DEFAULT_WAVE_TIME_PREFS,
  exactTimeToDecimalHour,
  inferTimeTagFromExact,
  normalizeExactTime,
  normalizeTimeTag,
} from './waveTimePrefs';

export const MACRO_GOAL_OPTIONS = [
  { id: 'cut_aggressivo', label: 'Cut Aggressivo' },
  { id: 'cut_lento', label: 'Cut Lento' },
  { id: 'mantenimento', label: 'Mantenimento' },
  { id: 'lean_bulk', label: 'Lean Bulk' },
];

/** @deprecated Preferire date + Scheda Attività; tenuto per migrazione legacy. */
export const WAVE_ACTIVITY_OPTIONS = ACTIVITY_OPTIONS;

const INTENSITY_TO_TDEE = {
  high: 1.15,
  medium: 1.1,
  low: 1.05,
  rest: 0.9,
};

/** Parse YYYY-MM-DD → Date UTC midnight. */
export function parseIsoDateUtc(iso) {
  const raw = String(iso || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

export function toIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCalendarDaysIso(iso, deltaDays) {
  const base = parseIsoDateUtc(iso);
  if (!base) return null;
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return toIsoDateUtc(base);
}

/** Firebase RTDB può materializzare gli array come oggetti `{0:…}`. */
function asStringList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => String(value[k]));
  }
  return [];
}

function deriveWaveIntensity(activityId, muscles = [], burnKcal = 0) {
  if (activityId === 'riposo') return 'rest';
  const burn = Number(burnKcal) || 0;
  if (burn <= 0) return 'rest';
  if (activityId === 'cardio') return 'low';
  if (activityId === 'hiit') return 'medium';
  if (activityId === 'pesi') {
    const m = normalizeMuscleGroupArray(muscles);
    if (m.some((g) => g === 'Gambe' || g === 'Dorso')) return 'high';
    return 'medium';
  }
  return 'low';
}

export function catalogKeyToActivityId(activityKey, entry) {
  const key = String(activityKey || '').trim();
  const kind = String(entry?.kind || ACTIVITY_CATALOG[key]?.kind || '').toUpperCase();
  const memory = String(entry?.memoryKey || ACTIVITY_CATALOG[key]?.memoryKey || '').toUpperCase();
  if (key === 'Riposo' || kind === 'REST') return 'riposo';
  if (key === 'HIIT' || memory === 'HIIT' || kind === 'HIIT') return 'hiit';
  if (key === 'Cardio' || kind === 'CARDIO') return 'cardio';
  return 'pesi';
}

export function resolveCatalogBurnKcal(activityKey, activityId) {
  const key = String(activityKey || '').trim();
  if (key && ACTIVITY_CATALOG[key]) {
    return Math.max(0, Math.round(Number(ACTIVITY_CATALOG[key].burnKcal) || 0));
  }
  const id = resolveWorkoutActivityTypeId(activityId) || String(activityId || '').trim();
  if (id === 'riposo') return 0;
  if (id === 'cardio' && ACTIVITY_CATALOG.Cardio) {
    return Math.max(0, Math.round(Number(ACTIVITY_CATALOG.Cardio.burnKcal) || 0));
  }
  if (id === 'hiit' || id === 'pesi') return HISTORICAL_DEFAULT_BURN;
  return 0;
}

/**
 * @param {string} activityKey
 */
export function resolveWaveDayFromActivity(activityKey) {
  const key = String(activityKey || '').trim();
  const entry = ACTIVITY_CATALOG[key] || ACTIVITY_CATALOG.Riposo;
  const resolvedKey = ACTIVITY_CATALOG[key] ? key : 'Riposo';
  const intensity = String(entry?.intensity || 'medium').toLowerCase();
  const activityId = catalogKeyToActivityId(resolvedKey, entry);
  const muscles = activityId === 'pesi' || activityId === 'hiit'
    ? normalizeMuscleGroupArray(asStringList(entry?.focus))
    : [];
  const burn = resolveCatalogBurnKcal(resolvedKey, activityId);
  const title =
    activityId === 'riposo'
      ? 'Riposo'
      : getWorkoutActivityLogDescription(activityId, muscles) || resolvedKey;

  return {
    activityKey: resolvedKey,
    activityId,
    muscles,
    title,
    type: activityId === 'riposo' ? 'rest' : activityId === 'cardio' || activityId === 'hiit' ? 'cardio' : 'training',
    tdeeMultiplier: INTENSITY_TO_TDEE[intensity] ?? 1.0,
    expectedVolume: burn,
  };
}

/**
 * Da azione Scheda Attività (WorkoutView planner) → entry calendario.
 * @param {import('../../drawers/vistas/WorkoutView').PlannerActionObject} action
 * @param {string} dateIso
 */
export function waveEntryFromPlannerAction(action, dateIso) {
  const date = String(dateIso || '').trim().slice(0, 10);
  const activityId =
    resolveWorkoutActivityTypeId(action?.workoutType) || String(action?.workoutType || 'pesi');
  const muscles = normalizeMuscleGroupArray(asStringList(action?.muscles));
  const burn = activityId === 'riposo' ? 0 : Math.max(0, Math.round(Number(action?.burnKcal) || 0));
  const intensity = String(action?.intensity || deriveWaveIntensity(activityId, muscles, burn));
  const title =
    String(action?.name || '').trim()
    || (activityId === 'riposo' ? 'Riposo' : getWorkoutActivityLogDescription(activityId, muscles));

  const fromActionTime = normalizeExactTime(action?.startTime);
  return sanitizeWaveEntry({
    date,
    activityId,
    activityKey: null,
    muscles,
    title,
    type: activityId === 'riposo' ? 'rest' : activityId === 'cardio' || activityId === 'hiit' ? 'cardio' : 'training',
    tdeeMultiplier: INTENSITY_TO_TDEE[intensity] ?? (activityId === 'riposo' ? 0.9 : 1.1),
    expectedVolume: burn,
    durationMin: activityId === 'riposo' ? 0 : Math.round(Number(action?.durationMin) || 60),
    startTime: fromActionTime,
    exactTime: fromActionTime,
    timeTag: fromActionTime ? inferTimeTagFromExact(fromActionTime) : null,
    strengthDetail: action?.strengthDetail || null,
  }, date);
}

export function createRestWaveEntry(dateIso) {
  return sanitizeWaveEntry(
    {
      date: dateIso,
      activityId: 'riposo',
      activityKey: 'Riposo',
      muscles: [],
      title: 'Riposo',
      type: 'rest',
      tdeeMultiplier: 0.9,
      expectedVolume: 0,
      durationMin: 0,
    },
    dateIso,
  );
}

/**
 * @param {object} raw
 * @param {string} [fallbackDate]
 */
export function sanitizeWaveEntry(raw, fallbackDate = '') {
  if (!raw || typeof raw === 'string') {
    const activityId = resolveWorkoutActivityTypeId(raw) || (raw === 'riposo' ? 'riposo' : null);
    if (!activityId) return null;
    const date = String(fallbackDate || '').slice(0, 10);
    return {
      date,
      activityId,
      activityKey: null,
      muscles: [],
      title: getWorkoutActivityLogDescription(activityId) || activityId,
      type: activityId === 'riposo' ? 'rest' : activityId === 'cardio' || activityId === 'hiit' ? 'cardio' : 'training',
      tdeeMultiplier: activityId === 'riposo' ? 0.9 : 1.1,
      expectedVolume: resolveCatalogBurnKcal(null, activityId),
      durationMin: activityId === 'riposo' ? 0 : 60,
      startTime: null,
      exactTime: activityId === 'riposo' ? null : DEFAULT_WAVE_TIME_PREFS.sera,
      timeTag: activityId === 'riposo' ? null : 'sera',
      strengthDetail: null,
    };
  }
  if (typeof raw !== 'object') return null;

  const date = String(raw.date || fallbackDate || '').trim().slice(0, 10);

  const fromCatalogKey =
    (raw.activityKey && ACTIVITY_CATALOG[String(raw.activityKey).trim()]
      ? String(raw.activityKey).trim()
      : null)
    || (ACTIVITY_OPTIONS.includes(String(raw.title || '').trim())
      ? String(raw.title).trim()
      : null);

  if (fromCatalogKey && !raw.activityId) {
    const resolved = resolveWaveDayFromActivity(fromCatalogKey);
    const isRest = fromCatalogKey === 'Riposo' || resolved.activityId === 'riposo';
    return {
      date,
      ...resolved,
      durationMin: isRest ? 0 : 60,
      startTime: null,
      exactTime: isRest ? null : DEFAULT_WAVE_TIME_PREFS.sera,
      timeTag: isRest ? null : 'sera',
      strengthDetail: null,
    };
  }

  const activityId =
    resolveWorkoutActivityTypeId(raw.activityId)
    || resolveWorkoutActivityTypeId(raw.workoutType)
    || resolveWorkoutActivityTypeId(raw.plannerWorkoutType)
    || (fromCatalogKey ? catalogKeyToActivityId(fromCatalogKey) : null)
    || null;

  if (!activityId) return null;

  const muscles = normalizeMuscleGroupArray(asStringList(raw.muscles ?? raw.focus));
  const burnStored = Number(raw.expectedVolume ?? raw.plannedBurnKcal ?? raw.burnKcal);
  const burn = activityId === 'riposo'
    ? 0
    : Number.isFinite(burnStored) && burnStored >= 0
      ? Math.round(burnStored)
      : resolveCatalogBurnKcal(fromCatalogKey, activityId);
  const mult = Number(raw.tdeeMultiplier);
  const typeRaw = String(raw.type || '').toLowerCase();
  const type = ['training', 'recovery', 'cardio', 'rest'].includes(typeRaw)
    ? typeRaw
    : activityId === 'riposo'
      ? 'rest'
      : activityId === 'cardio' || activityId === 'hiit'
        ? 'cardio'
        : 'training';

  const isRest = activityId === 'riposo' || type === 'rest';
  const exactTime = isRest
    ? null
    : normalizeExactTime(raw.exactTime)
      || normalizeExactTime(raw.startTime)
      || DEFAULT_WAVE_TIME_PREFS.sera;
  const timeTag = isRest
    ? null
    : normalizeTimeTag(raw.timeTag) || inferTimeTagFromExact(exactTime);

  return {
    date,
    activityId,
    activityKey: fromCatalogKey || null,
    muscles,
    title:
      String(raw.title || '').trim()
      || getWorkoutActivityLogDescription(activityId, muscles)
      || getWorkoutActivityTypeDef(activityId)?.label
      || activityId,
    type,
    tdeeMultiplier: Number.isFinite(mult) && mult > 0 ? Math.round(mult * 100) / 100 : (activityId === 'riposo' ? 0.9 : 1.1),
    expectedVolume: burn,
    durationMin: activityId === 'riposo' ? 0 : Math.max(0, Math.round(Number(raw.durationMin) || 60)),
    startTime: exactTime,
    exactTime,
    timeTag,
    strengthDetail: raw.strengthDetail != null ? String(raw.strengthDetail) : null,
  };
}

/**
 * @param {Record<string, unknown>} scheduleRaw
 * @returns {Record<string, object>}
 */
export function sanitizeWaveSchedule(scheduleRaw) {
  if (!scheduleRaw || typeof scheduleRaw !== 'object') return {};
  /** @type {Record<string, object>} */
  const out = {};
  for (const [key, val] of Object.entries(scheduleRaw)) {
    const date = String(key || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const entry = sanitizeWaveEntry(val, date);
    if (entry) out[date] = { ...entry, date };
  }
  return out;
}

/**
 * Migra `days[]` legacy → schedule per date.
 */
function migrateDaysArrayToSchedule(daysRaw, startDate) {
  const start = String(startDate || '').trim().slice(0, 10);
  if (!start || !Array.isArray(daysRaw) || daysRaw.length === 0) return {};
  /** @type {Record<string, object>} */
  const schedule = {};
  const sorted = [...daysRaw]
    .filter((d) => d && typeof d === 'object')
    .sort((a, b) => (Number(a.dayIndex) || 0) - (Number(b.dayIndex) || 0));

  sorted.forEach((d, i) => {
    const date = addCalendarDaysIso(start, i);
    if (!date) return;
    const fromKey =
      (d.activityKey && ACTIVITY_CATALOG[String(d.activityKey).trim()]
        ? String(d.activityKey).trim()
        : null)
      || (ACTIVITY_OPTIONS.includes(String(d.title || '').trim()) ? String(d.title).trim() : null);
    const entry = fromKey
      ? { date, ...resolveWaveDayFromActivity(fromKey), durationMin: fromKey === 'Riposo' ? 0 : 60 }
      : sanitizeWaveEntry(d, date);
    if (entry) schedule[date] = { ...entry, date };
  });
  return schedule;
}

export function createDefaultWaveDraft({ startDate, macroGoal = 'mantenimento', dayCount = 4 } = {}) {
  const start = startDate || toIsoDateUtc(new Date());
  const keys = ['Gambe', 'Dorso', 'Riposo', 'Abs'];
  /** @type {Record<string, object>} */
  const schedule = {};
  for (let i = 0; i < Math.max(1, dayCount); i += 1) {
    const date = addCalendarDaysIso(start, i);
    if (!date) continue;
    const activityKey = keys[i % keys.length];
    schedule[date] = {
      date,
      ...resolveWaveDayFromActivity(activityKey),
      durationMin: activityKey === 'Riposo' ? 0 : 60,
      startTime: activityKey === 'Riposo' ? null : DEFAULT_WAVE_TIME_PREFS.sera,
      exactTime: activityKey === 'Riposo' ? null : DEFAULT_WAVE_TIME_PREFS.sera,
      timeTag: activityKey === 'Riposo' ? null : 'sera',
      strengthDetail: null,
    };
  }
  const dates = Object.keys(schedule).sort();
  return {
    waveId: `wave_${Date.now()}`,
    name: 'Onda attiva',
    macroGoal,
    startDate: dates[0] || start,
    cycleLength: dates.length,
    isActive: true,
    schedule,
    days: [],
  };
}

export function createEmptyWaveDay(dayIndex = 1, activityKey = 'Gambe') {
  return {
    dayIndex,
    ...resolveWaveDayFromActivity(activityKey),
  };
}

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
export function sanitizeTrainingWave(raw) {
  if (!raw || typeof raw !== 'object') return null;

  let schedule = sanitizeWaveSchedule(raw.schedule);
  if (Object.keys(schedule).length === 0 && Array.isArray(raw.days) && raw.days.length > 0) {
    schedule = migrateDaysArrayToSchedule(raw.days, raw.startDate);
  }

  const dates = Object.keys(schedule).sort();
  if (dates.length === 0) return null;

  const macroGoal = String(raw.macroGoal || '').trim();
  const startDate = String(raw.startDate || dates[0] || '').trim().slice(0, 10) || dates[0];

  /** days[] derivato (compat UI/hook legacy) */
  const days = dates.map((date, i) => ({
    dayIndex: i + 1,
    ...schedule[date],
    date,
  }));

  return {
    waveId: String(raw.waveId || `wave_${startDate || 'draft'}`),
    name: String(raw.name || 'Onda attiva').trim() || 'Onda attiva',
    macroGoal: MACRO_GOAL_OPTIONS.some((g) => g.id === macroGoal) ? macroGoal : (macroGoal || 'mantenimento'),
    startDate,
    cycleLength: dates.length,
    isActive: raw.isActive !== false,
    schedule,
    days,
    updatedAt: Number(raw.updatedAt) || null,
  };
}

export function resolveWaveDayBurnKcal(day) {
  if (!day) return 0;
  const stored = Number(day.expectedVolume ?? day.plannedBurnKcal);
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored);
  return resolveCatalogBurnKcal(day.activityKey, day.activityId);
}

export function computeWaveCycleBudget(daysOrSchedule = []) {
  const list = Array.isArray(daysOrSchedule)
    ? daysOrSchedule
    : Object.values(daysOrSchedule || {});
  const cycleDays = list.length;
  const totalPlannedBurnKcal = list.reduce((sum, d) => sum + resolveWaveDayBurnKcal(d), 0);
  const avgDailyBurnKcal = cycleDays > 0 ? Math.round(totalPlannedBurnKcal / cycleDays) : 0;
  return { cycleDays, totalPlannedBurnKcal, avgDailyBurnKcal };
}

/**
 * Trasla a cascata: attività di `startDate` → +1 giorno, e così via per tutte le date ≥ startDate.
 * Lo slot di partenza diventa Riposo.
 *
 * @param {Record<string, object>} schedule
 * @param {string} startDateIso
 * @returns {{ success: boolean, schedule: Record<string, object>, reason?: string }}
 */
export function shiftWaveScheduleForward(schedule, startDateIso) {
  const startDate = String(startDateIso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { success: false, schedule: schedule || {}, reason: 'Data non valida.' };
  }

  const prev = sanitizeWaveSchedule(schedule);
  const datesToShift = Object.keys(prev)
    .filter((d) => d >= startDate)
    .sort();

  if (datesToShift.length === 0 && !prev[startDate]) {
    return { success: false, schedule: prev, reason: 'Nessuna attività da traslare da questa data.' };
  }

  /** @type {Record<string, object>} */
  const next = { ...prev };

  // Rimuovi le chiavi che verranno riscritte (da fine calendario)
  const moving = datesToShift.length > 0 ? datesToShift : [startDate];
  for (const d of moving) {
    delete next[d];
  }

  for (let i = moving.length - 1; i >= 0; i -= 1) {
    const from = moving[i];
    const to = addCalendarDaysIso(from, 1);
    const entry = prev[from];
    if (!to || !entry) continue;
    next[to] = { ...entry, date: to };
  }

  next[startDate] = createRestWaveEntry(startDate);

  return { success: true, schedule: sanitizeWaveSchedule(next) };
}

/**
 * Payload Firebase: schedule per date (senza days[] ridondante).
 */
export function trainingWaveToFirebasePayload(wave) {
  const safe = sanitizeTrainingWave(wave);
  if (!safe) return null;
  /** @type {Record<string, object>} */
  const schedule = {};
  for (const [date, entry] of Object.entries(safe.schedule)) {
    /** @type {Record<string, unknown>} */
    const row = {
      activityId: entry.activityId,
      muscles: entry.muscles || [],
      title: entry.title,
      type: entry.type,
      tdeeMultiplier: entry.tdeeMultiplier,
      expectedVolume: entry.expectedVolume,
      durationMin: entry.durationMin ?? 60,
    };
    if (entry.activityKey) row.activityKey = entry.activityKey;
    if (entry.exactTime) {
      row.exactTime = entry.exactTime;
      row.startTime = entry.exactTime;
    } else if (entry.startTime) {
      row.startTime = entry.startTime;
    }
    if (entry.timeTag) row.timeTag = entry.timeTag;
    if (entry.strengthDetail) row.strengthDetail = entry.strengthDetail;
    schedule[date] = row;
  }
  return {
    waveId: safe.waveId,
    name: safe.name,
    macroGoal: safe.macroGoal,
    startDate: safe.startDate,
    cycleLength: Object.keys(schedule).length,
    isActive: safe.isActive !== false,
    schedule,
    updatedAt: Date.now(),
  };
}

export function waveDayToDayBlock(waveDay, dateKey) {
  if (!waveDay || !dateKey) return null;
  const activityId =
    resolveWorkoutActivityTypeId(waveDay.activityId)
    || catalogKeyToActivityId(waveDay.activityKey, ACTIVITY_CATALOG[waveDay.activityKey])
    || 'pesi';
  const muscles = normalizeMuscleGroupArray(asStringList(waveDay.muscles));
  const burn = resolveWaveDayBurnKcal(waveDay);
  const intensity = deriveWaveIntensity(activityId, muscles, burn);
  const exact =
    normalizeExactTime(waveDay.exactTime)
    || normalizeExactTime(waveDay.startTime)
    || (activityId === 'riposo' ? undefined : DEFAULT_WAVE_TIME_PREFS.sera);

  const block = buildDayBlockFromPlannerAction(
    dateKey,
    {
      name: String(waveDay.title || getWorkoutActivityLogDescription(activityId, muscles) || activityId),
      workoutType: activityId,
      muscles,
      burnKcal: burn,
      durationMin: activityId === 'riposo' ? 0 : Math.round(Number(waveDay.durationMin) || 60),
      startTime: exact,
      intensity,
      strengthDetail: waveDay.strengthDetail || undefined,
    },
    null,
  );

  if (block?.meta && waveDay.timeTag) {
    block.meta.plannerTimeTag = waveDay.timeTag;
  }
  if (block?.meta && exact) {
    block.meta.plannerExactTime = exact;
  }
  return block;
}

/** Initial data per WorkoutView planner mode. */
export function plannerInitialDataFromWaveEntry(entry) {
  if (!entry) return {};
  const activityId = resolveWorkoutActivityTypeId(entry.activityId) || 'pesi';
  const exact =
    normalizeExactTime(entry.exactTime)
    || normalizeExactTime(entry.startTime)
    || DEFAULT_WAVE_TIME_PREFS.sera;
  return {
    workoutType: activityId,
    workoutMuscles: normalizeMuscleGroupArray(asStringList(entry.muscles)),
    workoutKcal: resolveWaveDayBurnKcal(entry),
    workoutDurationMin: String(entry.durationMin ?? (activityId === 'riposo' ? 0 : 60)),
    workoutStrengthDetail: entry.strengthDetail || '',
    workoutStartTime: exactTimeToDecimalHour(exact),
  };
}

export function macroGoalLabel(macroGoalId) {
  const found = MACRO_GOAL_OPTIONS.find((g) => g.id === macroGoalId);
  return found?.label || String(macroGoalId || 'n/d');
}

export function formatWaveDateLabel(iso) {
  const d = parseIsoDateUtc(iso);
  if (!d) return iso;
  try {
    return d.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
