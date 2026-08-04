import React from 'react';

/**
 * Livello 2 — Radar rischio glicemico/metabolico (+ WHtR).
 */
export default function SaluteGlycemicRiskBar({
  riskPercent = 50,
  hoursFastedLabel = '—',
  muscleLabel = '—',
  whtr = null,
} = {}) {
  const pct = Math.max(0, Math.min(100, Number(riskPercent) || 0));
  const riskLabel =
    pct <= 33 ? 'Basso' : pct <= 66 ? 'Moderato' : 'Elevato';
  const whtrLabel = whtr != null && Number.isFinite(Number(whtr))
    ? Number(whtr).toFixed(2)
    : null;

  return (
    <section
      className="w-full min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3.5"
      aria-label={`Rischio glicemico ${riskLabel}: ${pct}%`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          Rischio glicemico / metabolico
        </h2>
        <span className="text-xs font-semibold tabular-nums text-slate-300">
          {riskLabel} · {pct}%
        </span>
      </div>

      <div className="relative mt-4 mb-1 h-4 w-full">
        <div
          className="absolute top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+2px)]"
          style={{ left: `${pct}%` }}
        >
          <div className="flex flex-col items-center">
            <span className="mb-0.5 rounded bg-slate-900/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cyan-300 ring-1 ring-cyan-500/30">
              {pct}
            </span>
            <span
              className="block h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-cyan-400"
              aria-hidden
            />
          </div>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 h-3.5 overflow-hidden rounded-full shadow-inner ring-1 ring-white/10"
          style={{
            background:
              'linear-gradient(90deg, #22c55e 0%, #eab308 48%, #ef4444 100%)',
          }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`Rischio ${pct} percento`}
        >
          <div
            className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 shadow-lg shadow-black/40"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>

      <div className="mt-3 flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="text-emerald-400/90">Verde · basso</span>
        <span className="text-red-400/90">Rosso · alto</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-3">
        <p className="m-0 truncate">
          Digiuno: <span className="font-semibold text-slate-200">{hoursFastedLabel}</span>
        </p>
        <p className="m-0 truncate text-right sm:text-center">
          Residuo: <span className="font-semibold text-slate-200">{muscleLabel}</span>
        </p>
        <p className="m-0 col-span-2 truncate text-right sm:col-span-1">
          WHtR:{' '}
          <span className="font-semibold text-slate-200">
            {whtrLabel ?? 'n/d'}
          </span>
        </p>
      </div>
    </section>
  );
}
