import React, { useMemo } from 'react';
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
 * Config serie: allineata al pattern Energia (past/future + continuo) che già disegna la linea.
 * Calorie (calorieTimeline) usa un unico dataKey continuo `kcal` — stesso principio per valueKey.
 */
const PHYSIO_SERIES = {
  glicemia: {
    valueKey: 'glicemia',
    pastKey: 'glicemiaPast',
    futureKey: 'glicemiaFuture',
    stroke: '#ef4444',
    futureStroke: '#7f1d1d',
    fill: '#ef4444',
    yDomainBase: [40, 220],
    tickFmt: (v) => v,
  },
  idratazione: {
    valueKey: 'idratazione',
    pastKey: 'idratazionePast',
    futureKey: 'idratazioneFuture',
    stroke: '#00e5ff',
    futureStroke: '#003a8c',
    fill: '#00e5ff',
    yDomainBase: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  cortisolo: {
    valueKey: 'cortisolo',
    pastKey: 'cortisoloPast',
    futureKey: 'cortisoloFuture',
    stroke: '#f59e0b',
    futureStroke: '#78350f',
    fill: '#f59e0b',
    yDomainBase: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  digestione: {
    valueKey: 'digestione',
    pastKey: 'digestionePast',
    futureKey: 'digestioneFuture',
    stroke: '#9333ea',
    futureStroke: '#581c87',
    fill: '#9333ea',
    yDomainBase: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  neuro: {
    valueKey: 'neuro',
    pastKey: 'neuroPast',
    futureKey: 'neuroFuture',
    stroke: '#6366f1',
    futureStroke: '#3730a3',
    fill: '#6366f1',
    yDomainBase: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
  kcal: {
    valueKey: 'kcalValue',
    pastKey: 'kcalPast',
    futureKey: 'kcalFuture',
    stroke: '#00e5ff',
    futureStroke: '#444444',
    fill: '#00e5ff',
    yDomainBase: [0, 2000],
    tickFmt: (v) => Math.round(Number(v)),
  },
  energy: {
    valueKey: 'energy',
    pastKey: 'energyPast',
    futureKey: 'energyFuture',
    stroke: '#00e5ff',
    futureStroke: '#444444',
    fill: '#00e5ff',
    yDomainBase: [0, 100],
    tickFmt: (v) => `${v}%`,
  },
};

function resolvePhysioSeries(chartUnit) {
  if (PHYSIO_SERIES[chartUnit]) return PHYSIO_SERIES[chartUnit];
  return PHYSIO_SERIES.energy;
}

/** Anti-NaN stretto: solo number finiti; altrimenti null (Recharts abortisce il path su NaN). */
function chartNumOrNull(val) {
  return typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val) ? val : null;
}

function chartNum(val, fallback = 0) {
  const n = chartNumOrNull(typeof val === 'number' ? val : Number(val));
  return n == null ? fallback : n;
}

function safeFinite(v, fallback = 0) {
  return chartNum(v, fallback);
}

/**
 * Dominio Y dinamico: include sempre i valori calcolati (niente linea fuori viewBox).
 */
function resolveYDomain(chartUnit, series, chartData, targetKcalChart, totalCaloriesTimeline) {
  if (chartUnit === 'calorieTimeline' || chartUnit === 'kcal') {
    const maxK = Math.max(safeFinite(targetKcalChart, 2000), safeFinite(totalCaloriesTimeline, 0), 1);
    const key = chartUnit === 'calorieTimeline' ? 'kcal' : series.valueKey;
    let dataMax = 0;
    for (const p of chartData || []) {
      const v = chartNumOrNull(Number(p?.[key]));
      if (v != null) dataMax = Math.max(dataMax, v);
    }
    return [0, Math.max(maxK, dataMax * 1.05, 1)];
  }

  const base = series?.yDomainBase || [0, 100];
  const key = series?.valueKey;
  let minV = base[0];
  let maxV = base[1];
  for (const p of chartData || []) {
    const v = chartNumOrNull(Number(p?.[key]));
    if (v == null) continue;
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const pad = Math.max(2, (maxV - minV) * 0.05);
  return [Math.min(base[0], minV - pad), Math.max(base[1], maxV + pad)];
}

/**
 * Shape allineata a Energia/Calorie:
 * - valueKey continuo (riferimento / pallino)
 * - past/future con cerniera su `now` (entrambe le chiavi valorizzate → niente gap)
 * - mai NaN: solo number o null
 */
const PAST_FUTURE_KEYS = [
  { value: 'energy', past: 'energyPast', future: 'energyFuture' },
  { value: 'glicemia', past: 'glicemiaPast', future: 'glicemiaFuture' },
  { value: 'idratazione', past: 'idratazionePast', future: 'idratazioneFuture' },
  { value: 'cortisolo', past: 'cortisoloPast', future: 'cortisoloFuture' },
  { value: 'digestione', past: 'digestionePast', future: 'digestioneFuture' },
  { value: 'neuro', past: 'neuroPast', future: 'neuroFuture' },
  { value: 'kcalValue', past: 'kcalPast', future: 'kcalFuture' },
];

/** Segmenta past/future; sul punto `now` (cerniera) valorizza ENTRAMBE le chiavi. */
function segmentPastFuture(hour, now, value) {
  const v = chartNumOrNull(typeof value === 'number' ? value : Number(value));
  if (v == null) return { past: null, future: null };
  const atHinge = Math.abs(hour - now) < 1e-4;
  return {
    past: hour <= now || atHinge ? v : null,
    future: hour >= now || atHinge ? v : null,
  };
}

/**
 * Cerniera: il punto più vicino a `now` (idealmente l'ora attuale inserita dall'engine)
 * ha pastKey = futureKey = value, così la linea tratteggiata parte sotto il pallino.
 */
function applyNowHinge(points, now) {
  if (!Array.isArray(points) || points.length === 0) return points;
  let hingeIdx = points.findIndex((p) => Math.abs(p.hour - now) < 1e-4);
  if (hingeIdx < 0) {
    hingeIdx = points.reduce((best, p, i) => (
      Math.abs(p.hour - now) < Math.abs(points[best].hour - now) ? i : best
    ), 0);
  }
  const hinge = points[hingeIdx];
  for (const { value, past, future } of PAST_FUTURE_KEYS) {
    const val = chartNumOrNull(hinge[value]);
    if (val == null) continue;
    hinge[past] = val;
    hinge[future] = val;
  }
  return points;
}

function normalizePhysioChartData(raw, series, displayTime = 12) {
  const list = Array.isArray(raw) ? raw : [];
  const now = chartNum(displayTime, 12);

  let points = list.map((d, index) => {
    const hour = chartNum(d?.hour ?? d?.time ?? index, index);
    const energy = chartNum(d?.energy, 35);
    const glicemia = chartNum(d?.glicemia, 85);
    const idratazione = chartNum(d?.idratazione, 100);
    const cortisolo = chartNum(d?.cortisolo, 25);
    const digestione = chartNum(d?.digestione, 0);
    const neuro = chartNum(d?.neuro, 40);
    const kcalRaw = d?.kcalValue ?? d?.kcal;
    const kcalValue = chartNum(kcalRaw, 0);
    const idealEnergy = chartNum(d?.idealEnergy, 70);
    const riservaFisica = chartNum(d?.riservaFisica, 50);

    const eSeg = segmentPastFuture(hour, now, energy);
    const gSeg = segmentPastFuture(hour, now, glicemia);
    const iSeg = segmentPastFuture(hour, now, idratazione);
    const cSeg = segmentPastFuture(hour, now, cortisolo);
    const dSeg = segmentPastFuture(hour, now, digestione);
    const nSeg = segmentPastFuture(hour, now, neuro);
    const kSeg = segmentPastFuture(hour, now, kcalValue);

    return {
      time: hour,
      hour,
      energy,
      glicemia,
      idratazione,
      cortisolo,
      digestione,
      neuro,
      kcal: kcalValue,
      kcalValue,
      idealEnergy,
      riservaFisica,
      anabolicScore: chartNum(d?.anabolicScore, 0),
      cortisolScore: chartNum(d?.cortisolScore, 0),
      energyPast: eSeg.past,
      energyFuture: eSeg.future,
      glicemiaPast: gSeg.past,
      glicemiaFuture: gSeg.future,
      idratazionePast: iSeg.past,
      idratazioneFuture: iSeg.future,
      cortisoloPast: cSeg.past,
      cortisoloFuture: cSeg.future,
      digestionePast: dSeg.past,
      digestioneFuture: dSeg.future,
      neuroPast: nSeg.past,
      neuroFuture: nSeg.future,
      kcalPast: kSeg.past,
      kcalFuture: kSeg.future,
    };
  });

  points = points
    .filter((p) => chartNumOrNull(p.hour) != null)
    .sort((a, b) => a.hour - b.hour);

  // Cerniera now: past + future sullo stesso punto (niente gap sotto il pallino)
  points = applyNowHinge(points, now);

  const valueKey = series?.valueKey || 'glicemia';
  let validCount = points.filter((p) => chartNumOrNull(p[valueKey]) != null).length;

  if (points.length < 2 || validCount < 2) {
    const baseline = [];
    for (let h = 0; h <= 24; h += 1) {
      const glicemia = 85;
      const idratazione = 100;
      const cortisolo = 40;
      const digestione = 0;
      const neuro = 40;
      const energy = 50;
      const gSeg = segmentPastFuture(h, now, glicemia);
      const iSeg = segmentPastFuture(h, now, idratazione);
      const cSeg = segmentPastFuture(h, now, cortisolo);
      const dSeg = segmentPastFuture(h, now, digestione);
      const nSeg = segmentPastFuture(h, now, neuro);
      const eSeg = segmentPastFuture(h, now, energy);
      baseline.push({
        time: h,
        hour: h,
        energy,
        glicemia,
        idratazione,
        cortisolo,
        digestione,
        neuro,
        kcal: 0,
        kcalValue: 0,
        idealEnergy: 70,
        riservaFisica: 50,
        anabolicScore: 0,
        cortisolScore: 0,
        energyPast: eSeg.past,
        energyFuture: eSeg.future,
        glicemiaPast: gSeg.past,
        glicemiaFuture: gSeg.future,
        idratazionePast: iSeg.past,
        idratazioneFuture: iSeg.future,
        cortisoloPast: cSeg.past,
        cortisoloFuture: cSeg.future,
        digestionePast: dSeg.past,
        digestioneFuture: dSeg.future,
        neuroPast: nSeg.past,
        neuroFuture: nSeg.future,
        kcalPast: h <= now ? 0 : null,
        kcalFuture: h >= now ? 0 : null,
      });
    }
    points = applyNowHinge(baseline, now);
    validCount = points.length;
  }

  return { points, validCount, valueKey };
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

  const series = resolvePhysioSeries(chartUnit);

  const { points: chartData, validCount: valueKeyValidCount } = useMemo(
    () => normalizePhysioChartData(mainChartData, resolvePhysioSeries(chartUnit), displayTime),
    [mainChartData, chartUnit, displayTime],
  );

  const yDomain = useMemo(
    () => resolveYDomain(chartUnit, series, chartData, targetKcalChart, totalCaloriesTimeline),
    [chartUnit, series, chartData, targetKcalChart, totalCaloriesTimeline],
  );

  if (import.meta.env.DEV) {
    const countFinite = (key) =>
      chartData.filter((p) => chartNumOrNull(Number(p?.[key])) != null).length;
    const nanKeys = [];
    if (chartData[0]) {
      for (const k of Object.keys(chartData[0])) {
        if (chartData.some((p) => typeof p?.[k] === 'number' && Number.isNaN(p[k]))) nanKeys.push(k);
      }
    }
    // eslint-disable-next-line no-console
    console.log('CHART DATA COUNTS:', {
      chartUnit,
      len: chartData.length,
      valueKey: series.valueKey,
      pastKey: series.pastKey,
      futureKey: series.futureKey,
      valueKeyValidCount,
      yDomain,
      nanKeys,
      counts: {
        [series.valueKey]: countFinite(series.valueKey),
        [series.pastKey]: countFinite(series.pastKey),
        [series.futureKey]: countFinite(series.futureKey),
        energy: countFinite('energy'),
        energyPast: countFinite('energyPast'),
        kcal: countFinite('kcal'),
      },
      canDrawLine: valueKeyValidCount >= 2,
    });
  }

  const sleepNodes = Array.isArray(nodesForEnergySimulation)
    ? nodesForEnergySimulation.filter((n) => n && n.type === 'sleep')
    : [];

  const overlayBlock = (
    <>
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
    </>
  );

  const sleepRefs = sleepNodes.map((node, index) => (
    <ReferenceLine
      key={`sleep-ref-${node.id ?? index}`}
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
  ));

  // ─── Energia % (FUNZIONA): nessun yAxisId, past/future + continuo ───
  if (chartUnit === 'percent') {
    return (
      <>
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
              {sleepRefs}
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
                type="linear"
                dataKey="riservaFisica"
                name="Riserva Fisica"
                stroke="#00e676"
                fill="url(#colorRiserva)"
                fillOpacity={0.3}
                strokeWidth={2}
                dot={false}
                baseValue={0}
                connectNulls
                isAnimationActive={false}
              />
              <Area
                type="linear"
                dataKey="energyPast"
                name="Energia SNC"
                stroke="#00e5ff"
                strokeWidth={3}
                fillOpacity={1}
                fill={energyGradient.fill || '#00e5ff'}
                baseValue={0}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="energyPast"
                stroke="#00e5ff"
                strokeWidth={3}
                strokeOpacity={1}
                dot={false}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                type="linear"
                dataKey="energyFuture"
                name="Previsione"
                stroke="#666666"
                strokeWidth={2}
                strokeDasharray="10 10"
                fill="transparent"
                className="future"
                baseValue={0}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="energyFuture"
                stroke="#888888"
                strokeWidth={2.5}
                strokeOpacity={1}
                strokeDasharray="10 10"
                dot={false}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                type="linear"
                dataKey="energy"
                stroke="#00e5ff"
                strokeWidth={2}
                strokeOpacity={0.45}
                dot={false}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              />
              <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
          {overlayBlock}
        </div>
      </>
    );
  }

  // ─── Calorie cumulative (FUNZIONA): un solo dataKey continuo, domain dinamico ───
  if (chartUnit === 'calorieTimeline') {
    return (
      <>
        <div style={chartShellStyle}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
              <XAxis
                dataKey="time"
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
                domain={yDomain}
                allowDataOverflow
                tickFormatter={(v) => Math.round(Number(v))}
                tick={{ fill: '#555', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              {sleepRefs}
              <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '5 5' }} />
              <Line
                type="linear"
                dataKey="kcal"
                stroke="#ff9800"
                strokeWidth={3}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <ReferenceDot
                x={displayTime}
                y={finalDotY}
                isFront
                shape={(props) => {
                  const cx = props?.cx;
                  const cy = props?.cy;
                  if (cx == null || cy == null) return <path d="M0 0" />;
                  return (
                    <g className="pulsing-dot">
                      <circle cx={cx} cy={cy} r={10} fill="#ff9800" />
                    </g>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {overlayBlock}
        </div>
      </>
    );
  }

  // ─── Glicemia / Acqua / Neuro / Stress / Digestione ───
  // monotoneX (curve morbide) + past solido / future tratteggiato, cerniera su now.
  const stroke = series.stroke || '#00e5ff';
  const futureStroke = series.futureStroke || '#888888';
  const fillColor = series.fill || stroke;

  return (
    <>
      <div style={chartShellStyle}>
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <ComposedChart data={chartData} margin={sncChartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
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
              domain={yDomain}
              allowDataOverflow
              stroke="#666"
              fontSize={10}
              tickFormatter={series.tickFmt}
              width={35}
              tickMargin={2}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '5 5' }} />
            {sleepRefs}
            {chartUnit === 'glicemia' && (
              <>
                <ReferenceArea y1={Math.max(yDomain[0], 40)} y2={Math.min(yDomain[1], 85)} fill="#22c55e20" stroke="none" />
                <ReferenceArea y1={Math.max(yDomain[0], 85)} y2={Math.min(yDomain[1], 140)} fill="#eab30820" stroke="none" />
                <ReferenceArea y1={Math.max(yDomain[0], 140)} y2={Math.min(yDomain[1], 220)} fill="#3b82f620" stroke="none" />
                <ReferenceLine
                  y={85}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeDasharray="5 5"
                  label={{ position: 'insideTopLeft', value: 'Basale', fill: '#555', fontSize: 10 }}
                />
              </>
            )}
            {/* Passato: Area + Line solidi, curve biomediche monotoneX */}
            <Area
              type="monotoneX"
              dataKey={series.pastKey}
              name={series.valueKey}
              stroke={stroke}
              strokeWidth={3}
              fill={fillColor}
              fillOpacity={0.22}
              baseValue={yDomain[0]}
              connectNulls
              isAnimationActive={false}
              dot={false}
            />
            <Line
              type="monotoneX"
              dataKey={series.pastKey}
              stroke={stroke}
              strokeWidth={3}
              strokeOpacity={1}
              dot={false}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
            {/* Futuro: solo Line tratteggiata — parte dalla cerniera now (past∩future) */}
            <Line
              type="monotoneX"
              dataKey={series.futureKey}
              name="Previsione"
              stroke={futureStroke}
              strokeWidth={2.5}
              strokeOpacity={0.95}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
            <ReferenceDot
              x={displayTime}
              y={finalDotY}
              isFront
              shape={(props) => {
                const cx = props?.cx;
                const cy = props?.cy;
                if (cx == null || cy == null || typeof cx !== 'number' || typeof cy !== 'number') {
                  return <path d="M0 0" />;
                }
                return (
                  <g className="pulsing-dot">
                    <circle cx={cx} cy={cy} r={10} fill={stroke} />
                    <circle cx={cx} cy={cy} r={10} fill="none" stroke={stroke} strokeWidth={3} opacity={0.5}>
                      <animate attributeName="r" values="10;17;10" dur="2.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.8s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {overlayBlock}
      </div>
    </>
  );
}
