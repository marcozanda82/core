/**
 * Path RTDB utente usati da Focus (accessi puntuali, nessuna scansione globale).
 * Derivati dal codice app (profile_targets, body_metrics) — non inventati.
 */

export function profileTargetsPath(uid) {
  return `users/${String(uid).trim()}/profile_targets`;
}

export function bodyMetricsRootPath(uid) {
  return `users/${String(uid).trim()}/body_metrics`;
}
