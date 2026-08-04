import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { buildWeightTrendSeries } from '../utils/healthBiometrics';

function formatTickDate(iso) {
  const parts = String(iso || '').split('-');
  if (parts.length < 3) return '';
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Line chart compatto (Recharts) — storico peso recente.
 * @param {{ recentBodyMetrics?: Array<Record<string, unknown>>, maxPoints?: number }} props
 */
export default function SaluteWeightTrendChart({
  recentBodyMetrics = [],
  maxPoints = 14,
} = {}) {
  const data = useMemo(
    () => buildWeightTrendSeries(recentBodyMetrics, { maxPoints }),
    [recentBodyMetrics, maxPoints],
  );

  if (data.length < 2) {
    return (
      <div className="salute-trend-chart salute-trend-chart--empty" role="status">
        <p>Servono almeno 2 misure di peso per il grafico.</p>
      </div>
    );
  }

  const weights = data.map((d) => d.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = Math.max(0.4, (max - min) * 0.25 || 0.5);

  return (
    <div className="salute-trend-chart" role="img" aria-label="Trend peso recente">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatTickDate}
            tick={{ fill: 'rgba(148,163,184,0.85)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            minTickGap={28}
          />
          <YAxis
            domain={[Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10]}
            tick={{ fill: 'rgba(148,163,184,0.75)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v) => Number(v).toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              background: '#12141a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(value) => [`${Number(value).toFixed(1)} kg`, 'Peso']}
            labelFormatter={(label) => `Data ${label}`}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#22d3ee"
            strokeWidth={2.5}
            dot={{ r: data.length <= 10 ? 3.5 : 0, fill: '#22d3ee', stroke: '#0a0c10', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: '#fff' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
