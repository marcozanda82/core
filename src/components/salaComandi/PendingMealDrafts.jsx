import { memo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

function PendingMealDrafts({
  drafts = [],
  onEditDraft = null,
  onDeleteDraft = null,
}) {
  const rows = Array.isArray(drafts) ? drafts : [];

  return (
    <section className="flex w-full flex-col gap-2" aria-label="Bozze in sospeso">
      <h2 className="px-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Bozze in sospeso
      </h2>
      {rows.length === 0 ? (
        <p className="px-0.5 text-xs text-slate-500">Nessuna bozza in sospeso</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((draft) => (
            <li
              key={draft.id}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h3 className="m-0 truncate text-sm font-semibold text-slate-50">
                    {draft.label}
                  </h3>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {draft.timeLabel || '—'}
                  </span>
                </div>
                <p className="m-0 mt-0.5 truncate text-xs text-slate-300">
                  {draft.summary}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-200 transition hover:bg-cyan-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                aria-label={`Riprendi ${draft.label}`}
                title={`Riprendi ${draft.label}`}
                onClick={() => onEditDraft?.(draft)}
              >
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-300 transition hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                aria-label={`Elimina bozza ${draft.label}`}
                title={`Elimina bozza ${draft.label}`}
                onClick={() => onDeleteDraft?.(draft)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(PendingMealDrafts);
