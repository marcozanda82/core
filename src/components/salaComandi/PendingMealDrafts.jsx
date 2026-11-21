import { memo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

function originLabel(draft) {
  if (draft?.origin === 'claude' || draft?.kind === 'external' || draft?.fromClaude) {
    return 'da Claude';
  }
  return 'mia';
}

function PendingMealDrafts({
  drafts = [],
  onEditDraft = null,
  onDeleteDraft = null,
}) {
  const rows = Array.isArray(drafts) ? drafts : [];

  return (
    <section className="flex w-full flex-col gap-2" aria-label="Bozze da convalidare">
      <h2 className="px-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Bozze da convalidare
      </h2>
      {rows.length === 0 ? (
        <p className="px-0.5 text-xs text-slate-500">Nessuna bozza da convalidare</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((draft) => {
            const origin = originLabel(draft);
            const written = String(draft.originalText || '').trim();
            return (
              <li
                key={draft.id}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  onClick={() => onEditDraft?.(draft)}
                  aria-label={`Apri bozza ${draft.label}`}
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="m-0 truncate text-sm font-semibold text-slate-50">
                      {draft.label}
                    </h3>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {draft.timeLabel || '—'}
                    </span>
                    <span
                      className={[
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide',
                        origin === 'da Claude'
                          ? 'bg-violet-500/20 text-violet-200'
                          : 'bg-slate-500/25 text-slate-300',
                      ].join(' ')}
                    >
                      {origin}
                    </span>
                  </div>
                  {written ? (
                    <p className="m-0 mt-0.5 line-clamp-2 text-xs text-slate-300">
                      Avevi scritto: «{written}»
                    </p>
                  ) : (
                    <p className="m-0 mt-0.5 truncate text-xs text-slate-300">
                      {draft.summary}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-200 transition hover:bg-cyan-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  aria-label={`Apri ${draft.label}`}
                  title={`Apri ${draft.label}`}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default memo(PendingMealDrafts);
