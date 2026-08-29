/**
 * Ghost Car What-If + Rolling Balance (autopilota debito 48h).
 */

import { useCallback, useMemo } from 'react';
import { ref, update } from 'firebase/database';
import {
  getTodayString,
  normalizeCalorieStrategyTarget,
  CALORIE_STRATEGY_KCAL_DELTA,
} from '../../coreEngine';
import {
  normalizeGhostSimGoal,
  ghostSimDeltaToGoal,
  ghostSimDeltaToKentuStrategy,
  clampGhostSimDelta,
  resolveGhostDailyDeltaFromGoal,
} from '../../utils/metabolicCompensationCurve';
import {
  computeRollingCalorieDebt,
  normalizeGhostAutoPilotEnabled,
  readGhostAutoPilotFromLocalStorage,
  writeGhostAutoPilotToLocalStorage,
} from '../../utils/rollingCalorieBank';

/** Chiavi LS globali — indipendenti dal giorno visualizzato nel tracker. */
export const KENTU_GHOST_SIM_DELTA_LS_KEY = 'kentu_ghost_sim_delta_global';
export const KENTU_GHOST_SIM_STRATEGY_LS_KEY = 'kentu_cal_strategy_global';

/**
 * Legge delta Ghost Car da localStorage (globale, con fallback legacy per-data).
 * @param {string | null | undefined} [dateKey]
 * @returns {number | null}
 */
function readGhostSimDeltaFromLocalStorage(dateKey = null) {
  try {
    const globalRaw = localStorage.getItem(KENTU_GHOST_SIM_DELTA_LS_KEY);
    if (globalRaw != null && globalRaw !== '') {
      const n = Number(globalRaw);
      if (Number.isFinite(n)) return clampGhostSimDelta(n);
    }
    const d = dateKey || getTodayString();
    const legacy = localStorage.getItem(`kentu_ghost_sim_delta_${d}`);
    if (legacy != null && legacy !== '') {
      const n = Number(legacy);
      if (Number.isFinite(n)) return clampGhostSimDelta(n);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} strategy
 * @param {number} delta
 */
function writeGhostSimLocalStorage(strategy, delta) {
  try {
    localStorage.setItem(KENTU_GHOST_SIM_STRATEGY_LS_KEY, strategy);
    localStorage.setItem(KENTU_GHOST_SIM_DELTA_LS_KEY, String(delta));
    const d = getTodayString();
    localStorage.setItem(`kentu_cal_strategy_${d}`, strategy);
    localStorage.setItem(`kentu_ghost_sim_delta_${d}`, String(delta));
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   currentTrackerDate?: string|null,
 *   db?: object|null,
 *   user?: { uid?: string }|null,
 *   auth?: object|null,
 *   userTargets?: object|null,
 *   userProfile?: object|null,
 *   setUserProfile?: (updater: any) => void,
 *   kentuDailyCalorieStrategy?: string,
 *   setKentuDailyCalorieStrategy?: (v: string) => void,
 *   fullHistory?: object|null,
 *   settingsBaseKcal?: number|null,
 * }} params
 */
export function useGhostSimCompensation({
  currentTrackerDate = null,
  db = null,
  user = null,
  auth = null,
  userTargets = null,
  userProfile = null,
  setUserProfile = null,
  kentuDailyCalorieStrategy = 'pari',
  setKentuDailyCalorieStrategy = null,
  fullHistory = null,
  settingsBaseKcal = null,
} = {}) {
  const todayIso = getTodayString();
  const isViewingToday = String(currentTrackerDate || todayIso).slice(0, 10) === todayIso;

  const applyGhostSimGoal = useCallback(
    (deltaRaw) => {
      const delta = clampGhostSimDelta(deltaRaw);
      const goal = ghostSimDeltaToGoal(delta);
      const strategy = ghostSimDeltaToKentuStrategy(delta);

      setKentuDailyCalorieStrategy?.(strategy);
      writeGhostSimLocalStorage(strategy, delta);

      setUserProfile?.((prev) => {
        const next = {
          ...prev,
          nutritionGoal: goal,
          goal: goal === 'cut' ? 'lose' : goal === 'bulk' ? 'gain' : 'maintain',
          ghostSimDeltaKcal: delta,
        };
        const uid = auth?.currentUser?.uid || user?.uid;
        if (uid && db) {
          update(ref(db, `users/${uid}/profile_targets/profile`), {
            nutritionGoal: goal,
            goal: next.goal,
            ghostSimDeltaKcal: delta,
          }).catch((err) => console.error('[Ghost What-If] salvataggio profilo fallito', err));
        }
        return next;
      });

      return Promise.resolve(delta);
    },
    [db, user?.uid, auth, setUserProfile, setKentuDailyCalorieStrategy],
  );

  const ghostAutoPilotEnabled = useMemo(() => {
    if (
      userProfile != null
      && Object.prototype.hasOwnProperty.call(userProfile, 'ghostAutoPilotEnabled')
      && userProfile.ghostAutoPilotEnabled != null
    ) {
      return normalizeGhostAutoPilotEnabled(userProfile.ghostAutoPilotEnabled, true);
    }
    return readGhostAutoPilotFromLocalStorage();
  }, [userProfile]);

  const setGhostAutoPilotEnabled = useCallback(
    (enabledRaw) => {
      const enabled = enabledRaw === true;
      writeGhostAutoPilotToLocalStorage(enabled);
      setUserProfile?.((prev) => {
        const next = { ...prev, ghostAutoPilotEnabled: enabled };
        const uid = auth?.currentUser?.uid || user?.uid;
        if (uid && db) {
          update(ref(db, `users/${uid}/profile_targets/profile`), {
            ghostAutoPilotEnabled: enabled,
          }).catch((err) => console.error('[Ghost Autopilot] salvataggio fallito', err));
        }
        return next;
      });
    },
    [auth, db, user?.uid, setUserProfile],
  );

  const committedGhostGoal = useMemo(() => {
    const fromStrategy = normalizeGhostSimGoal(kentuDailyCalorieStrategy);
    if (kentuDailyCalorieStrategy && kentuDailyCalorieStrategy !== 'pari') {
      return fromStrategy;
    }
    return normalizeGhostSimGoal(
      userProfile?.nutritionGoal || userProfile?.goal || fromStrategy,
    );
  }, [kentuDailyCalorieStrategy, userProfile?.nutritionGoal, userProfile?.goal]);

  /** Delta manuale (cursore / persistenza globale). */
  const committedGhostDeltaKcal = useMemo(() => {
    if (
      userProfile != null
      && Object.prototype.hasOwnProperty.call(userProfile, 'ghostSimDeltaKcal')
      && userProfile.ghostSimDeltaKcal != null
      && userProfile.ghostSimDeltaKcal !== ''
    ) {
      const fromProfile = Number(userProfile.ghostSimDeltaKcal);
      if (Number.isFinite(fromProfile)) {
        return clampGhostSimDelta(fromProfile);
      }
    }

    const fromLs = readGhostSimDeltaFromLocalStorage(currentTrackerDate);
    if (fromLs != null) {
      return fromLs;
    }

    const strat = normalizeCalorieStrategyTarget(kentuDailyCalorieStrategy);
    if (
      strat
      && strat !== 'pari'
      && Object.prototype.hasOwnProperty.call(CALORIE_STRATEGY_KCAL_DELTA, strat)
    ) {
      return Math.round(Number(CALORIE_STRATEGY_KCAL_DELTA[strat]) || 0);
    }

    return resolveGhostDailyDeltaFromGoal(committedGhostGoal);
  }, [
    userProfile,
    currentTrackerDate,
    kentuDailyCalorieStrategy,
    committedGhostGoal,
  ]);

  const baseKcalForBank = useMemo(() => {
    const fromArg = Math.round(Number(settingsBaseKcal) || 0);
    if (fromArg > 0) return fromArg;
    const fromProfile = Math.round(Number(userProfile?.targetCalories) || 0);
    return fromProfile > 0 ? fromProfile : 0;
  }, [settingsBaseKcal, userProfile?.targetCalories]);

  const rollingDebt = useMemo(
    () => computeRollingCalorieDebt({
      fullHistory,
      userTargets,
      userProfile,
      settingsBaseKcal: baseKcalForBank,
      tdee: userProfile?.tdee,
      // Lookback sempre ancorato a "oggi reale", indipendente dal giorno visualizzato.
      asOfDate: todayIso,
    }),
    [fullHistory, userTargets, userProfile, baseKcalForBank, todayIso],
  );

  /** Auto-delta applicato al target SOLO se autopilota ON e vista = oggi. */
  const autoCompensationDelta = useMemo(() => {
    if (!ghostAutoPilotEnabled || !isViewingToday) return 0;
    return Math.round(Number(rollingDebt.autoCompensationDelta) || 0);
  }, [ghostAutoPilotEnabled, isViewingToday, rollingDebt.autoCompensationDelta]);

  const effectiveGhostDeltaKcal = useMemo(
    () => Math.round(Number(committedGhostDeltaKcal) || 0) + autoCompensationDelta,
    [committedGhostDeltaKcal, autoCompensationDelta],
  );

  return {
    applyGhostSimGoal,
    committedGhostGoal,
    committedGhostDeltaKcal,
    ghostAutoPilotEnabled,
    setGhostAutoPilotEnabled,
    rollingDebt,
    autoCompensationDelta,
    effectiveGhostDeltaKcal,
    isViewingToday,
  };
}

export default useGhostSimCompensation;
