/**
 * Sync RTDB planning giornaliero + weekly planning (listener + debounce save).
 */

import { useEffect, useRef, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { getTodayString } from '../../coreEngine';
import {
  createInitialWeeklyPlan,
  getWeekStartMondayKeyLocal,
  sanitizeWeeklyPlanFromFirebase,
  weeklyPlanStableJson,
  weeklyPlanToFirebasePayload,
} from '../../weeklyPlanning';

/**
 * @param {{
 *   db?: object|null,
 *   user?: { uid?: string }|null,
 *   currentTrackerDate?: string|null,
 *   currentTrackerDateRef?: React.MutableRefObject<string|null>,
 *   isSimulationMode?: boolean,
 * }} params
 */
export function useDailyWeeklyPlanningSync({
  db = null,
  user = null,
  currentTrackerDate = null,
  currentTrackerDateRef = null,
  isSimulationMode = false,
} = {}) {
  const [remotePlanning, setRemotePlanning] = useState(null);
  const [weeklyPlan, setWeeklyPlan] = useState(createInitialWeeklyPlan);
  const weeklyPlanningRemoteSigRef = useRef('');
  const weeklyPlanningListenerReadyRef = useRef(false);
  const weeklyPlanRef = useRef(weeklyPlan);
  weeklyPlanRef.current = weeklyPlan;

  /** Carica pianificazione giornaliera da RTDB `planning/{uid}/{date}`. */
  useEffect(() => {
    if (!db || !user?.uid || !currentTrackerDate || isSimulationMode) {
      setRemotePlanning(null);
      return;
    }
    const r = ref(db, `planning/${user.uid}/${currentTrackerDate}`);
    const unsub = onValue(r, (snap) => {
      setRemotePlanning(snap.exists() ? snap.val() : null);
    });
    return () => unsub();
  }, [db, user?.uid, currentTrackerDate, isSimulationMode]);

  /** RTDB `weeklyPlanning/{uid}/{weekStartMonday}`. */
  useEffect(() => {
    weeklyPlanningListenerReadyRef.current = false;
    weeklyPlanningRemoteSigRef.current = '';
    if (!db || !user?.uid || isSimulationMode) {
      setWeeklyPlan(createInitialWeeklyPlan());
      return;
    }
    const weekKey = getWeekStartMondayKeyLocal(currentTrackerDate || getTodayString());
    const r = ref(db, `weeklyPlanning/${user.uid}/${weekKey}`);
    const unsub = onValue(r, (snap) => {
      weeklyPlanningListenerReadyRef.current = true;
      if (!snap.exists()) {
        const empty = createInitialWeeklyPlan();
        weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(empty);
        setWeeklyPlan(empty);
        return;
      }
      const next = sanitizeWeeklyPlanFromFirebase(snap.val());
      weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(next);
      setWeeklyPlan(next);
    });
    return () => {
      unsub();
      weeklyPlanningListenerReadyRef.current = false;
    };
  }, [db, user?.uid, currentTrackerDate, isSimulationMode]);

  useEffect(() => {
    if (!db || !user?.uid || isSimulationMode) return;
    if (!weeklyPlanningListenerReadyRef.current) return;
    const plan = weeklyPlanRef.current;
    const sig = weeklyPlanStableJson(plan);
    if (sig === weeklyPlanningRemoteSigRef.current) return;
    const t = window.setTimeout(() => {
      if (!weeklyPlanningListenerReadyRef.current) return;
      const dateStr = currentTrackerDateRef?.current || getTodayString();
      const weekKey = getWeekStartMondayKeyLocal(dateStr);
      const uid = user.uid;
      const latest = weeklyPlanRef.current;
      const latestSig = weeklyPlanStableJson(latest);
      if (latestSig === weeklyPlanningRemoteSigRef.current) return;
      void set(ref(db, `weeklyPlanning/${uid}/${weekKey}`), weeklyPlanToFirebasePayload(latest))
        .then(() => {
          weeklyPlanningRemoteSigRef.current = latestSig;
        })
        .catch((err) => console.warn('weeklyPlanning save:', err));
    }, 500);
    return () => window.clearTimeout(t);
  }, [weeklyPlan, db, user?.uid, isSimulationMode, currentTrackerDateRef]);

  return {
    remotePlanning,
    setRemotePlanning,
    weeklyPlan,
    setWeeklyPlan,
    weeklyPlanningRemoteSigRef,
    weeklyPlanningListenerReadyRef,
  };
}

export default useDailyWeeklyPlanningSync;
