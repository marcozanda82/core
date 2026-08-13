import React, { useCallback, useEffect, useState } from 'react';
import {
  buildDevNoteAiPrompt,
  deleteDevNote,
  deleteSavedChat,
  formatDevToolsTimestamp,
  subscribeDevNotes,
  subscribeSavedChats,
} from '../utils/devToolsPersistence';
import CopyToClipboardButton from './CopyToClipboardButton';

const STYLES = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    height: '100%',
    color: '#e2e8f0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexShrink: 0,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: '0.8rem',
    cursor: 'pointer',
    letterSpacing: '1px',
  },
  title: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    letterSpacing: '2px',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexShrink: 0,
  },
  tab: (active, accent) => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${active ? accent : '#2a2a2a'}`,
    background: active ? 'rgba(30, 41, 59, 0.9)' : '#111',
    color: active ? '#f8fafc' : '#94a3b8',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  desktopGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    alignItems: 'start',
    flex: 1,
    minHeight: 0,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
  },
  columnTitle: {
    margin: '0 0 4px',
    fontSize: '0.75rem',
    letterSpacing: '1.5px',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    paddingBottom: 24,
  },
  card: {
    position: 'relative',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 12px',
    fontSize: '0.72rem',
    color: '#64748b',
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  body: {
    fontSize: '0.85rem',
    lineHeight: 1.45,
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  block: {
    background: '#0a0a0a',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: 10,
  },
  blockLabel: {
    display: 'block',
    fontSize: '0.68rem',
    letterSpacing: '1px',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: (variant) => ({
    appearance: 'none',
    border: `1px solid ${variant === 'danger' ? '#7f1d1d' : '#334155'}`,
    background: variant === 'danger' ? 'rgba(127, 29, 29, 0.25)' : 'rgba(30, 41, 59, 0.8)',
    color: variant === 'danger' ? '#fca5a5' : '#cbd5e1',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  empty: {
    margin: 0,
    padding: '28px 12px',
    textAlign: 'center',
    fontSize: '0.85rem',
    color: '#64748b',
    fontStyle: 'italic',
    border: '1px dashed #2a2a2a',
    borderRadius: 12,
  },
  loading: {
    margin: 0,
    padding: '28px 12px',
    textAlign: 'center',
    fontSize: '0.85rem',
    color: '#94a3b8',
  },
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    zIndex: 100001,
    padding: '10px 16px',
    borderRadius: 999,
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#f8fafc',
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  thread: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 360,
    overflowY: 'auto',
  },
  bubble: (isUser) => ({
    position: 'relative',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '92%',
    padding: '8px 10px',
    paddingTop: 28,
    borderRadius: 10,
    background: isUser ? 'rgba(37, 99, 235, 0.25)' : 'rgba(30, 41, 59, 0.85)',
    border: `1px solid ${isUser ? 'rgba(59, 130, 246, 0.35)' : '#1f2937'}`,
  }),
  bubbleMeta: {
    display: 'block',
    fontSize: '0.65rem',
    letterSpacing: '0.8px',
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  bubbleCopy: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
};

function useIsDesktop(minWidth = 900) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${minWidth}px)`).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [minWidth]);

  return isDesktop;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function formatSavedChatTranscript(item) {
  const messages = Array.isArray(item?.messages) ? item.messages : [];
  const header = [
    `Chat salvata · ${formatDevToolsTimestamp(item?.timestamp)}`,
    item?.sessionId ? `session: ${item.sessionId}` : null,
    item?.route ? `route: ${item.route}` : null,
  ].filter(Boolean).join('\n');

  const body = messages.map((msg) => {
    const isUser = String(msg?.sender || '').toLowerCase() === 'user';
    const label = isUser ? 'Utente' : 'AI';
    return `[${label}]\n${String(msg?.text || '').trim() || '—'}`;
  }).join('\n\n');

  return [header, body].filter(Boolean).join('\n\n');
}

function NoteCard({ item, onResolve, onCopyPrompt, onCopied }) {
  const noteText = String(item?.text || '').trim();
  return (
    <article style={STYLES.card}>
      <div style={STYLES.cardTop}>
        <div style={STYLES.meta}>
          <span>{formatDevToolsTimestamp(item.timestamp)}</span>
          <span>route: {item.route || '—'}</span>
        </div>
        <CopyToClipboardButton
          text={noteText || '—'}
          ariaLabel="Copia nota negli appunti"
          title="Copia nota"
          onCopied={onCopied}
        />
      </div>
      <div style={STYLES.body}>{noteText || '—'}</div>
      <div style={STYLES.actions}>
        <button type="button" style={STYLES.actionBtn('copy')} onClick={() => onCopyPrompt(item)}>
          📋 Copia Prompt per AI
        </button>
        <button type="button" style={STYLES.actionBtn('danger')} onClick={() => onResolve(item)}>
          🗑️ Risolvi/Elimina
        </button>
      </div>
    </article>
  );
}

function SavedChatCard({ item, expanded, onToggle, onResolve, onCopied }) {
  const messages = Array.isArray(item.messages) ? item.messages : [];
  const transcript = formatSavedChatTranscript(item);
  return (
    <article style={STYLES.card}>
      <div style={STYLES.cardTop}>
        <div style={STYLES.meta}>
          <span>{formatDevToolsTimestamp(item.timestamp)}</span>
          {item.sessionId ? <span>session: {item.sessionId}</span> : null}
          <span>{item.messageCount ?? messages.length} msg</span>
          {item.route ? <span>route: {item.route}</span> : null}
        </div>
        <CopyToClipboardButton
          text={transcript}
          ariaLabel="Copia chat negli appunti"
          title="Copia chat"
          onCopied={onCopied}
        />
      </div>
      <div style={STYLES.body}>{item.preview || 'Chat salvata'}</div>
      {expanded ? (
        <div style={STYLES.block}>
          <span style={STYLES.blockLabel}>Conversazione</span>
          <div style={STYLES.thread}>
            {messages.length === 0 ? (
              <div style={STYLES.body}>Nessun messaggio</div>
            ) : (
              messages.map((msg, idx) => {
                const isUser = String(msg?.sender || '').toLowerCase() === 'user';
                const msgText = String(msg?.text || '').trim() || '—';
                return (
                  <div key={`${item.id}-${idx}`} style={STYLES.bubble(isUser)}>
                    <div style={STYLES.bubbleCopy}>
                      <CopyToClipboardButton
                        text={msgText}
                        ariaLabel="Copia messaggio"
                        title="Copia messaggio"
                        className="!h-7 !w-7"
                        onCopied={onCopied}
                      />
                    </div>
                    <span style={STYLES.bubbleMeta}>{isUser ? 'Utente' : 'AI'}</span>
                    <div style={STYLES.body}>{msgText}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      <div style={STYLES.actions}>
        <button type="button" style={STYLES.actionBtn('copy')} onClick={() => onToggle(item.id)}>
          {expanded ? '▴ Chiudi' : '▾ Espandi chat'}
        </button>
        <button type="button" style={STYLES.actionBtn('danger')} onClick={() => onResolve(item)}>
          🗑️ Elimina
        </button>
      </div>
    </article>
  );
}

function ItemsPanel({ title, loading, items, emptyLabel, renderItem }) {
  return (
    <section style={STYLES.column}>
      {title ? <h3 style={STYLES.columnTitle}>{title}</h3> : null}
      {loading ? (
        <p style={STYLES.loading}>Caricamento…</p>
      ) : items.length === 0 ? (
        <p style={STYLES.empty}>{emptyLabel}</p>
      ) : (
        <div style={STYLES.list}>{items.map(renderItem)}</div>
      )}
    </section>
  );
}

export default function DevConsoleView({ onBack, uid = null }) {
  const isDesktop = useIsDesktop(900);
  const [activeTab, setActiveTab] = useState('notes');
  const [notes, setNotes] = useState([]);
  const [savedChats, setSavedChats] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [expandedChatIds, setExpandedChatIds] = useState(() => new Set());
  const [toast, setToast] = useState('');

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    setNotesLoading(true);
    const unsub = subscribeDevNotes(uid, (items) => {
      setNotes(items);
      setNotesLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    setChatsLoading(true);
    const unsub = subscribeSavedChats(uid, (items) => {
      setSavedChats(items);
      setChatsLoading(false);
    });
    return unsub;
  }, [uid]);

  const handleCopyNotePrompt = useCallback(async (item) => {
    try {
      await copyText(buildDevNoteAiPrompt(item));
      showToast('Prompt copiato negli appunti!');
    } catch (err) {
      console.error('[DevConsole] copy note prompt', err);
      showToast('Copia fallita');
    }
  }, [showToast]);

  const handleCopied = useCallback(() => {
    showToast('Copiato negli appunti!');
  }, [showToast]);

  const handleResolveNote = useCallback(async (item) => {
    if (!window.confirm('Eliminare questa nota di sviluppo?')) return;
    try {
      await deleteDevNote(item.id, uid);
      showToast('Nota eliminata');
    } catch (err) {
      console.error('[DevConsole] delete note', err);
      showToast('Eliminazione fallita');
    }
  }, [uid, showToast]);

  const handleToggleChat = useCallback((chatId) => {
    setExpandedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }, []);

  const handleResolveChat = useCallback(async (item) => {
    if (!window.confirm('Eliminare questa chat salvata?')) return;
    try {
      await deleteSavedChat(item.id, uid);
      setExpandedChatIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showToast('Chat eliminata');
    } catch (err) {
      console.error('[DevConsole] delete saved chat', err);
      showToast('Eliminazione fallita');
    }
  }, [uid, showToast]);

  const notesPanel = (
    <ItemsPanel
      title={isDesktop ? '💡 Dev Notes' : null}
      loading={notesLoading}
      items={notes}
      emptyLabel="Nessun dato"
      renderItem={(item) => (
        <NoteCard
          key={item.id}
          item={item}
          onCopyPrompt={handleCopyNotePrompt}
          onResolve={handleResolveNote}
          onCopied={handleCopied}
        />
      )}
    />
  );

  const chatsPanel = (
    <ItemsPanel
      title={isDesktop ? '💬 Storico Chat' : null}
      loading={chatsLoading}
      items={savedChats}
      emptyLabel="Nessuna chat salvata"
      renderItem={(item) => (
        <SavedChatCard
          key={item.id}
          item={item}
          expanded={expandedChatIds.has(item.id)}
          onToggle={handleToggleChat}
          onResolve={handleResolveChat}
          onCopied={handleCopied}
        />
      )}
    />
  );

  return (
    <div className="view-animate" style={STYLES.root}>
      <div style={STYLES.header}>
        <button type="button" onClick={onBack} style={STYLES.backBtn}>
          &lt; INDIETRO
        </button>
        <h2 style={STYLES.title}>🛠️ DEV CONSOLE</h2>
        <div style={{ width: 70 }} />
      </div>

      {!isDesktop ? (
        <div style={STYLES.tabBar} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notes'}
            style={STYLES.tab(activeTab === 'notes', 'rgba(250, 204, 21, 0.55)')}
            onClick={() => setActiveTab('notes')}
          >
            💡 Dev Notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chats'}
            style={STYLES.tab(activeTab === 'chats', 'rgba(96, 165, 250, 0.55)')}
            onClick={() => setActiveTab('chats')}
          >
            💬 Storico Chat
          </button>
        </div>
      ) : null}

      {isDesktop ? (
        <div style={STYLES.desktopGrid}>
          {notesPanel}
          {chatsPanel}
        </div>
      ) : (
        activeTab === 'notes' ? notesPanel : chatsPanel
      )}

      {toast ? (
        <div style={STYLES.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
