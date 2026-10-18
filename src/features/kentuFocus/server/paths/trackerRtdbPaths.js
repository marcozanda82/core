/**
 * Path RTDB tracker (Admin reader) — nessuna scansione di users/{uid} intero.
 */

export const TRACKER_STORICO_PREFIX = 'trackerStorico_';

/** Massimo storico esplicito per Focus (allineato a d90). */
export const FOCUS_TRACKER_MAX_HISTORY_DAYS = 90;

/**
 * @param {string} dateStr YYYY-MM-DD
 */
export function trackerStoricoKey(dateStr) {
  return `${TRACKER_STORICO_PREFIX}${dateStr}`;
}

/**
 * @param {string} uid
 */
export function trackerDataRootPath(uid) {
  return `users/${String(uid).trim()}/tracker_data`;
}

/**
 * @param {string} uid
 * @param {string} dateStr
 */
export function trackerDayPath(uid, dateStr) {
  return `${trackerDataRootPath(uid)}/${trackerStoricoKey(dateStr)}`;
}
