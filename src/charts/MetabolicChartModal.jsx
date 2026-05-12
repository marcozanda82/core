/**
 * MetabolicChartModal.jsx — Modale fullscreen per grafici + carousel fullscreen Sala Comandi.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
  Area,
  Tooltip
} from 'recharts';
import {
  MODAL_NODE_PRIMARY,
  NODE_IMPORTANCE,
  NODE_TYPE_ICON,
  buildGlobalAIPrompt,
  InteractiveAIText,
  getLocalKnowledgeBase,
  saveToKnowledgeBase,
  generateStateHash,
  KNOWLEDGE_BASE_MAX_AGE_MS
} from '../coreEngine';
import {
  getTimePositionPercent,
  CHART_AXIS_GUTTER_LEFT_PX,
  CHART_AXIS_GUTTER_RIGHT_PX,
  DEBUG_TIME_GRID_HOURS,
  getDebugGridLineTimelineStyle,
  buildTimelineEnergyStripGradient,
} from '../timeLayout';
import NowVerticalLineOverlay from '../NowVerticalLineOverlay';
import TimeAlignmentChartDebugOverlay, { SHOW_TIME_ALIGNMENT_DEBUG } from '../TimeAlignmentDebugOverlay';
import TimelineNodi from '../TimelineNodi';

const MODAL_TIMELINE_NOW_GLOW =
  '0 0 4px rgba(0, 229, 255, 0.95), 0 0 10px rgba(0, 229, 255, 0.55), 0 0 18px rgba(255, 255, 255, 0.12)';

const CHART_VIEWS_CAROUSEL = ['percent', 'kcal', 'calorieTimeline', 'glicemia', 'idratazione', 'neuro', 'cortisolo', 'digestione'];
const AI_KEYWORD_TO_CHART = { 'Sveglia': null, 'Energia SNC': 'percent', 'Recupero Neurologico': 'neuro', 'Finestra Anabolica': 'kcal', 'Cortisolo': 'cortisolo', 'Glicemia': 'glicemia', 'Digestione': 'digestione' };

const TIMELINE_HEIGHT = 60;

export default function MetabolicChartModal({
  expandedChart,
  onClose,
  setExpandedChart,
  setActiveHighlight,
  modalChartData,
  safeCalorieTimelineData,
  displayTime,
  timeLabel,
  dotY,
  dotGlicemia,
  dotIdratazione,
  dotCortisolo,
  dotDigestione,
  dotNeuro,
  dotYCalorieTimeline,
  idealDotY,
  targetKcalChart,
  scale,
  dailyLog,
  activeHighlight,
  activeNodesWithStack,
  bottomTab,
  setBottomTab,
  aiInsightsList,
  setAiInsightsList,
  currentAiIndex,
  setCurrentAiIndex,
  isAiLoading,
  setIsAiLoading,
  callGeminiAPIWithRotation,
  totalCaloriesTimeline = 0,
  isSimulationMode = false,
  onTimeChange,
  activeAlerts = [],
  /** Stessa ora del grafico principale (ore + minuti/60); se omessa niente linea “ora” su grafico + striscia. */
  wallClockNowLineHour,
  /** Punti energia giornata per sfondo timeline modale (stesso formato di TimelineNodi). */
  timelineEnergySeries,
}) {
  const [selectedSimNode, setSelectedSimNode] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const modalSwipeStartXRef = useRef(null);
  const bottomTouchStartX = useRef(null);
  const highlightResetTimeoutRef = useRef(null);
  const initialPinchDistanceRef = useRef(null);

  const modalEnergyStripGradient = useMemo(
    () => buildTimelineEnergyStripGradient(timelineEnergySeries),
    [timelineEnergySeries]
  );

  useEffect(() => {
    const updateViewport = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const getDistance = (touch1, touch2) =>
    Math.sqrt(Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2));

  const handleChartTouchStart = (e) => {
    if (e.touches?.length === 2) initialPinchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
  };
  const handleChartTouchMove = (e) => {
    if (e.touches?.length === 2 && initialPinchDistanceRef.current != null) {
      e.preventDefault();
      const current = getDistance(e.touches[0], e.touches[1]);
      const diff = current - initialPinchDistanceRef.current;
      if (Math.abs(diff) > 10) {
        setZoomLevel((prev) => (diff > 0 ? Math.min(prev + 0.05, 5) : Math.max(prev - 0.05, 0.5)));
        initialPinchDistanceRef.current = current;
      }
    }
  };
  const handleChartTouchEnd = (e) => {
    if (e.touches?.length < 2) initialPinchDistanceRef.current = null;
  };

  const renderTimelineNode = (node) => {
    const primaryTypes = MODAL_NODE_PRIMARY[expandedChart] ?? NODE_IMPORTANCE[expandedChart] ?? [];
    const isPrimary = primaryTypes.includes(node.type);
    const isWork = node.type === 'work';
    const isCognitive = node.type === 'cognitive';
    const percent = getTimePositionPercent(node.time);
    const durationPercent = (isWork || isCognitive) ? getTimePositionPercent(node.duration || 1) : 0;
    const iconContent = NODE_TYPE_ICON[node.type] ?? (node.type === 'stimulant' ? '☕' : node.type === 'water' ? '💧' : node.type === 'work' ? '💼' : node.type === 'workout' ? '⚡' : node.type === 'cognitive' ? (node.subType === 'studio' ? '📚' : '💻') : '🥗');
    const bgColor = node.type === 'stimulant' ? 'rgba(245,158,11,0.2)' : node.type === 'water' ? 'rgba(0,229,255,0.15)' : node.type === 'work' ? 'rgba(255,234,0,0.15)' : node.type === 'cognitive' ? 'rgba(182,102,210,0.2)' : node.type === 'nap' ? 'rgba(129,140,248,0.2)' : node.type === 'meditation' ? 'rgba(34,197,94,0.2)' : node.type === 'supplements' ? 'rgba(168,85,247,0.2)' : node.type === 'sunlight' ? 'rgba(251,191,36,0.2)' : 'rgba(0,0,0,0.6)';
    const borderColor = node.type === 'stimulant' ? '#f59e0b' : node.type === 'water' ? '#00e5ff' : node.type === 'work' ? '#ffea00' : node.type === 'cognitive' ? '#b666d2' : node.type === 'nap' ? '#818cf8' : node.type === 'meditation' ? '#22c55e' : node.type === 'supplements' ? '#a855f7' : node.type === 'sunlight' ? '#fbbf24' : '#00e5ff';
    const timeLabelStr = `${Math.floor(node.time)}:${String(Math.round((node.time % 1) * 60)).padStart(2, '0')}`;
    const safeDailyLog = dailyLog || [];
    const logItemForNode = isSimulationMode && safeDailyLog.length > 0 ? (node.type === 'meal' ? safeDailyLog.find(item => item.type === 'food' && item.mealType === node.id) || null : node.type === 'workout' ? safeDailyLog.find(item => item.type === 'workout' && item.id === node.id) || null : node.type === 'stimulant' ? safeDailyLog.find(item => item.type === 'stimulant' && item.id === node.id) || null : null) : null;
    if (isSimulationMode && !logItemForNode) {
      console.warn("Missing logItemForNode", node);
    }
    const isSelected = isSimulationMode && selectedSimNode && logItemForNode && selectedSimNode.id === logItemForNode.id;
    const nodeStyle = { zIndex: isPrimary ? 10 : 1, filter: isPrimary ? 'none' : 'grayscale(100%)', opacity: isPrimary ? 1 : 0.4, transform: isPrimary ? (isWork || isCognitive ? undefined : 'translateX(-50%)') : (isWork || isCognitive ? 'scale(0.8)' : 'translateX(-50%) scale(0.8)'), transition: 'all 0.3s ease', pointerEvents: isSimulationMode && (node.type === 'meal' || node.type === 'workout' || node.type === 'stimulant') ? 'auto' : 'none', cursor: isSimulationMode && logItemForNode ? 'pointer' : 'default' };
    const handleNodeClick = (e) => { e.stopPropagation(); if (isSimulationMode && logItemForNode) setSelectedSimNode(prev => prev?.id === logItemForNode.id ? null : logItemForNode); };
    if (isWork) {
      return (
        <div key={node.id} style={{ position: 'absolute', left: `${percent}%`, width: `${durationPercent}%`, top: '50%', marginTop: -18, height: '36px', background: 'rgba(255,234,0,0.15)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', ...nodeStyle }}>💼</div>
      );
    }
    if (isCognitive) {
      return (
        <div key={node.id} style={{ position: 'absolute', left: `${percent}%`, width: `${durationPercent}%`, top: '50%', marginTop: -18, height: '36px', background: 'rgba(182,102,210,0.2)', borderLeft: '2px solid #b666d2', borderRight: '2px solid #b666d2', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', ...nodeStyle }}>{node.subType === 'studio' ? '📚' : '💻'}</div>
      );
    }
    return (
      <div key={node.id} role={isSimulationMode && logItemForNode ? 'button' : undefined} tabIndex={isSimulationMode && logItemForNode ? 0 : undefined} onClick={handleNodeClick} onKeyDown={isSimulationMode && logItemForNode ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNodeClick(e); } } : undefined} style={{ position: 'absolute', left: `${percent}%`, top: '50%', marginTop: -18, width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? 'rgba(98,0,234,0.4)' : bgColor, border: `2px solid ${isSelected ? '#00e5ff' : borderColor}`, boxShadow: isSelected ? '0 0 12px rgba(0,229,255,0.6)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', ...nodeStyle }}>
        <span style={{ color: isSelected ? '#00e5ff' : borderColor, fontWeight: 'bold', marginBottom: '1px' }}>{timeLabelStr}</span>
        <span style={{ lineHeight: 1, fontSize: '1rem' }}>{iconContent}</span>
      </div>
    );
  };

  const currentIndex = CHART_VIEWS_CAROUSEL.indexOf(expandedChart);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const handleModalSwipeStart = (e) => { modalSwipeStartXRef.current = e.touches?.[0]?.clientX ?? e.clientX; };
  const handleModalSwipeEnd = (e) => {
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    const startX = modalSwipeStartXRef.current;
    if (startX == null) return;
    const deltaX = endX - startX;
    if (deltaX < -50) { setExpandedChart(CHART_VIEWS_CAROUSEL[(safeIndex + 1) % CHART_VIEWS_CAROUSEL.length]); setActiveHighlight(null); }
    else if (deltaX > 50) { setExpandedChart(CHART_VIEWS_CAROUSEL[safeIndex === 0 ? CHART_VIEWS_CAROUSEL.length - 1 : safeIndex - 1]); setActiveHighlight(null); }
    modalSwipeStartXRef.current = null;
  };
  const handleModalSwipeStartMouse = (e) => { modalSwipeStartXRef.current = e.clientX; };
  const handleModalSwipeEndMouse = (e) => { if (modalSwipeStartXRef.current != null) handleModalSwipeEnd({ changedTouches: null, clientX: e.clientX }); };

  const handleGlobalKeywordClick = (highlightKey, keywordLabel) => {
    const chart = keywordLabel ? AI_KEYWORD_TO_CHART[keywordLabel] : null;
    if (chart != null) setExpandedChart(chart);
    if (highlightResetTimeoutRef.current) { clearTimeout(highlightResetTimeoutRef.current); highlightResetTimeoutRef.current = null; }
    setActiveHighlight(highlightKey);
    highlightResetTimeoutRef.current = setTimeout(() => { setActiveHighlight(null); highlightResetTimeoutRef.current = null; }, 3000);
  };

  const handleBottomTouchStart = (e) => { bottomTouchStartX.current = e.touches?.[0]?.clientX ?? e.clientX; };
  const handleBottomTouchEnd = (e) => {
    if (bottomTouchStartX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    const deltaX = bottomTouchStartX.current - endX;
    if (deltaX > 50 && currentAiIndex < aiInsightsList.length - 1) setCurrentAiIndex(prev => prev + 1);
    else if (deltaX < -50 && currentAiIndex > 0) setCurrentAiIndex(prev => prev - 1);
    bottomTouchStartX.current = null;
  };

  const runGenerateGlobalAI = () => {
    setIsAiLoading(true);
    const timeStr = `${String(Math.floor(displayTime)).padStart(2, '0')}:${String(Math.round((displayTime % 1) * 60)).padStart(2, '0')}`;
    const lastMeal = (dailyLog || []).filter(e => e.type === 'food' && (typeof e.mealTime === 'number' || typeof e.time === 'number')).reduce((best, e) => {
      const t = Number(e.mealTime ?? e.time ?? 0);
      if (t > displayTime) return best;
      if (!best) return e;
      return Number(best.mealTime ?? best.time ?? 0) < t ? e : best;
    }, null);
    let lastMealHoursAgo = 24;
    if (lastMeal) { let diff = displayTime - (Number(lastMeal.mealTime) ?? Number(lastMeal.time) ?? 0); if (diff < 0) diff += 24; lastMealHoursAgo = diff; }
    const currentHash = generateStateHash(dotY ?? 50, dotCortisolo ?? 25, activeAlerts, lastMealHoursAgo);
    const kb = getLocalKnowledgeBase();
    if (kb[currentHash] && (Date.now() - (kb[currentHash].timestamp || 0) < KNOWLEDGE_BASE_MAX_AGE_MS)) {
      const cachedText = kb[currentHash].text + "\n\n*(Risposta caricata istantaneamente dalla memoria locale dell'app)*";
      setAiInsightsList(prev => { const next = [...prev, { time: timeStr, text: cachedText }]; setCurrentAiIndex(next.length - 1); return next; });
      setIsAiLoading(false);
      return;
    }
    const prompt = buildGlobalAIPrompt({ displayTime, energy: dotY, cortisolo: dotCortisolo, glicemia: dotGlicemia, idratazione: dotIdratazione, digestione: dotDigestione, neuro: dotNeuro, activeAlerts: activeAlerts || [] });
    callGeminiAPIWithRotation(prompt)
      .then((result) => { saveToKnowledgeBase(currentHash, result); setAiInsightsList(prev => { const next = [...prev, { time: timeStr, text: result }]; setCurrentAiIndex(next.length - 1); return next; }); setIsAiLoading(false); })
      .catch((err) => { console.error("Errore AI Analisi Grafico:", err); setAiInsightsList(prev => { const next = [...prev, { time: timeStr, text: "❌ Connessione con Core AI fallita. Verifica le API Key." }]; setCurrentAiIndex(next.length - 1); return next; }); setIsAiLoading(false); });
  };

  const safeDailyLog = dailyLog || [];

  return (
    <>
      <style>{`
        .zoom-vertical-bar { position: fixed; right: 15px; top: 50%; transform: translateY(-50%); z-index: 50; display: flex; flex-direction: column; gap: 15px; background: rgba(20, 20, 20, 0.7); padding: 10px; border-radius: 30px; backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.15); }
        .zoom-btn-vertical { width: 40px; height: 40px; border-radius: 50%; background: #2c2c2e; color: white; border: 1px solid #444; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer; }
        .zoom-btn-vertical:active { background: #444; transform: scale(0.9); }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Grafico a tutto schermo"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100dvh', maxHeight: '100dvh', backgroundColor: '#050508', zIndex: 100020, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '16px', paddingBottom: '8px' }} onTouchStart={handleModalSwipeStart} onTouchEnd={handleModalSwipeEnd} onMouseDown={handleModalSwipeStartMouse} onMouseUp={handleModalSwipeEndMouse} onMouseLeave={() => { modalSwipeStartXRef.current = null; }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#00e5ff', fontWeight: 'bold' }}>
              {expandedChart === 'percent' ? '⚡ Energia SNC (%)' : expandedChart === 'calorieTimeline' ? '📈 Calorie cumulative' : expandedChart === 'glicemia' ? 'Simulatore Glicemico' : expandedChart === 'idratazione' ? 'Simulatore Idratazione' : expandedChart === 'cortisolo' ? 'Cortisolo / Stress' : expandedChart === 'digestione' ? 'Grafico Digestione' : expandedChart === 'neuro' ? 'Recupero Neurologico' : expandedChart === 'kcal' ? 'Calorie ingerite 0–24h' : 'Calorie ingerite 0–24h'}
            </span>
            <button type="button" onClick={() => { onClose(); setActiveHighlight(null); }} style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 'bold', background: '#1a1a1a', border: '2px solid #00e5ff', borderRadius: '10px', color: '#00e5ff', cursor: 'pointer' }}>X</button>
          </div>
          {expandedChart === 'percent' && <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '8px', lineHeight: 1.3 }}>Indice simulato di energia fisiologica del sistema nervoso centrale.</div>}
          {expandedChart === 'kcal' && <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '8px', lineHeight: 1.3 }}>Calorie ingerite nel corso della giornata in base ai pasti registrati.</div>}
        </div>

        {/* Main: grafico + timeline, poi analisi AI sotto */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Blocco grafico: occupa lo spazio flessibile sopra il pannello AI */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Scroll orizzontale solo sulla colonna grafico + timeline allineata */}
            <div
              style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
              onTouchStart={handleChartTouchStart}
              onTouchMove={handleChartTouchMove}
              onTouchEnd={handleChartTouchEnd}
            >
              <div
                style={{ width: `${220 * zoomLevel}%`, minWidth: `${800 * zoomLevel}px`, minHeight: '100%', display: 'flex', flexDirection: 'column' }}
                className="chart-modal-inner"
              >

                {/* Grafico: espande nello spazio rimasto sopra la timeline */}
                <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
                {expandedChart === 'percent' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={modalChartData} margin={{ top: 20, right: 15, left: 15, bottom: 15 }}>
                      <defs>
                        <linearGradient id="colorEnergiaModal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e676" stopOpacity={0.6}/><stop offset="95%" stopColor="#ffea00" stopOpacity={0.0}/></linearGradient>
                        <linearGradient id="colorRiservaModal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e676" stopOpacity={0.4}/><stop offset="95%" stopColor="#00e676" stopOpacity={0}/></linearGradient>
                        <filter id="modalGlowEnergia" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} padding={{ left: 0, right: 0 }} />
                      <YAxis domain={[0, 100]} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}%`} width={35} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${value}%`, 'Energia SNC']} labelFormatter={(label) => `Ore ${label}:00`} />
                      {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (<ReferenceLine key={`modal-sleep-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={activeHighlight === 'sveglia' ? 4 : 1.5} strokeOpacity={activeHighlight === 'sveglia' ? 1 : 0.8} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11 }} />))}
                      <ReferenceDot x={displayTime} y={dotY} isFront r={8} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                      <Area type="monotone" dataKey="riservaFisica" stroke="#00e676" fill="url(#colorRiservaModal)" fillOpacity={1} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="energyPast" stroke="#00e5ff" strokeWidth={activeHighlight === 'energia' ? 5 : (activeHighlight != null ? 2 : 3)} fillOpacity={activeHighlight == null ? 1 : (activeHighlight === 'energia' ? 1 : 0.55)} fill="url(#colorEnergiaModal)" filter={activeHighlight === 'energia' ? 'url(#modalGlowEnergia)' : undefined} connectNulls={false} />
                      <Area type="monotone" dataKey="energyFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" strokeOpacity={activeHighlight == null || activeHighlight === 'energia' ? 1 : 0.6} connectNulls={false} />
                      <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : expandedChart === 'kcal' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={modalChartData} margin={{ top: 20, right: 15, left: 15, bottom: 15 }}>
                      <defs><linearGradient id="modalColorEnergyKcal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9}/><stop offset="50%" stopColor="#047857" stopOpacity={0.7}/><stop offset="100%" stopColor="#dc2626" stopOpacity={0.6}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} padding={{ left: 0, right: 0 }} />
                      <YAxis domain={[0, Math.max(targetKcalChart, 1)]} tickFormatter={(val) => Math.round(Number(val))} stroke="#666" fontSize={10} width={35} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${Math.round(Number(value))} kcal`, 'Energia scalata']} labelFormatter={(label) => `Ore ${label}:00`} />
                      <ReferenceDot x={displayTime} y={scale(dotY)} isFront r={8} fill="#00e5ff" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                      <Area type="monotone" dataKey="kcalPast" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#modalColorEnergyKcal)" connectNulls={false} />
                      <Area type="monotone" dataKey="kcalFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : expandedChart === 'calorieTimeline' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={safeCalorieTimelineData} margin={{ top: 20, right: 15, left: 15, bottom: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(val) => `${val}:00`} stroke="#666" fontSize={10} padding={{ left: 0, right: 0 }} />
                      <YAxis domain={[0, Math.max(targetKcalChart, totalCaloriesTimeline || 0)]} tickFormatter={(val) => Math.round(Number(val))} stroke="#666" fontSize={10} width={35} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${Math.round(Number(value))} kcal`, 'Calorie cumulative']} labelFormatter={(label) => `Ore ${label}:00`} />
                      {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (<ReferenceLine key={`modal-ctl-sleep-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 10 }} />))}
                      <ReferenceDot x={displayTime} y={dotYCalorieTimeline ?? 0} isFront r={8} fill="#ff9800" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                      <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={modalChartData} margin={{ top: 20, right: 15, left: 15, bottom: 15 }}>
                      <defs>
                        <linearGradient id="modalColorAnabolic" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e5ff" stopOpacity={0.6}/><stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalColorCortisol" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#9c27b0" stopOpacity={0.4}/><stop offset="95%" stopColor="#9c27b0" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalColorEnergy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9}/><stop offset="50%" stopColor="#047857" stopOpacity={0.7}/><stop offset="100%" stopColor="#dc2626" stopOpacity={0.6}/></linearGradient>
                        <linearGradient id="modalColorGlicemia" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.9}/><stop offset="50%" stopColor="#f59e0b" stopOpacity={0.4}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalColorWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#007aff" stopOpacity={0.9}/><stop offset="50%" stopColor="#00e5ff" stopOpacity={0.4}/><stop offset="100%" stopColor="#007aff" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalColorDigestion" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9333ea" stopOpacity={0.9}/><stop offset="50%" stopColor="#a855f7" stopOpacity={0.5}/><stop offset="100%" stopColor="#9333ea" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalColorNeuro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.9}/><stop offset="50%" stopColor="#818cf8" stopOpacity={0.5}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                        <linearGradient id="modalNeuroFlow" x1="0" y1="0" x2="1" y2="0"><animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" /><animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" /><stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" /><stop offset="50%" stopColor="#818cf8" stopOpacity="1" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" /></linearGradient>
                        <filter id="modalGlowMulti" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                        <filter id="modalGlowCortisol" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      </defs>
                      <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(val) => `${val}:00`} tick={{ fill: '#666', fontSize: 11 }} padding={{ left: 0, right: 0 }} />
                      <YAxis domain={expandedChart === 'glicemia' ? [40, 220] : (expandedChart === 'kcal' ? [0, targetKcalChart] : [0, 100])} tickFormatter={(val) => expandedChart === 'kcal' ? Math.round(Number(val)) : (expandedChart === 'glicemia' ? val : `${val}%`)} tick={{ fill: '#555', fontSize: 11 }} width={35} />
                      <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} width={0} hide />
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                      {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (<ReferenceLine key={`modal-sleep2-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={activeHighlight === 'sveglia' ? 4 : 1.5} strokeOpacity={activeHighlight === 'sveglia' ? 1 : 0.8} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 10 }} />))}
                      <Area type="monotone" dataKey="anabolicScore" fill="url(#modalColorAnabolic)" stroke="transparent" fillOpacity={activeHighlight == null ? 0.35 : (activeHighlight === 'anabolica' ? 0.5 : 0.55)} yAxisId="anabolic" filter={activeHighlight === 'anabolica' ? 'url(#modalGlowMulti)' : undefined} />
                      <Area type="monotone" dataKey="cortisolScore" fill="url(#modalColorCortisol)" stroke="#9c27b0" strokeWidth={activeHighlight === 'cortisolo' ? 4 : 2} strokeOpacity={activeHighlight == null ? 1 : (activeHighlight === 'cortisolo' ? 1 : 0.6)} fillOpacity={activeHighlight == null ? 0.3 : (activeHighlight === 'cortisolo' ? 0.45 : 0.55)} yAxisId="anabolic" filter={activeHighlight === 'cortisolo' ? 'url(#modalGlowMulti)' : undefined} />
                      {(() => { const isMain = activeHighlight === 'energia' || (expandedChart === 'neuro' && activeHighlight === 'neuro') || (expandedChart === 'cortisolo' && activeHighlight === 'cortisolo') || (expandedChart === 'digestione' && activeHighlight === 'digestione'); return (<><Area type="monotone" dataKey={expandedChart === 'kcal' ? 'kcalPast' : expandedChart === 'glicemia' ? 'glicemiaPast' : expandedChart === 'idratazione' ? 'idratazionePast' : expandedChart === 'cortisolo' ? 'cortisoloPast' : expandedChart === 'digestione' ? 'digestionePast' : expandedChart === 'neuro' ? 'neuroPast' : 'energyPast'} strokeWidth={isMain ? 8 : (activeHighlight != null ? 3 : 6)} strokeOpacity={activeHighlight == null ? 1 : (isMain ? 1 : 0.6)} fillOpacity={activeHighlight == null ? 0.6 : (isMain ? 0.7 : 0.55)} fill={expandedChart === 'kcal' ? 'url(#modalColorEnergy)' : expandedChart === 'glicemia' ? 'url(#modalColorGlicemia)' : expandedChart === 'idratazione' ? 'url(#modalColorWater)' : expandedChart === 'cortisolo' ? 'url(#modalColorCortisol)' : expandedChart === 'digestione' ? 'url(#modalColorDigestion)' : expandedChart === 'neuro' ? 'url(#modalColorNeuro)' : 'url(#modalColorEnergy)'} filter={isMain ? 'url(#modalGlowMulti)' : undefined} /><Area type="monotone" dataKey={expandedChart === 'kcal' ? 'kcalFuture' : expandedChart === 'glicemia' ? 'glicemiaFuture' : expandedChart === 'idratazione' ? 'idratazioneFuture' : expandedChart === 'cortisolo' ? 'cortisoloFuture' : expandedChart === 'digestione' ? 'digestioneFuture' : expandedChart === 'neuro' ? 'neuroFuture' : 'energyFuture'} stroke={expandedChart === 'neuro' ? '#3730a3' : '#444'} strokeWidth={2} strokeDasharray="10 10" fill="transparent" strokeOpacity={activeHighlight == null || isMain ? 1 : 0.6} /></>); })()}
                      {expandedChart === 'kcal' && <Line type="monotone" dataKey="cortisolScaledToKcal" stroke="#9c27b0" strokeWidth={activeHighlight === 'cortisolo' ? 4 : (activeHighlight != null ? 1 : 2)} strokeDasharray="5 5" dot={false} strokeOpacity={activeHighlight == null || activeHighlight === 'cortisolo' ? 1 : 0.6} filter={activeHighlight === 'cortisolo' ? 'url(#modalGlowCortisol)' : undefined} />}
                      {expandedChart === 'glicemia' && <ReferenceLine y={85} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" />}
                      {expandedChart !== 'glicemia' && <Line type="monotone" dataKey="idealEnergy" stroke="rgba(255,255,255,0.2)" strokeWidth={2} strokeDasharray="8 8" dot={false} />}
                      <ReferenceDot x={displayTime} y={expandedChart === 'glicemia' ? dotGlicemia : (expandedChart === 'idratazione' ? dotIdratazione : (expandedChart === 'cortisolo' ? dotCortisolo : (expandedChart === 'digestione' ? dotDigestione : (expandedChart === 'neuro' ? dotNeuro : (expandedChart === 'kcal' ? (dotY != null ? (dotY / 100) * targetKcalChart : 0) : dotY)))))} isFront r={8} fill={expandedChart === 'glicemia' ? '#ef4444' : expandedChart === 'idratazione' ? '#00e5ff' : expandedChart === 'cortisolo' ? '#9c27b0' : expandedChart === 'digestione' ? '#9333ea' : expandedChart === 'neuro' ? '#6366f1' : expandedChart === 'kcal' ? '#00e5ff' : '#00e676'} stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                {wallClockNowLineHour != null && Number.isFinite(wallClockNowLineHour) ? (
                  <NowVerticalLineOverlay hour={wallClockNowLineHour} visible />
                ) : null}
                <TimeAlignmentChartDebugOverlay />
              </div>

                {/* Timeline nodi: non comprimibile, safe area in basso */}
                <div
                  style={{
                    flexShrink: 0,
                    width: '100%',
                    paddingTop: '8px',
                    paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '55px',
                      paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
                      paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
                      boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      overflow: 'visible',
                    }}
                  >
                    {modalEnergyStripGradient ? (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 'inherit',
                          background: modalEnergyStripGradient,
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
                    {wallClockNowLineHour != null && Number.isFinite(wallClockNowLineHour) ? (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: `${getTimePositionPercent(wallClockNowLineHour)}%`,
                          top: 0,
                          bottom: 0,
                          width: '1px',
                          transform: 'translateX(-50%)',
                          background:
                            'linear-gradient(180deg, rgba(224,252,255,0.35) 0%, rgba(0,229,255,0.95) 45%, rgba(0,229,255,0.95) 55%, rgba(224,252,255,0.25) 100%)',
                          boxShadow: MODAL_TIMELINE_NOW_GLOW,
                          pointerEvents: 'none',
                          zIndex: 3,
                        }}
                      />
                    ) : null}
                    {SHOW_TIME_ALIGNMENT_DEBUG
                      ? DEBUG_TIME_GRID_HOURS.map((h) => (
                          <div key={`time-debug-modal-tl-${h}`} aria-hidden style={getDebugGridLineTimelineStyle(h)} />
                        ))
                      : null}
                    {(activeNodesWithStack || []).map(node => renderTimelineNode(node))}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Simulazione: slider tempo (se attivo) */}
          {isSimulationMode && selectedSimNode && (
            <div style={{ flexShrink: 0, marginTop: '8px', padding: '15px', background: 'rgba(98, 0, 234, 0.15)', borderRadius: '12px', border: '1px solid #6200ea' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <strong style={{ color: '#fff', fontSize: '1.1rem' }}>⏱ Sposta: {selectedSimNode.name || selectedSimNode.desc || selectedSimNode.type || 'Evento'}</strong>
                <span style={{ color: '#00e5ff', fontWeight: 'bold', fontSize: '1.2rem', background: '#222', padding: '4px 10px', borderRadius: '8px' }}>
                  {typeof (selectedSimNode.time ?? selectedSimNode.mealTime) === 'number' ? `${String(Math.floor(selectedSimNode.time ?? selectedSimNode.mealTime)).padStart(2, '0')}:${String(Math.round(((selectedSimNode.time ?? selectedSimNode.mealTime) % 1) * 60)).padStart(2, '0')}` : (selectedSimNode.time ?? selectedSimNode.mealTime ?? '00:00')}
                </span>
              </div>
              <input type="range" min={0} max={1439} value={typeof (selectedSimNode.time ?? selectedSimNode.mealTime) === 'number' ? Math.round((selectedSimNode.time ?? selectedSimNode.mealTime) * 60) : (() => { const t = selectedSimNode.time ?? selectedSimNode.mealTime ?? '00:00'; const parts = String(t).split(':'); return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0); })()} onChange={(e) => { const mins = parseInt(e.target.value, 10); setSelectedSimNode(prev => prev ? { ...prev, time: mins / 60, mealTime: mins / 60 } : null); if (onTimeChange) onTimeChange(selectedSimNode.id || selectedSimNode.idLog, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`); }} style={{ width: '100%', accentColor: '#00e5ff', height: '6px', outline: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#aaa', marginTop: '8px' }}><span>00:00</span><span>12:00</span><span>23:59</span></div>
            </div>
          )}

          {/* Contenitore Analisi / Descrizione AI (in basso, scrollabile) */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px', borderTop: '1px solid #222', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', background: '#222', borderRadius: '20px', padding: '4px', marginBottom: '15px', flexShrink: 0 }}>
              <div role="button" tabIndex={0} onClick={() => setBottomTab('desc')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBottomTab('desc'); } }} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '16px', background: bottomTab === 'desc' ? '#333' : 'transparent', color: bottomTab === 'desc' ? '#fff' : '#888', cursor: 'pointer', transition: 'all 0.3s' }}>Descrizione</div>
              <div role="button" tabIndex={0} onClick={() => setBottomTab('ai')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBottomTab('ai'); } }} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '16px', background: bottomTab === 'ai' ? '#00e5ff' : 'transparent', color: bottomTab === 'ai' ? '#000' : '#888', fontWeight: bottomTab === 'ai' ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.3s' }}>Analisi AI</div>
            </div>
            {bottomTab === 'desc' ? (
              (() => {
                const termConfig = expandedChart === 'percent' ? [{ key: 'energia', label: 'Energia SNC', color: '#00e676' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'calorieTimeline' ? [{ key: 'energia', label: 'Calorie cumulative', color: '#ff9800' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'kcal' ? [{ key: 'energia', label: 'Calorie', color: '#00e5ff' }, { key: 'anabolica', label: 'Finestra Anabolica', color: '#00e5ff' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'neuro' ? [{ key: 'neuro', label: 'Recupero Neurologico', color: '#6366f1' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'cortisolo' ? [{ key: 'cortisolo', label: 'Cortisolo', color: '#9c27b0' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'glicemia' ? [{ key: 'energia', label: 'Glicemia', color: '#ef4444' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'idratazione' ? [{ key: 'energia', label: 'Idratazione', color: '#00e5ff' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : expandedChart === 'digestione' ? [{ key: 'digestione', label: 'Digestione', color: '#9333ea' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }] : [{ key: 'anabolica', label: 'Finestra Anabolica', color: '#00e5ff' }, { key: 'cortisolo', label: 'Cortisolo', color: '#9c27b0' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'energia', label: 'Energia / Calorie', color: '#00e5ff' }, { key: 'digestione', label: 'Digestione', color: '#9333ea' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }];
                const currentKcalVal = dotY != null ? Math.round((dotY / 100) * targetKcalChart) : 0;
                const idealKcalVal = idealDotY != null ? Math.round((idealDotY / 100) * targetKcalChart) : 0;
                const descriptions = { percent: `Quanto "carburante" ha il tuo cervello. Dopo la [Sveglia] 🌅 si ricarica. All'[Ora attuale] sei al ${Math.round(dotY ?? 0)}% (ideale ${Math.round(idealDotY ?? 0)}%).`, calorieTimeline: `Calorie nel tempo. All'[Ora attuale] sei a ${Math.round(dotYCalorieTimeline ?? 0)} kcal.`, kcal: `[Calorie] durante il giorno. Ora ${currentKcalVal} kcal (target ${idealKcalVal} kcal).`, neuro: `Recupero neurologico. All'[Ora attuale] ${Math.round(dotNeuro ?? 0)}%.`, cortisolo: `Ormone dello stress. Ora ${Math.round(dotCortisolo ?? 0)}/100.`, glicemia: `Zucchero nel sangue. Stimato ${Math.round(dotGlicemia ?? 0)} mg/dL.`, idratazione: `Idratazione. Ora ${Math.round(dotIdratazione ?? 0)}%.`, digestione: `Digestione. Ora ${Math.round(dotDigestione ?? 0)}%.` };
                const text = descriptions[expandedChart] || descriptions.percent;
                const parts = text.split(/(\[[^\]]+\])/g);
                const linkStyle = (key, color) => ({ fontWeight: 'bold', color, borderBottom: `1px solid ${color}`, cursor: 'pointer', padding: '0 2px', borderRadius: '2px', background: activeHighlight === key ? `${color}22` : 'transparent', transition: 'background 0.2s ease' });
                return (
                  <p style={{ fontSize: '1rem', lineHeight: 1.85, color: '#c8c8c8', margin: 0 }}>
                    {parts.map((part, i) => {
                      const m = part.match(/^\[([^\]]+)\]$/);
                      if (m) {
                        const term = termConfig.find(t => t.label === m[1]);
                        if (!term) return part;
                        const isActive = activeHighlight === term.key;
                        const handleTermClick = () => { if (highlightResetTimeoutRef.current) clearTimeout(highlightResetTimeoutRef.current); setActiveHighlight(isActive ? null : term.key); if (!isActive) highlightResetTimeoutRef.current = setTimeout(() => { setActiveHighlight(null); highlightResetTimeoutRef.current = null; }, 3000); };
                        return <span key={i} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handleTermClick(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTermClick(); } }} style={linkStyle(term.key, term.color)}>{term.label}</span>;
                      }
                      return part;
                    })}
                  </p>
                );
              })()
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }} onTouchStart={handleBottomTouchStart} onTouchEnd={handleBottomTouchEnd}>
                {aiInsightsList.length === 0 ? (
                  <>
                    <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '16px' }}>Nessuna analisi generata oggi.</p>
                    <button type="button" onClick={runGenerateGlobalAI} disabled={isAiLoading} style={{ padding: '12px 18px', fontSize: '0.85rem', fontWeight: 'bold', background: 'linear-gradient(135deg, rgba(0,229,255,0.2) 0%, rgba(147,51,234,0.15) 100%)', border: '1px solid rgba(0,229,255,0.5)', borderRadius: '10px', color: '#00e5ff', cursor: isAiLoading ? 'wait' : 'pointer', opacity: isAiLoading ? 0.8 : 1, display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      {isAiLoading ? (
                        '...'
                      ) : (
                        <>
                          <img src="/nuova-icona.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
                          Genera Analisi Globale (AI)
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '0.75rem', color: '#b0bec5', marginBottom: '8px' }}>Analisi ore {(aiInsightsList[Math.min(currentAiIndex, aiInsightsList.length - 1)] ?? {}).time ?? '--:--'}</div>
                    {isAiLoading ? <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#00e5ff', fontSize: '0.85rem', marginBottom: '12px' }}><span>...</span> L'AI sta analizzando...</div> : <InteractiveAIText text={(aiInsightsList[Math.min(currentAiIndex, aiInsightsList.length - 1)] ?? {}).text ?? ''} onKeywordClick={handleGlobalKeywordClick} />}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>{aiInsightsList.map((_, i) => (<span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === currentAiIndex ? '#00e5ff' : 'rgba(255,255,255,0.25)' }} />))}</div>
                    <button type="button" onClick={runGenerateGlobalAI} disabled={isAiLoading} style={{ marginTop: '12px', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, background: 'transparent', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', cursor: isAiLoading ? 'wait' : 'pointer' }}>+ Nuova Analisi</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Carousel grafici fullscreen (analisi) — dati già processati dal parent. */
export function FullscreenMetabolicCharts({
  availableFullscreenCharts,
  fullscreenChartIndex,
  setFullscreenChartIndex,
  exitFullscreen,
  zoomLevel,
  setZoomLevel,
  fullscreenChartScrollRef,
  openTimelineQuickAddAtCenter,
  handleCenterZoomAndPan,
  finalChartData,
  safeCalorieTimelineData,
  displayTime,
  dotY,
  dotGlicemia,
  dotIdratazione,
  dotCortisolo,
  dotDigestione,
  dotNeuro,
  scale,
  targetKcalChart,
  totalCaloriesTimeline,
  nodesForEnergySimulation,
  isViewingPastDate,
  currentTime,
  timelineNodiProps,
}) {
  const currentChartType = availableFullscreenCharts[fullscreenChartIndex] || 'percent';
  const fullscreenChartLabel =
    currentChartType === 'percent'
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
                      <stop offset="5%" stopColor="#00e676" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#ffea00" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorRiservaFullscreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00e676" stopOpacity={0.5}/>
                      <stop offset="100%" stopColor="#00e676" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1c', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                    formatter={(value, name) => {
                      const formattedValue = typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—');
                      const displayName = name === 'energyPast' || name === 'Energia SNC' ? 'Energia SNC' : name === 'riservaFisica' ? 'Riserva Fisica' : name === 'energyFuture' ? 'Previsione' : name;
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
                  {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
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
                      <stop offset="0%" stopColor="#9c27b0" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#9c27b0" stopOpacity={0.2}/>
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
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value != null ? Number(value).toFixed(0) : '—', 'Glicemia']} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
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
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'idratazionePast' ? 'Idratazione' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
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
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'neuroPast' ? 'Neuro' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
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
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'digestionePast' ? 'Digestione' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
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
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [value != null ? Math.round(Number(value)) : '—', name === 'kcalPast' ? 'Kcal' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
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
              <TimelineNodi {...timelineNodiProps} />
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
          border: '1px solid rgba(255, 255, 255, 0.15)'
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
        <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel((prev) => Math.min(prev + 0.2, 1.5))} title="Ingrandisci">+</button>
        <button type="button" className="zoom-btn-vertical" onClick={handleCenterZoomAndPan} title="Centra su ora attuale (30%)">🎯</button>
        <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel((prev) => Math.max(prev - 0.2, 0.45))} title="Riduci">−</button>
      </div>
    </div>
  );
}
