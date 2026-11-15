import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { muscleLevelClasses } from '../../trendHub/utils/muscleTelemetryModel.js';
import { UNIFIED_STIMULUS_TRACK_CLASS, unifiedStimulusBarClass } from '../../../utils/unifiedStimulusBar.js';
import { buildCostanzaUiModel } from './costanzaUiModel.js';

/**
 * Cruscotto Costanza (pilastro Forza).
 */
export default function CostanzaPanel({
  fullHistory = null,
  asOfDate = null,
  weeklyGoalDays = 2,
  onSelectGroup = null,
} = {}) {
  const model = useMemo(
    () => buildCostanzaUiModel({ fullHistory, asOfDate, weeklyGoalDays }),
    [fullHistory, asOfDate, weeklyGoalDays],
  );
  const [openIds, setOpenIds] = useState(() => new Set());

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Costanza
        </p>
        <p className="mt-1 m-0 text-sm font-semibold text-zinc-100">
          {model.forceDaysThisWeek} su {model.weeklyGoalDays} giorni di forza questa settimana
        </p>
        <p className="mt-0.5 m-0 text-xs text-zinc-400">
          Scia: {model.weekStreak} {model.weekStreak === 1 ? 'settimana' : 'settimane'}
        </p>
        <p className="mt-2 m-0 text-[11px] leading-snug text-zinc-500">
          {model.honestLine}
        </p>
      </div>

      <div className="space-y-2">
        {model.groups.map((group) => {
          const styles = muscleLevelClasses(group.level);
          const expanded = openIds.has(group.id);
          const Chevron = expanded ? ChevronDown : ChevronRight;
          const barPct = group.pct;
          return (
            <article
              key={group.id}
              className={`rounded-xl border px-3 py-2.5 ${styles.border} ${styles.bg}`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/5"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Chiudi' : 'Apri'} ${group.label}`}
                  onClick={() => toggle(group.id)}
                >
                  <Chevron className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (typeof onSelectGroup === 'function') onSelectGroup(group);
                    else toggle(group.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${styles.text}`}>{group.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {group.status}
                    </span>
                  </div>
                  <div className={`${UNIFIED_STIMULUS_TRACK_CLASS} mt-1.5 w-full`}>
                    <div
                      className={`h-full rounded-full ${unifiedStimulusBarClass(barPct)}`}
                      style={{ width: `${Math.max(barPct, barPct > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </button>
              </div>
              {expanded ? (
                <ul className="mt-2 space-y-1.5 border-t border-white/5 pt-2">
                  {group.muscles.map((m) => {
                    const ms = muscleLevelClasses(m.level);
                    return (
                      <li
                        key={m.id}
                        className="flex items-baseline justify-between gap-2 px-1 text-xs"
                      >
                        <span className={ms.text}>{m.label}</span>
                        <span className="shrink-0 text-[10px] text-zinc-500">{m.lastLabel}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
