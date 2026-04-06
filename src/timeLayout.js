/**
 * Layout timeline giornata 0–24h: posizione oraria come percentuale larghezza (0–100).
 */
export function getTimePositionPercent(time) {
  return (time / 24) * 100;
}
