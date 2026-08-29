import React, { useMemo } from 'react';
import { HYPERTROPHY_TRIAGE_STIMULATE_MAX } from '../../../utils/hypertrophyMath';
import {
  buildMuscleTelemetryRows,
  formatMusclePct,
  muscleLevelClasses,
} from '../utils/muscleTelemetryModel';

/**
 * Anteprima compatta in Progressione: 2 distretti a priorità più alta + CTA verso Salute.
 */
export default function MuscleTelemetryPreview({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  onOpenFullTelemetry = null,
} = {}) {
  const topTwo = useMemo(() => {
    const { muscleRows } = buildMuscleTelemetryRows({
      fourCylinder,
      fullHistory,
      activeLog,
      activeDate,
      historyDays: 14,
    });
    return muscleRows.slice(0, 2);
  }, [fourCylinder, fullHistory, activeLog, activeDate]);

  return (
    <section
      className="w-full min-w-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 px-3 py-3"
      aria-label="Anteprima telemetria muscolare"
    >
      <header className="mb-2">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/80">
          Telemetria muscolare
        </p>
        <p className="m-0 mt-0.5 text-[11px] text-slate-400">
          Le 2 aree a priorità più alta (stimolo più basso)
        </p>
      </header>

      <div className="space-y-2">
        {topTwo.map((row, index) => {
          const styles = muscleLevelClasses(row.level);
          return (
            <article
              key={row.id}
              className={`rounded-xl border px-2.5 py-2 ${styles.border} ${styles.bg}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9px] text-slate-500">#{index + 1}</span>
                    <p className={`m-0 truncate text-[12px] font-semibold ${styles.text}`}>
                      {row.label}
                    </p>
                    {row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX ? (
                      <span className={`rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${styles.badge}`}>
                        {row.hubLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className={`m-0 shrink-0 font-mono text-sm font-bold tabular-nums ${styles.text}`}>
                  {formatMusclePct(row.value)}
                </p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-white/5 bg-black/40">
                <div
                  className={`h-full rounded-full ${styles.bar}`}
                  style={{ width: `${Math.max(row.pct, row.pct > 0 ? 3 : 0)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onOpenFullTelemetry?.()}
        className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-950/40 px-3 text-[12px] font-bold text-cyan-100 transition hover:border-cyan-300/55 hover:bg-cyan-900/50"
      >
        📊 Apri Telemetria Completa
      </button>
    </section>
  );
}
