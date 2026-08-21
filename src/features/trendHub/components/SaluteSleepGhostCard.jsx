import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SLEEP_TARGET_HOURS } from '../utils/saluteDashboardMetrics';
import { sleepQualityLabel } from '../utils/sleepLogs';

/**
 * KPI sonno full-width — trend 14gg (barre) + Ghost Car / media (linee).
 */
export default function SaluteSleepGhostCard({
  hours = null,
  quality = null,
  ghostHours = SLEEP_TARGET_HOURS,
  ghostLabel = 'Target',
  sleepData = [],
  avg14Days = null,
} = {}) {
  const actual = Number.isFinite(Number(hours)) ? Number(hours) : null;
  const ghost = Number.isFinite(Number(ghostHours)) ? Number(ghostHours) : SLEEP_TARGET_HOURS;
  const avg14 = Number.isFinite(Number(avg14Days)) ? Number(avg14Days) : null;

  const chartData = useMemo(() => {
    if (!Array.isArray(sleepData) || sleepData.length === 0) return [];
    return sleepData.map((row) => ({
      date: row.date,
      hours: Number.isFinite(Number(row.hours)) ? Number(row.hours) : null,
    }));
  }, [sleepData]);

  const delta = actual != null ? Math.round((actual - ghost) * 10) / 10 : null;
  const trend = delta == null
    ? 'none'
    : delta > 0.15
      ? 'up'
      : delta < -0.15
        ? 'down'
        : 'flat';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '→' : '·';
  const trendClass = trend === 'up'
    ? 'text-emerald-400'
    : trend === 'down'
      ? 'text-rose-400'
      : 'text-cyan-400';

  const yMax = useMemo(() => {
    const vals = chartData
      .map((d) => d.hours)
      .filter((h) => Number.isFinite(h));
    const peak = Math.max(
      actual ?? 0,
      ghost,
      avg14 ?? 0,
      ...vals,
      SLEEP_TARGET_HOURS,
    );
    return Math.max(10, Math.ceil((peak + 1) * 2) / 2);
  }, [chartData, actual, ghost, avg14]);

  return (
    <article
      className="col-span-2 flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-3 shadow-inner shadow-black/20"
      aria-label="Sonno Ghost Car ultimi 14 giorni"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-[11px] text-indigo-300"
            aria-hidden
          >
            ☾
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Sonno · Ghost Car
            </h3>
            <p className="m-0 truncate text-[11px] text-slate-500">
              14gg · Ghost = {ghostLabel.toLowerCase()} ({ghost.toFixed(1)}h)
              {avg14 != null ? ` · Media 14gg ${avg14.toFixed(1)}h` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tabular-nums leading-none text-slate-50">
            {actual != null ? actual.toFixed(1) : '—'}
          </span>
          <span className="text-xs font-semibold text-slate-500">h</span>
          <span className={`text-lg font-bold leading-none ${trendClass}`} aria-hidden>
            {trendArrow}
          </span>
        </div>
      </div>

      <div className="h-[140px] w-full min-w-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 8, left: -4, bottom: 0 }}
              barCategoryGap="18%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={10}
              />
              <YAxis
                domain={[0, yMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 10 }}
                width={28}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#e2e8f0',
                }}
                formatter={(value, name) => {
                  if (name === 'hours' && value == null) return ['—', 'Sonno'];
                  if (name === 'hours') return [`${Number(value).toFixed(1)} h`, 'Sonno'];
                  return [`${Number(value).toFixed(1)} h`, name];
                }}
              />
              <ReferenceLine
                y={ghost}
                stroke="rgba(148,163,184,0.55)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{
                  value: 'Ghost',
                  position: 'insideTopRight',
                  fill: 'rgba(148,163,184,0.7)',
                  fontSize: 9,
                }}
              />
              {avg14 != null ? (
                <ReferenceLine
                  y={avg14}
                  stroke="rgba(56,189,248,0.55)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                  label={{
                    value: 'Media 14',
                    position: 'insideTopLeft',
                    fill: 'rgba(56,189,248,0.75)',
                    fontSize: 9,
                  }}
                />
              ) : null}
              <Bar
                dataKey="hours"
                name="hours"
                fill="#818cf8"
                fillOpacity={0.85}
                radius={[3, 3, 0, 0]}
                maxBarSize={12}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="hours"
                name="trend"
                stroke="#a5b4fc"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
                activeDot={{ r: 3, fill: '#c7d2fe' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
            Nessun sonno registrato negli ultimi 14 giorni
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Qualità:{' '}
          <span className="font-semibold text-slate-300">
            {quality ? sleepQualityLabel(quality) : 'n/d'}
          </span>
        </span>
        <span className="tabular-nums">
          vs ghost:{' '}
          <span className={`font-semibold ${trendClass}`}>
            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}h`}
          </span>
        </span>
      </div>
    </article>
  );
}
