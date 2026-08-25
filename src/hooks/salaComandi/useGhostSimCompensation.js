/**
 * Ghost Car What-If: commit goal/delta e valori “committed” per la UI.
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
    // Compat: aggiorna anche le chiavi per-data (lettori legacy / SalaComandi hydrate).
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
} = {}) {
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
          // Merge non distruttivo: non azzera targets / altri campi di profile_targets.
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

  const committedGhostGoal = useMemo(() => {
    const fromStrategy = normalizeGhostSimGoal(kentuDailyCalorieStrategy);
    if (kentuDailyCalorieStrategy && kentuDailyCalorieStrategy !== 'pari') {
      return fromStrategy;
    }
    return normalizeGhostSimGoal(
      userProfile?.nutritionGoal || userProfile?.goal || fromStrategy,
    );
  }, [kentuDailyCalorieStrategy, userProfile?.nutritionGoal, userProfile?.goal]);

  const committedGhostDeltaKcal = useMemo(() => {
    // 1) Continuo da profilo (include 0 solo se il campo è presente / esplicitamente numerico).
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

    // 2) Continuo da LS globale (non dipende dal giorno tracker).
    const fromLs = readGhostSimDeltaFromLocalStorage(currentTrackerDate);
    if (fromLs != null) {
      return fromLs;
    }

    // 3) Fallback discreto solo se la strategy non è "pari" (evita forzare 0
    //    quando un delta continuo in zona maintain non matcha −500/0/+400).
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

  return {
    applyGhostSimGoal,
    committedGhostGoal,
    committedGhostDeltaKcal,
  };
}

export default useGhostSimCompensation;
