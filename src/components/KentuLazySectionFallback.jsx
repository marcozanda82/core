import { createPortal } from 'react-dom';

export default function KentuLazySectionFallback({
  label = 'Caricamento…',
  variant = 'section',
}) {
  if (variant === 'fullscreen') {
    const shell = (
      <div
        className="fixed inset-0 z-[100040] flex h-[100dvh] w-full flex-col items-center justify-center gap-3 overflow-hidden bg-[#050a12] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="kentu-lazy-section-fallback__spinner" />
        <span className="text-[0.72rem] uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
      </div>
    );
    if (typeof document !== 'undefined') {
      return createPortal(shell, document.body);
    }
    return shell;
  }

  return (
    <div className="kentu-lazy-section-fallback" role="status" aria-live="polite" aria-label={label}>
      <div className="kentu-lazy-section-fallback__spinner" />
      <span>{label}</span>
    </div>
  );
}
