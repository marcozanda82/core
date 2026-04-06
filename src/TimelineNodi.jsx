import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getMealIcon } from './coreEngine';
import {
  getTimePositionPercent,
  getWallClockDecimalHour,
  DEBUG_TIME_GRID_HOURS,
  getDebugGridLineTimelineStyle,
  buildTimelineEnergyStripGradient,
} from './timeLayout';
import { SHOW_TIME_ALIGNMENT_DEBUG } from './TimeAlignmentDebugOverlay';

const SUBTLE_SPRING = { type: 'spring', stiffness: 420, damping: 26, mass: 0.85 };

const NOW_LINE_GLOW =
  '0 0 4px rgba(0, 229, 255, 0.95), 0 0 10px rgba(0, 229, 255, 0.55), 0 0 18px rgba(255, 255, 255, 0.12)';
/** Apparizione nodo: scala 0.8→target + impulso glow, sotto 300ms. */
const NODE_ADD_DURATION = 0.26;
const NODE_ADD_EASE = [0.25, 0.88, 0.35, 1];
const POINT_ADD_GLOW_PULSE =
  '0 0 0 2px rgba(255,255,255,0.2), 0 0 18px rgba(0,229,255,0.48)';
const WORK_ADD_GLOW_PULSE =
  '0 0 0 1px rgba(255,234,0,0.35), 0 0 14px rgba(255,234,0,0.5)';
const COG_ADD_GLOW_PULSE =
  '0 0 0 1px rgba(0,229,255,0.32), 0 0 14px rgba(0,229,255,0.48)';

function nodeAddTransition(reduceMotion, isDragging) {
  if (reduceMotion || isDragging) return { duration: 0 };
  return {
    opacity: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
    scale: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
    x: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
    y: { duration: 0.18, ease: 'easeOut' },
    boxShadow: { duration: NODE_ADD_DURATION, ease: 'easeOut' },
  };
}

/**
 * Timeline Nodi Draggabili – striscia sovrapposta al grafico con nodi trascinabili.
 * Riceve dati, stato drag, ref e funzioni dal genitore (SalaComandi).
 */
export default function TimelineNodi({
  activeNodesWithStack,
  chartUnit,
  activeAction,
  analysisTabActive = false,
  idealStrategy,
  realTotals,
  NODE_IMPORTANCE,
  NODE_TYPE_ICON,
  draggingNode,
  touchingNodeId,
  dragOffsetY,
  dragLiveTime,
  timelineContainerRef,
  startNodeDrag,
  releaseNodePointer,
  /** (node, event?) — click/tap su nodo; `event` per ancorare il popover pasto. */
  onNodeClick,
  handleNodeTap,
  decimalToTimeStr,
  syncDatiFirebase,
  setManualNodes,
  setDailyLog,
  /** 0–100 body battery / energia; se omesso la barra non viene mostrata. */
  energyPercent,
  /** Click sulla striscia (non sui nodi): apre pianificazione pasto all’orario cliccato. */
  onTimelineTrackClick,
  /** Se impostato (es. da SalaComandi), stessa ora del grafico: ore + minuti/60. */
  nowLineDecimalHour,
  /** Punti energia giornata per sfondo gradient sotto la striscia: { time, energy } (0–24h, 0–100). */
  timelineEnergySeries,
}) {
  const reduceMotion = useReducedMotion();
  const [nowDecimalHour, setNowDecimalHour] = useState(() => getWallClockDecimalHour());
  const [draggingId, setDraggingId] = useState(null);
  const [dragX, setDragX] = useState(null);
  const containerRef = useRef(null);
  const nodes = activeNodesWithStack ?? [];

  useEffect(() => {
    if (typeof nowLineDecimalHour === 'number' && !Number.isNaN(nowLineDecimalHour)) return undefined;
    const tick = () => setNowDecimalHour(getWallClockDecimalHour());
    tick();
    const id = window.setInterval(tick, 45_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [nowLineDecimalHour]);

  useEffect(() => {
    function handleMove(e) {
      if (!draggingId) return;

      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const percent = Math.max(0, Math.min(1, x / rect.width));

      setDragX(percent);
    }

    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [draggingId]);

  const fireNodeClick = (node, event) => {
    if (typeof onNodeClick === 'function') onNodeClick(node, event);
    else if (typeof handleNodeTap === 'function') handleNodeTap(node)(event);
  };

  const onTimelineNodeMouseDown = (node) => () => {
    setDraggingId(node.id);
    document.body.style.userSelect = 'none';
    const restoreSelect = () => {
      document.body.style.userSelect = '';
    };
    window.addEventListener('mouseup', restoreSelect, { once: true });
    window.addEventListener('pointerup', restoreSelect, { once: true });
  };

  const showEnergyBar = energyPercent != null && Number.isFinite(Number(energyPercent));
  const energyFill = showEnergyBar ? Math.max(0, Math.min(100, Number(energyPercent))) : 0;

  const lineHour =
    typeof nowLineDecimalHour === 'number' && !Number.isNaN(nowLineDecimalHour)
      ? nowLineDecimalHour
      : nowDecimalHour;
  const nowLineLeft = `${getTimePositionPercent(lineHour)}%`;
  /** Larghezza barra energia allineata alla linea “ora” (stesso mapping 0–24h della timeline). */
  const energyBarWidthPercent = getTimePositionPercent(Math.max(0, Math.min(24, lineHour)));

  const energyStripGradient = useMemo(
    () => buildTimelineEnergyStripGradient(timelineEnergySeries),
    [timelineEnergySeries]
  );

  return (
    <div ref={containerRef} style={{ width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: '55px' }}>
      <div
        ref={timelineContainerRef}
        role={onTimelineTrackClick ? 'button' : undefined}
        tabIndex={onTimelineTrackClick ? 0 : undefined}
        aria-label={onTimelineTrackClick ? 'Clicca per pianificare un pasto in questo orario' : undefined}
        onKeyDown={
          onTimelineTrackClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTimelineTrackClick(e);
                }
              }
            : undefined
        }
        onClick={(e) => {
          if (typeof onTimelineTrackClick !== 'function') return;
          if (e.target.closest?.('.timeline-node')) return;
          onTimelineTrackClick(e);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
          height: '55px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px solid #222',
          overflow: 'visible',
          position: 'relative',
          boxSizing: 'border-box',
          cursor: onTimelineTrackClick ? 'pointer' : undefined,
        }}
      >
        {energyStripGradient ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              background: energyStripGradient,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        ) : null}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: '2px',
            marginTop: '-1px',
            background: 'rgba(255,255,255,0.14)',
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {SHOW_TIME_ALIGNMENT_DEBUG
          ? DEBUG_TIME_GRID_HOURS.map((h) => (
              <div key={`time-debug-tl-${h}`} aria-hidden style={getDebugGridLineTimelineStyle(h)} />
            ))
          : null}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: nowLineLeft,
            top: 0,
            bottom: 0,
            width: '1px',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, rgba(224,252,255,0.35) 0%, rgba(0,229,255,0.95) 45%, rgba(0,229,255,0.95) 55%, rgba(224,252,255,0.25) 100%)',
            boxShadow: NOW_LINE_GLOW,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <div
            className={reduceMotion ? undefined : 'now-timeline-now-dot'}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 6,
              height: 6,
              transform: reduceMotion ? 'translate(-50%, -50%)' : undefined,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #ffffff, rgba(0,229,255,0.95))',
              boxShadow: reduceMotion
                ? '0 0 6px rgba(0,229,255,0.55), 0 0 14px rgba(255,255,255,0.14)'
                : undefined,
            }}
          />
        </div>
          {nodes.map((node) => {
            const currentChartUnit = chartUnit;
            const isGhostMeal = node.type === 'ghost_meal';
            const isGhostWorkout = node.type === 'ghost_workout';
            const ghostVisual = isGhostMeal || isGhostWorkout;
            const effectiveNodeType =
              node.type === 'meal' || isGhostMeal ? 'meal' : isGhostWorkout ? 'workout' : node.type;
            const isImportant = NODE_IMPORTANCE?.[currentChartUnit]?.includes(effectiveNodeType);
            const importanceStyle = isImportant ? { filter: 'none', opacity: 1, zIndex: 10 } : { filter: 'grayscale(100%)', opacity: 0.35, zIndex: 1 };
            const isNodeFocused =
              analysisTabActive ||
              (!activeAction || activeAction === 'home') ||
              activeAction === 'diario_giornaliero' ||
              (activeAction === 'pasto' && (node.type === 'meal' || isGhostMeal)) ||
              (activeAction === 'allenamento' &&
                (node.type === 'work' || node.type === 'workout' || node.type === 'cognitive' || isGhostWorkout)) ||
              (activeAction === 'acqua' && node.type === 'water');
            const isWork = node.type === 'work';
            const isCognitive = node.type === 'cognitive';
            const durationPercent = (isWork || isCognitive) ? getTimePositionPercent(node.duration || 1) : 0;
            const idealVal =
              node.type === 'meal' || isGhostMeal
                ? (idealStrategy?.[node.strategyKey] ?? 400)
                : node.type === 'workout' || isGhostWorkout || node.type === 'cognitive'
                  ? (idealStrategy?.allenamento ?? 300)
                  : node.type === 'water'
                    ? 100
                    : (node.kcal ?? 400);
            const realVal = (node.type === 'meal' || node.type === 'workout') && !isGhostMeal && !isGhostWorkout ? (realTotals?.[node.strategyKey] ?? 0) : 0;
            const ratio = idealVal > 0 ? realVal / idealVal : 1;
            let borderColor = '#00e5ff';
            if (node.type === 'nap') borderColor = '#818cf8';
            else if (node.type === 'meditation') borderColor = '#22c55e';
            else if (node.type === 'supplements') borderColor = '#a855f7';
            else if (node.type === 'sunlight') borderColor = '#fbbf24';
            else if (node.type === 'water') borderColor = '#00e5ff';
            else if (ratio < 0.5) borderColor = '#ff3d00';
            else if (ratio > 1.2) borderColor = '#ffea00';
            const pointBorderColor = isWork ? '#ffea00' : (isCognitive ? '#00e5ff' : borderColor);
            const isDragging = draggingNode?.id === node.id;
            const isTouchingOrDragging = isDragging || (touchingNodeId === node.id);
            const dragY = isDragging ? dragOffsetY : 0;
            const displayTimeVal = (isDragging && dragLiveTime != null) ? dragLiveTime : node.time;
            const workEndTime = node.time + (node.duration || 1);
            const displayDurationPercent = (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'start'
              ? getTimePositionPercent(workEndTime - dragLiveTime)
              : (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'end'
                ? getTimePositionPercent(dragLiveTime - node.time)
                : durationPercent;
            const barStartHour =
              (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'end'
                ? node.time
                : displayTimeVal;
            const nodeLeftPercentStr = (timeHours) => {
              const percent =
                draggingId === node.id && dragX != null && Number.isFinite(Number(dragX))
                  ? Number(dragX)
                  : getTimePositionPercent(timeHours) / 100;
              const clamped = Math.max(0, Math.min(1, percent));
              return `${clamped * 100}%`;
            };
            const cognitiveIcon = node.subType === 'studio' ? '📚' : '💻';
            const cognitiveBg = 'rgba(0, 229, 255, 0.15)';
            const cognitiveBorder = '#00e5ff';

            if (isWork) {
              const dragEdge = isDragging ? draggingNode?.edge : null;
              const left = nodeLeftPercentStr(barStartHour);
              const barScale = isDragging ? 1.5 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
              const barOpacity = isDragging ? 1 : (importanceStyle.opacity ?? 1);
              return (
                <motion.div
                  key={node.id}
                  className={`timeline-node ${isDragging ? 'is-dragging' : ''}`}
                  onPointerDown={startNodeDrag(node, 'all')}
                  onMouseDown={onTimelineNodeMouseDown(node)}
                  onPointerUp={releaseNodePointer}
                  onPointerCancel={releaseNodePointer}
                  onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }}
                  initial={reduceMotion ? false : { opacity: barOpacity, scale: barScale * 0.8 }}
                  animate={{
                    opacity: barOpacity,
                    scale: barScale,
                    y: isDragging ? dragY - 45 : 0,
                    boxShadow: reduceMotion || isDragging ? 'none' : [WORK_ADD_GLOW_PULSE, 'none'],
                  }}
                  transition={nodeAddTransition(reduceMotion, isDragging)}
                  whileHover={!isDragging ? { scale: barScale * 1.04, transition: SUBTLE_SPRING } : undefined}
                  whileTap={
                    !isDragging
                      ? { scale: barScale * 0.96, transition: { type: 'spring', stiffness: 520, damping: 14 } }
                      : undefined
                  }
                  style={{
                    position: 'absolute',
                    left,
                    width: `${displayDurationPercent}%`,
                    top: '50%',
                    marginTop: -18 - (node.stackIndex || 0) * 38,
                    height: '36px',
                    transformOrigin: 'center center',
                    background: isDragging ? 'rgba(255, 234, 0, 0.3)' : 'rgba(255, 234, 0, 0.15)',
                    borderLeft: '2px solid #ffea00',
                    borderRight: '2px solid #ffea00',
                    borderRadius: '4px',
                    cursor: isDragging ? 'grabbing' : 'pointer',
                    touchAction: 'none',
                    pointerEvents: isNodeFocused ? 'auto' : 'none',
                    ...(isDragging ? {} : importanceStyle),
                    zIndex: isTouchingOrDragging ? 100 : 2,
                  }}
                >
                  <div onPointerDown={startNodeDrag(node, 'start')} onMouseDown={onTimelineNodeMouseDown(node)} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    💼
                  </div>
                  <div onPointerDown={startNodeDrag(node, 'end')} onMouseDown={onTimelineNodeMouseDown(node)} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'end' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time + (node.duration || 1))}:{String(Math.round(((node.time + (node.duration || 1)) % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    🏁
                  </div>
                </motion.div>
              );
            }
            if (isCognitive) {
              const dragEdge = isDragging ? draggingNode?.edge : null;
              const left = nodeLeftPercentStr(barStartHour);
              const barScale = isDragging ? 1.5 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
              const barOpacity = isDragging ? 1 : (importanceStyle.opacity ?? 1);
              return (
                <motion.div
                  key={node.id}
                  className={`timeline-node ${isDragging ? 'is-dragging' : ''}`}
                  onPointerDown={startNodeDrag(node, 'all')}
                  onMouseDown={onTimelineNodeMouseDown(node)}
                  onPointerUp={releaseNodePointer}
                  onPointerCancel={releaseNodePointer}
                  onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }}
                  initial={reduceMotion ? false : { opacity: barOpacity, scale: barScale * 0.8 }}
                  animate={{
                    opacity: barOpacity,
                    scale: barScale,
                    y: isDragging ? dragY - 45 : 0,
                    boxShadow: reduceMotion || isDragging ? 'none' : [COG_ADD_GLOW_PULSE, 'none'],
                  }}
                  transition={nodeAddTransition(reduceMotion, isDragging)}
                  whileHover={!isDragging ? { scale: barScale * 1.04, transition: SUBTLE_SPRING } : undefined}
                  whileTap={
                    !isDragging
                      ? { scale: barScale * 0.96, transition: { type: 'spring', stiffness: 520, damping: 14 } }
                      : undefined
                  }
                  style={{
                    position: 'absolute',
                    left,
                    width: `${displayDurationPercent}%`,
                    top: '50%',
                    marginTop: -18 - (node.stackIndex || 0) * 38,
                    height: '36px',
                    transformOrigin: 'center center',
                    background: isDragging ? 'rgba(0, 229, 255, 0.3)' : cognitiveBg,
                    borderLeft: `2px solid ${cognitiveBorder}`,
                    borderRight: `2px solid ${cognitiveBorder}`,
                    borderRadius: '4px',
                    cursor: isDragging ? 'grabbing' : 'pointer',
                    touchAction: 'none',
                    pointerEvents: isNodeFocused ? 'auto' : 'none',
                    ...(isDragging ? {} : importanceStyle),
                    zIndex: isTouchingOrDragging ? 100 : 2,
                  }}
                >
                  <div onPointerDown={startNodeDrag(node, 'start')} onMouseDown={onTimelineNodeMouseDown(node)} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: cognitiveBorder, color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    {cognitiveIcon}
                  </div>
                  <div onPointerDown={startNodeDrag(node, 'end')} onMouseDown={onTimelineNodeMouseDown(node)} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'end' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: cognitiveBorder, color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time + (node.duration || 1))}:{String(Math.round(((node.time + (node.duration || 1)) % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    🏁
                  </div>
                </motion.div>
              );
            }

            const isPesi = node.type === 'workout' && node.subType === 'pesi' && node.muscles?.length > 0;
            const isWater = node.type === 'water';
            const isAlcohol = node.type === 'alcohol';
            const isStimulant = node.type === 'stimulant';
            const isCognitivePoint = node.type === 'cognitive';
            const isMealPoint = node.type === 'meal' || isGhostMeal;
            const isWorkoutPoint = node.type === 'workout' || isGhostWorkout;
            const iconContent = isMealPoint
              ? getMealIcon(String(node.mealType || 'pranzo').split('_')[0])
              : isGhostWorkout
                ? '🏋️'
                : NODE_TYPE_ICON?.[node.type] ??
                  (isStimulant ? '☕' : (isWater ? '💧' : (isPesi ? node.muscles.map((m) => m.substring(0, 2).toUpperCase()).join('+') : node.icon || '•')));
            const bioTypeBg = { nap: 'rgba(129,140,248,0.2)', meditation: 'rgba(34,197,94,0.2)', supplements: 'rgba(168,85,247,0.2)', sunlight: 'rgba(251,191,36,0.2)', cognitive: 'rgba(182,102,210,0.2)' }[node.type];
            const bioTypeBorder = { nap: '#818cf8', meditation: '#22c55e', supplements: '#a855f7', sunlight: '#fbbf24', cognitive: '#b666d2' }[node.type];
            let bgColor = node.color;
            if (!bgColor) {
              if (isGhostMeal) {
                bgColor = isTouchingOrDragging ? 'rgba(0,229,255,0.14)' : 'rgba(0,229,255,0.06)';
              } else if (isGhostWorkout) {
                bgColor = isTouchingOrDragging ? 'rgba(248,113,113,0.12)' : 'rgba(248,113,113,0.05)';
              } else if (isTouchingOrDragging) {
                bgColor = isWorkoutPoint ? 'rgba(255,68,68,0.4)' : isMealPoint ? 'rgba(0,229,255,0.4)' : isCognitivePoint ? 'rgba(182,102,210,0.4)' : isStimulant ? 'rgba(245,158,11,0.35)' : isWater ? 'rgba(0,229,255,0.35)' : isAlcohol ? 'rgba(244,67,54,0.35)' : '#888';
              } else {
                bgColor = isCognitivePoint ? 'rgba(182,102,210,0.2)' : isWorkoutPoint ? 'rgba(255,68,68,0.2)' : isMealPoint ? 'rgba(0,229,255,0.15)' : isStimulant ? 'rgba(245,158,11,0.2)' : isWater ? 'rgba(0, 229, 255, 0.15)' : isAlcohol ? 'rgba(244,67,54,0.2)' : (bioTypeBg || 'rgba(0,0,0,0.6)');
              }
            }
            const nodeBorderColor =
              node.color ||
              (isCognitivePoint ? '#b666d2' : isWorkoutPoint ? '#ff4444' : isMealPoint ? '#00e5ff' : isStimulant ? '#f59e0b' : isWater ? '#00e5ff' : isAlcohol ? '#f44336' : bioTypeBorder || pointBorderColor);
            const borderStyle = isGhostMeal
              ? '1px dashed rgba(0, 229, 255, 0.4)'
              : isGhostWorkout
                ? '1px dashed rgba(248, 113, 113, 0.38)'
                : `2px solid ${nodeBorderColor}`;
            const timeLabelStr = isDragging && dragLiveTime != null ? decimalToTimeStr(dragLiveTime) : `${Math.floor(node.time)}:${String(Math.round((node.time % 1) * 60)).padStart(2, '0')}`;
            const baseScale = isDragging ? 2 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
            const targetOpacity = ghostVisual
              ? (isTouchingOrDragging ? 0.82 : 0.6)
              : isDragging
                ? 1
                : (importanceStyle.opacity ?? 1);
            let pointBoxShadow = 'none';
            if (isGhostMeal || isGhostWorkout) {
              pointBoxShadow =
                isTouchingOrDragging && isGhostMeal
                  ? '0 0 6px rgba(0, 229, 255, 0.12)'
                  : isTouchingOrDragging && isGhostWorkout
                    ? '0 0 6px rgba(248, 113, 113, 0.1)'
                    : 'none';
            } else if (isTouchingOrDragging) {
              pointBoxShadow = isWorkoutPoint ? '0 0 15px #ff4444' : isMealPoint ? '0 0 15px #00e5ff' : isCognitivePoint ? '0 0 15px #b666d2' : isStimulant ? '0 0 15px #f59e0b' : isWater ? '0 0 15px #00e5ff' : isAlcohol ? '0 0 15px #f44336' : (bioTypeBorder ? `0 0 15px ${bioTypeBorder}` : 'none');
            } else if (isCognitivePoint) {
              pointBoxShadow = '0 0 8px rgba(182,102,210,0.4)';
            }
            const pointZ = isTouchingOrDragging ? 100 : ghostVisual ? 9 : (importanceStyle.zIndex ?? 2);
            const left = nodeLeftPercentStr(displayTimeVal);
            return (
              <motion.div
                key={node.id}
                className={`timeline-node meal-node ${isDragging ? 'is-dragging' : ''} ${ghostVisual ? 'ghost-node' : ''}`}
                onPointerDown={startNodeDrag(node, 'all')}
                onMouseDown={onTimelineNodeMouseDown(node)}
                onPointerUp={releaseNodePointer}
                onPointerCancel={releaseNodePointer}
                onClick={(e) => { e.stopPropagation(); fireNodeClick(node, e); }}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: targetOpacity, scale: baseScale * 0.8, x: '-50%' }
                }
                animate={{
                  opacity: targetOpacity,
                  scale: baseScale,
                  x: '-50%',
                  y: isDragging ? dragY - 45 : 0,
                  boxShadow:
                    reduceMotion || isDragging
                      ? pointBoxShadow
                      : [POINT_ADD_GLOW_PULSE, pointBoxShadow],
                }}
                transition={nodeAddTransition(reduceMotion, isDragging)}
                whileHover={!isDragging ? { scale: baseScale * 1.1, transition: SUBTLE_SPRING } : undefined}
                whileTap={
                  !isDragging
                    ? { scale: baseScale * 0.94, transition: { type: 'spring', stiffness: 520, damping: 14 } }
                    : undefined
                }
                style={{
                  position: 'absolute',
                  left,
                  top: '50%',
                  marginTop: -18 - (node.stackIndex || 0) * 38,
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: bgColor,
                  border: borderStyle,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  touchAction: 'none',
                  pointerEvents: isNodeFocused || isGhostMeal || isGhostWorkout ? 'auto' : 'none',
                  zIndex: pointZ,
                  filter: ghostVisual ? 'none' : importanceStyle.filter,
                  transition: isDragging ? 'none' : 'left 0.3s ease-out, background 0.15s, box-shadow 0.2s ease',
                }}
              >
                {!ghostVisual && !isMealPoint ? (
                  <span className="node-time-label" style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (isAlcohol ? '#f44336' : (isCognitivePoint ? '#b666d2' : (bioTypeBorder || pointBorderColor)))), marginBottom: '2px', transition: 'color 0.2s' }}>
                    {timeLabelStr}
                  </span>
                ) : null}
                <span style={{ lineHeight: 1, fontSize: isPesi ? '0.55rem' : '1rem', fontWeight: isPesi ? 'bold' : 'normal', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (isAlcohol ? '#f44336' : (isCognitivePoint ? '#b666d2' : (bioTypeBorder || (isPesi ? pointBorderColor : 'inherit'))))) }}>{iconContent}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
      {showEnergyBar ? (
        <div
          style={{
            width: '100%',
            padding: 0,
            marginTop: 8,
            boxSizing: 'border-box',
          }}
        >
          <div
            role="meter"
            aria-valuenow={Math.round(energyFill)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`Energia ${Math.round(energyFill)} percento; barra fino all’ora attuale (${energyBarWidthPercent.toFixed(1)}% del giorno)`}
            aria-label={`Energia ${Math.round(energyFill)} per cento`}
            style={{
              width: '100%',
              height: 5,
              borderRadius: 5,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${energyBarWidthPercent}%`,
                borderRadius: 4,
                background: 'linear-gradient(90deg, #ef4444 0%, #eab308 50%, #22c55e 100%)',
                opacity: 0.35 + (energyFill / 100) * 0.65,
                transition: 'width 0.35s ease-out, opacity 0.35s ease-out',
              }}
            />
        </div>
        </div>
      ) : null}
    </div>
  );
}