/**
 * Tab Analisi: cruscotto energetico 0–24h + timeline nodi.
 */
import { lazy, Suspense } from 'react';
import KentuLazySectionFallback from '../KentuLazySectionFallback';
import {
  CHART_AXIS_GUTTER_LEFT_PX,
  CHART_AXIS_GUTTER_RIGHT_PX,
} from '../../timeLayout';
import {
  NODE_IMPORTANCE,
  NODE_TYPE_ICON,
  decimalToTimeStr,
} from '../../coreEngine';

const MainDashboardCharts = lazy(() => import('../../features/charts/MainDashboardCharts'));
const TimelineNodi = lazy(() => import('../../TimelineNodi'));

export default function AnalisiTimelineTab(props) {
  const {
    hasCrashRisk = false,
    hasWaterRisk = false,
    hasCortisolRisk = false,
    hasDigestionRisk = false,
    chartUnit = 'percent',
    setChartUnit,
    handleUndo,
    handleRedo,
    historyIndex = 0,
    historyStack = [],
    isWaterHydrationAutoPilot = false,
    setZoomLevel,
    handleCenterZoomAndPan,
    draggingNode,
    chartScrollRef,
    handleChartTouchStart,
    handleChartTouchMove,
    handleChartTouchEnd,
    isChartTooltipActive = false,
    setIsChartTooltipActive,
    chartTouchTimerRef,
    TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1 = 200,
    zoomLevel = 1,
    mainChartData,
    nodesForEnergySimulation,
    displayTime,
    finalDotY,
    isViewingPastDate = false,
    currentTime,
    targetKcalChart,
    totalCaloriesTimeline,
    metabolicGradientStops,
    metabolicChartGradientStops,
    currentMetabolicColor,
    activeLog,
    metabolicContextOptions,
    setShowMetabolicSheet,
    activeNodesWithStack,
    activeAction,
    idealStrategy,
    realTotals,
    touchingNodeId,
    dragOffsetY,
    dragLiveTime,
    timelineContainerRef,
    startNodeDrag,
    releaseNodePointer,
    onTimelineNodeClick,
    openTimelineQuickAddAtPointer,
    handleNodeTap,
    syncDatiFirebase,
    setManualNodes,
    setDailyLog,
    timelineEnergySeries,
    chartData,
    updateMealTime,
    onTimelineStripPreviewDragStart,
    scheduleTimelineStripEnergyPreview,
    clearTimelineStripEnergyPreview,
    onTimelineStripDragOutsideDelete,
  } = props;

  return (
      <div
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', width: '100%' }}
      >
      <>
      {/* Cruscotto energetico giornaliero 0-24h */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '16px', padding: 'max(10px, 1.5vh) 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div
          className="analisi-pre-chart-controls"
          style={{
            flexShrink: 0,
            marginBottom: '10px',
            order: 2,
          }}
        >
          {/* Dashboard Allarmi — Timeline */}
            <div className="chart-selector-container chart-selector-container--icon-only">
              {(() => {
                const activeAlerts = [];
                if (hasCrashRisk) activeAlerts.push('glicemia');
                if (hasWaterRisk) activeAlerts.push('idratazione');
                if (hasCortisolRisk) activeAlerts.push('cortisolo');
                if (hasDigestionRisk) activeAlerts.push('digestione');
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setChartUnit('percent')}
                      aria-pressed={chartUnit === 'percent'}
                      aria-label="TDEE"
                      title="TDEE"
                      className={`chart-selector-btn${chartUnit === 'percent' ? ' active' : ''}${activeAlerts.includes('percent') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>⚡</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('calorieTimeline')}
                      aria-pressed={chartUnit === 'calorieTimeline'}
                      aria-label="Kcal"
                      title="Kcal"
                      className={`chart-selector-btn chart-selector-btn--cumul${chartUnit === 'calorieTimeline' ? ' active' : ''}${activeAlerts.includes('calorieTimeline') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>🔥</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('glicemia')}
                      aria-pressed={chartUnit === 'glicemia'}
                      aria-label="Glicemia"
                      title="Glicemia"
                      className={`chart-selector-btn chart-selector-btn--blood${chartUnit === 'glicemia' ? ' active' : ''}${hasCrashRisk && chartUnit !== 'glicemia' ? ' pulse-alert chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>🩸</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('idratazione')}
                      aria-pressed={chartUnit === 'idratazione'}
                      aria-label="Idratazione"
                      title="Idratazione"
                      className={`chart-selector-btn chart-selector-btn--water${chartUnit === 'idratazione' ? ' active' : ''}${hasWaterRisk && chartUnit !== 'idratazione' ? ' pulse-alert-water chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>💧</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('neuro')}
                      aria-pressed={chartUnit === 'neuro'}
                      aria-label="Neuro"
                      title="Neuro"
                      className={`chart-selector-btn chart-selector-btn--neuro${chartUnit === 'neuro' ? ' active' : ''}${activeAlerts.includes('neuro') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>🧠</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('cortisolo')}
                      aria-pressed={chartUnit === 'cortisolo'}
                      aria-label="Stress"
                      title="Stress"
                      className={`chart-selector-btn chart-selector-btn--cortisol${chartUnit === 'cortisolo' ? ' active' : ''}${hasCortisolRisk && chartUnit !== 'cortisolo' ? ' pulse-alert-cortisol chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>😰</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('digestione')}
                      aria-pressed={chartUnit === 'digestione'}
                      aria-label="Macro"
                      title="Macro"
                      className={`chart-selector-btn chart-selector-btn--digest${chartUnit === 'digestione' ? ' active' : ''}${hasDigestionRisk && chartUnit !== 'digestione' ? ' pulse-alert chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon" aria-hidden>🥑</span>
                    </button>
                  </>
                );
              })()}
            </div>
        </div>
        <div
          className="analisi-top-visual-container"
          style={{
            flex: 1,
            minHeight: 220,
            order: 1,
          }}
        >
        <div className="chart-wrapper" style={{ flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column' }}>
          <div className="chartTitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '2px', textTransform: 'uppercase' }}>
              {chartUnit === 'percent' ? 'Energia SNC (%)' : chartUnit === 'calorieTimeline' ? 'Calorie cumulative' : chartUnit === 'glicemia' ? 'Simulatore Glicemico' : chartUnit === 'idratazione' ? 'Simulatore Idratazione' : chartUnit === 'cortisolo' ? 'Cortisolo / Stress' : chartUnit === 'digestione' ? 'Grafico della Digestione' : chartUnit === 'neuro' ? 'Recupero Neurologico' : 'Energia SNC (%)'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button type="button" onClick={handleUndo} disabled={historyIndex <= 0} title="Annulla" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex <= 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: historyIndex <= 0 ? '#444' : '#00e5ff', fontSize: '1.1rem', cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer' }} aria-label="Annulla">↩</button>
              <button type="button" onClick={handleRedo} disabled={historyIndex >= historyStack.length - 1} title="Ripeti" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex >= historyStack.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: historyIndex >= historyStack.length - 1 ? '#444' : '#00e5ff', fontSize: '1.1rem', cursor: historyIndex >= historyStack.length - 1 ? 'not-allowed' : 'pointer' }} aria-label="Ripeti">↪</button>
              {chartUnit === 'idratazione' && isWaterHydrationAutoPilot && (
                <span title="Nessun record acqua: il motore assume idratazione ottimale (100%). Aggiungi acqua dal diario per il tracking reale." style={{ fontSize: '0.65rem', color: '#00e5ff', opacity: 0.9, maxWidth: '140px', lineHeight: 1.2, textAlign: 'right' }}>🤖 Pilota idratazione attivo</span>
              )}
            </div>
          </div>
          <div style={{ position: 'relative', flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column', transform: 'none' }}>
            <div className="zoom-vertical-bar" aria-label="Controlli zoom">
              <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 1.5))} title="Ingrandisci">+</button>
              <button type="button" className="zoom-btn-vertical" onClick={handleCenterZoomAndPan} title="Centra su ora attuale (12 ore)">🎯</button>
              <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.5))} title="Riduci">−</button>
            </div>
            <div className={`chart-scroll-container ${draggingNode ? 'dragging' : ''}`} ref={chartScrollRef} onTouchStart={handleChartTouchStart} onTouchMove={handleChartTouchMove} onTouchEnd={handleChartTouchEnd} style={{ display: 'flex', flex: 1, minHeight: 200, background: 'linear-gradient(180deg, #000 0%, #050505 100%)', borderRadius: '15px' }}>
            <div
              className={isChartTooltipActive ? 'show-tooltip' : 'hide-tooltip'}
              onTouchStart={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
              onTouchMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
              onTouchEnd={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              onMouseDown={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
              onMouseMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
              onMouseUp={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              onMouseLeave={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              style={{
                flexShrink: 0,
                width: `${TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1 * zoomLevel}%`,
                minWidth: `${Math.round(960 * zoomLevel)}px`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'width 0.3s ease',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}
              >
                <Suspense fallback={<KentuLazySectionFallback label="Cruscotto energetico…" />}>
                <MainDashboardCharts
                  chartUnit={chartUnit}
                  mainChartData={mainChartData}
                  draggingNode={draggingNode}
                  nodesForEnergySimulation={nodesForEnergySimulation}
                  displayTime={displayTime}
                  finalDotY={finalDotY}
                  isViewingPastDate={isViewingPastDate}
                  currentTime={currentTime}
                  targetKcalChart={targetKcalChart}
                  totalCaloriesTimeline={totalCaloriesTimeline}
                  metabolicGradientStops={metabolicGradientStops}
                  metabolicChartGradientStops={metabolicChartGradientStops}
                  currentMetabolicColor={currentMetabolicColor}
                  activeLog={activeLog}
                  metabolicContextOptions={metabolicContextOptions}
                  showMetabolicOverlay={true}
                  onMetabolicPhaseClick={() => setShowMetabolicSheet(true)}
                />
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
                <TimelineNodi
                  activeNodesWithStack={activeNodesWithStack}
                  chartUnit={chartUnit}
                  activeAction={activeAction}
                  analysisTabActive={true}
                  idealStrategy={idealStrategy}
                  realTotals={realTotals}
                  NODE_IMPORTANCE={NODE_IMPORTANCE}
                  NODE_TYPE_ICON={NODE_TYPE_ICON}
                  draggingNode={draggingNode}
                  touchingNodeId={touchingNodeId}
                  dragOffsetY={dragOffsetY}
                  dragLiveTime={dragLiveTime}
                  timelineContainerRef={timelineContainerRef}
                  startNodeDrag={startNodeDrag}
                  releaseNodePointer={releaseNodePointer}
                  onNodeClick={onTimelineNodeClick}
                  onTimelineTrackClick={openTimelineQuickAddAtPointer}
                onTimelineTrackLongPress={openTimelineQuickAddAtPointer}
                  handleNodeTap={handleNodeTap}
                  decimalToTimeStr={decimalToTimeStr}
                  syncDatiFirebase={syncDatiFirebase}
                  setManualNodes={setManualNodes}
                  setDailyLog={setDailyLog}
                  nowLineDecimalHour={!isViewingPastDate ? currentTime : undefined}
                  timelineEnergySeries={timelineEnergySeries}
                  timelineQualityChartData={chartData}
                  updateMealTime={updateMealTime}
                  onStripDragChartPreviewStart={onTimelineStripPreviewDragStart}
                  onStripDragChartPreview={scheduleTimelineStripEnergyPreview}
                  onStripDragChartPreviewEnd={clearTimelineStripEnergyPreview}
                  onStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
                  metabolicGradientStops={metabolicGradientStops}
                />
                </div>
                </Suspense>
              </div>
            </div>
            {/* Spacer scroll: margine destro senza pulsantiera laterale */}
            <div style={{ width: '24px', flexShrink: 0 }} />
          </div>
        </div>
        </div>
        </div>
        </div>

      </>

      </div>
  );
}
