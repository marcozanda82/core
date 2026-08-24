import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PRIVACY_POLICY_URL } from '../../constants/legalContent.js';

/**
 * Modale testuale brandizzata per Disclaimer Medico / Privacy Policy.
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   body: string,
 *   onClose: () => void,
 *   showExternalPrivacyLink?: boolean,
 * }} props
 */
export default function LegalTextModal({
  open,
  title,
  body,
  onClose,
  showExternalPrivacyLink = false,
} = {}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100060] bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kentu-legal-modal-title"
        className="fixed inset-0 z-[100061] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(88dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050a12] shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="shrink-0 border-b border-white/10 px-5 py-4">
            <h2
              id="kentu-legal-modal-title"
              className="m-0 text-base font-semibold tracking-tight text-slate-50"
            >
              {title}
            </h2>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-slate-300">
              {body}
            </p>
            {showExternalPrivacyLink ? (
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline"
              >
                Apri Privacy Policy completa ↗
              </a>
            ) : null}
          </div>
          <footer className="shrink-0 border-t border-white/10 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
            >
              Chiudi
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
