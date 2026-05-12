const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'SalaComandi.jsx');
let s = fs.readFileSync(file, 'utf8');
const startMarker =
  "          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', transform: 'none' }}>";
const endMarker =
  "            {/* SPACER PER PULSANTIERA: permette di scrollare oltre la fine del grafico */}\n            <div style={{ width: '80px', flexShrink: 0 }} />\n          </div>\n        </div>";
const i = s.indexOf(startMarker);
const j = s.indexOf(endMarker);
if (i === -1 || j === -1 || j <= i) {
  console.error('markers not found', i, j);
  process.exit(1);
}
const replacement = `          <DailyTimelineList
            showZoomBar={activeBottomTab === 'analisi' || !activeAction || activeAction === 'home'}
            openTimelineQuickAddAtCenter={openTimelineQuickAddAtCenter}
            setZoomLevel={setZoomLevel}
            handleCenterZoomAndPan={handleCenterZoomAndPan}
            chartScrollRef={chartScrollRef}
            onChartTouchStart={handleChartTouchStart}
            onChartTouchMove={handleChartTouchMove}
            onChartTouchEnd={handleChartTouchEnd}
            draggingNode={draggingNode}
            isChartTooltipActive={isChartTooltipActive}
            onChartTooltipTouchStart={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
            onChartTooltipTouchMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
            onChartTooltipTouchEnd={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
            onChartTooltipMouseDown={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
            onChartTooltipMouseMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
            onChartTooltipMouseUp={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
            onChartTooltipMouseLeave={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
            zoomLevel={zoomLevel}
            timelineNodiProps={{
              activeNodesWithStack,
              chartUnit,
              activeAction,
              analysisTabActive: activeBottomTab === 'analisi',
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
              onNodeClick: onTimelineNodeClick,
              onTimelineTrackClick: openTimelineQuickAddAtPointer,
              onTimelineTrackLongPress: openTimelineQuickAddAtPointer,
              handleNodeTap,
              decimalToTimeStr,
              syncDatiFirebase,
              setManualNodes,
              setDailyLog,
              energyPercent: bodyBattery?.currentEnergy ?? 0,
              nowLineDecimalHour: !isViewingPastDate ? currentTime : undefined,
              timelineEnergySeries,
              timelineQualityChartData: chartData,
              updateMealTime,
              onStripDragChartPreviewStart: onTimelineStripPreviewDragStart,
              onStripDragChartPreview: scheduleTimelineStripEnergyPreview,
              onStripDragChartPreviewEnd: clearTimelineStripEnergyPreview,
              onStripDragOutsideDelete: onTimelineStripDragOutsideDelete,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => { if (!draggingNode) { setExpandedChart(chartUnit); setActiveHighlight(null); } }}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !draggingNode) { e.preventDefault(); setExpandedChart(chartUnit); setActiveHighlight(null); } }}
              style={{ flex: 1, minHeight: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}
              aria-label="Apri grafico a tutto schermo"
            >
              <MainAnalysisChart
                chartUnit={chartUnit}
                mainChartData={mainChartData}
                nodesForEnergySimulation={nodesForEnergySimulation}
                displayTime={displayTime}
                finalDotY={finalDotY}
                draggingNode={draggingNode}
                isViewingPastDate={isViewingPastDate}
                currentTime={currentTime}
                targetKcalChart={targetKcalChart}
                totalCaloriesTimeline={totalCaloriesTimeline}
                multiSeriesTooltip={<CustomChartTooltip />}
              />
            </div>
          </DailyTimelineList>`;
const out = s.slice(0, i) + replacement + s.slice(j + endMarker.length);
fs.writeFileSync(file, out);
console.log('ok', i, j);
