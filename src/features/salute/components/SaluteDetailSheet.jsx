import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Sheet/modal di approfondimento per `/salute`.
 * Mobile: bottom sheet quasi a schermo. Desktop: dialog centrata.
 * Non cambia route né lo scroll della pagina sotto (body lock).
 */
export default function SaluteDetailSheet({
  open = false,
  title = '',
  icon = '',
  accentClass = 'border-white/10',
  iconWrapClass = 'border-white/10 bg-white/[0.06]',
  onClose = null,
  children = null,
} = {}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = [...nodes].filter((node) => !node.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100070] flex items-end justify-center bg-[#05070C]/88 sm:items-center sm:p-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-white/[0.10] bg-[#0E141C]/97 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-[2px] sm:max-h-[86dvh] sm:rounded-[28px] sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_80px_rgba(0,0,0,0.58)] ${accentClass}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-11 shrink-0 rounded-full bg-slate-500/45 sm:hidden" aria-hidden />
        <header className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-3.5 py-3 sm:px-5 sm:py-3.5">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[18px] text-slate-200 hover:bg-white/[0.06]"
            aria-label="Chiudi approfondimento"
          >
            ←
          </button>
          {icon ? (
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[14px] ${iconWrapClass}`}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <h2
            id={titleId}
            className="m-0 min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.01em] text-slate-50"
          >
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[22px] leading-none text-slate-200 hover:bg-white/[0.06]"
            aria-label="Chiudi"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
