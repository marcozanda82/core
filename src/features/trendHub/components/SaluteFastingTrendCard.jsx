import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';

/**
 * KPI Media digiuno 14gg — tap per espandere il mini BarChart storico.
 */
export default function SaluteFastingTrendCard({
  value = '—',
  unit = 'h',
  trend = 'none',
  fastingHistory = [],
} = {}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const showArrow = trend === 'up' || trend === 'down';
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '→' : '';

  let arrowClass = 'text-slate-500';
  if (showArrow) {
    arrowClass = trend === 'up' ? 'text-emerald-400' : 'text-rose-400';
  } else if (trend === 'flat') {
    arrowClass = 'text-cyan-400';
  }

  const trendData = useMemo(() => {
    if (!Array.isArray(fastingHistory)) return [];
    return fastingHistory
      .filter((row) => row && Number.isFinite(Number(row.hours)))
      .map((row) => ({
        date: row.date,
        hours: Number(row.hours),
      }));
  }, [fastingHistory]);

  const hasChart = trendData.length > 0;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label="Media digiuno 14 giorni. Tocca per il grafico."
      onClick={() => setIsExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsExpanded((v) => !v);
        }
      }}
      className={`flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-3 shadow-inner shadow-black/20 transition-colors duration-200 hover:bg-slate-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60 ${
        isExpanded ? 'col-span-2' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-[11px] text-cyan-300"
          aria-hidden
        >
          ⏳
        </span>
        <h3 className="m-0 min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
          Media digiuno (14gg)
        </h3>
        <span className="shrink-0 text-[10px] font-semibold text-slate-500" aria-hidden>
          {isExpanded ? '▴' : '▾'}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-2xl font-extrabold tabular-nums leading-none text-slate-50">
            {value}
          </span>
          {unit ? (
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-lg font-bold leading-none ${arrowClass}`}
          aria-label={trend === 'none' ? 'trend non disponibile' : `trend ${trend}`}
        >
          {arrow || '·'}
        </span>
      </div>

      {isExpanded && hasChart ? (
        <div
          className="mt-3 h-24 w-full border-t border-slate-700/50 pt-3 transition-all"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trendData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="18%"
            >
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                stroke="#64748b"
                fontSize={10}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#38bdf8',
                }}
                itemStyle={{ color: '#38bdf8' }}
                formatter={(val) => [`${Number(val).toFixed(1)} h`, 'Digiuno']}
              />
              <Bar
                dataKey="hours"
                fill="#38bdf8"
                opacity={0.8}
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {isExpanded && !hasChart ? (
        <p className="mb-0 mt-3 border-t border-slate-700/50 pt-3 text-center text-[10px] text-slate-500">
          Nessun giorno con pasti sufficienti negli ultimi 14gg
        </p>
      ) : null}
    </article>
  );
}
