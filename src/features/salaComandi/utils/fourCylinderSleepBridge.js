import { normalizeSleepEntry, getTodayString } from '../../../coreEngine';
import { computeSleepEngineSnapshot } from '../../../hooks/useSleepEngine';
import {
  applySleepPipeline,
  fourCylinderFromPhysiologyModel,
} from '../engines/fourCylinderEngine';
import { buildDailyNutritionMap } from './fourCylinderNutritionBridge';
import { persistFourCylinderState } from './fourCylinderPersist';

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
 * Aggiorna userModel locale e persiste physiology_model.fourCylinder via Data Guard.
 * (Prima usava set() sull'intero physiology_model — bypass pericoloso.)
 *
 * @param {object} config
 * @param {import('firebase/database').Database | null} [config.db]
 * @param {string | null} [config.userUid]
 * @param {object} [config.userModel] legacy unused (compat)
 * @param {object} config.nextFourCylinderState
 * @param {string | null} [config.lastCalibrationWeek] legacy unused
 * @param {Function} [config.setUserModel]
 * @param {object | null} [config.fullHistory]
 * @param {string | null} [config.anchorDateIso]
 */
export function persistFourCylinderAfterSleep({
  db,
  userUid,
  nextFourCylinderState,
  setUserModel,
  fullHistory = null,
  anchorDateIso = null,
}) {
  if (!nextFourCylinderState || !setUserModel) return;
  persistFourCylinderState({
    db,
    userUid,
    setUserModel,
    nextFourCylinderState,
    fullHistory,
    anchorDateIso,
    source: 'persistFourCylinderAfterSleep',
  });
}
