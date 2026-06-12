/**
 * Schema unificato "Blocco Indivisibile" — workout + strategia calorica per giorno.
 * Sostituisce concettualmente:
 *   - users/{uid}/weeklyStrategicPlanner/days (chiavi lunedi…domenica)
 *   - weeklyPlanning/{uid}/{weekMonday}/days (chiavi ISO)
 *
 * Nuovo percorso RTDB consigliato:
 *   users/{uid}/weeklyBlockPlan/{weekMonday}
 */

import { getWeekStartMondayKeyLocal } from '../../weeklyPlanning';

/** @typedef {'WORKOUT' | 'CARDIO' | 'RECOVERY' | 'REST'} BlockActivityKind */

/**
 * @typedef {object} BlockActivity
 * @property {BlockActivityKind} kind
 * @property {string[]} [focus] — gruppi muscolari (solo WORKOUT)
 * @property {string} [hour] — HH:mm
 * @property {number} [estimatedBurnKcal] — dispendio stimato sessione
 * @property {string} [memoryKey] — es. WORKOUT_Gambe_Petto (calorieMemory legacy)
 */

/**
 * @typedef {'deficit' | 'maintenance' | 'surplus' | 'refeed' | 'custom'} CalorieStrategyStatus
 */

/**
 * @typedef {object} CalorieStrategy
 * @property {CalorieStrategyStatus} status
 * @property {number} deltaKcal — offset rispetto al TDEE profilo (es. +300 surplus gambe)
 * @property {number} [absoluteKcalTarget] — target assoluto se impostato esplicitamente
 * @property {number} [profileKcalBase] — snapshot TDEE al momento della pianificazione
 */

/**
 * Blocco Indivisibile: unità atomica che slitta in domino.
 * @typedef {object} DayBlock
 * @property {string} date — ISO YYYY-MM-DD (slot calendario della settimana)
 * @property {BlockActivity} activity
 * @property {CalorieStrategy} calorieStrategy
 * @property {{ updatedAt?: number, source?: 'user' | 'shift' | 'template' | 'migration' }} [meta]
 */

/**
 * @typedef {object} WeeklyBlockPlan
 * @property {string} weekStart — lunedì ISO YYYY-MM-DD
 * @property {string} goal — recomposition | cut | bulk
 * @property {number} weeklyKcalTarget — somma/obbiettivo settimanale opzionale
 * @property {Record<string, DayBlock>} blocks — chiave = ISO date (7 slot Mon–Sun)
 * @property {Record<string, number>} [calorieMemory] — legacy strategic planner
 * @property {{ deloadFrequencyWeeks?: number, currentWeekInCycle?: number }} [settings]
 * @property {number} [updatedAt]
 */

export const BLOCK_ACTIVITY_KINDS = ['WORKOUT', 'CARDIO', 'RECOVERY', 'REST'];

export const CALORIE_STRATEGY_STATUSES = ['deficit', 'maintenance', 'surplus', 'refeed', 'custom'];

/** Delta predefiniti allineati a coreEngine.CALORIE_STRATEGY_KCAL_DELTA */
export const DEFAULT_STRATEGY_DELTA = {
  deficit: -500,
  maintenance: 0,
  surplus: 400,
  refeed: 300,
  custom: 0,
};

const IT_DAY_KEYS = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

const WEEKLY_PLAN_TYPE_TO_STRATEGY = {
  deficit: { status: 'deficit', deltaKcal: DEFAULT_STRATEGY_DELTA.deficit },
  maintenance: { status: 'maintenance', deltaKcal: DEFAULT_STRATEGY_DELTA.maintenance },
  training: { status: 'surplus', deltaKcal: DEFAULT_STRATEGY_DELTA.surplus },
  refeed: { status: 'refeed', deltaKcal: DEFAULT_STRATEGY_DELTA.refeed },
};

/**
 * Le 7 date ISO (lun→dom) della settimana che inizia in `weekMonday`.
 * @param {string} weekMonday YYYY-MM-DD
 * @returns {string[]}
 */
export function getWeekDateKeysLocal(weekMonday) {
  const anchor = String(weekMonday || '').trim() || getWeekStartMondayKeyLocal();
  const parts = anchor.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return getWeekDateKeysLocal(getWeekStartMondayKeyLocal());
  }
  const keys = [];
  const cursor = new Date(parts[0], parts[1] - 1, parts[2]);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + i);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    keys.push(`${yy}-${mm}-${dd}`);
  }
  return keys;
}

/**
 * @param {string | Date} anchor
 * @returns {string}
 */
export function itDayKeyFromDate(anchor) {
  let d = anchor instanceof Date ? anchor : null;
  if (!d) {
    const parts = String(anchor || '').split('-').map((x) => parseInt(x, 10));
    if (parts.length === 3) d = new Date(parts[0], parts[1] - 1, parts[2]);
  }
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  return IT_DAY_KEYS[d.getDay()] || IT_DAY_KEYS[1];
}

/** Chiavi giorno del Costruttore Settimanale (lun→dom). */
export const PLANNER_WEEK_DAY_KEYS = [
  'lunedi',
  'martedi',
  'mercoledi',
  'giovedi',
  'venerdi',
  'sabato',
  'domenica',
];

/**
 * Blocco assegnato dall'utente (esclude slot REST template vuoti del piano base).
 * @param {DayBlock | null | undefined} block
 * @returns {boolean}
 */
export function isUserAssignedDayBlock(block) {
  if (!block?.activity) return false;
  const src = String(block.meta?.source || '').toLowerCase();
  if (src === 'template') return false;
  const kind = String(block.activity.kind || '').trim();
  return kind.length > 0;
}

/**
 * Ricostruisce `draftBlocks` (chiavi italiane) da piano Firebase.
 * @param {unknown} raw
 * @param {string} [weekMonday]
 * @param {number} [defaultWeeklyTarget]
 * @returns {{
 *   draftBlocks: Record<string, DayBlock | null>,
 *   weeklyTargetKcal: number,
 *   allActionsAssigned: boolean,
 * }}
 */
export function draftFromFirebasePlan(raw, weekMonday, defaultWeeklyTarget = 700) {
  const plan = sanitizeWeeklyBlockPlanFromFirebase(raw, weekMonday);
  const dateKeys = getWeekDateKeysLocal(plan.weekStart);

  /** @type {Record<string, DayBlock | null>} */
  const draftBlocks = {};
  PLANNER_WEEK_DAY_KEYS.forEach((key) => {
    draftBlocks[key] = null;
  });

  dateKeys.forEach((isoDate) => {
    const itKey = itDayKeyFromDate(isoDate);
    const block = plan.blocks[isoDate];
    if (!isUserAssignedDayBlock(block)) return;
    draftBlocks[itKey] = {
      ...block,
      date: itKey,
    };
  });

  const allActionsAssigned = PLANNER_WEEK_DAY_KEYS.every((key) =>
    isUserAssignedDayBlock(draftBlocks[key])
  );

  const wkt = Number(plan.weeklyKcalTarget);
  const weeklyTargetKcal =
    Number.isFinite(wkt) && wkt !== 0 ? Math.round(wkt) : defaultWeeklyTarget;

  return { draftBlocks, weeklyTargetKcal, allActionsAssigned };
}

/**
 * Ricostruisce `draftBlocks` (chiavi ISO) da uno o più piani Firebase per una finestra mobile di 7 giorni.
 * @param {string[]} isoDates — date YYYY-MM-DD da mostrare (es. oggi → oggi+6)
 * @param {Record<string, unknown>} plansByWeekMonday — `weekMonday` → payload Firebase grezzo
 * @param {string} [primaryWeekMonday] — settimana da cui leggere `weeklyKcalTarget`
 * @param {number} [defaultWeeklyTarget]
 * @returns {{
 *   draftBlocks: Record<string, DayBlock | null>,
 *   weeklyTargetKcal: number,
 *   allActionsAssigned: boolean,
 * }}
 */
export function draftFromPlansForIsoWindow(
  isoDates,
  plansByWeekMonday,
  primaryWeekMonday,
  defaultWeeklyTarget = 700
) {
  const anchorWeek =
    primaryWeekMonday && String(primaryWeekMonday).trim()
      ? getWeekStartMondayKeyLocal(primaryWeekMonday)
      : getWeekStartMondayKeyLocal();

  /** @type {Record<string, DayBlock | null>} */
  const draftBlocks = {};
  isoDates.forEach((iso) => {
    draftBlocks[iso] = null;
  });

  let weeklyTargetKcal = defaultWeeklyTarget;
  const primaryRaw = plansByWeekMonday[anchorWeek];
  if (primaryRaw) {
    const primaryPlan = sanitizeWeeklyBlockPlanFromFirebase(primaryRaw, anchorWeek);
    const wkt = Number(primaryPlan.weeklyKcalTarget);
    if (Number.isFinite(wkt) && wkt !== 0) weeklyTargetKcal = Math.round(wkt);
  }

  isoDates.forEach((isoDate) => {
    const weekMonday = getWeekStartMondayKeyLocal(isoDate);
    const raw = plansByWeekMonday[weekMonday];
    if (!raw) return;
    const plan = sanitizeWeeklyBlockPlanFromFirebase(raw, weekMonday);
    const block = plan.blocks[isoDate];
    if (!isUserAssignedDayBlock(block)) return;
    draftBlocks[isoDate] = {
      ...block,
      date: isoDate,
    };
  });

  const allActionsAssigned = isoDates.every((iso) => isUserAssignedDayBlock(draftBlocks[iso]));

  return { draftBlocks, weeklyTargetKcal, allActionsAssigned };
}

/**
 * @param {BlockActivityKind | string} kind
 * @param {BlockActivity} [partial]
 * @returns {BlockActivity}
 */
export function createBlockActivity(kind, partial = {}) {
  const k = BLOCK_ACTIVITY_KINDS.includes(kind) ? kind : 'REST';
  return {
    kind: k,
    focus: k === 'WORKOUT' && Array.isArray(partial.focus) ? [...partial.focus] : [],
    hour: partial.hour != null && String(partial.hour).trim() !== '' ? String(partial.hour) : undefined,
    estimatedBurnKcal:
      Number.isFinite(Number(partial.estimatedBurnKcal)) && Number(partial.estimatedBurnKcal) > 0
        ? Math.round(Number(partial.estimatedBurnKcal))
        : undefined,
    memoryKey: partial.memoryKey != null ? String(partial.memoryKey) : undefined,
  };
}

/**
 * @param {CalorieStrategyStatus | string} status
 * @param {number} [deltaKcal]
 * @param {object} [extra]
 * @returns {CalorieStrategy}
 */
export function createCalorieStrategy(status, deltaKcal, extra = {}) {
  const s = CALORIE_STRATEGY_STATUSES.includes(status) ? status : 'maintenance';
  const fallback = DEFAULT_STRATEGY_DELTA[s] ?? 0;
  const delta = Number.isFinite(Number(deltaKcal)) ? Math.round(Number(deltaKcal)) : fallback;
  const out = { status: s, deltaKcal: delta };
  if (Number.isFinite(Number(extra.absoluteKcalTarget)) && Number(extra.absoluteKcalTarget) > 0) {
    out.absoluteKcalTarget = Math.round(Number(extra.absoluteKcalTarget));
  }
  if (Number.isFinite(Number(extra.profileKcalBase)) && Number(extra.profileKcalBase) > 0) {
    out.profileKcalBase = Math.round(Number(extra.profileKcalBase));
  }
  return out;
}

/**
 * Blocco riposo neutro (slot consumato o giorno svuotato dopo imprevisto).
 * @param {string} date
 * @param {'shift' | 'user' | 'template'} [source]
 * @returns {DayBlock}
 */
export function createRestDayBlock(date, source = 'user') {
  return {
    date: String(date),
    activity: createBlockActivity('REST'),
    calorieStrategy: createCalorieStrategy('maintenance', 0),
    meta: { source, updatedAt: Date.now() },
  };
}

/**
 * @param {string} date
 * @param {BlockActivity} activity
 * @param {CalorieStrategy} calorieStrategy
 * @param {object} [meta]
 * @returns {DayBlock}
 */
export function createDayBlock(date, activity, calorieStrategy, meta = {}) {
  return {
    date: String(date),
    activity: createBlockActivity(activity.kind, activity),
    calorieStrategy: createCalorieStrategy(calorieStrategy.status, calorieStrategy.deltaKcal, calorieStrategy),
    meta: { source: 'user', updatedAt: Date.now(), ...meta },
  };
}

/**
 * @param {string} weekMonday
 * @returns {WeeklyBlockPlan}
 */
export function createEmptyWeeklyBlockPlan(weekMonday) {
  const weekStart = getWeekStartMondayKeyLocal(weekMonday);
  const blocks = {};
  getWeekDateKeysLocal(weekStart).forEach((date) => {
    blocks[date] = createRestDayBlock(date, 'template');
  });
  return {
    weekStart,
    goal: 'recomposition',
    weeklyKcalTarget: 0,
    blocks,
    calorieMemory: {},
    settings: { deloadFrequencyWeeks: 4, currentWeekInCycle: 1 },
  };
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {boolean}
 */
export function isRestOrRecoverySlot(block) {
  if (!block || typeof block !== 'object') return true;
  const kind = String(block.activity?.kind || '').toUpperCase();
  return kind === '' || kind === 'REST' || kind === 'RECOVERY';
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {boolean}
 */
export function isActiveDayBlock(block) {
  if (!block || typeof block !== 'object') return false;
  const kind = String(block.activity?.kind || '').toUpperCase();
  return kind === 'WORKOUT' || kind === 'CARDIO';
}

/**
 * Stima burn da piano strategico legacy.
 * @param {object | null | undefined} legacyDay
 * @returns {number}
 */
export function estimateLegacyActivityBurnKcal(legacyDay) {
  if (!legacyDay || typeof legacyDay !== 'object') return 0;
  const explicit = Number(legacyDay.kcal);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const t = String(legacyDay.type || '').toUpperCase();
  if (t === 'CARDIO') return 400;
  if (t === 'WORKOUT') return 300;
  if (t === 'RECOVERY') return 180;
  return 0;
}

/**
 * Converte un giorno strategic planner + weeklyPlanning nello stesso slot ISO.
 * @param {string} date ISO
 * @param {object | null | undefined} strategicDay
 * @param {object | null | undefined} weeklyPlanDay
 * @returns {DayBlock}
 */
export function dayBlockFromLegacySources(date, strategicDay, weeklyPlanDay) {
  const strategic = strategicDay && typeof strategicDay === 'object' ? strategicDay : null;
  const weekly = weeklyPlanDay && typeof weeklyPlanDay === 'object' ? weeklyPlanDay : null;

  let activity = createBlockActivity('REST');
  if (strategic) {
    const kind = String(strategic.type || 'REST').toUpperCase();
    activity = createBlockActivity(
      BLOCK_ACTIVITY_KINDS.includes(kind) ? kind : 'REST',
      {
        focus: strategic.focus,
        hour: strategic.hour,
        estimatedBurnKcal: estimateLegacyActivityBurnKcal(strategic),
        memoryKey: strategic.memoryKey,
      }
    );
  }

  let calorieStrategy = createCalorieStrategy('maintenance', 0);
  if (weekly) {
    const mapped = WEEKLY_PLAN_TYPE_TO_STRATEGY[weekly.type];
    if (mapped) {
      calorieStrategy = createCalorieStrategy(mapped.status, mapped.deltaKcal, {
        absoluteKcalTarget: weekly.kcalTarget,
      });
    } else if (Number.isFinite(Number(weekly.kcalTarget)) && Number(weekly.kcalTarget) > 0) {
      calorieStrategy = createCalorieStrategy('custom', 0, {
        absoluteKcalTarget: Number(weekly.kcalTarget),
      });
    }
  } else if (isActiveDayBlock({ activity, calorieStrategy })) {
    calorieStrategy = createCalorieStrategy('surplus', DEFAULT_STRATEGY_DELTA.surplus);
  }

  return createDayBlock(date, activity, calorieStrategy, { source: 'migration' });
}

/**
 * @param {unknown} raw
 * @param {string} [weekMonday]
 * @returns {WeeklyBlockPlan}
 */
export function sanitizeWeeklyBlockPlanFromFirebase(raw, weekMonday) {
  const weekStart = getWeekStartMondayKeyLocal(
    raw && typeof raw === 'object' && raw.weekStart ? raw.weekStart : weekMonday
  );
  const base = createEmptyWeeklyBlockPlan(weekStart);
  if (!raw || typeof raw !== 'object') return base;

  const goal = typeof raw.goal === 'string' && raw.goal.trim() !== '' ? raw.goal.trim() : base.goal;
  const wkt = Number(raw.weeklyKcalTarget);
  const weeklyKcalTarget = Number.isFinite(wkt) ? wkt : 0;

  const blocks = { ...base.blocks };
  if (raw.blocks && typeof raw.blocks === 'object' && !Array.isArray(raw.blocks)) {
    for (const [k, v] of Object.entries(raw.blocks)) {
      const date = String(k).trim();
      if (!date || !blocks[date]) continue;
      if (!v || typeof v !== 'object') continue;
      const actKind = String(v.activity?.kind || v.activity?.type || 'REST').toUpperCase();
      const activity = createBlockActivity(
        BLOCK_ACTIVITY_KINDS.includes(actKind) ? actKind : 'REST',
        {
          focus: v.activity?.focus,
          hour: v.activity?.hour,
          estimatedBurnKcal: v.activity?.estimatedBurnKcal ?? v.activity?.kcal,
          memoryKey: v.activity?.memoryKey,
        }
      );
      const stratRaw = v.calorieStrategy || {};
      const status = CALORIE_STRATEGY_STATUSES.includes(stratRaw.status) ? stratRaw.status : 'maintenance';
      const calorieStrategy = createCalorieStrategy(status, stratRaw.deltaKcal, {
        absoluteKcalTarget: stratRaw.absoluteKcalTarget,
        profileKcalBase: stratRaw.profileKcalBase,
      });
      blocks[date] = createDayBlock(date, activity, calorieStrategy, {
        ...(v.meta && typeof v.meta === 'object' ? v.meta : {}),
        source: v.meta?.source || 'user',
        updatedAt: v.meta?.updatedAt || raw.updatedAt,
      });
    }
  }

  return {
    weekStart,
    goal,
    weeklyKcalTarget,
    blocks,
    calorieMemory:
      raw.calorieMemory && typeof raw.calorieMemory === 'object' ? { ...raw.calorieMemory } : {},
    settings: { ...base.settings, ...(raw.settings || {}) },
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : undefined,
  };
}

/**
 * Migrazione one-shot da planner strategico (weekday) + weeklyPlanning (ISO).
 * @param {string} weekMonday
 * @param {object | null | undefined} strategicPlan
 * @param {object | null | undefined} weeklyPlan
 * @returns {WeeklyBlockPlan}
 */
export function migrateLegacyPlansToWeeklyBlockPlan(weekMonday, strategicPlan, weeklyPlan) {
  const weekStart = getWeekStartMondayKeyLocal(weekMonday);
  const dateKeys = getWeekDateKeysLocal(weekStart);
  const strategicDays = strategicPlan?.days && typeof strategicPlan.days === 'object' ? strategicPlan.days : {};
  const weeklyDays = weeklyPlan?.days && typeof weeklyPlan.days === 'object' ? weeklyPlan.days : {};

  const blocks = {};
  dateKeys.forEach((date) => {
    const itKey = itDayKeyFromDate(date);
    blocks[date] = dayBlockFromLegacySources(date, strategicDays[itKey], weeklyDays[date]);
  });

  return sanitizeWeeklyBlockPlanFromFirebase(
    {
      weekStart,
      goal: weeklyPlan?.goal || 'recomposition',
      weeklyKcalTarget: weeklyPlan?.weeklyKcalTarget || 0,
      blocks,
      calorieMemory: strategicPlan?.calorieMemory || {},
      settings: strategicPlan?.settings || {},
      updatedAt: Date.now(),
    },
    weekStart
  );
}

/**
 * Rimuove ricorsivamente chiavi `undefined` (Firebase RTDB le rifiuta).
 * @param {unknown} value
 * @returns {unknown}
 */
export function stripUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    if (child === undefined) return;
    out[key] = stripUndefinedDeep(child);
  });
  return out;
}

/**
 * Meta planner serializzabile su RTDB (solo campi definiti).
 * @param {Record<string, unknown> | null | undefined} meta
 * @returns {Record<string, unknown>}
 */
function sanitizePlannerMetaForFirebase(meta) {
  const src = meta && typeof meta === 'object' ? meta : {};
  /** @type {Record<string, unknown>} */
  const out = {
    source: typeof src.source === 'string' && src.source.trim() ? src.source : 'user',
    updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now(),
  };
  const optionalKeys = [
    'plannerWorkoutType',
    'plannerIntensity',
    'plannerActionName',
    'plannerDurationMin',
    'plannerStrengthDetail',
    'isDeload',
    'phase',
  ];
  optionalKeys.forEach((key) => {
    const val = src[key];
    if (val === undefined || val === null) return;
    if (typeof val === 'string' && val.trim() === '') return;
    out[key] = val;
  });
  return out;
}

/**
 * Payload RTDB per un singolo `DayBlock` (sotto `.../blocks/{isoDate}`).
 * @param {DayBlock} block
 * @returns {Record<string, unknown>}
 */
export function dayBlockToFirebasePayload(block) {
  const b = block && typeof block === 'object' ? block : createRestDayBlock(String(block?.date || ''));
  return stripUndefinedDeep({
    date: b.date,
    activity: {
      kind: b.activity.kind,
      ...(b.activity.focus?.length ? { focus: b.activity.focus } : {}),
      ...(b.activity.hour ? { hour: b.activity.hour } : {}),
      ...(b.activity.estimatedBurnKcal != null
        ? { estimatedBurnKcal: b.activity.estimatedBurnKcal }
        : {}),
      ...(b.activity.memoryKey ? { memoryKey: b.activity.memoryKey } : {}),
    },
    calorieStrategy: {
      status: b.calorieStrategy.status,
      deltaKcal: b.calorieStrategy.deltaKcal,
      ...(b.calorieStrategy.absoluteKcalTarget != null
        ? { absoluteKcalTarget: b.calorieStrategy.absoluteKcalTarget }
        : {}),
      ...(b.calorieStrategy.profileKcalBase != null
        ? { profileKcalBase: b.calorieStrategy.profileKcalBase }
        : {}),
    },
    meta: sanitizePlannerMetaForFirebase(b.meta),
  });
}

/** Payload RTDB per `users/{uid}/weeklyBlockPlan/{weekMonday}` */
export function weeklyBlockPlanToFirebasePayload(plan) {
  const s = sanitizeWeeklyBlockPlanFromFirebase(plan, plan?.weekStart);
  const blocksOut = {};
  Object.entries(s.blocks).forEach(([date, block]) => {
    blocksOut[date] = dayBlockToFirebasePayload(block);
  });

  return stripUndefinedDeep({
    weekStart: s.weekStart,
    goal: s.goal,
    weeklyKcalTarget: s.weeklyKcalTarget,
    blocks: blocksOut,
    calorieMemory: s.calorieMemory || {},
    settings: s.settings || {},
    updatedAt: Date.now(),
  });
}

/**
 * TDEE di profilo valido per il calcolo live (impostazioni utente correnti).
 * @param {unknown} profileKcal
 * @returns {number | null}
 */
function resolveLiveProfileKcal(profileKcal) {
  const n = Math.round(Number(profileKcal));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Kcal target effettivo del blocco (assoluto o TDEE profilo corrente + delta pianificato).
 * Il `profileKcal` passato (es. `userTargets.kcal`) ha priorità sullo snapshot
 * `profileKcalBase` salvato in pianificazione, così la Home riflette le Impostazioni reali.
 * @param {DayBlock} block
 * @param {number} [profileKcal]
 * @returns {number}
 */
export function resolveBlockKcalTarget(block, profileKcal = 2000) {
  const abs = Number(block?.calorieStrategy?.absoluteKcalTarget);
  if (Number.isFinite(abs) && abs > 0) return Math.round(abs);
  const liveBase = resolveLiveProfileKcal(profileKcal);
  const snapshotBase = Math.round(Number(block?.calorieStrategy?.profileKcalBase));
  const base =
    liveBase
    ?? (Number.isFinite(snapshotBase) && snapshotBase > 0 ? snapshotBase : null)
    ?? 2000;
  const delta = Number(block?.calorieStrategy?.deltaKcal) || 0;
  return Math.max(1200, Math.round(base + delta));
}
