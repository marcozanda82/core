import React, { useEffect, useMemo } from 'react';
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
import MetabolicTimelineOverlay from '../../components/MetabolicTimelineOverlay';
import TimeAlignmentChartDebugOverlay from '../../TimeAlignmentDebugOverlay';
import { CustomChartTooltip } from '../../coreEngine';
import { SncEnergyChartGradients, useMetabolicChartGradient } from '../../components/charts/MetabolicTimelineGradient';

/**
 * Chiavi motore (coreEngine) vs segmenti Past/Future (SalaComandi).
 * Le curve fisiologiche usano SEMPRE valueKey (es. cortisolo) — garantito dall'engine.
 * Past/Future restano solo per energia % / kcal split estetico.
 */
const PHYSIO_SERIES = {
  glicemia: {
    valueKey: 'glicemia',
    pastKey: 'glicemiaPast',
    futureKey: 'glicemiaFuture',
    stroke: '#ef4444',
    futureStroke: '#7f1d1d',
    fill: 'url(#colorGlicemia)',
    yDomain: [40, 220],
    tickFmt: (v) => v,
  },
  idratazione: {
    valueKey: 'idratazione',
    pastKey: 'idratazionePast',
    futureKey: 'idratazioneFuture',
    stroke: '#00e5ff',
    futureStroke: '#003a8c',
    fill: 'url(#colorWater)',
    yDomain: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  cortisolo: {
    valueKey: 'cortisolo',
    pastKey: 'cortisoloPast',
    futureKey: 'cortisoloFuture',
    stroke: '#f59e0b',
    futureStroke: '#78350f',
    fill: 'url(#colorCortisol)',
    yDomain: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  digestione: {
    valueKey: 'digestione',
    pastKey: 'digestionePast',
    futureKey: 'digestioneFuture',
    stroke: '#9333ea',
    futureStroke: '#581c87',
    fill: 'url(#colorDigestion)',
    yDomain: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  neuro: {
    valueKey: 'neuro',
    pastKey: 'neuroPast',
    futureKey: 'neuroFuture',
    stroke: '#6366f1',
    futureStroke: '#3730a3',
    fill: 'url(#colorNeuro)',
    yDomain: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  kcal: {
    valueKey: 'kcalValue',
    pastKey: 'kcalPast',
    futureKey: 'kcalFuture',
    stroke: '#00e5ff',
    futureStroke: '#444444',
    fill: 'url(#colorKcal)',
    yDomain: null,
    tickFmt: (v) => Math.round(Number(v)),
  },
  energy: {
    valueKey: 'energy',
    pastKey: 'energyPast',
    futureKey: 'energyFuture',
    stroke: '#00e5ff',
    futureStroke: '#444444',
    fill: 'url(#colorEnergy)',
    yDomain: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
};

function resolvePhysioSeries(chartUnit) {
  if (PHYSIO_SERIES[chartUnit]) return PHYSIO_SERIES[chartUnit];
  return PHYSIO_SERIES.energy;
}

function resolveYDomain(chartUnit, series, targetKcalChart, totalCaloriesTimeline) {
  if (chartUnit === 'calorieTimeline' || chartUnit === 'kcal') {
    const maxK = Math.max(safeFinite(targetKcalChart, 2000), safeFinite(totalCaloriesTimeline, 0), 1);
    return [0, maxK];
  }
  if (series?.yDomain) return series.yDomain;
  return [0, 100];
}

function safeFinite(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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
  activeLog = [],
  metabolicContextOptions = {},
  showMetabolicOverlay = false,
  onMetabolicPhaseClick,
}) {
  const chartGradientStops = metabolicChartGradientStops ?? metabolicGradientStops;
  const energyGradient = useMetabolicChartGradient(chartGradientStops, 'colorEnergia');
  const sncChartMargin = { top: 8, right: 0, left: 0, bottom: 0 };
  const metabolicOverlayNowHour = showMetabolicOverlay && !isViewingPastDate ? currentTime : null;
  const chartShellStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: 200,
    flexShrink: 0,
  };

  const chartData = useMemo(
    () => (Array.isArray(mainChartData) ? mainChartData : []),
    [mainChartData],
  );

  const series = resolvePhysioSeries(chartUnit);
  const yDomain = resolveYDomain(chartUnit, series, targetKcalChart, totalCaloriesTimeline);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const first = chartData[0] || null;
    const keys = first ? Object.keys(first) : [];
    const sampleKey = series.valueKey;
    const vals = chartData
      .map((p) => Number(p?.[sampleKey]))
      .filter((n) => Number.isFinite(n));
    const min = vals.length ? Math.min(...vals) : null;
    const max = vals.length ? Math.max(...vals) : null;
    // Temporaneo: conferma chiavi engine vs Past e range valori (flatline?).
    // eslint-disable-next-line no-console
    console.log('RECHARTS DATA:', {
      chartUnit,
      len: chartData.length,
      first,
      keys,
      valueKey: sampleKey,
      hasValueKey: first ? Object.prototype.hasOwnProperty.call(first, sampleKey) : false,
      hasPastKey: first ? Object.prototype.hasOwnProperty.call(first, series.pastKey) : false,
      min,
      max,
      yDomain,
    });
  }, [chartData, chartUnit, series.valueKey, series.pastKey, yDomain]);

  const sleepNodes = Array.isArray(nodesForEnergySimulation)
    ? nodesForEnergySimulation.filter((n) => n && n.type === 'sleep')
    : [];

  return (
    <>
      {chartUnit === 'percent' ? (
        <div style={chartShellStyle}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <ComposedChart data={chartData} margin={sncChartMargin}>
              <defs>
                <SncEnergyChartGradients
                  metabolicGradientStops={chartGradientStops}
                  energyGradientId={energyGradient.gradientId}
                />
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 24]}
                allowDataOverflow
                stroke="#666"
                fontSize={10}
                tickFormatter={(tick) => `${tick}h`}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
                padding={{ left: 0, right: 0 }}
                scale="linear"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#666"
                fontSize={10}
                tickFormatter={(tick) => `${tick}%`}
                width={35}
                tickMargin={2}
                axisLine={false}
                tickLine={false}
              />
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
              {sleepNodes.map((node, index) => (
                <ReferenceLine
                  key={`snc-sleep-${node.id ?? index}`}
                  x={safeFinite(node.wakeTime, 7.5)}
                  stroke="#00e5ff"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11, fontWeight: 'bold' }}
                />
              ))}
              <ReferenceDot
                x={displayTime}
                y={finalDotY}
                isFront
                r={8}
                fill={currentMetabolicColor || '#22d3ee'}
                stroke="#ffffff"
                strokeWidth={2}
                className="pulsing-dot"
              />
              <Area
                type="monotone"
                dataKey="riservaFisica"
                name="Riserva Fisica"
                stroke="#00e676"
                fill="url(#colorRiserva)"
                fillOpacity={0.3}
                strokeWidth={2}
                dot={false}
                baseValue={0}
                isAnimationActive={!draggingNode}
              />
              {/* Stroke esadecimale solido: url(#gradient) sul stroke spesso rende la linea invisibile */}
              <Area
                type="monotone"
                dataKey="energyPast"
                name="Energia SNC"
                stroke="#00e5ff"
                strokeWidth={3}
                fillOpacity={1}
                fill={energyGradient.fill || '#00e5ff'}
                baseValue={0}
                connectNulls={false}
                isAnimationActive={!draggingNode}
              />
              <Area
                type="monotone"
                dataKey="energyFuture"
                name="Previsione"
                stroke="#666666"
                strokeWidth={2}
                strokeDasharray="10 10"
                fill="transparent"
                className="future"
                baseValue={0}
                connectNulls={false}
                isAnimationActive={!draggingNode}
              />
              <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
          {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
          <TimeAlignmentChartDebugOverlay />
          {showMetabolicOverlay ? (
            <MetabolicTimelineOverlay
              activeLog={activeLog}
              options={metabolicContextOptions}
              nowHour={metabolicOverlayNowHour}
              onPhaseClick={onMetabolicPhaseClick}
            />
          ) : null}
        </div>
      ) : (
        <div style={chartShellStyle}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
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
                <linearGradient id="colorGlicemia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007aff" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#00e5ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#007aff" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorCortisol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
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
                <linearGradient id="colorNeuro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="#818cf8" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey={chartUnit === 'calorieTimeline' ? 'time' : 'hour'}
                type="number"
                domain={[0, 24]}
                allowDataOverflow
                ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
                tickFormatter={(val) => `${val}:00`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#666', fontSize: 13 }}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis
                yAxisId="left"
                domain={yDomain}
                allowDataOverflow={false}
                tickFormatter={series.tickFmt}
                tick={{ fill: '#555', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} width={0} hide />
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              {sleepNodes.map((node, index) => (
                <ReferenceLine
                  key={`sleep-ref-${node.id ?? index}`}
                  yAxisId="left"
                  x={safeFinite(node.wakeTime, 7.5)}
                  stroke="#00e5ff"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    position: 'insideTopLeft',
                    value: '🌅 Sveglia',
                    fill: '#4ba3e3',
                    fontSize: 11,
                    fontWeight: 'bold',
                  }}
                />
              ))}
              {chartUnit !== 'calorieTimeline' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="anabolicScore"
                    fill="url(#colorAnabolic)"
                    stroke="transparent"
                    strokeWidth={0}
                    fillOpacity={0.35}
                    yAxisId="anabolic"
                    isAnimationActive={!draggingNode}
                  />
                  <Area
                    type="monotone"
                    dataKey="cortisolScore"
                    fill="url(#colorCortisolPurple)"
                    stroke="#9c27b0"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    fillOpacity={0.3}
                    yAxisId="anabolic"
                    isAnimationActive={!draggingNode}
                  />
                </>
              )}
              {chartUnit === 'glicemia' && (
                <>
                  <ReferenceArea yAxisId="left" y1={40} y2={85} fill="#22c55e20" stroke="none" />
                  <ReferenceArea yAxisId="left" y1={85} y2={140} fill="#eab30820" stroke="none" />
                  <ReferenceArea yAxisId="left" y1={140} y2={220} fill="#3b82f620" stroke="none" />
                </>
              )}
              <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '5 5' }} />
              {chartUnit === 'calorieTimeline' ? (
                <Line
                  type="monotone"
                  yAxisId="left"
                  dataKey="kcal"
                  stroke="#ff9800"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!draggingNode}
                />
              ) : (
                <>
                  {/* Curva primaria sulle chiavi engine (cortisolo / digestione / …), yAxisId="left" obbligatorio */}
                  <Area
                    type="monotone"
                    yAxisId="left"
                    dataKey={series.valueKey}
                    stroke={series.stroke}
                    strokeWidth={3}
                    fill={series.fill}
                    fillOpacity={0.45}
                    isAnimationActive={!draggingNode}
                    animationDuration={600}
                    animationEasing="ease-in-out"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey={series.valueKey}
                    stroke={series.stroke}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={!draggingNode}
                    legendType="none"
                  />
                </>
              )}
              {chartUnit === 'glicemia' ? (
                <ReferenceLine
                  yAxisId="left"
                  y={85}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeDasharray="5 5"
                  label={{ position: 'insideTopLeft', value: 'Basale', fill: '#555', fontSize: 10 }}
                />
              ) : chartUnit === 'calorieTimeline' || chartUnit === 'kcal' ? null : (
                <Line
                  type="monotone"
                  yAxisId="left"
                  dataKey="idealEnergy"
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth={2}
                  strokeDasharray="8 8"
                  dot={false}
                  isAnimationActive={!draggingNode}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                />
              )}
              <ReferenceDot
                yAxisId="left"
                x={displayTime}
                y={finalDotY}
                isFront
                shape={(props) => {
                  const cx = props?.cx;
                  const cy = props?.cy;
                  if (cx == null || cy == null || typeof cx !== 'number' || typeof cy !== 'number') {
                    return <path d="M0 0" />;
                  }
                  const fillColor =
                    chartUnit === 'glicemia'
                      ? '#ef4444'
                      : chartUnit === 'cortisolo'
                        ? '#f59e0b'
                        : chartUnit === 'digestione'
                          ? '#9333ea'
                          : chartUnit === 'neuro'
                            ? '#6366f1'
                            : chartUnit === 'idratazione'
                              ? '#00e5ff'
                              : chartUnit === 'calorieTimeline'
                                ? '#ff9800'
                                : '#00e5ff';
                  return (
                    <g className="pulsing-dot">
                      <circle cx={cx} cy={cy} r={10} fill={fillColor} />
                      <circle cx={cx} cy={cy} r={10} fill="none" stroke={fillColor} strokeWidth={3} opacity={0.5}>
                        <animate attributeName="r" values="10;17;10" dur="2.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.5;0;0.5" dur="2.8s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
          <TimeAlignmentChartDebugOverlay />
          {showMetabolicOverlay ? (
            <MetabolicTimelineOverlay
              activeLog={activeLog}
              options={metabolicContextOptions}
              nowHour={metabolicOverlayNowHour}
              onPhaseClick={onMetabolicPhaseClick}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
