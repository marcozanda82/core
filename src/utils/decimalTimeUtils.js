/** Ora decimale corrente arrotondata al quarto d'ora più vicino (0.25 h). */
export function getCurrentTimeRoundedTo15Min(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  const decimal = h + m / 60;
  return Math.min(24, Math.max(0, Math.round(decimal * 4) / 4));
}
