/**
 * Presentazione anello header da Health Score globale (`healthScore.score`).
 * Stessa SSOT del prompt AI (Avatar_Symbiosis / REQUEST_HEALTH_DIAGNOSIS).
 * Nessun calcolo kcal locale.
 */

export const VITALITY_BAND = Object.freeze({
  FULL: 'full',
  FOCUS: 'focus',
  DEFICIT: 'deficit',
});

export const VITALITY_STATES = Object.freeze({
  [VITALITY_BAND.FULL]: Object.freeze({
    band: VITALITY_BAND.FULL,
    min: 75,
    ringColor: '#22d3ee',
    ringClass: 'stroke-cyan-400',
    textClass: 'text-cyan-400/90',
    phrase: 'Assetto ottimale. Sistemi a pieno regime.',
  }),
  [VITALITY_BAND.FOCUS]: Object.freeze({
    band: VITALITY_BAND.FOCUS,
    min: 40,
    ringColor: '#fbbf24',
    ringClass: 'stroke-amber-400',
    textClass: 'text-amber-400/90',
    phrase: 'Modalità operativa. Mantieni la traiettoria.',
  }),
  [VITALITY_BAND.DEFICIT]: Object.freeze({
    band: VITALITY_BAND.DEFICIT,
    min: 0,
    ringColor: '#f43f5e',
    ringClass: 'stroke-rose-500',
    textClass: 'text-rose-500/90',
    phrase: 'Fatica sistemica o deficit. Priorità al recupero.',
  }),
});

/**
 * Clamp 0–100 del punteggio globale Health Score.
 * @param {unknown} raw
 * @returns {number}
 */
export function clampHealthScore(raw) {
  const n = Math.round(Number(raw) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Estrae lo score 0–100 dalla SSOT Health Score (oggetto o numero).
 * @param {unknown} healthScore
 * @returns {number}
 */
export function readGlobalHealthScore(healthScore) {
  if (healthScore == null) return 0;
  if (typeof healthScore === 'number') return clampHealthScore(healthScore);
  if (typeof healthScore !== 'object') return 0;
  return clampHealthScore(
    healthScore.score
    ?? healthScore.dailyScore
    ?? healthScore.value,
  );
}

/**
 * @param {number} score
 * @returns {{ band: string, min: number, ringColor: string, ringClass: string, textClass: string, phrase: string, score: number }}
 */
export function resolveVitalityPresentation(score) {
  const n = clampHealthScore(score);
  if (n >= 75) return { ...VITALITY_STATES[VITALITY_BAND.FULL], score: n };
  if (n >= 40) return { ...VITALITY_STATES[VITALITY_BAND.FOCUS], score: n };
  return { ...VITALITY_STATES[VITALITY_BAND.DEFICIT], score: n };
}

/**
 * Snapshot UI anello + frase, dal punteggio Health Score (non da kcal ingestite).
 * `strokeDashoffset` è su pathLength=100 → `100 - score`.
 * @param {unknown} rawScore
 */
export function buildVitalityIndexFromScore(rawScore) {
  const score = clampHealthScore(rawScore);
  const presentation = resolveVitalityPresentation(score);
  return {
    score,
    ...presentation,
    strokeDashoffset: 100 - score,
  };
}
