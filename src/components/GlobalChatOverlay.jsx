import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AiCluster from '../AiCluster';
import { useChatOverlay } from '../contexts/ChatOverlayContext';

/**
 * Overlay chat globale (AiCluster) — niente FAB duplicato.
 * Resta montato per saluto predittivo / openChat da context; chiuso → null.
 * Le props operative arrivano da SalaComandi via registerHandlers (DI).
 */
export default function GlobalChatOverlay() {
  const { isChatOpen, closeChat, actionHandlers } = useChatOverlay();
  const handlersReady = typeof actionHandlers?.onSendMessage === 'function';
  const prevChatOpenRef = useRef(false);
  const tryEmitPredictiveGreetingRef = useRef(null);

  tryEmitPredictiveGreetingRef.current = actionHandlers?.tryEmitPredictiveGreeting ?? null;

  useEffect(() => {
    if (!isChatOpen) {
      prevChatOpenRef.current = false;
      return undefined;
    }

    if (prevChatOpenRef.current) return undefined;
    if (!handlersReady) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const emit = tryEmitPredictiveGreetingRef.current;
      if (typeof emit !== 'function') return;
      prevChatOpenRef.current = true;
      emit();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isChatOpen, handlersReady]);

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
  // Chiuso: nessun FAB (l'emblema centrale di SalaComandi apre la chat).
  if (!isChatOpen) return null;

  return createPortal(
    <>
      <div
        aria-hidden={!isChatOpen}
        className="fixed inset-0 z-[100055] bg-black/70 transition-opacity duration-300 pointer-events-auto opacity-100"
        onClick={closeChat}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat Kentu"
        className="fixed inset-0 z-[100060] flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden border-0 bg-[#050a12] shadow-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header className="relative flex shrink-0 items-center gap-3 border-b border-slate-800/80 px-4 pb-3 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img
              src="/nuovo%20logo%20trasparente2.png"
              alt="KentuOS"
              decoding="async"
              className="h-8 w-auto max-w-[120px] shrink-0 object-contain object-left"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-slate-100">Kentu Chat</p>
              <p className="truncate text-[11px] text-slate-500">
                {handlersReady ? 'Collegata a Sala Comandi' : 'In attesa degli handler…'}
              </p>
            </div>
          </div>
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
