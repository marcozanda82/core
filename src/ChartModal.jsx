/**
 * ChartModal.jsx — Modale fullscreen per grafici con glossario e carosello swipe.
 * Estratto da SalaComandi.jsx per refactoring UI.
 */
import React, { useRef } from 'react';
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
  InteractiveAIText
} from './coreEngine';

const CHART_VIEWS_CAROUSEL = ['percent', 'kcal', 'calorieTimeline', 'glicemia', 'idratazione', 'neuro', 'cortisolo', 'digestione'];

const AI_KEYWORD_TO_CHART = { 'Sveglia': null, 'Energia SNC': 'percent', 'Recupero Neurologico': 'neuro', 'Finestra Anabolica': 'kcal', 'Cortisolo': 'cortisolo', 'Glicemia': 'glicemia', 'Digestione': 'digestione' };

export default function ChartModal({
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
  totalCaloriesTimeline = 0
}) {
  const modalSwipeStartXRef = useRef(null);
  const bottomTouchStartX = useRef(null);
  const highlightResetTimeoutRef = useRef(null);

  const currentIndex = CHART_VIEWS_CAROUSEL.indexOf(expandedChart);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  const handleModalSwipeStart = (e) => { modalSwipeStartXRef.current = e.touches?.[0]?.clientX ?? e.clientX; };
  const handleModalSwipeEnd = (e) => {
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    const startX = modalSwipeStartXRef.current;
    if (startX == null) return;
    const deltaX = endX - startX;
    const SWIPE_THRESHOLD = 50;
    if (deltaX < -SWIPE_THRESHOLD) {
      const nextIndex = (safeIndex + 1) % CHART_VIEWS_CAROUSEL.length;
      setExpandedChart(CHART_VIEWS_CAROUSEL[nextIndex]);
      setActiveHighlight(null);
    } else if (deltaX > SWIPE_THRESHOLD) {
      const prevIndex = safeIndex === 0 ? CHART_VIEWS_CAROUSEL.length - 1 : safeIndex - 1;
      setExpandedChart(CHART_VIEWS_CAROUSEL[prevIndex]);
      setActiveHighlight(null);
    }
    modalSwipeStartXRef.current = null;
  };
  const handleModalSwipeStartMouse = (e) => { modalSwipeStartXRef.current = e.clientX; };
  const handleModalSwipeEndMouse = (e) => { if (modalSwipeStartXRef.current != null) { handleModalSwipeEnd({ changedTouches: null, clientX: e.clientX }); } };

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
    if (deltaX > 50 && currentAiIndex < aiInsightsList.length - 1) {
      setCurrentAiIndex(prev => prev + 1);
    } else if (deltaX < -50 && currentAiIndex > 0) {
      setCurrentAiIndex(prev => prev - 1);
    }
    bottomTouchStartX.current = null;
  };

  const runGenerateGlobalAI = () => {
    setIsAiLoading(true);
    const prompt = buildGlobalAIPrompt({
      displayTime,
      energy: dotY,
      cortisolo: dotCortisolo,
      glicemia: dotGlicemia,
      idratazione: dotIdratazione,
      digestione: dotDigestione,
      neuro: dotNeuro
    });
    const timeStr = `${String(Math.floor(displayTime)).padStart(2, '0')}:${String(Math.round((displayTime % 1) * 60)).padStart(2, '0')}`;
    callGeminiAPIWithRotation(prompt)
      .then((result) => {
        const newInsight = { time: timeStr, text: result };
        setAiInsightsList(prev => {
          const next = [...prev, newInsight];
          setCurrentAiIndex(next.length - 1);
          return next;
        });
        setIsAiLoading(false);
      })
      .catch((err) => {
        console.error("Errore AI Analisi Grafico:", err);
        setAiInsightsList(prev => {
          const next = [...prev, { time: timeStr, text: "❌ Connessione con Core AI fallita. Verifica le API Key." }];
          setCurrentAiIndex(next.length - 1);
          return next;
        });
        setIsAiLoading(false);
      });
  };

  const safeDailyLog = dailyLog || [];

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100000, background: '#050505', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      role="dialog"
      aria-modal="true"
      aria-label="Grafico a tutto schermo"
    >
      <div
        style={{ flex: '0 0 60%', minHeight: 0, padding: '16px', display: 'flex', flexDirection: 'column' }}
        onTouchStart={handleModalSwipeStart}
        onTouchEnd={handleModalSwipeEnd}
        onMouseDown={handleModalSwipeStartMouse}
        onMouseUp={handleModalSwipeEndMouse}
        onMouseLeave={() => { modalSwipeStartXRef.current = null; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: '#00e5ff', fontWeight: 'bold' }}>
            {expandedChart === 'percent' ? '⚡ Energia SNC (%)' : expandedChart === 'calorieTimeline' ? '📈 Calorie cumulative' : expandedChart === 'glicemia' ? 'Simulatore Glicemico' : expandedChart === 'idratazione' ? 'Simulatore Idratazione' : expandedChart === 'cortisolo' ? 'Cortisolo / Stress' : expandedChart === 'digestione' ? 'Grafico Digestione' : expandedChart === 'neuro' ? 'Recupero Neurologico (Dopamina & Adrenalina)' : expandedChart === 'kcal' ? 'Calorie ingerite 0–24h' : 'Calorie ingerite 0–24h'}
          </span>
          <button type="button" onClick={() => { onClose(); setActiveHighlight(null); }} style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 'bold', background: '#1a1a1a', border: '2px solid #00e5ff', borderRadius: '10px', color: '#00e5ff', cursor: 'pointer' }}>Chiudi</button>
        </div>
        {expandedChart === 'percent' && (
          <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '8px', lineHeight: 1.3 }} title="Indice simulato di energia fisiologica del sistema nervoso centrale. Dipende da sonno, ritmo circadiano, digestione, stress e altri fattori.">
            Indice simulato di energia fisiologica del sistema nervoso centrale. Dipende da sonno, ritmo circadiano, digestione, stress e altri fattori.
          </div>
        )}
        {expandedChart === 'kcal' && (
          <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '8px', lineHeight: 1.3 }} title="Calorie ingerite nel corso della giornata in base ai pasti registrati.">
            Calorie ingerite nel corso della giornata in base ai pasti registrati.
          </div>
        )}
        <div style={{ flex: 1, minHeight: 120 }}>
          {expandedChart === 'percent' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={modalChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEnergiaModal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00e676" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#ffea00" stopOpacity={0.0}/>
                  </linearGradient>
                  <filter id="modalGlowEnergia" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} />
                <YAxis domain={[0, 100]} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${value}%`, 'Energia SNC']} labelFormatter={(label) => `Ore ${label}:00`} />
                {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (
                  <ReferenceLine key={`modal-sleep-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={activeHighlight === 'sveglia' ? 4 : 1.5} strokeOpacity={activeHighlight === 'sveglia' ? 1 : 0.8} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11 }} />
                ))}
                <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={activeHighlight === 'ora' ? 4 : 1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10 }} />
                <ReferenceDot x={displayTime} y={dotY} isFront r={8} fill="#00e676" stroke="#fff" strokeWidth={2} />
                <Area type="monotone" dataKey="energyPast" stroke="#00e676" strokeWidth={activeHighlight === 'energia' ? 5 : (activeHighlight != null ? 2 : 3)} fillOpacity={activeHighlight == null ? 1 : (activeHighlight === 'energia' ? 1 : 0.55)} fill="url(#colorEnergiaModal)" filter={activeHighlight === 'energia' ? 'url(#modalGlowEnergia)' : undefined} connectNulls={false} />
                <Area type="monotone" dataKey="energyFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" strokeOpacity={activeHighlight == null || activeHighlight === 'energia' ? 1 : 0.6} connectNulls={false} />
                <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : expandedChart === 'kcal' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={modalChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="modalColorEnergyKcal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9}/><stop offset="50%" stopColor="#047857" stopOpacity={0.7}/><stop offset="100%" stopColor="#dc2626" stopOpacity={0.6}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} />
                <YAxis domain={[0, Math.max(targetKcalChart, 1)]} tickFormatter={(val) => Math.round(Number(val))} stroke="#666" fontSize={10} width={36} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${Math.round(Number(value))} kcal`, 'Energia scalata']} labelFormatter={(label) => `Ore ${label}:00`} />
                <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10 }} />
                <ReferenceDot x={displayTime} y={scale(dotY)} isFront r={8} fill="#00e5ff" stroke="#fff" strokeWidth={2} />
                <Area type="monotone" dataKey="kcalPast" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#modalColorEnergyKcal)" connectNulls={false} />
                <Area type="monotone" dataKey="kcalFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : expandedChart === 'calorieTimeline' ? (
            <>
              <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '8px', lineHeight: 1.3 }} title="Accumulo delle calorie ingerite durante la giornata in base ai pasti registrati.">
                Accumulo delle calorie ingerite durante la giornata in base ai pasti registrati.
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={safeCalorieTimelineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(val) => `${val}:00`} stroke="#666" fontSize={10} />
                  <YAxis domain={[0, Math.max(targetKcalChart, totalCaloriesTimeline || 0)]} tickFormatter={(val) => Math.round(Number(val))} stroke="#666" fontSize={10} width={36} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${Math.round(Number(value))} kcal`, 'Calorie cumulative']} labelFormatter={(label) => `Ore ${label}:00`} />
                  {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (
                    <ReferenceLine key={`modal-ctl-sleep-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 10 }} />
                  ))}
                  <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10 }} />
                  <ReferenceDot x={displayTime} y={dotYCalorieTimeline ?? 0} isFront r={8} fill="#ff9800" stroke="#fff" strokeWidth={2} />
                  <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={modalChartData} margin={{ top: 15, right: 25, left: -10, bottom: 0 }}>
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
                <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(val) => `${val}:00`} tick={{ fill: '#666', fontSize: 11 }} />
                <YAxis domain={expandedChart === 'glicemia' ? [40, 220] : (expandedChart === 'kcal' ? [0, targetKcalChart] : [0, 100])} tickFormatter={(val) => expandedChart === 'kcal' ? Math.round(Number(val)) : (expandedChart === 'glicemia' ? val : `${val}%`)} tick={{ fill: '#555', fontSize: 11 }} width={36} />
                <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} hide />
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                {safeDailyLog.filter(item => item.type === 'sleep').map((sleepItem, index) => (
                  <ReferenceLine key={`modal-sleep2-${sleepItem.id ?? index}`} x={sleepItem.wakeTime ?? 7.5} stroke="#4ba3e3" strokeDasharray="3 3" strokeWidth={activeHighlight === 'sveglia' ? 4 : 1.5} strokeOpacity={activeHighlight === 'sveglia' ? 1 : 0.8} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 10 }} />
                ))}
                <Area type="monotone" dataKey="anabolicScore" fill="url(#modalColorAnabolic)" stroke="transparent" fillOpacity={activeHighlight == null ? 0.35 : (activeHighlight === 'anabolica' ? 0.5 : 0.55)} yAxisId="anabolic" filter={activeHighlight === 'anabolica' ? 'url(#modalGlowMulti)' : undefined} />
                <Area type="monotone" dataKey="cortisolScore" fill="url(#modalColorCortisol)" stroke="#9c27b0" strokeWidth={activeHighlight === 'cortisolo' ? 4 : 2} strokeOpacity={activeHighlight == null ? 1 : (activeHighlight === 'cortisolo' ? 1 : 0.6)} fillOpacity={activeHighlight == null ? 0.3 : (activeHighlight === 'cortisolo' ? 0.45 : 0.55)} yAxisId="anabolic" filter={activeHighlight === 'cortisolo' ? 'url(#modalGlowMulti)' : undefined} />
                {(() => { const isMainSeriesHighlight = activeHighlight === 'energia' || (expandedChart === 'neuro' && activeHighlight === 'neuro') || (expandedChart === 'cortisolo' && activeHighlight === 'cortisolo') || (expandedChart === 'digestione' && activeHighlight === 'digestione'); return (
                  <>
                    <Area type="monotone" dataKey={expandedChart === 'kcal' ? 'kcalPast' : (expandedChart === 'glicemia' ? 'glicemiaPast' : expandedChart === 'idratazione' ? 'idratazionePast' : expandedChart === 'cortisolo' ? 'cortisoloPast' : expandedChart === 'digestione' ? 'digestionePast' : expandedChart === 'neuro' ? 'neuroPast' : 'energyPast')} strokeWidth={isMainSeriesHighlight ? 8 : (activeHighlight != null ? 3 : 6)} strokeOpacity={activeHighlight == null ? 1 : (isMainSeriesHighlight ? 1 : 0.6)} fillOpacity={activeHighlight == null ? 0.6 : (isMainSeriesHighlight ? 0.7 : 0.55)} fill={expandedChart === 'kcal' ? 'url(#modalColorEnergy)' : (expandedChart === 'glicemia' ? 'url(#modalColorGlicemia)' : expandedChart === 'idratazione' ? 'url(#modalColorWater)' : expandedChart === 'cortisolo' ? 'url(#modalColorCortisol)' : expandedChart === 'digestione' ? 'url(#modalColorDigestion)' : expandedChart === 'neuro' ? 'url(#modalColorNeuro)' : 'url(#modalColorEnergy)')} filter={isMainSeriesHighlight ? 'url(#modalGlowMulti)' : undefined} />
                    <Area type="monotone" dataKey={expandedChart === 'kcal' ? 'kcalFuture' : (expandedChart === 'glicemia' ? 'glicemiaFuture' : expandedChart === 'idratazione' ? 'idratazioneFuture' : expandedChart === 'cortisolo' ? 'cortisoloFuture' : expandedChart === 'digestione' ? 'digestioneFuture' : expandedChart === 'neuro' ? 'neuroFuture' : 'energyFuture')} stroke={expandedChart === 'neuro' ? '#3730a3' : '#444'} strokeWidth={2} strokeDasharray="10 10" fill="transparent" strokeOpacity={activeHighlight == null || isMainSeriesHighlight ? 1 : 0.6} />
                  </>
                ); })()}
                {expandedChart === 'kcal' && <Line type="monotone" dataKey="cortisolScaledToKcal" stroke="#9c27b0" strokeWidth={activeHighlight === 'cortisolo' ? 4 : (activeHighlight != null ? 1 : 2)} strokeDasharray="5 5" dot={false} strokeOpacity={activeHighlight == null || activeHighlight === 'cortisolo' ? 1 : 0.6} filter={activeHighlight === 'cortisolo' ? 'url(#modalGlowCortisol)' : undefined} />}
                {expandedChart === 'glicemia' && <ReferenceLine y={85} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" />}
                {expandedChart !== 'glicemia' && <Line type="monotone" dataKey="idealEnergy" stroke="rgba(255,255,255,0.2)" strokeWidth={2} strokeDasharray="8 8" dot={false} />}
                <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.4)" strokeDasharray="5 5" strokeWidth={activeHighlight === 'ora' ? 4 : 1} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10 }} />
                <ReferenceDot x={displayTime} y={expandedChart === 'glicemia' ? dotGlicemia : (expandedChart === 'idratazione' ? dotIdratazione : (expandedChart === 'cortisolo' ? dotCortisolo : (expandedChart === 'digestione' ? dotDigestione : (expandedChart === 'neuro' ? dotNeuro : (expandedChart === 'kcal' ? (dotY != null ? (dotY / 100) * targetKcalChart : 0) : dotY)))))} isFront r={8} fill={expandedChart === 'neuro' ? '#6366f1' : '#00e5ff'} stroke="#fff" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ flexShrink: 0, height: '55px', marginTop: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #222', position: 'relative', overflow: 'hidden' }}>
          {activeNodesWithStack.map((node) => {
            const primaryTypes = MODAL_NODE_PRIMARY[expandedChart] ?? NODE_IMPORTANCE[expandedChart] ?? [];
            const isPrimary = primaryTypes.includes(node.type);
            const isWork = node.type === 'work';
            const percent = (node.time / 24) * 100;
            const durationPercent = isWork ? ((node.duration || 1) / 24) * 100 : 0;
            const iconContent = NODE_TYPE_ICON[node.type] ?? (node.type === 'stimulant' ? '☕' : (node.type === 'water' ? '💧' : (node.type === 'work' ? '💼' : (node.type === 'workout' ? '⚡' : '🥗'))));
            const bgColor = node.type === 'stimulant' ? 'rgba(245,158,11,0.2)' : (node.type === 'water' ? 'rgba(0,229,255,0.15)' : (node.type === 'work' ? 'rgba(255,234,0,0.15)' : (node.type === 'nap' ? 'rgba(129,140,248,0.2)' : (node.type === 'meditation' ? 'rgba(34,197,94,0.2)' : (node.type === 'supplements' ? 'rgba(168,85,247,0.2)' : (node.type === 'sunlight' ? 'rgba(251,191,36,0.2)' : 'rgba(0,0,0,0.6)'))))));
            const borderColor = node.type === 'stimulant' ? '#f59e0b' : (node.type === 'water' ? '#00e5ff' : (node.type === 'work' ? '#ffea00' : (node.type === 'nap' ? '#818cf8' : (node.type === 'meditation' ? '#22c55e' : (node.type === 'supplements' ? '#a855f7' : (node.type === 'sunlight' ? '#fbbf24' : '#00e5ff'))))));
            const timeLabelStr = `${Math.floor(node.time)}:${String(Math.round((node.time % 1) * 60)).padStart(2, '0')}`;
            const nodeStyle = { zIndex: isPrimary ? 10 : 1, filter: isPrimary ? 'none' : 'grayscale(100%)', opacity: isPrimary ? 1 : 0.4, transform: isPrimary ? (isWork ? undefined : 'translateX(-50%)') : (isWork ? 'scale(0.8)' : 'translateX(-50%) scale(0.8)'), transition: 'all 0.3s ease', pointerEvents: 'none' };
            if (isWork) {
              return (
                <div key={node.id} style={{ position: 'absolute', left: `${percent}%`, width: `${durationPercent}%`, top: '50%', marginTop: -18, height: '36px', background: 'rgba(255,234,0,0.15)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', ...nodeStyle }}>
                  💼
                </div>
              );
            }
            return (
              <div key={node.id} style={{ position: 'absolute', left: `${percent}%`, top: '50%', marginTop: -18, width: '36px', height: '36px', borderRadius: '50%', background: bgColor, border: `2px solid ${borderColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', ...nodeStyle }}>
                <span style={{ color: borderColor, fontWeight: 'bold', marginBottom: '1px' }}>{timeLabelStr}</span>
                <span style={{ lineHeight: 1, fontSize: '1rem' }}>{iconContent}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: '0 0 40%', overflow: 'auto', padding: '16px', borderTop: '1px solid #222', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', background: '#222', borderRadius: '20px', padding: '4px', marginBottom: '15px', flexShrink: 0 }}>
          <div role="button" tabIndex={0} onClick={() => setBottomTab('desc')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBottomTab('desc'); } }} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '16px', background: bottomTab === 'desc' ? '#333' : 'transparent', color: bottomTab === 'desc' ? '#fff' : '#888', cursor: 'pointer', transition: 'all 0.3s' }}>
            Descrizione
          </div>
          <div role="button" tabIndex={0} onClick={() => setBottomTab('ai')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBottomTab('ai'); } }} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '16px', background: bottomTab === 'ai' ? '#00e5ff' : 'transparent', color: bottomTab === 'ai' ? '#000' : '#888', fontWeight: bottomTab === 'ai' ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.3s' }}>
            Analisi AI
          </div>
        </div>
        {bottomTab === 'desc' ? (
          (() => {
            const termConfig = expandedChart === 'percent'
              ? [{ key: 'energia', label: 'Energia SNC', color: '#00e676' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
              : expandedChart === 'calorieTimeline'
                ? [{ key: 'energia', label: 'Calorie cumulative', color: '#ff9800' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                : expandedChart === 'kcal'
                ? [{ key: 'energia', label: 'Calorie', color: '#00e5ff' }, { key: 'anabolica', label: 'Finestra Anabolica', color: '#00e5ff' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                : expandedChart === 'neuro'
                ? [{ key: 'neuro', label: 'Recupero Neurologico', color: '#6366f1' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                : expandedChart === 'cortisolo'
                ? [{ key: 'cortisolo', label: 'Cortisolo', color: '#9c27b0' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                : expandedChart === 'glicemia'
                  ? [{ key: 'energia', label: 'Glicemia', color: '#ef4444' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                  : expandedChart === 'idratazione'
                    ? [{ key: 'energia', label: 'Idratazione', color: '#00e5ff' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                    : expandedChart === 'digestione'
                      ? [{ key: 'digestione', label: 'Digestione', color: '#9333ea' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }]
                      : [{ key: 'anabolica', label: 'Finestra Anabolica', color: '#00e5ff' }, { key: 'cortisolo', label: 'Cortisolo', color: '#9c27b0' }, { key: 'sveglia', label: 'Sveglia', color: '#4ba3e3' }, { key: 'energia', label: 'Energia / Calorie', color: '#00e5ff' }, { key: 'digestione', label: 'Digestione', color: '#9333ea' }, { key: 'ora', label: 'Ora attuale', color: '#e0e0e0' }];
            const currentKcalVal = dotY != null ? Math.round((dotY / 100) * targetKcalChart) : 0;
            const idealKcalVal = idealDotY != null ? Math.round((idealDotY / 100) * targetKcalChart) : 0;
            const descriptions = {
              percent: `Quanto "carburante" ha il tuo cervello. Dopo la [Sveglia] 🌅 si ricarica, poi si consuma con la giornata. All'[Ora attuale] sei al ${Math.round(dotY ?? 0)}% (ideale intorno al ${Math.round(idealDotY ?? 0)}%). Pasti 🥗 e riposo lo fanno risalire.`,
              calorieTimeline: `Quante calorie hai assunto nel tempo. Ogni pasto 🥗 fa salire la linea. All'[Ora attuale] sei a ${Math.round(dotYCalorieTimeline ?? 0)} kcal in totale. Utile per capire se mangi abbastanza (o troppo) durante il giorno.`,
              kcal: `Le [Calorie] che assumi durante il giorno. La [Finestra Anabolica] indica quando il corpo è pronto a usare le proteine per i muscoli. Ora sei a ${currentKcalVal} kcal (target ideale ${idealKcalVal} kcal).`,
              neuro: `Quanto il tuo cervello è "stanco". Gli stimolanti ☕ lo caricano, ma il vero recupero arriva solo con il riposo. All'[Ora attuale] sei al ${Math.round(dotNeuro ?? 0)}% (meglio restare sopra il 40%). Allenamenti ⚡ e lavoro 💼 lo fanno scendere.`,
              cortisolo: `È l'ormone dello stress e dell'energia. Sale quando ti alleni ⚡ o lavori sodo 💼, scende quando ti rilassi. Se resta sempre alto, il corpo non recupera. Ora sei a ${Math.round(dotCortisolo ?? 0)}/100 (la sera è meglio sotto 40).`,
              glicemia: `Mostra quanto zucchero hai nel sangue. I picchi dopo i pasti 🥗 sono normali; se sono troppo alti o frequenti, ti sentirai stanco poco dopo. All'[Ora attuale] il valore stimato è ${Math.round(dotGlicemia ?? 0)} mg/dL (a riposo intorno a 85 è ok).`,
              idratazione: `Quanto sei idratato dalla [Sveglia] in poi. Bere 💧 fa salire la linea. All'[Ora attuale] sei al ${Math.round(dotIdratazione ?? 0)}% (meglio restare sopra il 60%). Poco acqua = meno energia e concentrazione.`,
              digestione: `Quanto il corpo è ancora impegnato a digerire. Dopo un pasto 🥗 la linea sale, poi scende. All'[Ora attuale] è al ${Math.round(dotDigestione ?? 0)}% (0% = digestione finita). In digestione è meglio non allenarsi subito.`
            };
            const text = descriptions[expandedChart] || descriptions.percent;
            const parts = text.split(/(\[[^\]]+\])/g);
            const linkStyle = (key, color) => ({ fontWeight: 'bold', color, borderBottom: `1px solid ${color}`, cursor: 'pointer', padding: '0 2px', borderRadius: '2px', background: activeHighlight === key ? `${color}22` : 'transparent', transition: 'background 0.2s ease' });
            return (
              <p style={{ fontSize: '1rem', lineHeight: 1.85, color: '#c8c8c8', margin: 0, letterSpacing: '0.02em' }}>
                {parts.map((part, i) => {
                  const m = part.match(/^\[([^\]]+)\]$/);
                  if (m) {
                    const term = termConfig.find(t => t.label === m[1]);
                    if (!term) return part;
                    const isActive = activeHighlight === term.key;
                    const handleTermClick = () => {
                      if (highlightResetTimeoutRef.current) { clearTimeout(highlightResetTimeoutRef.current); highlightResetTimeoutRef.current = null; }
                      const next = isActive ? null : term.key;
                      setActiveHighlight(next);
                      if (next != null) { highlightResetTimeoutRef.current = setTimeout(() => { setActiveHighlight(null); highlightResetTimeoutRef.current = null; }, 3000); }
                    };
                    return (
                      <span key={i} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handleTermClick(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTermClick(); } }} style={linkStyle(term.key, term.color)}>
                        {term.label}
                      </span>
                    );
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
                <button type="button" onClick={runGenerateGlobalAI} disabled={isAiLoading} style={{ padding: '12px 18px', fontSize: '0.85rem', fontWeight: 'bold', background: 'linear-gradient(135deg, rgba(0,229,255,0.2) 0%, rgba(147,51,234,0.15) 100%)', border: '1px solid rgba(0,229,255,0.5)', borderRadius: '10px', color: '#00e5ff', cursor: isAiLoading ? 'wait' : 'pointer', opacity: isAiLoading ? 0.8 : 1 }}>
                  {isAiLoading ? '...' : '✨ Genera Analisi Globale (AI)'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.75rem', color: '#b0bec5', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Analisi delle ore {(aiInsightsList[Math.min(currentAiIndex, aiInsightsList.length - 1)] ?? {}).time ?? '--:--'}
                </div>
                {isAiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#00e5ff', fontSize: '0.85rem', marginBottom: '12px' }}>
                    <span className="loading-dots" style={{ display: 'inline-block' }}>...</span>
                    L'AI sta analizzando i tuoi biomarcatori...
                  </div>
                ) : (
                  <InteractiveAIText text={(aiInsightsList[Math.min(currentAiIndex, aiInsightsList.length - 1)] ?? {}).text ?? ''} onKeywordClick={handleGlobalKeywordClick} />
                )}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px', flexShrink: 0 }}>
                  {aiInsightsList.map((_, i) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === currentAiIndex ? '#00e5ff' : 'rgba(255,255,255,0.25)', transition: 'background 0.2s' }} />
                  ))}
                </div>
                <button type="button" onClick={runGenerateGlobalAI} disabled={isAiLoading} style={{ marginTop: '12px', padding: '8px 14px', fontSize: '0.8rem', fontWeight: '600', background: 'transparent', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', cursor: isAiLoading ? 'wait' : 'pointer' }}>
                  + Nuova Analisi
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
