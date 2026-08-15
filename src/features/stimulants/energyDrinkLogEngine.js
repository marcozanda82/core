/**
 * Registro energy drink — varianti con zucchero implicito per Zero/Classico.
 */

export const ENERGY_TYPE = Object.freeze({
  ZERO: 'zero',
  CLASSICO: 'classico',
  PRE_WORKOUT: 'pre_workout',
  SPORT_DRINK: 'sport_drink',
});

export const ENERGY_TYPE_OPTIONS = Object.freeze([
  { id: ENERGY_TYPE.ZERO, label: 'Zero', hint: 'Senza zuccheri' },
  { id: ENERGY_TYPE.CLASSICO, label: 'Classico', hint: 'Zuccherato' },
  { id: ENERGY_TYPE.PRE_WORKOUT, label: 'Pre-Workout', hint: null },
  { id: ENERGY_TYPE.SPORT_DRINK, label: 'Sport Drink', hint: null },
]);

export const ENERGY_TYPE_LS_KEY = 'kentu_last_energy_type';
export const DEFAULT_ENERGY_TYPE = ENERGY_TYPE.ZERO;

const ENERGY_META = Object.freeze({
  [ENERGY_TYPE.ZERO]: {
    kcal: 0,
    carb: 0,
    breaksFast: false,
    sugar: false,
    label: 'Energy Zero',
  },
  [ENERGY_TYPE.CLASSICO]: {
    kcal: 110,
    carb: 27,
    breaksFast: true,
    sugar: true,
    label: 'Energy Classico',
  },
  [ENERGY_TYPE.PRE_WORKOUT]: {
    kcal: 15,
    carb: 2,
    breaksFast: false,
    sugar: false,
    label: 'Pre-Workout',
  },
  [ENERGY_TYPE.SPORT_DRINK]: {
    kcal: 50,
    carb: 12,
    breaksFast: true,
    sugar: true,
    label: 'Sport Drink',
  },
});

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveEnergyType(raw) {
  const id = String(raw || '').toLowerCase().trim().replace(/[-\s]+/g, '_');
  if (id === 'preworkout') return ENERGY_TYPE.PRE_WORKOUT;
  if (id === 'sportdrink' || id === 'sport') return ENERGY_TYPE.SPORT_DRINK;
  if (ENERGY_TYPE_OPTIONS.some((opt) => opt.id === id)) return id;
  return DEFAULT_ENERGY_TYPE;
}

/** @returns {string} */
export function readLastEnergyType() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ENERGY_TYPE;
    return resolveEnergyType(localStorage.getItem(ENERGY_TYPE_LS_KEY));
  } catch {
    return DEFAULT_ENERGY_TYPE;
  }
}

/** @param {unknown} type */
export function writeLastEnergyType(type) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ENERGY_TYPE_LS_KEY, resolveEnergyType(type));
  } catch {
    // ignore
  }
}

/** @param {string} energyType */
export function getEnergyTypeLabel(energyType) {
  const id = resolveEnergyType(energyType);
  return ENERGY_TYPE_OPTIONS.find((opt) => opt.id === id)?.label
    || ENERGY_META[id]?.label
    || 'Zero';
}

/**
 * @param {string} energyType
 * @param {number} [timeDecimal]
 * @param {{ id?: string }} [options]
 */
export function buildEnergyStimulantNode(energyType, timeDecimal, options = {}) {
  const type = resolveEnergyType(energyType);
  const meta = ENERGY_META[type] || ENERGY_META[ENERGY_TYPE.ZERO];
  const time = Number.isFinite(Number(timeDecimal)) ? Number(timeDecimal) : 8;

  return {
    id: String(options.id || `stimulant_${Date.now()}`),
    type: 'stimulant',
    subtype: 'energy drink',
    energyType: type,
    coffeeVariant: meta.sugar ? 'zuccherato' : 'amaro',
    breaksFast: meta.breaksFast,
    kcal: meta.kcal,
    carb: meta.carb,
    time,
    label: meta.label,
  };
}

/**
 * @param {{ type?: string, energyType?: string, time?: number, id?: string }} payload
 * @param {number} [timeDecimal]
 */
export function commitEnergyLog(payload = {}, timeDecimal) {
  return buildEnergyStimulantNode(
    payload.type || payload.energyType,
    timeDecimal ?? payload.time,
    { id: payload.id },
  );
}
