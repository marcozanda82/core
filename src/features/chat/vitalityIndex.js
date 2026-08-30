/**
 * Presentazione anello header da Health Score globale (`healthScore.score`).
 * Stessa SSOT del prompt AI (Avatar_Symbiosis / REQUEST_HEALTH_DIAGNOSIS).
 */

export const VITALITY_RING_RADIUS = 45;
export const VITALITY_RING_CIRCUMFERENCE = 2 * Math.PI * VITALITY_RING_RADIUS;

export const VITALITY_BAND = Object.freeze({
  FULL: 'full',
  FOCUS: 'focus',
  DEFICIT: 'deficit',
});

export const VITALITY_STATES = Object.freeze({
  [VITALITY_BAND.FULL]: Object.freeze({
    band: VITALITY_BAND.FULL,
    min: 75,
    ringColor: '#06b6d4',
    phrase: 'Assetto ottimale. Sistemi a pieno regime.',
  }),
  [VITALITY_BAND.FOCUS]: Object.freeze({
    band: VITALITY_BAND.FOCUS,
    min: 50,
    ringColor: '#f59e0b',
    phrase: 'Modalità operativa. Mantieni la traiettoria.',
  }),
  [VITALITY_BAND.DEFICIT]: Object.freeze({
    band: VITALITY_BAND.DEFICIT,
    min: 0,
    ringColor: '#ef4444',
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
 * @param {number} score
 * @returns {{ band: string, min: number, ringColor: string, phrase: string, score: number }}
 */
export function resolveVitalityPresentation(score) {
  const n = clampHealthScore(score);
  if (n >= 75) return { ...VITALITY_STATES[VITALITY_BAND.FULL], score: n };
  if (n >= 50) return { ...VITALITY_STATES[VITALITY_BAND.FOCUS], score: n };
  return { ...VITALITY_STATES[VITALITY_BAND.DEFICIT], score: n };
}

/**
 * Snapshot UI anello + frase, dal punteggio Health Score (non da kcal ingestite).
 * @param {unknown} rawScore
 */
export function buildVitalityIndexFromScore(rawScore) {
  const score = clampHealthScore(rawScore);
  const presentation = resolveVitalityPresentation(score);
  const circumference = VITALITY_RING_CIRCUMFERENCE;
  return {
    score,
    ...presentation,
    circumference,
    strokeDashoffset: circumference - (circumference * score) / 100,
  };
}
