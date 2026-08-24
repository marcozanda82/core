import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import CustomDateTick from '../CustomDateTick';

/**
 * Trend cumulativo report — lazy per non trascinare recharts nel bundle SalaComandi.
 */
export default function TrendMetricLineChart({ trendData = [], trendDays = 30 }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 52 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
        <XAxis
          dataKey="date"
          tick={<CustomDateTick />}
          tickLine={false}
          axisLine={{ stroke: '#333' }}
          minTickGap={40}
          height={60}
        />
        <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 10 }} width={36} />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px' }}
          labelStyle={{ color: '#aaa' }}
          formatter={(value, name) => [value, name === 'score' ? 'Score cumulativo' : name]}
          labelFormatter={(label) => `Data ${label}`}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#00e5ff"
          strokeWidth={trendDays > 90 ? 2 : 3}
          dot={trendDays <= 30 ? { r: 4, fill: '#00e5ff', stroke: '#1a1a1c', strokeWidth: 2 } : false}
          activeDot={{ r: 6, fill: '#fff' }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
