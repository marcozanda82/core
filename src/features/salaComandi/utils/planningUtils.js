import { toCanonicalMealType, normalizeMealFoodsArray } from '../../../coreEngine';

/** Pasto / nodo piano: `foods` sempre array, mai undefined. */
export function mealFoodsRead(meal) {
  const f = meal?.foods;
  return Array.isArray(f) ? f : [];
}

/** Chiave stabile pasto pianificato (mealType canonico + mealTime) per `planning/{uid}/{date}`. */
export function planningMealSlotKeyForFirebase(row) {
  const mt = toCanonicalMealType(String(row?.mealType || '').split('_')[0]) || 'snack';
  const t = typeof row?.mealTime === 'number' && !Number.isNaN(row.mealTime) ? row.mealTime : 0;
  return `${mt}_${t.toFixed(3)}`;
}

const PLANNING_TIMING_SLOT_IDS = new Set(['mattina', 'pomeriggio', 'sera']);

/** `timingByMacro` su RTDB: array di fasce per macro (migrazione da stringa singola). */
export function normalizeTimingByMacroForPlanningDoc(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      const arr = [];
      for (const x of v) {
        const s = String(x).trim();
        if (PLANNING_TIMING_SLOT_IDS.has(s) && !arr.includes(s)) arr.push(s);
      }
      out[k] = arr;
    } else if (typeof v === 'string' && PLANNING_TIMING_SLOT_IDS.has(v)) {
      out[k] = [v];
    } else {
      out[k] = [];
    }
  }
  return out;
}

/**
 * Documento RTDB `planning/{userId}/{date}` — separato da tracker_data.
 * @param {object} payload — output PlanningWizard (ghostMeals + wizardMeta + workout flags)
 */
export function buildPlanningFirebaseDoc(payload) {
  const ghostList = Array.isArray(payload?.ghostMeals) ? payload.ghostMeals : [];
  const meta = payload?.wizardMeta || {};
  const stagingDraftBySlot = {};
  const draftMap = meta.stagingDraftById && typeof meta.stagingDraftById === 'object' ? meta.stagingDraftById : {};
  for (const g of ghostList) {
    const key = planningMealSlotKeyForFirebase(g);
    const fromMeta = draftMap[g.id];
    if (Array.isArray(fromMeta) && fromMeta.length > 0) {
      stagingDraftBySlot[key] = fromMeta.map((x) =>
        typeof x === 'string' ? x : `${Math.round(Number(x?.qty ?? x?.weight) || 0) || '?'}g ${String(x?.name || x?.desc || '').trim()}`.trim()
      );
    } else if (mealFoodsRead(g).length > 0) {
      stagingDraftBySlot[key] = mealFoodsRead(g).map((f) =>
        typeof f === 'string'
          ? f
          : `${Math.round(Number(f?.qty) || 0) || '?'}g ${String(f?.name || '').trim()}`.trim()
      );
    }
  }
  const meals = ghostList.map((g) => ({
    mealType: toCanonicalMealType(String(g.mealType || '').split('_')[0]) || 'snack',
    mealTime: typeof g.mealTime === 'number' && !Number.isNaN(g.mealTime) ? g.mealTime : null,
    time: g.time != null ? String(g.time) : undefined,
    title: String(g.title || '').trim(),
    microDesc: String(g.microDesc || '').trim(),
    draftFoods: Array.isArray(g.draftFoods) ? g.draftFoods : [],
    foods: normalizeMealFoodsArray(mealFoodsRead(g)),
    target: g.target != null ? g.target : undefined,
    source: g.source || undefined,
  }));
  const workoutTimesDecPersist = (Array.isArray(payload.workoutTimesDec)
    ? payload.workoutTimesDec
    : typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
      ? [payload.workoutTimeDec]
      : []
  ).filter((x) => typeof x === 'number' && !Number.isNaN(x));
  const activities = {
    macros: Array.isArray(meta.macros) ? [...meta.macros] : [],
    muscles: Array.isArray(meta.muscles) ? [...meta.muscles] : [],
    timingByMacro: normalizeTimingByMacroForPlanningDoc(meta.timingByMacro),
    addGhostWorkout: Boolean(payload.addGhostWorkout),
    workoutTimeDec:
      typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
        ? payload.workoutTimeDec
        : workoutTimesDecPersist[0] ?? null,
    workoutTimesDec: workoutTimesDecPersist,
    stagingDraftBySlot,
  };
  return { meals, activities, createdAt: Date.now() };
}
