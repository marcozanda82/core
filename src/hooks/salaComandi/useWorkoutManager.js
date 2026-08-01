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
}) {
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

  const lastWorkoutCommitRef = useRef({ key: '', at: 0 });
  const saveInFlightRef = useRef(false);

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

  const openWorkoutEditorFromLogItem = useCallback(
    (workout) => {
      if (!workout?.id) return;
      const startT = typeof workout.time === 'number' && !Number.isNaN(workout.time) ? workout.time : 12;
      const durH = Math.max(0.25, Number(workout.duration) || 1);
      const editSt = workout.subType || 'pesi';

      setEditingWorkoutId(workout.id);
      setWorkoutType(resolveWorkoutActivityTypeId(editSt) ?? editSt);
      setWorkoutEndTime(Math.min(24, startT + durH));
      setWorkoutDurationMin(String(Math.max(15, Math.min(600, Math.round(durH * 60)))));
      setWorkoutKcal(Number(workout.kcal || workout.cal) || 300);
      setWorkoutStrengthDetail(String(workout.workoutDetailNote || '').trim());
      setWorkoutMuscles(
        normalizeMuscleGroupArray(
          Array.isArray(workout.muscles)
            ? workout.muscles
            : Array.isArray(workout.workoutMuscles)
              ? workout.workoutMuscles
              : [],
        ),
      );
      setWorkoutPlanDraft(null);
      setShowDiarySheet(false);
      setActiveAction('allenamento');
      setIsDrawerOpen(true);
    },
    [setActiveAction, setIsDrawerOpen, setShowDiarySheet],
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
  const resetWorkoutFormForNewSession = useCallback(() => {
    setEditingWorkoutId(null);
    setWorkoutPlanDraft(null);
    setWorkoutType('pesi');
    setWorkoutMuscles([]);
    setWorkoutStrengthDetail('');
    setWorkoutDurationMin(String(WORKOUT_DURATION_DEFAULT));
    setWorkoutKcal(300);
  }, []);

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

  const handleSaveWorkout = useCallback(() => {
    if (saveInFlightRef.current) return;
    if (workoutActivityRequiresStrengthDetailNote(workoutType) && !String(workoutStrengthDetail).trim()) {
      window.alert('Compila «Dettaglio workout» per salvare questo tipo di attività.');
      return;
    }
    saveInFlightRef.current = true;
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

      let fourCylinderNextState = null;

      if (userModel && setUserModel) {
        const todayIso = currentTrackerDate || getTodayString();
        console.log('[DEBUG 4CYL] Input al motore:', {
          isGhostConversion: !!editingWorkoutId,
          editingWorkoutId,
          finalId,
          musclesRaw: workoutMuscles,
          muscles: musclesCanon,
          musclesInLogData: logData.muscles,
          musclesInNodeData: nodeData.muscles,
          duration,
          type: workoutType,
          isWork,
          isCognitive,
          projectedNodesCount: projectedNodes.length,
          projectedLogWorkouts: projectedLog.filter((e) => e?.type === 'workout').length,
        });
        const resolved = resolveFourCylinderForWorkoutSave({
          userModel,
          fullHistory,
          todayIso,
          newLog: projectedLog,
          newNodes: projectedNodes,
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
          console.log('[DEBUG 4CYL] Output dal motore:', resolved.nextState?.decay);
          console.log('[DEBUG 4CYL] Snapshot stimulus:', resolved.snapshot?.stimulus);
        } else {
          console.warn('[DEBUG 4CYL] resolveFourCylinderForWorkoutSave ha restituito null');
        }
      } else {
        console.warn('[DEBUG 4CYL] Pipeline saltata — userModel/setUserModel mancante:', {
          hasUserModel: Boolean(userModel),
          hasSetUserModel: Boolean(setUserModel),
        });
      }

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

      if (isSimulationMode) {
        setSimulatedLog(newLog);
        if (fourCylinderNextState && setUserModel) {
          setUserModel((prev) => physiologyModelWithFourCylinder(prev, fourCylinderNextState));
        }
        setEditingWorkoutId(null);
        setWorkoutMuscles([]);
        setWorkoutStrengthDetail('');
        setWorkoutPlanDraft(null);
        setIsPlanActionSheetOpen(false);
        closeDrawer();
        return;
      }

      setDailyLog(newLog);
      setManualNodes(newNodes);
      syncDatiFirebase(newLog, newNodes);

      if (fourCylinderNextState && setUserModel) {
        console.log('[DEBUG 4CYL] Persist su userModel/Firebase — decay:', fourCylinderNextState?.decay);
        persistFourCylinderState({
          db,
          userUid: user?.uid ?? null,
          setUserModel,
          nextFourCylinderState: fourCylinderNextState,
        });
      } else {
        console.warn('[DEBUG 4CYL] Nessuno stato da persistere — fourCylinderNextState null');
      }

      setEditingWorkoutId(null);
      setWorkoutMuscles([]);
      setWorkoutStrengthDetail('');
      setWorkoutPlanDraft(null);
      setIsPlanActionSheetOpen(false);
      closeDrawer();
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
    workoutMuscles,
    workoutKcal,
    isSimulationMode,
    setSimulatedLog,
    dailyLog,
    manualNodes,
    setDailyLog,
    setManualNodes,
    syncDatiFirebase,
    closeDrawer,
    setIsPlanActionSheetOpen,
    currentTrackerDate,
    userModel,
    setUserModel,
    user,
    db,
    lastCalibrationWeek,
    fullHistory,
    proteinTarget,
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
          });
        }
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
    openWorkoutEditorFromLogItem,
    handleStartWorkoutSession,
    clearWorkoutPlanDraft,
    resetWorkoutFormForNewSession,
    skipTodayPlanSession,
    handlePostponeWorkout,
    handleSaveWorkout,
    commitAddWorkoutCommand,
  };
}

export default useWorkoutManager;
