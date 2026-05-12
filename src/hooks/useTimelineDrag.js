import { useState, useRef, useEffect } from 'react';

export function useTimelineDrag(ctx) {
  const {
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
  } = ctx;

  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragLiveTime, setDragLiveTime] = useState(null);
  const dragOffsetYRef = useRef(0);
  const dragEngine = useRef({
    isActive: false,
    nodeId: null,
    nodeType: null,
    startX: 0,
    initialTime: 0,
    lastX: 0,
    lastTime: 0,
    currentLiveTime: 0
  });

  useEffect(() => {
    if (draggingNode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [draggingNode]);

  useEffect(() => {
    if (!draggingNode) return;
    setDragOffsetY(0);
    dragOffsetYRef.current = 0;
    const el = timelineContainerRef.current;
    const { id: dragId, edge: dragEdge, type: dragType, originalTime, originalDuration } = draggingNode;
    const initialTime = dragType === 'work' && dragEdge === 'end' ? (originalTime + (originalDuration ?? 0)) : originalTime;
    dragEngine.current = {
      isActive: true,
      nodeId: dragId,
      nodeType: dragType,
      startX: 0,
      initialTime,
      lastX: 0,
      lastTime: 0,
      currentLiveTime: initialTime
    };
    setDragLiveTime(initialTime);

    const onMove = (e) => {
      if (!el || !draggingNode) return;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const offsetY = e.clientY - centerY;
      dragOffsetYRef.current = offsetY;
      setDragOffsetY(offsetY);

      const currentX = e.clientX;
      const currentT = performance.now();
      const { lastX, lastTime, currentLiveTime } = dragEngine.current;
      const pixelsPerHour = rect.width / 24;

      if (dragEngine.current.lastTime === 0) {
        dragEngine.current.lastX = currentX;
        dragEngine.current.lastTime = currentT;
        return;
      }
      const dx = currentX - lastX;
      const deltaT = currentT - lastTime;
      const velocity = deltaT > 0 ? Math.abs(dx) / deltaT : 0;
      const VELOCITY_THRESHOLD = 0.4;
      const FRICTION = 0.3;
      const effectiveDx = velocity > VELOCITY_THRESHOLD ? dx : dx * FRICTION;
      const deltaHours = effectiveDx / pixelsPerHour;
      let newTime = currentLiveTime + deltaHours;
      if (newTime < 0) newTime = 0;
      if (newTime > 24) newTime = 24;
      dragEngine.current.currentLiveTime = newTime;
      dragEngine.current.lastX = currentX;
      dragEngine.current.lastTime = currentT;
      setDragLiveTime(Math.round(newTime * 60) / 60);
    };

    const onUp = () => {
      if (isSimulationMode) {
        dragEngine.current.isActive = false;
        setDragLiveTime(null);
        setDragOffsetY(0);
        dragOffsetYRef.current = 0;
        setTouchingNodeId(null);
        setDraggingNode(null);
        return;
      }
      const isOutside = Math.abs(dragOffsetYRef.current) > 50;
      const finalTimeRaw = dragEngine.current.currentLiveTime;
      const finalTimeRounded = Math.round(finalTimeRaw * 12) / 12;
      const isGhostDrag = dragType === 'ghost_meal' || dragType === 'ghost_workout';
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;

      if (isOutside) {
        if (isGhostDrag) {
          setGhostProgramDeleteModal({ nodeId: dragId, dragType });
        } else {
          const confirmDelete = window.confirm('Vuoi eliminare questo elemento?');
          if (confirmDelete) {
            if (dragType === 'meal') {
              const { itemIds } = draggingNode;
              const idSet = new Set((itemIds || []).map((x) => String(x)));
              const newLog = dlSnap.filter((item) => !idSet.has(String(item.id)));
              const newNodes = mnSnap;
              setDailyLog(newLog);
              syncDatiFirebase(newLog, newNodes);
              pushTimelineUndoSnapshot(newLog, newNodes);
            } else {
              const newLog = dlSnap.filter(item => item.id !== dragId);
              const newNodes = mnSnap.filter(n => n.id !== dragId);
              setDailyLog(newLog);
              setManualNodes(newNodes);
              syncDatiFirebase(newLog, newNodes);
              pushTimelineUndoSnapshot(newLog, newNodes);
            }
          } else {
            if (dragType === 'meal') {
              const { itemIds, originalTime: origTime } = draggingNode;
              const idSet = new Set((itemIds || []).map((x) => String(x)));
              const next = dlSnap.map((item) =>
                idSet.has(String(item.id)) ? { ...item, mealTime: origTime } : item
              );
              setDailyLog(next);
              syncDatiFirebase(next, mnSnap);
            } else {
              const next = mnSnap.map(n =>
                n.id === dragId ? { ...n, time: originalTime, duration: originalDuration ?? n.duration } : n
              );
              setManualNodes(next);
              syncDatiFirebase(dlSnap, next);
            }
          }
        }
      } else {
        if (dragType === 'meal') {
          const { itemIds } = draggingNode;
          const idSet = new Set((itemIds || []).map((x) => String(x)));
          const nextLog = dlSnap.map((item) =>
            idSet.has(String(item.id)) ? { ...item, mealTime: finalTimeRounded } : item
          );
          setDailyLog(nextLog);
          syncDatiFirebase(nextLog, mnSnap);
          pushTimelineUndoSnapshot(nextLog, mnSnap);
        } else if (dragType === 'ghost_meal') {
          const nextLog = dlSnap.map((item) =>
            item.id === dragId && item.type === 'ghost_meal'
              ? { ...item, mealTime: finalTimeRounded, time: finalTimeRounded }
              : item
          );
          setDailyLog(nextLog);
          syncDatiFirebase(nextLog, mnSnap);
          pushTimelineUndoSnapshot(nextLog, mnSnap);
        } else {
          const next = mnSnap.map(n => {
            if (n.id !== dragId) return n;
            if (n.type === 'work' || n.type === 'cognitive') {
              if (dragEdge === 'start') {
                const end = n.time + (n.duration || 1);
                const newTime = Math.min(finalTimeRounded, end - 0.25);
                return { ...n, time: newTime, duration: end - newTime };
              }
              if (dragEdge === 'end') {
                const newEnd = Math.max(finalTimeRounded, n.time + 0.25);
                return { ...n, duration: newEnd - n.time };
              }
              return { ...n, time: finalTimeRounded };
            }
            return { ...n, time: finalTimeRounded };
          });
          setManualNodes(next);
          syncDatiFirebase(dlSnap, next);
          pushTimelineUndoSnapshot(dlSnap, next);
        }
      }
      dragEngine.current.isActive = false;
      setDragLiveTime(null);
      setDragOffsetY(0);
      dragOffsetYRef.current = 0;
      setTouchingNodeId(null);
      setDraggingNode(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingNode, isSimulationMode, pushTimelineUndoSnapshot, syncDatiFirebase]);

  return {
    draggingNode,
    setDraggingNode,
    dragOffsetY,
    dragOffsetYRef,
    dragLiveTime,
    dragEngine,
  };
}
