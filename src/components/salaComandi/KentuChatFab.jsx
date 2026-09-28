import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KENTU_VOICE_ONBOARDING_LS_KEY } from '../../constants/salaComandiConstants';
import { enqueueInboxDraftAppend } from '../../platform/inboxDraftAppendBus';
import {
  createHoldToTalkSession,
  playHoldToTalkHaptic,
} from '../../platform/kentuHoldToTalk';
import { createPendingInboxDraft, inferDraftType, parseDraftWithGemini } from '../../utils/draftParser';

const KENTU_CHAT_EMBLEM_SRC = '/EmblemaKbianca2.png';
const HOLD_MS = 500;
const TOAST_MS = 2800;

function persistVoiceOnboarded() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KENTU_VOICE_ONBOARDING_LS_KEY, '1');
  } catch {
    /* ignore */
  }
}

function currentTimeHHmm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function cleanTranscript(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

/**
 * Pulsante centrale Kentu AI — tap: guida; long-press: ascolto → conferma bozza Inbox.
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
  const holdOriginRef = useRef(false);
  const pressStartedAtRef = useRef(0);
  const toastTimerRef = useRef(null);

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState('');
  const [isParsingDraft, setIsParsingDraft] = useState(false);

  useEffect(() => {
    persistVoiceOnboarded();
  }, []);

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

  const startListening = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.stop();
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
    }
    const session = createHoldToTalkSession({
      onTranscript: (next) => setLiveTranscript(cleanTranscript(next)),
    });
    sessionRef.current = session;
    isListeningRef.current = true;
    finishingRef.current = false;
    setLiveTranscript('');
    setConfirmText('');
    setIsEditing(false);
    setIsListening(true);
    await playHoldToTalkHaptic();
    const started = await session.start();
    if (sessionRef.current !== session) return;
    if (!started) {
      isListeningRef.current = false;
      setIsListening(false);
      sessionRef.current = null;
      showToast('Microfono non disponibile');
    }
  }, [showToast]);

  const stopListeningAndConfirm = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const session = sessionRef.current;
    if (!session) {
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }
    const text = cleanTranscript(await session.stop());
    sessionRef.current = null;
    isListeningRef.current = false;
    holdOriginRef.current = false;
    setIsListening(false);
    if (!text) {
      showToast('Nessun testo rilevato');
      setLiveTranscript('');
      return;
    }
    setConfirmText(text);
    setLiveTranscript(text);
    setIsEditing(false);
  }, [showToast]);

  const openTextChat = useCallback(() => {
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    onOpen?.();
  }, [engineReady, onBlockedOpen, onOpen]);

  const handleCreateDraft = useCallback(async () => {
    const text = cleanTranscript(confirmText);
    if (!text) {
      showToast('Nessun testo da salvare');
      return;
    }
    if (isParsingDraft) return;
    setIsParsingDraft(true);
    try {
      const foodNames = await parseDraftWithGemini(text);
      const stamp = Date.now();
      const items = foodNames.map((foodName, index) => ({
        id: `voice_${stamp}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        foodName,
        name: foodName,
        desc: foodName,
        spokenFoodName: foodName,
        grams: 1,
        status: 'pending',
      }));
      const draft = createPendingInboxDraft(text, { timestamp: stamp });
      enqueueInboxDraftAppend({
        id: draft.id,
        rawText: draft.rawText,
        inferredType: draft.inferredType || inferDraftType(text),
        timestamp: draft.timestamp,
        createdAt: draft.timestamp,
        status: 'pending',
        timeString: currentTimeHHmm(),
        items,
      });
      setConfirmText('');
      setLiveTranscript('');
      setIsEditing(false);
      showToast(items.length > 1 ? `Inbox: ${items.length} alimenti` : 'Bozza salvata in Inbox');
    } catch (error) {
      console.warn('[KentuChatFab] parseDraftWithGemini failed', error);
      showToast('Non sono riuscito a spezzare gli alimenti. Riprova.');
    } finally {
      setIsParsingDraft(false);
    }
  }, [confirmText, isParsingDraft, showToast]);

  const handleRetry = useCallback(() => {
    setConfirmText('');
    setIsEditing(false);
    holdOriginRef.current = false;
    void startListening();
  }, [startListening]);

  const handlePointerDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    if (confirmText) return;
    event.preventDefault();
    finishingRef.current = false;
    holdOriginRef.current = false;
    pressStartedAtRef.current = Date.now();
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
      holdOriginRef.current = true;
      void startListening();
    }, HOLD_MS);
  }, [clearPressTimer, confirmText, engineReady, onBlockedOpen, startListening]);

  const handlePointerUp = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    const startedAt = pressStartedAtRef.current;
    pressStartedAtRef.current = 0;
    const elapsed = startedAt ? Date.now() - startedAt : HOLD_MS;
    clearPressTimer();
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    if (confirmText) return;
    if (isListeningRef.current) {
      event.preventDefault();
      void stopListeningAndConfirm();
      return;
    }
    if (holdOriginRef.current) return;
    if (elapsed < HOLD_MS) {
      event.preventDefault();
      openTextChat();
    }
  }, [clearPressTimer, confirmText, openTextChat, stopListeningAndConfirm]);

  const handlePointerLeave = useCallback(() => {
    if (isListeningRef.current) return;
    clearPressTimer();
  }, [clearPressTimer]);

  const handlePointerCancel = useCallback(() => {
    if (isListeningRef.current) return;
    clearPressTimer();
  }, [clearPressTimer]);

  useEffect(() => {
    if (!isListening) return undefined;
    const onUp = (event) => {
      if (!holdOriginRef.current) return;
      if (event.button != null && event.button !== 0) return;
      void stopListeningAndConfirm();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isListening, stopListeningAndConfirm]);

  useEffect(() => () => {
    clearPressTimer();
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
  }, [clearPressTimer]);

  if (!visible) return null;

  const canPortal = typeof document !== 'undefined';

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
            ? 'Kentu AI — in ascolto, rilascia per confermare'
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

      {canPortal && isListening ? createPortal(
        <div
          className="pointer-events-none fixed inset-0 z-[100085] flex flex-col items-center justify-center bg-black/70 px-6 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kentu-listen-title"
        >
          <div className="relative mb-8 flex h-36 w-36 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" aria-hidden />
            <span className="absolute inset-3 animate-pulse rounded-full border-2 border-cyan-300/70" aria-hidden />
            <span className="absolute inset-8 rounded-full bg-cyan-400/15 shadow-[0_0_40px_rgba(34,211,238,0.45)]" aria-hidden />
            <img
              src={KENTU_CHAT_EMBLEM_SRC}
              alt=""
              width={72}
              height={72}
              className="relative z-[1] h-[72px] w-[72px] object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.95)]"
            />
          </div>
          <p id="kentu-listen-title" className="m-0 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Sto ascoltando…
          </p>
          <div className="mt-4 w-full max-w-md rounded-2xl border border-cyan-400/25 bg-zinc-950/80 px-4 py-4 text-center shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <p className="m-0 min-h-[3.2rem] text-base font-medium leading-relaxed text-zinc-100">
              {liveTranscript || 'Parla ora. Il testo compare qui in tempo reale.'}
            </p>
          </div>
          <p className="pointer-events-auto mt-6 text-center text-xs text-zinc-400">
            {holdOriginRef.current
              ? 'Rilascia per confermare il testo'
              : 'Tocca Ferma quando hai finito'}
          </p>
          {!holdOriginRef.current ? (
            <button
              type="button"
              className="pointer-events-auto mt-3 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-5 py-2 text-sm font-semibold text-cyan-100"
              onClick={() => void stopListeningAndConfirm()}
            >
              Ferma
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}

      {canPortal && confirmText ? createPortal(
        <div
          className="fixed inset-0 z-[100090] flex items-end justify-center bg-black/70 px-4 backdrop-blur-md sm:items-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kentu-voice-confirm-title"
            className="w-full max-w-md rounded-t-3xl border border-white/10 bg-zinc-950/92 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:rounded-3xl sm:pb-5"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600" aria-hidden />
            <h2 id="kentu-voice-confirm-title" className="m-0 text-lg font-bold text-zinc-50">
              Ho capito
            </h2>
            {isEditing ? (
              <textarea
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                rows={5}
                className="mt-3 w-full resize-none rounded-2xl border border-cyan-400/30 bg-zinc-900 px-3 py-3 text-[15px] leading-relaxed text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-400/40"
                aria-label="Modifica testo trascritto"
              />
            ) : (
              <p className="mt-3 max-h-[40vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/80 px-3.5 py-3 text-[15px] leading-relaxed text-zinc-100">
                {confirmText}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleCreateDraft()}
                disabled={isParsingDraft}
                className="rounded-xl border border-cyan-400/40 bg-cyan-400 px-3 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 disabled:opacity-60"
              >
                {isParsingDraft ? 'Analizzo…' : 'Conferma'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-zinc-100"
                >
                  Riprova
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-zinc-100"
                >
                  Modifica
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmText('');
                  setIsEditing(false);
                }}
                className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-400"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {canPortal && toast ? createPortal(
        <div className="inbox-undo-toast" role="status" aria-live="polite">
          <span className="inbox-undo-toast__msg">{toast}</span>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
