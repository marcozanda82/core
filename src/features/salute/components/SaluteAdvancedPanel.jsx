import { lazy, Suspense, useState } from 'react';
import { MUSCLE_STIMULUS_DAILY_DECAY_FACTOR } from '../../trendHub/utils/muscleSpillover';
import { SALUTE_FROST } from '../utils/saluteVisualTheme';

const MuscleTelemetryHub = lazy(() => import('../../trendHub/components/MuscleTelemetryHub'));

function formatMetric(value, digits = 1, unit = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}${unit}`;
}

export default function SaluteAdvancedPanel({
  biometrics,
  metabolic,
  fourCylinder,
  fullHistory,
  activeLog,
  todayDate,
  longevityResult,
  isDev,
}) {
  const [open, setOpen] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(false);

  return (
    <section className={`relative overflow-hidden rounded-[22px] border border-white/[0.10] ${SALUTE_FROST.card}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between px-4 text-left sm:px-5"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          Dati avanzati
        </span>
        <span className="text-[13px] text-slate-400">{open ? 'Nascondi' : 'Mostra'}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3.5 sm:px-5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Peso</p>
              <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
                {formatMetric(biometrics?.weightKg, 1, ' kg')}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Vita</p>
              <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
                {formatMetric(biometrics?.waistCm ?? metabolic?.waistCm, 1, ' cm')}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Altezza</p>
              <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
                {formatMetric(metabolic?.heightCm, 0, ' cm')}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Soglia vita</p>
              <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
                {formatMetric(metabolic?.thresholdCm, 1, ' cm')}
              </p>
            </div>
          </div>
          <p className="m-0 text-[12px] leading-relaxed text-slate-400">
            Decay stimolo muscolare (motore esistente): −{Math.round(MUSCLE_STIMULUS_DAILY_DECAY_FACTOR * 100)}% al giorno.
            Le biometrie sono in sola lettura.
          </p>
          <button
            type="button"
            onClick={() => setShowTelemetry((v) => !v)}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-violet-400/35 bg-[#1C1830]/95 px-4 text-[13px] font-medium text-violet-100 shadow-[0_0_10px_rgba(167,139,250,0.10)]"
          >
            {showTelemetry ? 'Nascondi telemetria' : 'Telemetria muscolare'}
          </button>
          {showTelemetry ? (
            <Suspense fallback={<p className="m-0 text-[13px] text-slate-400">Caricamento telemetria…</p>}>
              <MuscleTelemetryHub
                fourCylinder={fourCylinder}
                fullHistory={fullHistory}
                activeLog={activeLog}
                activeDate={todayDate}
                onBack={() => setShowTelemetry(false)}
              />
            </Suspense>
          ) : null}
          {isDev ? (
            <details className="rounded-2xl border border-dashed border-white/15 bg-[#0E1520]/96 p-3.5">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                JSON debug · DEV
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto text-[10px] leading-relaxed text-slate-400">
                {JSON.stringify({
                  finalScore: longevityResult?.finalScore,
                  baseScore: longevityResult?.baseScore,
                  breakdown: longevityResult?.breakdown,
                  metabolic,
                  biometrics,
                }, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
