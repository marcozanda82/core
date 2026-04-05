/**
 * AiCluster.jsx — KentuOS: superficie AI premium (insight cards, hub strumenti, input).
 */
import React, { useRef, useEffect, useMemo, useState } from 'react';
import MenuProposalCard from './MenuProposalCard';
import DailyPlanCard from './DailyPlanCard';
import {
  KentuIcon,
  KentuButton,
  KentuInsightHero,
  KentuInsightCard,
  KentuGridItem,
} from './components/kentuos/KentuOSUI';

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

const COMMAND_HUB_SECTIONS = [
  {
    title: 'Coach & dispensa',
    items: [
      { key: 'briefing', icon: 'chart', title: 'Briefing', desc: 'Sintesi giornata', highlight: false },
      { key: 'yesterday', icon: 'search', title: 'Analisi ieri', desc: 'Gap e trend' },
      { key: 'mealIdea', icon: 'bulb', title: 'Idea pasto', desc: 'Dalla dispensa' },
    ],
  },
  {
    title: 'Controlli fisiologici',
    items: [
      { key: 'checkOggi', icon: 'scales', title: 'Check oggi', desc: 'Audit nutrizionale' },
      { key: 'trainingCheck', icon: 'run', title: 'Workout', desc: 'Onda energetica' },
      { key: 'reportMese', icon: 'calendar', title: 'Report mese', desc: 'Trend 30 gg' },
      { key: 'scannerMetabolico', icon: 'dna', title: 'Scanner', desc: 'Analisi 14 gg' },
    ],
  },
];

export default function AiCluster({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  onSendMessage,
  onChatQuickAction,
  onLogDinnerOption,
  onLoadAgenda,
  onMealProposalConfirm,
  onMealProposalCancel,
  onMealProposalSwap,
  onDailyPlanConfirm,
  onDailyPlanCancel,
  onGeneratePlanGhostMealDraft,
  /** Eventi del giorno corrente (timeline/diario) per contesto wizard pianificazione */
  dailyLog = [],
  showAiSettings,
  setShowAiSettings,
  apiKeys,
  onKeyChange,
  onRemoveKey,
  onAddKey,
  onSaveApiCluster,
  onBack,
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  /** Con testo/immagini nell’input la hub si nascondeva: questo stato consente di forzarne la visibilità. */
  const [hubCommandForced, setHubCommandForced] = useState(false);
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const suppressQuickReplies = useMemo(
    () => (chatHistory || []).some((m) => m.mealProposal || m.dailyPlan),
    [chatHistory]
  );

  const hubInputBlocked = Boolean(chatInput.trim() || chatImages.length > 0);
  const showCommandHubDock =
    typeof onChatQuickAction === 'function' &&
    (!hubInputBlocked || hubCommandForced);

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
          <div className="kentu-os-status">
            <span className="kentu-os-status__pulse" aria-hidden />
            KentuOS · ONLINE
          </div>
        </div>
        <KentuButton
          variant="ghost"
          className="kentu-btn--icon"
          onClick={() => setShowAiSettings(!showAiSettings)}
          aria-label="Impostazioni API"
        >
          <KentuIcon name="gear" size={22} />
        </KentuButton>
      </header>

      {showAiSettings && (
        <div className="kentu-card kentu-card--settings" style={{ marginBottom: 14 }}>
          <p className="kentu-insight-sub" style={{ marginBottom: 12 }}>
            Cluster nodi API (fallback)
          </p>
          {apiKeys.map((key, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--kentu-text-muted)', fontSize: '0.65rem', fontWeight: 700 }}>N.{idx + 1}</span>
              <input
                type="password"
                value={key}
                onChange={(e) => onKeyChange(idx, e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 10,
                  fontSize: '0.8rem',
                }}
                placeholder="Chiave Gemini…"
              />
              <KentuButton variant="ghost" className="kentu-btn--icon" onClick={() => onRemoveKey(idx)} aria-label="Rimuovi">
                <KentuIcon name="x" size={18} />
              </KentuButton>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <KentuButton variant="secondary" style={{ flex: 1 }} onClick={onAddKey}>
              + Nodo
            </KentuButton>
            <KentuButton variant="primary" style={{ flex: 1 }} onClick={onSaveApiCluster}>
              Salva rete
            </KentuButton>
          </div>
        </div>
      )}

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
        {showCommandHubDock && (
          <div style={{ flexShrink: 0, marginTop: 6, marginBottom: 4 }}>
            {hubCommandForced && hubInputBlocked && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setHubCommandForced(false);
                    setIsPanelOpen(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--kentu-text-muted, #94a3b8)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Riduci hub
                </button>
              </div>
            )}
            <button type="button" className="kentu-hub-toggle" onClick={() => setIsPanelOpen((o) => !o)} aria-expanded={isPanelOpen}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <KentuIcon name="sliders" size={22} />
                <span>{isPanelOpen ? 'Chiudi strumenti' : 'Strumenti sistema'}</span>
              </span>
              <span style={{ display: 'flex', color: 'var(--kentu-text-muted)', transform: isPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <KentuIcon name="caret" size={20} />
              </span>
            </button>
            {isPanelOpen && (
              <div className="kentu-card kentu-hub-panel">
                <div className="kentu-hub-section-title">Dashboard comandi</div>
                {COMMAND_HUB_SECTIONS.map((section, secIdx) => (
                  <div key={section.title} style={{ marginBottom: secIdx < COMMAND_HUB_SECTIONS.length - 1 ? 18 : 0 }}>
                    <div className="kentu-hub-group-label">{section.title}</div>
                    <div className="kentu-hub-grid">
                      {section.items.map(({ key, icon, title: tileTitle, desc, highlight }) => (
                        <KentuGridItem
                          key={key}
                          icon={icon}
                          title={tileTitle}
                          subtitle={desc}
                          highlighted={!!highlight}
                          onClick={() => {
                            onChatQuickAction(key);
                            setIsPanelOpen(false);
                            setHubCommandForced(false);
                            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="kentu-input-strip">
          {typeof onChatQuickAction === 'function' && (
            <KentuButton
              variant="ghost"
              className="kentu-btn--icon"
              type="button"
              onClick={() => {
                if (hubCommandForced && isPanelOpen) {
                  setHubCommandForced(false);
                  setIsPanelOpen(false);
                  return;
                }
                if (hubInputBlocked) setHubCommandForced(true);
                setIsPanelOpen(true);
              }}
              aria-label="Apri hub comandi"
              title="Hub comandi · strumenti rapidi"
            >
              ⚡
            </KentuButton>
          )}
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
          <input
            type="text"
            className="chat-input"
            placeholder={chatImages.length > 0 ? 'Commento immagini…' : 'Query sistema…'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSendMessage(undefined, { fromInput: true });
                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              }
            }}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', minWidth: 0 }}
          />
          <KentuButton
            variant="primary"
            className={`kentu-send-btn ${!(chatInput.trim() || chatImages.length > 0) ? 'kentu-send-btn--idle' : ''}`}
            aria-label="Invia"
            onClick={() => {
              onSendMessage(undefined, { fromInput: true });
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }}
          >
            <KentuIcon name="send" size={18} />
          </KentuButton>
        </div>
      </div>
    </div>
  );
}
