import React from 'react';
import { ComposedChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid, Area, Tooltip } from 'recharts';
import NowVerticalLineOverlay from '../../NowVerticalLineOverlay';
import TimeAlignmentChartDebugOverlay from '../../TimeAlignmentDebugOverlay';
import TimelineNodi from '../../TimelineNodi';
import { CHART_AXIS_GUTTER_LEFT_PX, CHART_AXIS_GUTTER_RIGHT_PX } from '../../timeLayout';
function fullscreenChartLabelFromType(currentChartType) {
  return currentChartType === 'percent'
    ? 'Energia SNC %'
    : currentChartType === 'cortisolo'
      ? 'Cortisolo'
      : currentChartType === 'calorieTimeline'
        ? 'Bilancio Calorico'
        : currentChartType === 'glicemia'
          ? 'Glicemia'
          : currentChartType === 'idratazione'
            ? 'Idratazione'
            : currentChartType === 'neuro'
              ? 'Recupero Neurologico'
              : currentChartType === 'digestione'
                ? 'Digestione'
                : currentChartType === 'kcal'
                  ? 'Kcal'
                  : 'Grafico';
}

/**
 * Vista landscape fullscreen: switch grafico, zoom, timeline nodi e overlay ora.
 */
export default function FullscreenGraphView({
  fullscreenChartScrollRef,
  availableFullscreenCharts,
  fullscreenChartIndex,
  setFullscreenChartIndex,
  exitFullscreen,
  zoomLevel,
  setZoomLevel,
  handleCenterZoomAndPan,
  openTimelineQuickAddAtCenter,
  openTimelineQuickAddAtPointer,
  finalChartData,
  safeCalorieTimelineData,
  displayTime,
  dotY,
  dotCortisolo,
  dotGlicemia,
  dotIdratazione,
  dotNeuro,
  dotDigestione,
  nodesForEnergySimulation,
  targetKcalChart,
  totalCaloriesTimeline,
  scale,
  isViewingPastDate,
  currentTime,
  chartUnit,
  activeBottomTab,
  activeNodesWithStack,
  idealStrategy,
  realTotals,
  draggingNode,
  touchingNodeId,
  dragOffsetY,
  dragLiveTime,
  timelineContainerRef,
  startNodeDrag,
  releaseNodePointer,
  onTimelineNodeClick,
  handleNodeTap,
  decimalToTimeStr,
  syncDatiFirebase,
  setManualNodes,
  setDailyLog,
  bodyBattery,
  timelineEnergySeries,
  chartData,
  updateMealTime,
  onTimelineStripPreviewDragStart,
  scheduleTimelineStripEnergyPreview,
  clearTimelineStripEnergyPreview,
  onTimelineStripDragOutsideDelete,
  activeAction,
  NODE_IMPORTANCE,
  NODE_TYPE_ICON,
}) {
  const currentChartType = availableFullscreenCharts[fullscreenChartIndex] || 'percent';
  const fullscreenChartLabel = fullscreenChartLabelFromType(currentChartType);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100dvw', height: '100dvh', maxHeight: '100dvh', backgroundColor: '#121212', zIndex: 100020, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: '#1e1e1e', borderBottom: '1px solid #333', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button type="button" onClick={() => setFullscreenChartIndex((prev) => (prev > 0 ? prev - 1 : availableFullscreenCharts.length - 1))} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>◀</button>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.2rem', textTransform: 'uppercase' }}>{fullscreenChartLabel}</h2>
          <button type="button" onClick={() => setFullscreenChartIndex((prev) => (prev < availableFullscreenCharts.length - 1 ? prev + 1 : 0))} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>▶</button>
        </div>
        <button type="button" onClick={exitFullscreen} style={{ backgroundColor: '#ff0000', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✖ Chiudi</button>
      </div>

      <div ref={fullscreenChartScrollRef} style={{ flex: 1, minHeight: 0, width: '100%', overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: `${220 * zoomLevel}%`, minWidth: `${800 * zoomLevel}px`, flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 10px)' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {currentChartType === 'percent' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorEnergiaFullscreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00e676" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#ffea00" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorRiservaFullscreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00e676" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#00e676" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a1c', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                      formatter={(value, name) => {
                        const formattedValue = typeof value === 'number' ? `${value.toFixed(1)}%` : value != null ? `${Number(value).toFixed(1)}%` : '—';
                        const displayName =
                          name === 'energyPast' || name === 'Energia SNC' ? 'Energia SNC' : name === 'riservaFisica' ? 'Riserva Fisica' : name === 'energyFuture' ? 'Previsione' : name;
                        return [formattedValue, displayName];
                      }}
                      labelFormatter={(label) => {
                        if (typeof label === 'number') {
                          const ore = Math.floor(label);
                          const min = Math.round((label - ore) * 60);
                          return `Ore ${String(ore).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                        }
                        return label;
                      }}
                    />
                    {nodesForEnergySimulation.filter((n) => n.type === 'sleep').map((node, index) => (
                      <ReferenceLine key={`fs-sleep-${node.id ?? index}`} x={node.wakeTime ?? 7.5} stroke="#00e5ff" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11 }} />
                    ))}
                    <ReferenceDot x={displayTime} y={dotY} isFront r={10} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="riservaFisica" name="Riserva Fisica" stroke="#00e676" fill="url(#colorRiservaFullscreen)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="energyPast" name="Energia SNC" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergiaFullscreen)" connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="energyFuture" name="Previsione" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                    <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'cortisolo' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorCortisoloFullscreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9c27b0" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#9c27b0" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value, 'Cortisolo']} labelFormatter={(label) => `Ore ${label}:00`} />
                    <ReferenceDot x={displayTime} y={dotCortisolo} isFront r={10} fill="#9c27b0" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="cortisoloPast" stroke="#9c27b0" fill="url(#colorCortisoloFullscreen)" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="cortisoloFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'calorieTimeline' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={safeCalorieTimelineData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="time" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 'auto']} stroke="#666" fontSize={11} tickFormatter={(v) => Math.round(v)} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [Math.round(value), 'kcal']} labelFormatter={(label) => `Ore ${label}:00`} />
                    <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'glicemia' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[40, 220]} stroke="#666" fontSize={11} tickFormatter={(tick) => tick} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value != null ? Number(value).toFixed(0) : '—', 'Glicemia']} labelFormatter={(label) => (typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label)} />
                    <ReferenceDot x={displayTime} y={dotGlicemia} isFront r={10} fill="#ef4444" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="glicemiaPast" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="glicemiaFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'idratazione' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value != null ? `${Number(value).toFixed(1)}%` : '—', name === 'idratazionePast' ? 'Idratazione' : name]} labelFormatter={(label) => (typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label)} />
                    <ReferenceDot x={displayTime} y={dotIdratazione} isFront r={10} fill="#00e5ff" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="idratazionePast" stroke="#00e5ff" fill="#00e5ff" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="idratazioneFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'neuro' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value != null ? `${Number(value).toFixed(1)}%` : '—', name === 'neuroPast' ? 'Neuro' : name]} labelFormatter={(label) => (typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label)} />
                    <ReferenceDot x={displayTime} y={dotNeuro} isFront r={10} fill="#6366f1" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="neuroPast" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="neuroFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'digestione' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value != null ? `${Number(value).toFixed(1)}%` : '—', name === 'digestionePast' ? 'Digestione' : name]} labelFormatter={(label) => (typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label)} />
                    <ReferenceDot x={displayTime} y={dotDigestione} isFront r={10} fill="#9333ea" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="digestionePast" stroke="#9333ea" fill="#9333ea" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="digestioneFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {currentChartType === 'kcal' && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                    <YAxis domain={[0, Math.max(targetKcalChart || 2500, totalCaloriesTimeline || 0)]} stroke="#666" fontSize={11} tickFormatter={(v) => Math.round(v)} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [value != null ? Math.round(Number(value)) : '—', name === 'kcalPast' ? 'Kcal' : name]} labelFormatter={(label) => (typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label)} />
                    <ReferenceDot x={displayTime} y={scale(dotY)} isFront r={10} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    <Area type="monotone" dataKey="kcalPast" stroke="#00e676" fill="#00e676" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="kcalFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
              <TimeAlignmentChartDebugOverlay />
            </div>

            <div
              style={{
                flexShrink: 0,
                position: 'relative',
                width: '100%',
                paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
                paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
                boxSizing: 'border-box',
                marginTop: 10,
                marginBottom: 10,
              }}
            >
              <TimelineNodi
                activeNodesWithStack={activeNodesWithStack}
                chartUnit={chartUnit}
                activeAction={activeAction}
                analysisTabActive={activeBottomTab === 'analisi'}
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
                energyPercent={bodyBattery?.currentEnergy ?? 0}
                nowLineDecimalHour={!isViewingPastDate ? currentTime : undefined}
                timelineEnergySeries={timelineEnergySeries}
                timelineQualityChartData={chartData}
                updateMealTime={updateMealTime}
                onStripDragChartPreviewStart={onTimelineStripPreviewDragStart}
                onStripDragChartPreview={scheduleTimelineStripEnergyPreview}
                onStripDragChartPreviewEnd={clearTimelineStripEnergyPreview}
                onStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
              />
            </div>
          </div>
        </div>
      </div>
      <div
        role="group"
        aria-label="Controlli zoom fullscreen"
        style={{
          position: 'fixed',
          right: '15px',
          top: '40%',
          transform: 'translateY(-50%)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          background: 'rgba(20, 20, 20, 0.7)',
          padding: '10px',
          borderRadius: '30px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        <button
          type="button"
          className="zoom-btn-vertical"
          onClick={openTimelineQuickAddAtCenter}
          title="Aggiungi sulla timeline (ora centrale striscia)"
          aria-label="Aggiungi sulla timeline"
          style={{
            background: 'linear-gradient(145deg, rgba(0,229,255,0.35), rgba(0,120,140,0.45))',
            borderColor: 'rgba(0,229,255,0.45)',
          }}
        >
          ⊕
        </button>
        <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel((prev) => Math.min(prev + 0.2, 1.5))} title="Ingrandisci">
          +
        </button>
        <button type="button" className="zoom-btn-vertical" onClick={handleCenterZoomAndPan} title="Centra su ora attuale (30%)">
          🎯
        </button>
        <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel((prev) => Math.max(prev - 0.2, 0.45))} title="Riduci">
          −
        </button>
      </div>
    </div>
  );
}
