import { createPortal } from 'react-dom';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onStartWorkout: () => void,
 *   onPostpone: () => void,
 *   onSkip: () => void,
 * }} props
 */
export default function DayPlanActionSheet({
  open,
  onClose,
  onStartWorkout,
  onPostpone,
  onSkip,
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100010] flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-plan-sheet-title"
        className="w-full max-w-lg rounded-t-2xl border border-slate-600/80 bg-slate-900/95 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-600" aria-hidden />
        <h2 id="day-plan-sheet-title" className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-slate-300">
          Piano di oggi
        </h2>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onStartWorkout}
            className="w-full rounded-xl bg-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition-colors hover:bg-cyan-500 active:bg-cyan-700"
          >
            🚀 Inizia / Registra
          </button>
          <button
            type="button"
            onClick={onPostpone}
            className="w-full rounded-xl border border-orange-500/40 bg-orange-950/40 py-3.5 text-sm font-semibold text-orange-200 transition-colors hover:bg-orange-950/60"
          >
            ⏩ Posticipa a domani
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-xl border border-red-500/35 bg-red-950/30 py-3.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-950/50"
          >
            🗑️ Salta sessione
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-300"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
