import React from 'react';
import { getMealIcon } from './coreEngine';

/** Voci da mostrare per pasto / ghost pasto (evita crash se `foods` mancante o non array). */
function getTimelineMealFoodDisplayEntries(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'meal') {
    if (Array.isArray(node.items) && node.items.length > 0) return node.items;
    if (Array.isArray(node.foods) && node.foods.length > 0) return node.foods;
    return [];
  }
  if (node.type === 'ghost_meal') {
    if (Array.isArray(node.foods) && node.foods.length > 0) return node.foods;
    if (Array.isArray(node.draftFoods) && node.draftFoods.length > 0) {
      return node.draftFoods
        .map((x) => {
          if (typeof x === 'string') {
            const t = x.trim();
            return t ? { name: t, qty: null } : null;
          }
          if (x && typeof x === 'object' && (x.name || x.desc)) return x;
          return null;
        })
        .filter(Boolean);
    }
    return [];
  }
  return [];
}

function formatTimelineMealFoodEntry(f) {
  try {
    if (f == null) return '';
    if (typeof f === 'string') return String(f).trim();
    if (typeof f !== 'object') return String(f);
    const name = String(f.name ?? f.desc ?? '').trim();
    const qtyRaw = f.qty ?? f.weight;
    const q =
      qtyRaw != null && Number.isFinite(Number(qtyRaw)) ? Math.round(Number(qtyRaw)) : 0;
    if (name && q > 0) return `${q}g ${name}`;
    return name || '';
  } catch {
    return '';
  }
}

const EMPTY_MEAL_LABEL = 'Empty meal';

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
  /** (node) => void — stesso gestore per tutti i nodi (inclusi ghost). Se assente si usa handleNodeTap(node). */
  onNodeClick,
  handleNodeTap,
  decimalToTimeStr,
  syncDatiFirebase,
  setManualNodes,
  setDailyLog
}) {
  const nodes = activeNodesWithStack ?? [];
  const fireNodeClick = (node) => {
    if (typeof onNodeClick === 'function') onNodeClick(node);
    else if (typeof handleNodeTap === 'function') handleNodeTap(node)();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minHeight: '55px', paddingLeft: '50px', paddingRight: '15px', boxSizing: 'border-box' }}>
      <div ref={timelineContainerRef} style={{ flex: 1, height: '55px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #222', overflow: 'visible', position: 'relative' }}>
          {nodes.map((node) => {
            const currentChartUnit = chartUnit;
            const isGhostMeal = node.type === 'ghost_meal';
            const isGhostWorkout = node.type === 'ghost_workout';
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
            const percent = (node.time / 24) * 100;
            const startPercent = percent;
            const durationPercent = (isWork || isCognitive) ? ((node.duration || 1) / 24) * 100 : 0;
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
            const displayPercent = (displayTimeVal / 24) * 100;
            const workEndTime = node.time + (node.duration || 1);
            const displayDurationPercent = (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'start'
              ? ((workEndTime - dragLiveTime) / 24) * 100
              : (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'end'
                ? ((dragLiveTime - node.time) / 24) * 100
                : durationPercent;
            const workBarLeftPercent = (isWork || isCognitive) && isDragging && dragLiveTime != null && draggingNode?.edge === 'end' ? percent : displayPercent;
            const cognitiveIcon = node.subType === 'studio' ? '📚' : '💻';
            const cognitiveBg = 'rgba(0, 229, 255, 0.15)';
            const cognitiveBorder = '#00e5ff';

            if (isWork) {
              const dragEdge = isDragging ? draggingNode?.edge : null;
              return (
                <div key={node.id} className={`timeline-node ${isDragging ? 'is-dragging' : ''}`} onPointerDown={startNodeDrag(node, 'all')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', left: `${workBarLeftPercent}%`, width: `${displayDurationPercent}%`, top: '50%', marginTop: -18 - (node.stackIndex || 0) * 38, height: '36px', transform: isDragging ? `translateY(${dragY - 45}px) scale(1.5)` : `scale(${isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8)})`, background: isDragging ? 'rgba(255, 234, 0, 0.3)' : 'rgba(255, 234, 0, 0.15)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', cursor: isDragging ? 'grabbing' : 'pointer', transition: isDragging ? 'none' : 'transform 0.2s ease-out, left 0.3s ease-out, background 0.15s', touchAction: 'none', pointerEvents: isNodeFocused ? 'auto' : 'none', zIndex: isTouchingOrDragging ? 100 : undefined, ...(isDragging ? {} : importanceStyle) }}>
                  <div onPointerDown={startNodeDrag(node, 'start')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    💼
                  </div>
                  <div onPointerDown={startNodeDrag(node, 'end')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'end' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time + (node.duration || 1))}:{String(Math.round(((node.time + (node.duration || 1)) % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    🏁
                  </div>
                </div>
              );
            }
            if (isCognitive) {
              const dragEdge = isDragging ? draggingNode?.edge : null;
              return (
                <div key={node.id} className={`timeline-node ${isDragging ? 'is-dragging' : ''}`} onPointerDown={startNodeDrag(node, 'all')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', left: `${workBarLeftPercent}%`, width: `${displayDurationPercent}%`, top: '50%', marginTop: -18 - (node.stackIndex || 0) * 38, height: '36px', transform: isDragging ? `translateY(${dragY - 45}px) scale(1.5)` : `scale(${isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8)})`, background: isDragging ? 'rgba(0, 229, 255, 0.3)' : cognitiveBg, borderLeft: `2px solid ${cognitiveBorder}`, borderRight: `2px solid ${cognitiveBorder}`, borderRadius: '4px', cursor: isDragging ? 'grabbing' : 'pointer', transition: isDragging ? 'none' : 'transform 0.2s ease-out, left 0.3s ease-out, background 0.15s', touchAction: 'none', pointerEvents: isNodeFocused ? 'auto' : 'none', zIndex: isTouchingOrDragging ? 100 : undefined, ...(isDragging ? {} : importanceStyle) }}>
                  <div onPointerDown={startNodeDrag(node, 'start')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: cognitiveBorder, color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    {cognitiveIcon}
                  </div>
                  <div onPointerDown={startNodeDrag(node, 'end')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                    {(dragEdge === 'end' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: cognitiveBorder, color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time + (node.duration || 1))}:{String(Math.round(((node.time + (node.duration || 1)) % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    🏁
                  </div>
                </div>
              );
            }

            const isPesi = node.type === 'workout' && node.subType === 'pesi' && node.muscles?.length > 0;
            const isWater = node.type === 'water';
            const isAlcohol = node.type === 'alcohol';
            const isStimulant = node.type === 'stimulant';
            const isCognitivePoint = node.type === 'cognitive';
            const isMealPoint = node.type === 'meal' || isGhostMeal;
            const isWorkoutPoint = node.type === 'workout' || isGhostWorkout;
            const iconContent = isGhostMeal
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
                bgColor = isTouchingOrDragging ? 'rgba(0,229,255,0.22)' : 'rgba(0,229,255,0.08)';
              } else if (isGhostWorkout) {
                bgColor = isTouchingOrDragging ? 'rgba(255,68,68,0.28)' : 'rgba(255,68,68,0.1)';
              } else if (isTouchingOrDragging) {
                bgColor = isWorkoutPoint ? 'rgba(255,68,68,0.4)' : isMealPoint ? 'rgba(0,229,255,0.4)' : isCognitivePoint ? 'rgba(182,102,210,0.4)' : isStimulant ? 'rgba(245,158,11,0.35)' : isWater ? 'rgba(0,229,255,0.35)' : isAlcohol ? 'rgba(244,67,54,0.35)' : '#888';
              } else {
                bgColor = isCognitivePoint ? 'rgba(182,102,210,0.2)' : isWorkoutPoint ? 'rgba(255,68,68,0.2)' : isMealPoint ? 'rgba(0,229,255,0.15)' : isStimulant ? 'rgba(245,158,11,0.2)' : isWater ? 'rgba(0, 229, 255, 0.15)' : isAlcohol ? 'rgba(244,67,54,0.2)' : (bioTypeBg || 'rgba(0,0,0,0.6)');
              }
            }
            const nodeBorderColor =
              node.color ||
              (isCognitivePoint ? '#b666d2' : isWorkoutPoint ? '#ff4444' : isMealPoint ? '#00e5ff' : isStimulant ? '#f59e0b' : isWater ? '#00e5ff' : isAlcohol ? '#f44336' : bioTypeBorder || pointBorderColor);
            const borderStyle = isGhostMeal || isGhostWorkout ? '2px dashed #00e5ff' : `2px solid ${nodeBorderColor}`;
            const timeLabelStr = isDragging && dragLiveTime != null ? decimalToTimeStr(dragLiveTime) : `${Math.floor(node.time)}:${String(Math.round((node.time % 1) * 60)).padStart(2, '0')}`;
            const pointTransform = isDragging ? `translate(-50%, ${dragY - 45}px) scale(2)` : `translateX(-50%) scale(${isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8)})`;
            let pointBoxShadow = 'none';
            if (isGhostMeal || isGhostWorkout) {
              pointBoxShadow = 'none';
            } else if (isTouchingOrDragging) {
              pointBoxShadow = isWorkoutPoint ? '0 0 15px #ff4444' : isMealPoint ? '0 0 15px #00e5ff' : isCognitivePoint ? '0 0 15px #b666d2' : isStimulant ? '0 0 15px #f59e0b' : isWater ? '0 0 15px #00e5ff' : isAlcohol ? '0 0 15px #f44336' : (bioTypeBorder ? `0 0 15px ${bioTypeBorder}` : 'none');
            } else if (isCognitivePoint) {
              pointBoxShadow = '0 0 8px rgba(182,102,210,0.4)';
            }
            const ghostVisual = isGhostMeal || isGhostWorkout;
            const mealDisplayEntries =
              isMealPoint && !isGhostMeal ? getTimelineMealFoodDisplayEntries(node) : [];
            const mealFoodSummaryLines = mealDisplayEntries.map(formatTimelineMealFoodEntry).filter(Boolean);
            const mealFoodsSummaryInline =
              mealFoodSummaryLines.length > 0 ? mealFoodSummaryLines.join(' · ') : '';
            const nodeTitleAttr = ghostVisual
              ? undefined
              : (() => {
                  const foodLine =
                    isMealPoint && mealFoodSummaryLines.length > 0
                      ? mealFoodsSummaryInline
                      : isMealPoint
                        ? EMPTY_MEAL_LABEL
                        : '';
                  return foodLine || undefined;
                })();
            const importanceForPoint = ghostVisual ? { filter: 'none', opacity: 1, zIndex: 9 } : isDragging ? {} : importanceStyle;
            const mealPointExpandedLayout = isMealPoint && !isGhostMeal;
            return (
              <div
                key={node.id}
                title={nodeTitleAttr}
                className={`timeline-node meal-node ${isDragging ? 'is-dragging' : ''} ${ghostVisual ? 'ghost-node' : ''}`}
                onPointerDown={startNodeDrag(node, 'all')}
                onPointerUp={releaseNodePointer}
                onPointerCancel={releaseNodePointer}
                onClick={(e) => { e.stopPropagation(); fireNodeClick(node); }}
                style={{
                  position: 'absolute',
                  left: `${displayPercent}%`,
                  transform: pointTransform,
                  top: '50%',
                  marginTop: -18 - (node.stackIndex || 0) * 38,
                  width: mealPointExpandedLayout ? 'auto' : '36px',
                  height: mealPointExpandedLayout ? 'auto' : '36px',
                  minWidth: mealPointExpandedLayout ? '36px' : undefined,
                  minHeight: mealPointExpandedLayout ? '36px' : undefined,
                  maxWidth: mealPointExpandedLayout ? '112px' : undefined,
                  padding: mealPointExpandedLayout ? '4px 6px 6px' : undefined,
                  borderRadius: mealPointExpandedLayout ? '12px' : '50%',
                  background: bgColor,
                  border: borderStyle,
                  boxShadow: pointBoxShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out, left 0.3s ease-out, background 0.15s',
                  touchAction: 'none',
                  pointerEvents: isNodeFocused || isGhostMeal || isGhostWorkout ? 'auto' : 'none',
                  zIndex: isTouchingOrDragging ? 100 : undefined,
                  ...importanceForPoint,
                }}
              >
                {!ghostVisual ? (
                  <span className="node-time-label" style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (isAlcohol ? '#f44336' : (isCognitivePoint ? '#b666d2' : (bioTypeBorder || pointBorderColor)))), marginBottom: '2px', transition: 'color 0.2s' }}>
                    {timeLabelStr}
                  </span>
                ) : null}
                <span style={{ lineHeight: 1, fontSize: isPesi ? '0.55rem' : '1rem', fontWeight: isPesi ? 'bold' : 'normal', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (isAlcohol ? '#f44336' : (isCognitivePoint ? '#b666d2' : (bioTypeBorder || (isPesi ? pointBorderColor : 'inherit'))))) }}>{iconContent}</span>
                {mealPointExpandedLayout ? (
                  <span
                    style={{
                      fontSize: '0.52rem',
                      fontWeight: 600,
                      color: mealFoodSummaryLines.length > 0 ? 'rgba(230,245,255,0.92)' : 'rgba(255,255,255,0.38)',
                      textAlign: 'center',
                      maxWidth: '100px',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                      marginTop: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {mealFoodSummaryLines.length > 0 ? mealFoodsSummaryInline : EMPTY_MEAL_LABEL}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
    </div>
  );
}