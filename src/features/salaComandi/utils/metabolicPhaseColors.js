import { TRACKER_STORICO_KEY, normalizeLogData } from '../../../coreEngine';
import { parseDecimalHourFromValue } from './mealConsumedTime';
import { resolvePhaseColorForHoursSinceMeal } from './metabolicPhaseConfig';

export const METABOLIC_PHASE_COLORS = Object.freeze({
  digestiva: '#22d3ee',
  stabilita: '#facc15',
  adrenergico: '#f97316',
  autofagia: '#a855f7',
  default: '#4ade80',
});

/** Legenda «Pillola Spettro» — ordine timeline digiuno (sinistra → destra). */
export const METABOLIC_PHASE_LEGEND = Object.freeze([
  {
    id: 'digestiva',
    label: 'Digestione',
    rangeLabel: '<4h',
    icon: '🥗',
    color: METABOLIC_PHASE_COLORS.digestiva,
  },
  {
    id: 'stabilita',
    label: 'Stabilità',
    rangeLabel: '4–12h',
    icon: '⚡',
    color: METABOLIC_PHASE_COLORS.stabilita,
  },
  {
    id: 'adrenergico',
    label: 'Adrenergico',
    rangeLabel: '12–16h',
    icon: '🧠',
    color: METABOLIC_PHASE_COLORS.adrenergico,
  },
  {
    id: 'autofagia',
    label: 'Autofagia',
    rangeLabel: '>16h',
    icon: '🛠️',
    color: METABOLIC_PHASE_COLORS.autofagia,
  },
]);

/**
 * Id fase metabolica attiva da ore di digiuno (allineato a resolveMetabolicColorForHoursFasted).
 * @param {number | null | undefined} hoursFasted
 */
export function resolveMetabolicPhaseId(hoursFasted) {
  const raw = hoursFasted;
  if (raw == null || raw === '') return 'digestiva';
  const h = Number(raw);
  if (!Number.isFinite(h) || Number.isNaN(h) || h < 0) return 'digestiva';
  if (h >= 16) return 'autofagia';
  if (h >= 12) return 'adrenergico';
  if (h >= 4) return 'stabilita';
  return 'digestiva';
}

/**
 * Colore fase metabolica da ore di digiuno.
 * @param {number | null | undefined} hoursFasted
 */
export function resolveMetabolicColorForHoursFasted(hoursFasted) {
  const raw = hoursFasted;
  if (raw == null || raw === '') {
    return resolvePhaseColorForHoursSinceMeal(0);
  }
  const h = Number(raw);
  if (!Number.isFinite(h) || Number.isNaN(h) || h < 0) {
    return resolvePhaseColorForHoursSinceMeal(0);
  }
  return resolvePhaseColorForHoursSinceMeal(h);
}

const MEAL_HOUR_EPS = 0.002;
const MEAL_TYPES = new Set(['food', 'recipe', 'ghost_meal']);

/** Soglia tolleranza metabolica: sotto questi valori il pasto non interrompe il digiuno. */
const FASTING_BREAK_THRESHOLDS = Object.freeze({
  kcal: 10,
  carbs: 1,
  protein: 1,
});

function readItemKcal(item) {
  const n = Number(item?.kcal ?? item?.cal ?? item?.calories ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readItemCarbs(item) {
  const n = Number(item?.carb ?? item?.carbs ?? item?.carboidrati ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readItemProtein(item) {
  const n = Number(item?.prot ?? item?.protein ?? item?.proteine ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pasto che interrompe il digiuno (supera soglia fisiologica trascurabile).
 * @param {object | null | undefined} item
 * @returns {boolean}
 */
export function isFastingBreakerLogItem(item) {
  if (!isMealLikeLogItem(item)) return false;
  const kcal = readItemKcal(item);
  const carbs = readItemCarbs(item);
  const protein = readItemProtein(item);
  return (
    kcal > FASTING_BREAK_THRESHOLDS.kcal
    || carbs > FASTING_BREAK_THRESHOLDS.carbs
    || protein > FASTING_BREAK_THRESHOLDS.protein
  );
}

function normalizeMealHour(hour) {
  if (typeof hour !== 'number' || !Number.isFinite(hour)) return null;
  return Math.round(Math.max(0, Math.min(24, hour)) * 120) / 120;
}

function uniqueSortedMealHours(times) {
  return [...new Set(times.map(normalizeMealHour).filter((t) => t != null))].sort((a, b) => a - b);
}

function isMealLikeLogItem(item) {
  return item && MEAL_TYPES.has(item.type);
}

function hourToOffsetPct(hour, domainStart, offsetDomainEnd) {
  const span = offsetDomainEnd - domainStart;
  if (span <= 0) return '0%';
  const pct = ((hour - domainStart) / span) * 100;
  return `${Math.max(0, Math.min(100, pct)).toFixed(4)}%`;
}

function mergeGradientStops(stops) {
  const byOffset = new Map();
  for (const stop of stops) {
    if (!stop?.offset || !stop?.color) continue;
    byOffset.set(stop.offset, stop.color);
  }
  return [...byOffset.entries()]
    .map(([offset, color]) => ({ offset, color }))
    .sort((a, b) => parseFloat(a.offset) - parseFloat(b.offset));
}

/**
 * Orario pasto allineato a fastingData: mealTime sul log ha priorità sullo slot mealTimes.
 * @param {object} item
 * @param {object | undefined} mealTimesObj
 */
export function resolveMealTimeFromLogItem(item, mealTimesObj) {
  if (!isMealLikeLogItem(item)) return null;
  const fromMeal =
    parseDecimalHourFromValue(item.mealTime)
    ?? parseDecimalHourFromValue(item.time);
  if (fromMeal != null) return normalizeMealHour(fromMeal);
  const slot = mealTimesObj?.[item.mealType];
  if (slot != null) {
    const fromSlot = parseDecimalHourFromValue(slot);
    if (fromSlot != null) return normalizeMealHour(fromSlot);
  }
  return null;
}

function getYesterdayDateStr(referenceDateObj, anchorDate) {
  if (referenceDateObj instanceof Date && !Number.isNaN(referenceDateObj.getTime())) {
    const yesterdayObj = new Date(referenceDateObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const offset = yesterdayObj.getTimezoneOffset() * 60000;
    return new Date(yesterdayObj.getTime() - offset).toISOString().slice(0, 10);
  }
  if (anchorDate) {
    const yesterdayObj = new Date(`${anchorDate}T12:00:00`);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    return yesterdayObj.toISOString().slice(0, 10);
  }
  return null;
}

function getYesterdayLastMealTime(fullHistory, referenceDateObj, anchorDate) {
  if (!fullHistory) return null;
  const yesterdayStr = getYesterdayDateStr(referenceDateObj, anchorDate);
  if (!yesterdayStr) return null;
  const yesterdayNode = fullHistory[TRACKER_STORICO_KEY(yesterdayStr)];
  if (!yesterdayNode?.log) return null;
  const yesterdayLog = normalizeLogData(
    Array.isArray(yesterdayNode.log) ? yesterdayNode.log : Object.values(yesterdayNode.log),
  );
  let maxYestTime = -1;
  yesterdayLog
    .filter((i) => isFastingBreakerLogItem(i))
    .forEach((m) => {
      const t = yesterdayNode.mealTimes?.[m.mealType] ?? m.mealTime ?? 20;
      if (typeof t === 'number' && t > maxYestTime) maxYestTime = t;
    });
  return maxYestTime >= 0 ? maxYestTime : null;
}

/**
 * Ore digiuno a un'ora di riferimento (0–24). Stessa logica di fastingData.
 * @param {number} referenceHour
 * @param {Array} activeLog
 * @param {{ fullHistory?: object, anchorDate?: string, mealTimesObj?: object, referenceDateObj?: Date }} [options]
 */
export function computeHoursFastedAtHour(referenceHour, activeLog, options = {}) {
  const { fullHistory, anchorDate, mealTimesObj, referenceDateObj } = options;
  const hour =
    typeof referenceHour === 'number' && Number.isFinite(referenceHour)
      ? Math.max(0, Math.min(24, referenceHour))
      : 0;

  const todayMealTimes = (activeLog || [])
    .filter((i) => isFastingBreakerLogItem(i))
    .map((i) => resolveMealTimeFromLogItem(i, mealTimesObj))
    .filter((t) => t != null && t <= hour + MEAL_HOUR_EPS);

  if (todayMealTimes.length > 0) {
    const lastMealTime = Math.max(...todayMealTimes);
    return Math.max(0, hour - lastMealTime);
  }

  const yesterdayLastMealTime = getYesterdayLastMealTime(fullHistory, referenceDateObj, anchorDate);
  if (yesterdayLastMealTime != null) {
    return Math.max(0, (24 - yesterdayLastMealTime) + hour);
  }
  return 0;
}

/**
 * Ore digiuno in un punto orario della timeline 0–24h.
 * @param {number} hour
 * @param {number[]} todayMealTimes
 * @param {number | null} yesterdayLastMealTime
 */
export function hoursFastedAtTimelineHour(hour, todayMealTimes = [], yesterdayLastMealTime = null) {
  const mealsBefore = (todayMealTimes || []).filter((t) => t <= hour + MEAL_HOUR_EPS);
  if (mealsBefore.length > 0) {
    return Math.max(0, hour - mealsBefore[mealsBefore.length - 1]);
  }
  if (yesterdayLastMealTime != null && Number.isFinite(yesterdayLastMealTime)) {
    return Math.max(0, (24 - yesterdayLastMealTime) + hour);
  }
  return 0;
}

/**
 * Pasti del giorno + ultimo pasto di ieri (carry-over notturno).
 * @param {Array} activeLog
 * @param {{ fullHistory?: object, anchorDate?: string, mealTimesObj?: object, referenceDateObj?: Date }} options
 */
export function collectMetabolicTimelineMeals(activeLog, options = {}) {
  const { fullHistory, anchorDate, mealTimesObj, referenceDateObj } = options;
  const eventTimes = new Set();

  for (const item of activeLog || []) {
    if (!isFastingBreakerLogItem(item)) continue;
    const resolved = resolveMealTimeFromLogItem(item, mealTimesObj);
    if (resolved != null) eventTimes.add(resolved);
  }

  const todayMealTimes = uniqueSortedMealHours([...eventTimes]);
  const yesterdayLastMealTime = getYesterdayLastMealTime(fullHistory, referenceDateObj, anchorDate);
  return { todayMealTimes, yesterdayLastMealTime };
}

/**
 * Snapshot digiuno + fasi (Body Battery / Energy Arc).
 * @param {Array} activeLog
 * @param {number} referenceHour
 * @param {{ fullHistory?: object, anchorDate?: string, mealTimesObj?: object, referenceDateObj?: Date }} [options]
 */
export function buildMetabolicFastingSnapshot(activeLog, referenceHour, options = {}) {
  const hoursFasted = computeHoursFastedAtHour(referenceHour, activeLog, options);
  const h = Math.floor(hoursFasted);
  const m = Math.round((hoursFasted - h) * 60);
  const timeString = `${h}h ${m}m`;
  let phaseName = 'ASSORBIMENTO';
  let phaseColor = '#00e676';
  let phaseDesc = 'Digestione attiva • Sintesi glicogeno';
  let progress = Math.min((hoursFasted / 4) * 100, 100);
  if (hoursFasted >= 16) {
    phaseName = 'AUTOFAGIA';
    phaseColor = '#9c27b0';
    phaseDesc = 'Rigenerazione profonda • Pulizia cellulare';
    progress = 100;
  } else if (hoursFasted >= 12) {
    phaseName = 'CHETOSI / LIPOLISI';
    phaseColor = '#ffea00';
    phaseDesc = 'Uso intensivo grassi • Chetoni attivi';
    progress = ((hoursFasted - 12) / 4) * 100;
  } else if (hoursFasted >= 4) {
    phaseName = 'DIGIUNO / CATABOLISMO';
    phaseColor = '#00e5ff';
    phaseDesc = 'Esaurimento scorte • Calo insulina';
    progress = ((hoursFasted - 4) / 8) * 100;
  }
  return { hoursFasted, timeString, phaseName, phaseColor, phaseDesc, progress };
}

/**
 * Stop orizzontali (0–100%) per gradiente SVG lungo asse X del grafico Energia SNC.
 * @param {{ todayMealTimes?: number[], yesterdayLastMealTime?: number | null, domainStart?: number, domainEnd?: number, offsetDomainEnd?: number, sampleStep?: number }} options
 * @param {number} [options.offsetDomainEnd] — larghezza mapping offset (24 = timeline CSS; displayTime = bbox area SVG Recharts)
 */
export function buildMetabolicTimelineGradientStops(options = {}) {
  const {
    todayMealTimes = [],
    yesterdayLastMealTime = null,
    domainStart = 0,
    domainEnd = 24,
    offsetDomainEnd = domainEnd,
    sampleStep = 0.02,
  } = options;

  const domainSpan = domainEnd - domainStart;
  if (domainSpan <= 0) {
    return [
      { offset: '0%', color: METABOLIC_PHASE_COLORS.digestiva },
      { offset: '100%', color: METABOLIC_PHASE_COLORS.digestiva },
    ];
  }

  const meals = uniqueSortedMealHours(todayMealTimes);
  const eventHours = new Set();

  for (let h = domainStart; h <= domainEnd + 1e-9; h += sampleStep) {
    eventHours.add(Math.min(domainEnd, h));
  }

  for (const mealHour of meals) {
    eventHours.add(mealHour);
    eventHours.add(Math.max(domainStart, mealHour - MEAL_HOUR_EPS));
    eventHours.add(Math.min(domainEnd, mealHour + MEAL_HOUR_EPS));
    for (const delta of [2, 6, 12, 16, 24, 48]) {
      const boundary = mealHour + delta;
      if (boundary <= domainEnd + 1e-9) {
        eventHours.add(Math.min(domainEnd, boundary));
        eventHours.add(Math.max(domainStart, boundary - MEAL_HOUR_EPS));
      }
    }
  }

  const sortedEvents = [...eventHours]
    .filter((h) => h >= domainStart - 1e-9 && h <= domainEnd + 1e-9)
    .sort((a, b) => a - b);

  const rawStops = [];
  let prevColor = null;

  for (const h of sortedEvents) {
    const clampedH = Math.max(domainStart, Math.min(domainEnd, h));
    const hoursFasted = hoursFastedAtTimelineHour(clampedH, meals, yesterdayLastMealTime);
    const color = resolveMetabolicColorForHoursFasted(hoursFasted);
    if (color !== prevColor) {
      rawStops.push({
        offset: hourToOffsetPct(clampedH, domainStart, offsetDomainEnd),
        color,
      });
      prevColor = color;
    }
  }

  for (const mealHour of meals) {
    const beforeHour = Math.max(domainStart, mealHour - MEAL_HOUR_EPS);
    const beforeColor = resolveMetabolicColorForHoursFasted(
      hoursFastedAtTimelineHour(beforeHour, meals, yesterdayLastMealTime),
    );
    rawStops.push({
      offset: hourToOffsetPct(beforeHour, domainStart, offsetDomainEnd),
      color: beforeColor,
    });
    rawStops.push({
      offset: hourToOffsetPct(mealHour, domainStart, offsetDomainEnd),
      color: METABOLIC_PHASE_COLORS.digestiva,
    });
    rawStops.push({
      offset: hourToOffsetPct(Math.min(domainEnd, mealHour + MEAL_HOUR_EPS), domainStart, offsetDomainEnd),
      color: METABOLIC_PHASE_COLORS.digestiva,
    });
  }

  const endColor = resolveMetabolicColorForHoursFasted(
    hoursFastedAtTimelineHour(domainEnd, meals, yesterdayLastMealTime),
  );
  rawStops.push({
    offset: hourToOffsetPct(domainStart, domainStart, offsetDomainEnd),
    color: resolveMetabolicColorForHoursFasted(hoursFastedAtTimelineHour(domainStart, meals, yesterdayLastMealTime)),
  });
  rawStops.push({ offset: hourToOffsetPct(Math.min(domainEnd, offsetDomainEnd), domainStart, offsetDomainEnd), color: endColor });

  const stops = mergeGradientStops(rawStops);

  if (stops.length === 0) {
    return [
      { offset: '0%', color: METABOLIC_PHASE_COLORS.digestiva },
      { offset: '100%', color: METABOLIC_PHASE_COLORS.digestiva },
    ];
  }

  return stops;
}

/**
 * ID gradiente SVG univoco — evita cache browser/Recharts su defs statici.
 * @param {Array<{ offset: string, color: string }>} stops
 * @param {string} [prefix]
 */
export function buildMetabolicGradientId(stops, prefix = 'metabolic-grad') {
  if (!Array.isArray(stops) || stops.length === 0) return `${prefix}-default`;
  const signature = stops.map((s) => `${s.offset}:${s.color}`).join(';');
  let hash = 0;
  for (let i = 0; i < signature.length; i += 1) {
    hash = (hash * 31 + signature.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${stops.length}-${hash.toString(36)}`;
}

function applyAlphaToHex(hex, alpha) {
  if (alpha == null || alpha >= 1) return hex;
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Converte metabolicGradientStops in stringa CSS linear-gradient orizzontale (timeline nodi).
 * @param {Array<{ offset: string, color: string }>} stops
 * @param {{ alpha?: number | null }} [options]
 */
export function buildMetabolicTimelineCssGradient(stops, options = {}) {
  const { alpha = 0.52 } = options;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const parts = stops.map((stop) => {
    const color = alpha != null ? applyAlphaToHex(stop.color, alpha) : stop.color;
    return `${color} ${stop.offset}`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

/**
 * Colore accento Body Battery da fase metabolica (ore digiuno / fastingData).
 * @param {{ hoursFasted?: number, phaseName?: string } | null | undefined} fastingData
 */
export function resolveMetabolicAccentColor(fastingData) {
  return resolveMetabolicColorForHoursFasted(fastingData?.hoursFasted);
}

/**
 * Suggerimento intento biologico per Estratto Conto Energia.
 * @param {number | null | undefined} hoursFasted
 */
export function resolveBiologicalIntent(hoursFasted) {
  const raw = hoursFasted;
  if (raw == null || raw === '') {
    return {
      icon: '🥗',
      label: 'Fase di Assorbimento',
      color: METABOLIC_PHASE_COLORS.digestiva,
    };
  }
  const h = Number(raw);
  if (!Number.isFinite(h) || Number.isNaN(h) || h < 0) {
    return {
      icon: '🥗',
      label: 'Fase di Assorbimento',
      color: METABOLIC_PHASE_COLORS.digestiva,
    };
  }
  if (h >= 16) {
    return {
      icon: '🛠️',
      label: 'Riparazione Cellulare (Autofagia)',
      color: METABOLIC_PHASE_COLORS.autofagia,
    };
  }
  if (h >= 12) {
    return {
      icon: '🧠',
      label: 'Picco Cognitivo (Lucidità/Focus)',
      color: METABOLIC_PHASE_COLORS.adrenergico,
    };
  }
  if (h >= 4) {
    return {
      icon: '⚡',
      label: 'Picco di Potenza (Forza/Deep Work)',
      color: METABOLIC_PHASE_COLORS.stabilita,
    };
  }
  return {
    icon: '🥗',
    label: 'Fase di Assorbimento',
    color: METABOLIC_PHASE_COLORS.digestiva,
  };
}
