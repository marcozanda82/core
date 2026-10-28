/**
 * Timeout client Focus AI coach — allineati al vincolo CF callGemini.
 *
 * Budget osservato (2026-10-28, diario reale 2026-10-27):
 * - OFF wait ≈ 0–2s (max 8s)
 * - build dossier ≈ 17–19s (foodQuality + cataloghi)
 * - Gemini sul prompt ~95k char ≈ 35–55s+
 * - un retry richiede ancora margine
 *
 * Diagnosi (repo):
 * - askAI default: ASK_AI_TIMEOUT_MS = 30_000
 * - functions callGemini: runWith({ timeoutSeconds: 180 })
 * - httpsCallable non è abortabile: dopo timeout client la CF può continuare.
 */

/** @type {Readonly<{ ieri: number, settimana: number, mese: number, default: number }>} */
export const FOCUS_AI_COACH_TIMEOUT_MS = Object.freeze({
  // Solo la chiamata Gemini (OFF + dossier sono fuori da questo budget)
  ieri: 95_000,
  settimana: 110_000,
  mese: 130_000,
  default: 95_000,
});

/** Sotto il tetto CF (180s) con margine per overhead callable. */
export const FOCUS_AI_COACH_TIMEOUT_MS_CAP = 160_000;

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
