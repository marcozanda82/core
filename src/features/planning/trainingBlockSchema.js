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

/**
 * @typedef {'cut' | 'bulk' | 'recomp' | 'maintain'} TrainingBlockMacroGoal
 * @typedef {'pesi' | 'cardio' | 'hiit' | 'rest'} TrainingBlockDayType
 * @typedef {'pending' | 'confirmed' | 'skipped'} TrainingBlockDayStatus
 *
 * @typedef {object} TrainingBlockDay
 * @property {number} dayIndex
 * @property {TrainingBlockDayType} type
 * @property {string[]} muscles
 * @property {string} title
 * @property {number} [plannedKcalBurn]
 * @property {number | null} [plannedTime] — ora inizio in ore decimali (es. 18.5 = 18:30)
 * @property {number} [durationMin]
 * @property {string | null} [strengthDetail]
 * @property {string | null} [preferredTimeTag]
 * @property {number | null} [targetKcal] — Wave Nutrition (AI o fallback)
 * @property {number | null} [targetProt]
 * @property {number | null} [targetCarb]
 * @property {number | null} [targetFat]
 * @property {TrainingBlockDayStatus} status
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
 * Oggi in calendario locale (stessa convenzione di getTodayString in coreEngine).
 * @param {Date} [now]
 * @returns {string}
 */
export function getLocalTodayIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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
 * @param {unknown} raw
 * @param {number} fallbackIndex
 * @returns {TrainingBlockDay}
 */
export function sanitizeTrainingBlockDay(raw, fallbackIndex = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = normalizeDayType(src.type);
  const statusRaw = String(src.status || 'pending').trim().toLowerCase();
  const status =
    statusRaw === 'confirmed' || statusRaw === 'skipped' ? statusRaw : 'pending';
  const dayIndex = Number.isFinite(Number(src.dayIndex))
    ? Math.max(0, Math.floor(Number(src.dayIndex)))
    : fallbackIndex;
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
  const optTarget = (raw) => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    dayIndex,
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
    status,
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
    : (raw.days && typeof raw.days === 'object' ? Object.keys(raw.days).sort((a, b) => Number(a) - Number(b)).map((k) => raw.days[k]) : []);
  const days = daysRaw.map((d, i) => sanitizeTrainingBlockDay(d, i));
  if (days.length === 0) return null;

  let pointer = Math.floor(Number(raw.currentDayPointer) || 0);
  if (pointer < 0) pointer = 0;
  if (pointer > days.length) pointer = days.length;

  const anchorRaw = String(raw.anchorDate || today).slice(0, 10);
  const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : today;

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
  const days = (Array.isArray(definition.days) ? definition.days : [])
    .map((d, i) => sanitizeTrainingBlockDay(d, i));
  if (days.length === 0) {
    throw new Error('Il blocco richiede almeno un giorno in days[].');
  }
  const now = Date.now();
  const isUpdate = Boolean(definition.blockId);
  let pointer = 0;
  if (isUpdate && Number.isFinite(Number(definition.currentDayPointer))) {
    pointer = Math.max(0, Math.min(days.length, Math.floor(Number(definition.currentDayPointer))));
  }
  const anchorRaw = String(definition.anchorDate || todayIso).slice(0, 10);
  const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : todayIso;
  return {
    blockId: String(definition.blockId || `block_${now}`),
    name: String(definition.name || 'Blocco allenamento').trim() || 'Blocco allenamento',
    macroGoal: normalizeMacroGoal(definition.macroGoal),
    isActive: true,
    createdAt: Number.isFinite(Number(definition.createdAt)) ? Number(definition.createdAt) : now,
    updatedAt: now,
    anchorDate: isUpdate ? anchorDate : todayIso,
    currentDayPointer: pointer,
    days,
    lastAction: isUpdate && definition.lastAction
      ? sanitizeLastAction(definition.lastAction) || { kind: 'start', at: now, date: todayIso }
      : { kind: 'start', at: now, date: todayIso },
  };
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
    })),
    lastAction: safe.lastAction || null,
  };
}

/**
 * Sessione “dovuta” oggi, o null se fuori finestra / blocco finito.
 * @param {TrainingBlock | null | undefined} block
 * @param {string} todayIso
 * @returns {TrainingBlockDay | null}
 */
export function getTodaysTrainingBlockSession(block, todayIso) {
  const safe = sanitizeTrainingBlock(block, todayIso);
  if (!safe || !safe.isActive) return null;
  if (safe.currentDayPointer >= safe.days.length) return null;
  if (String(todayIso).slice(0, 10) !== safe.anchorDate) return null;
  return safe.days[safe.currentDayPointer] || null;
}

/**
 * True se oggi è già stata confermata una sessione.
 * @param {TrainingBlock | null | undefined} block
 * @param {string} todayIso
 */
export function hasConfirmedToday(block, todayIso) {
  const date = String(todayIso || '').slice(0, 10);
  return block?.lastAction?.kind === 'confirm' && block?.lastAction?.date === date;
}
