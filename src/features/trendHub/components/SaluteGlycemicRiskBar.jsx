import React, { useId, useMemo, useState } from 'react';

/**
 * Livello 2 — Radar rischio glicemico/metabolico (+ WHtR) + breakdown espandibile.
 */
export default function SaluteGlycemicRiskBar({
  riskPercent = 50,
  hoursFastedLabel = '—',
  muscleLabel = '—',
  whtr = null,
  breakdown = null,
} = {}) {
  const [showDetails, setShowDetails] = useState(false);
  const uid = useId().replace(/:/g, '');
  const panelId = `glycemic-breakdown-${uid}`;

  const pct = Math.max(0, Math.min(100, Number(riskPercent) || 0));
  const riskLabel =
    pct <= 33 ? 'Basso' : pct <= 66 ? 'Moderato' : 'Elevato';
  const whtrLabel = whtr != null && Number.isFinite(Number(whtr))
    ? Number(whtr).toFixed(2)
    : null;

  const lines = breakdown?.lines && typeof breakdown.lines === 'object'
    ? breakdown.lines
    : null;

  const aria = useMemo(
    () => `Rischio glicemico ${riskLabel}: ${pct} percento. Tocca per ${showDetails ? 'nascondere' : 'mostrare'} il dettaglio del calcolo.`,
    [riskLabel, pct, showDetails],
  );

  return (
    <section className="w-full min-w-0" aria-label={aria}>
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="w-full min-w-0 cursor-pointer rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3.5 text-left transition-colors duration-200 hover:border-white/20 hover:bg-slate-950/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60 active:scale-[0.998]"
        aria-expanded={showDetails}
        aria-controls={panelId}
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
            Media Digiuno (14gg):{' '}
            <span className="font-semibold text-slate-200">{hoursFastedLabel}</span>
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

        <p className="mb-0 mt-2 text-center text-[10px] uppercase tracking-wider text-slate-500">
          {showDetails ? 'Tocca per chiudere' : 'Tocca per il breakdown · Trend 14gg + live'}
        </p>
      </button>

      <div
        id={panelId}
        className={`w-full overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
          showDetails
            ? 'mt-2 max-h-64 opacity-100'
            : 'mt-0 max-h-0 opacity-0'
        }`}
        aria-hidden={!showDetails}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Come è calcolato il rischio
          </p>
          <ul className="space-y-2 text-[12px] leading-snug text-slate-200">
            <li>
              <span className="font-semibold text-slate-300">📅 Sensibilità base (Trend 14gg)</span>
              <p className="m-0 mt-0.5 text-slate-400">
                {lines?.sensitivity
                  ?? 'Trend sonno e cardio allineati alla finestra longevità (14 giorni).'}
              </p>
            </li>
            <li>
              <span className="font-semibold text-slate-300">⏱️ Stato acuto (Digiuno/Pasti)</span>
              <p className="m-0 mt-0.5 text-slate-400">
                {lines?.acute
                  ?? 'Stato acuto derivato dall\'ultimo pasto loggato e dal digiuno corrente.'}
              </p>
            </li>
            <li className="border-t border-white/5 pt-2">
              <span className="font-semibold text-slate-300">⚖️ Filtro strutturale (WHtR)</span>
              <p className="m-0 mt-0.5 text-slate-400">
                {lines?.structural
                  ?? 'Rapporto girovita/altezza (soglia clinica 0,5 × altezza in cm).'}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
