import { useState, useRef, useCallback, useEffect } from 'react';
import { useTimelineDrag } from '../useTimelineDrag';
import { NODE_DRAG_ARM_CANCEL_MOVE_PX } from '../../constants/salaComandiConstants';
import { getSlotKey } from '../../coreEngine';
import { normalizeMealSlotType } from '../../features/mealBuilder/utils/slotPredictor';
import { normalizeMealHour } from '../../features/salaComandi/utils/metabolicPhaseColors';

/**
 * Undo/redo timeline, drag & drop nodi, salvataggio FastLogger, edit nodi manuali.
 */
export function useTimelineDiaryActions({
  dailyLog,
  manualNodes,
  simulatedLog,
  activeLog,
  isSimulationMode,
  isInitialLoadComplete,
  dailyLogRef,
  manualNodesRef,
  syncDatiFirebase,
  setDailyLog,
  setManualNodes,
  setSimulatedLog,
  setMealToEdit,
  setEditingMealId,
  setFastLoggerInitialSlot,
  setPendingGhostMealId,
  setShowFastLogger,
  editingQuickNode,
  setEditingQuickNode,
  parseFlexibleTimeToDecimal,
  parseTimeStrToDecimal,
  decimalToTimeStr,
  pendingGhostMealId,
  timelineContainerRef,
  longPressTimerRef,
  longPressMoveCleanupRef,
}) {
  const [historyStack, setHistoryStack] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [ghostProgramDeleteModal, setGhostProgramDeleteModal] = useState(null);
  const [programmingRemovedToast, setProgrammingRemovedToast] = useState(false);
  const [touchingNodeId, setTouchingNodeId] = useState(null);

  const historyStackRef = useRef([]);
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    historyStackRef.current = historyStack;
    historyIndexRef.current = historyIndex;
  }, [historyStack, historyIndex]);

  const pushTimelineUndoSnapshot = useCallback((newDailyLog, newManualNodes) => {
    const newStack = historyStackRef.current.slice(0, historyIndexRef.current + 1);
    newStack.push({
      dailyLog: JSON.parse(JSON.stringify(newDailyLog)),
      manualNodes: JSON.parse(JSON.stringify(newManualNodes)),
    });
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 4000);
  }, []);

  const {
    draggingNode,
    setDraggingNode,
    dragOffsetY,
    dragOffsetYRef,
    dragLiveTime,
  } = useTimelineDrag({
    timelineContainerRef,
    dailyLogRef,
    manualNodesRef,
    isSimulationMode,
    pushTimelineUndoSnapshot,
    syncDatiFirebase,
    setDailyLog,
    setManualNodes,
    setGhostProgramDeleteModal,
    setTouchingNodeId,
  });

  /** Alimenti del diario che appartengono allo slot pasto (mealType o composito mealType_decimalTime come nel Pie). */
  const getFoodItemsForMealSlot = useCallback((log, slotId) => {
    if (slotId == null || slotId === 'rimanenti') return [];
    const idStr = String(slotId);
    const list = log || [];
    let items = list.filter((item) => getSlotKey(item) === idStr);
    if (items.length === 0) {
      const u = idStr.lastIndexOf('_');
      if (u > 0) {
        const baseMealType = idStr.slice(0, u);
        const parsedTime = Number(idStr.slice(u + 1));
        if (!Number.isNaN(parsedTime)) {
          items = list.filter(
            (item) =>
              (item.type === 'food' || item.type === 'recipe')
              && item.mealType === baseMealType
              && typeof item.mealTime === 'number'
              && Math.abs(item.mealTime - parsedTime) < 1e-4,
          );
        }
      }
    }
    return items;
  }, []);

  /** Commit orario nodo timeline (pasto aggregato, ghost_meal, manualNodes: work/cognitive/water/…). */
  const updateMealTime = useCallback(
    (nodeId, newTimeRaw) => {
      if (isSimulationMode) return;
      const t = Number(newTimeRaw);
      if (!Number.isFinite(t)) return;
      const finalTimeRounded = normalizeMealHour(Math.max(0, Math.min(24, t))) ?? Math.max(0, Math.min(24, t));
      const dragId = nodeId;
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;
      const idMatch = (a, b) => a === b || String(a) === String(b);

      if (mnSnap.some((n) => idMatch(n.id, dragId))) {
        const next = mnSnap.map((node) => {
          if (!idMatch(node.id, dragId)) return node;
          if (node.type === 'work' || node.type === 'cognitive') {
            return { ...node, time: finalTimeRounded };
          }
          return { ...node, time: finalTimeRounded, mealTime: finalTimeRounded };
        });
        setManualNodes(next);
        syncDatiFirebase(dlSnap, next);
        pushTimelineUndoSnapshot(dlSnap, next);
        return;
      }

      const ghost = dlSnap.find((item) => idMatch(item?.id, dragId) && item?.type === 'ghost_meal');
      if (ghost) {
        const nextLog = dlSnap.map((item) =>
          idMatch(item.id, dragId) && item.type === 'ghost_meal'
            ? { ...item, mealTime: finalTimeRounded, time: finalTimeRounded }
            : item,
        );
        setDailyLog(nextLog);
        syncDatiFirebase(nextLog, mnSnap);
        pushTimelineUndoSnapshot(nextLog, mnSnap);
        return;
      }

      const mealSlotForDrag = String(dragId);
      const itemIds = getFoodItemsForMealSlot(dlSnap, mealSlotForDrag).map((i) => i.id).filter((id) => id != null);
      if (itemIds.length === 0) return;
      const idSet = new Set(itemIds.map((x) => String(x)));
      const nextLog = dlSnap.map((item) =>
        idSet.has(String(item.id)) ? { ...item, mealTime: finalTimeRounded } : item,
      );
      setDailyLog(nextLog);
      syncDatiFirebase(nextLog, mnSnap);
      pushTimelineUndoSnapshot(nextLog, mnSnap);
    },
    [isSimulationMode, syncDatiFirebase, pushTimelineUndoSnapshot, getFoodItemsForMealSlot, dailyLogRef, manualNodesRef, setDailyLog, setManualNodes],
  );

  /** Cancellazione dopo drag orizzontale sulla striscia con puntatore fuori dalla fascia verticale della timeline. */
  const onTimelineStripDragOutsideDelete = useCallback(
    (node) => {
      if (!node || isSimulationMode) return;
      const dragId = node.id;
      const dragType = node.type;
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;
      const idMatch = (a, b) => a === b || String(a) === String(b);
      const isGhostDrag = dragType === 'ghost_meal' || dragType === 'ghost_workout';

      if (isGhostDrag) {
        setGhostProgramDeleteModal({ nodeId: dragId, dragType });
        return;
      }

      const confirmDelete = window.confirm('Vuoi eliminare questo elemento?');
      if (!confirmDelete) return;

      if (dragType === 'meal') {
        const slotId = String(node.mealId || node.id);
        const itemIds = getFoodItemsForMealSlot(dlSnap, slotId).map((i) => i.id).filter((id) => id != null);
        if (itemIds.length === 0) return;
        const idSet = new Set(itemIds.map((x) => String(x)));
        const newLog = dlSnap.filter((item) => !idSet.has(String(item.id)));
        setDailyLog(newLog);
        syncDatiFirebase(newLog, mnSnap);
        pushTimelineUndoSnapshot(newLog, mnSnap);
      } else {
        const newLog = dlSnap.filter((item) => !idMatch(item.id, dragId));
        const newNodes = mnSnap.filter((n) => !idMatch(n.id, dragId));
        setDailyLog(newLog);
        setManualNodes(newNodes);
        syncDatiFirebase(newLog, newNodes);
        pushTimelineUndoSnapshot(newLog, newNodes);
      }
    },
    [isSimulationMode, getFoodItemsForMealSlot, syncDatiFirebase, pushTimelineUndoSnapshot, dailyLogRef, manualNodesRef, setDailyLog, setManualNodes],
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const prev = historyStack[newIndex];
    if (!prev) return;
    setHistoryIndex(newIndex);
    setDailyLog(prev.dailyLog);
    setManualNodes(prev.manualNodes);
    syncDatiFirebase(prev.dailyLog, prev.manualNodes);
    setShowUndoToast(false);
  }, [historyIndex, historyStack, syncDatiFirebase, setDailyLog, setManualNodes]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= historyStack.length - 1) return;
    const newIndex = historyIndex + 1;
    const next = historyStack[newIndex];
    if (!next) return;
    setHistoryIndex(newIndex);
    setDailyLog(next.dailyLog);
    setManualNodes(next.manualNodes);
    syncDatiFirebase(next.dailyLog, next.manualNodes);
    setShowUndoToast(false);
  }, [historyIndex, historyStack, syncDatiFirebase, setDailyLog, setManualNodes]);

  const handleFastLoggerSave = useCallback(
    (draftFoods, targetMealType, editMealId, customMealTime) => {
      if (!isInitialLoadComplete || !Array.isArray(draftFoods) || draftFoods.length === 0) return;

      const mealTimeBySlot = {
        colazione: 8.0,
        pranzo: 13.0,
        cena: 20.0,
        snack: 10.5,
      };
      const slot = normalizeMealSlotType(String(targetMealType || 'pranzo').split('_')[0]);
      const batchId = Date.now();
      const logToUse = isSimulationMode ? (simulatedLog ?? dailyLog ?? []) : (dailyLog ?? []);

      let mealTypeToUse = slot;
      let mealTimeToUse = mealTimeBySlot[slot] ?? 13.0;

      if (typeof customMealTime === 'number' && !Number.isNaN(customMealTime)) {
        mealTimeToUse = customMealTime;
      } else if (editMealId) {
        const existing = getFoodItemsForMealSlot(logToUse, String(editMealId));
        if (existing.length > 0) {
          if (typeof existing[0].mealTime === 'number' && !Number.isNaN(existing[0].mealTime)) {
            mealTimeToUse = existing[0].mealTime;
          }
        }
      } else if (pendingGhostMealId) {
        const ghost = logToUse.find(
          (e) =>
            e?.type === 'ghost_meal'
            && e?.id != null
            && String(e.id) === String(pendingGhostMealId),
        );
        if (ghost) {
          let t = ghost.mealTime;
          if (typeof t !== 'number' || Number.isNaN(t)) t = ghost.time;
          if (typeof t === 'number' && !Number.isNaN(t)) {
            mealTimeToUse = t;
          } else {
            const parsed = parseFlexibleTimeToDecimal(String(t ?? ''));
            if (parsed != null) mealTimeToUse = parsed;
          }
        }
      }

      const nuoviAlimenti = draftFoods.map((f, index) => {
        const weight = Number(f.weight ?? f.qta) || 100;
        return {
          ...f,
          type: 'food',
          mealType: mealTypeToUse,
          mealTime: mealTimeToUse,
          id: `f_${batchId}_${index}`,
          qta: weight,
          weight,
          kcal: Number(f.kcal ?? f.cal) || 0,
          cal: Number(f.cal ?? f.kcal) || 0,
        };
      });

      let nuovoLog;
      if (editMealId) {
        const foodsToRemove = getFoodItemsForMealSlot(logToUse, String(editMealId));
        const removeSet = new Set(foodsToRemove);
        nuovoLog = logToUse.filter((item) => !removeSet.has(item));
        nuovoLog = [...nuoviAlimenti, ...nuovoLog];
      } else {
        nuovoLog = [...logToUse, ...nuoviAlimenti];
        if (pendingGhostMealId) {
          nuovoLog = nuovoLog.filter(
            (e) =>
              !(
                e?.type === 'ghost_meal'
                && e?.id != null
                && String(e.id) === String(pendingGhostMealId)
              ),
          );
        }
      }

      if (isSimulationMode) {
        setSimulatedLog(nuovoLog);
      } else {
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes || []);
      }
      setMealToEdit(null);
      setEditingMealId(null);
      setFastLoggerInitialSlot(null);
      setPendingGhostMealId(null);
      setShowFastLogger(false);
    },
    [
      dailyLog,
      simulatedLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      isInitialLoadComplete,
      getFoodItemsForMealSlot,
      pendingGhostMealId,
      parseFlexibleTimeToDecimal,
      setDailyLog,
      setSimulatedLog,
      setMealToEdit,
      setEditingMealId,
      setFastLoggerInitialSlot,
      setPendingGhostMealId,
      setShowFastLogger,
    ],
  );

  const removeLogItem = useCallback(
    (id) => {
      if (isSimulationMode) {
        setSimulatedLog((prev) => (prev || []).filter((item) => item.id !== id));
        return;
      }
      const newLog = dailyLog.filter((item) => item.id !== id);
      const newNodes = manualNodes.filter((n) => n.id !== id);
      setDailyLog(newLog);
      setManualNodes(newNodes);
      syncDatiFirebase(newLog, newNodes);
    },
    [isSimulationMode, dailyLog, manualNodes, syncDatiFirebase, setDailyLog, setManualNodes, setSimulatedLog],
  );

  const handleMiniTimelineDrag = useCallback(
    (e, containerRef, type, currentStart, currentEnd, setterStart, setterEnd, dragOpts = null) => {
      if (!containerRef?.current) return;
      e.preventDefault();
      const target = e.currentTarget;
      const pointerId = e.pointerId;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      target.setPointerCapture(pointerId);
      const fixedD =
        dragOpts && typeof dragOpts.fixedDurationHours === 'number' && dragOpts.fixedDurationHours > 0
          ? dragOpts.fixedDurationHours
          : null;

      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
        const newTime = Math.round(percent * 24 * 4) / 4;
        if (type === 'point') {
          setterStart(newTime);
        } else if (type === 'bar-start') {
          setterStart(Math.min(newTime, currentEnd - 0.25));
        } else if (type === 'bar-end' && fixedD != null) {
          setterEnd(Math.min(24, Math.max(0, newTime)));
        } else if (type === 'bar-end') {
          setterEnd(Math.max(newTime, currentStart + 0.25));
        } else if (type === 'bar-all' && fixedD != null) {
          const clampedStart = Math.min(24 - fixedD, newTime);
          setterEnd(clampedStart + fixedD);
        } else if (type === 'bar-all') {
          const duration = currentEnd - currentStart;
          const clampedStart = Math.min(24 - duration, newTime);
          setterStart(clampedStart);
          setterEnd(clampedStart + duration);
        }
      };

      const onUp = () => {
        try {
          target.releasePointerCapture(pointerId);
        } catch (_) {
          /* noop */
        }
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      };

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [],
  );

  const startNodeDrag = useCallback(
    (node, edge) => (e, activationOpts) => {
      e.stopPropagation();
      setTouchingNodeId(node.id);
      const target = e.currentTarget;
      const startX = Number.isFinite(activationOpts?.clientX0) ? activationOpts.clientX0 : e.clientX;
      const startY = Number.isFinite(activationOpts?.clientY0) ? activationOpts.clientY0 : e.clientY;

      longPressMoveCleanupRef.current?.();
      longPressMoveCleanupRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const onMove = (ev) => {
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (dist > NODE_DRAG_ARM_CANCEL_MOVE_PX) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          target.removeEventListener('pointermove', onMove, { passive: true });
          longPressMoveCleanupRef.current = null;
        }
      };
      const moveListenerOpts = { passive: true };
      target.addEventListener('pointermove', onMove, moveListenerOpts);
      longPressMoveCleanupRef.current = () => {
        target.removeEventListener('pointermove', onMove, moveListenerOpts);
        longPressMoveCleanupRef.current = null;
      };

      const innerDelayMs = activationOpts?.skipInnerLongPressDelay === true ? 0 : 180;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressMoveCleanupRef.current?.();
        longPressMoveCleanupRef.current = null;
        target.setPointerCapture(e.pointerId);
        dragOffsetYRef.current = 0;
        const mealSlotForDrag = String(node.mealId || node.id);
        const itemIds =
          node.type === 'meal'
            ? getFoodItemsForMealSlot(activeLog || [], mealSlotForDrag)
                .map((i) => i.id)
                .filter((id) => id != null)
            : [];
        setDraggingNode({
          id: node.id,
          type: node.type,
          itemIds,
          originalTime: node.time,
          originalDuration: node.duration,
          edge,
        });
      }, innerDelayMs);
    },
    [activeLog, getFoodItemsForMealSlot, setDraggingNode, dragOffsetYRef, longPressMoveCleanupRef, longPressTimerRef],
  );

  const releaseNodePointer = useCallback(
    (e) => {
      setTouchingNodeId(null);
      longPressMoveCleanupRef.current?.();
      longPressMoveCleanupRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        return;
      }
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [longPressMoveCleanupRef, longPressTimerRef],
  );

  const handleCloseQuickNodeEdit = useCallback(() => {
    setEditingQuickNode(null);
  }, [setEditingQuickNode]);

  const handleDeleteQuickNodeEdit = useCallback(() => {
    if (!editingQuickNode) return;
    if (window.confirm('Vuoi eliminare questa attività?')) {
      const next = manualNodes.filter((n) => n.id !== editingQuickNode.id);
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
      setEditingQuickNode(null);
    }
  }, [editingQuickNode, manualNodes, dailyLog, syncDatiFirebase, setManualNodes, setEditingQuickNode]);

  const handleSaveQuickNodeEdit = useCallback(() => {
    if (!editingQuickNode) return;
    const newStart = document.getElementById('quick-start-time')?.value;
    const newEnd = document.getElementById('quick-end-time')?.value;
    if (newStart != null && newEnd != null && newStart !== '' && newEnd !== '') {
      const startDec = parseTimeStrToDecimal(newStart);
      const endDec = parseTimeStrToDecimal(newEnd);
      let duration = endDec - startDec;
      if (duration <= 0) duration += 24;
      duration = Math.max(0.08, Math.min(24, duration));
      const next = manualNodes.map((n) =>
        n.id === editingQuickNode.id
          ? { ...n, time: startDec, startTime: startDec, endTime: endDec, duration }
          : n,
      );
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
    setEditingQuickNode(null);
  }, [editingQuickNode, manualNodes, dailyLog, syncDatiFirebase, parseTimeStrToDecimal, setManualNodes, setEditingQuickNode]);

  const quickNodeEditStartTime = editingQuickNode
    ? decimalToTimeStr(editingQuickNode.time ?? editingQuickNode.startTime ?? 14)
    : '14:00';
  const quickNodeEditEndTime = editingQuickNode
    ? decimalToTimeStr((editingQuickNode.time ?? editingQuickNode.startTime ?? 14) + (editingQuickNode.duration ?? 0.25))
    : '14:15';

  const handleConfirmGhostDeleteSingle = useCallback(() => {
    if (!ghostProgramDeleteModal) return;
    const { nodeId, dragType } = ghostProgramDeleteModal;
    setGhostProgramDeleteModal(null);
    const dl = dailyLogRef.current || [];
    const mn = manualNodesRef.current || [];
    if (dragType === 'ghost_meal') {
      const nextLog = dl.filter((e) => e.id !== nodeId);
      setDailyLog(nextLog);
      syncDatiFirebase(nextLog, mn);
      pushTimelineUndoSnapshot(nextLog, mn);
    } else {
      const nextNodes = mn.filter((n) => n.id !== nodeId);
      setManualNodes(nextNodes);
      syncDatiFirebase(dl, nextNodes);
      pushTimelineUndoSnapshot(dl, nextNodes);
    }
  }, [ghostProgramDeleteModal, dailyLogRef, manualNodesRef, syncDatiFirebase, pushTimelineUndoSnapshot, setDailyLog, setManualNodes]);

  const handleConfirmGhostDeleteAll = useCallback(() => {
    setGhostProgramDeleteModal(null);
    const dl = dailyLogRef.current || [];
    const mn = manualNodesRef.current || [];
    const nextLog = dl.filter((e) => !(e.isGhost === true || e.type === 'ghost_meal'));
    const nextNodes = mn.filter((n) => !(n.isGhost === true || n.type === 'ghost_workout'));
    setDailyLog(nextLog);
    setManualNodes(nextNodes);
    syncDatiFirebase(nextLog, nextNodes);
    pushTimelineUndoSnapshot(nextLog, nextNodes);
    setProgrammingRemovedToast(true);
    setTimeout(() => setProgrammingRemovedToast(false), 4000);
  }, [dailyLogRef, manualNodesRef, syncDatiFirebase, pushTimelineUndoSnapshot, setDailyLog, setManualNodes]);

  return {
    historyStack,
    historyIndex,
    showUndoToast,
    pushTimelineUndoSnapshot,
    draggingNode,
    setDraggingNode,
    dragOffsetY,
    dragOffsetYRef,
    dragLiveTime,
    touchingNodeId,
    setTouchingNodeId,
    getFoodItemsForMealSlot,
    updateMealTime,
    onTimelineStripDragOutsideDelete,
    handleUndo,
    handleRedo,
    handleFastLoggerSave,
    removeLogItem,
    handleMiniTimelineDrag,
    startNodeDrag,
    releaseNodePointer,
    handleCloseQuickNodeEdit,
    handleDeleteQuickNodeEdit,
    handleSaveQuickNodeEdit,
    quickNodeEditStartTime,
    quickNodeEditEndTime,
    ghostProgramDeleteModal,
    setGhostProgramDeleteModal,
    programmingRemovedToast,
    handleConfirmGhostDeleteSingle,
    handleConfirmGhostDeleteAll,
  };
}

export default useTimelineDiaryActions;
