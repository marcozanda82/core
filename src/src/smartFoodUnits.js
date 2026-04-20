/**
 * Unità "umane" (fette, confezioni, porzioni) + fallback grammi.
 * Estendibile (AI, USDA); integra override utente via resolveFood.
 */

import { resolveFood } from './userFoodOverrides';

export const UNIT_TYPES = {
  GRAM: 'g',
  SLICE: 'slice',
  UNIT: 'unit',
  PACKAGE: 'package',
  PORTION: 'portion',
  TABLESPOON: 'tbsp',
  TEASPOON: 'tsp',
};

const UNIT_VALUES = new Set(Object.values(UNIT_TYPES));

/**
 * @param {object} food
 * @returns {string} chiave UNIT_TYPES
 */
export function detectDefaultUnit(food) {
  const name = String(food?.name ?? food?.desc ?? '').toLowerCase();

  if (name.includes('pane') || name.includes('fetta')) return UNIT_TYPES.SLICE;
  if (name.includes('yogurt') || name.includes('tonno')) return UNIT_TYPES.PACKAGE;
  if (name.includes('pasta') || name.includes('riso')) return UNIT_TYPES.PORTION;
  if (name.includes('olio')) return UNIT_TYPES.TABLESPOON;

  return UNIT_TYPES.GRAM;
}

/**
 * Grammi per 1× unità logica (dopo override / riga CREA se presente su food).
 * @param {object} food
 * @param {string} unit
 * @returns {number}
 */
export function getDefaultGramsPerUnit(food, unit) {
  const g = food?.gramsPerUnit;
  if (g != null && Number.isFinite(Number(g)) && Number(g) > 0) return Number(g);

  switch (unit) {
    case UNIT_TYPES.SLICE:
      return 25;
    case UNIT_TYPES.PACKAGE:
      return 125;
    case UNIT_TYPES.PORTION:
      return 60;
    case UNIT_TYPES.TABLESPOON:
      return 10;
    case UNIT_TYPES.TEASPOON:
      return 5;
    case UNIT_TYPES.UNIT:
      return 100;
    case UNIT_TYPES.GRAM:
    default:
      return 100;
  }
}

/**
 * @param {number} quantity
 * @param {number} gramsPerUnit
 * @returns {number}
 */
export function computeGrams(quantity, gramsPerUnit) {
  const q = Number(quantity);
  const g = Number(gramsPerUnit);
  if (!Number.isFinite(q) || !Number.isFinite(g) || q <= 0 || g <= 0) return 0;
  return q * g;
}

/**
 * Risolve override + unità logica + g/unità (priorità dati CREA/enriched quando presenti).
 * @param {object} food
 */
export function resolveFoodWithUnits(food) {
  const resolved = resolveFood(food);
  if (!resolved || typeof resolved !== 'object') return resolved;

  const name = String(resolved.name ?? resolved.desc ?? '').trim();
  const withName = { ...resolved, name };

  const unit =
    typeof resolved.defaultUnit === 'string' && UNIT_VALUES.has(resolved.defaultUnit)
      ? resolved.defaultUnit
      : detectDefaultUnit(withName);

  let gramsPerUnit =
    resolved.gramsPerUnit != null && Number.isFinite(Number(resolved.gramsPerUnit)) && Number(resolved.gramsPerUnit) > 0
      ? Number(resolved.gramsPerUnit)
      : null;

  if (gramsPerUnit == null && resolved.defaultUnit && typeof resolved.defaultUnit === 'object' && !Array.isArray(resolved.defaultUnit)) {
    const rowG = Number(resolved.defaultUnit.grams);
    if (Number.isFinite(rowG) && rowG > 0) gramsPerUnit = rowG;
  }

  if (gramsPerUnit == null || !Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) {
    gramsPerUnit = getDefaultGramsPerUnit(withName, unit);
  }

  const baseAvailable = [UNIT_TYPES.GRAM, unit];
  const availableUnits = Array.isArray(resolved.availableUnits) && resolved.availableUnits.length
    ? [...new Set(resolved.availableUnits.filter((u) => typeof u === 'string'))]
    : [...new Set(baseAvailable)];

  return {
    ...withName,
    unit,
    gramsPerUnit,
    availableUnits,
  };
}

/** Etichetta italiana alimento (singolare/plurale approssimato). */
/** Titolo breve per menu (singolare, capitalizzato). */
export function naturalUnitMenuLabel(unitKey) {
  switch (unitKey) {
    case UNIT_TYPES.SLICE:
      return 'Fette';
    case UNIT_TYPES.PACKAGE:
      return 'Confezione';
    case UNIT_TYPES.PORTION:
      return 'Porzione';
    case UNIT_TYPES.TABLESPOON:
      return 'Cucchiaio';
    case UNIT_TYPES.TEASPOON:
      return 'Cucchiaino';
    case UNIT_TYPES.UNIT:
      return 'Unità';
    case UNIT_TYPES.GRAM:
    default:
      return 'Grammi';
  }
}

export function smartQuantityStep(unitKey) {
  return unitKey === UNIT_TYPES.PORTION ? 0.25 : 1;
}

export function naturalUnitLabelIt(unitKey, quantity = 1) {
  const n = Number(quantity);
  const plural = Number.isFinite(n) && Math.abs(n - 1) > 1e-6;
  switch (unitKey) {
    case UNIT_TYPES.SLICE:
      return plural ? 'fette' : 'fetta';
    case UNIT_TYPES.PACKAGE:
      return plural ? 'confezioni' : 'confezione';
    case UNIT_TYPES.PORTION:
      return plural ? 'porzioni' : 'porzione';
    case UNIT_TYPES.TABLESPOON:
      return plural ? 'cucchiai' : 'cucchiaio';
    case UNIT_TYPES.TEASPOON:
      return plural ? 'cucchiaini' : 'cucchiaino';
    case UNIT_TYPES.UNIT:
      return plural ? 'unità' : 'unità';
    case UNIT_TYPES.GRAM:
    default:
      return 'g';
  }
}

/**
 * Es. "2 fette (50 g)" — non solo "50 g".
 * @param {number} quantity
 * @param {string} unitKey
 * @param {number} gramsPerUnit
 */
export function formatSmartPortionLabel(quantity, unitKey, gramsPerUnit) {
  const q = Number(quantity);
  const gpu = Number(gramsPerUnit);
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(gpu) || gpu <= 0) return '';

  const total = Math.max(1, Math.round(computeGrams(q, gpu)));
  if (unitKey === UNIT_TYPES.GRAM) {
    return `${total} g`;
  }
  const label = naturalUnitLabelIt(unitKey, q);
  const qDisp = Number.isInteger(q) || Math.abs(q - Math.round(q)) < 1e-6 ? String(Math.round(q)) : String(q).replace(/\.?0+$/, '');
  return `${qDisp} ${label} (${total} g)`;
}
