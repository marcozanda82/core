/**
 * Slot pasto Focus allineati alla semantica Kentu (toCanonicalMealType / mealTimes).
 * Puro — nessuna dipendenza da coreEngine.
 */

import { parseDecimalHour } from './focusDateUtils.js';

/** @typedef {'colazione'|'pranzo'|'cena'|'snack'|'unknown'} FocusCanonicalMealType */

const ALIAS_TO_CANONICAL = Object.freeze({
  colazione: 'colazione',
  merenda1: 'colazione',
  pranzo: 'pranzo',
  cena: 'cena',
  snack: 'snack',
  spuntino: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  merenda: 'snack',
});

const CANONICAL_ORDER = ['colazione', 'pranzo', 'snack', 'cena', 'unknown'];

/**
 * Base dello slot: prima di `_` se il suffisso è numerico (ghost o timestamp).
 * `pranzo_1757…` → pranzo; `snack_2` → snack; `merenda_am` resta intero se in alias.
 * @param {unknown} raw
 */
export function getMealSlotBase(raw) {
  const str = String(raw ?? '').trim().toLowerCase();
  if (!str) return '';
  if (ALIAS_TO_CANONICAL[str]) return str;
  if (!str.includes('_')) return str;
  const idx = str.indexOf('_');
  const base = str.slice(0, idx);
  const suffix = str.slice(idx + 1);
  // Suffisso numerico (snack_2, pranzo_<timestamp>) → base; altrimenti prova alias intero.
  if (/^\d+(\.\d+)?$/.test(suffix)) return base || str;
  return str;
}

/**
 * @param {unknown} raw
 * @returns {FocusCanonicalMealType}
 */
export function canonicalizeMealType(raw) {
  const base = getMealSlotBase(raw);
  if (!base) return 'unknown';
  if (ALIAS_TO_CANONICAL[base]) return ALIAS_TO_CANONICAL[base];
  if (base === 'colazione' || base === 'pranzo' || base === 'cena' || base === 'snack') {
    return base;
  }
  return 'unknown';
}

/**
 * Compat: alias storico di canonicalizeMealType.
 * @param {unknown} mealType
 */
export function normalizeMealType(mealType) {
  return canonicalizeMealType(mealType);
}

/**
 * Identità pasto: slot grezzo + canonico. Slot distinti non si fondono.
 * @param {object} item
 * @returns {{ mealSlotId: string, canonicalMealType: FocusCanonicalMealType }}
 */
export function resolveFocusMealIdentity(item) {
  const raw = item?.mealType ?? item?.mealId ?? item?.mealSlotId ?? '';
  const mealSlotId = String(raw || '').trim() || 'unknown';
  return {
    mealSlotId,
    canonicalMealType: canonicalizeMealType(mealSlotId),
  };
}

/**
 * Orario pasto: item diretto, poi mealTimes[chiave esatta], poi mealTimes[base/canonico].
 * Non usa orari di altri slot.
 * @param {object} item
 * @param {Record<string, unknown>|null|undefined} mealTimes
 * @returns {{ hour: number|null, source: string|null }}
 */
export function resolveFoodClockHourDetailed(item, mealTimes) {
  const direct = parseDecimalHour(item?.mealTime ?? item?.time ?? item?.clockHour);
  if (direct != null) {
    return { hour: direct, source: 'item.mealTime' };
  }

  const times = mealTimes && typeof mealTimes === 'object' ? mealTimes : null;
  if (!times) return { hour: null, source: null };

  const { mealSlotId, canonicalMealType } = resolveFocusMealIdentity(item);
  const base = getMealSlotBase(mealSlotId);

  if (times[mealSlotId] != null) {
    const h = parseDecimalHour(times[mealSlotId]);
    if (h != null) return { hour: h, source: 'mealTimes.exact_slot' };
  }
  if (base && base !== mealSlotId && times[base] != null) {
    const h = parseDecimalHour(times[base]);
    if (h != null) return { hour: h, source: 'mealTimes.slot_base' };
  }
  if (
    canonicalMealType !== 'unknown'
    && canonicalMealType !== mealSlotId
    && canonicalMealType !== base
    && times[canonicalMealType] != null
  ) {
    const h = parseDecimalHour(times[canonicalMealType]);
    if (h != null) return { hour: h, source: 'mealTimes.canonical' };
  }

  return { hour: null, source: null };
}

/**
 * @param {object} item
 * @param {Record<string, unknown>|null|undefined} mealTimes
 * @returns {number|null}
 */
export function resolveFoodClockHour(item, mealTimes) {
  return resolveFoodClockHourDetailed(item, mealTimes).hour;
}

/**
 * Ordina slot: orario noto, poi ordine canonico, poi id slot.
 * @param {{ mealSlotId: string, canonicalMealType: string, clockHour: number|null }} a
 * @param {{ mealSlotId: string, canonicalMealType: string, clockHour: number|null }} b
 */
export function compareMealSlots(a, b) {
  const ha = typeof a.clockHour === 'number' && Number.isFinite(a.clockHour) ? a.clockHour : null;
  const hb = typeof b.clockHour === 'number' && Number.isFinite(b.clockHour) ? b.clockHour : null;
  if (ha != null && hb != null && ha !== hb) return ha - hb;
  if (ha != null && hb == null) return -1;
  if (ha == null && hb != null) return 1;
  const oa = CANONICAL_ORDER.indexOf(a.canonicalMealType);
  const ob = CANONICAL_ORDER.indexOf(b.canonicalMealType);
  const ia = oa === -1 ? 99 : oa;
  const ib = ob === -1 ? 99 : ob;
  if (ia !== ib) return ia - ib;
  return String(a.mealSlotId).localeCompare(String(b.mealSlotId));
}

export { CANONICAL_ORDER };
