/**
 * Hook: `remotePlanning` (RTDB `planning/{uid}/{data}`) + `weeklyPlan` (kcal/tipo per data, `weeklyPlanning/`).
 * Non contiene slot orari allenamento: la timeline unisce `dailyLog` + `manualNodes` in SalaComandi.
 */
import { useEffect, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import {
  createInitialWeeklyPlan,
  getWeekStartMondayKeyLocal,
  sanitizeWeeklyPlanFromFirebase,
  weeklyPlanStableJson,
  weeklyPlanToFirebasePayload,
} from '../weeklyPlanning';

export default function usePlanningData({
  db,
  user,
  isSimulationMode,
  currentTrackerDate,
  getTodayString,
}) {
  const [remotePlanning, setRemotePlanning] = useState(null);
  const [weeklyPlan, setWeeklyPlan] = useState(createInitialWeeklyPlan);
  const [isPlanningLoading, setIsPlanningLoading] = useState(false);
  const [isWeeklyPlanningLoading, setIsWeeklyPlanningLoading] = useState(false);

  const weeklyPlanningRemoteSigRef = useRef('');
  const weeklyPlanningListenerReadyRef = useRef(false);
  const weeklyPlanRef = useRef(weeklyPlan);
  weeklyPlanRef.current = weeklyPlan;

  useEffect(() => {
    if (!db || !user?.uid || !currentTrackerDate || isSimulationMode) {
      setRemotePlanning(null);
      setIsPlanningLoading(false);
      return;
    }
    setIsPlanningLoading(true);
    const r = ref(db, `planning/${user.uid}/${currentTrackerDate}`);
    const unsub = onValue(r, (snap) => {
      setRemotePlanning(snap.exists() ? snap.val() : null);
      setIsPlanningLoading(false);
    });
    return () => unsub();
  }, [db, user?.uid, currentTrackerDate, isSimulationMode]);

  useEffect(() => {
    weeklyPlanningListenerReadyRef.current = false;
    weeklyPlanningRemoteSigRef.current = '';
    if (!db || !user?.uid || isSimulationMode) {
      setWeeklyPlan(createInitialWeeklyPlan());
      setIsWeeklyPlanningLoading(false);
      return;
    }
    setIsWeeklyPlanningLoading(true);
    const weekKey = getWeekStartMondayKeyLocal(currentTrackerDate || getTodayString());
    const r = ref(db, `weeklyPlanning/${user.uid}/${weekKey}`);
    const unsub = onValue(r, (snap) => {
      weeklyPlanningListenerReadyRef.current = true;
      if (!snap.exists()) {
        const empty = createInitialWeeklyPlan();
        weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(empty);
        setWeeklyPlan(empty);
        setIsWeeklyPlanningLoading(false);
        return;
      }
      const next = sanitizeWeeklyPlanFromFirebase(snap.val());
      weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(next);
      setWeeklyPlan(next);
      setIsWeeklyPlanningLoading(false);
    });
    return () => {
      unsub();
      weeklyPlanningListenerReadyRef.current = false;
    };
  }, [db, user?.uid, currentTrackerDate, isSimulationMode, getTodayString]);

  useEffect(() => {
    if (!db || !user?.uid || isSimulationMode) return;
    if (!weeklyPlanningListenerReadyRef.current) return;
    const plan = weeklyPlanRef.current;
    const sig = weeklyPlanStableJson(plan);
    if (sig === weeklyPlanningRemoteSigRef.current) return;

    const t = window.setTimeout(() => {
      if (!weeklyPlanningListenerReadyRef.current) return;
      const dateStr = currentTrackerDate || getTodayString();
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
  }, [weeklyPlan, db, user?.uid, isSimulationMode, currentTrackerDate, getTodayString]);

  return {
    remotePlanning,
    weeklyPlan,
    setWeeklyPlan,
    isPlanningLoading,
    isWeeklyPlanningLoading,
  };
}
