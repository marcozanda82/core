import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { MEALS, MEAL_KEYS, SYNC_BAND, MODERATE_BAND, COLORS, MESSAGES } from './constants';
import { useGoldStandard } from './useGoldStandard';
import InsightCard from './InsightCard';
import './GhostModeDashboard.css';

const defaultMacro = () => ({ kcal: 0, prot: 0, carb: 0, fat: 0, fibre: 0 });

/**
 * Calcola scostamento % calorico: ((Real - Target) / Target) * 100
 */
function scostamentoCalorico(target, real) {
  if (!target?.kcal || target.kcal === 0) return 0;
  return ((real.kcal - target.kcal) / target.kcal) * 100;
}

/**
 * Colore in base a |scostamento|: sync ±10%, moderate ±25%, critical >25%
 */
function colorForDeviation(dev) {
  const abs = Math.abs(dev);
  if (abs <= SYNC_BAND) return COLORS.sync;
  if (abs <= MODERATE_BAND) return COLORS.moderate;
  return COLORS.critical;
}

/**
 * Messaggio motivazionale in base a sync score medio
 */
function getMotivationalMessage(avgSync) {
  const abs = Math.abs(avgSync);
  if (abs <= SYNC_BAND)
    return MESSAGES.inSync[Math.floor(Math.random() * MESSAGES.inSync.length)];
  if (abs <= MODERATE_BAND)
    return MESSAGES.moderate[Math.floor(Math.random() * MESSAGES.moderate.length)];
  return MESSAGES.critical[Math.floor(Math.random() * MESSAGES.critical.length)];
}

export default function GhostModeDashboard({
  mealsData = {},
  activeLog: _activeLog,
  userTargets: _userTargets,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const { getTipsByMineral } = useGoldStandard('/crea_gold_standard.json');

  const chartData = useMemo(() => {
    return MEALS.map((name, i) => {
      const key = MEAL_KEYS[i];
      const target = mealsData[key]?.target ?? defaultMacro();
      const real = mealsData[key]?.real ?? defaultMacro();
      const dev = scostamentoCalorico(target, real);
      return {
        name: name,
        mealKey: key,
        index: i,
        scostamento: Math.max(-40, Math.min(40, dev)),
        target,
        real,
        color: colorForDeviation(dev),
      };
    });
  }, [mealsData]);

  const syncScore = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, d) => s + (100 - Math.min(100, Math.abs(d.scostamento))), 0);
    return Math.round(sum / chartData.length);
  }, [chartData]);

  const message = useMemo(() => {
    const avgDev = chartData.length
      ? chartData.reduce((s, d) => s + d.scostamento, 0) / chartData.length
      : 0;
    return getMotivationalMessage(avgDev);
  }, [chartData]);

  const selected = selectedIndex != null ? chartData[selectedIndex] : null;
  const foodTips = useMemo(() => {
    const tips = getTipsByMineral('Magnesio');
    if (tips.length === 0) return ['Suggerimento: Farro, Quinoa, Orzo (ricchi di magnesio per supporto metabolico).'];
    return [`Suggerimento: ${tips.join(', ')} per minerali come il Magnesio.`];
  }, [getTipsByMineral]);

  return (
    <div className="ghost-dashboard">
      <header className="ghost-dashboard-header">
        <h1 className="ghost-dashboard-title">👻 Ghost Mode</h1>
        <div className="ghost-sync-score" style={{ '--score-color': syncScore >= 70 ? COLORS.sync : syncScore >= 50 ? COLORS.moderate : COLORS.critical }}>
          Sync Score: <strong>{syncScore}%</strong>
        </div>
        <p className="ghost-message">{message}</p>
      </header>

      <div className="ghost-chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={chartData}
            margin={{ top: 16, right: 20, left: 12, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#b0b3b8', fontSize: 12 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
            />
            <YAxis
              domain={[-40, 40]}
              tick={{ fill: '#b0b3b8', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <ReferenceLine
              y={0}
              stroke={COLORS.zeroLine}
              strokeDasharray="6 4"
              strokeWidth={1.5}
            />
            <Tooltip
              contentStyle={{ background: '#1e1e1e', border: '1px solid #00ffcc', borderRadius: 8 }}
              labelStyle={{ color: '#00ffcc' }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Scostamento']}
              labelFormatter={(name) => name}
            />
            <Line
              type="monotone"
              dataKey="scostamento"
              stroke={COLORS.sync}
              strokeWidth={2}
              style={{ filter: `drop-shadow(${COLORS.syncGlow})` }}
              dot={({ cx, cy, payload }) => (
                <g
                  key={payload.name}
                  onClick={() => setSelectedIndex(payload.index)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10}
                    fill={payload.color}
                    stroke="#121212"
                    strokeWidth={2}
                    className="ghost-dot-click"
                    style={{ filter: `drop-shadow(0 0 8px ${payload.color})` }}
                  />
                </g>
              )}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="ghost-chart-legend">Clicca su un punto per aprire l’insight (Ghost Sync = linea a 0%)</p>
      </div>

      {selected && (
        <>
          <div className="insight-backdrop" onClick={() => setSelectedIndex(null)} aria-hidden="true" />
          <InsightCard
            mealLabel={selected.name}
            target={selected.target}
            real={selected.real}
            scostamentoPerc={selected.scostamento}
            foodTips={foodTips}
            onClose={() => setSelectedIndex(null)}
          />
        </>
      )}
    </div>
  );
}
