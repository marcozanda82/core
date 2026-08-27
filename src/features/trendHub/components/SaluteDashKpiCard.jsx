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
  /** Layout compatto per griglie strette (es. 3 colonne parametri strutturali) */
  compact = false,
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
    <article className={`flex min-w-0 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-inner shadow-black/20 ${
      compact ? 'gap-1 px-2 py-2.5' : 'gap-1.5 p-3'
    }`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300 ${
            compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]'
          }`}
          aria-hidden
        >
          {icon}
        </span>
        <h3 className={`m-0 min-w-0 truncate font-bold uppercase text-slate-400 ${
          compact ? 'text-[9px] tracking-[0.08em]' : 'text-[10px] tracking-[0.1em]'
        }`}>
          {title}
        </h3>
      </div>
      <div className={`flex items-end ${compact ? 'justify-start gap-1' : 'justify-between gap-2'}`}>
        <div className="flex min-w-0 items-baseline gap-0.5">
          <span className={`whitespace-nowrap font-bold tabular-nums leading-none text-slate-50 ${
            compact ? 'text-xl tracking-tight' : 'text-2xl font-extrabold'
          }`}>
            {value}
          </span>
          {unit ? (
            <span className={`shrink-0 font-semibold text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {unit}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <span
            className={`shrink-0 text-lg font-bold leading-none ${arrowClass}`}
            aria-label={trend === 'none' ? 'trend non disponibile' : `trend ${trend}`}
          >
            {arrow || '·'}
          </span>
        ) : showArrow ? (
          <span
            className={`ml-auto shrink-0 text-sm font-bold leading-none ${arrowClass}`}
            aria-label={trend === 'none' ? 'trend non disponibile' : `trend ${trend}`}
          >
            {arrow}
          </span>
        ) : null}
      </div>
    </article>
  );
}
