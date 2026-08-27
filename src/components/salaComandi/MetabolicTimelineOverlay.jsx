/**
 * Overlay fullscreen — Timeline metabolica 24h (aperta da Salute).
 */
export default function MetabolicTimelineOverlay({
  open = false,
  onClose = null,
  dateLabel = '',
  children = null,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100050] flex flex-col bg-[#050a12] text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-label="Timeline Metabolica 24h"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={() => onClose?.()}
          className="flex h-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-cyan-200 transition hover:border-white/25 hover:bg-white/[0.08]"
          aria-label="Torna a Salute"
        >
          ← Indietro
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-sm font-semibold text-zinc-100">
            Timeline Metabolica 24h
          </h2>
          {dateLabel ? (
            <p className="m-0 truncate text-[0.65rem] font-medium text-zinc-500">
              {dateLabel}
            </p>
          ) : null}
        </div>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2"
      >
        {children}
      </div>
    </div>
  );
}
