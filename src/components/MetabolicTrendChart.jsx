import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  buildMetabolicCompensationSeries,
  withCompensationStrokeFields,
  GHOST_CORRIDOR_HALF_WIDTH_KCAL,
} from '../utils/metabolicCompensationCurve';

function formatKcal(n) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+${v}`;
  return String(v);
}

function GhostCarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-white/12 bg-[rgba(8,10,14,0.96)] px-3 py-2.5 text-xs shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
      <p className="mb-2 font-semibold tracking-wide text-slate-100">
        {row.label}
        <span className="ml-2 font-mono text-[10px] text-slate-500">{row.date}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Ghost (Σ piano)</span>
          <span className="font-mono tabular-nums text-slate-200">{formatKcal(row.ghost)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-cyan-300">Reale (Σ vs TDEE)</span>
          <span className="font-mono tabular-nums text-cyan-100">{formatKcal(row.real)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Δ giorno piano</span>
          <span className="font-mono tabular-nums text-slate-400">{formatKcal(row.plannedDelta)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Δ giorno reale</span>
          <span className="font-mono tabular-nums text-slate-400">{formatKcal(row.actualDelta)}</span>
        </div>
        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${
          row.inCorridor ? 'text-emerald-400' : 'text-orange-400'
        }`}
        >
          {row.inCorridor ? '● Dentro corridoio (±300)' : '● Fuori corridoio — compensa in 48h'}
        </p>
      </div>
    </div>
  );
}

/**
 * MetabolicTrendChart — Curva di Compensazione Metabolica (solo Diag/Trend).
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   className?: string,
 * }} props
 */
export default function MetabolicTrendChart({
  fullHistory = null,
  userTargets = null,
  activeLog = null,
  activeDate = null,
  className = '',
} = {}) {
  const series = useMemo(
    () => buildMetabolicCompensationSeries({
      fullHistory,
      userTargets,
      activeLog,
      activeDate,
      windowDays: 7,
      corridorHalfWidth: GHOST_CORRIDOR_HALF_WIDTH_KCAL,
    }),
    [fullHistory, userTargets, activeLog, activeDate],
  );

  const chartPoints = useMemo(
    () => withCompensationStrokeFields(series.points),
    [series.points],
  );

  const { adherenceOk, latest, corridorHalfWidth } = series;

  if (!chartPoints.length) {
    return (
      <div className={`rounded-xl border border-white/10 bg-slate-900/50 px-3 py-4 ${className}`.trim()}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Curva di compensazione
        </p>
        <p className="mt-2 text-xs text-slate-500">Dati insufficienti negli ultimi 7 giorni.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 shadow-lg backdrop-blur-sm ${className}`.trim()}
      aria-label="Curva di compensazione metabolica Ghost Car"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Compensazione metabolica · 7g
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Ghost Car ±{corridorHalfWidth} kcal · cicli chiusi fino a ieri
          </p>
        </div>
        <span
          className={[
            'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
            adherenceOk
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-orange-500/40 bg-orange-500/10 text-orange-300',
          ].join(' ')}
        >
          {adherenceOk ? 'In fascia' : 'Compensa'}
        </span>
      </div>

      <div className="h-[180px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartPoints} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="ghostCorridorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(148, 163, 184, 0.28)" />
                <stop offset="50%" stopColor="rgba(100, 116, 139, 0.14)" />
                <stop offset="100%" stopColor="rgba(148, 163, 184, 0.22)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatKcal(v)}
              width={42}
            />
            <Tooltip content={<GhostCarTooltip />} />

            {/* Corridoio fantasma: stack base invisibile + fascia ±halfWidth */}
            <Area
              type="monotone"
              dataKey="corridorBase"
              stackId="ghostBand"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="corridorWidth"
              stackId="ghostBand"
              stroke="none"
              fill="url(#ghostCorridorFill)"
              fillOpacity={1}
              isAnimationActive={false}
            />

            {/* Centro Ghost (traccia ideale sottile) */}
            <Line
              type="monotone"
              dataKey="ghost"
              stroke="rgba(148, 163, 184, 0.55)"
              strokeWidth={1.25}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />

            {/* Traiettoria utente — ciano in fascia, arancio fuori */}
            <Line
              type="monotone"
              dataKey="realCyan"
              stroke="#22d3ee"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#020617', stroke: '#22d3ee', strokeWidth: 1.5 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="realOrange"
              stroke="#fb923c"
              strokeWidth={2.25}
              dot={{ r: 3, fill: '#020617', stroke: '#fb923c', strokeWidth: 1.5 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-sm bg-slate-500/40" />
          Fascia Ghost
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-sm bg-cyan-400" />
          Traiettoria
        </span>
        {latest ? (
          <span className="ml-auto font-mono tabular-nums text-slate-400">
            ΣΔ {formatKcal(latest.real)} · Ghost {formatKcal(latest.ghost)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
