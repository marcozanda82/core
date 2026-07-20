import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import AiCluster from '../AiCluster';
import { useChatOverlay } from '../contexts/ChatOverlayContext';

/**
 * FAB globale + bottom sheet chat (AiCluster).
 * Le props operative arrivano da SalaComandi via registerHandlers (DI).
 */
export default function GlobalChatOverlay() {
  const { isChatOpen, openChat, closeChat, actionHandlers } = useChatOverlay();
  const handlersReady = typeof actionHandlers?.onSendMessage === 'function';

  useEffect(() => {
    if (!isChatOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeChat();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isChatOpen, closeChat]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {!isChatOpen ? (
        <button
          type="button"
          onClick={openChat}
          aria-label="Apri chat Kentu"
          className="fixed bottom-6 right-6 z-[100050] flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-950 text-2xl shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-transform hover:scale-105 active:scale-95"
        >
          <span aria-hidden>🤖</span>
        </button>
      ) : null}

      <div
        aria-hidden={!isChatOpen}
        className={`fixed inset-0 z-[100055] bg-black/55 transition-opacity duration-300 ${
          isChatOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeChat}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat Kentu"
        aria-hidden={!isChatOpen}
        className={`fixed bottom-0 left-0 z-[100060] flex h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-t-3xl border border-slate-700/60 bg-[#050a12] shadow-2xl transition-transform duration-300 ease-out ${
          isChatOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 pb-3 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-lg" aria-hidden>🤖</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-slate-100">Kentu Chat</p>
              <p className="truncate text-[11px] text-slate-500">
                {handlersReady ? 'Collegata a Sala Comandi' : 'In attesa degli handler…'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Chiudi chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <span aria-hidden className="text-lg leading-none">↓</span>
          </button>
        </header>

        <div className="kentu-os flex min-h-0 flex-1 flex-col overflow-hidden">
          {handlersReady ? (
            <AiCluster
              {...actionHandlers}
              onBack={closeChat}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
              Caricamento chat…
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
