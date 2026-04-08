/**
 * Modello vettoriale della direzione metabolica (solo matematica, nessuna UI).
 *
 * @param {number} kcalBalance kcal assunte − target kcal
 * @param {number} trainingLoad carico allenamento 0–100
 * @returns {{ angle: number, magnitude: number }}
 *   angle in gradi (atan2), magnitude in [0, 1]
 */
export function computeMetabolicDirection(kcalBalance, trainingLoad) {
  const x = clamp(kcalBalance / 500, -1, 1);
  const y = clamp(trainingLoad / 100, 0, 1);

  const angle = Math.atan2(y, x) * (180 / Math.PI);
  const rawMag = Math.sqrt(x * x + y * y);
  const magnitude = clamp(rawMag, 0, 1);

  return { angle, magnitude };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
