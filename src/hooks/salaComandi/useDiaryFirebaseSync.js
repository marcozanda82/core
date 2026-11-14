import { useState, useRef, useCallback, useEffect } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { enrichDbRowWithFoodUnits } from '../../foodUnits';
import { mergeProfileNutritionFromServer } from '../../userNutritionGoals';
import {
  writeTodayTrackerLocalCache,
  readRecentHistoryCache,
  writeRecentHistoryCache,
  patchRecentHistoryDay,
} from '../../utils/trackerCacheUtils';
import {
  ensureTrackerHistoryRange,
  homeHistoryWindow,
  loadTrackerHistoryRange,
  peekTrackerHistoryMemory,
  stashTrackerHistoryMemory,
  stimulusHistoryWindow,
  trackerHistoryMemoryCoversHome,
} from '../../utils/trackerHistoryMemory.js';
import {
  readProfileTargetsCache,
  writeProfileTargetsCache,
} from '../../utils/longevityBootstrapCache';
import { stripUndefined } from '../../utils/firebasePayloadUtils';
import { dayHasFoodLog } from '../../utils/dayTrackingStatus';
import { withPreservedAutopilotCorrection } from '../../utils/rollingCalorieBank';
import { scheduleAfterPaint } from '../../utils/scheduleAfterPaint';
import {
  mergePersonalDbRemoteOverLocal,
  personalFoodDbSnapshotsEqual,
  savePersonalDbToCache,
} from '../../utils/offlineCacheUtils';
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
import { mergeFourCylinderStatePreferNewer } from '../../features/salaComandi/engines/fourCylinderEngine';

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
  autopilotCorrectionRef = null,
}) {
  const lastLogFromFirebaseRef = useRef(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [isProfileHydrated, setIsProfileHydrated] = useState(false);
  /**
   * Bootstrap dello storico completo (albero tracker_data), distinto da isInitialLoadComplete
   * (oggi+profile). Usato dal laboratorio Focus per non spacciare la cache 15g come d30 completo.
   * @type {'idle'|'loading'|'ready'|'error'}
   */
  const [fullHistoryLoadState, setFullHistoryLoadState] = useState('idle');

  const applyProfileTargets = useCallback((data) => {
    if (!data || typeof data !== 'object') return;
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
    setIsProfileHydrated(true);
  }, [setBirthDate, setUserProfile, setUserTargets]);

  useEffect(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return;
    if (currentTrackerDateRef.current !== getTodayString()) return;
    const todayKey = TRACKER_STORICO_KEY(getTodayString());
    const todayNode = fullStorico[todayKey];

    if (todayNode?.hasEditedNodes || (todayNode?.manualNodes && todayNode.manualNodes.length > 0)) {
      const nextNodes = todayNode.manualNodes || [];
      setManualNodes((prev) => (prev === nextNodes ? prev : nextNodes));
    } else {
      // BUGFIX: Se oggi è vuoto, partiamo puliti. Nessun trascinamento da ieri.
      setManualNodes((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
    }
  }, [fullStorico, currentTrackerDateRef, setManualNodes]);

  /*
   * Consumer storico (dopo taglio Home 90g):
   * - Home: SNC60, body battery (3 notti), trend 14g, calibrazione settimanale 7g → ≤90g
   * - Centro Analisi rooms / Longevità: finestre ≤14–60g; stimolo muscolare fino a 365g
   *   → ensureDeepHistory('stimulus') on-demand all’apertura strumenti/longevità
   * - Chat: audit 30g, habit scanner 14g, ConsultantEngine habit 45g → ≤90g
   * - Focus: loadFocusAuthenticatedDiary + loadFocusDiaryDateRange (non questo bootstrap)
   */
  // Bootstrap: today + profile_targets (gate UI); storico Home 90g in background
  useEffect(() => {
    if (!user) {
      setIsInitialLoadComplete(false);
      setIsProfileHydrated(false);
      setFullHistoryLoadState('idle');
      setWeeklyPlan(createInitialWeeklyPlan());
      weeklyPlanningListenerReadyRef.current = false;
      weeklyPlanningRemoteSigRef.current = '';
      return undefined;
    }

    let cancelled = false;
    let unsubToday = null;
    const backgroundCancels = [];
    const today = getTodayString();
    const basePath = `users/${user.uid}/tracker_data`;
    const todayRef = ref(db, `${basePath}/${TRACKER_STORICO_KEY(today)}`);
    const profileRef = ref(db, `users/${user.uid}/profile_targets`);
    // Cache 15g ≠ storico completo: finché get(tracker_data) non termina restiamo in loading.
    setFullHistoryLoadState('loading');

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
          // Non buttare fuori dalla chat se l’utente è già in ai_chat (race bootstrap).
          setActiveAction((prev) => (prev === 'ai_chat' ? 'ai_chat' : 'home'));
          setIsInitialLoadComplete(true);
        }
      }
    } catch (err) {
      console.warn('Bootstrap cache read failed:', err);
    }

    const recentHistory = readRecentHistoryCache(user.uid, today);
    if (recentHistory && Object.keys(recentHistory).length > 0) {
      setFullHistory((prev) => (
        prev && typeof prev === 'object' && Object.keys(prev).length > 0 ? prev : recentHistory
      ));
      setFullStorico((prev) => (
        prev && typeof prev === 'object' ? prev : recentHistory
      ));
      // Seed RAM subito: il download 90g non deve partire con existing={} e azzerare la cache.
      stashTrackerHistoryMemory(user.uid, recentHistory, {
        from: Object.keys(recentHistory)
          .filter((k) => /^trackerStorico_\d{4}-\d{2}-\d{2}$/.test(k))
          .map((k) => k.slice('trackerStorico_'.length))
          .sort()[0] || today,
        to: today,
      });
    }

    const cachedProfile = readProfileTargetsCache(user.uid);
    if (cachedProfile) {
      applyProfileTargets(cachedProfile);
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
          const serialized = JSON.stringify(normalized);
          writeTodayTrackerLocalCache(
            getTodayString(),
            Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}),
            mealTimes,
          );
          // Evita re-render se l'echo Firebase coincide con l'ultimo commit locale.
          if (lastLogFromFirebaseRef.current === serialized) {
            return;
          }
          lastLogFromFirebaseRef.current = serialized;
          setDailyLog(applyMealTimes(normalized, mealTimes));
        }
      });
    };

    console.time('[perf] bootstrap:today+profile');
    Promise.all([get(todayRef), get(profileRef)])
      .then(([todaySnap, profileSnap]) => {
        console.timeEnd('[perf] bootstrap:today+profile');
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
          applyProfileTargets(data);
          writeProfileTargetsCache(user.uid, data);
        } else {
          setIsProfileHydrated(true);
        }

        setActiveAction((prev) => (prev === 'ai_chat' ? 'ai_chat' : 'home'));
        setIsInitialLoadComplete(true);
        attachTodayLiveListener();

        // Storico Home: ultimi 90 giorni. Se già in RAM (remount) non riscaricare.
        const cancelHist = scheduleAfterPaint(() => {
          if (cancelled) return;
          const todayIso = getTodayString();
          if (trackerHistoryMemoryCoversHome(user.uid, todayIso)) {
            const mem = peekTrackerHistoryMemory(user.uid);
            // eslint-disable-next-line no-console
            console.log('[perf] bootstrap:fullHistory-download skipped (memory hit)', {
              from: mem?.from,
              to: mem?.to,
            });
            setFullStorico(mem.tree);
            setFullHistory(mem.tree || {});
            writeRecentHistoryCache(user.uid, mem.tree || {}, todayIso);
            setFullHistoryLoadState('ready');
            return;
          }
          const win = homeHistoryWindow(todayIso);
          const existing = peekTrackerHistoryMemory(user.uid)?.tree
            || readRecentHistoryCache(user.uid, todayIso)
            || {};
          console.time('[perf] bootstrap:fullHistory-download');
          loadTrackerHistoryRange({
            db,
            uid: user.uid,
            from: win.from,
            to: win.to,
            existing,
          })
            .then((loaded) => {
              console.timeEnd('[perf] bootstrap:fullHistory-download');
              if (cancelled) return;
              const tree = loaded.ok ? loaded.tree : existing;
              const dayCount = Object.keys(tree || {}).filter((k) => k.startsWith('trackerStorico_')).length;
              // Non azzerare la cache SWR se il range torna vuoto (rete/indice).
              if (dayCount === 0 && Object.keys(existing).length > 0) {
                stashTrackerHistoryMemory(user.uid, existing, win);
                setFullStorico(existing);
                setFullHistory(existing);
                writeRecentHistoryCache(user.uid, existing, todayIso);
                setFullHistoryLoadState('ready');
                return;
              }
              stashTrackerHistoryMemory(user.uid, tree || {}, win);
              setFullStorico(tree);
              setFullHistory(tree || {});
              writeRecentHistoryCache(user.uid, tree || {}, todayIso);
              setFullHistoryLoadState('ready');
            })
            .catch((err) => {
              console.warn('tracker_data background load:', err);
              if (!cancelled) setFullHistoryLoadState('error');
            });
        }, { timeout: 4000 });
        backgroundCancels.push(cancelHist);
      })
      .catch((err) => {
        console.warn('Bootstrap load failed:', err);
        if (cancelled) return;
        setIsProfileHydrated(true);
        setActiveAction((prev) => (prev === 'ai_chat' ? 'ai_chat' : 'home'));
        setIsInitialLoadComplete(true);
        setFullHistoryLoadState('error');
        attachTodayLiveListener();
      });

    // Physiology + food DB personale: non necessari per il primo frame della home.
    const cancelSecondary = scheduleAfterPaint(() => {
      get(ref(db, `users/${user.uid}/physiology_model`)).then((physSnap) => {
        if (cancelled || !physSnap.exists()) return;
        const data = physSnap.val();
        const {
          lastCalibrationWeek: savedCalWeek,
          fourCylinder: remoteFour,
          four_cylinder: remoteLegacy,
          ...coefficients
        } = data;
        if (savedCalWeek) setLastCalibrationWeek(savedCalWeek);
        if (data && typeof data === 'object') {
          const remoteFourCylinder = remoteFour ?? remoteLegacy ?? null;
          setUserModel((prev) => ({
            ...DEFAULT_USER_MODEL,
            ...prev,
            ...coefficients,
            fourCylinder: mergeFourCylinderStatePreferNewer(prev?.fourCylinder, remoteFourCylinder),
            caffeineSensitivity: clampModelValue(coefficients.caffeineSensitivity ?? prev.caffeineSensitivity ?? 1),
            carbCrashSensitivity: clampModelValue(coefficients.carbCrashSensitivity ?? prev.carbCrashSensitivity ?? 1),
            stressSensitivity: clampModelValue(coefficients.stressSensitivity ?? prev.stressSensitivity ?? 1),
            hydrationSensitivity: clampModelValue(coefficients.hydrationSensitivity ?? prev.hydrationSensitivity ?? 1),
            recoveryRate: clampModelValue(coefficients.recoveryRate ?? prev.recoveryRate ?? 1),
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
          enriched[k] = row.isRecipe === true || row.type === 'recipe'
            ? row
            : enrichDbRowWithFoodUnits(row, k);
        });

        void savePersonalDbToCache(enriched, user.uid);

        setFoodDb((prev) => {
          const merged = mergePersonalDbRemoteOverLocal(prev, enriched);
          if (personalFoodDbSnapshotsEqual(prev, merged)) return prev;
          return merged;
        });
      });
    }, { timeout: 3500 });
    backgroundCancels.push(cancelSecondary);

    return () => {
      cancelled = true;
      unsubToday?.();
      backgroundCancels.forEach((cancel) => {
        try {
          cancel?.();
        } catch {
          /* ignore */
        }
      });
    };
  }, [user]);

  // Allinea dailyLog al giorno visualizzato (cambio data o primo idrata da storico).
  const dailyLogBoundDateRef = useRef(null);
  useEffect(() => {
    if (!fullHistory || typeof fullHistory !== 'object' || !currentTrackerDate) return;

    const node = fullHistory[TRACKER_STORICO_KEY(currentTrackerDate)];
    const initialLog = getLogFromStoricoTree(fullHistory, currentTrackerDate);
    const nextLog = applyMealTimes(
      Array.isArray(initialLog) ? initialLog : [],
      node?.mealTimes ?? {},
    );
    const safeNextLog = Array.isArray(nextLog) ? nextLog : [];
    const dateChanged = dailyLogBoundDateRef.current !== currentTrackerDate;

    setDailyLog((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      if (!dateChanged && safePrev.length > 0) return safePrev;
      if (!dateChanged && safePrev.length === 0 && safeNextLog.length === 0) return safePrev;
      return safeNextLog;
    });

    dailyLogBoundDateRef.current = currentTrackerDate;
  }, [fullHistory, currentTrackerDate, setDailyLog]);

  /** Sincronizzazione esplicita su Firebase. Legge uid da auth.currentUser per evitare stale closures. In modalità simulazione non scrive mai. */
  const syncDatiFirebase = useCallback(
    (nuovoLog, nuoviNodi) => {
      if (isSimulationMode) return Promise.resolve(false);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('⚠️ Firebase Sync interrotto: Nessun utente loggato rilevato da auth.currentUser');
        return Promise.resolve(false);
      }
      const uid = currentUser.uid;

      try {
        const dateStr = currentTrackerDate;
        const logForFirebase = denormalizeLogForFirebase(nuovoLog || []);
        // 🔥 FIX FIREBASE KEY: Sanitizza mealType rimuovendo caratteri illegali per Firebase
        const mealTimes = (nuovoLog || [])
          .filter((i) => i.type === 'food' || i.type === 'recipe')
          .reduce(
            (acc, f) => {
              // Firebase blocca chiavi con: . # $ / [ ]
              const safeMealKey = String(f.mealType || 'meal').replace(/[.#$/[\]]/g, '_');
              return {
                ...acc,
                [safeMealKey]: f.mealTime ?? 12,
              };
            },
            {},
          );
        const sanitizedLog = stripUndefined(logForFirebase);
        const sanitizedNodes = stripUndefined(nuoviNodi || []);
        const existingNode = fullHistory?.[TRACKER_STORICO_KEY(dateStr)];
        const keepIntentionalFast =
          !dayHasFoodLog(sanitizedLog) && existingNode?.isIntentionalFast === true;
        const payload = withPreservedAutopilotCorrection({
          data: dateStr,
          log: sanitizedLog,
          mealTimes,
          manualNodes: sanitizedNodes,
          hasEditedNodes: true,
          ...(keepIntentionalFast ? { isIntentionalFast: true } : {}),
        }, existingNode);
        if (dateStr === getTodayString() && autopilotCorrectionRef) {
          payload.autopilotCorrection = Math.round(Number(autopilotCorrectionRef.current) || 0);
        }
        const sanitized = stripUndefined(payload);
        const storicoKey = TRACKER_STORICO_KEY(dateStr);

        writeTodayTrackerLocalCache(dateStr, sanitizedLog, mealTimes);
        patchRecentHistoryDay(uid, dateStr, sanitized);

        const normalizedLocal = normalizeLogData(nuovoLog || []);
        lastLogFromFirebaseRef.current = JSON.stringify(normalizedLocal);

        const dbPath = `users/${uid}/tracker_data/${storicoKey}`;

        // Cloud sync in background: la UI è già aggiornata via setDailyLog + cache locale.
        void set(ref(db, dbPath), sanitized)
          .then(() => {
            queueMicrotask(() => {
              setFullHistory((prev) => ({ ...prev, [storicoKey]: sanitized }));
            });
          })
          .catch((err) => {
            console.error('❌ Errore critico durante il salvataggio Firebase:', err);
          });

        return Promise.resolve(true);
      } catch (error) {
        console.error('❌ Errore durante la preparazione del payload Firebase:', error);
        return Promise.reject(error);
      }
    },
    [currentTrackerDate, isSimulationMode, auth, setFullHistory, fullHistory, autopilotCorrectionRef],
  );

  /**
   * Estende lo storico oltre i 90g Home (es. scan stimolo 365g in Centro Analisi / Longevità).
   * No-op se la RAM copre già la finestra richiesta.
   */
  const ensureDeepHistory = useCallback(async (kind = 'stimulus') => {
    if (!user?.uid) return { ok: false, skipped: true };
    const todayIso = getTodayString();
    const win = kind === 'stimulus' ? stimulusHistoryWindow(todayIso) : homeHistoryWindow(todayIso);
    const existing = peekTrackerHistoryMemory(user.uid)?.tree || {};
    const loaded = await ensureTrackerHistoryRange({
      db,
      uid: user.uid,
      from: win.from,
      to: win.to,
      existing,
    });
    if (!loaded?.ok) return loaded;
    const tree = loaded.tree || existing;
    stashTrackerHistoryMemory(user.uid, tree || {}, { from: win.from, to: win.to });
    setFullStorico(tree);
    setFullHistory(tree || {});
    writeRecentHistoryCache(user.uid, tree || {}, todayIso);
    return loaded;
  }, [db, user?.uid, setFullHistory, setFullStorico]);

  return {
    syncDatiFirebase,
    isInitialLoadComplete,
    isProfileHydrated,
    /** idle | loading | ready | error — bootstrap albero tracker_data completo */
    fullHistoryLoadState,
    /** Carica range oltre 90g on-demand (stimulus=365g). */
    ensureDeepHistory,
    lastLogFromFirebaseRef,
  };
}

export default useDiaryFirebaseSync;
