import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { enqueueInboxDraftAppend } from '../../platform/inboxDraftAppendBus';
import { buildVoiceInboxDraftPayload } from '../../platform/googleAssistantInbox';
import { toastMessageForDraftType } from '../../utils/draftParser';
import {
  createHoldToTalkSession,
  playHoldToTalkHaptic,
} from '../../platform/kentuHoldToTalk';

/** Emblema K in `public/` — tasto centrale bottom bar / Kentu AI Workspace. */
const KENTU_CHAT_EMBLEM_SRC = '/EmblemaKbianca2.png';
const HOLD_MS = 500;
const TOAST_MS = 2800;

/**
 * Pulsante flottante Emblema Kentu — tap: apre la chat; long-press: dettatura → bozza Inbox.
 */

export default function KentuChatFab({
  visible = false,
  engineReady = true,
  onOpen = null,
  onBlockedOpen = null,
  showNotificationBadge = false,
}) {
  const pressTimer = useRef(null);
  const isListeningRef = useRef(false);
  const sessionRef = useRef(null);
  const finishingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  const showDraftToast = useCallback((message) => {
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

  const stopListeningAndSaveDraft = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    isListeningRef.current = false;
    setIsListening(false);
    if (!session) return;
    const text = await session.stop();
    const payload = buildVoiceInboxDraftPayload(text);
    if (!payload) return;
    payload.source = 'kentu_fab_hold';
    const result = enqueueInboxDraftAppend(payload);
    if (result?.skipped) return;
    showDraftToast(toastMessageForDraftType(payload.inferredType));
  }, [showDraftToast]);

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
      showDraftToast('Microfono non disponibile');
    }
  }, [showDraftToast]);

  const openTextChat = useCallback(() => {
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    onOpen?.();
  }, [engineReady, onBlockedOpen, onOpen]);

  const handlePointerDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
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
  }, [clearPressTimer, engineReady, onBlockedOpen, startListening]);

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
      void stopListeningAndSaveDraft();
      return;
    }
    openTextChat();
  }, [clearPressTimer, openTextChat, stopListeningAndSaveDraft]);

  const handlePointerLeave = useCallback((event) => {
    if (event.buttons !== 0) return;
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearPressTimer();
    if (isListeningRef.current) {
      void stopListeningAndSaveDraft();
      return;
    }
    // Leave senza hold: non aprire la chat (evita tap fantasma).
  }, [clearPressTimer, stopListeningAndSaveDraft]);

  useEffect(() => () => {
    clearPressTimer();
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
  }, [clearPressTimer]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
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
            ? 'Kentu AI — in ascolto, rilascia per salvare la bozza'
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
