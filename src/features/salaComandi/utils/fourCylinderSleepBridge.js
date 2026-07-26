import { ref, set } from 'firebase/database';
import { normalizeSleepEntry, getTodayString } from '../../../coreEngine';
import { computeSleepEngineSnapshot } from '../../../hooks/useSleepEngine';
import {
  applySleepPipeline,
  fourCylinderFromPhysiologyModel,
  physiologyModelWithFourCylinder,
} from '../engines/fourCylinderEngine';
import { buildDailyNutritionMap } from './fourCylinderNutritionBridge';

/**
 * Normalizza l'entry sonno e ricava input per applySleepPipeline.
 *
 * @param {object} entry voce log grezza
 * @returns {{ sleepHours: number, recoveryEfficiency: number }}
 */
export function resolveSleepRecoveryInput(entry) {
  const normalized = normalizeSleepEntry({ ...entry, type: 'sleep' });
  const snap = computeSleepEngineSnapshot([normalized]);
  const sleepHours = Number(
    normalized.hours ?? normalized.duration ?? normalized.sleepHours,
  ) || 0;
  const recoveryEfficiency = Number.isFinite(snap.recoveryEfficiency)
    ? snap.recoveryEfficiency
    : 0;
  return { sleepHours, recoveryEfficiency };
}

/**
 * Esegue applySleepPipeline e allega fourCylinderSnapshot all'entry log.
 *
 * @param {object} entry
 * @param {object | null | undefined} userModel
 * @param {string} [todayIso]
 * @param {{
 *   fullHistory?: object | null,
 *   proteinTarget?: number | null,
 *   activeLog?: Array | null,
 *   dailyNutritionMap?: Object.<string, boolean> | null,
 * }} [options]
 * @returns {{ entry: object, nextFourCylinderState: object | null, snapshot: object | null }}
 */
export function attachFourCylinderSleepSnapshot(entry, userModel, todayIso, options = {}) {
  const dateIso = String(todayIso || getTodayString()).slice(0, 10);
  if (!userModel || typeof userModel !== 'object') {
    return { entry, nextFourCylinderState: null, snapshot: null };
  }

  const normalized = normalizeSleepEntry({ ...entry, type: 'sleep' });
  const { sleepHours, recoveryEfficiency } = resolveSleepRecoveryInput(normalized);
  const currentFourCylinder = fourCylinderFromPhysiologyModel(userModel, dateIso);

  const dailyNutritionMap =
    options.dailyNutritionMap
    ?? (options.fullHistory
      ? buildDailyNutritionMap(options.fullHistory, options.proteinTarget, {
          activeLog: options.activeLog,
          anchorDate: dateIso,
        })
      : null);

  const { nextState, snapshot } = applySleepPipeline(
    currentFourCylinder,
    {
      sleepHours,
      recoveryEfficiency,
      sleepId: String(normalized.id || entry?.id || ''),
      date: dateIso,
    },
    dateIso,
    dailyNutritionMap,
  );

  return {
    entry: { ...entry, fourCylinderSnapshot: snapshot },
    nextFourCylinderState: nextState,
    snapshot,
  };
}

/**
 * Aggiorna userModel locale e persiste physiology_model.fourCylinder su Firebase.
 *
 * @param {object} config
 * @param {import('firebase/database').Database | null} [config.db]
 * @param {string | null} [config.userUid]
 * @param {object} config.userModel
 * @param {object} config.nextFourCylinderState
 * @param {string | null} [config.lastCalibrationWeek]
 * @param {Function} [config.setUserModel]
 */
export function persistFourCylinderAfterSleep({
  db,
  userUid,
  userModel,
  nextFourCylinderState,
  lastCalibrationWeek,
  setUserModel,
}) {
  if (!nextFourCylinderState || !setUserModel) return;
  const updatedPhysiology = physiologyModelWithFourCylinder(userModel, nextFourCylinderState);
  setUserModel(updatedPhysiology);
  if (!db || !userUid) return;
  set(ref(db, `users/${userUid}/physiology_model`), {
    ...updatedPhysiology,
    ...(lastCalibrationWeek ? { lastCalibrationWeek } : {}),
  }).catch((err) => console.warn('[fourCylinder] sleep physiology save failed:', err));
}
