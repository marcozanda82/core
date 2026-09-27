import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createHoldToTalkSession,
  playHoldToTalkHaptic,
} from '../../platform/kentuHoldToTalk';

/** Emblema K in `public/` — tasto centrale bottom bar / Kentu AI Workspace. */
const KENTU_CHAT_EMBLEM_SRC = '/EmblemaKbianca2.png';
const HOLD_MS = 500;
const TOAST_MS = 2800;

const btnBase = {
  flex: 1,
  minHeight: 56,
  padding: '16px 12px',
  borderRadius: 14,
  fontSize: '1.05rem',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: 'none',
};

/**
 * Pulsante flottante Emblema Kentu — tap: apre la chat; long-press: dettatura → anteprima → chat.
 */

export default function KentuChatFab({
  visible = false,
  engineReady = true,
  onOpen = null,
  onBlockedOpen = null,
  onSendMessage = null,
  showNotificationBadge = false,
}) {
  const pressTimer = useRef(null);
  const isListeningRef = useRef(false);
  const sessionRef = useRef(null);
  const finishingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [voicePreviewText, setVoicePreviewText] = useState('');
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const stopListeningAndPreview = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    isListeningRef.current = false;
    setIsListening(false);
    if (!session) return;
    const text = String(await session.stop() || '').trim();
    if (!text) {
      showToast('Nessun testo rilevato');
      return;
    }
    // Dopo il long-press Android può ancora sparare un click fantasma:
    // ritarda il modale così non preme Conferma al posto dell'anteprima.
    window.setTimeout(() => {
      setVoicePreviewText(text);
    }, 280);
  }, [showToast]);

  const startListening = useCallback(async () => {
    const session = createHoldToTalkSession();
    sessionRef.current = session;
    isListeningRef.current = true;
    setIsListening(true);
    await playHoldToTalkHaptic();
    const started = await session.start();
    if (!started) {
      isListeningRef.current = false;
      setIsListening(false);
      sessionRef.current = null;
      showToast('Microfono non disponibile');
    }
  }, [showToast]);

  const openTextChat = useCallback(() => {
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    onOpen?.();
  }, [engineReady, onBlockedOpen, onOpen]);

  const handleCancelPreview = useCallback(() => {
    setVoicePreviewText('');
  }, []);

  const handleConfirmPreview = useCallback(() => {
    const text = String(voicePreviewText || '').trim();
    setVoicePreviewText('');
    if (!text) return;
    onSendMessage?.(text);
  }, [voicePreviewText, onSendMessage]);

  const handlePointerDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    if (voicePreviewText) return;
    event.preventDefault();
    finishingRef.current = false;
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      void startListening();
    }, HOLD_MS);
  }, [clearPressTimer, engineReady, onBlockedOpen, startListening, voicePreviewText]);

  const handlePointerUp = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearPressTimer();
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    if (isListeningRef.current) {
      event.preventDefault();
      void stopListeningAndPreview();
      return;
    }
    openTextChat();
  }, [clearPressTimer, openTextChat, stopListeningAndPreview]);

  const handlePointerLeave = useCallback(() => {
    if (isListeningRef.current) return;
    clearPressTimer();
  }, [clearPressTimer]);

  const handlePointerCancel = useCallback(() => {
    if (isListeningRef.current) return;
    clearPressTimer();
  }, [clearPressTimer]);

  useEffect(() => () => {
    clearPressTimer();
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
  }, [clearPressTimer]);

  if (!visible) return null;

  const previewOpen = Boolean(String(voicePreviewText || '').trim());

  return (
    <>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        disabled={!engineReady}
        className={[
          'fixed left-1/2 z-[100010] flex -translate-x-1/2 flex-col items-center justify-end gap-0.5',
          'bottom-[calc(0.2rem+env(safe-area-inset-bottom,0px))] top-auto',
          'overflow-visible border-none bg-transparent p-0 shadow-none focus:outline-none',
          'touch-none select-none transition-transform duration-300 ease-in-out',
          engineReady ? 'active:scale-95' : 'pointer-events-auto cursor-wait opacity-80',
          isListening ? 'scale-110' : '',
        ].join(' ')}
        aria-label={
          isListening
            ? 'Kentu AI — in ascolto, rilascia per rivedere il testo'
            : engineReady
              ? 'Kentu AI'
              : 'Kentu AI — allineamento in corso'
        }
        aria-busy={!engineReady || isListening}
        aria-disabled={!engineReady}
        aria-pressed={isListening}
      >
        <div
          aria-hidden
          className={[
            'lunar-breathe pointer-events-none absolute -inset-5 z-0 rounded-full blur-2xl',
            isListening ? 'animate-pulse bg-cyan-400/50' : 'bg-white/30',
            !engineReady && !isListening ? 'animate-pulse' : '',
          ].join(' ')}
        />
        <span className="relative z-[1] flex h-[58px] w-[58px] items-center justify-center">
          {!engineReady ? (
            <span
              aria-hidden
              className="absolute inset-0 z-[2] m-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300"
            />
          ) : null}
          {isListening ? (
            <span
              aria-hidden
              className="absolute inset-[-6px] z-0 animate-pulse rounded-full border-2 border-cyan-300/90 shadow-[0_0_18px_rgba(34,211,238,0.85)]"
            />
          ) : null}
          {showNotificationBadge && !isListening ? (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.85)]"
            />
          ) : null}
          <img
            src={KENTU_CHAT_EMBLEM_SRC}
            alt=""
            width={58}
            height={58}
            decoding="async"
            draggable={false}
            className={[
              'relative z-[1] h-full w-full object-contain object-center drop-shadow-[0_0_15px_rgba(0,150,255,0.8)]',
              !engineReady ? 'opacity-75' : '',
              isListening ? 'drop-shadow-[0_0_22px_rgba(34,211,238,1)]' : '',
            ].join(' ')}
          />
        </span>
        <span
          className={[
            'relative z-[1] pb-1 text-[10px] font-semibold leading-none tracking-tight',
            isListening
              ? 'text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]'
              : engineReady
                ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.65)]'
                : 'text-zinc-400',
          ].join(' ')}
        >
          {isListening ? 'Ascolto…' : 'Kentu AI'}
        </span>
      </button>
      {previewOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100090,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(0,0,0,0.82)',
            }}
            onClick={handleCancelPreview}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="kentu-voice-preview-title"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 400,
                background: '#12141a',
                color: '#fff',
                padding: 24,
                borderRadius: 18,
                border: '1px solid rgba(34, 211, 238, 0.28)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              }}
            >
              <h3
                id="kentu-voice-preview-title"
                style={{
                  margin: '0 0 12px',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#f8fafc',
                }}
              >
                Testo Rilevato
              </h3>
              <p
                style={{
                  margin: '0 0 22px',
                  padding: 14,
                  borderRadius: 12,
                  background: '#0f1115',
                  border: '1px solid #334155',
                  color: '#e2e8f0',
                  fontSize: '1.05rem',
                  lineHeight: 1.45,
                  maxHeight: '40vh',
                  overflowY: 'auto',
                }}
              >
                {voicePreviewText}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={handleCancelPreview}
                  style={{
                    ...btnBase,
                    background: '#1e293b',
                    color: '#e2e8f0',
                  }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPreview}
                  style={{
                    ...btnBase,
                    background: '#22d3ee',
                    color: '#0f172a',
                  }}
                >
                  Conferma
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
      {toast && typeof document !== 'undefined'
        ? createPortal(
          <div className="inbox-undo-toast" role="status" aria-live="polite">
            <span className="inbox-undo-toast__msg">{toast}</span>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
