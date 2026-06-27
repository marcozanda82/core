/**
 * Layout timeline giornata 0–24h: posizione oraria come percentuale larghezza (0–100).
 */
export function getTimePositionPercent(time) {
  return (time / 24) * 100;
}

/** Allineati a margin.left + YAxis dei ComposedChart Recharts (stessa colonna dati 0–24h). */
export const CHART_AXIS_GUTTER_LEFT_PX = 35;
export const CHART_AXIS_GUTTER_RIGHT_PX = 0;

const NOW_VERTICAL_LINE_GLOW =
  '0 0 4px rgba(0, 229, 255, 0.95), 0 0 10px rgba(0, 229, 255, 0.55), 0 0 18px rgba(255, 255, 255, 0.12)';

/** Ora locale 0–24 con minuti in frazione (stessa formula per grafico e timeline). */
export function getWallClockDecimalHour(d = new Date()) {
  return d.getHours() + d.getMinutes() / 60;
}

const ENERGY_RED = [239, 68, 68];
const ENERGY_YELLOW = [234, 179, 8];
const ENERGY_GREEN = [34, 197, 94];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Energia 0–100 → rgba (basso rosso, medio giallo, alto verde). */
export function energyToStripRgba(energy0to100, alpha = 0.2) {
  const e = Math.max(0, Math.min(100, Number(energy0to100)));
  if (!Number.isFinite(e)) return `rgba(60,60,60,${alpha * 0.5})`;
  const x = e / 100;
  let rgb;
  if (x <= 0.45) {
    rgb = lerpRgb(ENERGY_RED, ENERGY_YELLOW, x / 0.45);
  } else {
    rgb = lerpRgb(ENERGY_YELLOW, ENERGY_GREEN, (x - 0.45) / 0.55);
  }
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha})`;
}

/**
 * Gradiente orizzontale sotto la timeline da punti { time, energy } (time in ore 0–24).
 * Ritorna stringa `linear-gradient` o null se dati insufficienti.
 */
export function buildTimelineEnergyStripGradient(series, alpha = 0.18) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const pts = series
    .map((p) => {
      const t = p?.time ?? p?.hour;
      const time = typeof t === 'number' && Number.isFinite(t) ? Math.max(0, Math.min(24, t)) : null;
      const en = p?.energy;
      const energy = typeof en === 'number' && Number.isFinite(en) ? Math.max(0, Math.min(100, en)) : null;
      return time != null && energy != null ? { time, energy } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
  if (pts.length === 0) return null;
  const norm = [...pts];
  if (norm[0].time > 0.01) {
    norm.unshift({ time: 0, energy: norm[0].energy });
  }
  const last = norm[norm.length - 1];
  if (last.time < 23.99) {
    norm.push({ time: 24, energy: last.energy });
  }
  const stops = norm.map((p) => {
    const pos = getTimePositionPercent(p.time);
    return `${energyToStripRgba(p.energy, alpha)} ${pos}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
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

/** Arrotonda ora decimale 0–24 al quarto d'ora più vicino (Kentu Timeline). */
export function snapDecimalHourToQuarter(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return null;
  return Math.max(0, Math.min(24, Math.round(h * 4) / 4));
}

/** Pointer X su barra 0–24h → ora decimale arrotondata a 15 min. */
export function computeHourFromTimelinePointer(clientX, rect) {
  if (!rect || !(rect.width > 0)) return null;
  const x = Number(clientX) - rect.left;
  const ratio = Math.max(0, Math.min(1, x / rect.width));
  return snapDecimalHourToQuarter(ratio * 24);
}
