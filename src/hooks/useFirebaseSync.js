import { useCallback, useEffect } from 'react';
import { ref, get, onValue, set } from 'firebase/database';

export default function useFirebaseSync({
  auth,
  db,
  user,
  isSimulationMode,
  currentTrackerDate,
  currentTrackerDateRef,
  getTodayString,
  TRACKER_STORICO_KEY,
  setIsInitialLoadComplete,
  setFullStorico,
  fullStorico,
  setFullHistory,
  fullHistory,
  setDailyLog,
  setManualNodes,
  getLogFromStoricoTree,
  applyMealTimes,
  normalizeLogData,
  lastLogFromFirebaseRef,
  setActiveAction,
  setUserTargets,
  mergeProfileNutritionFromServer,
  setUserProfile,
  setBirthDate,
  setLastCalibrationWeek,
  DEFAULT_USER_MODEL,
  clampModelValue,
  setUserModel,
  setFoodDb,
  enrichDbRowWithFoodUnits,
}) {
  const stripUndefined = useCallback((obj, depth = 0) => {
    const MAX_STRIP_DEPTH = 25;
    if (depth > MAX_STRIP_DEPTH) return obj;
    if (obj === undefined || obj === null) return null;
    if (Array.isArray(obj)) return obj.map((v) => stripUndefined(v, depth + 1)).filter((v) => v !== undefined);
    if (typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) {
        const v = stripUndefined(obj[k], depth + 1);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    return obj;
  }, []);

  useEffect(() => {
    if (!user) {
      setIsInitialLoadComplete(false);
      return;
    }

    let unsubToday = null;
    const today = getTodayString();
    const basePath = `users/${user.uid}/tracker_data`;

    get(ref(db, basePath)).then((snap) => {
      const tree = snap.exists() ? snap.val() : null;
      setFullStorico(tree);
      setFullHistory(tree || {});
      const todayNode = tree?.[TRACKER_STORICO_KEY(today)];
      const initialLog = getLogFromStoricoTree(tree, today);
      setDailyLog(applyMealTimes(initialLog, todayNode?.mealTimes ?? {}));

      unsubToday = onValue(ref(db, `${basePath}/${TRACKER_STORICO_KEY(today)}`), (liveSnap) => {
        if (liveSnap.exists() && currentTrackerDateRef.current === getTodayString()) {
          const val = liveSnap.val();
          const incomingLog = val?.log ?? [];
          const normalized = normalizeLogData(Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}));
          const mealTimes = val?.mealTimes ?? {};
          lastLogFromFirebaseRef.current = JSON.stringify(normalized);
          setDailyLog(applyMealTimes(normalized, mealTimes));
        }
      });
      setActiveAction('home');
      setIsInitialLoadComplete(true);
    });

    get(ref(db, `users/${user.uid}/profile_targets`)).then((profileSnap) => {
      if (!profileSnap.exists()) return;
      const data = profileSnap.val();
      if (data?.targets) {
        setUserTargets((prev) => ({
          ...prev,
          ...data.targets,
          autoCalculated: data?.targets?.autoCalculated === true,
          targetHistory: Array.isArray(data?.targets?.targetHistory)
            ? data.targets.targetHistory
            : prev.targetHistory || [],
        }));
      }
      if (data?.profile) {
        const merged = mergeProfileNutritionFromServer(data.profile);
        setUserProfile((prev) => ({ ...prev, ...merged }));
        setBirthDate(typeof merged?.birthDate === 'string' ? merged.birthDate : '');
        if (merged.targetCalories != null && Number.isFinite(Number(merged.targetCalories))) {
          setUserTargets((prev) => ({ ...prev, kcal: Math.round(Number(merged.targetCalories)) }));
        }
        if (merged.proteinTarget != null && merged.proteinTarget !== '') {
          setUserTargets((prev) => ({ ...prev, prot: Math.round(Number(merged.proteinTarget)) }));
        }
      }
    });

    get(ref(db, `users/${user.uid}/physiology_model`)).then((physSnap) => {
      if (!physSnap.exists()) return;
      const data = physSnap.val();
      const { lastCalibrationWeek: savedCalWeek, ...model } = data;
      if (savedCalWeek) setLastCalibrationWeek(savedCalWeek);
      if (model && typeof model === 'object') {
        setUserModel((prev) => ({
          ...prev,
          ...DEFAULT_USER_MODEL,
          ...model,
          caffeineSensitivity: clampModelValue(model.caffeineSensitivity ?? 1),
          carbCrashSensitivity: clampModelValue(model.carbCrashSensitivity ?? 1),
          stressSensitivity: clampModelValue(model.stressSensitivity ?? 1),
          hydrationSensitivity: clampModelValue(model.hydrationSensitivity ?? 1),
          recoveryRate: clampModelValue(model.recoveryRate ?? 1),
        }));
      }
    });

    get(ref(db, `${basePath}/trackerFoodDatabase`)).then((s) => {
      if (!s.exists()) return;
      const val = s.val();
      if (!val || typeof val !== 'object') {
        setFoodDb({});
        return;
      }
      const enriched = {};
      Object.keys(val).forEach((k) => {
        const row = val[k];
        if (!row || typeof row !== 'object') return;
        enriched[k] = row.isRecipe === true || row.type === 'recipe' ? row : enrichDbRowWithFoodUnits(row, k);
      });
      setFoodDb(enriched);
    });

    return () => {
      unsubToday?.();
    };
  }, [
    user,
    db,
    setIsInitialLoadComplete,
    getTodayString,
    setFullStorico,
    setFullHistory,
    TRACKER_STORICO_KEY,
    getLogFromStoricoTree,
    setDailyLog,
    applyMealTimes,
    currentTrackerDateRef,
    normalizeLogData,
    lastLogFromFirebaseRef,
    setActiveAction,
    setUserTargets,
    mergeProfileNutritionFromServer,
    setUserProfile,
    setBirthDate,
    setLastCalibrationWeek,
    setUserModel,
    DEFAULT_USER_MODEL,
    clampModelValue,
    setFoodDb,
    enrichDbRowWithFoodUnits,
  ]);

  useEffect(() => {
    if (!fullHistory || typeof fullHistory !== 'object' || !currentTrackerDate) return;
    if (Object.keys(fullHistory).length === 0) return;
    setDailyLog((prev) => {
      if (prev && prev.length > 0) return prev;
      const node = fullHistory[TRACKER_STORICO_KEY(currentTrackerDate)];
      const initialLog = getLogFromStoricoTree(fullHistory, currentTrackerDate);
      return applyMealTimes(initialLog, node?.mealTimes ?? {});
    });
  }, [fullHistory, currentTrackerDate, setDailyLog, TRACKER_STORICO_KEY, getLogFromStoricoTree, applyMealTimes]);

  useEffect(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return;
    if (currentTrackerDateRef.current !== getTodayString()) return;
    const todayKey = TRACKER_STORICO_KEY(getTodayString());
    const todayNode = fullStorico[todayKey];
    if (todayNode?.hasEditedNodes || (todayNode?.manualNodes && todayNode.manualNodes.length > 0)) {
      setManualNodes(todayNode.manualNodes || []);
    } else {
      setManualNodes([]);
    }
  }, [fullStorico, currentTrackerDateRef, getTodayString, TRACKER_STORICO_KEY, setManualNodes]);

  const syncDatiFirebase = useCallback((nuovoLog, nuoviNodi, { denormalizeLogForFirebase, setFullHistory: setHistoryLocal }) => {
    if (isSimulationMode) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;
    const dateStr = currentTrackerDate;

    try {
      const logForFirebase = denormalizeLogForFirebase(nuovoLog || []);
      const mealTimes = (nuovoLog || [])
        .filter((i) => i.type === 'food' || i.type === 'recipe')
        .reduce((acc, f) => ({ ...acc, [f.mealType]: f.mealTime ?? 12 }), {});
      const payload = {
        data: dateStr,
        log: stripUndefined(logForFirebase),
        mealTimes,
        manualNodes: stripUndefined(nuoviNodi || []),
        hasEditedNodes: true,
      };
      const sanitized = stripUndefined(payload);
      const key = TRACKER_STORICO_KEY(dateStr);
      const dbPath = `users/${uid}/tracker_data/${key}`;
      set(ref(db, dbPath), sanitized).then(() => {
        setHistoryLocal((prev) => ({ ...prev, [key]: sanitized }));
      });
    } catch {
      // no-op: mantiene comportamento non bloccante della UI
    }
  }, [isSimulationMode, auth, currentTrackerDate, stripUndefined, TRACKER_STORICO_KEY, db]);

  const saveProfileToFirebase = useCallback((newProfile, newTargets, { setShowProfile }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;
    set(ref(db, `users/${uid}/profile_targets`), {
      profile: newProfile,
      targets: newTargets,
    }).then(() => {
      setShowProfile(false);
    });
  }, [auth, db]);

  return {
    syncDatiFirebase,
    saveProfileToFirebase,
  };
}
