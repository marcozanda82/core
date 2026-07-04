/**
 * Drill-down contributi alimentari per nutriente (deduplicato per alimento).
 */

import { isNobleProtein } from './calculateProteinQuality';
import { readItemProteinGrams } from './calculateProteinReliability';
import { TARGETS } from '../../useBiochimico';

const BCAA_KEYS = ['leu', 'iso', 'val'];
const EAA_KEYS = Object.keys(TARGETS.amino);

const NUTRIENT_READ_KEYS = {
  fatTotal: ['fatTotal', 'fatTot', 'fat', 'grassi'],
  fatSat: ['fatSat'],
  fatTrans: ['fatTrans'],
  fatMono: ['fatMono'],
  fatPoly: ['fatPoly'],
  omega3: ['omega3', 'omega_3'],
  omega6: ['omega6', 'omega_6'],
  carb: ['carb', 'carboidrati'],
  sugars: ['zuccheri', 'sugars', 'sugar'],
  fibre: ['fibre', 'fiber', 'fibreTotali'],
  prot: ['prot', 'proteine', 'protein'],
  leu: ['leu'],
  iso: ['iso'],
  val: ['val'],
};

const NUTRIENT_KEY_ALIASES = {
  totalfat: 'fatTotal',
  fat: 'fatTotal',
  grassi: 'fatTotal',
  saturatedfat: 'fatSat',
  saturated_fat: 'fatSat',
  saturi: 'fatSat',
  trans: 'fatTrans',
  transfat: 'fatTrans',
  monounsaturated: 'fatMono',
  monoinsaturi: 'fatMono',
  polyunsaturated: 'fatPoly',
  polinsaturi: 'fatPoly',
  omega_3: 'omega3',
  omega_6: 'omega6',
  carboidrati: 'carb',
  zuccheri: 'sugars',
  sugar: 'sugars',
  fiber: 'fibre',
  starches: 'starches',
  amidi: 'starches',
  starch: 'starches',
  protein: 'prot',
  proteine: 'prot',
  leucine: 'leu',
  leucina: 'leu',
  bcaa: 'bcaa',
  eaa: 'eaa',
  proteinnoble: 'proteinNoble',
  nobili: 'proteinNoble',
  complete: 'proteinNoble',
  proteinincomplete: 'proteinIncomplete',
  incomplete: 'proteinIncomplete',
};

/**
 * @param {unknown} nutrientKey
 * @returns {string}
 */
function normalizeNutrientKey(nutrientKey) {
  const raw = String(nutrientKey ?? '').trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/-/g, '').replace(/_/g, '');
  if (NUTRIENT_KEY_ALIASES[compact]) return NUTRIENT_KEY_ALIASES[compact];
  if (NUTRIENT_READ_KEYS[raw]) return raw;
  if (NUTRIENT_READ_KEYS[compact]) return compact;
  return raw;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} logicalKey
 * @returns {number}
 */
function readNutrientAmount(item, logicalKey) {
  if (logicalKey === 'starches') {
    const carb = readNutrientAmountFromKeys(item, NUTRIENT_READ_KEYS.carb);
    if (!Number.isFinite(carb)) return NaN;
    const sugars = readNutrientAmountFromKeys(item, NUTRIENT_READ_KEYS.sugars);
    const fibre = readNutrientAmountFromKeys(item, NUTRIENT_READ_KEYS.fibre);
    const s = Number.isFinite(sugars) ? sugars : 0;
    const f = Number.isFinite(fibre) ? fibre : 0;
    return Math.max(0, carb - s - f);
  }

  if (logicalKey === 'proteinNoble') {
    const protein = readItemProteinGrams(item);
    if (protein <= 0 || !isNobleProtein(item)) return NaN;
    return protein;
  }

  if (logicalKey === 'proteinIncomplete') {
    const protein = readItemProteinGrams(item);
    if (protein <= 0 || isNobleProtein(item)) return NaN;
    return protein;
  }

  if (logicalKey === 'bcaa') {
    const sum = BCAA_KEYS.reduce((acc, key) => {
      const v = readNutrientAmountFromKeys(item, NUTRIENT_READ_KEYS[key] ?? [key]);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    return sum > 0 ? sum : NaN;
  }

  if (logicalKey === 'eaa') {
    const sum = EAA_KEYS.reduce((acc, key) => {
      const v = readNutrientAmountFromKeys(item, [key]);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    return sum > 0 ? sum : NaN;
  }

  return readNutrientAmountFromKeys(item, NUTRIENT_READ_KEYS[logicalKey] ?? [logicalKey]);
}

/**
 * @param {Record<string, unknown>} item
 * @param {string[]} keys
 * @returns {number}
 */
function readNutrientAmountFromKeys(item, keys) {
  for (const prop of keys) {
    if (!(prop in item)) continue;
    const v = item[prop];
    if (v != null && typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
function resolveFoodName(item) {
  const n = item.name ?? item.desc ?? item.label;
  const s = String(n ?? '').trim();
  return s || 'Alimento';
}

/**
 * Chiave deduplicazione: id DB > id voce > nome normalizzato.
 *
 * @param {Record<string, unknown>} item
 * @param {number} index
 * @returns {string}
 */
function resolveDedupeKey(item, index) {
  const dbKey = item.dbKey ?? item.foodId ?? item.id;
  if (dbKey != null && String(dbKey).trim() !== '') {
    return `id:${String(dbKey).trim().toLowerCase()}`;
  }
  const name = resolveFoodName(item).toLowerCase();
  if (name !== 'alimento') return `name:${name}`;
  return `row:${index}`;
}

/**
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {number}
 */
function roundValue(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

/**
 * @typedef {{ name: string, amount: number, percentage: number }} NutrientContributor
 */

/**
 * Elenca i contributori di un nutriente nel diario odierno (deduplicati, ordinati per % decrescente).
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @param {string} nutrientKey — es. fatSat, fatTotal, omega3
 * @param {number} totalConsumed — totale giornaliero del nutriente (denominatore %)
 * @returns {NutrientContributor[]}
 */
export function getContributorsForNutrient(dailyLog, nutrientKey, totalConsumed) {
  const logicalKey = normalizeNutrientKey(nutrientKey);
  const total = Number(totalConsumed) || 0;
  if (!logicalKey) return [];

  /** @type {Map<string, { name: string, amount: number }>} */
  const byFood = new Map();

  (dailyLog || []).forEach((raw, index) => {
    if (raw == null || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    if (item.type !== 'food' && item.type !== 'recipe') return;

    const amount = readNutrientAmount(item, logicalKey);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const dedupeKey = resolveDedupeKey(item, index);
    const name = resolveFoodName(item);
    const existing = byFood.get(dedupeKey);

    if (existing) {
      existing.amount += amount;
    } else {
      byFood.set(dedupeKey, { name, amount });
    }
  });

  return Array.from(byFood.values())
    .map(({ name, amount }) => ({
      name,
      amount: roundValue(amount),
      percentage: total > 0 ? roundValue((amount / total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

export { normalizeNutrientKey as normalizeFatNutrientKey };
