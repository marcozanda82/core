import React from 'react';

const ACCENT = {
  violet: {
    idle: 'border-violet-500/35 hover:border-violet-400/55 hover:shadow-[0_0_18px_rgba(139,92,246,0.16)]',
    active: 'border-violet-400/70 bg-violet-950/35 shadow-[0_0_22px_rgba(139,92,246,0.22)]',
    iconBg: 'bg-violet-500/15 text-violet-300',
    panel: 'border-violet-500/25 bg-violet-950/20',
    title: 'text-violet-300/90',
  },
  orange: {
    idle: 'border-orange-500/35 hover:border-orange-400/55 hover:shadow-[0_0_18px_rgba(249,115,22,0.16)]',
    active: 'border-orange-400/70 bg-orange-950/35 shadow-[0_0_22px_rgba(249,115,22,0.2)]',
    iconBg: 'bg-orange-500/15 text-orange-300',
    panel: 'border-orange-500/25 bg-orange-950/20',
    title: 'text-orange-300/90',
  },
  cyan: {
    idle: 'border-cyan-500/35 hover:border-cyan-400/55 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)]',
    active: 'border-cyan-400/70 bg-cyan-950/40 shadow-[0_0_22px_rgba(34,211,238,0.2)]',
    iconBg: 'bg-cyan-500/15 text-cyan-300',
    panel: 'border-cyan-500/25 bg-cyan-950/20',
    title: 'text-cyan-300/90',
  },
  lime: {
    idle: 'border-lime-500/35 hover:border-lime-400/55 hover:shadow-[0_0_18px_rgba(163,230,53,0.16)]',
    active: 'border-lime-400/70 bg-lime-950/30 shadow-[0_0_22px_rgba(163,230,53,0.18)]',
    iconBg: 'bg-lime-500/15 text-lime-300',
    panel: 'border-lime-500/25 bg-lime-950/15',
    title: 'text-lime-300/90',
  },
};

const BAR_FILL = {
  good: 'bg-emerald-400',
  mid: 'bg-amber-400',
  low: 'bg-rose-400',
  info: 'bg-cyan-400',
};

/**
 * L3 — Griglia 2×2 pilastri macro + pannello drill-down.
 */
export default function ProgressioneMacroPillarGrid({
  pillars = [],
  activeId = null,
  onSelect = null,
} = {}) {
  const active = pillars.find((p) => p.id === activeId) || null;
  const accent = active ? ACCENT[active.accent] || ACCENT.violet : null;

  return (
    <div className="w-full min-w-0 shrink-0" role="group" aria-label="Pilastri macro ricomposizione">
      <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        I 4 pilastri
      </p>
      <div className="grid grid-cols-2 gap-2">
        {pillars.map((pillar) => {
          const styles = ACCENT[pillar.accent] || ACCENT.violet;
          const isActive = activeId === pillar.id;
          return (
            <button
              key={pillar.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                if (typeof onSelect !== 'function') return;
                onSelect(isActive ? null : pillar.id);
              }}
              className={`flex min-h-[5rem] flex-col items-start justify-between rounded-2xl border bg-slate-950/55 px-2.5 py-2 text-left transition-all duration-200 ${
                isActive ? styles.active : styles.idle
              }`}
            >
              <div className="flex w-full items-start justify-between gap-1">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] ${styles.iconBg}`} aria-hidden>
                  {pillar.icon}
                </span>
                <span className={`text-[10px] font-bold tabular-nums ${
                  pillar.isInProgress ? 'text-cyan-300' : 'text-slate-300'
                }`}
                >
                  {pillar.pct}%
                </span>
              </div>
              <div className="mt-1.5 min-w-0 w-full">
                <p className="m-0 text-[10px] font-semibold leading-tight text-slate-100">{pillar.title}</p>
                <p className="m-0 mt-0.5 truncate text-[9px] text-slate-500">{pillar.detail}</p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800/90">
                  <div
                    className={`h-full rounded-full ${BAR_FILL[pillar.tone] || BAR_FILL.mid}`}
                    style={{ width: `${Math.max(0, Math.min(100, pillar.pct))}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {active && accent ? (
        <section
          className={`mt-2 flex flex-col gap-2 rounded-2xl border p-2.5 ${accent.panel}`}
          aria-label={`Dettaglio ${active.title}`}
        >
          <p className={`m-0 px-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${accent.title}`}>
            {active.icon}
            {' '}
            {active.title}
          </p>
          <p className="m-0 text-[11px] leading-relaxed text-slate-200">
            {active.isInProgress ? (
              <span className="text-cyan-100">{active.feedback}</span>
            ) : active.feedback}
          </p>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 px-2.5 py-2">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Tip pratico</p>
            <p className="m-0 mt-1 text-[11px] leading-relaxed text-cyan-100/95">💡 {active.tip}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
