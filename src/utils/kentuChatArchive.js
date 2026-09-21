/**
 * Archivio chat Kentu su Firebase RTDB.
 * Lo storico dei giorni precedenti resta consultabile, ma non viene caricato
 * nella vista principale della chat.
 */

import { get, ref, set } from 'firebase/database';
import { auth, db } from '../firebaseConfig';
import {
  kentuChatHistoryForPersistence,
  listLocalKentuChatDates,
  readKentuChatHistoryFromLocalStorage,
  sanitizeKentuChatMessages,
  stripKentuIntroSeedMessages,
} from './salaComandiUtils';

export function kentuChatArchivePath(uid, dateStr) {
  return `users/${uid}/kentu_chats/${dateStr}`;
}

function toFirebaseValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Salva il thread di un giorno su RTDB (sovrascrive il nodo del giorno).
 * Non legge mai l'archivio nella view principale.
 *
 * @param {{ uid?: string|null, dateStr?: string, messages?: unknown }} params
 */
export async function archiveKentuChatDay({ uid, dateStr, messages } = {}) {
  const userId = uid || auth.currentUser?.uid || null;
  const day = String(dateStr || '').slice(0, 10);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !db) return false;

  const payload = stripKentuIntroSeedMessages(kentuChatHistoryForPersistence(messages));
  if (!payload.length) return false;

  const serialized = toFirebaseValue(payload);
  if (!serialized) return false;

  try {
    await set(ref(db, kentuChatArchivePath(userId, day)), {
      date: day,
      messageCount: serialized.length,
      updatedAt: new Date().toISOString(),
      messages: serialized,
    });
    return true;
  } catch (error) {
    console.warn('[KentuChat] archive day failed', day, error);
    return false;
  }
}

/**
 * Spedisce a Firebase le chat locali dei giorni precedenti, senza caricarle in UI.
 *
 * @param {{ uid?: string|null, todayStr?: string }} params
 */
export async function archivePreviousLocalKentuChats({ uid, todayStr } = {}) {
  const today = String(todayStr || '').slice(0, 10);
  const dates = listLocalKentuChatDates().filter((d) => d && d !== today);
  const results = await Promise.all(
    dates.map(async (dateStr) => {
      const stored = readKentuChatHistoryFromLocalStorage(dateStr);
      if (!stored) return false;
      return archiveKentuChatDay({ uid, dateStr, messages: stored });
    }),
  );
  return results.filter(Boolean).length;
}

function tagArchivedMessages(messages, dateStr) {
  return stripKentuIntroSeedMessages(sanitizeKentuChatMessages(messages)).map((m) => ({
    ...m,
    fromArchive: true,
    historyDate: dateStr,
  }));
}

export async function listRemoteKentuChatDates(uid) {
  const userId = uid || auth.currentUser?.uid || null;
  if (!userId || !db) return [];
  try {
    const snap = await get(ref(db, `users/${userId}/kentu_chats`));
    if (!snap.exists()) return [];
    return Object.keys(snap.val() || {})
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  } catch (error) {
    console.warn('[KentuChat] list remote dates failed', error);
    return [];
  }
}

export async function fetchRemoteKentuChatDay({ uid, dateStr } = {}) {
  const userId = uid || auth.currentUser?.uid || null;
  const day = String(dateStr || '').slice(0, 10);
  if (!userId || !db || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    const snap = await get(ref(db, kentuChatArchivePath(userId, day)));
    if (!snap.exists()) return null;
    const val = snap.val() || {};
    const messages = Array.isArray(val.messages) ? val.messages : [];
    const cleaned = tagArchivedMessages(messages, day);
    return cleaned.length ? cleaned : null;
  } catch (error) {
    console.warn('[KentuChat] fetch remote day failed', day, error);
    return null;
  }
}

function localMessagesForDay(dateStr) {
  const stored = readKentuChatHistoryFromLocalStorage(dateStr);
  if (!stored?.length) return [];
  return tagArchivedMessages(stored, dateStr);
}

/**
 * True se esiste almeno un giorno precedente con messaggi (locale o Firebase).
 */
export async function probeHasPreviousKentuChat({ uid, beforeDate } = {}) {
  const cutoff = String(beforeDate || '').slice(0, 10);
  if (!cutoff) return false;

  const localDates = listLocalKentuChatDates();
  for (let i = 0; i < localDates.length; i += 1) {
    const d = localDates[i];
    if (!d || d >= cutoff) continue;
    if (localMessagesForDay(d).length > 0) return true;
  }

  const remoteDates = await listRemoteKentuChatDates(uid);
  return remoteDates.some((d) => d && d < cutoff);
}

/**
 * Recupera il blocco più recente precedente a `beforeDate`.
 * @returns {Promise<{ date: string, messages: object[] } | null>}
 */
export async function loadPreviousKentuChatDay({ uid, beforeDate } = {}) {
  const cutoff = String(beforeDate || '').slice(0, 10);
  if (!cutoff) return null;

  let remoteDates = [];
  try {
    remoteDates = await listRemoteKentuChatDates(uid);
  } catch {
    remoteDates = [];
  }

  const candidates = [...new Set([...listLocalKentuChatDates(), ...remoteDates])]
    .filter((d) => d && d < cutoff)
    .sort()
    .reverse();

  for (let i = 0; i < candidates.length; i += 1) {
    const dateStr = candidates[i];
    const local = localMessagesForDay(dateStr);
    if (local.length > 0) return { date: dateStr, messages: local };
    const remote = await fetchRemoteKentuChatDay({ uid, dateStr });
    if (remote?.length) return { date: dateStr, messages: remote };
  }

  return null;
}
