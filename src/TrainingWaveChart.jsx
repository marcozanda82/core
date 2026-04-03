/**
 * Training Wave: area sovrapposte (digestione vs disponibilità energetica), gate neuro e surf sulla cresta glicidica.
 */
import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Line,
} from 'recharts';

function buildNeuroShadowRanges(data) {
  const ranges = [];
  let start = null;
  for (let i = 0; i < data.length; i++) {
    if (data[i].neuroGateUnsafe) {
      if (start == null) start = data[i].deltaHours;
    } else if (start != null) {
      ranges.push([start, data[i - 1].deltaHours]);
      start = null;
    }
  }
  if (start != null && data.length) ranges.push([start, data[data.length - 1].deltaHours]);
  return ranges;
}

export function TrainingWaveChart({ waveResult, variant = 'full', height }) {
  const data = waveResult?.series ?? [];
  const crestIndex = waveResult?.crestIndex ?? 0;

  const unsafeRanges = useMemo(() => buildNeuroShadowRanges(data), [data]);

  if (variant === 'sparkline') {
    const h = height ?? 40;
    return (
      <div style={{ width: '100%', height: h }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey="digestionLoad"
              stroke="rgba(239,68,68,0.4)"
              fill="rgba(239,68,68,0.1)"
              strokeWidth={1}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="glucoseAvailability"
              stroke="#22c55e"
              fill="rgba(34,197,94,0.2)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const fullH = height ?? 200;

  return (
    <div style={{ width: '100%', height: fullH }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -6, bottom: 6 }}>
          <defs>
            <linearGradient id="twDigest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="twGlucose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.07} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="deltaHours"
            type="number"
            domain={[0, 4]}
            tickFormatter={(v) => (v <= 0.02 ? 'Ora' : `+${Math.round(v * 60)}m`)}
            tick={{ fill: '#888', fontSize: 10 }}
            axisLine={{ stroke: '#333' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            width={34}
            axisLine={{ stroke: '#333' }}
            tickFormatter={(t) => `${t}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,15,18,0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              fontSize: 11,
            }}
            labelStyle={{ color: '#e5e5e5' }}
            formatter={(value, name) => [`${Math.round(Number(value) * 10) / 10}%`, name]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          />
          {unsafeRanges.map(([x1, x2], i) => (
            <ReferenceArea
              key={`neuro-gate-${i}`}
              x1={x1}
              x2={x2}
              y1={0}
              y2={100}
              fill="rgba(15,23,42,0.62)"
              stroke="rgba(248,113,113,0.25)"
              strokeWidth={1}
            />
          ))}
          <Area
            type="monotone"
            dataKey="digestionLoad"
            name="Impegno digestivo"
            stroke="#f87171"
            fill="url(#twDigest)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="glucoseAvailability"
            name="Disponibilità energetica (glicemia)"
            stroke="#4ade80"
            fill="url(#twGlucose)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="glucoseAvailability"
            stroke="transparent"
            strokeWidth={0}
            dot={(props) => {
              const { cx, cy, index } = props;
              if (index !== crestIndex || cx == null || cy == null) return null;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <text x={cx} y={cy - 12} textAnchor="middle" fontSize={17} aria-hidden>
                    🏄‍♂️
                  </text>
                </g>
              );
            }}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
