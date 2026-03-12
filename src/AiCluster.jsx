/**
 * AiCluster.jsx — Interfaccia Assistente AI (chat, prompt rapidi, input, impostazioni API).
 * Estratto da SalaComandi.jsx per smembramento UI. Lo stato globale (chatHistory, invio) resta nel genitore.
 */
import React, { useRef, useEffect } from 'react';

export default function AiCluster({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  onSendMessage,
  showAiSettings,
  setShowAiSettings,
  apiKeys,
  onKeyChange,
  onRemoveKey,
  onAddKey,
  onSaveApiCluster,
  onBack
}) {
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  return (
    <div className="view-animate" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; MENU</button>
        <h2 style={{ fontSize: '0.8rem', color: '#b388ff', letterSpacing: '2px', margin: 0 }}>✨ ReadyCore AI</h2>
        <button type="button" onClick={() => setShowAiSettings(!showAiSettings)} style={{ background: 'none', border: 'none', color: '#b388ff', fontSize: '1.2rem', cursor: 'pointer', filter: 'drop-shadow(0 0 5px rgba(179, 136, 255, 0.5))' }}>⚙️</button>
      </div>

      {showAiSettings && (
        <div style={{ background: '#111', padding: '20px', borderRadius: '15px', marginBottom: '15px', border: '1px solid #333' }}>
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

      <div className="chat-container" style={{ height: '65vh', display: 'flex', flexDirection: 'column' }}>
        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
          {chatHistory.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'ai' ? 'flex-start' : 'flex-end', width: '100%' }}>
              <div className={`chat-bubble ${msg.sender === 'ai' ? 'bubble-ai' : 'bubble-user'}`}>
                {msg.isTyping ? (<div className="typing-indicator"><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>) : (msg.text)}
              </div>
              {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {msg.quickReplies.map((reply, rIdx) => (
                    <button
                      key={rIdx}
                      type="button"
                      onClick={() => {
                        onSendMessage(reply);
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                      }}
                      style={{ padding: '8px 15px', background: '#00e5ff', color: '#000', borderRadius: '20px', border: 'none', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {reply}
                    </button>
                  ))}
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
        <div className="chat-input-wrapper" style={{ marginTop: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', background: '#1a1a1a', borderRadius: '30px', padding: '6px 6px 6px 10px', border: '1px solid #333' }}>
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
            placeholder={chatImages.length > 0 ? 'Aggiungi un commento alle immagini...' : 'Scrivi qui a Core AI...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSendMessage();
                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              }
            }}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '0.95rem', outline: 'none', minWidth: 0 }}
          />
          <button
            type="button"
            className={`chat-send-btn ${(chatInput.trim() || chatImages.length > 0) ? 'has-text' : ''}`}
            onClick={() => {
              onSendMessage();
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }}
            style={{ background: (chatInput.trim() || chatImages.length > 0) ? '#b388ff' : '#fff', color: (chatInput.trim() || chatImages.length > 0) ? '#fff' : '#000', border: 'none', width: 40, height: 40, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0 }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
