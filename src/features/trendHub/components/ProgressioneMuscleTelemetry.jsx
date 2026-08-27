import React, { useMemo, useState } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
  MUSCLE_CYLINDER_DEFS,
} from '../../salaComandi/engines/fourCylinderEngine';
import {
  buildFourCylinderTelemetrySeries,
  getDaysSinceLastStimulus,
} from '../../salaComandi/utils/fourCylinderTelemetryHistory';
import {
  hypertrophyTriageLabel,
  hypertrophyTriageTone,
  HYPERTROPHY_TRIAGE_RECOVERY_MAX,
  HYPERTROPHY_TRIAGE_STIMULATE_MAX,
} from '../../../utils/hypertrophyMath';
import TelemetryChart from '../../../TelemetryChart';
import { getTodayString } from '../../../coreEngine';

/** Target volume normalizzato (100% = stimolo ottimale nel ciclo). */
const MUSCLE_VOLUME_TARGET = 100;

function muscleTriageLevel(value) {
  const tone = hypertrophyTriageTone(clamp01(value) * 100);
  if (tone === 'good') return 'good';
  if (tone === 'warning') return 'warning';
  return 'critical';
}

function muscleLevelClasses(level) {
  switch (level) {
    case 'critical':
      return {
        border: 'border-red-500/45',
        bg: 'bg-red-950/30',
        bar: 'bg-gradient-to-r from-red-600 to-red-400',
        text: 'text-red-200',
        badge: 'bg-red-500/15 text-red-100 border-red-500/35',
      };
    case 'warning':
      return {
        border: 'border-orange-500/45',
        bg: 'bg-orange-950/25',
        bar: 'bg-gradient-to-r from-orange-600 to-amber-400',
        text: 'text-orange-200',
        badge: 'bg-orange-500/15 text-orange-100 border-orange-500/35',
      };
    default:
      return {
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-950/20',
        bar: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
        text: 'text-emerald-200',
        badge: 'bg-emerald-500/15 text-emerald-100 border-emerald-500/35',
      };
  }
}

function formatPct(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/**
 * Telemetria muscolare sempre visibile in Progressione — barre distretti + archivio grafici.
 */
export default function ProgressioneMuscleTelemetry({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
} = {}) {
  const [historyDays, setHistoryDays] = useState(14);

  const state = useMemo(() => {
    if (fourCylinder && typeof fourCylinder === 'object') {
      return fourCylinderFromPhysiologyModel({ fourCylinder });
    }
    return createDefaultFourCylinderState();
  }, [fourCylinder]);

  const telemetrySeries = useMemo(() => {
    const todayIso = getTodayString();
    const activeIso = String(activeDate || todayIso).slice(0, 10);
    const todayLiveLog = activeIso === todayIso && Array.isArray(activeLog) ? activeLog : null;
    return buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: historyDays,
      endDate: todayIso,
      fourCylinder: state,
      todayLiveLog,
    });
  }, [fullHistory, historyDays, state, activeLog, activeDate]);

  const muscleRows = useMemo(() => {
    const todayIso = getTodayString();
    const tip = telemetrySeries.length > 0 ? telemetrySeries[telemetrySeries.length - 1] : null;
    const rows = MUSCLE_CYLINDER_DEFS.map((cyl) => {
      const value = tip ? clamp01(tip[cyl.id]) : 0;
      const currentVolume = Math.round(value * MUSCLE_VOLUME_TARGET);
      return {
        ...cyl,
        value,
        currentVolume,
        targetVolume: MUSCLE_VOLUME_TARGET,
        completionRatio: currentVolume / MUSCLE_VOLUME_TARGET,
        pct: currentVolume,
        triageLabel: hypertrophyTriageLabel(value * 100),
        level: muscleTriageLevel(value),
        daysSinceStimulus: getDaysSinceLastStimulus(fullHistory, cyl.id, {
          todayIso,
          fourCylinder: state,
        }),
      };
    });

    // Crescente: in cima i distretti più indietro (priorità allenamento).
    return [...rows].sort(
      (a, b) => a.completionRatio - b.completionRatio || a.label.localeCompare(b.label, 'it'),
    );
  }, [telemetrySeries, state, fullHistory]);

  return (
    <section
      className="w-full min-w-0 shrink-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-label="Telemetria e volume gruppi muscolari"
    >
      <header className="border-b border-white/5 pb-2.5">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/80">
          Telemetria &amp; volume gruppi muscolari
        </p>
        <p className="m-0 mt-1 text-[11px] leading-relaxed text-slate-400">
          Accumulo stimolo per distretto · ordinati per priorità (più indietro in cima)
        </p>
      </header>

      <div className="mt-2.5 space-y-2">
        {muscleRows.map((row, index) => {
          const styles = muscleLevelClasses(row.level);
          const isTopPriority = index === 0
            || (index === 1 && row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX);
          return (
            <article
              key={row.id}
              className={`rounded-xl border px-2.5 py-2 ${styles.border} ${styles.bg}${
                isTopPriority && row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX ? ' ring-1 ring-red-500/25' : ''
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9px] text-slate-500">#{index + 1}</span>
                    <p className={`m-0 text-[12px] font-semibold ${styles.text}`}>{row.label}</p>
                    {isTopPriority && row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX ? (
                      <span className={`rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${styles.badge}`}>
                        Priorità
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 text-[9px] text-slate-500">{row.subtitle}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`m-0 font-mono text-sm font-bold tabular-nums ${styles.text}`}>
                    {formatPct(row.value)}
                  </p>
                  <p className="m-0 text-[8px] tabular-nums text-slate-500">
                    {row.currentVolume}/{row.targetVolume}
                  </p>
                  <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${styles.badge}`}>
                    {row.triageLabel}
                  </span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-white/5 bg-black/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                  style={{ width: `${Math.max(row.pct, row.pct > 0 ? 3 : 0)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wider text-slate-600">
                <span>≤{HYPERTROPHY_TRIAGE_STIMULATE_MAX}% da stimolare</span>
                <span>&gt;{HYPERTROPHY_TRIAGE_RECOVERY_MAX}% ottimale</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 border-t border-white/5 pt-2.5">
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
            <TelemetryChart data={telemetrySeries} />
          </div>
        </div>
      </div>
    </section>
  );
}
