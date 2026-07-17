import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decimalToTimeStr, NODE_TYPE_ICON } from '../../../coreEngine';
import {
  computeHourFromTimelinePointer,
  getTimePositionPercent,
  getWallClockDecimalHour,
} from '../../../timeLayout';
import {
  KENTU_TIMELINE,
  kentuTimelineAxisStyle,
  kentuTimelineLabelAboveStyle,
  kentuTimelineStripStyle,
} from '../utils/kentuTimelineUi';
import { collectTodayMealBatches } from '../utils/todayMealsTimelineUtils';

/** Formato HH:MM da ore decimali (0–24). */
export function formatTime(decimalHours) {
  return decimalToTimeStr(decimalHours);
}

function clampTimelinePercent(percent) {
  return Math.min(100, Math.max(0, percent));
}

function resolveNodeLeftPercent(hourDecimal) {
  const hour = Number(hourDecimal);
  if (!Number.isFinite(hour)) return 50;
  return clampTimelinePercent(getTimePositionPercent(hour));
}

function LoggedMealNode({ batch }) {
  const left = resolveNodeLeftPercent(batch.mealTime);
  const { loggedNode, colors } = KENTU_TIMELINE;
  const icon = NODE_TYPE_ICON.meal || '🥗';
  const radius = loggedNode.sizePx / 2;

  return (
    <>
      <div
        className="timeline-node meal-node kentu-timeline-logged-node pointer-events-none absolute z-[1]"
        style={{
          left: `${left}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: loggedNode.sizePx,
          height: loggedNode.sizePx,
          opacity: loggedNode.opacity,
          filter: loggedNode.filter,
        }}
        title={`${batch.mealLabel}${batch.timeLabel ? ` · ${batch.timeLabel}` : ''}${batch.kcal ? ` · ${batch.kcal} kcal` : ''}`}
      >
        <span
          className="flex h-full w-full items-center justify-center rounded-full"
          style={{
            background: colors.mealBgMuted,
            border: `2px solid ${colors.meal}`,
            boxShadow: colors.mealGlow,
          }}
          aria-hidden
        >
          <span style={{ lineHeight: 1, fontSize: '0.75rem' }}>{icon}</span>
        </span>
      </div>
      {batch.timeLabel ? (
        <span
          className="node-time-label pointer-events-none absolute z-[1] whitespace-nowrap font-bold tabular-nums"
          style={{
            ...kentuTimelineLabelAboveStyle(left, radius),
            ...KENTU_TIMELINE.timeLabel,
            fontSize: '0.55rem',
            opacity: 0.85,
          }}
        >
          {batch.timeLabel}
        </span>
      ) : null}
    </>
  );
}

function GhostMealNode({
  leftPercent,
  timeLabel,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) {
  const { ghostNode, colors } = KENTU_TIMELINE;
  const visualRadius = (ghostNode.sizePx / 2) * ghostNode.scale;

  return (
    <>
      <div
        className={`timeline-node meal-node ghost-node kentu-timeline-ghost-node absolute z-20 flex items-center justify-center touch-none ${
          isDragging ? 'is-dragging' : ''
        }`}
        style={{
          left: `${leftPercent}%`,
          top: '50%',
          width: ghostNode.sizePx,
          height: ghostNode.sizePx,
          borderRadius: '50%',
          background: isDragging ? colors.ghostBgActive : colors.ghostBg,
          border: isDragging
            ? `2px dashed ${colors.ghostBorderActive}`
            : `1px dashed ${colors.ghostBorder}`,
          opacity: ghostNode.opacity,
          transform: `translate(-50%, -50%) scale(${ghostNode.scale})`,
          boxShadow: colors.ghostGlow,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        role="slider"
        aria-label={`Orario pasto${timeLabel ? `: ${timeLabel}` : ''}`}
        aria-valuemin={0}
        aria-valuemax={24}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span style={{ lineHeight: 1, fontSize: '1rem' }} aria-hidden>
          {NODE_TYPE_ICON.meal || '🥗'}
        </span>
      </div>
      {timeLabel ? (
        <span
          className="node-time-label pointer-events-none absolute z-20 whitespace-nowrap font-bold tabular-nums"
          style={{
            ...kentuTimelineLabelAboveStyle(leftPercent, visualRadius),
            ...KENTU_TIMELINE.ghostTimeLabel,
          }}
          aria-live="polite"
        >
          {timeLabel}
        </span>
      ) : null}
    </>
  );
}

function KentuTimelineBar({
  batches,
  currentMealTime,
  onMealTimeChange,
  manualOverrideRef,
}) {
  const trackRef = useRef(null);
  const dragPointerIdRef = useRef(null);
  const suppressTrackClickRef = useRef(false);
  const localManualRef = useRef(false);
  const [dragLiveTime, setDragLiveTime] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const isManualOverride = () =>
    Boolean(manualOverrideRef?.current || localManualRef.current);

  const displayHour = dragLiveTime ?? Number(currentMealTime);
  const safeDisplayHour = Number.isFinite(displayHour)
    ? displayHour
    : getWallClockDecimalHour();
  const ghostLeft = resolveNodeLeftPercent(safeDisplayHour);
  const ghostTimeLabel = formatTime(safeDisplayHour);

  const markManualOverride = useCallback(() => {
    localManualRef.current = true;
    if (manualOverrideRef) manualOverrideRef.current = true;
  }, [manualOverrideRef]);

  const resolveHourFromPointerEvent = useCallback((event) => {
    const el = trackRef.current;
    if (!el) return null;
    const clientX =
      typeof event?.clientX === 'number' && Number.isFinite(event.clientX)
        ? event.clientX
        : null;
    if (clientX == null) return null;
    return computeHourFromTimelinePointer(clientX, el.getBoundingClientRect());
  }, []);

  const commitMealTime = useCallback(
    (hour, fromUser = false) => {
      if (typeof onMealTimeChange !== 'function') return;
      if (hour == null || !Number.isFinite(hour)) return;
      // Auto-sync (orologio) non deve mai sovrascrivere un orario scelto a mano.
      if (!fromUser && isManualOverride()) return;
      // Nessun clamp rispetto all'ultimo pasto loggato: solo bound giornata 0–24.
      const bounded = Math.max(0, Math.min(24, hour));
      if (fromUser) markManualOverride();
      onMealTimeChange(bounded);
    },
    [markManualOverride, onMealTimeChange],
  );

  useEffect(() => {
    const tick = () => {
      if (isManualOverride()) return;
      commitMealTime(getWallClockDecimalHour(), false);
    };

    const intervalId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(intervalId);
  }, [commitMealTime, manualOverrideRef]);

  const handleTrackClick = useCallback(
    (event) => {
      if (typeof onMealTimeChange !== 'function') return;
      if (suppressTrackClickRef.current) {
        suppressTrackClickRef.current = false;
        return;
      }
      const hour = resolveHourFromPointerEvent(event);
      commitMealTime(hour, true);
    },
    [commitMealTime, onMealTimeChange, resolveHourFromPointerEvent],
  );

  const handleGhostPointerDown = useCallback(
    (event) => {
      event.stopPropagation();
      dragPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressTrackClickRef.current = true;
      setIsDragging(true);
      markManualOverride();
      const hour = resolveHourFromPointerEvent(event);
      if (hour != null) setDragLiveTime(hour);
    },
    [markManualOverride, resolveHourFromPointerEvent],
  );

  const handleGhostPointerMove = useCallback(
    (event) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      const hour = resolveHourFromPointerEvent(event);
      if (hour != null) {
        setDragLiveTime(hour);
        commitMealTime(hour, true);
      }
    },
    [commitMealTime, resolveHourFromPointerEvent],
  );

  const finishGhostDrag = useCallback(
    (event) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      dragPointerIdRef.current = null;
      setIsDragging(false);
      const hour = resolveHourFromPointerEvent(event) ?? dragLiveTime;
      setDragLiveTime(null);
      commitMealTime(hour, true);
      window.setTimeout(() => {
        suppressTrackClickRef.current = false;
      }, 0);
    },
    [commitMealTime, dragLiveTime, resolveHourFromPointerEvent],
  );

  const isInteractive = typeof onMealTimeChange === 'function';

  return (
    <div className="timeline-strip-container relative flex w-full items-center">
      <div
        ref={trackRef}
        className={`timeline-nodes-strip relative flex w-full items-center ${isInteractive ? 'cursor-pointer' : ''}`}
        style={kentuTimelineStripStyle(true)}
        role="slider"
        aria-label="Kentu Timeline: tocca la barra per impostare l'orario del pasto"
        aria-valuemin={0}
        aria-valuemax={24}
        aria-valuenow={safeDisplayHour}
        onClick={handleTrackClick}
      >
        <div aria-hidden style={kentuTimelineAxisStyle()} />

        {batches.map((batch) => (
          <LoggedMealNode key={batch.id} batch={batch} />
        ))}

        <GhostMealNode
          leftPercent={ghostLeft}
          timeLabel={ghostTimeLabel}
          isDragging={isDragging}
          onPointerDown={handleGhostPointerDown}
          onPointerMove={handleGhostPointerMove}
          onPointerUp={finishGhostDrag}
          onPointerCancel={finishGhostDrag}
        />

        {batches.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] text-slate-600">Trascina o tocca per impostare l&apos;orario</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function TodayMealsTimeline({
  fullHistory,
  todayLog = null,
  currentMealTime = null,
  onMealTimeChange,
  manualOverrideRef = null,
  className = '',
}) {
  const batches = useMemo(() => {
    try {
      const result = collectTodayMealBatches(fullHistory, { todayLog });
      return Array.isArray(result) ? result : [];
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn('[TodayMealsTimeline] collectTodayMealBatches failed', error);
      }
      return [];
    }
  }, [fullHistory, todayLog]);

  return (
    <section
      className={`block w-full shrink-0 pb-2 ${className}`}
      style={{ paddingTop: KENTU_TIMELINE.label.sectionPaddingTopPx }}
      aria-label="Kentu Timeline pasti di oggi"
    >
      <KentuTimelineBar
        batches={batches}
        currentMealTime={currentMealTime}
        onMealTimeChange={onMealTimeChange}
        manualOverrideRef={manualOverrideRef}
      />
    </section>
  );
}
