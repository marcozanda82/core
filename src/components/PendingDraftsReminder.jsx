/**
 * Richiamo discreto alle bozze: non elenca le bozze, apre la schermata pasti.
 */
export default function PendingDraftsReminder({
  count = 0,
  onOpen = null,
  className = '',
}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return null;
  const label = n === 1 ? '1 bozza da convalidare' : `${n} bozze da convalidare`;
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-2 rounded-2xl',
        'border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-left',
        'text-sm text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/15',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50',
        className,
      ].join(' ')}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen?.();
      }}
      aria-label={`${label}. Apri schermata pasti`}
    >
      <span>{label}</span>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-200/90">
        Apri
      </span>
    </button>
  );
}
