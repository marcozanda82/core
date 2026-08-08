/**
 * AiCluster.jsx — KentuOS: superficie chat (messaggi, quick replies, input).
 */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import MenuProposalCard from './MenuProposalCard';
import DailyPlanCard from './DailyPlanCard';
import MealDraftConfirmation from './components/MealDraftConfirmation';
import WorkoutDraftConfirmation from './components/WorkoutDraftConfirmation';
import MealProposalCards from './components/MealProposalCards';
import NewFoodPreviewCard from './components/NewFoodPreviewCard';
import MealReceiptMessage from './features/chat/MealReceiptMessage';
import WipMealCartBar from './features/wipMealBuilder/components/WipMealCartBar';
import WipMealSmartChips from './features/wipMealBuilder/components/WipMealSmartChips';
import {
  KentuIcon,
  KentuButton,
  KentuInsightHero,
  KentuInsightCard,
} from './components/kentuos/KentuOSUI';
import {
  saveAiFeedback,
  saveDevNote,
} from './utils/devToolsPersistence';
import { useVoiceChat } from './features/chat/useVoiceChat.js';
import { stopSpeaking } from './features/chat/voiceChat.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from './platform/expoNativeCamera.js';

function isFoodPhotoQuickReply(label) {
  const t = String(label || '').trim().toLowerCase();
  return /scatta\s+foto|foto\s+etichett|📷|fotocamera|camera/.test(t);
}

/** Allinea a stripInvisibleContextFromVisibleUserText in SalaComandi (contesto API non visibile). */
function stripInvisibleContextFromBubble(text) {
  if (text == null || typeof text !== 'string') return text;
  return text
    .replace(/\[CONTEXT_LIVE:[^\]]*\]\s*/gi, '')
    .replace(/\[CONTESTO DI SISTEMA INVISIBILE:[^\]]*\]\s*/gi, '')
    .trim();
}

/** Sezioni separate da doppio a capo → HERO + insight cards. */
function splitAiMessageSections(text) {
  if (text == null) return [];
  const s = String(text);
  if (!s.trim()) return [];
  return s.split(/\n{2,}/).map((block) => block.replace(/\r\n/g, '\n'));
}

export default function AiCluster({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  onSendMessage,
  onLogDinnerOption,
  onLoadAgenda,
  onMealProposalConfirm,
  onMealProposalCancel,
  onMealProposalSwap,
  onDailyPlanConfirm,
  onDailyPlanCancel,
  onGeneratePlanGhostMealDraft,
  activeQuickReplies = [],
  onSlotQuickReplyClick,
  onAcceptAdvice,
  onAcceptMealProposal,
  onEnableMealDraftInteractiveEdit = null,
  onRequestMealItemEdit = null,
  onCancelMealDraftProposal = null,
  onLearnUnresolvedFood = null,
  foodDatabase = {},
  kentuItDatabase = {},
  globalFoodDatabase = {},
  fullHistory = {},
  onDraftConfirm,
  onDraftCancel,
  onDraftRemoveItem,
  onDraftUpdateItemGrams,
  onDraftUpdateMealMeta,
  onDraftUpdateFoodItemName,
  onWorkoutDraftUpdateMeta,
  onWorkoutDraftUpdateExercise,
  onWorkoutDraftRemoveExercise,
  onSaveNewFoodEntry,
  /** Eventi del giorno corrente (timeline/diario) per contesto wizard pianificazione */
  dailyLog = [],
  onBack,
  /** Stessa frase del mount SalaComandi (rotazione kentuIntroPhrases); nessuna seconda estrazione qui. */
  introPhrase = '',
  isProcessing = false,
  onCancelGeneration = null,
  wipMealItems = [],
  wipMealTotals = null,
  wipMealType = 'pranzo',
  onRemoveWipItem,
  onClearWipMeal,
  onAddWipSuggestion,
  mealBuilder = null,
  cancelMealBuilder,
  commitMealBuilder,
  onManualShortcut,
  onRequestReport,
  onRequestBarcodeScan,
  quickStripItems = null,
  /** Preferenza TTS iniziale (es. true in modalità diabete se mai salvata). */
  preferVoiceChat = false,
  /** Nome utente (solo per strip TTS — non pronunciato). */
  userDisplayName = '',
}) {
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const chatTextareaRef = useRef(null);
  const [consumedClarificationKeys, setConsumedClarificationKeys] = useState(() => new Set());
  const voiceSubmitRef = useRef(null);

  const openFoodPhotoCapture = useCallback(async () => {
    try {
      const perm = await requestCameraPermissionsAsync();
      if (perm?.granted) {
        const shot = await launchCameraAsync({ quality: 0.85 });
        if (shot?.uri && !shot.canceled) {
          setChatImages((prev) => [...prev, shot.uri]);
          return;
        }
      }
    } catch {
      // fallback file input
    }
    chatFileInputRef.current?.click();
  }, [setChatImages]);

  const {
    ttsEnabled,
    toggleTts,
    isListening,
    voiceSessionActive,
    voiceTranscript,
    beginVoiceSession,
    cancelVoiceSession,
    restartVoiceSession,
    confirmVoiceSubmit,
    noteTextInteraction,
    sttSupported,
    ttsSupported,
    voiceError,
    clearVoiceError,
  } = useVoiceChat({
    chatHistory,
    isProcessing,
    defaultTtsEnabled: preferVoiceChat === true,
    userDisplayName,
    onVoiceSubmit: (text) => {
      voiceSubmitRef.current?.(text);
    },
  });

  const handleInputResize = useCallback((e) => {
    const el = e?.target || chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const resetInputHeight = useCallback(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  }, []);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isProcessing]);

  useEffect(() => {
    if (!String(chatInput || '').trim()) resetInputHeight();
  }, [chatInput, resetInputHeight]);

  const suppressQuickReplies = useMemo(
    () => (chatHistory || []).some(
      (m) => m.mealProposal
        || m.dailyPlan
        || (m.mealDraft && !m.draftResolved)
        || (m.workoutDraft && !m.draftResolved)
        || (Array.isArray(m.mealProposals) && m.mealProposals.length > 0),
    ),
    [chatHistory]
  );

  const hasActiveWorkoutDraft = useMemo(
    () => (chatHistory || []).some((m) => m.workoutDraft && !m.draftResolved),
    [chatHistory],
  );

  const visibleQuickReplies = useMemo(() => {
    const normalized = (activeQuickReplies || []).map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          label: String(entry.label || entry.text || '').trim(),
          foodDbKey: entry.foodDbKey ?? entry.id ?? null,
          foodName: entry.foodName || entry.name || null,
          grams: entry.grams ?? null,
          action: entry.action || null,
        };
      }
      return { label: String(entry ?? '').trim(), foodDbKey: null, foodName: null, grams: null, action: null };
    }).filter((e) => e.label);
    if (!hasActiveWorkoutDraft) return normalized;
    return normalized.filter(
      (entry) => !/^s[iì]\s*,\s*salva\b/i.test(entry.label),
    );
  }, [activeQuickReplies, hasActiveWorkoutDraft]);

  const resolvedQuickStrip = useMemo(() => {
    if (Array.isArray(quickStripItems) && quickStripItems.length > 0) {
      return quickStripItems;
    }
    return [
      { id: 'pasto', icon: '🍳', label: 'Pasto' },
      { id: 'workout', icon: '🏋️', label: 'Workout' },
      { id: 'sleep', icon: '😴', label: 'Sonno' },
      { id: 'acqua', icon: '💧', label: 'Acqua' },
      { id: 'weight', icon: '⚖️', label: 'Peso' },
      { id: 'menu', icon: '☰', label: 'Menu' },
    ];
  }, [quickStripItems]);

  const [isNotesMode, setIsNotesMode] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [devToolsToast, setDevToolsToast] = useState('');
  const toolsMenuRef = useRef(null);

  const showDevToast = useCallback((message) => {
    setDevToolsToast(message);
    window.setTimeout(() => setDevToolsToast(''), 2200);
  }, []);

  useEffect(() => {
    if (!showToolsMenu) return undefined;
    const onPointerDown = (event) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
        setShowToolsMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showToolsMenu]);

  const handleToolsButtonClick = useCallback(() => {
    if (isNotesMode) {
      setIsNotesMode(false);
      setShowToolsMenu(false);
      showDevToast('Modalità note disattivata');
      return;
    }
    setShowToolsMenu((prev) => !prev);
  }, [isNotesMode, showDevToast]);

  const handleActivateNotesMode = useCallback(() => {
    setIsNotesMode(true);
    setShowToolsMenu(false);
    showDevToast('Modalità note attiva');
  }, [showDevToast]);

  const handleFlagAnomaly = useCallback(async () => {
    try {
      const lastMessages = (chatHistory || []).slice(-2);
      if (!lastMessages.length) {
        showDevToast('Nessuno scambio da segnalare');
        setShowToolsMenu(false);
        return;
      }
      await saveAiFeedback({
        messages: lastMessages,
        note: "Segnalato manualmente dall'utente per risposta anomala",
      });
      showDevToast('Segnalazione salvata');
    } catch (err) {
      console.error('[DevTools] saveAiFeedback failed', err);
      showDevToast('Segnalazione fallita');
    } finally {
      setShowToolsMenu(false);
    }
  }, [chatHistory, showDevToast]);

  const handleRequestReportFromTools = useCallback(() => {
    setShowToolsMenu(false);
    onRequestReport?.();
  }, [onRequestReport]);

  const handleBarcodeTool = useCallback(() => {
    // 1. Chiudi menu Tools
    setShowToolsMenu(false);
    // 2–3. Chiudi chat + apri FastMealLogger con scanner (SalaComandi)
    onRequestBarcodeScan?.();
  }, [onRequestBarcodeScan]);

  const handleSendFromInput = useCallback(async () => {
    if (isProcessing) return;

    if (voiceSessionActive) {
      cancelVoiceSession();
    }
    noteTextInteraction();

    if (isNotesMode) {
      const noteText = String(chatInput || '').trim();
      if (!noteText) return;
      try {
        await saveDevNote({ text: noteText });
        setChatInput('');
        resetInputHeight();
        showDevToast('Nota salvata');
      } catch (err) {
        console.error('[DevTools] saveDevNote failed', err);
        showDevToast('Salvataggio nota fallito');
      }
      return;
    }

    onSendMessage(undefined, { fromInput: true });
    resetInputHeight();
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [
    isProcessing,
    voiceSessionActive,
    cancelVoiceSession,
    noteTextInteraction,
    isNotesMode,
    chatInput,
    setChatInput,
    showDevToast,
    onSendMessage,
    resetInputHeight,
  ]);

  // Invio da sessione vocale (stesso percorso dell’input, con TTS abilitato per la risposta).
  voiceSubmitRef.current = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || isProcessing) return;
    stopSpeaking();
    if (isNotesMode) {
      setChatInput(trimmed);
      return;
    }
    onSendMessage(trimmed, { fromInput: true, fromVoice: true });
    resetInputHeight();
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleChatKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendFromInput();
      e.target.style.height = 'auto';
    }
  }, [handleSendFromInput]);

  return (
    <div
      className="view-animate ai-cluster-root kentu-os flex flex-col bg-zinc-950"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="truncate text-sm font-semibold tracking-wide text-zinc-100">
            Kentu AI Workspace
          </span>
          {introPhrase ? (
            <span className="max-w-full truncate text-[0.65rem] text-zinc-500" title={introPhrase}>
              {introPhrase}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ttsSupported ? (
            <button
              type="button"
              onClick={toggleTts}
              aria-pressed={ttsEnabled}
              aria-label={ttsEnabled ? 'Disattiva lettura vocale' : 'Attiva lettura vocale'}
              title={
                ttsEnabled
                  ? 'Voce AI: ON (solo dopo messaggi vocali)'
                  : 'Voce AI: OFF'
              }
              className={[
                'inline-flex h-10 w-10 items-center justify-center rounded-full border text-[15px] transition',
                ttsEnabled
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500',
              ].join(' ')}
            >
              {ttsEnabled ? '🔊' : '🔇'}
            </button>
          ) : null}
          {typeof onBack === 'function' ? (
            <button
              type="button"
              onClick={() => {
                cancelVoiceSession();
                stopSpeaking();
                onBack();
              }}
              aria-label="Chiudi chat"
              title="Chiudi chat"
              className={[
                'inline-flex h-10 w-10 items-center justify-center rounded-full border',
                'border-zinc-700 bg-zinc-900 text-red-400 transition',
                'hover:border-red-500/50 hover:text-red-300',
                'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40',
              ].join(' ')}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      <div
        className="chat-container flex min-h-0 flex-1 flex-col"
        style={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <WipMealCartBar
          items={wipMealItems}
          totals={wipMealTotals}
          mealType={wipMealType}
          onRemoveItem={onRemoveWipItem}
          onClear={onClearWipMeal}
        />
        <div className="chat-messages flex-1 overflow-y-auto" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch', paddingRight: '5px' }}>
          {chatHistory.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'ai' ? 'flex-start' : 'flex-end', width: '100%' }}>
              {msg.sender === 'ai' && msg.mealProposal && !msg.isTyping ? (
                <div style={{ width: '100%' }}>
                  <MenuProposalCard
                    proposal={msg.mealProposal}
                    onConfirm={onMealProposalConfirm}
                    onCancel={onMealProposalCancel}
                    onSwap={onMealProposalSwap}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.dailyPlan && !msg.isTyping ? (
                <div style={{ width: '100%' }}>
                  {msg.text?.trim() ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                      {splitAiMessageSections(msg.text).map((block, si) =>
                        si === 0 ? (
                          <KentuInsightHero key={si} block={block} />
                        ) : (
                          <KentuInsightCard key={si} block={block} />
                        )
                      )}
                    </div>
                  ) : null}
                  <DailyPlanCard
                    planData={msg.dailyPlan}
                    onConfirm={onDailyPlanConfirm}
                    onCancel={onDailyPlanCancel}
                    onGeneratePlanGhostMealDraft={onGeneratePlanGhostMealDraft}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.mealDraft && !msg.draftResolved && !msg.isTyping ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {msg.text ? (
                    splitAiMessageSections(msg.text).map((block, si) =>
                      si === 0 ? (
                        <KentuInsightHero key={`draft-text-${si}`} block={block} />
                      ) : (
                        <KentuInsightCard key={`draft-text-${si}`} block={block} />
                      )
                    )
                  ) : null}
                  <MealDraftConfirmation
                    mealDraft={msg.mealDraft}
                    draftId={msg.draftId}
                    onConfirm={onDraftConfirm}
                    onCancel={onDraftCancel}
                    onRemoveItem={onDraftRemoveItem}
                    onUpdateItemGrams={onDraftUpdateItemGrams}
                    onUpdateMealMeta={onDraftUpdateMealMeta}
                    onUpdateFoodItemName={onDraftUpdateFoodItemName}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.workoutDraft && !msg.draftResolved && !msg.isTyping ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {msg.text ? (
                    splitAiMessageSections(msg.text).map((block, si) =>
                      si === 0 ? (
                        <KentuInsightHero key={`workout-draft-text-${si}`} block={block} />
                      ) : (
                        <KentuInsightCard key={`workout-draft-text-${si}`} block={block} />
                      )
                    )
                  ) : null}
                  <WorkoutDraftConfirmation
                    workoutDraft={msg.workoutDraft}
                    draftId={msg.draftId}
                    onConfirm={onDraftConfirm}
                    onCancel={onDraftCancel}
                    onRemoveExercise={onWorkoutDraftRemoveExercise}
                    onUpdateWorkoutMeta={onWorkoutDraftUpdateMeta}
                    onUpdateExercise={onWorkoutDraftUpdateExercise}
                  />
                </div>
              ) : msg.sender === 'ai' ? (
                msg.isTyping ? (
                  <div className="kentu-card kentu-card--typing">
                    <div className="typing-indicator">
                      <div className="dot" />
                      <div className="dot" />
                      <div className="dot" />
                    </div>
                  </div>
                ) : msg.mealReceipt && typeof msg.mealReceipt === 'object' ? (
                  <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                    <MealReceiptMessage receipt={msg.mealReceipt} />
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {msg.local === true || msg.sourceTag === 'local_receptionist' ? (
                      <div
                        className="kentu-local-receptionist-badge"
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          opacity: 0.7,
                          fontWeight: 600,
                        }}
                      >
                        Risposta istantanea · locale
                      </div>
                    ) : null}
                    {splitAiMessageSections(msg.text).map((block, si) =>
                      si === 0 ? (
                        <KentuInsightHero key={si} block={block} />
                      ) : (
                        <KentuInsightCard key={si} block={block} />
                      )
                    )}
                    {msg.suggestedAction
                      && !msg.adviceAccepted
                      && typeof onAcceptAdvice === 'function' ? (
                        <button
                          type="button"
                          className="kentu-advice-accept-btn"
                          onClick={() => {
                            void onAcceptAdvice(msg.suggestedAction, msg.adviceId);
                          }}
                        >
                          <span className="kentu-advice-accept-btn__icon" aria-hidden>
                            ⚡
                          </span>
                          <span className="kentu-advice-accept-btn__label">
                            Procedi e inserisci:
                            {' '}
                            {Math.round(Number(msg.suggestedAction.grams) || 0)}
                            g
                            {' '}
                            {msg.suggestedAction.foodName}
                          </span>
                        </button>
                      ) : null}
                    {msg.type === 'ADVICE'
                      && Array.isArray(msg.mealProposals)
                      && msg.mealProposals.length > 0
                      && typeof onAcceptMealProposal === 'function' ? (
                        <MealProposalCards
                          proposals={msg.mealProposals}
                          adviceId={msg.adviceId}
                          loadedProposalIds={msg.mealProposalsLoadedIds || []}
                          foodDatabase={foodDatabase}
                          kentuItDatabase={kentuItDatabase}
                          globalFoodDatabase={globalFoodDatabase}
                          fullHistory={fullHistory}
                          onConfirm={onAcceptMealProposal}
                          onLearnUnresolvedFood={onLearnUnresolvedFood}
                          interactiveEdit={msg.mealDraftInteractiveEdit === true}
                          onRequestItemEdit={onRequestMealItemEdit}
                          onCancelDraft={onCancelMealDraftProposal}
                          onEnableInteractiveEdit={onEnableMealDraftInteractiveEdit}
                        />
                      ) : null}
                    {Array.isArray(msg.wipSuggestions)
                      && msg.wipSuggestions.length > 0
                      && typeof onAddWipSuggestion === 'function' ? (
                        <WipMealSmartChips
                          suggestions={msg.wipSuggestions}
                          addedChipIds={msg.wipAddedChipIds || []}
                          onAddSuggestion={(suggestion, chipId) => {
                            onAddWipSuggestion(suggestion, chipId, msg.adviceId);
                          }}
                        />
                      ) : null}
                    {msg.type === 'NEW_FOOD_PREVIEW'
                      && msg.newFoodDraft
                      && typeof onSaveNewFoodEntry === 'function' ? (
                        <NewFoodPreviewCard
                          draft={msg.newFoodDraft}
                          onSave={onSaveNewFoodEntry}
                        />
                      ) : null}
                    {(msg.type === 'REQUEST_FOOD_PHOTO' || msg.requestFoodPhoto === true) && !msg.isTyping ? (
                      <div className="kentu-quick-row kentu-quick-row--clarification" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                        <KentuButton
                          variant="secondary"
                          className="kentu-btn--clarification"
                          type="button"
                          onClick={() => {
                            openFoodPhotoCapture();
                            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                          }}
                        >
                          📷 Scatta foto etichetta
                        </KentuButton>
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                <div className="kentu-user-capsule">
                  <div className="kentu-user-capsule__label">Input</div>
                  {stripInvisibleContextFromBubble(msg.text)}
                </div>
              )}
              {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && (() => {
                const clarificationKey = `clr-${idx}`;
                const isClarification = msg.clarification === true
                  || msg.type === 'ASK_CLARIFICATION'
                  || msg.type === 'REQUEST_FOOD_PHOTO'
                  || msg.requestFoodPhoto === true;
                if (isClarification && consumedClarificationKeys.has(clarificationKey)) return null;
                // Evita doppio pulsante camera se già mostrato sopra per REQUEST_FOOD_PHOTO.
                const replies = (msg.type === 'REQUEST_FOOD_PHOTO' || msg.requestFoodPhoto)
                  ? msg.quickReplies.filter((r) => {
                    const label = typeof r === 'object' ? r.label : r;
                    return !isFoodPhotoQuickReply(label) && !(r && typeof r === 'object' && r.action === 'photo');
                  })
                  : msg.quickReplies;
                if (replies.length === 0) return null;
                return (
                <div
                  className={`kentu-quick-row${isClarification ? ' kentu-quick-row--clarification' : ''}`}
                  style={{ justifyContent: msg.sender === 'ai' ? 'flex-start' : 'flex-end' }}
                >
                  {replies.map((reply, rIdx) => {
                    const morningActivityIds = ['weights', 'cardio', 'rest'];
                    const replyObj = reply && typeof reply === 'object' ? reply : null;
                    const replyLabel = replyObj
                      ? String(replyObj.label || replyObj.text || '').trim()
                      : String(reply || '').trim();
                    if (!replyLabel) return null;
                    return (
                      <KentuButton
                        key={rIdx}
                        variant="secondary"
                        className={isClarification ? 'kentu-btn--clarification' : 'kentu-btn--sm'}
                        onClick={() => {
                          if (isClarification) {
                            setConsumedClarificationKeys((prev) => {
                              const next = new Set(prev);
                              next.add(clarificationKey);
                              return next;
                            });
                          }
                          if (isFoodPhotoQuickReply(replyLabel) || replyObj?.action === 'photo' || msg.requestFoodPhoto) {
                            if (isFoodPhotoQuickReply(replyLabel) || replyObj?.action === 'photo') {
                              openFoodPhotoCapture();
                              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                              return;
                            }
                          }
                          if (msg.workoutTimeConfirm) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              workoutTimeReply: rIdx === 0 ? 'accept' : 'reject',
                            });
                          } else if (msg.eveningBriefing && (rIdx === 0 || rIdx === 1)) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              eveningBriefingReply: {
                                action: rIdx === 0 ? 'yes' : 'no',
                                missingKcal: msg.eveningBriefing.missingKcal,
                                missingPro: msg.eveningBriefing.missingPro,
                              },
                            });
                          } else if (msg.morningBriefing?.status && morningActivityIds[rIdx]) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              morningBriefingReply: {
                                status: msg.morningBriefing.status,
                                activity: morningActivityIds[rIdx],
                              },
                            });
                          } else {
                            const wizardSelection = replyObj && (replyObj.foodDbKey || replyObj.foodName)
                              ? {
                                  foodDbKey: replyObj.foodDbKey ?? null,
                                  foodName: replyObj.foodName || null,
                                  grams: replyObj.grams ?? null,
                                  action: replyObj.action || null,
                                }
                              : null;
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              clarificationReply: isClarification,
                              wizardSelection,
                            });
                          }
                          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }}
                      >
                        {replyLabel}
                      </KentuButton>
                    );
                  })}
                </div>
                );
              })()}
              {msg.dinnerOptions && msg.dinnerOptions.length > 0 && !msg.isTyping && typeof onLogDinnerOption === 'function' && (
                <div className="kentu-quick-row" style={{ justifyContent: 'flex-end' }}>
                  {msg.dinnerOptions.map((opt, oIdx) => (
                    <KentuButton
                      key={oIdx}
                      variant="secondary"
                      className="kentu-btn--sm"
                      onClick={() => {
                        onLogDinnerOption(opt);
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                      }}
                    >
                      Log pasto {oIdx + 1}
                    </KentuButton>
                  ))}
                </div>
              )}
              {msg.agendaOptions && msg.agendaOptions.length > 0 && !msg.isTyping && typeof onLoadAgenda === 'function' && (
                <div className="kentu-quick-row" style={{ justifyContent: 'flex-start' }}>
                  <KentuButton
                    variant="secondary"
                    onClick={() => {
                      onLoadAgenda(msg.agendaOptions);
                      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                  >
                    Carica nel diario
                  </KentuButton>
                </div>
              )}
            </div>
          ))}
          {isProcessing ? (
            <div
              className="kentu-typing-row"
              aria-live="polite"
              aria-busy="true"
              aria-label="Elaborazione in corso"
            >
              <div className="kentu-typing-bubble">
                <span className="kentu-typing-bubble__label">Elaborazione in corso</span>
                <div className="typing-indicator kentu-typing-indicator">
                  <div className="dot" />
                  <div className="dot" />
                  <div className="dot" />
                </div>
              </div>
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>
        <div className="flex shrink-0 flex-col">
        {chatImages.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, marginLeft: 4, overflowX: 'auto' }}>
            {chatImages.map((imgSrc, index) => (
              <div key={index} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                <img src={imgSrc} alt="" style={{ height: 60, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }} />
                <KentuButton
                  variant="secondary"
                  className="kentu-btn--icon"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 26,
                    height: 26,
                    minWidth: 26,
                    padding: 0,
                    borderRadius: '50%',
                    borderColor: 'rgba(248,113,113,0.35)',
                    color: '#fca5a5',
                  }}
                  onClick={() => setChatImages((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Rimuovi immagine"
                >
                  <KentuIcon name="x" size={14} />
                </KentuButton>
              </div>
            ))}
          </div>
        )}
        {visibleQuickReplies.length > 0 ? (
          <div className="flex w-full flex-row gap-2 overflow-x-auto px-2 pb-2 scrollbar-hide">
            {visibleQuickReplies.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => {
                  if (isFoodPhotoQuickReply(entry.label) || entry.action === 'photo') {
                    openFoodPhotoCapture();
                  } else {
                    const wizardSelection = (entry.foodDbKey || entry.foodName)
                      ? {
                          foodDbKey: entry.foodDbKey,
                          foodName: entry.foodName,
                          grams: entry.grams,
                          action: entry.action,
                        }
                      : null;
                    onSlotQuickReplyClick?.(entry.label, { wizardSelection });
                  }
                  setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
                className="shrink-0 rounded-full border border-cyan-500/30 bg-slate-900/70 px-3.5 py-1.5 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-400/50 hover:bg-slate-800/90 hover:text-cyan-50"
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
        {mealBuilder?.active ? (
          <div
            className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-900/30"
            role="status"
            aria-live="polite"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
              {`🍳 Costruzione ${mealBuilder.mealType || 'Pasto'}: ${Array.isArray(mealBuilder.foods) ? mealBuilder.foods.length : 0} alimenti`}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
              aria-label="Annulla costruzione pasto"
              onClick={() => cancelMealBuilder?.()}
            >
              ❌
            </button>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
              onClick={() => commitMealBuilder?.()}
            >
              ✅ Salva Pasto
            </button>
          </div>
        ) : null}
        {!isNotesMode ? (
          <div className="flex w-full shrink-0 flex-nowrap gap-2 overflow-x-auto py-2 scrollbar-hide">
            {resolvedQuickStrip.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onManualShortcut?.(item.id === 'acqua' ? 'water' : item.id)}
                className="flex min-w-[72px] flex-shrink-0 flex-col items-center rounded-xl border border-zinc-700/80 bg-zinc-900/90 p-2 text-zinc-100 transition-colors hover:border-cyan-400/40 hover:bg-zinc-800"
              >
                <span className="text-xl" aria-hidden>{item.icon}</span>
                <span className="mt-1 text-[0.65rem] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {voiceSessionActive ? (
          <div className="kentu-voice-vetrina" role="region" aria-label="Trascrizione vocale">
            <div className="kentu-voice-vetrina__status">
              <span
                className={`kentu-voice-vetrina__dot${isListening ? ' kentu-voice-vetrina__dot--live' : ''}`}
                aria-hidden
              />
              <span className="kentu-voice-vetrina__status-text">
                {isListening ? 'In ascolto… parla liberamente' : 'Microfono in pausa breve — riprende da solo'}
              </span>
            </div>
            <div className="kentu-voice-vetrina__glass" aria-live="polite">
              {voiceTranscript ? (
                <p className="kentu-voice-vetrina__text">{voiceTranscript}</p>
              ) : (
                <p className="kentu-voice-vetrina__placeholder">
                  La trascrizione compare qui mentre parli. Invia solo quando sei pronto.
                </p>
              )}
            </div>
            <div className="kentu-voice-vetrina__actions">
              <button
                type="button"
                className="kentu-voice-vetrina__btn kentu-voice-vetrina__btn--primary"
                disabled={!String(voiceTranscript || '').trim() || isProcessing}
                onClick={() => {
                  clearVoiceError();
                  confirmVoiceSubmit();
                }}
              >
                Invia richiesta
              </button>
              <button
                type="button"
                className="kentu-voice-vetrina__btn kentu-voice-vetrina__btn--secondary"
                disabled={isProcessing}
                onClick={() => {
                  clearVoiceError();
                  restartVoiceSession();
                }}
              >
                Ricomincia
              </button>
              <button
                type="button"
                className="kentu-voice-vetrina__btn kentu-voice-vetrina__btn--ghost"
                disabled={isProcessing}
                onClick={() => {
                  clearVoiceError();
                  cancelVoiceSession();
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
        <div className={`kentu-input-strip${isNotesMode ? ' kentu-input-strip--notes' : ''}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            ref={chatFileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                Promise.all(
                  files.map(
                    (file) =>
                      new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(file);
                      })
                  )
                ).then((newBase64Images) => {
                  setChatImages((prev) => [...prev, ...newBase64Images]);
                });
                e.target.value = '';
              }
            }}
          />
          <KentuButton variant="ghost" className="kentu-btn--icon" type="button" onClick={() => chatFileInputRef.current?.click()} aria-label="Allega immagine">
            <KentuIcon name="camera" size={22} />
          </KentuButton>
          {sttSupported ? (
            <button
              type="button"
              className="kentu-btn--icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-transparent text-[16px] text-zinc-300 transition hover:border-cyan-500/40 hover:text-cyan-200"
              aria-label="Parla"
              disabled={isProcessing && !isNotesMode}
              onClick={() => {
                clearVoiceError();
                beginVoiceSession();
              }}
              title="Detta con il microfono"
            >
              🎤
            </button>
          ) : null}
          <div className="kentu-devtools-wrap" ref={toolsMenuRef}>
            <button
              type="button"
              className={`kentu-devtools-btn${isNotesMode ? ' kentu-devtools-btn--notes' : ''}`}
              aria-label={isNotesMode ? 'Disattiva modalità note' : 'Tools'}
              aria-expanded={showToolsMenu}
              onClick={handleToolsButtonClick}
            >
              {isNotesMode ? '📝' : '🛠️'}
            </button>
            {showToolsMenu ? (
              <div className="kentu-devtools-menu" role="menu">
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleRequestReportFromTools}>
                  🧠 Analisi Oggi
                </button>
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleBarcodeTool}>
                  📷 Scanner Barcode
                </button>
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleActivateNotesMode}>
                  📝 Modalità Note
                </button>
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleFlagAnomaly}>
                  ⚠️ Segnala Anomalia
                </button>
              </div>
            ) : null}
          </div>
          <textarea
            ref={chatTextareaRef}
            rows={1}
            className="chat-input resize-none overflow-hidden min-h-[44px] max-h-[150px]"
            placeholder={
              isNotesMode
                ? 'Nota di sviluppo…'
                : chatImages.length > 0
                  ? 'Commento immagini…'
                  : 'Query sistema…'
            }
            value={chatInput}
            disabled={isProcessing && !isNotesMode}
            onChange={(e) => {
              setChatInput(e.target.value);
              handleInputResize(e);
            }}
            onKeyDown={handleChatKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              outline: 'none',
              minWidth: 0,
              lineHeight: 1.4,
              paddingTop: 10,
              paddingBottom: 10,
            }}
          />
          {isProcessing && !isNotesMode ? (
            <KentuButton
              variant="secondary"
              className="kentu-send-btn"
              aria-label="Interrompi generazione"
              onClick={() => {
                if (typeof onCancelGeneration === 'function') onCancelGeneration();
              }}
            >
              <KentuIcon name="stop" size={16} />
            </KentuButton>
          ) : (
            <KentuButton
              variant="primary"
              className={`kentu-send-btn ${!(chatInput.trim() || (!isNotesMode && chatImages.length > 0)) || (isProcessing && !isNotesMode) ? 'kentu-send-btn--idle' : ''}`}
              aria-label={isNotesMode ? 'Salva nota' : 'Invia'}
              disabled={isProcessing && !isNotesMode}
              onClick={handleSendFromInput}
            >
              <KentuIcon name="send" size={18} />
            </KentuButton>
          )}
          {devToolsToast ? (
            <div className="kentu-devtools-toast" role="status" aria-live="polite">
              {devToolsToast}
            </div>
          ) : null}
        </div>
        )}
        {voiceError ? (
          <p
            role="alert"
            className="px-3 pb-2 text-[11px] text-rose-300/90"
            onClick={clearVoiceError}
          >
            {voiceError}
          </p>
        ) : null}
        </div>
      </div>
    </div>
  );
}
