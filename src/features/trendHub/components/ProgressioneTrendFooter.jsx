import React from 'react';
import SaluteDashKpiCard from './SaluteDashKpiCard';

function TrendCard({ label, value, unit = '%', sub }) {
  const n = Number(value);
  const display = Number.isFinite(n) ? String(n) : '—';
  const trend = !Number.isFinite(n) ? 'none' : n >= 75 ? 'up' : n >= 50 ? 'flat' : 'down';

  return (
    <SaluteDashKpiCard
      compact
      icon="📈"
      title={label}
      value={display}
      unit={unit}
      trend={trend}
      invertTrendColors={true}
    />
  );
}

/**
 * L4 — Trend 7G/14G e aderenza storica (compatto).
 * Allenamento = media stimolo telemetria 7g, non completamento del calendario.
 */
export default function ProgressioneTrendFooter({
  adherence7d = null,
  adherence14d = null,
  daysLogged = 0,
  trainingPct = null,
  sleepPct = null,
} = {}) {
  return (
    <section
      className="mt-0.5 shrink-0 rounded-2xl border border-white/10 bg-slate-950/45 px-2 py-2.5"
      aria-label="Trend aderenza e strumenti secondari"
    >
      <p className="m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Trend &amp; aderenza storica
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <TrendCard label="Aderenza 7G" value={adherence7d} sub="media macro" />
        <TrendCard label="Aderenza 14G" value={adherence14d} sub="finestra" />
        <TrendCard label="Stimolo muscolare" value={trainingPct} />
        <TrendCard label="Sonno" value={sleepPct} />
      </div>
      <p className="m-0 mt-2 text-center text-[10px] text-slate-500">
        Giorni con diario nutrizionale valido:
        {' '}
        <span className="font-semibold tabular-nums text-slate-400">{daysLogged}</span>
        {' '}
        · finestra 14gg
      </p>
    </section>
  );
}
