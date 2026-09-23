import { useMemo, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getTodayString } from '../../coreEngine';
import {
  WORKOUT_HISTORY_RANGE_LABEL,
  WORKOUT_HISTORY_TIME_FILTERS,
  buildWorkoutHistoryRangeStats,
  filterWorkoutsByTimeFilter,
  formatDurationMinutes,
  groupWorkoutsForTimeFilter,
} from './attivitaWorkoutSummary';

/**
 * Pop-up Storico & Statistiche allenamenti — overlay sul cruscotto Attività.
 */
export default function AttivitaWorkoutHistoryModal({
  open = false,
  summary = null,
  onClose,
  onDeleteWorkout = null,
} = {}) {
  const [timeFilter, setTimeFilter] = useState('month');
  const history = Array.isArray(summary?.history) ? summary.history : [];
  const todayIso = String(summary?.today || getTodayString()).slice(0, 10);
  const canDelete = typeof onDeleteWorkout === 'function';
  const rangeLabel = WORKOUT_HISTORY_RANGE_LABEL[timeFilter] || 'mese';

  const filteredHistory = useMemo(
    () => filterWorkoutsByTimeFilter(history, timeFilter, todayIso),
    [history, timeFilter, todayIso],
  );
  const rangeStats = useMemo(
    () => buildWorkoutHistoryRangeStats(filteredHistory),
    [filteredHistory],
  );
  const groupedHistory = useMemo(
    () => groupWorkoutsForTimeFilter(filteredHistory, timeFilter, todayIso),
    [filteredHistory, timeFilter, todayIso],
  );

  if (!open || typeof document === 'undefined') return null;

  const handleDelete = (item) => {
    if (!canDelete || !item?.id) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('Eliminare questo allenamento dal diario?')
      : true;
    if (!ok) return;
    onDeleteWorkout(item.id, item.date);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100050] bg-black/65 backdrop-blur-md"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Storico e statistiche allenamenti"
        className="pointer-events-none fixed inset-0 z-[100051] flex items-center justify-center px-3 py-4 sm:px-6"
      >
        <div
          className="pointer-events-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="shrink-0 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-cyan-200">
              <History className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Storico & statistiche
              </p>
            </div>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Allenamenti</h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="m-0 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2.5 text-[13px] leading-snug text-cyan-50">
              {summary?.lastWorkoutBanner || 'Nessun allenamento in archivio'}
            </p>

            <div
              role="tablist"
              aria-label="Filtro temporale"
              className="mt-3 grid grid-cols-3 rounded-full border border-cyan-400/20 bg-zinc-900/80 p-1 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]"
            >
              {WORKOUT_HISTORY_TIME_FILTERS.map((option) => {
                const selected = timeFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTimeFilter(option.id)}
                    className={[
                      'rounded-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition',
                      selected
                        ? 'bg-cyan-400 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                        : 'text-zinc-400 hover:text-zinc-100',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <article className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
                <p className="m-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                  Sessioni {rangeLabel}
                </p>
                <p className="m-0 mt-1 text-lg font-bold tabular-nums text-zinc-50">
                  {rangeStats.sessions}
                </p>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
                <p className="m-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                  Tempo {rangeLabel}
                </p>
                <p className="m-0 mt-1 text-sm font-bold tabular-nums text-zinc-50">
                  {rangeStats.durationLabel || '—'}
                </p>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
                <p className="m-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                  {rangeStats.thirdStat?.label || 'Più allenato'}
                </p>
                <p className="m-0 mt-1 truncate text-[12px] font-bold text-zinc-50">
                  {rangeStats.thirdStat?.value || '—'}
                </p>
              </article>
            </div>

            <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Ultime registrazioni
            </h3>
            {filteredHistory.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-slate-700/80 px-3 py-6 text-center text-sm text-slate-500">
                Nessuna sessione in questo periodo.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {groupedHistory.map((group) => (
                  <section key={group.key}>
                    <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
                      {group.label}
                    </h4>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[13px] font-semibold text-zinc-100">
                              <span aria-hidden>{item.icon}</span>
                              {' '}
                              {item.title}
                            </p>
                            <p className="m-0 mt-0.5 text-[11px] text-zinc-500">
                              {String(item.date).slice(8, 10)}/{String(item.date).slice(5, 7)}
                              {item.clock ? ` · ${item.clock}` : ''}
                              {' · '}
                              {item.typeLabel}
                              {' · '}
                              {formatDurationMinutes(item.minutes)}
                            </p>
                            {item.notes ? (
                              <p className="m-0 mt-0.5 truncate text-[11px] text-zinc-400">{item.notes}</p>
                            ) : null}
                          </div>
                          {canDelete && item.isToday ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              aria-label={`Elimina allenamento ${item.title}`}
                              title="Elimina"
                              className={[
                                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                                'border border-white/10 bg-transparent text-zinc-500',
                                'transition hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-200',
                                'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40',
                              ].join(' ')}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border border-zinc-600/80 bg-zinc-900/80 px-5 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
