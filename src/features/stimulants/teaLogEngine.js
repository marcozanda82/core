/**
 * Registro tè — varianti + amaro/zuccherato (allineato al modulo caffè).
 */

import {
  COFFEE_VARIANT,
  SWEET_COFFEE_CARB,
  SWEET_COFFEE_KCAL,
} from './coffeeLogEngine.js';

export const TEA_TYPE = Object.freeze({
  VERDE: 'verde',
  NERO: 'nero',
  MATCHA: 'matcha',
  TISANA: 'tisana',
  CAMOMILLA: 'camomilla',
});

export const TEA_TYPE_OPTIONS = Object.freeze([
  { id: TEA_TYPE.VERDE, label: 'Verde' },
  { id: TEA_TYPE.NERO, label: 'Nero' },
  { id: TEA_TYPE.MATCHA, label: 'Matcha' },
  { id: TEA_TYPE.TISANA, label: 'Tisana' },
  { id: TEA_TYPE.CAMOMILLA, label: 'Camomilla' },
]);

export const TEA_TYPE_LS_KEY = 'kentu_last_tea_type';
export const DEFAULT_TEA_TYPE = TEA_TYPE.VERDE;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveTeaType(raw) {
  const id = String(raw || '').toLowerCase().trim();
  if (TEA_TYPE_OPTIONS.some((opt) => opt.id === id)) return id;
  return DEFAULT_TEA_TYPE;
}

/** @returns {string} */
export function readLastTeaType() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TEA_TYPE;
    return resolveTeaType(localStorage.getItem(TEA_TYPE_LS_KEY));
  } catch {
    return DEFAULT_TEA_TYPE;
  }
}

/** @param {unknown} type */
export function writeLastTeaType(type) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TEA_TYPE_LS_KEY, resolveTeaType(type));
  } catch {
    // ignore
  }
}

/** @param {string} teaType */
export function getTeaTypeLabel(teaType) {
  const id = resolveTeaType(teaType);
  return TEA_TYPE_OPTIONS.find((opt) => opt.id === id)?.label || 'Verde';
}

/**
 * @param {'amaro' | 'zuccherato'} variant
 * @param {number} [timeDecimal]
 * @param {{ id?: string, teaType?: string, type?: string, sugar?: boolean }} [options]
 */
export function buildTeaStimulantNode(variant, timeDecimal, options = {}) {
  const teaVariant = variant === COFFEE_VARIANT.ZUCCHERATO
    || options.sugar === true
    ? COFFEE_VARIANT.ZUCCHERATO
    : COFFEE_VARIANT.AMARO;
  const teaType = resolveTeaType(options.teaType || options.type);
  const time = Number.isFinite(Number(timeDecimal)) ? Number(timeDecimal) : 8;
  const isSweet = teaVariant === COFFEE_VARIANT.ZUCCHERATO;
  const typeLabel = getTeaTypeLabel(teaType);

  return {
    id: String(options.id || `stimulant_${Date.now()}`),
    type: 'stimulant',
    subtype: 'tè',
    teaType,
    coffeeVariant: teaVariant,
    teaVariant,
    breaksFast: isSweet,
    kcal: isSweet ? SWEET_COFFEE_KCAL : 0,
    carb: isSweet ? SWEET_COFFEE_CARB : 0,
    time,
    label: isSweet ? `${typeLabel} zuccherato` : `${typeLabel} amaro`,
  };
}

/**
 * @param {{ type?: string, teaType?: string, sugar?: boolean, variant?: string, time?: number, id?: string }} payload
 * @param {number} [timeDecimal]
 */
export function commitTeaLog(payload = {}, timeDecimal) {
  const sugar = payload.sugar === true
    || payload.variant === COFFEE_VARIANT.ZUCCHERATO;
  return buildTeaStimulantNode(
    sugar ? COFFEE_VARIANT.ZUCCHERATO : COFFEE_VARIANT.AMARO,
    timeDecimal ?? payload.time,
    {
      id: payload.id,
      teaType: payload.type || payload.teaType,
      sugar,
    },
  );
}
