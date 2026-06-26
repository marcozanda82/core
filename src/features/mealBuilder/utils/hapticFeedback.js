/**
 * Breve impulso tattile per conferme su mobile (stile tap nativo iOS/Android).
 * @param {number} [durationMs=15]
 */
export function triggerSelectionHaptic(durationMs = 15) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  navigator.vibrate(durationMs);
}
