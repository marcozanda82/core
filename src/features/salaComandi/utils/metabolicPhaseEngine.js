/**
 * Single Source of Truth — fasi metaboliche post-pasto (Monitor + Timeline 24h).
 *
 * Per ogni pasto all'orario T:
 * - T → T+90min  (1.5h): Digestione attiva
 * - T+90 → T+240min (4h): Assorbimento / nutrizione cellulare
 * - oltre T+240min: fasi digiuno (glicogeno → transizione → brucia grassi → …)
 */
import { METABOLIC_PHASES } from './metabolicPhaseConfig';

/** Durata fase digestione post-pasto (ore). */
export const POST_MEAL_DIGESTION_HOURS = 1.5;

/** Fine finestra assorbimento post-pasto (240 min = 4h dall'istante T). */
export const POST_MEAL_ABSORPTION_END_HOURS = 4;

/**
 * Indice fase da ore trascorse dall'ultimo pasto (0–∞).
 * @param {number|null|undefined} hoursSinceLastMeal
 * @returns {number}
 */
export function getMetabolicPhaseIndex(hoursSinceLastMeal) {
  const hours = Math.max(0, Number(hoursSinceLastMeal) || 0);
  const idx = METABOLIC_PHASES.findIndex(
    (phase) => hours >= phase.minHours && hours < phase.maxHours,
  );
  return idx >= 0 ? idx : METABOLIC_PHASES.length - 1;
}

/**
 * Fase metabolica a un istante post-pasto (Monitor, Radar, avatar).
 *
 * @param {number|null|undefined} hoursSinceLastMeal — ore decimali dall'ultimo pasto (es. 0.02 ≈ 1 min)
 * @param {object|null} [lastMealNode] — nodo pasto aggregato (solo per kinetics glicemiche)
 * @returns {import('./metabolicStateEngine').getMetabolicState extends (...args: any[]) => infer R ? R : object}
 */
export function getMetabolicPhaseAtTime(hoursSinceLastMeal, lastMealNode = null) {
  void lastMealNode;
  const hasMeal = hoursSinceLastMeal != null;
  const h = hasMeal ? Math.max(0, Number(hoursSinceLastMeal) || 0) : 0;

  if (!hasMeal) {
    const phase = METABOLIC_PHASES[0];
    return {
      hoursSinceLastMeal: h,
      hasMealLogged: false,
      phase,
      phaseIndex: 0,
      nextPhase: METABOLIC_PHASES[1] ?? null,
      hoursUntilNext: null,
      progressInPhase: 0,
      hoursPostAbsorption: null,
      nextTransitionHours: POST_MEAL_DIGESTION_HOURS,
    };
  }

  const phaseIndex = getMetabolicPhaseIndex(h);
  const phase = METABOLIC_PHASES[phaseIndex];
  const nextPhase = phaseIndex < METABOLIC_PHASES.length - 1
    ? METABOLIC_PHASES[phaseIndex + 1]
    : null;

  const hoursUntilNext = nextPhase
    ? Math.max(0, nextPhase.minHours - h)
    : null;

  const span = phase.maxHours === Infinity
    ? 1
    : Math.max(1e-6, phase.maxHours - phase.minHours);

  const progressInPhase = phase.maxHours === Infinity
    ? 1
    : Math.min(1, Math.max(0, (h - phase.minHours) / span));

  return {
    hoursSinceLastMeal: h,
    hasMealLogged: true,
    phase,
    phaseIndex,
    nextPhase,
    hoursUntilNext,
    progressInPhase,
    hoursPostAbsorption: h >= POST_MEAL_ABSORPTION_END_HOURS
      ? h - POST_MEAL_ABSORPTION_END_HOURS
      : null,
    nextTransitionHours: nextPhase?.minHours ?? null,
  };
}

/**
 * Confini orari (ore sull'asse 0–24) per transizioni fase di un pasto a `mealHour`.
 * @param {number} mealHour — ora decimale es. 14.733… per 14:44
 * @param {number} domainStart
 * @param {number} domainEnd
 * @returns {number[]}
 */
export function collectPostMealPhaseBoundaryHours(mealHour, domainStart = 0, domainEnd = 24) {
  const meal = Number(mealHour);
  if (!Number.isFinite(meal)) return [];

  const boundaries = new Set();
  for (const phase of METABOLIC_PHASES) {
    const offset = Number(phase.minHours);
    if (!Number.isFinite(offset)) continue;
    const absolute = meal + offset;
    if (absolute < domainStart - 1e-9 || absolute > domainEnd + 1e-9) continue;
    boundaries.add(Math.max(domainStart, Math.min(domainEnd, absolute)));
  }

  // Garantisce il marker al pasto (T) anche se minHours=0 coincide col mealHour
  if (meal >= domainStart - 1e-9 && meal <= domainEnd + 1e-9) {
    boundaries.add(Math.max(domainStart, Math.min(domainEnd, meal)));
  }

  return [...boundaries].sort((a, b) => a - b);
}

/**
 * Marker fase per overlay Timeline — transizioni solo ai confini standard (no assorbimento a T).
 * @param {number} mealHour
 * @param {number} windowStart
 * @param {number} windowEnd
 * @param {string} idPrefix
 * @param {boolean} [fromYesterday]
 * @returns {Array<object>}
 */
export function buildPostMealPhaseMarkersForWindow(
  mealHour,
  windowStart,
  windowEnd,
  idPrefix,
  fromYesterday = false,
) {
  const DAY_END = 24;
  const winStart = Math.max(0, Math.min(DAY_END, Number(windowStart) || 0));
  const winEnd = Math.max(0, Math.min(DAY_END, Number(windowEnd) || DAY_END));
  if (winEnd <= winStart + 0.001) return [];

  const meal = Number(mealHour);
  if (!Number.isFinite(meal)) return [];

  const clampHour = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(DAY_END, n));
  };

  const phaseStartClockHour = (offsetHours) => {
    const offset = Number(offsetHours);
    if (!Number.isFinite(offset)) return null;
    const raw = fromYesterday ? offset + meal - DAY_END : meal + offset;
    return clampHour(raw);
  };

  const phaseEndClockHour = (maxHours) => {
    const maxH = Number(maxHours);
    if (!Number.isFinite(maxH)) return null;
    const raw = fromYesterday ? maxH + meal - DAY_END : meal + maxH;
    return clampHour(raw);
  };

  const markers = [];

  for (const phase of METABOLIC_PHASES) {
    const hour = phaseStartClockHour(phase.minHours);
    if (hour == null || hour < winStart - 0.001 || hour >= winEnd - 0.001) {
      continue;
    }

    const phaseEnd = phaseEndClockHour(
      Number.isFinite(phase.maxHours) ? phase.maxHours : DAY_END + 48,
    );
    const endHour = phaseEnd != null ? Math.min(winEnd, phaseEnd) : winEnd;

    markers.push({
      id: `${idPrefix}_${phase.id}_${hour.toFixed(4)}`,
      phase,
      phaseId: phase.id,
      hour,
      label: phase.label,
      startHour: hour,
      endHour: endHour > hour ? endHour : Math.min(winEnd, hour + 0.25),
      mealHour: meal,
    });

    if (endHour >= winEnd - 0.001) break;
  }

  return markers;
}

/** @deprecated Alias — usa getMetabolicPhaseAtTime */
export function resolveKineticMetabolicPhase(hoursSinceLastMeal, lastMealNode = null) {
  return getMetabolicPhaseAtTime(hoursSinceLastMeal, lastMealNode);
}
