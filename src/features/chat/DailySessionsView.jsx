import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ListChecks, X } from 'lucide-react';
import { formatDurationMinutes } from './attivitaWorkoutSummary';

function sourceBadgeClass(kind) {
  if (kind === 'sleep') return 'border-indigo-400/35 bg-indigo-500/15 text-indigo-200';
  if (kind === 'protocol') return 'border-amber-400/35 bg-amber-500/15 text-amber-100';
  if (kind === 'ai') return 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100';
  return 'border-white/15 bg-white/[0.06] text-zinc-300';
}

function DraftCard({
  draft,
  expanded,
  onToggleSecondary,
  onConfirm,
  onEdit,
  onCancel,
}) {
  const canConfirm = typeof onConfirm === 'function';
  const canEdit = typeof onEdit === 'function';
  const canCancel = typeof onCancel === 'function';
  const meta = [
    draft.clock || null,
    draft.minutes > 0 ? formatDurationMinutes(draft.minutes) : null,
    draft.kcal > 0 ? `~${draft.kcal} kcal` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-lg leading-none" aria-hidden>{draft.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="m-0 truncate text-[13px] font-semibold text-zinc-50">
              {draft.title}
            </p>
            <span
              className={[
                'inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                sourceBadgeClass(draft.sourceKind),
              ].join(' ')}
            >
              {draft.sourceLabel}
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-zinc-500">
            {meta.length > 0 ? meta.join(' · ') : draft.typeLabel}
          </p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onEdit?.(draft)}
            className={[
              'rounded-xl border border-white/15 bg-white/[0.06] py-2 text-[12px] font-semibold text-zinc-100',
              'transition hover:border-cyan-400/40 hover:bg-cyan-500/10',
              'disabled:pointer-events-none disabled:opacity-40',
            ].join(' ')}
          >
            Modifica
          </button>
          <button
            type="button"
            disabled={!canCancel}
            onClick={() => onCancel?.(draft)}
            className={[
              'rounded-xl border border-rose-500/35 bg-rose-500/10 py-2 text-[12px] font-semibold text-rose-100',
              'transition hover:border-rose-400/50 hover:bg-rose-500/20',
              'disabled:pointer-events-none disabled:opacity-40',
            ].join(' ')}
          >
            Annulla
          </button>
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm?.(draft)}
            className={[
              'inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-400/40',
              'bg-emerald-500/90 py-2 text-[12px] font-bold text-emerald-50',
              'shadow-[0_8px_20px_rgba(16,185,129,0.18)] transition hover:bg-emerald-400',
              'disabled:pointer-events-none disabled:opacity-40',
            ].join(' ')}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Conferma
          </button>
          <button
            type="button"
            onClick={() => onToggleSecondary(draft.id)}
            className={[
              'rounded-xl border border-white/15 bg-zinc-900/80 py-2 text-[12px] font-semibold text-zinc-200',
              'transition hover:border-zinc-400/40 hover:bg-zinc-800',
            ].join(' ')}
          >
            Modifica / Annulla
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Gestione sessioni odierne: bozze da confermare + attività già salvate.
 */
export default function DailySessionsView({
  open = false,
  pendingDrafts = [],
  completedToday = [],
  onClose = null,
  onConfirmDraft = null,
  onEditDraft = null,
  onCancelDraft = null,
} = {}) {
  const [expandedId, setExpandedId] = useState(null);

  if (!open || typeof document === 'undefined') return null;

  const drafts = Array.isArray(pendingDrafts) ? pendingDrafts : [];
  const completed = Array.isArray(completedToday) ? completedToday : [];

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
        aria-label="Sessioni di oggi"
        className="pointer-events-none fixed inset-0 z-[100051] flex items-end justify-center px-3 pb-3 pt-6 sm:items-center sm:px-6 sm:py-6"
      >
        <div
          className="pointer-events-auto relative flex max-h-[96dvh] min-h-[min(72dvh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi sessioni"
            className={[
              'absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border',
              'border-zinc-700 bg-zinc-900 text-zinc-300 transition',
              'hover:border-cyan-500/45 hover:text-cyan-100',
              'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
            ].join(' ')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <header className="shrink-0 border-b border-white/10 px-4 py-3 pr-14">
            <div className="flex items-center gap-2 text-cyan-200">
              <ListChecks className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Oggi
              </p>
            </div>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Sessioni</h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <section aria-label="Bozze in attesa">
              <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Bozze in attesa
              </h3>
              {drafts.length === 0 ? (
                <p className="m-0 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-6 text-center text-[13px] leading-relaxed text-zinc-500">
                  Nessuna bozza da confermare.
                  <span className="mt-1 block text-[12px] text-zinc-600">
                    Le attività proposte dall&apos;AI o dal Protocollo Sonno compariranno qui.
                  </span>
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {drafts.map((draft) => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      expanded={expandedId === draft.id}
                      onToggleSecondary={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                      onConfirm={onConfirmDraft}
                      onEdit={onEditDraft}
                      onCancel={onCancelDraft}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-5" aria-label="Completate oggi">
              <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Completate Oggi
              </h3>
              {completed.length === 0 ? (
                <p className="m-0 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-5 text-center text-[13px] italic text-zinc-500">
                  Nessuna attività salvata per oggi.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {completed.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[13px] font-semibold text-zinc-100">
                          <span aria-hidden>{item.icon}</span>
                          {' '}
                          {item.title}
                        </p>
                        <p className="m-0 mt-0.5 text-[11px] text-zinc-500">
                          {[
                            item.clock || null,
                            item.typeLabel,
                            item.minutes > 0 ? formatDurationMinutes(item.minutes) : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                        Fatto
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
