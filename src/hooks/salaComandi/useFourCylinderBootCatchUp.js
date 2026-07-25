import { useEffect, useRef } from 'react';
import { ref, get, set } from 'firebase/database';
import { getTodayString } from '../../coreEngine';
import {
  catchUpDecayToDate,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
  physiologyModelWithFourCylinder,
} from '../../features/salaComandi/engines/fourCylinderEngine';

/**
 * Boot catch-up: applica il decadimento virtuale (mezzanotte) tra `lastProcessedDate` e oggi.
 * Esegue una lettura autorevole di `physiology_model`, aggiorna lo stato locale e persiste
 * silenziosamente su Firebase quando servono giorni di recovery o il blocco fourCylinder manca.
 *
 * @param {object} config
 * @param {string | null} config.userUid
 * @param {import('firebase/database').Database | null} config.db
 * @param {boolean} config.isSimulationMode
 * @param {Function} config.setUserModel
 * @param {string | null} [config.lastCalibrationWeek]
 */
export function useFourCylinderBootCatchUp({
  userUid,
  db,
  isSimulationMode,
  setUserModel,
  lastCalibrationWeek,
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

    get(ref(db, `users/${userUid}/physiology_model`))
      .then((physSnap) => {
        const existingDoc = physSnap.exists() && physSnap.val() && typeof physSnap.val() === 'object'
          ? physSnap.val()
          : {};
        const savedCalWeek = existingDoc.lastCalibrationWeek || lastCalibrationWeek || null;
        const { lastCalibrationWeek: _ignored, ...modelFields } = existingDoc;

        const hadFourCylinder = Boolean(existingDoc.fourCylinder ?? existingDoc.four_cylinder);
        let fourCylinder = fourCylinderFromPhysiologyModel(existingDoc, todayIso);
        if (!hadFourCylinder) {
          fourCylinder = createDefaultFourCylinderState(todayIso);
        }

        const { nextState, daysApplied } = catchUpDecayToDate(fourCylinder, todayIso);
        const baseModel = physSnap.exists() ? modelFields : {};
        const mergedModel = physiologyModelWithFourCylinder(baseModel, nextState);

        setUserModel((prev) => ({
          ...prev,
          ...mergedModel,
        }));

        const shouldPersist = daysApplied > 0 || !hadFourCylinder;
        if (!shouldPersist) {
          catchUpDoneForUidRef.current = userUid;
          return undefined;
        }

        const payload = {
          ...mergedModel,
          ...(savedCalWeek ? { lastCalibrationWeek: savedCalWeek } : {}),
        };
        return set(ref(db, `users/${userUid}/physiology_model`), payload).then(() => {
          catchUpDoneForUidRef.current = userUid;
        });
      })
      .catch((err) => {
        console.warn('[fourCylinder] boot catch-up failed:', err);
      })
      .finally(() => {
        catchUpInFlightRef.current = false;
      });

    return undefined;
  }, [userUid, db, isSimulationMode, setUserModel, lastCalibrationWeek]);
}

export default useFourCylinderBootCatchUp;
