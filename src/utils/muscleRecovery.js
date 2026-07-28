/**
 * Calcola lo stimolo muscolare residuo su una finestra di recupero lineare.
 *
 * @param {number|string|Date|null|undefined} completedAt
 * @param {number} [hoursToRecover=72]
 * @returns {number} 0–100
 */
export function calculateStimulusDecay(completedAt, hoursToRecover = 72) {
  const completedMs = new Date(completedAt).getTime();
  const recoveryHours = Number(hoursToRecover);
  if (!Number.isFinite(completedMs) || !Number.isFinite(recoveryHours) || recoveryHours <= 0) {
    return 0;
  }

  const elapsedMs = Math.max(0, Date.now() - completedMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours >= recoveryHours) return 0;

  const remainingRatio = 1 - (elapsedHours / recoveryHours);
  return Math.max(0, Math.min(100, Math.round(remainingRatio * 100)));
}

export default calculateStimulusDecay;
