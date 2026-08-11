import { onValue, push, ref, remove, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebaseConfig';

function resolveUid(explicitUid) {
  return explicitUid || auth.currentUser?.uid || null;
}

function normalizeTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value._seconds === 'number') return value._seconds * 1000;
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotToSortedList(snapshot) {
  if (!snapshot?.exists()) return [];
  const raw = snapshot.val() || {};
  return Object.entries(raw)
    .map(([id, data]) => ({
      id,
      ...(data && typeof data === 'object' ? data : { value: data }),
      _ts: normalizeTimestampMs(data?.timestamp),
    }))
    .sort((a, b) => b._ts - a._ts);
}

/** @param {number|string|object|null|undefined} timestamp */
export function formatDevToolsTimestamp(timestamp) {
  const ms = normalizeTimestampMs(timestamp);
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString('it-IT');
  }
}

/**
 * @param {string|null|undefined} uid
 * @param {(items: Array) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeDevNotes(uid, onData, onError) {
  const userId = resolveUid(uid);
  if (!userId) {
    onData([]);
    return () => {};
  }
  const notesRef = ref(db, `users/${userId}/dev_notes`);
  return onValue(
    notesRef,
    (snap) => onData(snapshotToSortedList(snap)),
    (err) => {
      console.error('[DevTools] subscribeDevNotes', err);
      onError?.(err);
      onData([]);
    },
  );
}

/**
 * @param {string|null|undefined} uid
 * @param {(items: Array) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeSavedChats(uid, onData, onError) {
  const userId = resolveUid(uid);
  if (!userId) {
    onData([]);
    return () => {};
  }
  const chatsRef = ref(db, `users/${userId}/saved_chats`);
  return onValue(
    chatsRef,
    (snap) => onData(snapshotToSortedList(snap)),
    (err) => {
      console.error('[DevTools] subscribeSavedChats', err);
      onError?.(err);
      onData([]);
    },
  );
}

export async function deleteDevNote(noteId, uid) {
  const userId = resolveUid(uid);
  const id = String(noteId || '').trim();
  if (!userId || !id) throw new Error('deleteDevNote: uid o id mancante');
  await remove(ref(db, `users/${userId}/dev_notes/${id}`));
}

export async function deleteSavedChat(chatId, uid) {
  const userId = resolveUid(uid);
  const id = String(chatId || '').trim();
  if (!userId || !id) throw new Error('deleteSavedChat: uid o id mancante');
  await remove(ref(db, `users/${userId}/saved_chats/${id}`));
}

export function buildDevNoteAiPrompt({ text, route } = {}) {
  const safeRoute = String(route || '').trim() || '/';
  const safeText = String(text || '').trim();
  return `Devo implementare questa nota di sviluppo in KentuOS. Contesto: rotta "${safeRoute}". Nota: "${safeText}". Come procediamo a livello di codice?`;
}

const MAX_SAVED_CHAT_MESSAGES = 200;
const MAX_SAVED_CHAT_TEXT = 8000;

/**
 * Normalizza la cronologia chat per il salvataggio contestuale.
 * @param {Array} chatHistory
 */
export function serializeChatMessagesForSave(chatHistory) {
  const list = Array.isArray(chatHistory) ? chatHistory : [];
  return list.slice(-MAX_SAVED_CHAT_MESSAGES).map((entry) => {
    const senderRaw = String(entry?.sender || '').toLowerCase();
    const sender =
      senderRaw === 'ai' || senderRaw === 'assistant'
        ? 'ai'
        : senderRaw === 'user' || senderRaw === 'human'
          ? 'user'
          : (senderRaw || 'unknown');
    return {
      sender,
      text: String(entry?.text || '').slice(0, MAX_SAVED_CHAT_TEXT),
      type: entry?.type != null ? String(entry.type) : null,
      at: entry?.timestamp ?? entry?.createdAt ?? entry?.at ?? null,
    };
  });
}

function buildSavedChatPreview(messages) {
  const firstUser = (messages || []).find((m) => m?.sender === 'user' && String(m?.text || '').trim());
  if (firstUser) return String(firstUser.text).slice(0, 160);
  const firstAny = (messages || []).find((m) => String(m?.text || '').trim());
  return firstAny ? String(firstAny.text).slice(0, 160) : 'Chat vuota';
}

/**
 * Salva una nota di sviluppo (input chat in modalità note).
 * RTDB: users/{uid}/dev_notes/{pushId}
 *
 * @param {{ text: string, route?: string, uid?: string | null }} params
 */
export async function saveDevNote({ text, route, uid } = {}) {
  const userId = resolveUid(uid);
  const trimmed = String(text || '').trim();
  if (!userId || !trimmed) {
    throw new Error('saveDevNote: uid o testo mancante');
  }

  const payload = {
    text: trimmed,
    timestamp: serverTimestamp(),
    route: route || (typeof window !== 'undefined' ? window.location.pathname : ''),
  };

  await push(ref(db, `users/${userId}/dev_notes`), payload);
  return payload;
}

/**
 * Salva l'intera conversazione chat (utente + AI) per revisione in Dev Console.
 * RTDB: users/{uid}/saved_chats/{pushId}
 *
 * @param {{
 *   messages?: Array,
 *   sessionId?: string | null,
 *   uid?: string | null,
 *   note?: string,
 * }} params
 */
export async function saveChatConversation({ messages, sessionId, uid, note } = {}) {
  const userId = resolveUid(uid);
  if (!userId) {
    throw new Error('saveChatConversation: uid mancante');
  }

  const serialized = serializeChatMessagesForSave(messages);
  if (!serialized.length) {
    throw new Error('saveChatConversation: nessun messaggio da salvare');
  }

  const payload = {
    timestamp: serverTimestamp(),
    sessionId: String(sessionId || '').trim() || null,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    messageCount: serialized.length,
    preview: buildSavedChatPreview(serialized),
    note: String(note || '').trim() || null,
    messages: serialized,
  };

  await push(ref(db, `users/${userId}/saved_chats`), payload);
  return payload;
}

/**
 * Log silente errori di sistema (es. fallimento callGemini).
 * RTDB: logs/system_errors/{pushId}
 */
export async function logSystemError(error, context = 'Gemini API Call') {
  try {
    const payload = {
      timestamp: serverTimestamp(),
      error: String(error?.message || error || 'Errore sconosciuto').trim() || 'Errore sconosciuto',
      code: error?.code != null ? String(error.code) : null,
      details:
        error?.details != null
          ? (typeof error.details === 'string' ? error.details : JSON.stringify(error.details))
          : null,
      context: String(context || 'Gemini API Call'),
      uid: auth.currentUser?.uid || null,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
    };
    await push(ref(db, 'logs/system_errors'), payload);
    return payload;
  } catch (err) {
    console.error('[DevTools] logSystemError failed', err);
    return null;
  }
}

/**
 * Feedback utente su risposta AI anomala (ultimo scambio).
 * RTDB: logs/ai_feedback/{pushId}
 *
 * @param {{ messages?: Array, note?: string, uid?: string | null }} params
 */
export async function saveAiFeedback({ messages, note, uid } = {}) {
  const payload = {
    timestamp: serverTimestamp(),
    messages: Array.isArray(messages)
      ? messages.map((m) => ({
          sender: m?.sender ?? null,
          text: String(m?.text || '').slice(0, 8000),
        }))
      : [],
    note: String(note || "Segnalato manualmente dall'utente per risposta anomala").trim(),
    uid: resolveUid(uid),
    route: typeof window !== 'undefined' ? window.location.pathname : '',
  };

  await push(ref(db, 'logs/ai_feedback'), payload);
  return payload;
}

