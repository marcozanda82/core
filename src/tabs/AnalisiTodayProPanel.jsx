import React, { useMemo } from 'react';
import DailyCoachSection from '@/features/salaComandi/components/DailyCoachSection';
import DailyTimelineList from '../components/DailyTimelineList';
import MainAnalysisChart from '../charts/MainAnalysisChart';
import { CustomChartTooltip, getWorkoutTrafficLight } from '../coreEngine';

/** Titolo asse / grafico in base alla metrica selezionata (solo UI). */
export function chartUnitTitleIt(chartUnit) {
  if (chartUnit === 'percent') return 'Energia SNC (%)';
  if (chartUnit === 'calorieTimeline') return 'Calorie cumulative';
  if (chartUnit === 'glicemia') return 'Simulatore Glicemico';
  if (chartUnit === 'idratazione') return 'Simulatore Idratazione';
  if (chartUnit === 'cortisolo') return 'Cortisolo / Stress';
  if (chartUnit === 'digestione') return 'Grafico della Digestione';
  if (chartUnit === 'neuro') return 'Recupero Neurologico';
  return 'Energia SNC (%)';
}

function buildChartSelectorAlerts({ hasCrashRisk, hasWaterRisk, hasCortisolRisk, hasDigestionRisk }) {
  const activeAlerts = [];
  if (hasCrashRisk) activeAlerts.push('glicemia');
  if (hasWaterRisk) activeAlerts.push('idratazione');
  if (hasCortisolRisk) activeAlerts.push('cortisolo');
  if (hasDigestionRisk) activeAlerts.push('digestione');
  return activeAlerts;
}

/**
 * Vista Analisi + Oggi Pro: selettori metrica, coach giornaliero, semaforo digestione/workout, grafico 24h e strip nodi.
 * Calcolo locale del semaforo e delle label UI; i dati del grafico arrivano già preparati dal genitore.
 */
export default function AnalisiTodayProPanel({
  activeBottomTab,
  activeAction,
  chartUnit,
  setChartUnit,
  riskFlags,
  metabolicCoach,
  trafficContext,
  onDigestionTrafficClick,
  isWaterHydrationAutoPilot,
  historyIndex,
  historyStackLength,
  handleUndo,
  handleRedo,
  enterFullscreen,
  chartScrollRef,
  handleChartTouchStart,
  handleChartTouchMove,
  handleChartTouchEnd,
  draggingNode,
  isChartTooltipActive,
  setIsChartTooltipActive,
  chartTouchTimerRef,
  zoomLevel,
  setZoomLevel,
  openTimelineQuickAddAtCenter,
  handleCenterZoomAndPan,
  mainChartData,
  nodesForEnergySimulation,
  displayTime,
  finalDotY,
  isViewingPastDate,
  currentTime,
  targetKcalChart,
  totalCaloriesTimeline,
  timelineNodiProps,
}) {
  const { hasCrashRisk, hasWaterRisk, hasCortisolRisk, hasDigestionRisk } = riskFlags;
  const {
    displayTime: trafficDisplayTime,
    anabolicCurve,
    activeLog,
    fullHistory,
    currentTrackerDate,
    userTargets,
  } = trafficContext;

  const trafficLight = useMemo(
    () =>
      getWorkoutTrafficLight(trafficDisplayTime, anabolicCurve, activeLog, {
        fullHistory,
        currentTrackerDate,
        userTargets,
      }),
    [trafficDisplayTime, anabolicCurve, activeLog, fullHistory, currentTrackerDate, userTargets]
  );

  const chartSelectorAlerts = useMemo(
    () => buildChartSelectorAlerts({ hasCrashRisk, hasWaterRisk, hasCortisolRisk, hasDigestionRisk }),
    [hasCrashRisk, hasWaterRisk, hasCortisolRisk, hasDigestionRisk]
  );

  const digestionClickable = trafficLight.text === 'IN DIGESTIONE';

  return (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: '16px',
          padding: 'max(10px, 1.5vh) 12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="analisi-pre-chart-controls"
          style={{
            flexShrink: 0,
            marginBottom: '10px',
            order: activeBottomTab === 'analisi' ? 2 : 0,
          }}
        >
          {activeBottomTab === 'analisi' ? (
            <div className="chart-selector-container">
              <button
                type="button"
                onClick={() => setChartUnit('percent')}
                aria-pressed={chartUnit === 'percent'}
                className={`chart-selector-btn${chartUnit === 'percent' ? ' active' : ''}${chartSelectorAlerts.includes('percent') ? ' chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">⚡</span>
                <span className="chart-btn-label">TDEE</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('calorieTimeline')}
                aria-pressed={chartUnit === 'calorieTimeline'}
                className={`chart-selector-btn chart-selector-btn--cumul${chartUnit === 'calorieTimeline' ? ' active' : ''}${chartSelectorAlerts.includes('calorieTimeline') ? ' chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">🔥</span>
                <span className="chart-btn-label">Kcal</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('glicemia')}
                aria-pressed={chartUnit === 'glicemia'}
                className={`chart-selector-btn chart-selector-btn--blood${chartUnit === 'glicemia' ? ' active' : ''}${hasCrashRisk && chartUnit !== 'glicemia' ? ' pulse-alert chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">🩸</span>
                <span className="chart-btn-label">Glic</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('idratazione')}
                aria-pressed={chartUnit === 'idratazione'}
                className={`chart-selector-btn chart-selector-btn--water${chartUnit === 'idratazione' ? ' active' : ''}${hasWaterRisk && chartUnit !== 'idratazione' ? ' pulse-alert-water chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">💧</span>
                <span className="chart-btn-label">Acqua</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('neuro')}
                aria-pressed={chartUnit === 'neuro'}
                className={`chart-selector-btn chart-selector-btn--neuro${chartUnit === 'neuro' ? ' active' : ''}${chartSelectorAlerts.includes('neuro') ? ' chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">🧠</span>
                <span className="chart-btn-label">Neuro</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('cortisolo')}
                aria-pressed={chartUnit === 'cortisolo'}
                className={`chart-selector-btn chart-selector-btn--cortisol${chartUnit === 'cortisolo' ? ' active' : ''}${hasCortisolRisk && chartUnit !== 'cortisolo' ? ' pulse-alert-cortisol chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">😰</span>
                <span className="chart-btn-label">Stress</span>
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('digestione')}
                aria-pressed={chartUnit === 'digestione'}
                className={`chart-selector-btn chart-selector-btn--digest${chartUnit === 'digestione' ? ' active' : ''}${hasDigestionRisk && chartUnit !== 'digestione' ? ' pulse-alert chart-selector-alarm' : ''}`}
              >
                <span className="chart-btn-icon">🥑</span>
                <span className="chart-btn-label">Macro</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                justifyContent: 'flex-start',
                paddingBottom: '10px',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => setChartUnit('percent')}
                className={`telemetry-btn ${chartUnit === 'percent' ? 'active' : ''} ${chartSelectorAlerts.includes('percent') ? 'telemetry-btn-alarm' : ''}`}
              >
                ⚡ %
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('calorieTimeline')}
                className={`telemetry-btn ${chartUnit === 'calorieTimeline' ? 'active' : ''} ${chartSelectorAlerts.includes('calorieTimeline') ? 'telemetry-btn-alarm' : ''}`}
                style={chartUnit === 'calorieTimeline' ? { color: '#ff9800', borderColor: '#ff9800' } : undefined}
              >
                📈 CUMUL
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('glicemia')}
                className={`telemetry-btn ${chartUnit === 'glicemia' ? 'active blood' : ''} ${hasCrashRisk && chartUnit !== 'glicemia' ? 'pulse-alert telemetry-btn-alarm' : ''}`}
              >
                🩸 GLICEM
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('idratazione')}
                className={`telemetry-btn ${chartUnit === 'idratazione' ? 'active water' : ''} ${hasWaterRisk && chartUnit !== 'idratazione' ? 'pulse-alert-water telemetry-btn-alarm' : ''}`}
              >
                💧 IDRAT
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('neuro')}
                className={`telemetry-btn ${chartUnit === 'neuro' ? 'active' : ''} ${chartSelectorAlerts.includes('neuro') ? 'telemetry-btn-alarm' : ''}`}
                style={chartUnit === 'neuro' ? { color: '#6366f1', borderColor: '#6366f1' } : undefined}
              >
                🧠 NEURO
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('cortisolo')}
                className={`telemetry-btn ${chartUnit === 'cortisolo' ? 'active cortisol' : ''} ${hasCortisolRisk && chartUnit !== 'cortisolo' ? 'pulse-alert-cortisol telemetry-btn-alarm' : ''}`}
              >
                🧠 CORTISOL
              </button>
              <button
                type="button"
                onClick={() => setChartUnit('digestione')}
                className={`telemetry-btn ${chartUnit === 'digestione' ? 'active' : ''} ${hasDigestionRisk && chartUnit !== 'digestione' ? 'pulse-alert telemetry-btn-alarm' : ''}`}
                style={chartUnit === 'digestione' ? { color: '#9333ea', borderColor: '#9333ea' } : undefined}
              >
                ⚙️ DIGEST
              </button>
            </div>
          )}
          <div style={{ marginTop: '6px' }}>
            <DailyCoachSection
              activeLog={metabolicCoach.activeLog}
              totali={metabolicCoach.totali}
              dynamicDailyKcal={metabolicCoach.dynamicDailyKcal}
              userProfile={metabolicCoach.userProfile}
              metabolicMapData={metabolicCoach.metabolicMapData}
              userTargets={metabolicCoach.userTargets}
              metabolicCompassTimeframe={metabolicCoach.metabolicCompassTimeframe}
              metabolicCompassDailyHistory={metabolicCoach.metabolicCompassDailyHistory}
              energyAt20Percent={metabolicCoach.energyAt20Percent}
              kentuDailyCalorieStrategy={metabolicCoach.kentuDailyCalorieStrategy}
              aiDayCoach={metabolicCoach.aiCoachEval}
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (digestionClickable) onDigestionTrafficClick();
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && digestionClickable) {
                e.preventDefault();
                onDigestionTrafficClick();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#1a1a1a',
              padding: '10px 15px',
              borderRadius: '12px',
              border: `1px solid ${trafficLight.color}`,
              marginTop: '8px',
              cursor: digestionClickable ? 'pointer' : 'default',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: trafficLight.color,
                boxShadow: `0 0 10px ${trafficLight.color}`,
              }}
            />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: trafficLight.color }}>{trafficLight.text}</div>
              <div style={{ fontSize: '0.65rem', color: '#aaa' }}>{trafficLight.msg}</div>
            </div>
          </div>
        </div>
        <div
          className="analisi-top-visual-container"
          style={{
            flex: 1,
            minHeight: 0,
            order: activeBottomTab === 'analisi' ? 1 : 0,
          }}
        >
          <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              className="chartTitle"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  color: '#666',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}
              >
                {chartUnitTitleIt(chartUnit)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  title="Annulla"
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: historyIndex <= 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: historyIndex <= 0 ? '#444' : '#00e5ff',
                    fontSize: '1.1rem',
                    cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
                  }}
                  aria-label="Annulla"
                >
                  ↩
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= historyStackLength - 1}
                  title="Ripeti"
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: historyIndex >= historyStackLength - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: historyIndex >= historyStackLength - 1 ? '#444' : '#00e5ff',
                    fontSize: '1.1rem',
                    cursor: historyIndex >= historyStackLength - 1 ? 'not-allowed' : 'pointer',
                  }}
                  aria-label="Ripeti"
                >
                  ↪
                </button>
                {chartUnit === 'idratazione' && isWaterHydrationAutoPilot && (
                  <span
                    title="Nessun record acqua: il motore assume idratazione ottimale (100%). Aggiungi acqua dal diario per il tracking reale."
                    style={{
                      fontSize: '0.65rem',
                      color: '#00e5ff',
                      opacity: 0.9,
                      maxWidth: '140px',
                      lineHeight: 1.2,
                      textAlign: 'right',
                    }}
                  >
                    🤖 Pilota idratazione attivo
                  </span>
                )}
                <button
                  type="button"
                  onClick={enterFullscreen}
                  title="Fullscreen"
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#00e5ff',
                    fontSize: '1rem',
                    cursor: 'pointer',
                  }}
                  aria-label="Apri a tutto schermo"
                >
                  ⛶
                </button>
              </div>
            </div>
            <DailyTimelineList
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
              onChartTooltipTouchStart={() => {
                chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400);
              }}
              onChartTooltipTouchMove={() => {
                if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current);
                chartTouchTimerRef.current = null;
              }}
              onChartTooltipTouchEnd={() => {
                clearTimeout(chartTouchTimerRef.current);
                chartTouchTimerRef.current = null;
                setIsChartTooltipActive(false);
              }}
              onChartTooltipMouseDown={() => {
                chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400);
              }}
              onChartTooltipMouseMove={() => {
                if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current);
                chartTouchTimerRef.current = null;
              }}
              onChartTooltipMouseUp={() => {
                clearTimeout(chartTouchTimerRef.current);
                chartTouchTimerRef.current = null;
                setIsChartTooltipActive(false);
              }}
              onChartTooltipMouseLeave={() => {
                clearTimeout(chartTouchTimerRef.current);
                chartTouchTimerRef.current = null;
                setIsChartTooltipActive(false);
              }}
              zoomLevel={zoomLevel}
              timelineNodiProps={timelineNodiProps}
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
            </DailyTimelineList>
          </div>
        </div>
      </div>
    </>
  );
}
