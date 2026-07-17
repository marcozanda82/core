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
import WipMealCartBar from './features/wipMealBuilder/components/WipMealCartBar';
import WipMealSmartChips from './features/wipMealBuilder/components/WipMealSmartChips';
import {
  KentuIcon,
  KentuButton,
  KentuInsightHero,
  KentuInsightCard,
} from './components/kentuos/KentuOSUI';
import {
  extractLastUserAiPair,
  saveAiErrorLog,
  saveDevNote,
} from './utils/devToolsPersistence';

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
  foodDatabase = {},
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
  wipMealItems = [],
  wipMealTotals = null,
  wipMealType = 'pranzo',
  onRemoveWipItem,
  onClearWipMeal,
  onAddWipSuggestion,
}) {
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isProcessing]);

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
    if (!hasActiveWorkoutDraft) return activeQuickReplies;
    return activeQuickReplies.filter(
      (label) => !/^s[iì]\s*,\s*salva\b/i.test(String(label ?? '').trim()),
    );
  }, [activeQuickReplies, hasActiveWorkoutDraft]);

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
  }, []);

  const handleLogAIError = useCallback(async () => {
    try {
      const { userPrompt, aiResponse } = extractLastUserAiPair(chatHistory);
      if (!userPrompt && !aiResponse) {
        showDevToast('Nessun messaggio da registrare');
        setShowToolsMenu(false);
        return;
      }
      await saveAiErrorLog({ userPrompt, aiResponse });
      showDevToast('Errore AI registrato');
    } catch (err) {
      console.error('[DevTools] saveAiErrorLog failed', err);
      showDevToast('Salvataggio errore fallito');
    } finally {
      setShowToolsMenu(false);
    }
  }, [chatHistory, showDevToast]);

  const handleSendFromInput = useCallback(async () => {
    if (isProcessing) return;

    if (isNotesMode) {
      const noteText = String(chatInput || '').trim();
      if (!noteText) return;
      try {
        await saveDevNote({ text: noteText });
        setChatInput('');
        showDevToast('Nota salvata');
      } catch (err) {
        console.error('[DevTools] saveDevNote failed', err);
        showDevToast('Salvataggio nota fallito');
      }
      return;
    }

    onSendMessage(undefined, { fromInput: true });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [isProcessing, isNotesMode, chatInput, setChatInput, showDevToast, onSendMessage]);

  return (
    <div
      className="view-animate ai-cluster-root kentu-os"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}
    >
      <header className="kentu-os-header">
        <KentuButton variant="ghost" className="kentu-btn--icon" onClick={onBack} aria-label="Menu">
          <KentuIcon name="arrow-left" size={22} />
        </KentuButton>
        <div className="kentu-os-brand">
          <img src="/nuovo%20logo%20trasparente2.png" alt="Kentu" decoding="async" />
          <div
            className={`kentu-os-status${introPhrase ? ' kentu-os-status--intro' : ''}`}
            title={introPhrase || undefined}
          >
            <span className="kentu-os-status__pulse" aria-hidden />
            {introPhrase ? (
              <span className="kentu-intro-phrase-text kentu-intro-phrase-text--glow">{introPhrase}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className="chat-container"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          height: 'auto',
        }}
      >
        <WipMealCartBar
          items={wipMealItems}
          totals={wipMealTotals}
          mealType={wipMealType}
          onRemoveItem={onRemoveWipItem}
          onClear={onClearWipMeal}
        />
        <div className="chat-messages" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingRight: '5px' }}>
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
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                          fullHistory={fullHistory}
                          onConfirm={onAcceptMealProposal}
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
                  </div>
                )
              ) : (
                <div className="kentu-user-capsule">
                  <div className="kentu-user-capsule__label">Input</div>
                  {stripInvisibleContextFromBubble(msg.text)}
                </div>
              )}
              {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && !suppressQuickReplies && (
                <div className="kentu-quick-row" style={{ justifyContent: msg.sender === 'ai' ? 'flex-start' : 'flex-end' }}>
                  {msg.quickReplies.map((reply, rIdx) => {
                    const morningActivityIds = ['weights', 'cardio', 'rest'];
                    return (
                      <KentuButton
                        key={rIdx}
                        variant="secondary"
                        className="kentu-btn--sm"
                        onClick={() => {
                          if (msg.workoutTimeConfirm) {
                            onSendMessage(reply, {
                              fromQuickReply: true,
                              workoutTimeReply: rIdx === 0 ? 'accept' : 'reject',
                            });
                          } else if (msg.eveningBriefing && (rIdx === 0 || rIdx === 1)) {
                            onSendMessage(reply, {
                              fromQuickReply: true,
                              eveningBriefingReply: {
                                action: rIdx === 0 ? 'yes' : 'no',
                                missingKcal: msg.eveningBriefing.missingKcal,
                                missingPro: msg.eveningBriefing.missingPro,
                              },
                            });
                          } else if (msg.morningBriefing?.status && morningActivityIds[rIdx]) {
                            onSendMessage(reply, {
                              fromQuickReply: true,
                              morningBriefingReply: {
                                status: msg.morningBriefing.status,
                                activity: morningActivityIds[rIdx],
                              },
                            });
                          } else {
                            onSendMessage(reply, { fromQuickReply: true });
                          }
                          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }}
                      >
                        {reply}
                      </KentuButton>
                    );
                  })}
                </div>
              )}
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
            {visibleQuickReplies.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSlotQuickReplyClick?.(label);
                  setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
                className="shrink-0 rounded-full border border-cyan-500/30 bg-slate-900/70 px-3.5 py-1.5 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-400/50 hover:bg-slate-800/90 hover:text-cyan-50"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
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
          <div className="kentu-devtools-wrap" ref={toolsMenuRef}>
            <button
              type="button"
              className={`kentu-devtools-btn${isNotesMode ? ' kentu-devtools-btn--notes' : ''}`}
              aria-label={isNotesMode ? 'Disattiva modalità note' : 'Dev Tools'}
              aria-expanded={showToolsMenu}
              onClick={handleToolsButtonClick}
            >
              <span aria-hidden="true">{isNotesMode ? '💡' : '🛠️'}</span>
            </button>
            {showToolsMenu ? (
              <div className="kentu-devtools-menu" role="menu">
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleLogAIError}>
                  ⚠️ Log Ultimo Errore AI
                </button>
                <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleActivateNotesMode}>
                  💡 Attiva Modalità Note
                </button>
              </div>
            ) : null}
          </div>
          <input
            type="text"
            className="chat-input"
            placeholder={
              isNotesMode
                ? 'Nota di sviluppo…'
                : chatImages.length > 0
                  ? 'Commento immagini…'
                  : 'Query sistema…'
            }
            value={chatInput}
            disabled={isProcessing && !isNotesMode}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendFromInput();
              }
            }}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', minWidth: 0 }}
          />
          <KentuButton
            variant="primary"
            className={`kentu-send-btn ${!(chatInput.trim() || (!isNotesMode && chatImages.length > 0)) || (isProcessing && !isNotesMode) ? 'kentu-send-btn--idle' : ''}`}
            aria-label={isNotesMode ? 'Salva nota' : 'Invia'}
            disabled={isProcessing && !isNotesMode}
            onClick={handleSendFromInput}
          >
            <KentuIcon name="send" size={18} />
          </KentuButton>
          {devToolsToast ? (
            <div className="kentu-devtools-toast" role="status" aria-live="polite">
              {devToolsToast}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
