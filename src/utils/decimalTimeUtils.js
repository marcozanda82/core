/** Ora decimale corrente (minuti esatti, senza arrotondamento). */
export function getCurrentTimeDecimal(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  return Math.min(24, Math.max(0, h + m / 60 + s / 3600));
}

/** Ora decimale corrente arrotondata al quarto d'ora più vicino (0.25 h). */
export function getCurrentTimeRoundedTo15Min(now = new Date()) {
  const decimal = getCurrentTimeDecimal(now);
  return Math.min(24, Math.max(0, Math.round(decimal * 4) / 4));
}

/**
 * Ora di fine default per nuovo allenamento: adesso + durata (inizio = adesso).
 * @param {Date} [now]
 * @param {number} [durationMin]
 */
export function getDefaultWorkoutEndTimeDecimal(now = new Date(), durationMin = 30) {
  const start = getCurrentTimeDecimal(now);
  const durationHours = Math.max(0, Number(durationMin) || 0) / 60;
  return Math.min(24, start + durationHours);
}
