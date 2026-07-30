import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, set, update } from 'firebase/database';
import {
  addCalendarDaysIso,
  createTrainingBlockFromDefinition,
  getLocalTodayIso,
  getTodaysTrainingBlockSession,
  hasConfirmedToday,
  sanitizeTrainingBlock,
  trainingBlockToFirebasePayload,
} from '../../features/planning/trainingBlockSchema';
import {
  resolveImmutableBaseKcal,
  resolveTargetsFromTrainingBlockDay,
  computeTrainingBlockDailyTargets,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../../features/planning/trainingBlockTargets';

/**
 * Shiftable Training Block — Firebase `users/{uid}/current_training_block`.
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
  const catchUpInFlightRef = useRef(false);
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

  // Live sync Firebase
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

  // Catch-up silenzioso: todayIso > anchorDate → allinea anchor a oggi, pointer fermo
  useEffect(() => {
    if (!block?.isActive || !db || !userUid || isSimulationMode) return undefined;
    if (catchUpInFlightRef.current) return undefined;

    const anchor = String(block.anchorDate || '').slice(0, 10);
    if (!anchor || todayIso <= anchor) return undefined;

    catchUpInFlightRef.current = true;
    const now = Date.now();
    const next = {
      ...block,
      anchorDate: todayIso,
      updatedAt: now,
      lastAction: { kind: 'catch_up', at: now, date: todayIso },
    };

    const payload = trainingBlockToFirebasePayload(next);
    update(ref(db, `users/${userUid}/current_training_block`), {
      anchorDate: payload.anchorDate,
      updatedAt: payload.updatedAt,
      lastAction: payload.lastAction,
    })
      .then(() => {
        setBlock(sanitizeTrainingBlock({ ...block, ...payload }, todayIso));
      })
      .catch((err) => {
        console.warn('[useTrainingBlock] catch-up failed:', err);
      })
      .finally(() => {
        catchUpInFlightRef.current = false;
      });

    return undefined;
  }, [block, db, userUid, todayIso, isSimulationMode]);

  const todaySession = useMemo(
    () => getTodaysTrainingBlockSession(block, todayIso),
    [block, todayIso],
  );

  const isBlockComplete = Boolean(
    block?.isActive && block.currentDayPointer >= (block.days?.length || 0),
  );

  const canPostpone = Boolean(
    block?.isActive
    && todaySession
    && todayIso === block.anchorDate
    && !hasConfirmedToday(block, todayIso),
  );

  const canConfirm = Boolean(
    block?.isActive
    && todaySession
    && todayIso === block.anchorDate
    && !hasConfirmedToday(block, todayIso),
  );

  const confirmedTodaySession = useMemo(() => {
    if (!block || !hasConfirmedToday(block, todayIso)) return null;
    const confirmedIndex = Math.max(0, Number(block.currentDayPointer) - 1);
    return block.days?.[confirmedIndex] || null;
  }, [block, todayIso]);

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

    // Nessuna sessione dovuta oggi (es. dopo rinvio) → profilo Riposo, non il workout ancora in pointer.
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

  /**
   * Crea un nuovo blocco: pointer=0, anchorDate=today.
   * @param {{ name?: string, macroGoal?: string, days: Array<object>, blockId?: string }} blockDefinition
   */
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
   * Rinvia: se today === anchor, anchor → domani, pointer fermo.
   * Ricalcola subito i target di OGGI come giorno di riposo (sovrascrive surplus workout).
   */
  const postponeSession = useCallback(async () => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    if (todayIso !== current.anchorDate) {
      throw new Error('Nessuna sessione dovuta oggi da rinviare.');
    }
    if (hasConfirmedToday(current, todayIso)) {
      throw new Error('Sessione già confermata oggi.');
    }
    if (busy) return null;

    setBusy(true);
    setError(null);
    try {
      const postponedSession = current.days?.[current.currentDayPointer] || null;
      const tomorrow = addCalendarDaysIso(todayIso, 1);
      if (!tomorrow) throw new Error('Data domani non valida.');
      const now = Date.now();
      const next = {
        ...current,
        anchorDate: tomorrow,
        updatedAt: now,
        lastAction: { kind: 'postpone', at: now, date: todayIso },
      };
      await persistBlock(next);

      const baseKcal = resolveImmutableBaseKcal({
        userProfile,
        fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
      });
      const weightKg =
        Number(userProfile?.weight)
        || Number(userProfile?.peso)
        || 75;
      const restTargets = computeTrainingBlockDailyTargets({
        baseKcal,
        weightKg,
        macroGoal: current.macroGoal,
        dayType: 'rest',
      });

      if (typeof onPostponeSessionRef.current === 'function') {
        await onPostponeSessionRef.current({
          block: next,
          todayIso,
          metabolicTargets: restTargets,
          postponedSession,
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

  /**
   * Conferma: delega conversione log (callback) → pointer++ → anchor = domani.
   * Blocca doppie conferme sullo stesso todayIso.
   */
  const confirmSession = useCallback(async () => {
    const current = blockRef.current;
    if (!current?.isActive) throw new Error('Nessun blocco attivo.');
    if (todayIso !== current.anchorDate) {
      throw new Error('Nessuna sessione dovuta oggi da confermare.');
    }
    if (hasConfirmedToday(current, todayIso)) {
      throw new Error('Sessione già confermata oggi.');
    }
    const session = current.days[current.currentDayPointer];
    if (!session) throw new Error('Blocco completato: nessuna sessione rimanente.');
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
      // Wave Nutrition pre-calcolata sul giorno (AI) ha priorità sulle formule
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
        });
      }

      const tomorrow = addCalendarDaysIso(todayIso, 1);
      if (!tomorrow) throw new Error('Data domani non valida.');
      const now = Date.now();
      const nextPointer = current.currentDayPointer + 1;
      const nextDays = current.days.map((d, i) => (
        i === current.currentDayPointer
          ? {
            ...d,
            status: /** @type {'confirmed'} */ ('confirmed'),
            completedAt: now,
          }
          : d
      ));

      const next = {
        ...current,
        days: nextDays,
        currentDayPointer: nextPointer,
        anchorDate: tomorrow,
        isActive: nextPointer < nextDays.length,
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

  /**
   * Elimina il blocco attivo da Firebase (`current_training_block` → null)
   * e azzera lo stato locale → Home torna a "Nessun piano".
   */
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

  /** Alias esplicito per reset/eliminazione piano. */
  const resetBlock = clearBlock;

  /** Ora pianificata (ore decimali) della sessione dovuta oggi — per ghost_workout timeline. */
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
    confirmSession,
    clearBlock,
    resetBlock,
  };
}

export default useTrainingBlock;
