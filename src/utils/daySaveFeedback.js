/**
 * Avvisi salvataggio giorno (rev / permesso / offline).
 * Bus leggero: host UI si registra, writer/sync pubblicano.
 */

/** @typedef {'conflict' | 'permission' | 'offline' | 'outdated' | 'unknown'} DaySaveFailureKind */

/** @type {Set<(payload: object) => void>} */
const listeners = new Set();

/**
 * @param {(payload: {
 *   kind: DaySaveFailureKind,
 *   message: string,
 *   dateStr?: string|null,
 *   feature?: string|null,
 *   unsavedIds?: string[],
 * }) => void} listener
 */
export function subscribeDaySaveFeedback(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * @param {{
 *   kind: DaySaveFailureKind,
 *   message?: string,
 *   dateStr?: string|null,
 *   feature?: string|null,
 *   unsavedIds?: string[],
 * }} payload
 */
export function publishDaySaveFailure(payload) {
  const kind = payload?.kind || 'unknown';
  const message = String(payload?.message || userMessageForDaySaveFailure(kind)).trim();
  const event = {
    kind,
    message,
    dateStr: payload?.dateStr || null,
    feature: payload?.feature || null,
    unsavedIds: Array.isArray(payload?.unsavedIds) ? payload.unsavedIds.map(String) : [],
    at: Date.now(),
  };
  listeners.forEach((fn) => {
    try { fn(event); } catch { /* ignore */ }
  });
  return event;
}

/**
 * @param {DaySaveFailureKind} kind
 */
export function userMessageForDaySaveFailure(kind) {
  if (kind === 'outdated' || kind === 'permission') {
    return 'Aggiorna Kentu per continuare a registrare';
  }
  if (kind === 'offline') {
    return 'Non salvato: sei offline. Riprova quando torna la connessione.';
  }
  if (kind === 'conflict') {
    return 'Non salvato: conflitto di versione. Riprova.';
  }
  return 'Non salvato: aggiorna l\'app / riprova';
}
