import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { collectTodayMealBatches } from '../utils/todayMealsTimelineUtils';

const MEAL_TYPE_STYLES = {
  colazione: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  pranzo: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  cena: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  snack: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

function TimelineList({ batches, compact = false }) {
  return (
    <ol className="relative space-y-0">
      {batches.map((batch, index) => {
        const typeStyle = MEAL_TYPE_STYLES[batch.mealType] || MEAL_TYPE_STYLES.snack;
        const isLast = index === batches.length - 1;
        const dotColor = batch.metabolicColor || '#22d3ee';

        return (
          <li
            key={batch.id}
            className={`vetrina-cart-row-enter relative flex gap-3 ${compact ? 'pb-2.5' : 'pb-3'} ${isLast ? 'pb-0' : ''}`}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            {!isLast ? (
              <span
                className="absolute left-[1.125rem] top-8 bottom-0 w-px bg-gradient-to-b from-slate-600/60 to-transparent"
                aria-hidden
              />
            ) : null}

            <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 bg-slate-900/90 shadow-inner"
                style={{ borderColor: dotColor, boxShadow: `0 0 12px ${dotColor}44` }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              </span>
            </div>

            <div className="min-w-0 flex-1 rounded-xl border border-white/[0.05] bg-slate-950/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-100">
                      {batch.timeLabel}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${typeStyle}`}
                    >
                      {batch.mealLabel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {batch.previewName}
                    {batch.itemCount > 1 ? (
                      <span className="text-slate-600"> +{batch.itemCount - 1}</span>
                    ) : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-lg font-bold leading-none tabular-nums text-cyan-400">
                    {batch.kcal}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    kcal
                  </p>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[10px] tabular-nums text-slate-600">
                P{batch.prot} · C{batch.carb} · F{batch.fat}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function TodayMealsTimeline({
  fullHistory,
  todayLog = null,
  className = '',
  layout = 'inline',
  defaultExpanded = true,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const batches = useMemo(
    () => collectTodayMealBatches(fullHistory, { todayLog }),
    [fullHistory, todayLog],
  );

  const totalKcal = useMemo(
    () => batches.reduce((sum, batch) => sum + (Number(batch.kcal) || 0), 0),
    [batches],
  );

  const isSidebar = layout === 'sidebar';

  return (
    <section
      className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br from-slate-800/50 to-slate-900/80 shadow-md shadow-black/20 ${
        isSidebar ? 'p-4' : 'p-3'
      } ${className}`}
      aria-label="Pasti di oggi"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-cyan-400/80" aria-hidden />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Oggi
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {batches.length > 0 ? (
            <span className="font-mono text-[10px] tabular-nums text-slate-500">
              {batches.length} {batches.length === 1 ? 'pasto' : 'pasti'} · {totalKcal} kcal
            </span>
          ) : null}
          {!isSidebar ? (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/80 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 md:hidden"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Comprimi timeline' : 'Espandi timeline'}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      </div>

      {(isSidebar || isExpanded) ? (
        batches.length > 0 ? (
          <TimelineList batches={batches} compact={isSidebar} />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700/70 px-3 py-5 text-center text-xs text-slate-500">
            Nessun pasto registrato oggi — aggiungi il primo dalla Vetrina
          </p>
        )
      ) : null}
    </section>
  );
}
