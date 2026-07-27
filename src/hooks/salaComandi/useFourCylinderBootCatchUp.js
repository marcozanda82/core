import { useEffect, useRef } from 'react';
import { ref, get } from 'firebase/database';
import { getTodayString } from '../../coreEngine';
import {
  catchUpDecayToDate,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
  mergeFourCylinderStatePreferNewer,
} from '../../features/salaComandi/engines/fourCylinderEngine';
import { buildDailyNutritionMap } from '../../features/salaComandi/utils/fourCylinderNutritionBridge';
import { persistFourCylinderState } from '../../features/salaComandi/utils/fourCylinderPersist';

/**
 * Boot catch-up: applica il decadimento virtuale (mezzanotte) tra `lastProcessedDate` e oggi.
 * Esegue una lettura autorevole di `physiology_model`, aggiorna lo stato locale e persiste
 * silenziosamente su Firebase solo se il blocco fourCylinder mancava o sono stati applicati giorni di recovery.
 *
 * @param {object} config
 * @param {string | null} config.userUid
 * @param {import('firebase/database').Database | null} config.db
 * @param {boolean} config.isSimulationMode
 * @param {Function} config.setUserModel
 * @param {string | null} [config.lastCalibrationWeek]
 * @param {object | null} [config.fullHistory]
 * @param {number | null} [config.proteinTarget]
 */
export function useFourCylinderBootCatchUp({
  userUid,
  db,
  isSimulationMode,
  setUserModel,
  lastCalibrationWeek,
  fullHistory = null,
  proteinTarget = null,
}) {
  const catchUpInFlightRef = useRef(false);
  const catchUpDoneForUidRef = useRef(null);

  useEffect(() => {
    if (!userUid || !db || isSimulationMode) {
      catchUpDoneForUidRef.current = null;
      return undefined;
    }
    if (catchUpDoneForUidRef.current === userUid || catchUpInFlightRef.current) {
      return undefined;
    }

    catchUpInFlightRef.current = true;
    const todayIso = getTodayString();
    const nutritionMap = fullHistory
      ? buildDailyNutritionMap(fullHistory, proteinTarget)
      : null;

    get(ref(db, `users/${userUid}/physiology_model`))
      .then((physSnap) => {
        const existingDoc = physSnap.exists() && physSnap.val() && typeof physSnap.val() === 'object'
          ? physSnap.val()
          : {};
        const { lastCalibrationWeek: _ignored, ...modelFields } = existingDoc;

        const hadFourCylinder = Boolean(existingDoc.fourCylinder ?? existingDoc.four_cylinder);
        let fourCylinder = fourCylinderFromPhysiologyModel(existingDoc, todayIso);
        if (!hadFourCylinder) {
          fourCylinder = createDefaultFourCylinderState(todayIso);
        }

        const { nextState, daysApplied } = catchUpDecayToDate(
          fourCylinder,
          todayIso,
          null,
          nutritionMap,
        );
        const baseModel = physSnap.exists() ? modelFields : {};
        const needsSave = !hadFourCylinder || daysApplied > 0;

        let resolvedFourCylinder = nextState;
        setUserModel((prev) => {
          resolvedFourCylinder = mergeFourCylinderStatePreferNewer(
            prev?.fourCylinder,
            nextState,
          );
          return {
            ...prev,
            ...baseModel,
            fourCylinder: resolvedFourCylinder,
          };
        });

        catchUpDoneForUidRef.current = userUid;

        if (!needsSave) {
          return undefined;
        }

        return persistFourCylinderState({
          db,
          userUid,
          setUserModel,
          nextFourCylinderState: resolvedFourCylinder,
        });
      })
      .catch((err) => {
        console.warn('[fourCylinder] boot catch-up failed:', err);
      })
      .finally(() => {
        catchUpInFlightRef.current = false;
      });

    return undefined;
  }, [userUid, db, isSimulationMode, setUserModel, lastCalibrationWeek, fullHistory, proteinTarget]);
}

export default useFourCylinderBootCatchUp;
