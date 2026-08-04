import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { SLEEP_TARGET_HOURS } from '../utils/saluteDashboardMetrics';
import { sleepQualityLabel } from '../utils/sleepLogs';

/**
 * KPI sonno full-width — effetto Ghost Car (barra solida vs target/media).
 */
export default function SaluteSleepGhostCard({
  hours = null,
  quality = null,
  ghostHours = SLEEP_TARGET_HOURS,
  ghostLabel = 'Target',
} = {}) {
  const actual = Number.isFinite(Number(hours)) ? Number(hours) : null;
  const ghost = Number.isFinite(Number(ghostHours)) ? Number(ghostHours) : SLEEP_TARGET_HOURS;

  const chartData = useMemo(() => ([{
    name: 'Notte',
    actual: actual ?? 0,
    ghost,
  }]), [actual, ghost]);

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

  const yMax = Math.max(10, Math.ceil((Math.max(actual ?? 0, ghost) + 1) * 2) / 2);

  return (
    <article
      className="col-span-2 flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-3 shadow-inner shadow-black/20"
      aria-label="Sonno ultima notte"
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
              Solida = notte · Ghost = {ghostLabel.toLowerCase()} ({ghost}h)
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

      <div className="h-[112px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            barCategoryGap="28%"
            barGap={-36}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="name" hide />
            <YAxis
              domain={[0, yMax]}
              tick={{ fill: 'rgba(148,163,184,0.75)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={28}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              contentStyle={{
                background: '#12141a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const label = name === 'ghost' ? ghostLabel : 'Ultima notte';
                return [`${Number(value).toFixed(1)} h`, label];
              }}
            />
            <ReferenceLine
              y={SLEEP_TARGET_HOURS}
              stroke="rgba(99,102,241,0.45)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            {/* Ghost dietro */}
            <Bar
              dataKey="ghost"
              name="ghost"
              fill="rgba(148, 163, 184, 0.28)"
              radius={[8, 8, 4, 4]}
              maxBarSize={52}
              isAnimationActive={false}
            />
            {/* Solida davanti */}
            <Bar
              dataKey="actual"
              name="actual"
              fill="#818cf8"
              radius={[8, 8, 4, 4]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
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
