import { useState, useCallback, useRef, useMemo } from 'react';
import { ref, set, update, get } from 'firebase/database';
import { buildWorkoutDraftFromPlanBlock } from '../../features/weeklyBlocks/activityCatalog';
import {
  createEmptyWeeklyBlockPlan,
  dayBlockToFirebasePayload,
  sanitizeWeeklyBlockPlanFromFirebase,
} from '../../features/weeklyBlocks/weeklyBlockSchema';
import {
  isRestPlanBlockForSwap,
  buildUserRestDayBlock,
  relocatePlanBlockToDate,
} from '../../features/weeklyBlocks/planBlockSwapUtils';
import {
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
  normalizeMuscleGroupArray,
  resolveWorkoutActivityTypeId,
  resolveWorkoutMusclesForForm,
  resolveActivitySheetTab,
} from '../../activityCatalog';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MIN,
  WORKOUT_DURATION_MAX,
} from '../../utils/durationMinutesInput';
import { workoutActivityRequiresStrengthDetailNote } from '../../utils/workoutActivityNotes';
import { getCurrentTimeDecimal, getDefaultWorkoutEndTimeDecimal } from '../../utils/decimalTimeUtils';
import { mapChatWorkoutToNativePayload } from '../../features/workout/workoutAdapter';
import { getTodayString, addDays } from '../../coreEngine';
import { getWeekStartMondayKeyLocal } from '../../weeklyPlanning';
import { resolveFourCylinderForWorkoutSave } from '../../features/salaComandi/utils/fourCylinderRebuild';
import { persistFourCylinderState } from '../../features/salaComandi/utils/fourCylinderPersist';
import { physiologyModelWithFourCylinder } from '../../features/salaComandi/engines/fourCylinderEngine';
import { plannerInitialDataFromBlockDay } from '../../components/TrainingBlockCreator';

/**
 * Stato e azioni allenamento (tracker + piano giornaliero + commit da chat).
 *
 * @param {object} config — dipendenze esterne (Firebase, diario, UI drawer).
 */
export function useWorkoutManager({
  user,
  db,
  currentTrackerDate,
  isSimulationMode,
  todayPlanBlock,
  userProfileKcalBase,
  dailyLog,
  manualNodes,
  setDailyLog,
  setManualNodes,
  setSimulatedLog,
  syncDatiFirebase,
  manualNodesRef,
  closeDrawer,
  setActiveAction,
  setIsDrawerOpen,
  setIsPlanActionSheetOpen,
  setShowDiarySheet,
  parseFlexibleTimeToDecimal,
  userModel,
  setUserModel,
  lastCalibrationWeek,
  fullHistory = null,
  proteinTarget = null,
  /**
   * Chiude la scheda allenamento rispettando il ritorno in chat (niente home immediata).
   * @type {((opts?: { confirmExtra?: { title?: string, subtitle?: string } }) => void) | null}
   */
  closeWorkoutSurface = null,
  /** @type {((extra?: { title?: string, subtitle?: string }) => void) | null} */
  onWorkoutLoggedConfirm = null,
}) {
  const onWorkoutLoggedConfirmRef = useRef(onWorkoutLoggedConfirm);
  onWorkoutLoggedConfirmRef.current = onWorkoutLoggedConfirm;
  const closeWorkoutSurfaceRef = useRef(closeWorkoutSurface);
  closeWorkoutSurfaceRef.current = closeWorkoutSurface;
  /** Extra conferma Trainer3 in attesa fino alla chiusura superficie. */
  const pendingWorkoutConfirmRef = useRef(/** @type {{ title?: string, subtitle?: string } | null} */ (null));

  const endWorkoutSurface = useCallback((opts = {}) => {
    const confirmExtra = opts.confirmExtra ?? pendingWorkoutConfirmRef.current;
    pendingWorkoutConfirmRef.current = null;
    if (typeof closeWorkoutSurfaceRef.current === 'function') {
      closeWorkoutSurfaceRef.current({
        ...(confirmExtra ? { confirmExtra } : {}),
      });
      return;
    }
    if (confirmExtra && typeof onWorkoutLoggedConfirmRef.current === 'function') {
      onWorkoutLoggedConfirmRef.current(confirmExtra);
    }
    closeDrawer();
  }, [closeDrawer]);

  const [workoutPlanDraft, setWorkoutPlanDraft] = useState(
    /** @type {import('../../drawers/vistas/WorkoutView').WorkoutPlanDraft | null} */ (null),
  );
  const [workoutType, setWorkoutType] = useState('pesi');
  const [workoutKcal, setWorkoutKcal] = useState(300);
  const [workoutEndTime, setWorkoutEndTime] = useState(19);
  const [workoutDurationMin, setWorkoutDurationMin] = useState(String(WORKOUT_DURATION_DEFAULT));
  const [workoutStrengthDetail, setWorkoutStrengthDetail] = useState('');
  const [workoutMuscles, setWorkoutMuscles] = useState([]);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  /** Dopo conferma sessione: scheda revisione carichi/ripetizioni senza chiudere il drawer. */
  const [postWorkoutReviewActive, setPostWorkoutReviewActive] = useState(false);

  const lastWorkoutCommitRef = useRef({ key: '', at: 0 });
  const saveInFlightRef = useRef(false);
  /** Home Training Block «Esegui»: salva reale in scheda, poi commit blocco in background. */
  const trainingBlockExecuteRef = useRef(false);
  const onTrainingBlockWorkoutCommittedRef = useRef(/** @type {(() => void | Promise<void>) | null} */ (null));

  const workoutDurationHours = useMemo(
    () =>
      Math.max(
        0.25,
        Math.min(
          24,
          parseDurationMinutesInput(workoutDurationMin, {
            min: WORKOUT_DURATION_MIN,
            max: WORKOUT_DURATION_MAX,
            fallback: WORKOUT_DURATION_DEFAULT,
          }) / 60,
        ),
      ),
    [workoutDurationMin],
  );

  const workoutStartTime = useMemo(() => {
    let s = Number(workoutEndTime) - workoutDurationHours;
    if (s < 0) s += 24;
    if (s >= 24) s -= 24;
    return s;
  }, [workoutEndTime, workoutDurationHours]);

  const openWorkoutFromTodayPlan = useCallback(() => {
    if (!todayPlanBlock) return;
    const draft = buildWorkoutDraftFromPlanBlock(todayPlanBlock);
    if (!draft) return;

    const typeVal = draft.workoutType || 'pesi';
    const durationMin = parseDurationMinutesInput(draft.workoutDurationMin, {
      min: WORKOUT_DURATION_MIN,
      max: WORKOUT_DURATION_MAX,
      fallback: WORKOUT_DURATION_DEFAULT,
    });
    const startT = Number.isFinite(Number(draft.workoutStartTime))
      ? Number(draft.workoutStartTime)
      : getCurrentTimeDecimal();

    setEditingWorkoutId(null);
    setPostWorkoutReviewActive(false);
    setWorkoutType(resolveWorkoutActivityTypeId(typeVal) ?? typeVal);
    setWorkoutMuscles(normalizeMuscleGroupArray(draft.workoutMuscles));
    setWorkoutKcal(Number(draft.workoutKcal) || 300);
    setWorkoutDurationMin(String(durationMin));
    setWorkoutStrengthDetail(String(draft.workoutStrengthDetail || ''));
    setWorkoutEndTime(Math.min(24, startT + durationMin / 60));
    setWorkoutPlanDraft(draft);
    setIsPlanActionSheetOpen(false);
    setActiveAction('allenamento');
    setIsDrawerOpen(true);
  }, [todayPlanBlock, setActiveAction, setIsDrawerOpen, setIsPlanActionSheetOpen]);

  /**
   * Home Training Block — «Esegui»: apre la scheda attività precompilata (nessun COMPLETED finché non salvi).
   * @param {object} session — giorno corrente dal blocco
   * @param {() => void | Promise<void>} [onCommitted] — dopo salvataggio riuscito (es. avanza pointer blocco)
   */
  const openWorkoutFromTrainingBlockSession = useCallback(
    (session, onCommitted = null) => {
      const draft = plannerInitialDataFromBlockDay(session);
      const typeVal = draft.workoutType || 'pesi';
      const isRest = String(typeVal).toLowerCase() === 'riposo' || String(typeVal).toLowerCase() === 'rest';
      if (isRest) {
        window.alert('Oggi è previsto riposo — usa «Rimanda» se vuoi spostare la sessione.');
        return;
      }
      const durationMin = parseDurationMinutesInput(draft.workoutDurationMin, {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      });
      const startT = Number.isFinite(Number(draft.workoutStartTime))
        ? Number(draft.workoutStartTime)
        : getCurrentTimeDecimal();

      trainingBlockExecuteRef.current = true;
      onTrainingBlockWorkoutCommittedRef.current =
        typeof onCommitted === 'function' ? onCommitted : null;

      setEditingWorkoutId(null);
      setPostWorkoutReviewActive(false);
      setWorkoutType(resolveWorkoutActivityTypeId(typeVal) ?? typeVal);
      setWorkoutMuscles(normalizeMuscleGroupArray(draft.workoutMuscles));
      setWorkoutKcal(Number(draft.workoutKcal) || 300);
      setWorkoutDurationMin(String(durationMin));
      setWorkoutStrengthDetail(String(draft.workoutStrengthDetail || ''));
      setWorkoutEndTime(Math.min(24, startT + durationMin / 60));
      setWorkoutPlanDraft({ trainingBlockExecute: true, sessionTitle: session?.title || null });
      setIsPlanActionSheetOpen(false);
      setActiveAction('allenamento');
      setIsDrawerOpen(true);
    },
    [setActiveAction, setIsDrawerOpen, setIsPlanActionSheetOpen],
  );

  const openWorkoutEditorFromLogItem = useCallback(
    (workout) => {
      if (!workout?.id) return;

      const rawTime = Number(workout.time ?? workout.mealTime);
      let startT = Number.isFinite(rawTime) ? rawTime : null;
      if (startT == null && typeof parseFlexibleTimeToDecimal === 'function') {
        const parsed = parseFlexibleTimeToDecimal(String(workout.time ?? workout.mealTime ?? ''));
        if (parsed != null && Number.isFinite(parsed)) startT = parsed;
      }
      if (startT == null) startT = 12;

      const rawDur = Number(workout.duration);
      // Alcuni record legacy tengono i minuti (> 24); i salvataggi attuali usano ore decimali.
      let durH = 1;
      if (Number.isFinite(rawDur) && rawDur > 0) {
        durH = rawDur > 24 ? rawDur / 60 : rawDur;
      }
      durH = Math.max(0.25, Math.min(24, durH));

      const editSt =
        workout.subType
        || workout.workoutType
        || (workout.type === 'work' ? 'lavoro' : workout.type === 'cognitive' ? 'studio' : 'pesi');

      setEditingWorkoutId(workout.id);
      setPostWorkoutReviewActive(false);
      setWorkoutType(resolveWorkoutActivityTypeId(editSt) ?? editSt);
      setWorkoutEndTime(Math.min(24, startT + durH));
      setWorkoutDurationMin(String(Math.max(15, Math.min(600, Math.round(durH * 60)))));
      setWorkoutKcal(Number(workout.kcal || workout.cal) || 300);
      setWorkoutStrengthDetail(String(workout.workoutDetailNote || '').trim());
      setWorkoutMuscles(resolveWorkoutMusclesForForm(workout));
      setWorkoutPlanDraft(null);
      setShowDiarySheet(false);
      setActiveAction('allenamento');
      setIsDrawerOpen(true);
    },
    [parseFlexibleTimeToDecimal, setActiveAction, setIsDrawerOpen, setShowDiarySheet],
  );

  const handleStartWorkoutSession = useCallback(() => {
    const durationMin = parseDurationMinutesInput(workoutDurationMin, {
      min: WORKOUT_DURATION_MIN,
      max: WORKOUT_DURATION_MAX,
      fallback: WORKOUT_DURATION_DEFAULT,
    });
    setWorkoutEndTime(getDefaultWorkoutEndTimeDecimal(new Date(), durationMin));
  }, [workoutDurationMin]);

  const clearWorkoutPlanDraft = useCallback(() => {
    setWorkoutPlanDraft(null);
  }, []);

  /** Reset form per nuova sessione (non edit): evita che editingWorkoutId blocchi il 4-cylinder. */
  const resetWorkoutFormForNewSession = useCallback((defaultTab = 'pesi') => {
    const tab = resolveActivitySheetTab(defaultTab);
    setEditingWorkoutId(null);
    setPostWorkoutReviewActive(false);
    setWorkoutPlanDraft(null);
    setWorkoutType(tab);
    setWorkoutMuscles([]);
    setWorkoutStrengthDetail('');
    setWorkoutDurationMin(String(WORKOUT_DURATION_DEFAULT));
    setWorkoutKcal(300);
  }, []);

  const dismissPostWorkoutReview = useCallback(() => {
    setPostWorkoutReviewActive(false);
    setEditingWorkoutId(null);
    setWorkoutMuscles([]);
    setWorkoutStrengthDetail('');
    setWorkoutPlanDraft(null);
    endWorkoutSurface();
  }, [endWorkoutSurface]);

  const skipTodayPlanSession = useCallback(async () => {
    const uid = user?.uid;
    const todayIso = currentTrackerDate || getTodayString();
    const weekStart = getWeekStartMondayKeyLocal(todayIso);

    if (isSimulationMode || !db || !uid) {
      setIsPlanActionSheetOpen(false);
      return;
    }

    const restBlock = buildUserRestDayBlock(todayIso, todayPlanBlock, userProfileKcalBase);

    try {
      const payload = dayBlockToFirebasePayload(restBlock);
      await set(
        ref(db, `users/${uid}/weeklyBlockPlan/${weekStart}/blocks/${todayIso}`),
        payload,
      );
      await update(ref(db, `users/${uid}/weeklyBlockPlan/${weekStart}`), {
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('[SalaComandi] Salta sessione fallito:', err);
    } finally {
      setIsPlanActionSheetOpen(false);
    }
  }, [
    user?.uid,
    currentTrackerDate,
    isSimulationMode,
    db,
    todayPlanBlock,
    userProfileKcalBase,
    setIsPlanActionSheetOpen,
  ]);

  const handlePostponeWorkout = useCallback(async () => {
    const uid = user?.uid;
    const todayIso = currentTrackerDate || getTodayString();

    if (isSimulationMode || !db || !uid || !todayPlanBlock) {
      setIsPlanActionSheetOpen(false);
      return;
    }

    if (isRestPlanBlockForSwap(todayPlanBlock)) {
      setIsPlanActionSheetOpen(false);
      return;
    }

    try {
      /** @type {Map<string, import('../../features/weeklyBlocks/weeklyBlockSchema').WeeklyBlockPlan>} */
      const plansByWeek = new Map();

      const loadPlanForDate = async (isoDate) => {
        const weekMonday = getWeekStartMondayKeyLocal(isoDate);
        if (!plansByWeek.has(weekMonday)) {
          const snap = await get(ref(db, `users/${uid}/weeklyBlockPlan/${weekMonday}`));
          plansByWeek.set(
            weekMonday,
            snap.exists()
              ? sanitizeWeeklyBlockPlanFromFirebase(snap.val(), weekMonday)
              : createEmptyWeeklyBlockPlan(weekMonday),
          );
        }
        return plansByWeek.get(weekMonday);
      };

      let restDate = null;
      for (let offset = 1; offset <= 6; offset += 1) {
        const candidateIso = addDays(todayIso, offset);
        const plan = await loadPlanForDate(candidateIso);
        const candidateBlock = plan?.blocks?.[candidateIso];
        if (isRestPlanBlockForSwap(candidateBlock)) {
          restDate = candidateIso;
          break;
        }
      }

      if (!restDate) {
        window.alert(
          "Nessun giorno di riposo disponibile per posticipare l'allenamento. Usa 'Salta sessione'.",
        );
        setIsPlanActionSheetOpen(false);
        return;
      }

      const weekToday = getWeekStartMondayKeyLocal(todayIso);
      const weekRest = getWeekStartMondayKeyLocal(restDate);
      const todayRestBlock = buildUserRestDayBlock(todayIso, todayPlanBlock, userProfileKcalBase);
      const relocatedBlock = relocatePlanBlockToDate(todayPlanBlock, restDate);

      await update(ref(db, `users/${uid}/weeklyBlockPlan/${weekToday}`), {
        [`blocks/${todayIso}`]: dayBlockToFirebasePayload(todayRestBlock),
        updatedAt: Date.now(),
      });

      await update(ref(db, `users/${uid}/weeklyBlockPlan/${weekRest}`), {
        [`blocks/${restDate}`]: dayBlockToFirebasePayload(relocatedBlock),
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('[SalaComandi] Posticipa allenamento fallito:', err);
    } finally {
      setIsPlanActionSheetOpen(false);
    }
  }, [
    user?.uid,
    currentTrackerDate,
    isSimulationMode,
    db,
    todayPlanBlock,
    userProfileKcalBase,
    setIsPlanActionSheetOpen,
  ]);

  const handleSaveWorkout = useCallback((_options = {}) => {
    if (saveInFlightRef.current) return;
    if (workoutActivityRequiresStrengthDetailNote(workoutType) && !String(workoutStrengthDetail).trim()) {
      window.alert('Compila «Dettaglio workout» per salvare questo tipo di attività.');
      return;
    }
    saveInFlightRef.current = true;
    const editingAtStart = editingWorkoutId;
    const inReviewAtStart = postWorkoutReviewActive;
    try {
      const normalizedDurationMin = parseDurationMinutesInput(workoutDurationMin, {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      });
      setWorkoutDurationMin(String(normalizedDurationMin));
      const duration = Math.max(0.25, Math.min(24, normalizedDurationMin / 60));
      const def = getWorkoutActivityTypeDef(workoutType);
      const nodeKind = def?.nodeKind ?? 'workout';
      const isWork = nodeKind === 'work';
      const isCognitive = nodeKind === 'cognitive';
      const startDec = workoutStartTime;
      const finalId =
        editingWorkoutId || (isWork ? 'work_' : isCognitive ? 'cognitive_' : 'workout_') + Date.now();

      const musclesCanon = normalizeMuscleGroupArray(workoutMuscles);
      const detailTrim = String(workoutStrengthDetail).trim();
      const baseDesc = getWorkoutActivityLogDescription(workoutType, musclesCanon);
      const desc =
        detailTrim && workoutActivityRequiresStrengthDetailNote(workoutType)
          ? `${baseDesc} — ${detailTrim}`
          : baseDesc;
      const cognitiveKcal = isCognitive
        ? Math.round(getCognitiveMetForActivity(workoutType) * 70 * duration)
        : workoutKcal;
      const iconNode = isCognitive ? (def?.icon || '📚') : isWork ? '💼' : def?.icon || '🏋️';
      const nodeData = {
        id: finalId,
        type: isCognitive ? 'cognitive' : isWork ? 'work' : 'workout',
        time: Number(startDec),
        duration,
        kcal: isCognitive ? cognitiveKcal : workoutKcal,
        icon: iconNode,
        subType: workoutType,
        muscles: musclesCanon,
        ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
      };
      const logData = {
        id: finalId,
        type: 'workout',
        workoutType,
        subType: workoutType,
        desc,
        name: isCognitive ? desc : isWork ? 'Lavoro' : desc,
        kcal: isCognitive ? cognitiveKcal : workoutKcal,
        cal: isCognitive ? cognitiveKcal : workoutKcal,
        duration,
        time: Number(startDec),
        mealTime: Number(startDec),
        muscles: musclesCanon,
        ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
      };

      const baseLog = dailyLog || [];
      const baseNodes = manualNodes || [];
      const projectedLog = baseLog.some((n) => String(n.id) === String(finalId))
        ? baseLog.map((n) => (String(n.id) === String(finalId) ? logData : n))
        : [logData, ...baseLog];
      const projectedNodesRaw = baseNodes.some((n) => String(n.id) === String(finalId))
        ? baseNodes.map((n) => (String(n.id) === String(finalId) ? nodeData : n))
        : [...baseNodes, nodeData];
      const projectedNodes = projectedNodesRaw.filter((n) => n && n.type !== 'ghost_workout');

      const newLog = projectedLog.map((entry) => (
        String(entry?.id) === String(finalId)
          ? { ...entry, ...logData }
          : entry
      ));
      const newNodes = projectedNodes.map((node) => (
        String(node?.id) === String(finalId)
          ? { ...node, ...nodeData }
          : node
      ));
      const fromTrainingBlockExecute = trainingBlockExecuteRef.current;

      // Prenota conferma media (Trainer3): si riproduce alla chiusura, con chat aperta.
      if (!isWork && !isCognitive && !editingAtStart) {
        const mins = Math.round(normalizedDurationMin);
        const kcal = Math.round(Number(workoutKcal) || 0);
        pendingWorkoutConfirmRef.current = {
          subtitle: [mins > 0 ? `${mins} min` : null, kcal > 0 ? `~${kcal} kcal` : null]
            .filter(Boolean)
            .join(' · ') || undefined,
        };
      }

      const finishPostSaveUi = () => {
        setWorkoutPlanDraft(null);
        setIsPlanActionSheetOpen(false);
        if (fromTrainingBlockExecute) {
          trainingBlockExecuteRef.current = false;
          setPostWorkoutReviewActive(false);
          setEditingWorkoutId(null);
          setWorkoutMuscles([]);
          setWorkoutStrengthDetail('');
          endWorkoutSurface();
          return;
        }
        if (inReviewAtStart) {
          setPostWorkoutReviewActive(false);
          setEditingWorkoutId(null);
          setWorkoutMuscles([]);
          setWorkoutStrengthDetail('');
          endWorkoutSurface();
          return;
        }
        if (!editingAtStart) {
          setEditingWorkoutId(finalId);
          setPostWorkoutReviewActive(true);
          return;
        }
        setEditingWorkoutId(null);
        setWorkoutMuscles([]);
        setWorkoutStrengthDetail('');
        endWorkoutSurface();
      };

      const runHeavyPersist = () => {
        let persistedLog = newLog;
        let persistedNodes = newNodes;
        let fourCylinderNextState = null;

        if (userModel && setUserModel) {
          const todayIso = currentTrackerDate || getTodayString();
          const resolved = resolveFourCylinderForWorkoutSave({
            userModel,
            fullHistory,
            todayIso,
            newLog: persistedLog,
            newNodes: persistedNodes,
            editingWorkoutId,
            finalId,
            isWork,
            isCognitive,
            workoutType,
            musclesCanon,
            workoutKcal,
            duration,
            logData,
            proteinTarget,
            dailyLog,
          });
          if (resolved) {
            logData.fourCylinderSnapshot = resolved.snapshot;
            nodeData.fourCylinderRef = {
              engineVersion: resolved.snapshot.engineVersion,
              capturedAt: resolved.snapshot.capturedAt,
            };
            fourCylinderNextState = resolved.nextState;
            persistedLog = persistedLog.map((entry) => (
              String(entry?.id) === String(finalId)
                ? { ...entry, ...logData }
                : entry
            ));
            persistedNodes = persistedNodes.map((node) => (
              String(node?.id) === String(finalId)
                ? { ...node, ...nodeData }
                : node
            ));
            setDailyLog(persistedLog);
            setManualNodes(persistedNodes);
          }
        }

        if (!isSimulationMode) {
          syncDatiFirebase(persistedLog, persistedNodes);
        } else if (fourCylinderNextState && setUserModel) {
          setUserModel((prev) => physiologyModelWithFourCylinder(prev, fourCylinderNextState));
        }
        if (fourCylinderNextState && setUserModel) {
          persistFourCylinderState({
            db,
            userUid: user?.uid ?? null,
            setUserModel,
            nextFourCylinderState: fourCylinderNextState,
            fullHistory,
            anchorDateIso: currentTrackerDate || undefined,
            source: 'useWorkoutManager:save',
          });
        }

        const commitCb = fromTrainingBlockExecute
          ? onTrainingBlockWorkoutCommittedRef.current
          : null;
        onTrainingBlockWorkoutCommittedRef.current = null;
        if (commitCb) {
          void Promise.resolve(commitCb()).catch((err) => {
            console.warn('[useWorkoutManager] training block commit after save failed', err);
          });
        }
      };

      if (isSimulationMode) {
        setSimulatedLog(newLog);
        finishPostSaveUi();
        window.setTimeout(runHeavyPersist, 0);
        return;
      }

      setDailyLog(newLog);
      setManualNodes(newNodes);
      finishPostSaveUi();
      window.setTimeout(runHeavyPersist, 0);
    } finally {
      window.setTimeout(() => {
        saveInFlightRef.current = false;
      }, 600);
    }
  }, [
    workoutType,
    workoutStrengthDetail,
    workoutDurationMin,
    workoutStartTime,
    editingWorkoutId,
    postWorkoutReviewActive,
    workoutMuscles,
    workoutKcal,
    isSimulationMode,
    setSimulatedLog,
    dailyLog,
    manualNodes,
    setDailyLog,
    setManualNodes,
    syncDatiFirebase,
    setIsPlanActionSheetOpen,
    currentTrackerDate,
    userModel,
    setUserModel,
    user,
    db,
    lastCalibrationWeek,
    fullHistory,
    proteinTarget,
    endWorkoutSurface,
  ]);

  const commitAddWorkoutCommand = useCallback(
    (payload) => {
      const fingerprint = JSON.stringify({
        workoutName: payload?.workoutName,
        timeString: payload?.timeString || payload?.exactTime,
        durationMinutes: payload?.durationMinutes,
        estimatedKcal: payload?.estimatedKcal,
        exercises: payload?.exercises,
        trainingGoal: payload?.trainingGoal || payload?.workoutGoal || null,
        rpe: payload?.rpe ?? null,
        progressionNote: payload?.progressionNote || null,
      });
      const now = Date.now();
      if (
        lastWorkoutCommitRef.current.key === fingerprint
        && now - lastWorkoutCommitRef.current.at < 4000
      ) {
        return null;
      }
      lastWorkoutCommitRef.current = { key: fingerprint, at: now };

      const workoutName =
        String(payload?.workoutName || '').trim()
        || (Array.isArray(payload?.exercises)
          ? payload.exercises
              .map((item) => String(item?.exerciseName || '').trim())
              .filter(Boolean)
              .join(', ')
          : '');
      if (!workoutName && !(Array.isArray(payload?.exercises) && payload.exercises.length > 0)) {
        throw new Error('workoutName mancante');
      }

      const timeLabel = String(payload?.timeString || payload?.exactTime || '').trim();
      if (!timeLabel) {
        throw new Error('timeString mancante');
      }
      const timeDecimal = parseFlexibleTimeToDecimal(timeLabel);
      if (!Number.isFinite(timeDecimal)) {
        throw new Error('orario non valido');
      }

      const { logItem, timelineNode } = mapChatWorkoutToNativePayload(payload, timeDecimal);
      const durationMinutes = Math.max(1, Math.round((Number(logItem.duration) || 0) * 60));
      const label = String(logItem.desc || logItem.name || workoutName).trim();

      const chatDef = getWorkoutActivityTypeDef(logItem.workoutType);
      const chatNodeKind = chatDef?.nodeKind ?? 'workout';
      const isWork = chatNodeKind === 'work';
      const isCognitive = chatNodeKind === 'cognitive';

      const filteredLog = (dailyLog || []).filter((item) => item?.id !== logItem.id);
      const newLog = [logItem, ...filteredLog];
      const filteredNodes = (manualNodesRef.current || []).filter(
        (node) => node?.id !== timelineNode.id,
      );
      const newNodes = [...filteredNodes, timelineNode].filter(
        (node) => node && node.type !== 'ghost_workout',
      );

      let fourCylinderNextState = null;
      if (userModel && setUserModel) {
        const todayIso = currentTrackerDate || getTodayString();
        const musclesCanon = Array.isArray(timelineNode.muscles) ? timelineNode.muscles : [];
        const resolved = resolveFourCylinderForWorkoutSave({
          userModel,
          fullHistory,
          todayIso,
          newLog,
          newNodes,
          editingWorkoutId: null,
          finalId: logItem.id,
          isWork,
          isCognitive,
          workoutType: logItem.workoutType,
          musclesCanon,
          workoutKcal: logItem.kcal,
          duration: logItem.duration,
          logData: logItem,
          proteinTarget,
          dailyLog,
        });
        if (resolved) {
          logItem.fourCylinderSnapshot = resolved.snapshot;
          timelineNode.fourCylinderRef = {
            engineVersion: resolved.snapshot.engineVersion,
            capturedAt: resolved.snapshot.capturedAt,
          };
          fourCylinderNextState = resolved.nextState;
          newLog[0] = { ...logItem };
        }
      }

      if (isSimulationMode) {
        setSimulatedLog(newLog);
      } else {
        setDailyLog(newLog);
        setManualNodes(newNodes);
        syncDatiFirebase(newLog, newNodes);

        if (fourCylinderNextState && setUserModel) {
          persistFourCylinderState({
            db,
            userUid: user?.uid ?? null,
            setUserModel,
            nextFourCylinderState: fourCylinderNextState,
            fullHistory,
            anchorDateIso: currentTrackerDate || undefined,
            source: 'useWorkoutManager:quickLog',
          });
        }
      }

      if (
        !isWork
        && !isCognitive
        && typeof onWorkoutLoggedConfirmRef.current === 'function'
      ) {
        // Chat già aperta: conferma immediata (banner cinema monta subito).
        onWorkoutLoggedConfirmRef.current({
          subtitle: `${durationMinutes} min · ~${logItem.kcal} kcal`,
        });
      }

      return `✅ Allenamento registrato: ${label} (${durationMinutes} min, ~${logItem.kcal} kcal).`;
    },
    [
      isSimulationMode,
      parseFlexibleTimeToDecimal,
      setDailyLog,
      setManualNodes,
      setSimulatedLog,
      syncDatiFirebase,
      manualNodesRef,
      currentTrackerDate,
      userModel,
      setUserModel,
      user,
      db,
      lastCalibrationWeek,
      fullHistory,
      proteinTarget,
      dailyLog,
    ],
  );

  return {
    workoutPlanDraft,
    setWorkoutPlanDraft,
    workoutType,
    setWorkoutType,
    workoutKcal,
    setWorkoutKcal,
    workoutEndTime,
    setWorkoutEndTime,
    workoutDurationMin,
    setWorkoutDurationMin,
    workoutStrengthDetail,
    setWorkoutStrengthDetail,
    workoutMuscles,
    setWorkoutMuscles,
    editingWorkoutId,
    setEditingWorkoutId,
    workoutDurationHours,
    workoutStartTime,
    openWorkoutFromTodayPlan,
    openWorkoutFromTrainingBlockSession,
    openWorkoutEditorFromLogItem,
    handleStartWorkoutSession,
    clearWorkoutPlanDraft,
    resetWorkoutFormForNewSession,
    skipTodayPlanSession,
    handlePostponeWorkout,
    handleSaveWorkout,
    commitAddWorkoutCommand,
    postWorkoutReviewActive,
    dismissPostWorkoutReview,
  };
}

export default useWorkoutManager;
