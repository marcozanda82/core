import React from 'react';
import {
  HYPERTROPHY_TRIAGE_RECOVERY_MAX,
  HYPERTROPHY_TRIAGE_STIMULATE_MAX,
} from '../../../utils/hypertrophyMath';
import {
  formatMusclePct,
  muscleLevelClasses,
} from '../utils/muscleTelemetryModel';

/**
 * Card distretto — markup/CSS identici a Telemetria muscolare (Hub).
 *
 * @param {{
 *   muscleRows: Array<object>,
 *   onSelectRow?: ((row: object) => void) | null,
 * }} props
 */
export default function MuscleStimulusDistrictList({
  muscleRows = [],
  onSelectRow = null,
} = {}) {
  const selectable = typeof onSelectRow === 'function';

  return (
    <div className="space-y-2">
      {muscleRows.map((row, index) => {
        const styles = muscleLevelClasses(row.level);
        const priorityRing = row.hubLabel === 'PRIORITÀ';
        return (
          <article
            key={row.id}
            className={`rounded-xl border px-2.5 py-2 ${styles.border} ${styles.bg}${
              priorityRing ? ' ring-1 ring-red-500/25' : ''
            }`}
            onClick={selectable ? () => onSelectRow(row) : undefined}
            onKeyDown={
              selectable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectRow(row);
                    }
                  }
                : undefined
            }
            role={selectable ? 'button' : undefined}
            tabIndex={selectable ? 0 : undefined}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9px] text-slate-500">#{index + 1}</span>
                  <p className={`m-0 text-[12px] font-semibold ${styles.text}`}>{row.label}</p>
                </div>
                <p className="m-0 text-[9px] text-slate-500">{row.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`m-0 font-mono text-sm font-bold tabular-nums ${styles.text}`}>
                  {formatMusclePct(row.value)}
                </p>
                <p className="m-0 text-[8px] tabular-nums text-slate-500">
                  {row.currentVolume}/{row.targetVolume}
                </p>
                <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${styles.badge}`}>
                  {row.hubLabel}
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
  );
}
