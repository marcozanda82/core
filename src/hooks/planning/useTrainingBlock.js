import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import {
  createTrainingBlockFromDefinition,
  getLocalTodayIso,
  getTodaysTrainingBlockSession,
  hasConfirmedToday,
  isTrainingSessionDoneOn,
  sanitizeTrainingBlock,
  trainingBlockToFirebasePayload,
} from '../../features/planning/trainingBlockSchema';
import {
  resolveImmutableBaseKcal,
  resolveTargetsFromTrainingBlockDay,
  computeTrainingBlockDailyTargets,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../../features/planning/trainingBlockTargets';
import {
  moveWorkoutSession,
  postponeWorkoutCascade,
  swapWorkoutSessions,
} from '../../features/planning/workoutScheduleService';

/**
 * Training Block a calendario assoluto — Firebase `users/{uid}/current_training_block`.
 * Sessioni per scheduledDate + lastCompletedDate (SSOT Home + Pianifica).
 *
 * @param {{
 *   db?: import('firebase/database').Database | null,
 *   userUid?: string | null,
 *   todayIso?: string | null,
 *   userProfile?: object | null,
 *   isSimulationMode?: boolean,
 *   onConfirmSession?: (session: object, meta: {
 *     block: object,
 *     todayIso: string,
 *     metabolicTargets: object,
 *   }) => void | Promise<void>,
 *   onPostponeSession?: (meta: {
 *     block: object,
 *     todayIso: string,
 *     metabolicTargets: object,
 *     postponedSession: object | null,
 *   }) => void | Promise<void>,
 * }} [config]
 */
export function useTrainingBlock({
  db = null,
  userUid = null,
  todayIso: todayIsoProp = null,
  userProfile = null,
  isSimulationMode = false,
  onConfirmSession = null,
  onPostponeSession = null,
} = {}) {
  const todayIso = String(todayIsoProp || getLocalTodayIso()).slice(0, 10);
  const [block, setBlock] = useState(/** @type {import('../../features/planning/trainingBlockSchema').TrainingBlock | null} */ (null));
  const [isLoading, setIsLoading] = useState(Boolean(db && userUid));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);

  const blockRef = useRef(block);
  blockRef.current = block;
  const onConfirmSessionRef = useRef(onConfirmSession);
  onConfirmSessionRef.current = onConfirmSession;
  const onPostponeSessionRef = useRef(onPostponeSession);
  onPostponeSessionRef.current = onPostponeSession;

  const blockPath = userUid ? `users/${userUid}/current_training_block` : null;

  const persistBlock = useCallback(
    async (nextBlock) => {
      const payload = trainingBlockToFirebasePayload(nextBlock);
      setBlock(sanitizeTrainingBlock(payload, todayIso));
      if (isSimulationMode || !db || !blockPath) return payload;
      await set(ref(db, blockPath), payload);
      return payload;
    },
    [db, blockPath, isSimulationMode, todayIso],
  );

  useEffect(() => {
    if (!db || !userUid || isSimulationMode) {
      setIsLoading(false);
      return undefined;
    }
    setIsLoading(true);
    const unsub = onValue(
      ref(db, `users/${userUid}/current_training_block`),
      (snap) => {
        if (!snap.exists()) {
          setBlock(null);
          setIsLoading(false);
          return;
        }
        setBlock(sanitizeTrainingBlock(snap.val(), todayIso));
        setIsLoading(false);
      },
      (err) => {
        console.warn('[useTrainingBlock] listen failed:', err);
        setError(String(err?.message || err));
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, [db, userUid, isSimulationMode, todayIso]);

  const todaySession = useMemo(
    () => getTodaysTrainingBlockSession(block, todayIso),
    [block, todayIso],
  );

  /** Piano settimanale ricorrente: attivo finché isActive. */
  const isBlockComplete = Boolean(block && block.isActive === false);

  const canPostpone = Boolean(
    block?.isActive
    && todaySession
    && !hasConfirmedToday(block, todayIso),
  );

  const canConfirm = Boolean(
    block?.isActive
    && todaySession
    && !hasConfirmedToday(block, todayIso),
  );

  const confirmedTodaySession = useMemo(() => {
    if (!todaySession) return null;
    if (!isTrainingSessionDoneOn(todaySession, todayIso)) return null;
    return todaySession;
  }, [todaySession, todayIso]);

  const metabolicTargets = useMemo(() => {
    if (!block) return null;
    const baseKcal = resolveImmutableBaseKcal({
      userProfile,
      fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
    });
    const weightKg =
      Number(userProfile?.weight)
      || Number(userProfile?.peso)
      || 75;

    if (!todaySession) {
      return computeTrainingBlockDailyTargets({
        baseKcal,
        weightKg,
        macroGoal: block.macroGoal,
        dayType: 'rest',
      });
    }

    return resolveTargetsFromTrainingBlockDay(todaySession, {
      baseKcal,
      weightKg,
      macroGoal: block.macroGoal,
    });
  }, [block, todaySession, userProfile]);

  const resolveTodayMetabolicTargets = useCallback((blockData) => {
    const baseKcal = resolveImmutableBaseKcal({
      userProfile,
      fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
    });
    const weightKg =
      Number(userProfile?.weight)
      || Number(userProfile?.peso)
      || 75;
    const session = getTodaysTrainingBlockSession(blockData, todayIso);
    if (!session) {
      return computeTrainingBlockDailyTargets({
        baseKcal,
        weightKg,
        macroGoal: blockData.macroGoal,
        dayType: 'rest',
      });
    }
    return resolveTargetsFromTrainingBlockDay(session, {
      baseKcal,
      weightKg,
      macroGoal: blockData.macroGoal,
    });
  }, [todayIso, userProfile]);

  const notifyTodayScheduleTargets = useCallback(async (prevBlock, nextBlock, extra = {}) => {
    if (typeof onPostponeSessionRef.current !== 'function') return null;

    const prevSession = getTodaysTrainingBlockSession(prevBlock, todayIso);
    const nextSession = getTodaysTrainingBlockSession(nextBlock, todayIso);
    const todayChanged = (
      (prevSession?.dayIndex ?? null) !== (nextSession?.dayIndex ?? null)
      || Boolean(prevSession) !== Boolean(nextSession)
      || String(prevSession?.type || '') !== String(nextSession?.type || '')
    );
    if (!todayChanged) return null;

    const targets = resolveTodayMetabolicTargets(nextBlock);
    await onPostponeSessionRef.current({
      block: nextBlock,
      todayIso,
      metabolicTargets: targets,
      postponedSession: extra.postponedSession ?? null,
      reason: extra.reason || 'schedule-change',
    });
    return targets;
  }, [resolveTodayMetabolicTargets, todayIso]);

  const startNewBlock = useCallback(
    async (blockDefinition) => {
      if (busy) return null;
      setBusy(true);
      setError(null);
      try {
        const next = createTrainingBlockFromDefinition({
          ...blockDefinition,
          todayIso,
        });
        await persistBlock(next);
        return next;
      } catch (err) {
        setError(String(err?.message || err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [busy, todayIso, persistBlock],
  );

  /**
   * Spunta / togli spunta: lastCompletedDate = oggi | null.
   * @param {number} dayIndex
   * @param {boolean} completed
   */
  const setSessionCompleted = useCallback(async (dayIndex, completed) => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    const idx = Math.floor(Number(dayIndex));
    if (!Number.isFinite(idx) || idx < 0) throw new Error('Sessione non valida.');
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const nextDays = current.days.map((d) => {
        if (d.dayIndex !== idx) return d;
        if (completed) {
          return {
            ...d,
            lastCompletedDate: todayIso,
            status: /** @type {'confirmed'} */ ('confirmed'),
            completedAt: now,
          };
        }
        return {
          ...d,
          lastCompletedDate: null,
          status: /** @type {'pending'} */ ('pending'),
          completedAt: null,
        };
      });
      const next = {
        ...current,
        days: nextDays,
        updatedAt: now,
        lastAction: completed
          ? { kind: 'confirm', at: now, date: todayIso }
          : (current.lastAction || null),
      };
      await persistBlock(next);
      return next;
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, todayIso, persistBlock]);

  const postponeSession = useCallback(async () => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    const session = getTodaysTrainingBlockSession(current, todayIso);
    if (!session) throw new Error('Nessuna sessione dovuta oggi da rinviare.');
    if (hasConfirmedToday(current, todayIso)) {
      throw new Error('Sessione già confermata oggi.');
    }
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const next = postponeWorkoutCascade(current, todayIso);
      await persistBlock(next);

      const restTargets = computeTrainingBlockDailyTargets({
        baseKcal: resolveImmutableBaseKcal({
          userProfile,
          fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
        }),
        weightKg:
          Number(userProfile?.weight)
          || Number(userProfile?.peso)
          || 75,
        macroGoal: current.macroGoal,
        dayType: 'rest',
      });

      if (typeof onPostponeSessionRef.current === 'function') {
        await onPostponeSessionRef.current({
          block: next,
          todayIso,
          metabolicTargets: restTargets,
          postponedSession: session,
          reason: 'postpone',
        });
      }

      return { block: next, metabolicTargets: restTargets };
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, todayIso, persistBlock, userProfile]);

  const moveSession = useCallback(async (sourceDayIndex, targetDateIso) => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const next = moveWorkoutSession(current, sourceDayIndex, targetDateIso, todayIso);
      await persistBlock(next);
      const targets = await notifyTodayScheduleTargets(current, next, { reason: 'move' });
      return { block: next, metabolicTargets: targets };
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, todayIso, persistBlock, notifyTodayScheduleTargets]);

  const swapSessions = useCallback(async (sourceDayIndex, targetDayIndex) => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const next = swapWorkoutSessions(current, sourceDayIndex, targetDayIndex, todayIso);
      await persistBlock(next);
      const targets = await notifyTodayScheduleTargets(current, next, { reason: 'swap' });
      return { block: next, metabolicTargets: targets };
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, todayIso, persistBlock, notifyTodayScheduleTargets]);

  const confirmSession = useCallback(async (options = {}) => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    const session = getTodaysTrainingBlockSession(current, todayIso);
    if (!session) throw new Error('Nessuna sessione dovuta oggi da confermare.');
    if (isTrainingSessionDoneOn(session, todayIso)) {
      throw new Error('Sessione già confermata oggi.');
    }
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const baseKcal = resolveImmutableBaseKcal({
        userProfile,
        fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
      });
      const weightKg =
        Number(userProfile?.weight)
        || Number(userProfile?.peso)
        || 75;
      const targets = resolveTargetsFromTrainingBlockDay(session, {
        baseKcal,
        weightKg,
        macroGoal: current.macroGoal,
      });

      if (typeof onConfirmSessionRef.current === 'function') {
        await onConfirmSessionRef.current(session, {
          block: current,
          todayIso,
          metabolicTargets: targets,
          skipWorkoutLog: options.skipWorkoutLog === true,
        });
      }

      const now = Date.now();
      const nextDays = current.days.map((d) => (
        d.dayIndex === session.dayIndex
          ? {
            ...d,
            status: /** @type {'confirmed'} */ ('confirmed'),
            lastCompletedDate: todayIso,
            completedAt: now,
          }
          : d
      ));

      const next = {
        ...current,
        days: nextDays,
        updatedAt: now,
        lastAction: { kind: 'confirm', at: now, date: todayIso },
      };
      await persistBlock(next);
      return { block: next, session, metabolicTargets: targets };
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, todayIso, persistBlock, userProfile]);

  const clearBlock = useCallback(async () => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      setBlock(null);
      if (!isSimulationMode && db && blockPath) {
        await set(ref(db, blockPath), null);
      }
      return true;
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, db, blockPath, isSimulationMode]);

  const resetBlock = clearBlock;

  const plannedTime = useMemo(() => {
    const t = Number(todaySession?.plannedTime);
    if (!Number.isFinite(t) || t < 0 || t >= 24) return null;
    if (String(todaySession?.type || '').toLowerCase() === 'rest') return null;
    return t;
  }, [todaySession]);

  return {
    block,
    isLoading,
    error,
    busy,
    todayIso,
    todaySession,
    confirmedTodaySession,
    plannedTime,
    metabolicTargets,
    isBlockComplete,
    canPostpone,
    canConfirm,
    startNewBlock,
    postponeSession,
    moveSession,
    swapSessions,
    confirmSession,
    setSessionCompleted,
    clearBlock,
    resetBlock,
  };
}

export default useTrainingBlock;
