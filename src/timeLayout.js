/**
 * Layout timeline giornata 0–24h: posizione oraria come percentuale larghezza (0–100).
 */
export function getTimePositionPercent(time) {
  return (time / 24) * 100;
}

/** Allineati a margin.left + YAxis dei ComposedChart Recharts (stessa colonna dati 0–24h). */
export const CHART_AXIS_GUTTER_LEFT_PX = 50;
export const CHART_AXIS_GUTTER_RIGHT_PX = 15;

const NOW_VERTICAL_LINE_GLOW =
  '0 0 4px rgba(0, 229, 255, 0.95), 0 0 10px rgba(0, 229, 255, 0.55), 0 0 18px rgba(255, 255, 255, 0.12)';

/** Ora locale 0–24 con minuti in frazione (stessa formula per grafico e timeline). */
export function getWallClockDecimalHour(d = new Date()) {
  return d.getHours() + d.getMinutes() / 60;
}

/**
 * Posizione linea verticale sul grafico a larghezza cella zoom: allineata alla fascia timeline
 * (area utile tra gutter L/R, come `getTimePositionPercent` sul contenitore della timeline).
 */
export function getNowVerticalLineBarStyle(hour) {
  const f = Math.max(0, Math.min(1, Number(hour) / 24));
  const L = CHART_AXIS_GUTTER_LEFT_PX;
  const R = CHART_AXIS_GUTTER_RIGHT_PX;
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `calc(${L}px + (100% - ${L + R}px) * ${f})`,
    width: '1px',
    transform: 'translateX(-50%)',
    background:
      'linear-gradient(180deg, rgba(224,252,255,0.35) 0%, rgba(0,229,255,0.95) 45%, rgba(0,229,255,0.95) 55%, rgba(224,252,255,0.25) 100%)',
    boxShadow: NOW_VERTICAL_LINE_GLOW,
    pointerEvents: 'none',
    zIndex: 5,
  };
}

/** Temporary: griglia 6h per verifica allineamento grafico ↔ timeline. Rimuovere dopo debug. */
export const DEBUG_TIME_GRID_HOURS = [0, 6, 12, 18, 24];

export function getDebugGridLineChartStyle(hour) {
  const f = Math.max(0, Math.min(1, Number(hour) / 24));
  const L = CHART_AXIS_GUTTER_LEFT_PX;
  const R = CHART_AXIS_GUTTER_RIGHT_PX;
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `calc(${L}px + (100% - ${L + R}px) * ${f})`,
    width: 0,
    borderLeft: '1px dashed rgba(255, 140, 0, 0.9)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: 6,
  };
}

export function getDebugGridLineTimelineStyle(hour) {
  const t = Math.max(0, Math.min(24, Number(hour)));
  return {
    position: 'absolute',
    left: `${getTimePositionPercent(t)}%`,
    top: 0,
    bottom: 0,
    width: 0,
    borderLeft: '1px dashed rgba(255, 140, 0, 0.9)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: 2,
  };
}
