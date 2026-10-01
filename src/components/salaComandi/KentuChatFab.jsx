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
const LISTEN_TIMEOUT_MS = 90_000;
const GUIDE_EMPTY = 'Es. Pranzo delle 13:30, pasta integrale 80g';
const GUIDE_NEXT = 'Dettagli un altro alimento...';

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

function joinVoiceItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => cleanTranscript(item))
    .filter(Boolean)
    .join('. ');
}

/**
 * Pulsante centrale Kentu AI — tap: chat; long-press: modale vocale in riposo, ascolto solo su comando.
 */
export default function KentuChatFab({
  visible = false,
  engineReady = true,
  onOpen = null,
  onBlockedOpen = null,
  onOpenAiMealBuilder = null,
  showNotificationBadge = false,
}) {
  const pressTimer = useRef(null);
  const isListeningRef = useRef(false);
  const sessionRef = useRef(null);
  const finishingRef = useRef(false);
  const holdOriginRef = useRef(false);
  const pressStartedAtRef = useRef(0);
  const toastTimerRef = useRef(null);
  const listenTimeoutRef = useRef(null);
  const textBufferRef = useRef('');
  const voiceItemsRef = useRef([]);

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceItemsList, setVoiceItemsList] = useState([]);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [isParsingDraft, setIsParsingDraft] = useState(false);

  useEffect(() => {
    persistVoiceOnboarded();
  }, []);

  const commitCurrentText = useCallback(() => {
    const rawText = textBufferRef.current.trim();
    if (!rawText) return;

    // Normalizzazione grammi
    const cleanText = rawText.replace(/\s*(grammi|gr|g)\b/gi, ' g');

    // Aggiunta atomica usando il formato funzionale di setState
    setVoiceItemsList((prev) => {
      const next = [...prev, cleanText];
      voiceItemsRef.current = next;
      return next;
    });

    // Svuotamento buffer
    textBufferRef.current = '';
    setLiveTranscript('');
  }, []);

  const resetVoiceSession = useCallback(() => {
    voiceItemsRef.current = [];
    setVoiceItemsList([]);
    setLiveTranscript('');
    textBufferRef.current = '';
    setSessionOpen(false);
    setIsListening(false);
    isListeningRef.current = false;
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

  const clearListenTimeout = useCallback(() => {
    if (listenTimeoutRef.current != null) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
  }, []);

  const removeVoiceItem = useCallback((index) => {
    setVoiceItemsList((prev) => {
      const next = prev.filter((_, i) => i !== index);
      voiceItemsRef.current = next;
      return next;
    });
  }, []);

  const openIdleSession = useCallback(({ resetList = false } = {}) => {
    if (resetList) {
      voiceItemsRef.current = [];
      setVoiceItemsList([]);
    }
    finishingRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    textBufferRef.current = '';
    setLiveTranscript('');
    setSessionOpen(true);
  }, []);

  const stopListeningToIdle = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearListenTimeout();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        await session.stop();
      } catch {
        /* ignore */
      }
    }
    commitCurrentText();
    holdOriginRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    setSessionOpen(true);
    finishingRef.current = false;
  }, [clearListenTimeout, commitCurrentText]);

  const startListening = useCallback(async () => {
    if (isParsingDraft) return;
    if (sessionRef.current) {
      try {
        await sessionRef.current.stop();
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
    }
    clearListenTimeout();
    const session = createHoldToTalkSession({
      onTranscript: (testoRilevato) => {
        const next = String(testoRilevato ?? '');
        if (!next.trim()) return;
        textBufferRef.current = next;
        setLiveTranscript(next);
      },
      onListeningEnd: () => {
        commitCurrentText();
        isListeningRef.current = false;
        setIsListening(false);
      },
    });
    sessionRef.current = session;
    isListeningRef.current = true;
    finishingRef.current = false;
    textBufferRef.current = '';
    setLiveTranscript('');
    setSessionOpen(true);
    setIsListening(true);
    await playHoldToTalkHaptic();
    const started = await session.start();
    if (sessionRef.current !== session) return;
    if (!started) {
      isListeningRef.current = false;
      setIsListening(false);
      sessionRef.current = null;
      finishingRef.current = false;
      showToast('Microfono non disponibile');
      setSessionOpen(true);
      return;
    }
    listenTimeoutRef.current = window.setTimeout(() => {
      listenTimeoutRef.current = null;
      if (!isListeningRef.current) return;
      showToast('Ascolto interrotto per timeout');
      void stopListeningToIdle();
    }, LISTEN_TIMEOUT_MS);
  }, [clearListenTimeout, commitCurrentText, isParsingDraft, showToast, stopListeningToIdle]);

  const openTextChat = useCallback(() => {
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    onOpen?.();
  }, [engineReady, onBlockedOpen, onOpen]);

  const collectVoiceText = useCallback(() => {
    const items = [...voiceItemsRef.current];
    const text = joinVoiceItems(items);
    return { items, text };
  }, []);

  const handleSaveDrafts = useCallback(() => {
    if (isParsingDraft || isListeningRef.current) return;
    const { items, text } = collectVoiceText();
    if (!text) {
      showToast('Nessun alimento da salvare');
      return;
    }
    const stamp = Date.now();
    const draft = createPendingInboxDraft(text, { timestamp: stamp });
    enqueueInboxDraftAppend({
      id: draft.id,
      rawText: text,
      inferredType: draft.inferredType || inferDraftType(text),
      timestamp: stamp,
      createdAt: stamp,
      status: 'pending',
      timeString: currentTimeHHmm(),
      items: items.map((foodName, index) => ({
        id: `voice_inbox_${stamp}_${index}`,
        foodName,
        name: foodName,
        desc: foodName,
        spokenFoodName: foodName,
        grams: 1,
        status: 'pending',
      })),
    });
    resetVoiceSession();
    showToast(items.length > 1 ? `Inbox: ${items.length} alimenti` : 'Bozza salvata in Inbox');
  }, [collectVoiceText, isParsingDraft, resetVoiceSession, showToast]);

  const handleCalcolaOra = useCallback(async () => {
    if (isParsingDraft || isListeningRef.current) return;
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    const { items, text } = collectVoiceText();
    if (!text) {
      showToast('Nessun alimento da calcolare');
      return;
    }

    resetVoiceSession();
    setIsParsingDraft(true);
    try {
      const parsed = await parseDraftWithGemini(text);
      const foodItems = parsed.map((entry) => {
        const foodName = typeof entry === 'string'
          ? entry
          : String(entry?.nome || entry?.foodName || '').trim();
        const grams = Number(entry?.grams);
        return {
          foodName,
          name: foodName,
          spokenFoodName: foodName,
          grams: Number.isFinite(grams) && grams > 0 ? grams : 100,
        };
      }).filter((item) => item.foodName);
      if (foodItems.length === 0) {
        showToast('Nessun alimento riconosciuto. Riprova.');
        voiceItemsRef.current = items;
        setVoiceItemsList(items);
        setSessionOpen(true);
        return;
      }
      const opened = typeof onOpenAiMealBuilder === 'function'
        ? onOpenAiMealBuilder({ items: foodItems })
        : false;
      if (!opened) {
        showToast('Costruttore pasti non disponibile');
        voiceItemsRef.current = items;
        setVoiceItemsList(items);
        setSessionOpen(true);
        return;
      }
    } catch (error) {
      console.warn('[KentuChatFab] parseDraftWithGemini failed', error);
      showToast('Non sono riuscito a calcolare gli alimenti. Riprova.');
      voiceItemsRef.current = items;
      setVoiceItemsList(items);
      setSessionOpen(true);
    } finally {
      setIsParsingDraft(false);
    }
  }, [collectVoiceText, engineReady, isParsingDraft, onBlockedOpen, onOpenAiMealBuilder, resetVoiceSession, showToast]);

  const handlePointerDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    if (sessionOpen || isListeningRef.current) return;
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
      openIdleSession({ resetList: true });
    }, HOLD_MS);
  }, [clearPressTimer, engineReady, onBlockedOpen, openIdleSession, sessionOpen]);

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
    if (sessionOpen) return;
    if (isListeningRef.current || holdOriginRef.current) {
      event.preventDefault();
      return;
    }
    if (elapsed < HOLD_MS) {
      event.preventDefault();
      openTextChat();
    }
  }, [clearPressTimer, openTextChat, sessionOpen]);

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
    clearListenTimeout();
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
  }, [clearListenTimeout, clearPressTimer]);

  if (!visible) return null;

  const canPortal = typeof document !== 'undefined';
  const guideText = voiceItemsList.length === 0 ? GUIDE_EMPTY : GUIDE_NEXT;
  const liveOrGuide = cleanTranscript(liveTranscript) || guideText;

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
            ? 'Kentu AI — in ascolto'
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

      {canPortal && sessionOpen ? createPortal(
        <div
          className="fixed inset-0 z-[100085] flex items-end justify-center bg-black/78 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:items-center sm:pt-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kentu-listen-title"
        >
          <div className="flex h-[95vh] max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950/95 px-4 pb-4 pt-3 shadow-[0_16px_48px_rgba(0,0,0,0.5)] sm:h-[95vh] sm:rounded-3xl">
            {isListening ? (
              <div className="relative mx-auto mb-3 flex h-20 w-20 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" aria-hidden />
                <span className="absolute inset-2 animate-pulse rounded-full border-2 border-cyan-300/70" aria-hidden />
                <img
                  src={KENTU_CHAT_EMBLEM_SRC}
                  alt=""
                  width={48}
                  height={48}
                  className="relative z-[1] h-12 w-12 object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.95)]"
                />
              </div>
            ) : null}

            <p id="kentu-listen-title" className="m-0 shrink-0 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              {isListening ? 'In ascolto' : 'Alimenti inseriti'}
            </p>

            <ul className="mt-3 min-h-0 w-full flex-1 space-y-2 overflow-y-auto pr-0.5">
              {voiceItemsList.length === 0 && !isListening ? (
                <li className="px-2 py-8 text-center text-sm text-zinc-500">
                  {guideText}
                </li>
              ) : null}
              {voiceItemsList.map((item, index) => (
                <li
                  key={`${index}_${item.slice(0, 24)}`}
                  className="flex items-start gap-2 rounded-2xl border border-cyan-400/20 bg-zinc-900/90 px-3 py-2.5 text-sm leading-snug text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => removeVoiceItem(index)}
                    disabled={isParsingDraft || isListening}
                    className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
                    aria-label={`Elimina ${item}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            {isListening ? (
              <div className="mt-3 flex w-full shrink-0 flex-col gap-3">
                <div className="w-full rounded-2xl border border-cyan-400/25 bg-zinc-900 px-4 py-4 text-center">
                  <p className={`m-0 min-h-[3.2rem] text-base font-medium leading-relaxed ${liveTranscript ? 'text-zinc-100' : 'text-zinc-500'}`}>
                    {liveOrGuide}
                  </p>
                </div>
                <button
                  type="button"
                  className="w-full rounded-2xl border border-cyan-400/50 bg-cyan-400 px-5 py-4 text-base font-bold uppercase tracking-wide text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.35)]"
                  onClick={() => void stopListeningToIdle()}
                >
                  Ferma
                </button>
              </div>
            ) : (
              <div className="mt-3 flex w-full shrink-0 flex-col gap-2">
                {voiceItemsList.length > 0 ? (
                  <p className="mb-0 text-center text-sm text-zinc-500">{guideText}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void startListening()}
                  disabled={isParsingDraft}
                  className="rounded-2xl border border-cyan-400/50 bg-cyan-400 px-4 py-4 text-base font-bold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.28)] disabled:opacity-60"
                >
                  🎙️ Detta un alimento
                </button>
                <div className="flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDrafts}
                    disabled={isParsingDraft || voiceItemsList.length === 0}
                    className="flex-1 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-3 text-sm font-semibold text-zinc-200 disabled:opacity-50"
                  >
                    Salva in Bozze
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCalcolaOra()}
                    disabled={isParsingDraft || voiceItemsList.length === 0}
                    className="flex-1 rounded-xl border border-cyan-400/50 bg-cyan-400 px-3 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
                  >
                    {isParsingDraft ? 'Calcolo…' : 'Calcola Ora'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={resetVoiceSession}
                  disabled={isParsingDraft}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-400 disabled:opacity-60"
                >
                  Annulla
                </button>
              </div>
            )}
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
