import React from 'react';
import TimelineNodi from '../TimelineNodi';
import { CHART_AXIS_GUTTER_LEFT_PX, CHART_AXIS_GUTTER_RIGHT_PX } from '../timeLayout';

/**
 * Area scroll + grafico principale + striscia nodi giornalieri (tab Oggi Pro / Analisi).
 * Il grafico (`MainAnalysisChart`) resta composizione via `children`.
 */
export default function DailyTimelineList({
  showZoomBar,
  setZoomLevel,
  handleCenterZoomAndPan,
  chartScrollRef,
  onChartTouchStart,
  onChartTouchMove,
  onChartTouchEnd,
  draggingNode,
  isChartTooltipActive,
  onChartTooltipTouchStart,
  onChartTooltipTouchMove,
  onChartTooltipTouchEnd,
  onChartTooltipMouseDown,
  onChartTooltipMouseMove,
  onChartTooltipMouseUp,
  onChartTooltipMouseLeave,
  zoomLevel,
  children,
  timelineNodiProps,
}) {
  /** zoom 1 → 200% width → 12 ore visibili. */
  const chartWidthPct = 200 * (Number(zoomLevel) || 1);

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        transform: 'none',
      }}
    >
      {showZoomBar && (
        <div className="zoom-vertical-bar" aria-label="Controlli zoom">
          <button
            type="button"
            className="zoom-btn-vertical"
            onClick={() => setZoomLevel((prev) => Math.min(prev + 0.2, 1.5))}
            title="Ingrandisci"
          >
            +
          </button>
          <button
            type="button"
            className="zoom-btn-vertical"
            onClick={handleCenterZoomAndPan}
            title="Centra su ora attuale (12 ore)"
          >
            🎯
          </button>
          <button
            type="button"
            className="zoom-btn-vertical"
            onClick={() => setZoomLevel((prev) => Math.max(prev - 0.2, 0.5))}
            title="Riduci"
          >
            −
          </button>
        </div>
      )}
      <div
        className={`chart-scroll-container ${draggingNode ? 'dragging' : ''}`}
        ref={chartScrollRef}
        onTouchStart={onChartTouchStart}
        onTouchMove={onChartTouchMove}
        onTouchEnd={onChartTouchEnd}
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          background: 'linear-gradient(180deg, #000 0%, #050505 100%)',
          borderRadius: '15px',
        }}
      >
        <div
          className={isChartTooltipActive ? 'show-tooltip' : 'hide-tooltip'}
          onTouchStart={onChartTooltipTouchStart}
          onTouchMove={onChartTooltipTouchMove}
          onTouchEnd={onChartTooltipTouchEnd}
          onMouseDown={onChartTooltipMouseDown}
          onMouseMove={onChartTooltipMouseMove}
          onMouseUp={onChartTooltipMouseUp}
          onMouseLeave={onChartTooltipMouseLeave}
          style={{
            flexShrink: 0,
            width: `${chartWidthPct}%`,
            minWidth: `${Math.round(960 * (Number(zoomLevel) || 1))}px`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            transition: 'width 0.3s ease',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {children}
          </div>
          <div
            style={{
              flexShrink: 0,
              position: 'relative',
              width: '100%',
              paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
              paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
              boxSizing: 'border-box',
              paddingTop: 6,
              zIndex: 10,
            }}
          >
            <TimelineNodi {...timelineNodiProps} />
          </div>
        </div>
        <div style={{ width: '24px', flexShrink: 0 }} />
      </div>
    </div>
  );
}
