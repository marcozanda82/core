import React from 'react';

const PILLARS = [
  {
    id: 'cardio',
    icon: '❤️‍🔥',
    title: 'Cardio & Mitocondri',
    hint: 'Sessioni · digiuno · rischio',
    accent: 'border-rose-500/35 hover:border-rose-400/55 hover:shadow-[0_0_18px_rgba(244,63,94,0.18)]',
    active: 'border-rose-400/70 bg-rose-950/40 shadow-[0_0_22px_rgba(244,63,94,0.22)]',
    iconBg: 'bg-rose-500/15 text-rose-300',
  },
  {
    id: 'strength',
    icon: '🏋️',
    title: 'Forza & Massa Magra',
    hint: 'Pilastri · volume · residuo',
    accent: 'border-amber-500/35 hover:border-amber-400/55 hover:shadow-[0_0_18px_rgba(251,191,36,0.16)]',
    active: 'border-amber-400/70 bg-amber-950/35 shadow-[0_0_22px_rgba(251,191,36,0.2)]',
    iconBg: 'bg-amber-500/15 text-amber-300',
  },
  {
    id: 'nutrition',
    icon: '🥗',
    title: 'Nutrizione Clinica',
    hint: 'Insight AI giornaliero',
    accent: 'border-emerald-500/35 hover:border-emerald-400/55 hover:shadow-[0_0_18px_rgba(52,211,153,0.16)]',
    active: 'border-emerald-400/70 bg-emerald-950/35 shadow-[0_0_22px_rgba(52,211,153,0.2)]',
    iconBg: 'bg-emerald-500/15 text-emerald-300',
  },
  {
    id: 'sleep',
    icon: '😴',
    title: 'Sonno & Recupero',
    hint: 'Ghost · trend 14gg',
    accent: 'border-cyan-500/35 hover:border-cyan-400/55 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)]',
    active: 'border-cyan-400/70 bg-cyan-950/40 shadow-[0_0_22px_rgba(34,211,238,0.2)]',
    iconBg: 'bg-cyan-500/15 text-cyan-300',
  },
];

/**
 * Livello 3 — Griglia 2×2 di navigazione verso i 4 pilastri Longevità.
 */
export default function SalutePillarNavGrid({
  activeId = null,
  onSelect = null,
  scores = null,
} = {}) {
  const s = scores && typeof scores === 'object' ? scores : {};

  return (
    <div className="w-full min-w-0" role="group" aria-label="Approfondisci i pilastri">
      <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Approfondisci
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PILLARS.map((pillar) => {
          const isActive = activeId === pillar.id;
          const pct = Number(s[pillar.id]);
          const pctLabel = Number.isFinite(pct) ? `${Math.round(pct)}%` : null;
          return (
            <button
              key={pillar.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                if (typeof onSelect !== 'function') return;
                onSelect(isActive ? null : pillar.id);
              }}
              className={`flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl border bg-slate-950/55 px-2.5 py-2 text-left transition-all duration-200 ${
                isActive ? pillar.active : pillar.accent
              }`}
            >
              <div className="flex w-full items-start justify-between gap-1">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] ${pillar.iconBg}`}
                  aria-hidden
                >
                  {pillar.icon}
                </span>
                {pctLabel ? (
                  <span className="text-[10px] font-bold tabular-nums text-slate-400">
                    {pctLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 min-w-0">
                <p className="m-0 text-[11px] font-semibold leading-tight text-slate-100">
                  {pillar.title}
                </p>
                <p className="m-0 mt-0.5 text-[9px] leading-snug text-slate-500">
                  {pillar.hint}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PILLARS as SALUTE_PILLAR_NAV_ITEMS };
