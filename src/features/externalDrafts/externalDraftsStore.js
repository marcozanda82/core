/**
 * Store delle bozze pasto esterne: un solo ascolto Firebase (bozze `pending`),
 * letto dalle superfici Inbox senza passare props attraverso l'albero.
 */

import { useSyncExternalStore } from 'react';
import {
  equalTo,
  onValue,
  orderByChild,
  query,
  ref,
  update,
} from 'firebase/database';
import {
  externalMealDraftsPath,
  summarizeExternalMealDrafts,
} from './externalMealDrafts.js';

const EMPTY_SUMMARY = Object.freeze({ blocks: [], otherDays: [], totalPending: 0 });

let pendingNode = null;
let viewDate = '';
let summary = EMPTY_SUMMARY;
let session = null;
let openDateHandler = null;
const listeners = new Set();

function recompute() {
  summary = pendingNode ? summarizeExternalMealDrafts(pendingNode, viewDate) : EMPTY_SUMMARY;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return summary;
}

/**
 * Avvia l'ascolto delle bozze esterne in attesa. Restituisce la funzione di stop.
 * @param {{ db: import('firebase/database').Database, uid: string }} deps
 */
export function startExternalDraftsSync({ db, uid }) {
  const id = String(uid || '').trim();
  if (!db || !id) return () => {};
  if (session?.uid === id) return session.stop;
  session?.stop();

  const pendingQuery = query(
    ref(db, externalMealDraftsPath(id)),
    orderByChild('status'),
    equalTo('pending'),
  );
  const unsubscribe = onValue(
    pendingQuery,
    (snap) => {
      pendingNode = snap.val() || null;
      recompute();
    },
    (error) => {
      console.warn('[externalDrafts] listener error', error?.code || error?.message || error);
      pendingNode = null;
      recompute();
    },
  );
  const current = {
    uid: id,
    db,
    stop: () => {
      unsubscribe();
      if (session === current) {
        session = null;
        pendingNode = null;
        recompute();
      }
    },
  };
  session = current;
  return current.stop;
}

export function setExternalDraftsViewDate(date) {
  const next = String(date || '').trim();
  if (next === viewDate) return;
  viewDate = next;
  recompute();
}

/** SalaComandi registra come aprire il diario su un altro giorno. */
export function registerExternalDraftDateNavigator(handler) {
  openDateHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (openDateHandler === handler) openDateHandler = null;
  };
}

export function openExternalDraftDate(date) {
  openDateHandler?.(date);
}

/**
 * Il client può solo chiudere una bozza in attesa: consumed (convalidata) o deleted.
 * @param {string} draftId
 * @param {'consumed'|'deleted'} status
 */
export async function markExternalDraftStatus(draftId, status) {
  const id = String(draftId || '').trim();
  if (!id || !session?.db || !session?.uid) return false;
  if (status !== 'consumed' && status !== 'deleted') return false;
  const stampKey = status === 'consumed' ? 'consumedAt' : 'deletedAt';
  // Uscita ottimistica dall'Inbox: il listener confermerà.
  const removed = pendingNode?.[id] || null;
  if (removed) {
    const { [id]: _removed, ...rest } = pendingNode;
    pendingNode = Object.keys(rest).length > 0 ? rest : null;
    recompute();
  }
  try {
    await update(ref(session.db, `${externalMealDraftsPath(session.uid)}/${id}`), {
      status,
      [stampKey]: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn('[externalDrafts] status update failed', error?.code || error?.message || error);
    if (removed) {
      pendingNode = { ...(pendingNode || {}), [id]: removed };
      recompute();
    }
    return false;
  }
}

/** Bozze esterne del giorno aperto + contatore delle bozze in altri giorni. */
export function useExternalMealDrafts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
