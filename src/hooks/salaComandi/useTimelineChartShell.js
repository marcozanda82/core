/**
 * Shell grafico timeline: zoom, pinch, pan, unità chart, preview strip debounced.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHART_AXIS_GUTTER_LEFT_PX,
  CHART_AXIS_GUTTER_RIGHT_PX,
  getTimePositionPercent,
} from '../../timeLayout';
import { getTodayString, generateCalorieTimeline, generateRealEnergyData } from '../../coreEngine';
import { applyTimelineStripHourToPreviewInputs } from '../../timelineDragPreview';

export const TIMELINE_DEFAULT_VIEWPORT_HOURS = 12;
export const TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1 = (24 / TIMELINE_DEFAULT_VIEWPORT_HOURS) * 100;

/**
 * @param {{
 *   currentTime?: number,
 *   currentTrackerDate?: string|null,
 *   activeBottomTab?: string,
 *   userProfileLevel?: string|null,
 *   simulationMode?: boolean,
 *   isSimulationMode?: boolean,
 *   sleepStatus?: string|null,
 * }} params
 */
export function useTimelineChartShell({
  currentTime = 0,
  currentTrackerDate = null,
  activeBottomTab = 'oggi',
  userProfileLevel = null,
  simulationMode = false,
  isSimulationMode = false,
  sleepStatus = null,
} = {}) {
  const [chartUnit, setChartUnit] = useState('percent');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timelineStripPreview, setTimelineStripPreview] = useState(null);
  const [isChartTooltipActive, setIsChartTooltipActive] = useState(false);

  const chartScrollRef = useRef(null);
  const chartTouchTimerRef = useRef(null);
  const initialPinchDistance = useRef(null);
  const initialZoomLevel = useRef(1);

  const timelineStripPreviewGenRef = useRef(0);
  const timelineStripPreviewDebounceRef = useRef(null);
  const timelineStripPreviewLatestRef = useRef(null);
  const timelineStripPreviewSlowRef = useRef(0);
  const timelineStripPreviewDisabledRef = useRef(false);
  const timelineStripPreviewDepsRef = useRef({});

  const centerCurrentTime = useCallback(() => {
    if (!chartScrollRef.current) return;
    const container = chartScrollRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    if (clientWidth <= 0 || scrollWidth <= clientWidth) return;

    if (currentTrackerDate === getTodayString()) {
      const chartWidth =
        scrollWidth - CHART_AXIS_GUTTER_LEFT_PX - CHART_AXIS_GUTTER_RIGHT_PX;
      const timePos = (getTimePositionPercent(currentTime) / 100) * chartWidth;
      const targetScroll = timePos - clientWidth * 0.5;
      const maxScroll = Math.max(0, scrollWidth - clientWidth);
      container.scrollLeft = Math.max(0, Math.min(targetScroll, maxScroll));
    } else {
      container.scrollLeft = 0;
    }
  }, [currentTime, currentTrackerDate, zoomLevel]);

  const handleCenterZoomAndPan = useCallback(() => {
    setZoomLevel(1);
    const runPan = () => {
      if (chartScrollRef.current) {
        centerCurrentTime();
      }
    };
    setTimeout(runPan, 120);
  }, [centerCurrentTime]);

  useEffect(() => {
    const timer = setTimeout(centerCurrentTime, 50);
    return () => clearTimeout(timer);
  }, [currentTime, zoomLevel, centerCurrentTime]);

  useEffect(() => {
    if (activeBottomTab === 'analisi' || userProfileLevel === 'pro') {
      const timer = setTimeout(() => centerCurrentTime(), 100);
      return () => clearTimeout(timer);
    }
  }, [userProfileLevel, currentTrackerDate, zoomLevel, centerCurrentTime, activeBottomTab]);

  useEffect(() => {
    if (currentTrackerDate !== getTodayString()) {
      // Giorno passato: mostra l'intera giornata (~24h).
      setZoomLevel(0.5);
      return;
    }
    // Oggi: viewport fisso 12h (zoom 1), senza auto-zoom basato sui gap nodi.
    setZoomLevel(1);
  }, [simulationMode, currentTrackerDate]);

  const handleChartTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      initialPinchDistance.current = dist;
      initialZoomLevel.current = zoomLevel;
    }
  }, [zoomLevel]);

  const handleChartTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && initialPinchDistance.current != null) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const scale = currentDist / initialPinchDistance.current;
      let newZoom = initialZoomLevel.current * scale;
      newZoom = Math.max(0.5, Math.min(1.5, newZoom));
      setZoomLevel(newZoom);
    }
  }, []);

  const handleChartTouchEnd = useCallback(() => {
    initialPinchDistance.current = null;
  }, []);

  const clearTimelineStripEnergyPreview = useCallback(() => {
    if (timelineStripPreviewDebounceRef.current != null) {
      window.clearTimeout(timelineStripPreviewDebounceRef.current);
      timelineStripPreviewDebounceRef.current = null;
    }
    timelineStripPreviewLatestRef.current = null;
    timelineStripPreviewGenRef.current += 1;
    setTimelineStripPreview(null);
  }, []);

  const onTimelineStripPreviewDragStart = useCallback(() => {
    timelineStripPreviewDisabledRef.current = false;
    timelineStripPreviewSlowRef.current = 0;
    timelineStripPreviewGenRef.current += 1;
  }, []);

  const scheduleTimelineStripEnergyPreview = useCallback(
    (dragNodeId, hourDecimal) => {
      if (isSimulationMode || sleepStatus === 'NIGHT_PENDING') return;
      timelineStripPreviewLatestRef.current = { id: dragNodeId, hour: hourDecimal };
      if (timelineStripPreviewDebounceRef.current != null) {
        window.clearTimeout(timelineStripPreviewDebounceRef.current);
      }
      timelineStripPreviewDebounceRef.current = window.setTimeout(() => {
        timelineStripPreviewDebounceRef.current = null;
        const token = timelineStripPreviewGenRef.current;
        window.requestAnimationFrame(() => {
          if (token !== timelineStripPreviewGenRef.current) return;
          const d = timelineStripPreviewDepsRef.current;
          if (!d || d.isSimulationMode || d.sleepStatus === 'NIGHT_PENDING') return;
          if (timelineStripPreviewDisabledRef.current) return;
          const pending = timelineStripPreviewLatestRef.current;
          if (!pending || pending.id == null) return;

          const merged = applyTimelineStripHourToPreviewInputs(
            pending.id,
            pending.hour,
            d.nodesForEnergySimulation,
            d.dailyLogForEnergy,
            d.getFoodItemsForMealSlot,
            d.manualNodes,
          );
          if (!merged) {
            if (token === timelineStripPreviewGenRef.current) setTimelineStripPreview(null);
            return;
          }

          const t0 = performance.now();
          let sim;
          try {
            sim = generateRealEnergyData(
              merged.nodes,
              merged.log,
              d.idealStrategy,
              d.activeWaterIntake,
              d.dailyWaterGoal,
              d.yesterdayEnergyAt24?.energy ?? undefined,
              d.yesterdayEnergyAt24?.idealEnergy ?? undefined,
              d.userModel,
              d.nervousSystemLoad,
              d.currentTime,
              d.accumuloSNC,
              d.sleepMetabolicPenalty ?? 1,
            );
          } catch {
            return;
          }
          const dt = performance.now() - t0;
          if (dt > 55) {
            timelineStripPreviewSlowRef.current += 1;
            if (timelineStripPreviewSlowRef.current >= 2) {
              timelineStripPreviewDisabledRef.current = true;
              if (token === timelineStripPreviewGenRef.current) setTimelineStripPreview(null);
              return;
            }
          }
          if (token !== timelineStripPreviewGenRef.current) return;

          let cal;
          try {
            cal = generateCalorieTimeline(merged.log);
          } catch {
            cal = { calorieTimeline: [], totalCalories: 0 };
          }
          if (!Array.isArray(sim?.chartData) || sim.chartData.length === 0) {
            if (token === timelineStripPreviewGenRef.current) setTimelineStripPreview(null);
            return;
          }
          setTimelineStripPreview({
            chartData: sim.chartData,
            calorieTimeline: cal.calorieTimeline,
            totalCalories: cal.totalCalories,
          });
        });
      }, 24);
    },
    [isSimulationMode, sleepStatus],
  );

  return {
    chartUnit,
    setChartUnit,
    zoomLevel,
    setZoomLevel,
    timelineStripPreview,
    setTimelineStripPreview,
    isChartTooltipActive,
    setIsChartTooltipActive,
    chartScrollRef,
    chartTouchTimerRef,
    timelineStripPreviewDepsRef,
    TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1,
    centerCurrentTime,
    handleCenterZoomAndPan,
    handleChartTouchStart,
    handleChartTouchMove,
    handleChartTouchEnd,
    clearTimelineStripEnergyPreview,
    onTimelineStripPreviewDragStart,
    scheduleTimelineStripEnergyPreview,
  };
}

export default useTimelineChartShell;
