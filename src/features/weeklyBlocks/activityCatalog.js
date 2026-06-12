import {
  generateWorkoutComboSignature,
  normalizeMuscleGroupArray,
} from '../../activityCatalog';
import { WORKOUT_DURATION_DEFAULT } from '../../utils/durationMinutesInput';

/** @typedef {'high' | 'medium' | 'low' | 'rest'} ActivityIntensity */

/**
 * @typedef {object} ActivityCatalogEntry
 * @property {number} burnKcal
 * @property {ActivityIntensity} intensity
 * @property {import('./weeklyBlockSchema').BlockActivityKind} kind
 * @property {string[]} focus
 * @property {string} [memoryKey]
 */

/** @typedef {import('./weeklyBlockSchema').DayBlock} DayBlock */

/**
 * @typedef {object} PlannerComboHistoryEntry
 * @property {number} burnKcal
 * @property {number} durationMin
 * @property {number} startTime
 */

/**
 * @typedef {import('../../drawers/vistas/WorkoutView').PlannerActionObject} PlannerActionObject
 * @typedef {import('../../drawers/vistas/WorkoutView').PlannerWorkoutInitialData} PlannerWorkoutInitialData
 */

export const HISTORICAL_DEFAULT_BURN = 250;
const DRAFT_PROFILE_KCAL = 2200;

function hourStrToDecimal(hour) {
  if (!hour || typeof hour !== 'string') return 18;
  const [hh, mm] = hour.split(':').map((x) => parseInt(x, 10) || 0);
  return Math.min(23.99, Math.max(0, hh + mm / 60));
}

/** @type {Record<string, ActivityCatalogEntry>} */
export const ACTIVITY_CATALOG = {
  Gambe: {
    burnKcal: 350,
    intensity: 'high',
    kind: 'WORKOUT',
    focus: ['Gambe'],
    memoryKey: 'WORKOUT_Gambe',
  },
  Dorso: {
    burnKcal: 350,
    intensity: 'high',
    kind: 'WORKOUT',
    focus: ['Dorso'],
    memoryKey: 'WORKOUT_Dorso',
  },
  Abs: {
    burnKcal: 200,
    intensity: 'medium',
    kind: 'WORKOUT',
    focus: ['Addominali'],
    memoryKey: 'WORKOUT_Abs',
  },
  Cardio: {
    burnKcal: 250,
    intensity: 'low',
    kind: 'CARDIO',
    focus: [],
    memoryKey: 'CARDIO',
  },
  Riposo: {
    burnKcal: 0,
    intensity: 'rest',
    kind: 'REST',
    focus: [],
  },
};

export const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_CATALOG);

const LEGACY_ACTIVITY_MAP = {
  'Forza - Gambe': 'Gambe',
  'Forza - Spinta': 'Abs',
};

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string}
 */
export function activityTypeFromBlock(block) {
  if (!block?.activity) return 'Gambe';

  const kind = String(block.activity.kind || 'WORKOUT').toUpperCase();
  const focus = Array.isArray(block.activity.focus) ? block.activity.focus : [];

  if (kind === 'REST') return 'Riposo';
  if (kind === 'CARDIO') return 'Cardio';
  if (focus.some((f) => /gambe/i.test(String(f)))) return 'Gambe';
  if (focus.some((f) => /dorso/i.test(String(f)))) return 'Dorso';
  if (focus.some((f) => /addom|abs/i.test(String(f)))) return 'Abs';
  if (focus.some((f) => /petto|spall/i.test(String(f)))) return 'Abs';

  return 'Gambe';
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {ActivityIntensity}
 */
export function intensityFromBlock(block) {
  if (block?.meta?.plannerWorkoutType === 'riposo') return 'rest';
  if (block?.meta?.plannerIntensity) return block.meta.plannerIntensity;
  const type = activityTypeFromBlock(block);
  return ACTIVITY_CATALOG[type]?.intensity ?? 'low';
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string}
 */
export function activityLabelFromBlock(block) {
  if (!block?.activity) return '—';
  if (block.meta?.plannerActionName) return String(block.meta.plannerActionName);
  return activityTypeFromBlock(block);
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {PlannerWorkoutInitialData}
 */
export function plannerInitialDataFromDayBlock(block) {
  if (!block) return {};

  if (block.meta?.plannerWorkoutType) {
    return {
      workoutType: block.meta.plannerWorkoutType,
      workoutMuscles: Array.isArray(block.activity?.focus) ? block.activity.focus : [],
      workoutKcal: Number(block.activity?.estimatedBurnKcal) || 0,
      workoutStartTime: hourStrToDecimal(block.activity?.hour),
      workoutDurationMin: block.meta.plannerDurationMin ?? '60',
      workoutStrengthDetail: block.meta.plannerStrengthDetail ?? '',
    };
  }

  const kind = String(block.activity?.kind || 'WORKOUT').toUpperCase();
  if (kind === 'REST' || block.meta?.plannerWorkoutType === 'riposo') {
    return { workoutType: 'riposo', workoutKcal: 0, workoutDurationMin: '0' };
  }
  if (kind === 'CARDIO') {
    return {
      workoutType: 'cardio',
      workoutKcal: Number(block.activity?.estimatedBurnKcal) || 250,
      workoutDurationMin: '60',
      workoutStartTime: hourStrToDecimal(block.activity?.hour),
    };
  }

  const focus = Array.isArray(block.activity?.focus) ? block.activity.focus : [];
  return {
    workoutType: 'pesi',
    workoutMuscles: focus,
    workoutKcal: Number(block.activity?.estimatedBurnKcal) || 250,
    workoutDurationMin: '60',
    workoutStartTime: hourStrToDecimal(block.activity?.hour),
  };
}

/**
 * Bozza precompilata per Activity Tracker dalla pianificazione del giorno.
 * @param {DayBlock | null | undefined} block
 * @returns {(PlannerWorkoutInitialData & {
 *   planPhase?: string | null,
 *   planIsDeload?: boolean,
 *   planActionName?: string | null,
 * }) | null}
 */
export function buildWorkoutDraftFromPlanBlock(block) {
  if (!block) return null;

  const base = plannerInitialDataFromDayBlock(block);
  const phase = block.meta?.phase != null ? String(block.meta.phase).trim() : null;
  const muscles = Array.isArray(block.activity?.focus) ? block.activity.focus : [];
  let details = String(block.meta?.plannerStrengthDetail || '').trim();
  if (!details && phase) details = `Fase: ${phase}`;
  if (!details && muscles.length > 0) details = muscles.join(' · ');

  return {
    ...base,
    workoutStrengthDetail: details || base.workoutStrengthDetail || '',
    planPhase: phase,
    planIsDeload: block.meta?.isDeload === true,
    planActionName:
      block.meta?.plannerActionName != null
        ? String(block.meta.plannerActionName)
        : block.meta?.plannerWorkoutType != null
          ? String(block.meta.plannerWorkoutType)
          : null,
  };
}

/**
 * @param {string} dayKey
 * @param {PlannerActionObject} action
 * @param {DayBlock | null | undefined} [existingBlock]
 * @returns {DayBlock}
 */
export function buildDayBlockFromPlannerAction(dayKey, action, existingBlock = null) {
  const intensity = action.intensity;
  const burn = Math.max(0, Math.round(Number(action.burnKcal) || 0));
  const muscles = Array.isArray(action.muscles) ? [...action.muscles] : [];

  /** @type {DayBlock['activity']} */
  let activity;

  if (action.workoutType === 'riposo' || intensity === 'rest' || burn <= 0) {
    activity = { kind: 'REST', focus: [] };
  } else if (action.workoutType === 'cardio' || action.workoutType === 'hiit') {
    activity = {
      kind: 'CARDIO',
      focus: [],
      hour: action.startTime,
      estimatedBurnKcal: burn,
      memoryKey: action.workoutType === 'hiit' ? 'HIIT' : 'CARDIO',
    };
  } else {
    activity = {
      kind: 'WORKOUT',
      focus: muscles,
      hour: action.startTime,
      estimatedBurnKcal: burn,
      memoryKey: `WORKOUT_${muscles.join('_') || action.workoutType}`,
    };
  }

  const preservedStrategy = existingBlock?.calorieStrategy;
  const calorieStrategy = preservedStrategy
    ? { ...preservedStrategy }
    : {
        status: 'maintenance',
        deltaKcal: 0,
        profileKcalBase: DRAFT_PROFILE_KCAL,
      };

  /** @type {DayBlock['meta']} */
  const meta = {
    source: 'user',
    updatedAt: Date.now(),
    plannerIntensity: intensity,
    plannerWorkoutType: action.workoutType,
  };
  if (action.name) meta.plannerActionName = action.name;
  if (action.durationMin != null && Number.isFinite(Number(action.durationMin))) {
    meta.plannerDurationMin = Number(action.durationMin);
  }
  if (action.strengthDetail) meta.plannerStrengthDetail = action.strengthDetail;

  return {
    date: dayKey,
    activity,
    calorieStrategy,
    meta,
  };
}

/**
 * @param {string} activityType
 * @returns {string}
 */
export function normalizeActivityType(activityType) {
  return LEGACY_ACTIVITY_MAP[activityType] ?? activityType;
}

/**
 * @param {string} dayKey
 * @param {string} activityType
 * @param {number} burnKcal
 * @param {DayBlock | null | undefined} [existingBlock]
 * @returns {DayBlock}
 */
export function buildActionBlock(dayKey, activityType, burnKcal, existingBlock = null) {
  const type = normalizeActivityType(activityType);
  const entry = ACTIVITY_CATALOG[type] ?? ACTIVITY_CATALOG.Gambe;
  const burn = type === 'Riposo' ? 0 : Math.max(0, Math.round(Number(burnKcal) || 0));

  /** @type {DayBlock['activity']} */
  const activity = {
    kind: entry.kind,
    focus: [...entry.focus],
    hour: type === 'Riposo' ? undefined : '18:00',
    estimatedBurnKcal: burn > 0 ? burn : undefined,
    memoryKey: entry.memoryKey,
  };

  const preservedStrategy = existingBlock?.calorieStrategy;
  const calorieStrategy = preservedStrategy
    ? { ...preservedStrategy }
    : {
        status: 'maintenance',
        deltaKcal: 0,
        profileKcalBase: DRAFT_PROFILE_KCAL,
      };

  return {
    date: dayKey,
    activity,
    calorieStrategy,
    meta: { source: 'user', updatedAt: Date.now(), ...(existingBlock?.meta || {}) },
  };
}

/**
 * @param {Record<string, DayBlock | null | undefined>} draftBlocks
 * @param {string} [excludeDayKey]
 * @returns {Record<string, PlannerComboHistoryEntry>}
 */
export function buildPlannerComboHistoryFromDraft(draftBlocks, excludeDayKey) {
  /** @type {Record<string, PlannerComboHistoryEntry>} */
  const history = {};

  Object.entries(draftBlocks).forEach(([dayKey, block]) => {
    if (!block || dayKey === excludeDayKey) return;
    const workoutType = block.meta?.plannerWorkoutType;
    if (!workoutType) return;

    const muscles = normalizeMuscleGroupArray(block.activity?.focus);
    const signature = generateWorkoutComboSignature(workoutType, muscles);
    const burn = Number(block.activity?.estimatedBurnKcal);
    const durationMin = Number(block.meta?.plannerDurationMin);
    const startTime = hourStrToDecimal(block.activity?.hour);

    history[signature] = {
      burnKcal: Number.isFinite(burn) && burn >= 0 ? burn : HISTORICAL_DEFAULT_BURN,
      durationMin: Number.isFinite(durationMin) && durationMin > 0
        ? Math.round(durationMin)
        : WORKOUT_DURATION_DEFAULT,
      startTime: Number.isFinite(startTime) ? startTime : 18,
    };
  });

  return history;
}

export function buildBurnHistoryFromDraft(draftBlocks, excludeDayKey) {
  /** @type {Record<string, number>} */
  const history = {};

  Object.entries(draftBlocks).forEach(([dayKey, block]) => {
    if (!block || dayKey === excludeDayKey) return;
    const type = activityTypeFromBlock(block);
    const burn = Number(block.activity?.estimatedBurnKcal);
    if (Number.isFinite(burn) && burn >= 0) {
      history[type] = burn;
    }
  });

  return history;
}

/**
 * @param {string} activityType
 * @param {Record<string, number>} [burnHistory]
 */
export function resolveHistoricalBurn(activityType, burnHistory = {}) {
  const type = normalizeActivityType(activityType);
  if (type === 'Riposo') return 0;
  if (Number.isFinite(burnHistory[type])) return burnHistory[type];
  return HISTORICAL_DEFAULT_BURN;
}
