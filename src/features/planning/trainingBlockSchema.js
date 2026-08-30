import { normalizeMuscleGroupArray } from '../../activityCatalog';

/** Obiettivi macro del blocco. */
export const TRAINING_BLOCK_MACRO_GOALS = Object.freeze([
  { id: 'cut', label: 'Cut / Definizione' },
  { id: 'bulk', label: 'Bulk / Massa' },
  { id: 'recomp', label: 'Ricomposizione' },
  { id: 'maintain', label: 'Mantenimento' },
]);

export const TRAINING_BLOCK_DAY_TYPES = Object.freeze([
  'pesi',
  'cardio',
  'hiit',
  'rest',
]);

const WEEKDAY_LABELS_IT = Object.freeze([
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
]);

const MONTH_LABELS_IT = Object.freeze([
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]);

/**
 * @typedef {'cut' | 'bulk' | 'recomp' | 'maintain'} TrainingBlockMacroGoal
 * @typedef {'pesi' | 'cardio' | 'hiit' | 'rest'} TrainingBlockDayType
 * @typedef {'pending' | 'confirmed' | 'skipped'} TrainingBlockDayStatus
 *
 * @typedef {object} TrainingBlockDay
 * @property {number} dayIndex
 * @property {string} scheduledDate — YYYY-MM-DD giorno solare esatto
 * @property {number} mesocycleWeek — 1-based (Settimana 1, 2, …)
 * @property {TrainingBlockDayType} type
 * @property {string[]} muscles
 * @property {string} title
 * @property {number} [plannedKcalBurn]
 * @property {number | null} [plannedTime] — ora inizio in ore decimali (es. 18.5 = 18:30)
 * @property {number} [durationMin]
 * @property {string | null} [strengthDetail]
 * @property {string | null} [preferredTimeTag]
 * @property {number | null} [targetKcal]
 * @property {number | null} [targetProt]
 * @property {number | null} [targetCarb]
 * @property {number | null} [targetFat]
 * @property {TrainingBlockDayStatus} status
 * @property {string | null} [lastCompletedDate] — YYYY-MM-DD o null
 * @property {number | null} [completedAt] — epoch ms (legacy / audit)
 *
 * @typedef {object} TrainingBlockLastAction
 * @property {'start' | 'postpone' | 'confirm' | 'catch_up'} kind
 * @property {number} at
 * @property {string} date
 *
 * @typedef {object} TrainingBlock
 * @property {string} blockId
 * @property {string} name
 * @property {TrainingBlockMacroGoal} macroGoal
 * @property {boolean} isActive
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} anchorDate
 * @property {number} currentDayPointer
 * @property {TrainingBlockDay[]} days
 * @property {TrainingBlockLastAction | null} [lastAction]
 */

/**
 * @param {string | null | undefined} iso
 * @returns {Date | null}
 */
export function parseIsoDateUtc(iso) {
  const raw = String(iso || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function toIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Oggi in calendario locale.
 * @param {Date} [now]
 * @returns {string}
 */
export function getLocalTodayIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * @param {unknown} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function normalizeIsoDate(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return getLocalTodayIso(new Date(raw));
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) return s.slice(0, 10);
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1e11) {
    return getLocalTodayIso(new Date(asNum));
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeLastCompletedDate(raw) {
  return normalizeIsoDate(raw);
}

/**
 * @param {string} iso
 * @param {number} deltaDays
 * @returns {string | null}
 */
export function addCalendarDaysIso(iso, deltaDays) {
  const base = parseIsoDateUtc(iso);
  if (!base) return null;
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return toIsoDateUtc(base);
}

/**
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number | null}
 */
export function diffCalendarDaysUtc(fromIso, toIso) {
  const from = parseIsoDateUtc(fromIso);
  const to = parseIsoDateUtc(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * @param {unknown} raw
 * @returns {number | null} 1-based week index
 */
export function normalizeMesocycleWeek(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = /(?:settimana\s*)?(\d+)/i.exec(s);
  if (m) return Math.max(1, Math.floor(Number(m[1])));
  return null;
}

/**
 * Settimana di mesociclo da data rispetto all'inizio blocco.
 * @param {string} scheduledDate
 * @param {string} blockStartIso
 * @returns {number}
 */
export function computeMesocycleWeek(scheduledDate, blockStartIso) {
  const diff = diffCalendarDaysUtc(blockStartIso, scheduledDate);
  if (diff == null) return 1;
  if (diff < 0) return 1;
  return Math.floor(diff / 7) + 1;
}

/**
 * @param {number} week
 * @returns {string}
 */
export function formatMesocycleWeekLabel(week) {
  const n = Math.max(1, Math.floor(Number(week) || 1));
  return `Settimana ${n}`;
}

/**
 * Es. "Lunedì, 10 Agosto 2026"
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatScheduledDateLabelIt(iso) {
  const raw = String(iso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw || '—';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const local = new Date(y, mo - 1, d);
  const weekday = WEEKDAY_LABELS_IT[local.getDay()] || '';
  const month = MONTH_LABELS_IT[mo - 1] || '';
  return `${weekday}, ${d} ${month} ${y}`;
}

/**
 * Migrazione legacy dayOfWeek → prima occorrenza on/after anchor.
 * @param {number} dayOfWeek 1=Lun … 7=Dom
 * @param {string} anchorIso
 * @returns {string | null}
 */
function scheduledDateFromLegacyDayOfWeek(dayOfWeek, anchorIso) {
  const anchor = String(anchorIso || getLocalTodayIso()).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  if (!m) return null;
  const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const jsTarget = dayOfWeek === 7 ? 0 : dayOfWeek; // 0=Sun
  const jsNow = local.getDay();
  let delta = jsTarget - jsNow;
  if (delta < 0) delta += 7;
  local.setDate(local.getDate() + delta);
  const y = local.getFullYear();
  const mo = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * @param {unknown} raw
 * @returns {TrainingBlockMacroGoal}
 */
export function normalizeMacroGoal(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'cut' || s === 'cut_lento' || s === 'cut_aggressivo' || s === 'deficit') return 'cut';
  if (s === 'bulk' || s === 'lean_bulk' || s === 'massa' || s === 'surplus') return 'bulk';
  if (s === 'recomp' || s === 'ricomposizione' || s === 'recomposition') return 'recomp';
  if (s === 'maintain' || s === 'mantenimento' || s === 'maintenance' || s === 'pari') return 'maintain';
  return 'maintain';
}

/**
 * @param {unknown} raw
 * @returns {TrainingBlockDayType}
 */
export function normalizeDayType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'rest' || s === 'riposo' || s === 'recovery') return 'rest';
  if (s === 'cardio') return 'cardio';
  if (s === 'hiit') return 'hiit';
  return 'pesi';
}

/**
 * True se la sessione è spuntata (lastCompletedDate valorizzato).
 * @param {Pick<TrainingBlockDay, 'lastCompletedDate'> | null | undefined} day
 */
export function isTrainingSessionCompleted(day) {
  return Boolean(normalizeLastCompletedDate(day?.lastCompletedDate));
}

/**
 * Home: eseguito oggi se lastCompletedDate === todayIso.
 * @param {Pick<TrainingBlockDay, 'lastCompletedDate'> | null | undefined} day
 * @param {string} todayIso
 */
export function isTrainingSessionDoneOn(day, todayIso) {
  const done = normalizeLastCompletedDate(day?.lastCompletedDate);
  const today = String(todayIso || '').slice(0, 10);
  return Boolean(done && today && done === today);
}

/**
 * @param {unknown} raw
 * @param {number} fallbackIndex
 * @param {{ anchorDate?: string, blockStartIso?: string, todayIso?: string }} [options]
 * @returns {TrainingBlockDay}
 */
export function sanitizeTrainingBlockDay(raw, fallbackIndex = 0, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = normalizeDayType(src.type);
  const statusRaw = String(src.status || 'pending').trim().toLowerCase();
  const status =
    statusRaw === 'confirmed' || statusRaw === 'skipped' ? statusRaw : 'pending';
  const dayIndex = Number.isFinite(Number(src.dayIndex))
    ? Math.max(0, Math.floor(Number(src.dayIndex)))
    : fallbackIndex;

  const anchor = normalizeIsoDate(options.anchorDate)
    || normalizeIsoDate(options.todayIso)
    || getLocalTodayIso();

  let scheduledDate = normalizeIsoDate(src.scheduledDate)
    || normalizeIsoDate(src.date)
    || normalizeIsoDate(src.plannedDate);

  // Legacy: dayOfWeek / sequenza dayIndex
  if (!scheduledDate) {
    const legacyDow = Number(src.dayOfWeek != null ? src.dayOfWeek : src.weekday);
    if (Number.isFinite(legacyDow) && legacyDow >= 1 && legacyDow <= 7) {
      scheduledDate = scheduledDateFromLegacyDayOfWeek(Math.round(legacyDow), anchor);
    }
  }
  if (!scheduledDate) {
    scheduledDate = addCalendarDaysIso(anchor, dayIndex) || anchor;
  }

  let mesocycleWeek = normalizeMesocycleWeek(src.mesocycleWeek ?? src.weekNumber);
  const blockStart = normalizeIsoDate(options.blockStartIso) || anchor;
  if (!mesocycleWeek) {
    mesocycleWeek = computeMesocycleWeek(scheduledDate, blockStart);
  }

  const muscles = type === 'rest' ? [] : normalizeMuscleGroupArray(src.muscles || []);
  const title = String(src.title || (type === 'rest' ? 'Riposo' : 'Allenamento')).trim();
  const planned = Number(src.plannedKcalBurn);
  const plannedTimeRaw = Number(
    src.plannedTime != null ? src.plannedTime : src.startTimeDec,
  );
  const plannedTime = type === 'rest'
    ? null
    : (Number.isFinite(plannedTimeRaw) && plannedTimeRaw >= 0 && plannedTimeRaw < 24
      ? plannedTimeRaw
      : null);
  const durationRaw = Number(src.durationMin);
  const durationMin = type === 'rest'
    ? 0
    : (Number.isFinite(durationRaw) && durationRaw >= 0
      ? Math.round(durationRaw)
      : 60);
  const strengthDetail = src.strengthDetail != null
    ? String(src.strengthDetail).trim() || null
    : null;
  const optTarget = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  let lastCompletedDate = normalizeLastCompletedDate(src.lastCompletedDate);
  if (!lastCompletedDate && status === 'confirmed') {
    lastCompletedDate = normalizeLastCompletedDate(src.completedAt);
  }

  return {
    dayIndex,
    scheduledDate,
    mesocycleWeek,
    type,
    muscles,
    title,
    plannedKcalBurn: Number.isFinite(planned) && planned >= 0 ? Math.round(planned) : (type === 'rest' ? 0 : 300),
    plannedTime,
    durationMin,
    strengthDetail,
    preferredTimeTag: src.preferredTimeTag != null ? String(src.preferredTimeTag) : null,
    targetKcal: optTarget(src.targetKcal),
    targetProt: optTarget(src.targetProt),
    targetCarb: optTarget(src.targetCarb),
    targetFat: optTarget(src.targetFat),
    status: lastCompletedDate ? 'confirmed' : status,
    lastCompletedDate,
    completedAt: Number.isFinite(Number(src.completedAt)) && Number(src.completedAt) > 0
      ? Math.round(Number(src.completedAt))
      : null,
  };
}

/**
 * @param {unknown} raw
 * @returns {TrainingBlockLastAction | null}
 */
function sanitizeLastAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').trim();
  if (!['start', 'postpone', 'confirm', 'catch_up'].includes(kind)) return null;
  const date = String(raw.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    kind: /** @type {TrainingBlockLastAction['kind']} */ (kind),
    at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now(),
    date,
  };
}

/**
 * @param {unknown} raw
 * @param {string} [fallbackTodayIso]
 * @returns {TrainingBlock | null}
 */
export function sanitizeTrainingBlock(raw, fallbackTodayIso) {
  if (!raw || typeof raw !== 'object') return null;
  const today = String(fallbackTodayIso || getLocalTodayIso()).slice(0, 10);
  const daysRaw = Array.isArray(raw.days)
    ? raw.days
    : (raw.days && typeof raw.days === 'object'
      ? Object.keys(raw.days).sort((a, b) => Number(a) - Number(b)).map((k) => raw.days[k])
      : []);

  const anchorRaw = String(raw.anchorDate || today).slice(0, 10);
  const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : today;

  // Prima passata: risolvi scheduledDate
  let days = daysRaw.map((d, i) => sanitizeTrainingBlockDay(d, i, {
    anchorDate,
    todayIso: today,
    blockStartIso: anchorDate,
  }));
  if (days.length === 0) return null;

  // Inizio blocco = min scheduledDate (o anchor)
  const sortedDates = days
    .map((d) => d.scheduledDate)
    .filter(Boolean)
    .sort();
  const blockStartIso = sortedDates[0] || anchorDate;

  // Seconda passata: ricalcola mesocycleWeek se mancava / legacy
  days = days.map((d, i) => {
    const src = daysRaw[i] || {};
    const explicit = normalizeMesocycleWeek(src.mesocycleWeek ?? src.weekNumber);
    return {
      ...d,
      mesocycleWeek: explicit || computeMesocycleWeek(d.scheduledDate, blockStartIso),
    };
  }).sort((a, b) => {
    const cmp = String(a.scheduledDate).localeCompare(String(b.scheduledDate));
    if (cmp !== 0) return cmp;
    return a.dayIndex - b.dayIndex;
  });

  let pointer = Math.floor(Number(raw.currentDayPointer) || 0);
  if (pointer < 0) pointer = 0;
  if (pointer > days.length) pointer = days.length;

  return {
    blockId: String(raw.blockId || `block_${Date.now()}`),
    name: String(raw.name || 'Blocco allenamento').trim() || 'Blocco allenamento',
    macroGoal: normalizeMacroGoal(raw.macroGoal),
    isActive: raw.isActive !== false,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    anchorDate,
    currentDayPointer: pointer,
    days,
    lastAction: sanitizeLastAction(raw.lastAction),
  };
}

/**
 * @param {{
 *   name?: string,
 *   macroGoal?: string,
 *   days?: Array<object>,
 *   blockId?: string,
 *   todayIso?: string,
 *   currentDayPointer?: number,
 *   anchorDate?: string,
 *   createdAt?: number,
 *   lastAction?: object | null,
 * }} definition
 * @returns {TrainingBlock}
 */
export function createTrainingBlockFromDefinition(definition = {}) {
  const todayIso = String(definition.todayIso || getLocalTodayIso()).slice(0, 10);
  const daysInput = Array.isArray(definition.days) ? definition.days : [];
  if (daysInput.length === 0) {
    throw new Error('Il blocco richiede almeno una sessione in days[].');
  }
  const now = Date.now();
  const isUpdate = Boolean(definition.blockId);
  let pointer = 0;
  if (isUpdate && Number.isFinite(Number(definition.currentDayPointer))) {
    pointer = Math.max(0, Math.min(daysInput.length, Math.floor(Number(definition.currentDayPointer))));
  }
  const anchorRaw = String(definition.anchorDate || todayIso).slice(0, 10);
  const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : todayIso;

  const draft = {
    blockId: String(definition.blockId || `block_${now}`),
    name: String(definition.name || 'Blocco allenamento').trim() || 'Blocco allenamento',
    macroGoal: normalizeMacroGoal(definition.macroGoal),
    isActive: true,
    createdAt: Number.isFinite(Number(definition.createdAt)) ? Number(definition.createdAt) : now,
    updatedAt: now,
    anchorDate: isUpdate ? anchorDate : todayIso,
    currentDayPointer: pointer,
    days: daysInput,
    lastAction: isUpdate && definition.lastAction
      ? sanitizeLastAction(definition.lastAction) || { kind: 'start', at: now, date: todayIso }
      : { kind: 'start', at: now, date: todayIso },
  };

  const safe = sanitizeTrainingBlock(draft, todayIso);
  if (!safe) throw new Error('Training block non valido.');
  return safe;
}

/**
 * Payload RTDB (senza undefined).
 * @param {TrainingBlock} block
 * @returns {object}
 */
export function trainingBlockToFirebasePayload(block) {
  const safe = sanitizeTrainingBlock(block);
  if (!safe) throw new Error('Training block non valido.');
  return {
    blockId: safe.blockId,
    name: safe.name,
    macroGoal: safe.macroGoal,
    isActive: safe.isActive,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
    anchorDate: safe.anchorDate,
    currentDayPointer: safe.currentDayPointer,
    days: safe.days.map((d) => ({
      dayIndex: d.dayIndex,
      scheduledDate: d.scheduledDate,
      mesocycleWeek: d.mesocycleWeek,
      weekNumber: d.mesocycleWeek,
      type: d.type,
      muscles: d.muscles,
      title: d.title,
      plannedKcalBurn: d.plannedKcalBurn ?? 0,
      plannedTime: d.plannedTime != null && Number.isFinite(Number(d.plannedTime))
        ? Number(d.plannedTime)
        : null,
      durationMin: Number.isFinite(Number(d.durationMin)) ? Math.round(Number(d.durationMin)) : 60,
      strengthDetail: d.strengthDetail || null,
      preferredTimeTag: d.preferredTimeTag || null,
      targetKcal: d.targetKcal != null ? d.targetKcal : null,
      targetProt: d.targetProt != null ? d.targetProt : null,
      targetCarb: d.targetCarb != null ? d.targetCarb : null,
      targetFat: d.targetFat != null ? d.targetFat : null,
      status: d.status,
      lastCompletedDate: d.lastCompletedDate || null,
      completedAt: d.completedAt != null ? d.completedAt : null,
    })),
    lastAction: safe.lastAction || null,
  };
}

/**
 * Sessioni non-riposo con scheduledDate === dateIso.
 * @param {TrainingBlock | null | undefined} block
 * @param {string} dateIso
 * @returns {TrainingBlockDay[]}
 */
export function getTrainingBlockSessionsForDate(block, dateIso) {
  const safe = sanitizeTrainingBlock(block, dateIso);
  if (!safe) return [];
  const date = String(dateIso || '').slice(0, 10);
  return safe.days.filter((d) => d.type !== 'rest' && d.scheduledDate === date);
}

/**
 * Allenamento dovuto oggi (scheduledDate === today). Null = riposo (assenza).
 * @param {TrainingBlock | null | undefined} block
 * @param {string} todayIso
 * @returns {TrainingBlockDay | null}
 */
export function getTodaysTrainingBlockSession(block, todayIso) {
  const safe = sanitizeTrainingBlock(block, todayIso);
  if (!safe || !safe.isActive) return null;
  const matches = getTrainingBlockSessionsForDate(safe, todayIso);
  if (matches.length === 0) return null;
  const pending = matches.find((d) => !isTrainingSessionDoneOn(d, todayIso));
  return pending || matches[0];
}

/**
 * @param {TrainingBlock | null | undefined} block
 * @param {string} todayIso
 */
export function hasConfirmedToday(block, todayIso) {
  const session = getTodaysTrainingBlockSession(block, todayIso);
  if (!session) return false;
  return isTrainingSessionDoneOn(session, todayIso);
}

/**
 * Stato Home SSOT:
 * - nessuna sessione con scheduledDate === oggi → Riposo
 * - sessione, lastCompletedDate !== oggi → Promemoria (pianificato)
 * - sessione, lastCompletedDate === oggi → Eseguito
 *
 * @param {TrainingBlock | null | undefined} block
 * @param {string} todayIso
 * @returns {{ status: 'REST'|'PENDING'|'COMPLETED', session: TrainingBlockDay | null, workoutName: string | null }}
 */
export function resolveTrainingBlockHomeStatus(block, todayIso) {
  const date = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const safe = sanitizeTrainingBlock(block, date);
  if (!safe || !safe.isActive) {
    return { status: 'REST', session: null, workoutName: null };
  }
  const session = getTodaysTrainingBlockSession(safe, date);
  if (!session) {
    return { status: 'REST', session: null, workoutName: null };
  }
  const workoutName = String(session.title || 'Allenamento').trim() || 'Allenamento';
  if (isTrainingSessionDoneOn(session, date)) {
    return { status: 'COMPLETED', session, workoutName };
  }
  return { status: 'PENDING', session, workoutName };
}

/**
 * Raggruppa sessioni per mesocycleWeek (ordine cronologico).
 * @param {TrainingBlockDay[]} days
 * @returns {Array<{ week: number, label: string, sessions: TrainingBlockDay[] }>}
 */
export function groupTrainingBlockDaysByMesocycleWeek(days) {
  /** @type {Map<number, TrainingBlockDay[]>} */
  const map = new Map();
  const list = Array.isArray(days) ? [...days] : [];
  list.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
  for (const d of list) {
    if (String(d.type || '').toLowerCase() === 'rest') continue;
    const week = Math.max(1, Math.floor(Number(d.mesocycleWeek) || 1));
    if (!map.has(week)) map.set(week, []);
    map.get(week).push(d);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, sessions]) => ({
      week,
      label: formatMesocycleWeekLabel(week),
      sessions,
    }));
}

/**
 * Lunedì (locale) della settimana che contiene `iso`.
 * @param {string | null | undefined} iso
 * @returns {string} YYYY-MM-DD
 */
export function getMondayOfLocalWeek(iso) {
  const raw = String(iso || getLocalTodayIso()).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return getLocalTodayIso();
  const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const js = local.getDay(); // 0=Dom
  const delta = js === 0 ? -6 : 1 - js;
  local.setDate(local.getDate() + delta);
  const y = local.getFullYear();
  const mo = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Somma giorni in calendario locale (evita skew UTC su date-only).
 * @param {string} iso
 * @param {number} deltaDays
 * @returns {string | null}
 */
export function addLocalCalendarDaysIso(iso, deltaDays) {
  const raw = String(iso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  local.setDate(local.getDate() + Number(deltaDays || 0));
  const y = local.getFullYear();
  const mo = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Griglia calendario completa Lun→Dom per le settimane del mesociclo attivo.
 * Include sempre la settimana di oggi anche senza sessioni (riposo dedotto).
 *
 * @param {{
 *   sessions?: Array<{ scheduledDate?: string, type?: string }>,
 *   todayIso?: string,
 *   blockStartIso?: string | null,
 * }} [params]
 * @returns {Array<{
 *   monday: string,
 *   week: number,
 *   label: string,
 *   days: Array<{
 *     date: string,
 *     label: string,
 *     isToday: boolean,
 *     isPast: boolean,
 *     isRest: boolean,
 *     session: object | null,
 *   }>,
 * }>}
 */
export function buildTrainingBlockCalendarWeeks({
  sessions = [],
  todayIso = getLocalTodayIso(),
  blockStartIso = null,
} = {}) {
  const today = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const workoutSessions = (Array.isArray(sessions) ? sessions : []).filter(
    (s) => s && String(s.type || '').toLowerCase() !== 'rest' && normalizeIsoDate(s.scheduledDate),
  );

  /** @type {Map<string, object>} */
  const byDate = new Map();
  for (const s of workoutSessions) {
    const date = normalizeIsoDate(s.scheduledDate);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, s);
  }

  const sessionDates = [...byDate.keys()].sort();
  let rangeStart = sessionDates[0] || today;
  let rangeEnd = sessionDates[sessionDates.length - 1] || today;
  if (today < rangeStart) rangeStart = today;
  if (today > rangeEnd) rangeEnd = today;

  const startAnchor = normalizeIsoDate(blockStartIso);
  if (startAnchor && startAnchor < rangeStart) rangeStart = startAnchor;

  const startMonday = getMondayOfLocalWeek(rangeStart);
  const endMonday = getMondayOfLocalWeek(rangeEnd);
  const mesocycleOrigin = startAnchor || startMonday;

  /** @type {ReturnType<typeof buildTrainingBlockCalendarWeeks>} */
  const weeks = [];
  let monday = startMonday;
  let guard = 0;
  while (monday && monday <= endMonday && guard < 52) {
    guard += 1;
    /** @type {Array<{ date: string, label: string, isToday: boolean, isPast: boolean, isRest: boolean, session: object | null }>} */
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const date = addLocalCalendarDaysIso(monday, i);
      if (!date) continue;
      const session = byDate.get(date) || null;
      days.push({
        date,
        label: formatScheduledDateLabelIt(date),
        isToday: date === today,
        isPast: date < today,
        isRest: !session,
        session,
      });
    }
    const weekNum = computeMesocycleWeek(monday, mesocycleOrigin);
    weeks.push({
      monday,
      week: weekNum,
      label: formatMesocycleWeekLabel(weekNum),
      days,
    });
    monday = addLocalCalendarDaysIso(monday, 7);
  }

  return weeks;
}
