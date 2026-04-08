import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import {
  buildTimelineNodeQualityMap,
  qualityAtVirtualStripHour,
  qualityShadowForState,
  TIMELINE_QUALITY_SHADOW,
} from './timelineNodeQuality';

const SUBTLE_SPRING = { type: 'spring', stiffness: 420, damping: 26, mass: 0.85 };

function combineBoxShadow(base, qualityLayer) {
  const b = base && base !== 'none' ? base : null;
  const q = qualityLayer && qualityLayer !== 'none' ? qualityLayer : null;
  if (!q) return b || 'none';
  if (!b) return q;
  return `${b}, ${q}`;
}

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

/** Drag fraction along timeline (0–1); invalid values → 0 so the node stays on-strip. */
function clampTimelineDragPercent(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** 0–1 fraction along 24h strip → snap to nearest 15 min for drag preview only (state keeps raw percent). */
function snapTimelineDragPercentForDisplay(percent) {
  const p = clampTimelineDragPercent(percent);
  return Math.round(p * 24 * 4) / 4 / 24;
}

/** Distanza in px entro cui la timeline “attira” verso fasce orarie consigliate (soft, si esce trascinando oltre). */
const MAGNETIC_SNAP_THRESHOLD_PX = 20;

/**
 * Centri (ore decimali 0–24) per attrazione magnetica durante il drag.
 * Non vincolano il commit se l’utente esce dalla soglia.
 */
function getMagneticAnchorDecimalHours(node) {
  if (!node || typeof node !== 'object') return [];
  const t = node.type;
  if (t === 'meal' || t === 'ghost_meal') {
    return [7.5, 12.5, 16, 19.5];
  }
  if (t === 'work' || t === 'workout' || t === 'ghost_workout') {
    return [9.5, 12, 18];
  }
  if (t === 'cognitive') {
    return [10, 15, 20];
  }
  return [];
}

/**
 * Attrazione morbida verso l’ancora più vicina in ore; oltre `thresholdPx` nessun effetto.
 * @returns {{ percent: number, magneticActive: boolean }}
 */
function applyMagneticTimelineSnap(rawPercent, stripWidthPx, node, thresholdPx, reduceMotion) {
  const p = clampTimelineDragPercent(rawPercent);
  if (reduceMotion || !(stripWidthPx > 0) || !node) {
    return { percent: p, magneticActive: false };
  }
  const anchors = getMagneticAnchorDecimalHours(node);
  if (anchors.length === 0) return { percent: p, magneticActive: false };

  const rawHour = p * 24;
  let bestH = anchors[0];
  let bestDistH = Math.abs(rawHour - bestH);
  for (let i = 1; i < anchors.length; i++) {
    const d = Math.abs(rawHour - anchors[i]);
    if (d < bestDistH) {
      bestDistH = d;
      bestH = anchors[i];
    }
  }
  const anchorPercent = clampTimelineDragPercent(bestH / 24);
  const distPx = Math.abs(p - anchorPercent) * stripWidthPx;
  if (distPx >= thresholdPx) {
    return { percent: p, magneticActive: false };
  }
  const u = distPx / thresholdPx;
  const strength = (1 - u) ** 1.35;
  const blended = clampTimelineDragPercent(p + (anchorPercent - p) * strength);
  return { percent: blended, magneticActive: strength > 0.08 };
}

/**
 * Tap veloce: non committare orario se spostamento < MIN px e (durata ≤ MAX ms o MAX ≤ 0).
 * - MAX ≤ 0: ignora solo la durata (resta il filtro sul movimento).
 * - MIN = 0: disattiva del tutto il filtro “tap” (solo commit dedup / click guard restano).
 */
const STRIP_DRAG_TAP_MAX_MS = 160;
const STRIP_DRAG_MIN_MOVE_PX = 6;
/** Dedup commit ravvicinati (pointerup + mouseup, doppie chiamate). */
const STRIP_DRAG_COMMIT_DEDUP_MS = 450;
/** Quanto il nodo “segue” il dito (1 = istantaneo). Più basso in zona subottima → attrito / resistenza morbida. */
const STRIP_DRAG_FRICTION_FOLLOW = { suboptimal: 0.36, neutral: 0.78, optimal: 0.92 };
/** Attiva il drag sulla striscia solo dopo long-press (stesso ordine di grandezza di `startNodeDrag` in SalaComandi). */
const STRIP_DRAG_ARM_LONG_PRESS_MS = 180;
/** Long-press nodo + annullamento arm striscia su swipe: stessa soglia px. */
const LONG_PRESS_MS = 180;
const MOVE_THRESHOLD_PX = 6;

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
  /**
   * Serie grafico giornata (stessi punti del ComposedChart) per campioni fisiologici sui nodi.
   * Se assente, lo stato qualità resta neutro.
   */
  timelineQualityChartData,
  /** Commit nuovo orario (ore decimali 0–24) al mouseup dopo drag locale. */
  updateMealTime,
  /** Inizio drag striscia: reset anteprima / performance guard (opzionale). */
  onStripDragChartPreviewStart,
  /** Anteprima curve durante drag: `(nodeId, hourDecimal)` — debounce lato parent (~24ms). */
  onStripDragChartPreview,
  /** Fine drag: invalida anteprima prima del commit. */
  onStripDragChartPreviewEnd,
}) {
  const reduceMotion = useReducedMotion();
  const [nowDecimalHour, setNowDecimalHour] = useState(() => getWallClockDecimalHour());
  const [draggingId, setDraggingId] = useState(null);
  const [dragX, setDragX] = useState(null);
  const [magneticSnapActive, setMagneticSnapActive] = useState(false);
  /** Durante l’attesa long-press: `touch-action: pan-x pan-y` così swipe/scroll non restano bloccati da `none`. */
  const [stripArmPendingId, setStripArmPendingId] = useState(null);
  const dragXRef = useRef(null);
  const containerRef = useRef(null);
  const stripArmPendingRef = useRef(null);
  const stripDragArmTimerRef = useRef(null);
  const stripArmDocCleanupRef = useRef(null);
  const stripDragDownAtRef = useRef(0);
  const stripDragStartClientXRef = useRef(null);
  const stripDragMaxDeltaPxRef = useRef(0);
  const stripDragPointerIdRef = useRef(null);
  const stripDragCaptureElRef = useRef(null);
  const stripDragLastCommitRef = useRef({ id: null, hour: null, at: 0 });
  const stripDragSuppressClickRef = useRef(false);
  /** Nodo della striscia in drag (tipo → fasce magnetiche). */
  const stripDragNodeRef = useRef(null);
  const magneticSnapActiveRef = useRef(false);
  const nodes = activeNodesWithStack ?? [];
  /** Frazione 0–1 lungo striscia: smoothing durante drag (resistenza in zone subottime). */
  const stripDragSmoothedFracRef = useRef(null);
  const stripDragLastFrictionQRef = useRef(null);
  const nodesForFrictionRef = useRef(nodes);
  nodesForFrictionRef.current = nodes;
  const chartForFrictionRef = useRef(timelineQualityChartData);
  chartForFrictionRef.current = timelineQualityChartData;
  const longPressTimerRef = useRef(null);
  const longPressActiveRef = useRef(false);
  const pointerStartPosRef = useRef(null);
  const longPressNodeDocCleanupRef = useRef(null);

  const qualityById = useMemo(
    () => buildTimelineNodeQualityMap(nodes, timelineQualityChartData),
    [nodes, timelineQualityChartData]
  );

  const cancelNodeLongPressArming = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressNodeDocCleanupRef.current?.();
    longPressNodeDocCleanupRef.current = null;
    longPressActiveRef.current = false;
    pointerStartPosRef.current = null;
  }, []);

  const scheduleStartNodeDragAfterLongPress = useCallback(
    (node, edge, e) => {
      if (!e || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (typeof startNodeDrag !== 'function') return;
      cancelNodeLongPressArming();

      const pointerId = e.pointerId;
      const startX = typeof e.clientX === 'number' ? e.clientX : null;
      const startY = typeof e.clientY === 'number' ? e.clientY : null;
      if (!Number.isFinite(startX) || !Number.isFinite(startY)) {
        pointerStartPosRef.current = null;
        longPressActiveRef.current = false;
        return;
      }

      pointerStartPosRef.current = { clientX: startX, clientY: startY };
      longPressActiveRef.current = false;

      const onDocMove = (ev) => {
        if (longPressActiveRef.current) return;
        if (longPressTimerRef.current == null) return;
        if (pointerId != null && ev.pointerId !== pointerId) return;
        const origin = pointerStartPosRef.current;
        if (!origin || !Number.isFinite(origin.clientX) || !Number.isFinite(origin.clientY)) return;
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        const dist = Math.hypot(cx - origin.clientX, cy - origin.clientY);
        if (dist > MOVE_THRESHOLD_PX) {
          cancelNodeLongPressArming();
        }
      };

      const onDocEnd = (ev) => {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        cancelNodeLongPressArming();
      };

      document.addEventListener('pointermove', onDocMove, { capture: true, passive: true });
      document.addEventListener('pointerup', onDocEnd, { capture: true });
      document.addEventListener('pointercancel', onDocEnd, { capture: true });

      longPressNodeDocCleanupRef.current = () => {
        document.removeEventListener('pointermove', onDocMove, { capture: true });
        document.removeEventListener('pointerup', onDocEnd, { capture: true });
        document.removeEventListener('pointercancel', onDocEnd, { capture: true });
        longPressNodeDocCleanupRef.current = null;
      };

      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressNodeDocCleanupRef.current?.();
        longPressNodeDocCleanupRef.current = null;
        longPressActiveRef.current = true;
        const pos = pointerStartPosRef.current;
        startNodeDrag(node, edge)(e, {
          skipInnerLongPressDelay: true,
          clientX0: pos?.clientX,
          clientY0: pos?.clientY,
        });
      }, LONG_PRESS_MS);
    },
    [startNodeDrag, cancelNodeLongPressArming]
  );

  const cancelStripDragArm = useCallback(() => {
    const p = stripArmPendingRef.current;
    if (p) p.alive = false;
    stripArmPendingRef.current = null;
    if (stripDragArmTimerRef.current != null) {
      window.clearTimeout(stripDragArmTimerRef.current);
      stripDragArmTimerRef.current = null;
    }
    stripArmDocCleanupRef.current?.();
    stripArmDocCleanupRef.current = null;
    setStripArmPendingId(null);
  }, []);

  const activateTimelineStripDrag = useCallback((node, pe) => {
    if (!node || !pe) return;
    stripDragSuppressClickRef.current = false;
    stripDragDownAtRef.current = performance.now();
    stripDragStartClientXRef.current = typeof pe.clientX === 'number' ? pe.clientX : null;
    stripDragMaxDeltaPxRef.current = 0;
    stripDragPointerIdRef.current = pe.pointerId != null ? pe.pointerId : null;
    stripDragCaptureElRef.current = pe.currentTarget;
    stripDragNodeRef.current = node;
    magneticSnapActiveRef.current = false;
    setMagneticSnapActive(false);
    const t0 = Number(node.time);
    stripDragSmoothedFracRef.current = clampTimelineDragPercent(
      (Number.isFinite(t0) ? t0 : 0) / 24
    );
    stripDragLastFrictionQRef.current = null;
    try {
      if (typeof pe.currentTarget?.setPointerCapture === 'function' && pe.pointerId != null) {
        pe.currentTarget.setPointerCapture(pe.pointerId);
      }
    } catch {
      /* ignore */
    }
    setDraggingId(node.id);
    document.body.style.userSelect = 'none';
    if (typeof onStripDragChartPreviewStart === 'function') onStripDragChartPreviewStart();
  }, [onStripDragChartPreviewStart]);

  const scheduleStripArmAfterLongPress = useCallback(
    (node, e) => {
      if (!e || (e.pointerType === 'mouse' && e.button !== 0)) return;
      cancelStripDragArm();

      const pointerId = e.pointerId;
      const captureEl = e.currentTarget;
      const startX = typeof e.clientX === 'number' ? e.clientX : null;
      const startY = typeof e.clientY === 'number' ? e.clientY : null;

      const pending = {
        node,
        pointerId: pointerId != null ? pointerId : null,
        captureEl,
        startX,
        startY,
        alive: true,
      };
      stripArmPendingRef.current = pending;
      setStripArmPendingId(node.id);

      const onDocMove = (ev) => {
        if (!pending.alive) return;
        if (pending.pointerId != null && ev.pointerId !== pending.pointerId) return;
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (
          !Number.isFinite(startX) ||
          !Number.isFinite(startY) ||
          !Number.isFinite(cx) ||
          !Number.isFinite(cy)
        ) {
          return;
        }
        const dist = Math.hypot(cx - startX, cy - startY);
        if (dist > MOVE_THRESHOLD_PX) {
          cancelStripDragArm();
        }
      };

      const onDocEnd = (ev) => {
        if (pending.pointerId != null && ev.pointerId !== pending.pointerId) return;
        cancelStripDragArm();
      };

      // Capture: vediamo il move anche con target annidati; niente preventDefault → il gesto può diventare scroll/swipe.
      document.addEventListener('pointermove', onDocMove, { capture: true, passive: true });
      document.addEventListener('pointerup', onDocEnd, { capture: true });
      document.addEventListener('pointercancel', onDocEnd, { capture: true });

      stripArmDocCleanupRef.current = () => {
        document.removeEventListener('pointermove', onDocMove, { capture: true });
        document.removeEventListener('pointerup', onDocEnd, { capture: true });
        document.removeEventListener('pointercancel', onDocEnd, { capture: true });
        stripArmDocCleanupRef.current = null;
      };

      stripDragArmTimerRef.current = window.setTimeout(() => {
        stripDragArmTimerRef.current = null;
        if (!pending.alive || stripArmPendingRef.current !== pending) return;
        stripArmDocCleanupRef.current?.();
        stripArmDocCleanupRef.current = null;
        stripArmPendingRef.current = null;
        pending.alive = false;
        setStripArmPendingId(null);

        activateTimelineStripDrag(node, {
          clientX: startX,
          pointerId,
          currentTarget: captureEl,
        });
      }, STRIP_DRAG_ARM_LONG_PRESS_MS);
    },
    [cancelStripDragArm, activateTimelineStripDrag]
  );

  const handleNodePointerEnd = useCallback(
    (ev) => {
      cancelNodeLongPressArming();
      cancelStripDragArm();
      if (typeof releaseNodePointer === 'function') releaseNodePointer(ev);
    },
    [cancelNodeLongPressArming, cancelStripDragArm, releaseNodePointer]
  );

  useEffect(() => {
    return () => {
      const p = stripArmPendingRef.current;
      if (p) p.alive = false;
      stripArmPendingRef.current = null;
      if (stripDragArmTimerRef.current != null) {
        window.clearTimeout(stripDragArmTimerRef.current);
        stripDragArmTimerRef.current = null;
      }
      stripArmDocCleanupRef.current?.();
      stripArmDocCleanupRef.current = null;
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressNodeDocCleanupRef.current?.();
      longPressNodeDocCleanupRef.current = null;
    };
  }, []);

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
    if (!draggingId) return undefined;

    let ended = false;

    function handleMove(e) {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const w = rect.width;
      if (!(w > 0)) return;

      const clientX = e.clientX;
      if (!Number.isFinite(clientX)) return;

      const startX = stripDragStartClientXRef.current;
      if (typeof startX === 'number' && Number.isFinite(startX)) {
        stripDragMaxDeltaPxRef.current = Math.max(
          stripDragMaxDeltaPxRef.current,
          Math.abs(clientX - startX)
        );
      }

      const x = clientX - rect.left;
      let percent = x / w;
      percent = Math.max(0, Math.min(1, percent));

      const nodeDrag = stripDragNodeRef.current;
      const { percent: magnetP, magneticActive } = applyMagneticTimelineSnap(
        percent,
        w,
        nodeDrag,
        MAGNETIC_SNAP_THRESHOLD_PX,
        reduceMotion
      );

      let smoothed = stripDragSmoothedFracRef.current;
      if (!Number.isFinite(smoothed)) {
        smoothed = clampTimelineDragPercent(magnetP);
      }

      let q = 'neutral';
      if (!reduceMotion && nodeDrag) {
        q = qualityAtVirtualStripHour(
          nodeDrag,
          nodesForFrictionRef.current,
          chartForFrictionRef.current,
          magnetP * 24
        );
      }

      const follow = reduceMotion
        ? 1
        : q === 'suboptimal'
          ? STRIP_DRAG_FRICTION_FOLLOW.suboptimal
          : q === 'neutral'
            ? STRIP_DRAG_FRICTION_FOLLOW.neutral
            : STRIP_DRAG_FRICTION_FOLLOW.optimal;

      smoothed = clampTimelineDragPercent(smoothed + (magnetP - smoothed) * follow);
      stripDragSmoothedFracRef.current = smoothed;

      if (
        !reduceMotion &&
        nodeDrag &&
        q === 'suboptimal' &&
        stripDragLastFrictionQRef.current !== 'suboptimal'
      ) {
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(4);
          }
        } catch {
          /* ignore */
        }
      }
      stripDragLastFrictionQRef.current = q;

      const displayPercent = snapTimelineDragPercentForDisplay(smoothed);

      dragXRef.current = displayPercent;
      setDragX(displayPercent);
      if (magneticSnapActiveRef.current !== magneticActive) {
        magneticSnapActiveRef.current = magneticActive;
        setMagneticSnapActive(magneticActive);
      }

      const n = stripDragNodeRef.current;
      if (n != null && typeof onStripDragChartPreview === 'function') {
        onStripDragChartPreview(n.id, displayPercent * 24);
      }
    }

    function handleUp() {
      if (ended) return;
      ended = true;

      if (typeof onStripDragChartPreviewEnd === 'function') onStripDragChartPreviewEnd();

      const capEl = stripDragCaptureElRef.current;
      const pid = stripDragPointerIdRef.current;
      stripDragCaptureElRef.current = null;
      stripDragPointerIdRef.current = null;
      try {
        if (capEl && typeof capEl.releasePointerCapture === 'function' && pid != null) {
          capEl.releasePointerCapture(pid);
        }
      } catch {
        /* ignore */
      }

      document.body.style.userSelect = '';

      const rawX = dragXRef.current;
      const elapsed = performance.now() - stripDragDownAtRef.current;
      const maxD = stripDragMaxDeltaPxRef.current;
      const shortPress =
        STRIP_DRAG_TAP_MAX_MS > 0 ? elapsed <= STRIP_DRAG_TAP_MAX_MS : false;
      const tapLike = maxD < STRIP_DRAG_MIN_MOVE_PX && (STRIP_DRAG_TAP_MAX_MS <= 0 || shortPress);

      if (!tapLike && rawX != null && typeof updateMealTime === 'function') {
        const hour = clampTimelineDragPercent(rawX) * 24;
        const nowT = performance.now();
        const prev = stripDragLastCommitRef.current;
        const duplicate =
          prev &&
          prev.id === draggingId &&
          Math.abs(prev.hour - hour) < 1e-4 &&
          nowT - prev.at < STRIP_DRAG_COMMIT_DEDUP_MS;
        if (!duplicate) {
          stripDragLastCommitRef.current = { id: draggingId, hour, at: nowT };
          updateMealTime(draggingId, hour);
          stripDragSuppressClickRef.current = true;
        }
      }

      stripDragNodeRef.current = null;
      magneticSnapActiveRef.current = false;
      setMagneticSnapActive(false);
      stripDragSmoothedFracRef.current = null;
      stripDragLastFrictionQRef.current = null;
      setDraggingId(null);
      setDragX(null);
      dragXRef.current = null;
    }

    document.addEventListener('pointermove', handleMove, { capture: true });
    document.addEventListener('pointerup', handleUp, { capture: true });
    document.addEventListener('pointercancel', handleUp, { capture: true });
    document.addEventListener('mousemove', handleMove, { capture: true });
    document.addEventListener('mouseup', handleUp, { capture: true });

    return () => {
      document.removeEventListener('pointermove', handleMove, { capture: true });
      document.removeEventListener('pointerup', handleUp, { capture: true });
      document.removeEventListener('pointercancel', handleUp, { capture: true });
      document.removeEventListener('mousemove', handleMove, { capture: true });
      document.removeEventListener('mouseup', handleUp, { capture: true });
      const capEl = stripDragCaptureElRef.current;
      const pid = stripDragPointerIdRef.current;
      try {
        if (capEl && typeof capEl.releasePointerCapture === 'function' && pid != null) {
          capEl.releasePointerCapture(pid);
        }
      } catch {
        /* ignore */
      }
      document.body.style.userSelect = '';
      stripDragNodeRef.current = null;
      magneticSnapActiveRef.current = false;
      stripDragSmoothedFracRef.current = null;
      stripDragLastFrictionQRef.current = null;
    };
  }, [draggingId, updateMealTime, reduceMotion, onStripDragChartPreview, onStripDragChartPreviewEnd]);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  const onTimelineNodeClick = useCallback(
    (node) => (e) => {
      e.stopPropagation();
      if (stripDragSuppressClickRef.current) {
        stripDragSuppressClickRef.current = false;
        return;
      }
      if (typeof onNodeClick === 'function') onNodeClick(node, e);
      else if (typeof handleNodeTap === 'function') handleNodeTap(node)(e);
    },
    [onNodeClick, handleNodeTap]
  );

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
            const isStripDragging = draggingId === node.id;
            const isActiveDrag = isDragging || isStripDragging;
            const stripMagneticOn = magneticSnapActive && draggingId === node.id && !reduceMotion;
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
                  ? clampTimelineDragPercent(dragX)
                  : clampTimelineDragPercent(getTimePositionPercent(timeHours) / 100);
              return `${clampTimelineDragPercent(percent) * 100}%`;
            };
            const cognitiveIcon = node.subType === 'studio' ? '📚' : '💻';
            const cognitiveBg = 'rgba(0, 229, 255, 0.15)';
            const cognitiveBorder = '#00e5ff';

            if (isWork) {
              const dragEdge = isDragging ? draggingNode?.edge : null;
              const left = nodeLeftPercentStr(barStartHour);
              const barScale = isActiveDrag ? 1.2 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
              const barScaleDraw = barScale * (stripMagneticOn ? 1.08 : 1);
              const barOpacity = isActiveDrag ? 1 : (importanceStyle.opacity ?? 1);
              const workStripShadow =
                isStripDragging && stripMagneticOn
                  ? '0 0 22px rgba(255, 234, 0, 0.52), 0 0 42px rgba(255, 68, 68, 0.24)'
                  : null;
              const qStateWork = qualityById.get(node.id) ?? 'neutral';
              const qualityEligibleWork = !isActiveDrag && !isStripDragging && !isTouchingOrDragging;
              const qWorkPulse =
                qualityEligibleWork && !reduceMotion && qStateWork === 'suboptimal'
                  ? [TIMELINE_QUALITY_SHADOW.suboptimalLo, TIMELINE_QUALITY_SHADOW.suboptimalHi]
                  : null;
              const qWorkRest =
                qualityEligibleWork && !qWorkPulse ? qualityShadowForState(qStateWork, reduceMotion) : null;
              const workBarTransition =
                qWorkPulse && !isActiveDrag
                  ? {
                      opacity: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                      scale: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                      y: { duration: 0.18, ease: 'easeOut' },
                      boxShadow: { duration: 2.7, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
                    }
                  : nodeAddTransition(reduceMotion, isActiveDrag);
              return (
                <motion.div
                  key={node.id}
                  className={`timeline-node timeline-node--quality-${qStateWork} ${isActiveDrag ? 'is-dragging' : ''}${stripMagneticOn ? ' timeline-node--magnetic-snap' : ''}`}
                  onPointerDown={(e) => {
                    scheduleStripArmAfterLongPress(node, e);
                    scheduleStartNodeDragAfterLongPress(node, 'all', e);
                  }}
                  onPointerUp={handleNodePointerEnd}
                  onPointerCancel={handleNodePointerEnd}
                  onClick={onTimelineNodeClick(node)}
                  initial={reduceMotion ? false : { opacity: barOpacity, scale: barScaleDraw * 0.8 }}
                  animate={{
                    opacity: barOpacity,
                    scale: barScaleDraw,
                    y: isDragging ? dragY - 45 : 0,
                    boxShadow:
                      reduceMotion
                        ? workStripShadow ||
                          (isActiveDrag ? 'none' : qualityEligibleWork && qWorkRest ? qWorkRest : 'none')
                        : workStripShadow
                          ? workStripShadow
                          : isActiveDrag
                            ? 'none'
                            : qWorkPulse
                              ? qWorkPulse
                              : qWorkRest
                                ? [WORK_ADD_GLOW_PULSE, qWorkRest]
                                : [WORK_ADD_GLOW_PULSE, 'none'],
                  }}
                  transition={workBarTransition}
                  whileHover={!isActiveDrag ? { scale: barScale * 1.04, transition: SUBTLE_SPRING } : undefined}
                  whileTap={
                    !isActiveDrag
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
                    background: isActiveDrag ? 'rgba(255, 234, 0, 0.3)' : 'rgba(255, 234, 0, 0.15)',
                    borderLeft: '2px solid #ffea00',
                    borderRight: '2px solid #ffea00',
                    borderRadius: '4px',
                    cursor: isActiveDrag ? 'grabbing' : 'grab',
                    touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none',
                    pointerEvents: isNodeFocused ? 'auto' : 'none',
                    ...(isActiveDrag ? {} : importanceStyle),
                    zIndex: isActiveDrag ? 10 : (isTouchingOrDragging ? 100 : 2),
                  }}
                >
                  <div onPointerDown={(e) => { scheduleStripArmAfterLongPress(node, e); scheduleStartNodeDragAfterLongPress(node, 'start', e); }} onPointerUp={handleNodePointerEnd} onPointerCancel={handleNodePointerEnd} onClick={onTimelineNodeClick(node)} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    💼
                  </div>
                  <div onPointerDown={(e) => { scheduleStripArmAfterLongPress(node, e); scheduleStartNodeDragAfterLongPress(node, 'end', e); }} onPointerUp={handleNodePointerEnd} onPointerCancel={handleNodePointerEnd} onClick={onTimelineNodeClick(node)} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none' }}>
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
              const barScale = isActiveDrag ? 1.2 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
              const barScaleDraw = barScale * (stripMagneticOn ? 1.08 : 1);
              const barOpacity = isActiveDrag ? 1 : (importanceStyle.opacity ?? 1);
              const cogStripShadow =
                isStripDragging && stripMagneticOn
                  ? '0 0 22px rgba(0, 229, 255, 0.5), 0 0 40px rgba(182, 102, 210, 0.28)'
                  : null;
              const qStateCog = qualityById.get(node.id) ?? 'neutral';
              const qualityEligibleCog = !isActiveDrag && !isStripDragging && !isTouchingOrDragging;
              const qCogPulse =
                qualityEligibleCog && !reduceMotion && qStateCog === 'suboptimal'
                  ? [TIMELINE_QUALITY_SHADOW.suboptimalLo, TIMELINE_QUALITY_SHADOW.suboptimalHi]
                  : null;
              const qCogRest =
                qualityEligibleCog && !qCogPulse ? qualityShadowForState(qStateCog, reduceMotion) : null;
              const cogBarTransition =
                qCogPulse && !isActiveDrag
                  ? {
                      opacity: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                      scale: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                      y: { duration: 0.18, ease: 'easeOut' },
                      boxShadow: { duration: 2.7, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
                    }
                  : nodeAddTransition(reduceMotion, isActiveDrag);
              return (
                <motion.div
                  key={node.id}
                  className={`timeline-node timeline-node--quality-${qStateCog} ${isActiveDrag ? 'is-dragging' : ''}${stripMagneticOn ? ' timeline-node--magnetic-snap' : ''}`}
                  onPointerDown={(e) => {
                    scheduleStripArmAfterLongPress(node, e);
                    scheduleStartNodeDragAfterLongPress(node, 'all', e);
                  }}
                  onPointerUp={handleNodePointerEnd}
                  onPointerCancel={handleNodePointerEnd}
                  onClick={onTimelineNodeClick(node)}
                  initial={reduceMotion ? false : { opacity: barOpacity, scale: barScaleDraw * 0.8 }}
                  animate={{
                    opacity: barOpacity,
                    scale: barScaleDraw,
                    y: isDragging ? dragY - 45 : 0,
                    boxShadow:
                      reduceMotion
                        ? cogStripShadow ||
                          (isActiveDrag ? 'none' : qualityEligibleCog && qCogRest ? qCogRest : 'none')
                        : cogStripShadow
                          ? cogStripShadow
                          : isActiveDrag
                            ? 'none'
                            : qCogPulse
                              ? qCogPulse
                              : qCogRest
                                ? [COG_ADD_GLOW_PULSE, qCogRest]
                                : [COG_ADD_GLOW_PULSE, 'none'],
                  }}
                  transition={cogBarTransition}
                  whileHover={!isActiveDrag ? { scale: barScale * 1.04, transition: SUBTLE_SPRING } : undefined}
                  whileTap={
                    !isActiveDrag
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
                    background: isActiveDrag ? 'rgba(0, 229, 255, 0.3)' : cognitiveBg,
                    borderLeft: `2px solid ${cognitiveBorder}`,
                    borderRight: `2px solid ${cognitiveBorder}`,
                    borderRadius: '4px',
                    cursor: isActiveDrag ? 'grabbing' : 'grab',
                    touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none',
                    pointerEvents: isNodeFocused ? 'auto' : 'none',
                    ...(isActiveDrag ? {} : importanceStyle),
                    zIndex: isActiveDrag ? 10 : (isTouchingOrDragging ? 100 : 2),
                  }}
                >
                  <div onPointerDown={(e) => { scheduleStripArmAfterLongPress(node, e); scheduleStartNodeDragAfterLongPress(node, 'start', e); }} onPointerUp={handleNodePointerEnd} onPointerCancel={handleNodePointerEnd} onClick={onTimelineNodeClick(node)} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none' }}>
                    {(dragEdge === 'start' || dragEdge === 'all') && (
                      <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: cognitiveBorder, color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                      </div>
                    )}
                    {cognitiveIcon}
                  </div>
                  <div onPointerDown={(e) => { scheduleStripArmAfterLongPress(node, e); scheduleStartNodeDragAfterLongPress(node, 'end', e); }} onPointerUp={handleNodePointerEnd} onPointerCancel={handleNodePointerEnd} onClick={onTimelineNodeClick(node)} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: `2px solid ${cognitiveBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none' }}>
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
            const baseScale = isActiveDrag ? 1.2 : (isTouchingOrDragging ? 1.4 : (isImportant ? 1 : 0.8));
            const pointScaleDraw = baseScale * (stripMagneticOn ? 1.08 : 1);
            const targetOpacity = ghostVisual
              ? (isTouchingOrDragging ? 0.82 : 0.6)
              : isActiveDrag
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
            const mealWorkoutMagneticShadow =
              isStripDragging && stripMagneticOn && isMealPoint
                ? '0 0 26px rgba(0, 229, 255, 0.58), 0 0 48px rgba(255, 255, 255, 0.12)'
                : isStripDragging && stripMagneticOn && isWorkoutPoint
                  ? '0 0 26px rgba(255, 68, 68, 0.52), 0 0 44px rgba(255, 234, 0, 0.22)'
                  : null;
            const qStatePoint = qualityById.get(node.id) ?? 'neutral';
            const qualityEligiblePoint = !isActiveDrag && !isStripDragging && !isTouchingOrDragging;
            const qPointPulse =
              qualityEligiblePoint && !reduceMotion && qStatePoint === 'suboptimal'
                ? [TIMELINE_QUALITY_SHADOW.suboptimalLo, TIMELINE_QUALITY_SHADOW.suboptimalHi]
                : null;
            const qPointRest =
              qualityEligiblePoint && !qPointPulse ? qualityShadowForState(qStatePoint, reduceMotion) : null;
            const pointQualityTransition =
              qPointPulse && !isActiveDrag
                ? {
                    opacity: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                    scale: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                    x: { duration: NODE_ADD_DURATION, ease: NODE_ADD_EASE },
                    y: { duration: 0.18, ease: 'easeOut' },
                    boxShadow: { duration: 2.7, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
                  }
                : nodeAddTransition(reduceMotion, isActiveDrag);
            const pointZ = isActiveDrag ? 10 : isTouchingOrDragging ? 100 : ghostVisual ? 9 : (importanceStyle.zIndex ?? 2);
            const left = nodeLeftPercentStr(displayTimeVal);
            return (
              <motion.div
                key={node.id}
                className={`timeline-node meal-node timeline-node--quality-${qStatePoint} ${isActiveDrag ? 'is-dragging' : ''} ${ghostVisual ? 'ghost-node' : ''}${stripMagneticOn ? ' timeline-node--magnetic-snap' : ''}`}
                onPointerDown={(e) => {
                  scheduleStripArmAfterLongPress(node, e);
                  scheduleStartNodeDragAfterLongPress(node, 'all', e);
                }}
                onPointerUp={handleNodePointerEnd}
                onPointerCancel={handleNodePointerEnd}
                onClick={onTimelineNodeClick(node)}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: targetOpacity, scale: pointScaleDraw * 0.8, x: '-50%' }
                }
                animate={{
                  opacity: targetOpacity,
                  scale: pointScaleDraw,
                  x: '-50%',
                  y: isDragging ? dragY - 45 : 0,
                  boxShadow: reduceMotion
                    ? combineBoxShadow(pointBoxShadow, qPointRest || undefined)
                    : mealWorkoutMagneticShadow
                      ? mealWorkoutMagneticShadow
                      : isActiveDrag
                        ? pointBoxShadow
                        : qPointPulse
                          ? qPointPulse
                          : qPointRest
                            ? [POINT_ADD_GLOW_PULSE, combineBoxShadow(pointBoxShadow, qPointRest)]
                            : [POINT_ADD_GLOW_PULSE, pointBoxShadow],
                }}
                transition={pointQualityTransition}
                whileHover={!isActiveDrag ? { scale: baseScale * 1.1, transition: SUBTLE_SPRING } : undefined}
                whileTap={
                  !isActiveDrag
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
                  cursor: isActiveDrag ? 'grabbing' : 'grab',
                  touchAction: stripArmPendingId === node.id ? 'pan-x pan-y' : 'none',
                  pointerEvents: isNodeFocused || isGhostMeal || isGhostWorkout ? 'auto' : 'none',
                  zIndex: pointZ,
                  filter: ghostVisual ? 'none' : importanceStyle.filter,
                  transition: isActiveDrag ? 'none' : 'left 0.3s ease-out, background 0.15s, box-shadow 0.2s ease',
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