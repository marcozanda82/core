/**
 * AiCluster.jsx — Interfaccia Assistente AI (chat, prompt rapidi, input, impostazioni API).
 * Estratto da SalaComandi.jsx per smembramento UI. Lo stato globale (chatHistory, invio) resta nel genitore.
 */
import React, { useRef, useEffect, useMemo, useState } from 'react';
import MenuProposalCard from './MenuProposalCard';

/** Allinea a stripInvisibleContextFromVisibleUserText in SalaComandi (contesto API non visibile). */
function stripInvisibleContextFromBubble(text) {
  if (text == null || typeof text !== 'string') return text;
  return text.replace(/\[CONTEXT_LIVE:[^\]]*\]\s*/gi, '').trim();
}

/** Sezioni separate da doppio a capo → divider luminosi tra blocchi (AI Card). */
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
      { key: 'briefing', icon: '📊', title: 'Briefing', desc: 'Sintesi giornata' },
      { key: 'yesterday', icon: '🔍', title: 'Analisi ieri', desc: 'Gap e trend' },
      { key: 'mealIdea', icon: '💡', title: 'Idea pasto', desc: 'Dalla dispensa' },
    ],
  },
  {
    title: 'Controlli fisiologici',
    items: [
      { key: 'checkOggi', icon: '⚖️', title: 'Check oggi', desc: 'Audit nutrizionale' },
      { key: 'trainingCheck', icon: '🏃‍♂️', title: 'Workout', desc: 'Onda energetica' },
      { key: 'reportMese', icon: '📅', title: 'Report mese', desc: 'Trend 30 gg' },
      { key: 'scannerMetabolico', icon: '🧬', title: 'Scanner', desc: 'Analisi 14 gg' },
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
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const suppressQuickReplies = useMemo(
    () => (chatHistory || []).some((m) => m.mealProposal),
    [chatHistory]
  );

  return (
    <div
      className="view-animate ai-cluster-root"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; MENU</button>
        <h2 style={{ fontSize: '0.8rem', color: '#b388ff', letterSpacing: '2px', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
          <img src="/nuovo%20logo%20trasparente2.png" alt="Kentuos Logo" decoding="async" style={{ maxHeight: 22, width: 'auto', maxWidth: 'min(120px, 32vw)', objectFit: 'contain', display: 'block' }} />
          <span style={{ whiteSpace: 'nowrap' }}>Kentu</span>
        </h2>
        <button type="button" onClick={() => setShowAiSettings(!showAiSettings)} style={{ background: 'none', border: 'none', color: '#b388ff', fontSize: '1.2rem', cursor: 'pointer', filter: 'drop-shadow(0 0 5px rgba(179, 136, 255, 0.5))' }}>⚙️</button>
      </div>

      {showAiSettings && (
        <div className="ai-card" style={{ marginBottom: '15px', padding: '18px 16px' }}>
          <h4 style={{ fontSize: '0.7rem', color: '#b388ff', margin: '0 0 10px 0', letterSpacing: '1px' }}>CLUSTER NODI API (FALLBACK)</h4>
          {apiKeys.map((key, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: '#555', fontSize: '0.7rem' }}>N.{idx + 1}</span>
              <input
                type="password"
                value={key}
                onChange={(e) => onKeyChange(idx, e.target.value)}
                style={{ flex: 1, background: '#222', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '0.8rem' }}
                placeholder="Incolla chiave Gemini..."
              />
              <button type="button" onClick={() => onRemoveKey(idx)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: '5px' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onAddKey} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px dashed #333', color: '#aaa', borderRadius: '8px', cursor: 'pointer' }}>+ Aggiungi Nodo</button>
            <button type="button" onClick={onSaveApiCluster} style={{ flex: 1, padding: '10px', background: '#b388ff', border: 'none', color: '#000', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Salva Rete</button>
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
                <MenuProposalCard
                  proposal={msg.mealProposal}
                  onConfirm={onMealProposalConfirm}
                  onCancel={onMealProposalCancel}
                  onSwap={onMealProposalSwap}
                />
              ) : msg.sender === 'ai' ? (
                <div className={`ai-card${msg.isTyping ? ' ai-card--typing' : ''}`}>
                  {msg.isTyping ? (
                    <div className="typing-indicator">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  ) : (
                    splitAiMessageSections(msg.text).map((block, si) => (
                      <div
                        key={si}
                        className={si > 0 ? 'ai-card-section--divider' : undefined}
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {block}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="chat-bubble bubble-user" style={{ fontSize: '1.0625rem', lineHeight: 1.65, maxWidth: '88%' }}>
                  {stripInvisibleContextFromBubble(msg.text)}
                </div>
              )}
              {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && !suppressQuickReplies && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {msg.quickReplies.map((reply, rIdx) => {
                    const morningActivityIds = ['weights', 'cardio', 'rest'];
                    return (
                      <button
                        key={rIdx}
                        type="button"
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
                        className="btn-quick-reply-glass"
                        style={{ border: 'none' }}
                      >
                        {reply}
                      </button>
                    );
                  })}
                </div>
              )}
              {msg.dinnerOptions && msg.dinnerOptions.length > 0 && !msg.isTyping && typeof onLogDinnerOption === 'function' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', marginBottom: '4px', alignItems: 'center' }}>
                  {msg.dinnerOptions.map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      type="button"
                      onClick={() => {
                        onLogDinnerOption(opt);
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                      }}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(251, 191, 36, 0.15)',
                        color: '#fde68a',
                        borderRadius: '12px',
                        border: '1px solid rgba(251, 191, 36, 0.35)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Logga pasto {oIdx + 1}
                    </button>
                  ))}
                </div>
              )}
              {msg.agendaOptions && msg.agendaOptions.length > 0 && !msg.isTyping && typeof onLoadAgenda === 'function' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', marginBottom: '4px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onLoadAgenda(msg.agendaOptions);
                      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'rgba(0, 229, 255, 0.12)',
                      color: '#7dd3fc',
                      borderRadius: '12px',
                      border: '1px solid rgba(0, 229, 255, 0.35)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Carica attività nel diario
                  </button>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        {chatImages.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', marginLeft: '10px', overflowX: 'auto' }}>
            {chatImages.map((imgSrc, index) => (
              <div key={index} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                <img src={imgSrc} alt={`Upload ${index}`} style={{ height: '60px', borderRadius: '8px', border: '1px solid #444' }} />
                <button
                  type="button"
                  onClick={() => setChatImages(prev => prev.filter((_, i) => i !== index))}
                  style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '0.7rem' }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
        {typeof onChatQuickAction === 'function' && !chatInput.trim() && chatImages.length === 0 && (
          <div style={{ flexShrink: 0, marginTop: '6px', marginBottom: '4px' }}>
            <button
              type="button"
              className="btn-glass"
              onClick={() => setIsPanelOpen((o) => !o)}
              aria-expanded={isPanelOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 14px',
                boxSizing: 'border-box',
                fontSize: '0.85rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="command-hub-tile-icon" style={{ fontSize: '1.35rem' }} aria-hidden>🎛️</span>
                <span style={{ color: '#e9d5ff' }}>{isPanelOpen ? 'Chiudi hub comandi' : 'Apri hub comandi'}</span>
              </span>
              <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>{isPanelOpen ? '▲' : '▼'}</span>
            </button>
            {isPanelOpen && (
              <div className="ai-card" style={{ marginTop: '10px', padding: '14px 12px 16px' }}>
                <div
                  style={{
                    fontSize: '0.58rem',
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '12px',
                    fontWeight: 800,
                  }}
                >
                  Dashboard comandi
                </div>
                {COMMAND_HUB_SECTIONS.map((section, secIdx) => (
                  <div key={section.title} style={{ marginBottom: secIdx < COMMAND_HUB_SECTIONS.length - 1 ? '16px' : 0 }}>
                    <div
                      style={{
                        fontSize: '0.62rem',
                        color: '#93c5fd',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        marginBottom: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {section.title}
                    </div>
                    <div className="command-hub-grid">
                      {section.items.map(({ key, icon, title: tileTitle, desc }) => (
                        <button
                          key={key}
                          type="button"
                          className="btn-glass command-hub-tile"
                          onClick={() => {
                            onChatQuickAction(key);
                            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                          }}
                        >
                          <span className="command-hub-tile-icon" aria-hidden>
                            {icon}
                          </span>
                          <span className="command-hub-tile-title">{tileTitle}</span>
                          <span className="command-hub-tile-desc">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div
          className="chat-input-wrapper chat-input-glass"
          style={{ marginTop: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', borderRadius: '30px', padding: '6px 6px 6px 10px' }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            ref={chatFileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                Promise.all(files.map(file => new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(file);
                }))).then(newBase64Images => {
                  setChatImages(prev => [...prev, ...newBase64Images]);
                });
                e.target.value = '';
              }
            }}
          />
          <button type="button" onClick={() => chatFileInputRef.current?.click()} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer', padding: '5px' }}>📷</button>
          <input
            type="text"
            className="chat-input"
            placeholder={chatImages.length > 0 ? 'Aggiungi un commento alle immagini...' : 'Scrivi a Kentu...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSendMessage(undefined, { fromInput: true });
                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              }
            }}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '1.05rem', lineHeight: 1.5, outline: 'none', minWidth: 0 }}
          />
          <button
            type="button"
            className={`btn-primary-glow chat-send-btn-glow ${!(chatInput.trim() || chatImages.length > 0) ? 'chat-send-btn-glow--idle' : ''}`}
            aria-label="Invia messaggio"
            onClick={() => {
              onSendMessage(undefined, { fromInput: true });
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
