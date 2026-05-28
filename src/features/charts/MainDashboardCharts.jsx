import React from 'react';
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
  Tooltip,
  ReferenceArea,
} from 'recharts';
import NowVerticalLineOverlay from '../../NowVerticalLineOverlay';
import TimeAlignmentChartDebugOverlay from '../../TimeAlignmentDebugOverlay';
import { CustomChartTooltip } from '../../coreEngine';
import { SncEnergyChartGradients, useMetabolicChartGradient } from '../../components/charts/MetabolicTimelineGradient';

export default function MainDashboardCharts({
  chartUnit,
  mainChartData,
  draggingNode,
  nodesForEnergySimulation,
  displayTime,
  finalDotY,
  isViewingPastDate,
  currentTime,
  targetKcalChart,
  totalCaloriesTimeline,
  metabolicGradientStops,
  metabolicChartGradientStops,
  currentMetabolicColor,
}) {
  const chartGradientStops = metabolicChartGradientStops ?? metabolicGradientStops;
  const energyGradient = useMetabolicChartGradient(chartGradientStops, 'colorEnergia');
  return (
    <>
      {chartUnit === 'percent' ? (
        <div style={{ background: '#111', paddingTop: 15, paddingBottom: 15, borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ position: 'relative', width: '100%', height: '280px', paddingBottom: '60px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mainChartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
                <defs>
                  <SncEnergyChartGradients
                    metabolicGradientStops={chartGradientStops}
                    energyGradientId={energyGradient.gradientId}
                  />
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                <YAxis domain={[0, 100]} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}%`} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1c', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#00e676', fontWeight: 'bold' }}
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
                  <ReferenceLine
                    key={`snc-sleep-${node.id ?? index}`}
                    x={node.wakeTime ?? 7.5}
                    stroke="#00e5ff"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11, fontWeight: 'bold' }}
                  />
                ))}
                <ReferenceDot x={displayTime} y={finalDotY} isFront r={8} fill={currentMetabolicColor || '#22d3ee'} stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                <Area type="monotone" dataKey="riservaFisica" name="Riserva Fisica" stroke="#00e676" fill="url(#colorRiserva)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={!draggingNode} />
                <Area type="monotone" dataKey="energyPast" name="Energia SNC" stroke={energyGradient.stroke} strokeWidth={3} fillOpacity={1} fill={energyGradient.fill} connectNulls={false} isAnimationActive={!draggingNode} />
                <Area type="monotone" dataKey="energyFuture" name="Previsione" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" connectNulls={false} isAnimationActive={!draggingNode} />
                <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
              </ComposedChart>
            </ResponsiveContainer>
            {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
            <TimeAlignmentChartDebugOverlay />
          </div>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mainChartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
              <defs>
                <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#047857" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="colorKcal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#047857" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="vitalFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="4s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="4s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#b388ff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="colorGlicemia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="bloodFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#fca5a5" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007aff" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#00e5ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#007aff" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="waterFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#007aff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="colorCortisol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="cortisolFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#fcd34d" stopOpacity="1" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="colorAnabolic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCortisolPurple" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9c27b0" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#9c27b0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDigestion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9333ea" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#a855f7" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#9333ea" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="digestionFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#9333ea" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#c084fc" stopOpacity="1" />
                  <stop offset="100%" stopColor="#9333ea" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="colorNeuro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#818cf8" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="neuroFlow" x1="0" y1="0" x2="1" y2="0">
                  <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#818cf8" stopOpacity="1" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <XAxis dataKey={chartUnit === 'calorieTimeline' ? 'time' : 'hour'} type="number" domain={[0, 24]} allowDataOverflow={true} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} tickFormatter={(val) => `${val}:00`} axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 13 }} padding={{ left: 0, right: 0 }} />
              <YAxis domain={chartUnit === 'glicemia' ? [40, 220] : (chartUnit === 'kcal' || chartUnit === 'calorieTimeline' ? [0, Math.max(targetKcalChart, totalCaloriesTimeline || 0)] : [0, 100])} tickFormatter={(val) => (chartUnit === 'kcal' || chartUnit === 'calorieTimeline') ? Math.round(Number(val)) : (chartUnit === 'glicemia' ? val : `${val}%`)} tick={{ fill: '#555', fontSize: 12 }} axisLine={false} tickLine={false} width={35} />
              <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} width={0} hide />
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
                <ReferenceLine
                  key={`sleep-ref-${node.id ?? index}`}
                  x={node.wakeTime ?? 7.5}
                  stroke="#00e5ff"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    position: 'insideTopLeft',
                    value: '🌅 Sveglia',
                    fill: '#4ba3e3',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                />
              ))}
              {chartUnit !== 'calorieTimeline' && (
                <>
                  <Area type="monotone" dataKey="anabolicScore" fill="url(#colorAnabolic)" stroke="transparent" strokeWidth={0} fillOpacity={0.35} yAxisId="anabolic" isAnimationActive={!draggingNode} />
                  <Area type="monotone" dataKey="cortisolScore" fill="url(#colorCortisolPurple)" stroke="#9c27b0" strokeWidth={2} strokeDasharray="5 5" fillOpacity={0.3} yAxisId="anabolic" isAnimationActive={!draggingNode} />
                </>
              )}
              {chartUnit === 'glicemia' && (
                <>
                  <ReferenceArea y1={40} y2={85} fill="#22c55e20" stroke="none" />
                  <ReferenceArea y1={85} y2={140} fill="#eab30820" stroke="none" />
                  <ReferenceArea y1={140} y2={220} fill="#3b82f620" stroke="none" />
                </>
              )}
              <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '5 5' }} />
              {chartUnit === 'calorieTimeline' ? (
                <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={2} dot={false} isAnimationActive={!draggingNode} />
              ) : (
                <>
                  <Area type="monotone"
                    dataKey={chartUnit === 'kcal' ? 'kcalPast' : (chartUnit === 'glicemia' ? 'glicemiaPast' : (chartUnit === 'idratazione' ? 'idratazionePast' : chartUnit === 'cortisolo' ? 'cortisoloPast' : chartUnit === 'digestione' ? 'digestionePast' : chartUnit === 'neuro' ? 'neuroPast' : 'energyPast'))}
                    stroke={chartUnit === 'glicemia' ? 'url(#bloodFlow)' : (chartUnit === 'idratazione' ? 'url(#waterFlow)' : chartUnit === 'cortisolo' ? 'url(#cortisolFlow)' : chartUnit === 'digestione' ? 'url(#digestionFlow)' : chartUnit === 'neuro' ? 'url(#neuroFlow)' : 'url(#vitalFlow)')}
                    strokeWidth={6}
                    fill={chartUnit === 'glicemia' ? 'url(#colorGlicemia)' : (chartUnit === 'idratazione' ? 'url(#colorWater)' : chartUnit === 'cortisolo' ? 'url(#colorCortisol)' : chartUnit === 'digestione' ? 'url(#colorDigestion)' : chartUnit === 'neuro' ? 'url(#colorNeuro)' : 'url(#colorEnergy)')}
                    filter="url(#glow)" isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" connectNulls={false}
                  />
                  <Area type="monotone"
                    dataKey={chartUnit === 'kcal' ? 'kcalFuture' : (chartUnit === 'glicemia' ? 'glicemiaFuture' : (chartUnit === 'idratazione' ? 'idratazioneFuture' : chartUnit === 'cortisolo' ? 'cortisoloFuture' : chartUnit === 'digestione' ? 'digestioneFuture' : chartUnit === 'neuro' ? 'neuroFuture' : 'energyFuture'))}
                    stroke={chartUnit === 'glicemia' ? '#7f1d1d' : (chartUnit === 'idratazione' ? '#003a8c' : chartUnit === 'cortisolo' ? '#78350f' : chartUnit === 'digestione' ? '#581c87' : chartUnit === 'neuro' ? '#3730a3' : '#444')}
                    strokeWidth={4} strokeDasharray="10 10" fill="transparent" isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" connectNulls={false} className="future"
                  />
                </>
              )}
              {chartUnit === 'glicemia' ? (
                <ReferenceLine y={85} stroke="rgba(255, 255, 255, 0.2)" strokeDasharray="5 5" label={{ position: 'insideTopLeft', value: 'Basale', fill: '#555', fontSize: 10 }} />
              ) : chartUnit === 'calorieTimeline' || chartUnit === 'kcal' ? null : (
                <Line type="monotone" dataKey="idealEnergy" stroke="rgba(255, 255, 255, 0.2)" strokeWidth={4} strokeDasharray="8 8" dot={false} isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" />
              )}
              <ReferenceDot x={displayTime} y={finalDotY} isFront shape={(props) => {
                const cx = props?.cx;
                const cy = props?.cy;
                if (cx == null || cy == null || typeof cx !== 'number' || typeof cy !== 'number') return <path d="M0 0" />;
                const fillColor = chartUnit === 'glicemia' ? '#ef4444' : (chartUnit === 'cortisolo' ? '#f59e0b' : chartUnit === 'digestione' ? '#9333ea' : chartUnit === 'neuro' ? '#6366f1' : chartUnit === 'calorieTimeline' ? '#ff9800' : '#00e5ff');
                return (
                  <g className="pulsing-dot">
                    <circle cx={cx} cy={cy} r={10} fill={fillColor} />
                    <circle cx={cx} cy={cy} r={10} fill="none" stroke={fillColor} strokeWidth={3} opacity={0.5}>
                      <animate attributeName="r" values="10;17;10" dur="2.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.8s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              }} />
            </ComposedChart>
          </ResponsiveContainer>
          {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
          <TimeAlignmentChartDebugOverlay />
        </>
      )}
    </>
  );
}
