import { ref, remove, update } from 'firebase/database';
import { getTodayString } from '../../../coreEngine';
import {
  FOUR_CYLINDER_ENGINE_VERSION,
  muscleDecaySum,
  sanitizeFourCylinderState,
} from '../engines/fourCylinderEngine';
import { persistFourCylinderState } from './fourCylinderPersist';
import { rebuildFourCylinderFromTrackerHistory } from './fourCylinderRebuild';
import { buildFourCylinderTelemetrySeries } from './fourCylinderTelemetryHistory';
import { setFourCylinderWriteGuardContext } from './fourCylinderWriteGuard';

/**
 * @typedef {object} FourCylinderRecoveryDeps
 * @property {import('firebase/database').Database | null} db
 * @property {string | null} userUid
 * @property {object | null} fullHistory
 * @property {Function} setUserModel
 * @property {number | null} [proteinTarget]
 * @property {string | null} [todayIso]
 * @property {boolean} [isSimulationMode]
 */

/** @type {FourCylinderRecoveryDeps | null} */
let recoveryDeps = null;

/**
 * Registra dipendenze runtime per hard rehydrate (nessuna UI — invocabile da console).
 * @param {FourCylinderRecoveryDeps} deps
 */
export function registerFourCylinderRecoveryDeps(deps) {
  recoveryDeps = deps && typeof deps === 'object' ? { ...deps } : null;
  if (typeof window !== 'undefined' && recoveryDeps) {
    window.__kentuHardRehydrateFourCylinder = () => hardRehydrateFourCylinderFromHistory();
  }
}

/**
 * Hard rehydration: cancella physiology_model/fourCylinder su Firebase e ricostruisce
 * dallo storico allenamenti (fullHistory). Uso temporaneo anti-corruzione.
 *
 * @param {Partial<FourCylinderRecoveryDeps>} [override]
 * @returns {Promise<{
 *   ok: boolean,
 *   nextState: import('../engines/fourCylinderEngine').FourCylinderState | null,
 *   error?: string,
 * }>}
 */
export async function hardRehydrateFourCylinderFromHistory(override = {}) {
  const deps = {
    ...(recoveryDeps || {}),
    ...override,
  };
  const {
    db = null,
    userUid = null,
    fullHistory = null,
    setUserModel = null,
    proteinTarget = null,
    todayIso = null,
    isSimulationMode = false,
  } = deps;

  const anchor = String(todayIso || getTodayString()).slice(0, 10);

  if (!setUserModel) {
    const error = '[fourCylinder:recovery] setUserModel missing';
    console.error(error);
    return { ok: false, nextState: null, error };
  }
  if (!fullHistory || typeof fullHistory !== 'object' || Object.keys(fullHistory).length === 0) {
    const error = '[fourCylinder:recovery] fullHistory empty — cannot rebuild';
    console.error(error);
    return { ok: false, nextState: null, error };
  }

  setFourCylinderWriteGuardContext({ fullHistory, anchorDateIso: anchor });

  console.warn('[fourCylinder:recovery] HARD REHYDRATE starting — deleting remote fourCylinder node');

  if (!isSimulationMode && db && userUid) {
    try {
      await remove(ref(db, `users/${userUid}/physiology_model/fourCylinder`));
      await update(ref(db, `users/${userUid}/physiology_model`), {
        four_cylinder: null,
      });
    } catch (err) {
      console.error('[fourCylinder:recovery] failed to delete remote node:', err);
      return { ok: false, nextState: null, error: String(err?.message || err) };
    }
  }

  let nextState = rebuildFourCylinderFromTrackerHistory({
    fullHistory,
    anchorDateIso: anchor,
    proteinTarget,
    seedState: null,
  });

  nextState = sanitizeFourCylinderState({
    ...nextState,
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    updatedAt: Date.now(),
  }, anchor);

  // Allinea a residuo telemetria se il rebuild restasse a 0 con storico pieno di snapshot.
  if (muscleDecaySum(nextState.decay) === 0) {
    const series = buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: 14,
      endDate: anchor,
      fourCylinder: null,
    });
    const tip = series[series.length - 1];
    if (tip && muscleDecaySum(tip) > 0) {
      nextState = sanitizeFourCylinderState({
        ...nextState,
        decay: {
          legs: tip.legs,
          chest: tip.chest,
          back_shoulders: tip.back_shoulders,
          arms: tip.arms,
          core: tip.core,
        },
        systemic_fatigue: tip.fatigue,
        lastProcessedDate: anchor,
        lastUpdatedIso: anchor,
        updatedAt: Date.now(),
      }, anchor);
    }
  }

  setUserModel((prev) => ({
    ...prev,
    fourCylinder: nextState,
  }));

  if (!isSimulationMode && db && userUid) {
    await persistFourCylinderState({
      db,
      userUid,
      setUserModel,
      nextFourCylinderState: nextState,
      fullHistory,
      anchorDateIso: anchor,
      source: 'hardRehydrateFourCylinderFromHistory',
    });
  }

  const sum = muscleDecaySum(nextState.decay);
  console.warn('[fourCylinder:recovery] HARD REHYDRATE done', {
    decaySum: sum,
    engineVersion: nextState.engineVersion,
  });

  return { ok: sum > 0, nextState, error: sum > 0 ? undefined : 'rebuild produced zero decay' };
}
