/**
 * Layout timeline giornata 0–24h: posizione oraria come percentuale larghezza (0–100).
 */
export function getTimePositionPercent(time) {
  return (time / 24) * 100;
}

/** Allineati a margin.left + YAxis dei ComposedChart Recharts (stessa colonna dati 0–24h). */
export const CHART_AXIS_GUTTER_LEFT_PX = 50;
export const CHART_AXIS_GUTTER_RIGHT_PX = 15;
