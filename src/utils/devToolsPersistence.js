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
export function subscribeAiErrorLogs(uid, onData, onError) {
  const userId = resolveUid(uid);
  if (!userId) {
    onData([]);
    return () => {};
  }
  const logsRef = ref(db, `users/${userId}/ai_error_logs`);
  return onValue(
    logsRef,
    (snap) => onData(snapshotToSortedList(snap)),
    (err) => {
      console.error('[DevTools] subscribeAiErrorLogs', err);
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

export async function deleteAiErrorLog(logId, uid) {
  const userId = resolveUid(uid);
  const id = String(logId || '').trim();
  if (!userId || !id) throw new Error('deleteAiErrorLog: uid o id mancante');
  await remove(ref(db, `users/${userId}/ai_error_logs/${id}`));
}

export function buildDevNoteAiPrompt({ text, route } = {}) {
  const safeRoute = String(route || '').trim() || '/';
  const safeText = String(text || '').trim();
  return `Devo implementare questa nota di sviluppo in KentuOS. Contesto: rotta "${safeRoute}". Nota: "${safeText}". Come procediamo a livello di codice?`;
}

export function buildAiErrorAiPrompt({ userPrompt, aiResponse } = {}) {
  const safeUser = String(userPrompt || '').trim();
  const safeAi = String(aiResponse || '').trim();
  return `Ho un errore nel parser NLP di KentuOS. L'utente ha scritto: "${safeUser}". L'AI ha risposto/eseguito: "${safeAi}". Come correggiamo la logica o il prompt di sistema per gestire correttamente questo intento?`;
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
 * Salva l'ultimo scambio utente/AI come log errore.
 * RTDB: users/{uid}/ai_error_logs/{pushId}
 *
 * @param {{ userPrompt: string, aiResponse: string, uid?: string | null }} params
 */
export async function saveAiErrorLog({ userPrompt, aiResponse, uid } = {}) {
  const userId = resolveUid(uid);
  if (!userId) {
    throw new Error('saveAiErrorLog: uid mancante');
  }

  const payload = {
    userPrompt: String(userPrompt || '').trim(),
    aiResponse: String(aiResponse || '').trim(),
    timestamp: serverTimestamp(),
    route: typeof window !== 'undefined' ? window.location.pathname : '',
  };

  await push(ref(db, `users/${userId}/ai_error_logs`), payload);
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

/**
 * Estrae ultimo messaggio user e ultima risposta AI dalla cronologia chat.
 * @param {Array<{ sender?: string, text?: string }>} chatHistory
 */
export function extractLastUserAiPair(chatHistory) {
  const list = Array.isArray(chatHistory) ? chatHistory : [];
  let userPrompt = '';
  let aiResponse = '';

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    const sender = String(entry?.sender || '').toLowerCase();
    if (!aiResponse && (sender === 'ai' || sender === 'assistant')) {
      aiResponse = String(entry?.text || '');
      continue;
    }
    if (aiResponse && !userPrompt && (sender === 'user' || sender === 'human')) {
      userPrompt = String(entry?.text || '');
      break;
    }
  }

  return { userPrompt, aiResponse };
}
