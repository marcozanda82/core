/**
 * Cinetica digestiva per pasto — durata, ritardi e fasi da macronutrienti.
 */
import { METABOLIC_PHASES } from '../salaComandi/utils/metabolicPhaseConfig';

export function readMealMacroGrams(mealItem) {
  const items = Array.isArray(mealItem?.items)
    ? mealItem.items
    : Array.isArray(mealItem?.foods)
      ? mealItem.foods
      : null;

  if (items?.length) {
    let prot = 0;
    let fat = 0;
    let fibre = 0;
    let carb = 0;
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      prot += Number(it.prot ?? it.protein ?? it.proteine) || 0;
      fat += Number(it.fatTotal ?? it.fat ?? it.grassi) || 0;
      fibre += Number(it.fibre ?? it.fiber ?? it.fibra) || 0;
      carb += Number(it.carb ?? it.carbs ?? it.carboidrati) || 0;
    }
    return { prot, fat, fibre, carb };
  }

  return {
    prot: Number(mealItem?.prot ?? mealItem?.protein ?? mealItem?.proteine) || 0,
    fat: Number(mealItem?.fatTotal ?? mealItem?.fat ?? mealItem?.grassi) || 0,
    fibre: Number(mealItem?.fibre ?? mealItem?.fiber ?? mealItem?.fibra) || 0,
    carb: Number(mealItem?.carb ?? mealItem?.carbs ?? mealItem?.carboidrati) || 0,
  };
}

/**
 * @param {object} mealItem — voce food/recipe o nodo meal aggregato ({ items, prot, fat, … })
 * @returns {{ onsetDelay: number, duration: number, peakTime: number }}
 */
export function calculateMealKinetics(mealItem) {
  const { prot, fat, fibre } = readMealMacroGrams(mealItem ?? {});

  // t0 digestione = timestamp pasto esatto: niente latenza gastrica artificiale
  // (il vecchio 0.3h + grassi/fibre spingeva la curva di ~1h sul campionamento orario).
  const onsetDelay = 0;

  let duration = 1.5
    + Math.floor(prot / 15) * 0.5
    + Math.floor(fat / 10) * 0.5
    + Math.floor(fibre / 10) * 0.2;
  duration = Math.min(6, Math.max(0.5, duration));

  const peakTime = onsetDelay + duration * 0.4;

  return { onsetDelay, duration, peakTime };
}

/** @returns {number} */
export function mealKineticsWindowEnd(kinetics) {
  const { onsetDelay, duration } = kinetics ?? calculateMealKinetics(null);
  return onsetDelay + duration;
}

/**
 * Contributo glicemico orario (mg/dL scalati) — campana post-onset, picco ~peakTime, blunted se duration↑.
 * @param {number} timeSinceMeal ore dall'istante del pasto
 * @param {object} mealNode
 * @param {number} [metabolicPenalty=1] moltiplicatore sonno scarso (1.0–1.3) → picco glicemico più alto
 * @returns {number}
 */
export function calculateGlycemicContribution(timeSinceMeal, mealNode, metabolicPenalty = 1) {
  const timeSince = Number(timeSinceMeal);
  if (!Number.isFinite(timeSince)) return 0;

  const { onsetDelay, duration, peakTime } = calculateMealKinetics(mealNode);
  const windowEnd = onsetDelay + duration;
  if (timeSince < onsetDelay || timeSince > windowEnd) return 0;

  const tActive = timeSince - onsetDelay;
  const peakActive = Math.max(0.05, peakTime - onsetDelay);
  const width = Math.max(0.35, duration * 0.22);
  const { carb, fat, fibre } = readMealMacroGrams(mealNode);
  if (carb <= 0) return 0;

  const bluntFactor = Math.max(0.45, 1 - duration * 0.07 - fat * 0.008 - fibre * 0.006);
  const penalty = Number.isFinite(Number(metabolicPenalty))
    ? Math.max(1, Math.min(1.3, Number(metabolicPenalty)))
    : 1;
  const amplitude = carb * bluntFactor * penalty;

  return Math.exp(-Math.pow((tActive - peakActive) / width, 2)) * amplitude;
}

/** Fasi cinetiche (pre/post assorbimento) con asset UI ereditati da METABOLIC_PHASES. */
export const KINETIC_GASTRIC_PHASE = {
  ...METABOLIC_PHASES[0],
  id: 'svuotamento_gastrico',
  label: 'Svuotamento Gastrico',
  action: 'Transizione gastrica',
};

export const KINETIC_ABSORPTION_PHASE = {
  ...METABOLIC_PHASES[1],
  id: 'assorbimento_attivo',
  label: 'Assorbimento / Anabolismo',
  action: 'Fase attiva',
};

/** @deprecated Usa getMetabolicPhaseAtTime da metabolicPhaseEngine */
export { getMetabolicPhaseAtTime, resolveKineticMetabolicPhase } from '../salaComandi/utils/metabolicPhaseEngine';

/** Fasi post-assorbimento ribasate sull'fine finestra cinetica (glicogeno @ +0h). */
export const POST_ABSORPTION_PHASES = [
  { minHours: 0, maxHours: 6, phaseIndex: 2 },
  { minHours: 6, maxHours: 10, phaseIndex: 3 },
  { minHours: 10, maxHours: 18, phaseIndex: 4 },
  { minHours: 18, maxHours: 42, phaseIndex: 5 },
  { minHours: 42, maxHours: Infinity, phaseIndex: 6 },
];

/** Marker overlay: offset ore dall'fine assorbimento → fase METABOLIC_PHASES. */
export const POST_ABSORPTION_PHASE_OFFSETS = POST_ABSORPTION_PHASES.map((band) => ({
  phase: METABOLIC_PHASES[band.phaseIndex],
  offsetFromAbsorptionEnd: band.minHours,
}));
