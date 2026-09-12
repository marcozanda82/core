import React from 'react';
import TelemetryChart from '../../../TelemetryChart';
import ProgressioneTrendFooter from './ProgressioneTrendFooter';
import { useMuscleTelemetryModel } from '../utils/muscleTelemetryModel';
import MuscleStimulusDistrictList from './MuscleStimulusDistrictList';

/**
 * Vista autonoma: accumulo stimolo, storico 14g/30g, trend & aderenza.
 */
export default function MuscleTelemetryHub({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  adherence7d = null,
  adherence14d = null,
  daysLogged = 0,
  trainingPct = null,
  sleepPct = null,
  onBack = null,
} = {}) {
  const {
    muscleRows,
    telemetrySeries,
    historyDays,
    setHistoryDays,
  } = useMuscleTelemetryModel({
    fourCylinder,
    fullHistory,
    activeLog,
    activeDate,
  });

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-2.5"
      aria-label="Telemetria muscolare e volume"
    >
      {typeof onBack === 'function' ? (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-left text-[12px] font-semibold text-cyan-200 transition hover:border-cyan-400/35"
        >
          ← Torna a Salute
        </button>
      ) : null}

      <header className="rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-950/40 to-slate-950/90 px-3 py-2.5">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/85">
          Telemetria muscolare &amp; volume
        </p>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-slate-300">
          Stato recupero distretti, fatica sistemica e curve a 14g/30g
        </p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 px-3 py-3">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Accumulo stimolo per distretto
        </p>
        <p className="m-0 mt-1 text-[11px] text-slate-400">
          Card graduate · PRIORITÀ (stimolo più basso) / DA STIMOLARE / IN RECUPERO / OTTIMALE
        </p>

        <div className="mt-2.5">
          <MuscleStimulusDistrictList muscleRows={muscleRows} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Volume &amp; frequenza · storico
          </p>
          <div className="flex rounded-md border border-white/10 bg-black/40 p-0.5">
            {[14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHistoryDays(days)}
                className={[
                  'rounded px-2 py-0.5 font-mono text-[10px] transition-colors',
                  historyDays === days
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                {days}g
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
          <div className="min-w-[min(100%,520px)] px-1">
            <TelemetryChart data={telemetrySeries} mode="areas" />
          </div>
        </div>
      </div>

      <ProgressioneTrendFooter
        adherence7d={adherence7d}
        adherence14d={adherence14d}
        daysLogged={daysLogged}
        trainingPct={trainingPct}
        sleepPct={sleepPct}
      />
    </section>
  );
}
