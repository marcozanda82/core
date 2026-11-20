/**
 * Timeout client Focus AI coach (generazione background).
 * Allineati a CLIENT_GEMINI_BACKGROUND_TIMEOUT_MS (90s) in aiService.js:
 * il rapporto non blocca chat/matchmaker (15s), ma ha spazio per Gemini.
 *
 * Non importare aiService qui (Firebase): i test Node usano questi numeri.
 */

/** Tetto background Gemini (ms) — = CLIENT_GEMINI_BACKGROUND_TIMEOUT_MS in aiService.js */
export const FOCUS_CLIENT_GEMINI_TIMEOUT_MS = 90_000;

/** @type {Readonly<{ ieri: number, settimana: number, mese: number, default: number }>} */
export const FOCUS_AI_COACH_TIMEOUT_MS = Object.freeze({
  ieri: FOCUS_CLIENT_GEMINI_TIMEOUT_MS,
  settimana: FOCUS_CLIENT_GEMINI_TIMEOUT_MS,
  mese: FOCUS_CLIENT_GEMINI_TIMEOUT_MS,
  default: FOCUS_CLIENT_GEMINI_TIMEOUT_MS,
});

/** Tetto = tetto askAI background. */
export const FOCUS_AI_COACH_TIMEOUT_MS_CAP = FOCUS_CLIENT_GEMINI_TIMEOUT_MS;

/** Tempo minimo residuo per tentare un retry Gemini (sotto il tetto). */
export const FOCUS_AI_COACH_RETRY_MIN_REMAINING_MS = 15_000;

/**
 * @param {string|null|undefined} periodId
 * @returns {number}
 */
export function resolveFocusAiCoachTimeoutMs(periodId) {
  const p = String(periodId || '').toLowerCase();
  const raw = FOCUS_AI_COACH_TIMEOUT_MS[p] ?? FOCUS_AI_COACH_TIMEOUT_MS.default;
  return Math.min(Math.max(10_000, raw), FOCUS_AI_COACH_TIMEOUT_MS_CAP);
}
