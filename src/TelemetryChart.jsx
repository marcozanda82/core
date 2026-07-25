import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

const SYNC_ID = 'telemetry';

const MUSCLE_LINES = [
  { key: 'push', label: 'Spinta', color: '#f472b6' },
  { key: 'pull', label: 'Trazione', color: '#22d3ee' },
  { key: 'legs', label: 'Gambe', color: '#a3e635' },
];

function formatDateLabel(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!d || !m) return iso;
  return `${d}/${m}`;
}

function formatPct01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function DarkTelemetryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-white/12 bg-[rgba(8,10,14,0.96)] px-3 py-2.5 text-xs shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
      <p className="mb-2 font-semibold tracking-wide text-slate-100">
        {formatDateLabel(label ?? row.date)}
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-red-300/90">Fatica sistemica</span>
          <span className="font-mono tabular-nums text-red-200">{formatPct01(row.fatigue)}</span>
        </div>
        {MUSCLE_LINES.map(({ key, label: muscleLabel, color }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span style={{ color }}>{muscleLabel}</span>
            <span className="font-mono tabular-nums text-slate-200">{formatPct01(row[key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CHART_MARGIN = { top: 0, right: 4, left: 0, bottom: 0 };
const TOOLTIP_CURSOR = { stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 };

const AXIS_TICK = {
  fill: 'rgba(148, 163, 184, 0.55)',
  fontSize: 9,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/**
 * Grafici storici impilati 4 cilindri con cursore verticale sincronizzato (Recharts syncId).
 *
 * @param {{ data?: Array<{ date: string, push: number, pull: number, legs: number, fatigue: number }> }} props
 */
export default function TelemetryChart({ data = [] }) {
  const series = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const hasAnySnapshot = useMemo(
    () => series.some((row) => row?.hasSnapshot),
    [series],
  );

  if (!series.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-6 text-center">
        <p className="text-[11px] text-slate-500">Nessun dato storico disponibile.</p>
      </div>
    );
  }

  if (!hasAnySnapshot) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-6 text-center">
        <p className="text-[11px] text-slate-500">
          Nessuno snapshot 4 cilindri nel periodo. Salva un allenamento per popolare i grafici.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080a0e]">
      <div className="border-b border-white/5 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Storico telemetria · cursore sincronizzato
        </p>
      </div>

      {/* Grafico 1 — Fatica sistemica */}
      <div className="h-[108px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            syncId={SYNC_ID}
            margin={CHART_MARGIN}
          >
            <defs>
              <linearGradient id="fatigueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <YAxis
              domain={[0, 1]}
              hide
              ticks={[0, 0.5, 1]}
            />
            <Tooltip
              content={<DarkTelemetryTooltip />}
              cursor={TOOLTIP_CURSOR}
            />
            <Area
              type="monotone"
              dataKey="fatigue"
              stroke="#f87171"
              strokeWidth={2}
              fill="url(#fatigueFill)"
              fillOpacity={1}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3, fill: '#fca5a5', stroke: '#450a0a', strokeWidth: 1 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="px-3 pb-1 pt-0.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-red-400/70">
          Fatica sistemica
        </p>
      </div>

      {/* Grafico 2 — Stimolo muscolare (push / pull / legs) */}
      <div className="h-[148px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            syncId={SYNC_ID}
            margin={{ ...CHART_MARGIN, bottom: 2 }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={AXIS_TICK}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}`}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={28}
              ticks={[0, 0.5, 1]}
            />
            <Tooltip
              content={<DarkTelemetryTooltip />}
              cursor={TOOLTIP_CURSOR}
            />
            {MUSCLE_LINES.map(({ key, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 3, strokeWidth: 1, stroke: '#0f172a' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-white/5 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-red-400/80">
          <span className="h-1.5 w-3 rounded-sm bg-red-400/80" />
          Fatigue
        </span>
        {MUSCLE_LINES.map(({ key, label, color }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500"
          >
            <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
