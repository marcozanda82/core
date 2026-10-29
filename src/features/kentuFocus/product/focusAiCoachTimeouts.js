/**
 * Timeout client Focus AI coach — allineati al vincolo CF callGemini (120s)
 * e a httpsCallable({ timeout: 120_000 }).
 *
 * Diagnosi (repo):
 * - askAI default: ASK_AI_TIMEOUT_MS = 30_000
 * - functions callGemini: runWith({ timeoutSeconds: 120 })
 * - httpsCallable: timeout esplicito 120s (default SDK era 70s → deadline-exceeded)
 */

/** @type {Readonly<{ ieri: number, settimana: number, mese: number, default: number }>} */
export const FOCUS_AI_COACH_TIMEOUT_MS = Object.freeze({
  ieri: 95_000,
  settimana: 105_000,
  mese: 110_000,
  default: 95_000,
});

/** Sotto il tetto CF/callable (120s) con margine. */
export const FOCUS_AI_COACH_TIMEOUT_MS_CAP = 115_000;

/** Tempo minimo residuo per tentare un retry Gemini. */
export const FOCUS_AI_COACH_RETRY_MIN_REMAINING_MS = 35_000;

/**
 * @param {string|null|undefined} periodId
 * @returns {number}
 */
export function resolveFocusAiCoachTimeoutMs(periodId) {
  const p = String(periodId || '').toLowerCase();
  const raw = FOCUS_AI_COACH_TIMEOUT_MS[p] ?? FOCUS_AI_COACH_TIMEOUT_MS.default;
  return Math.min(Math.max(10_000, raw), FOCUS_AI_COACH_TIMEOUT_MS_CAP);
}
