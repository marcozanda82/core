import { useEffect, useRef } from 'react';
import { ref, get } from 'firebase/database';
import { getTodayString } from '../../coreEngine';
import {
  catchUpDecayToDate,
  createDefaultFourCylinderState,
  FOUR_CYLINDER_ENGINE_VERSION,
  fourCylinderFromPhysiologyModel,
  mergeFourCylinderStatePreferNewer,
  muscleDecaySum,
} from '../../features/salaComandi/engines/fourCylinderEngine';
import { buildDailyNutritionMap } from '../../features/salaComandi/utils/fourCylinderNutritionBridge';
import { persistFourCylinderState } from '../../features/salaComandi/utils/fourCylinderPersist';
import {
  isTrackerHistoryHydrated,
  rebuildFourCylinderFromTrackerHistory,
  trackerHistoryHasRecentWorkout,
} from '../../features/salaComandi/utils/fourCylinderRebuild';
import { buildFourCylinderTelemetrySeries } from '../../features/salaComandi/utils/fourCylinderTelemetryHistory';
import { setFourCylinderWriteGuardContext } from '../../features/salaComandi/utils/fourCylinderWriteGuard';
import { registerFourCylinderRecoveryDeps } from '../../features/salaComandi/utils/fourCylinderRecovery';

/** Lookback per heal: snapshot a decay 0 ma allenamenti recenti → rebuild dallo storico. */
const ZERO_DECAY_HEAL_LOOKBACK_DAYS = 7;

/**
 * Boot catch-up: decadimento virtuale + migrate engineVersion < 2 + heal snapshot azzerato.
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
  const catchUpDoneForUidRef = useRef(null);

  useEffect(() => {
    if (!userUid || !db || isSimulationMode) {
      catchUpDoneForUidRef.current = null;
      return undefined;
    }
    if (catchUpDoneForUidRef.current === userUid) {
      return undefined;
    }

    let cancelled = false;
    const todayIso = getTodayString();
    console.time('[perf] fourCylinderBootCatchUp');

    setFourCylinderWriteGuardContext({
      fullHistory,
      anchorDateIso: todayIso,
    });
    registerFourCylinderRecoveryDeps({
      db,
      userUid,
      fullHistory,
      setUserModel,
      proteinTarget,
      todayIso,
      isSimulationMode,
    });

    get(ref(db, `users/${userUid}/physiology_model`))
      .then((physSnap) => {
        // Build nutrition map inside .then() so it runs after the network wait, not blocking the main thread during boot
        const nutritionMap = fullHistory
          ? buildDailyNutritionMap(fullHistory, proteinTarget)
          : null;
        const historyHydrated = isTrackerHistoryHydrated(fullHistory);
        if (cancelled) return undefined;

        const existingDoc = physSnap.exists() && physSnap.val() && typeof physSnap.val() === 'object'
          ? physSnap.val()
          : {};
        const { lastCalibrationWeek: _ignored, ...modelFields } = existingDoc;

        const hadFourCylinder = Boolean(existingDoc.fourCylinder ?? existingDoc.four_cylinder);
        let fourCylinder = fourCylinderFromPhysiologyModel(existingDoc, todayIso);
        if (!hadFourCylinder) {
          fourCylinder = createDefaultFourCylinderState(todayIso);
        }

        const rawVersion = Number(fourCylinder.engineVersion) || 1;
        const decaySum = muscleDecaySum(fourCylinder.decay);
        const needsV2Migrate = rawVersion < FOUR_CYLINDER_ENGINE_VERSION;
        const needsZeroHeal = decaySum === 0
          && trackerHistoryHasRecentWorkout(fullHistory, todayIso, ZERO_DECAY_HEAL_LOOKBACK_DAYS);

        // Snapshot sospetto (migrate/heal) ma storico non ancora scaricato: riprova quando fullHistory arriva.
        if ((needsV2Migrate || decaySum === 0) && !historyHydrated) {
          const { nextState } = catchUpDecayToDate(
            fourCylinder,
            todayIso,
            null,
            nutritionMap,
          );
          if (cancelled) return undefined;
          setUserModel((prev) => ({
            ...prev,
            ...modelFields,
            fourCylinder: mergeFourCylinderStatePreferNewer(prev?.fourCylinder, nextState),
          }));
          return undefined;
        }

        let rebuiltFromHistory = false;
        if ((needsV2Migrate || needsZeroHeal) && historyHydrated) {
          fourCylinder = rebuildFourCylinderFromTrackerHistory({
            fullHistory,
            anchorDateIso: todayIso,
            proteinTarget,
            seedState: fourCylinder,
          });
          // rebuild già applica catchUpDecayToDate fino a oggi (codino residuo).
          fourCylinder = {
            ...fourCylinder,
            engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
            updatedAt: Date.now(),
          };

          // Se il live resta a 0 ma la telemetria ha residuo a ore, allinea lo snapshot.
          if (muscleDecaySum(fourCylinder.decay) === 0) {
            const series = buildFourCylinderTelemetrySeries(fullHistory, {
              daysBack: 14,
              endDate: todayIso,
              fourCylinder: null,
            });
            const tip = series[series.length - 1];
            if (tip && muscleDecaySum(tip) > 0) {
              fourCylinder = {
                ...fourCylinder,
                decay: {
                  legs: tip.legs,
                  chest: tip.chest,
                  back_shoulders: tip.back_shoulders,
                  arms: tip.arms,
                  core: tip.core,
                },
                systemic_fatigue: tip.fatigue,
                lastProcessedDate: todayIso,
                lastUpdatedIso: todayIso,
                updatedAt: Date.now(),
              };
              console.info('[fourCylinder] heal: aligned live decay to telemetry residual tip', {
                chest: tip.chest,
              });
            }
          }

          rebuiltFromHistory = true;
          if (needsZeroHeal) {
            console.info(
              '[fourCylinder] heal: decay sum was 0 with recent workouts — rebuilt from tracker history',
            );
          }
        }

        // Dopo rebuild lo stato è già allineato a oggi; altrimenti catch-up incrementale.
        const { nextState, daysApplied } = rebuiltFromHistory
          ? { nextState: fourCylinder, daysApplied: 0 }
          : catchUpDecayToDate(fourCylinder, todayIso, null, nutritionMap);
        if (cancelled) return undefined;

        const baseModel = physSnap.exists() ? modelFields : {};
        const needsSave = !hadFourCylinder || daysApplied > 0 || rebuiltFromHistory;

        let resolvedFourCylinder = nextState;
        setUserModel((prev) => {
          // Dopo rebuild da storico, non lasciare che lo snapshot azzerato (updatedAt recente) vinca il merge.
          resolvedFourCylinder = rebuiltFromHistory
            ? nextState
            : mergeFourCylinderStatePreferNewer(prev?.fourCylinder, nextState);
          return {
            ...prev,
            ...baseModel,
            fourCylinder: resolvedFourCylinder,
          };
        });

        console.timeEnd('[perf] fourCylinderBootCatchUp');
        catchUpDoneForUidRef.current = userUid;

        if (!needsSave) {
          return undefined;
        }

        return persistFourCylinderState({
          db,
          userUid,
          setUserModel,
          nextFourCylinderState: {
            ...resolvedFourCylinder,
            engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
            updatedAt: Date.now(),
          },
          fullHistory,
          anchorDateIso: todayIso,
          source: 'useFourCylinderBootCatchUp',
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[fourCylinder] boot catch-up failed:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userUid, db, isSimulationMode, setUserModel, lastCalibrationWeek, fullHistory, proteinTarget]);
}

export default useFourCylinderBootCatchUp;
