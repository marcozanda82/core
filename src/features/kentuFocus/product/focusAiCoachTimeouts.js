/**
 * Timeout client Focus AI coach — allineati al vincolo CF callGemini (120s),
 * non al default askAI generico (30s) che fa scadere settimana/mese troppo presto.
 *
 * Diagnosi (repo):
 * - askAI default: ASK_AI_TIMEOUT_MS = 30_000
 * - functions callGemini: runWith({ timeoutSeconds: 120 })
 * - httpsCallable non è abortabile: dopo timeout client la CF può continuare.
 */

/** @type {Readonly<{ ieri: number, settimana: number, mese: number, default: number }>} */
export const FOCUS_AI_COACH_TIMEOUT_MS = Object.freeze({
  ieri: 55_000,
  settimana: 75_000,
  mese: 90_000,
  default: 60_000,
});

/** Sotto il tetto CF (120s) con margine. */
export const FOCUS_AI_COACH_TIMEOUT_MS_CAP = 100_000;

/**
 * @param {string|null|undefined} periodId
 * @returns {number}
 */
export function resolveFocusAiCoachTimeoutMs(periodId) {
  const p = String(periodId || '').toLowerCase();
  const raw = FOCUS_AI_COACH_TIMEOUT_MS[p] ?? FOCUS_AI_COACH_TIMEOUT_MS.default;
  return Math.min(Math.max(10_000, raw), FOCUS_AI_COACH_TIMEOUT_MS_CAP);
}
