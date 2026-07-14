import { useState, useRef, useCallback, useEffect } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { enrichDbRowWithFoodUnits } from '../../foodUnits';
import { mergeProfileNutritionFromServer } from '../../userNutritionGoals';
import { writeTodayTrackerLocalCache } from '../../utils/trackerCacheUtils';
import { stripUndefined } from '../../utils/firebasePayloadUtils';
import {
  TRACKER_STORICO_KEY,
  normalizeLogData,
  denormalizeLogForFirebase,
  applyMealTimes,
  getLogFromStoricoTree,
  getTodayString,
  DEFAULT_USER_MODEL,
  clampModelValue,
} from '../../coreEngine';
import { createInitialWeeklyPlan } from '../../weeklyPlanning';

/**
 * Bootstrap tracker_data (SWR cache), listener live su oggi, sync esplicita su RTDB.
 */
export function useDiaryFirebaseSync({
  db,
  auth,
  user,
  currentTrackerDate,
  currentTrackerDateRef,
  isSimulationMode,
  setDailyLog,
  setManualNodes,
  fullHistory,
  setFullHistory,
  fullStorico,
  setFullStorico,
  setActiveAction,
  setUserProfile,
  setBirthDate,
  setUserTargets,
  setUserModel,
  setLastCalibrationWeek,
  setFoodDb,
  setWeeklyPlan,
  weeklyPlanningListenerReadyRef,
  weeklyPlanningRemoteSigRef,
}) {
  const lastLogFromFirebaseRef = useRef(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  useEffect(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return;
    if (currentTrackerDateRef.current !== getTodayString()) return;
    const todayKey = TRACKER_STORICO_KEY(getTodayString());
    const todayNode = fullStorico[todayKey];

    if (todayNode?.hasEditedNodes || (todayNode?.manualNodes && todayNode.manualNodes.length > 0)) {
      setManualNodes(todayNode.manualNodes || []);
    } else {
      // BUGFIX: Se oggi è vuoto, partiamo puliti. Nessun trascinamento da ieri.
      setManualNodes([]);
    }
  }, [fullStorico, currentTrackerDateRef, setManualNodes]);

  // Bootstrap: today node + profile_targets in parallelo (gate UI); storico completo in background
  useEffect(() => {
    if (!user) {
      setIsInitialLoadComplete(false);
      setWeeklyPlan(createInitialWeeklyPlan());
      weeklyPlanningListenerReadyRef.current = false;
      weeklyPlanningRemoteSigRef.current = '';
      return undefined;
    }

    let cancelled = false;
    let unsubToday = null;
    const today = getTodayString();
    const basePath = `users/${user.uid}/tracker_data`;
    const todayRef = ref(db, `${basePath}/${TRACKER_STORICO_KEY(today)}`);
    const profileRef = ref(db, `users/${user.uid}/profile_targets`);

    // Stale-While-Revalidate: idratazione immediata da cache locale (zero-latency cold start)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cacheRaw = window.localStorage.getItem(TRACKER_STORICO_KEY(today));
        if (cacheRaw) {
          const cached = JSON.parse(cacheRaw);
          const incomingLog = cached?.log ?? cached?.dati?.log ?? [];
          const normalized = normalizeLogData(
            Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
          );
          const mealTimes = cached?.mealTimes ?? {};
          lastLogFromFirebaseRef.current = JSON.stringify(normalized);
          setDailyLog(applyMealTimes(normalized, mealTimes));
          setActiveAction('home');
          setIsInitialLoadComplete(true);
        }
      }
    } catch (err) {
      console.warn('Bootstrap cache read failed:', err);
    }

    const attachTodayLiveListener = () => {
      unsubToday = onValue(todayRef, (liveSnap) => {
        if (cancelled) return;
        if (liveSnap.exists() && currentTrackerDateRef.current === getTodayString()) {
          const val = liveSnap.val();
          const incomingLog = val?.log ?? [];
          const normalized = normalizeLogData(
            Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
          );
          const mealTimes = val?.mealTimes ?? {};
          lastLogFromFirebaseRef.current = JSON.stringify(normalized);
          setDailyLog(applyMealTimes(normalized, mealTimes));
          writeTodayTrackerLocalCache(
            getTodayString(),
            Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
            mealTimes,
          );
        }
      });
    };

    Promise.all([get(todayRef), get(profileRef)])
      .then(([todaySnap, profileSnap]) => {
        if (cancelled) return;

        const todayVal = todaySnap.exists() ? todaySnap.val() : null;
        const incomingLog = todayVal?.log ?? [];
        const normalized = normalizeLogData(
          Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
        );
        const mealTimes = todayVal?.mealTimes ?? {};
        lastLogFromFirebaseRef.current = JSON.stringify(normalized);
        setDailyLog(applyMealTimes(normalized, mealTimes));
        writeTodayTrackerLocalCache(
          today,
          Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
          mealTimes,
        );

        if (profileSnap.exists()) {
          const data = profileSnap.val();
          const mergedProfile = data?.profile
            ? mergeProfileNutritionFromServer(data.profile)
            : null;
          if (mergedProfile) {
            setUserProfile((prev) => ({ ...prev, ...mergedProfile }));
            setBirthDate(typeof mergedProfile?.birthDate === 'string' ? mergedProfile.birthDate : '');
          }
          setUserTargets((prev) => {
            let next = { ...prev };
            if (data?.targets) {
              next = {
                ...next,
                ...data.targets,
                autoCalculated: data?.targets?.autoCalculated === true,
                targetHistory: Array.isArray(data?.targets?.targetHistory)
                  ? data.targets.targetHistory
                  : next.targetHistory || [],
              };
            }
            if (mergedProfile) {
              if (mergedProfile.targetCalories != null && Number.isFinite(Number(mergedProfile.targetCalories))) {
                next.kcal = Math.round(Number(mergedProfile.targetCalories));
              }
              if (mergedProfile.proteinTarget != null && mergedProfile.proteinTarget !== '') {
                next.prot = Math.round(Number(mergedProfile.proteinTarget));
              }
            }
            return next;
          });
        }

        setActiveAction('home');
        setIsInitialLoadComplete(true);
        attachTodayLiveListener();

        get(ref(db, basePath))
          .then((histSnap) => {
            if (cancelled) return;
            const tree = histSnap.exists() ? histSnap.val() : null;
            setFullStorico(tree);
            setFullHistory(tree || {});
          })
          .catch((err) => console.warn('tracker_data background load:', err));
      })
      .catch((err) => {
        console.warn('Bootstrap load failed:', err);
        if (cancelled) return;
        setActiveAction('home');
        setIsInitialLoadComplete(true);
        attachTodayLiveListener();
      });

    get(ref(db, `users/${user.uid}/physiology_model`)).then((physSnap) => {
      if (cancelled || !physSnap.exists()) return;
      const data = physSnap.val();
      const { lastCalibrationWeek: savedCalWeek, ...model } = data;
      if (savedCalWeek) setLastCalibrationWeek(savedCalWeek);
      if (model && typeof model === 'object') {
        setUserModel((prev) => ({
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
      if (cancelled) return;
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
      cancelled = true;
      unsubToday?.();
    };
  }, [user]);

  // Fallback: quando fullHistory è popolato ma dailyLog è ancora vuoto (es. primo caricamento), sincronizza il log del giorno corrente
  useEffect(() => {
    if (!fullHistory || typeof fullHistory !== 'object' || !currentTrackerDate) return;
    if (Object.keys(fullHistory).length === 0) return;
    setDailyLog((prev) => {
      if (prev && prev.length > 0) return prev;
      const node = fullHistory[TRACKER_STORICO_KEY(currentTrackerDate)];
      const initialLog = getLogFromStoricoTree(fullHistory, currentTrackerDate);
      return applyMealTimes(initialLog, node?.mealTimes ?? {});
    });
  }, [fullHistory, currentTrackerDate, setDailyLog]);

  /** Sincronizzazione esplicita su Firebase. Legge uid da auth.currentUser per evitare stale closures. In modalità simulazione non scrive mai. */
  const syncDatiFirebase = useCallback(
    (nuovoLog, nuoviNodi) => {
      if (isSimulationMode) return;
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('⚠️ Firebase Sync interrotto: Nessun utente loggato rilevato da auth.currentUser');
        return;
      }
      const uid = currentUser.uid;

      console.log('🔄 Preparazione salvataggio su Firebase per UID:', uid);

      try {
        const dateStr = currentTrackerDate;
        const logForFirebase = denormalizeLogForFirebase(nuovoLog || []);
        const mealTimes = (nuovoLog || [])
          .filter((i) => i.type === 'food' || i.type === 'recipe')
          .reduce(
            (acc, f) => ({
              ...acc,
              [f.mealType]: f.mealTime ?? 12,
            }),
            {},
          );
        const sanitizedLog = stripUndefined(logForFirebase);
        const sanitizedNodes = stripUndefined(nuoviNodi || []);
        const payload = {
          data: dateStr,
          log: sanitizedLog,
          mealTimes,
          manualNodes: sanitizedNodes,
          hasEditedNodes: true,
        };
        const sanitized = stripUndefined(payload);

        writeTodayTrackerLocalCache(dateStr, sanitizedLog, mealTimes);

        const dbPath = `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(dateStr)}`;
        console.log('📁 Percorso di salvataggio:', dbPath);

        set(ref(db, dbPath), sanitized)
          .then(() => {
            setFullHistory((prev) => ({ ...prev, [TRACKER_STORICO_KEY(dateStr)]: sanitized }));
            console.log('✅ Dati salvati con successo su Firebase!');
          })
          .catch((err) => console.error('❌ Errore critico durante il salvataggio Firebase:', err));
      } catch (error) {
        console.error('❌ Errore durante la preparazione del payload Firebase:', error);
      }
    },
    [currentTrackerDate, isSimulationMode, auth, setFullHistory],
  );

  return {
    syncDatiFirebase,
    isInitialLoadComplete,
    lastLogFromFirebaseRef,
  };
}

export default useDiaryFirebaseSync;
