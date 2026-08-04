import React from 'react';

/**
 * KPI card compatta (Tailwind) — icona, titolo, valore, trend.
 */
export default function SaluteDashKpiCard({
  icon = '•',
  title,
  value,
  unit = '',
  trend = 'none',
  /** Per peso/girovita: down = miglioramento (verde) */
  invertTrendColors = false,
} = {}) {
  const showArrow = trend === 'up' || trend === 'down';
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '→' : '';

  let arrowClass = 'text-slate-500';
  if (showArrow) {
    // Default (peso/vita): ↓ verde (migliora), ↑ rosso. invertTrendColors inverte.
    if (invertTrendColors) {
      arrowClass = trend === 'up' ? 'text-emerald-400' : 'text-rose-400';
    } else if (trend === 'up') {
      arrowClass = 'text-rose-400';
    } else {
      arrowClass = 'text-emerald-400';
    }
  } else if (trend === 'flat') {
    arrowClass = 'text-cyan-400';
  }

  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-3 shadow-inner shadow-black/20">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-[11px] text-cyan-300"
          aria-hidden
        >
          {icon}
        </span>
        <h3 className="m-0 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
          {title}
        </h3>
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
    </article>
  );
}
