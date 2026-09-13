import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  HYPERTROPHY_TRIAGE_RECOVERY_MAX,
  HYPERTROPHY_TRIAGE_STIMULATE_MAX,
} from '../../../utils/hypertrophyMath';
import {
  formatMusclePct,
  muscleLevelClasses,
  sortMuscleRowsByStimulusPriority,
} from '../utils/muscleTelemetryModel';
import { UNIFIED_STIMULUS_TRACK_CLASS, unifiedStimulusBarClass } from '../../../utils/unifiedStimulusBar';

/**
 * Distretti muscolari — righe compatte, ordinate per priorità reale (badge poi %).
 * Con `onSelectRow` ogni riga avvia l'allenamento di forza sul distretto.
 *
 * @param {{
 *   muscleRows: Array<object>,
 *   onSelectRow?: ((row: object) => void) | null,
 *   showLegend?: boolean,
 *   unifiedBars?: boolean,
 * }} props
 */
export default function MuscleStimulusDistrictList({
  muscleRows = [],
  onSelectRow = null,
  showLegend = true,
  unifiedBars = false,
} = {}) {
  const selectable = typeof onSelectRow === 'function';
  const rankedRows = useMemo(
    () => sortMuscleRowsByStimulusPriority(muscleRows),
    [muscleRows],
  );

  return (
    <div className={unifiedBars ? 'space-y-2.5' : 'space-y-1'}>
      {showLegend ? (
        <p className="m-0 px-0.5 text-[8px] uppercase tracking-wider text-slate-600">
          ≤{HYPERTROPHY_TRIAGE_STIMULATE_MAX}% da stimolare · &gt;{HYPERTROPHY_TRIAGE_RECOVERY_MAX}% ottimale
        </p>
      ) : null}
      {rankedRows.map((row, index) => {
        const styles = muscleLevelClasses(row.level);
        const priorityRing = row.hubLabel === 'PRIORITÀ';
        const pctLabel = formatMusclePct(row.value);
        const bar = (
          <div
            className={`${unifiedBars ? `${UNIFIED_STIMULUS_TRACK_CLASS} w-full` : 'h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border border-white/5 bg-black/40'}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${unifiedBars ? unifiedStimulusBarClass(row.pct) : styles.bar}`}
              style={{ width: `${Math.max(row.pct, row.pct > 0 ? 3 : 0)}%` }}
            />
          </div>
        );
        return (
          <article
            key={row.id}
            className={[
              'group rounded-xl border',
              unifiedBars ? 'px-3.5 py-3' : 'rounded-lg px-2 py-1.5',
              styles.border,
              styles.bg,
              priorityRing ? 'ring-1 ring-red-500/25' : '',
              selectable
                ? 'cursor-pointer transition-colors hover:bg-white/5 active:scale-[0.99] focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40'
                : '',
            ].filter(Boolean).join(' ')}
            onClick={
              selectable
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectRow(row);
                  }
                : undefined
            }
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
            aria-label={
              selectable
                ? `Registra allenamento di forza: ${row.label}`
                : undefined
            }
          >
            {unifiedBars ? (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-500">#{index + 1}</span>
                    <p className={`m-0 truncate text-[13px] font-semibold leading-tight ${styles.text}`}>
                      {row.label}
                    </p>
                    {selectable ? (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-cyan-200/35 transition-colors group-hover:text-cyan-200/85"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`font-mono text-[12px] font-bold tabular-nums ${styles.text}`}>
                      {pctLabel}
                    </span>
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide ${styles.badge}`}
                    >
                      {row.hubLabel}
                    </span>
                  </div>
                </div>
                {bar}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 shrink-0 basis-[7.25rem]">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-[9px] text-slate-500">#{index + 1}</span>
                    <p className={`m-0 truncate text-[12px] font-semibold leading-tight ${styles.text}`}>
                      {row.label}
                    </p>
                  </div>
                </div>
                {bar}
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`font-mono text-[11px] font-bold tabular-nums ${styles.text}`}>
                    {pctLabel}
                  </span>
                  <span
                    className={`inline-block rounded border px-1 py-px text-[8px] font-bold uppercase leading-tight tracking-wide ${styles.badge}`}
                  >
                    {row.hubLabel}
                  </span>
                  {selectable ? (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-cyan-200/35 transition-colors group-hover:text-cyan-200/85 group-active:text-cyan-100"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : null}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
