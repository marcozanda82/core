/**
 * Proiezione micronutrienti per kentu.focusLabDossier.v1.
 * Solo lettura delle righe diario già persistite — nessuna stima EPA/DHA/ALA,
 * nessun giudizio carenza/adeguato, nessun side-effect sul diario.
 *
 * Semantica presenza (post zeroFillMissingNutrients):
 * - chiave assente / non numerica → absent (missing)
 * - valore > 0 → present (recorded)
 * - valore === 0 con evidenza DB esplicita sulla riga → real_zero (recorded)
 * - valore === 0 senza evidenza ricostruibile → unverified_zero (ambiguous, non valutabile)
 */

import { TARGETS } from '../../../utils/computeTotaliCore.js';
import {
  FOCUS_PROVENANCE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import { finiteNumber } from '../normalize/logUtils.js';

/** Chiavi esplicitamente esportate (vit + minerali + dettaglio grassi TARGETS; no amino, no macro). */
export const FOCUS_LAB_MICRONUTRIENT_KEYS = Object.freeze([
  'omega3',
  'omega6',
  'k',
  'mg',
  'vitB12',
  ...Object.keys(TARGETS.vit || {}).filter((k) => k !== 'vitB12'),
  ...Object.keys(TARGETS.min || {}).filter((k) => k !== 'k' && k !== 'mg'),
  ...Object.keys(TARGETS.fat || {}).filter((k) => k !== 'omega3' && k !== 'omega6'),
]);

export const FOCUS_LAB_MICRONUTRIENT_UNITS = Object.freeze({
  omega3: 'g',
  omega6: 'g',
  fatSat: 'g',
  fatTrans: 'g',
  fatMono: 'g',
  fatPoly: 'g',
  colest: 'mg',
  vitA: 'µg',
  vitB1: 'mg',
  vitB2: 'mg',
  vitB3: 'mg',
  vitB5: 'mg',
  vitB6: 'mg',
  b9: 'µg',
  vitB12: 'µg',
  vitc: 'mg',
  vitD: 'µg',
  vitE: 'mg',
  vitK: 'µg',
  ca: 'mg',
  fe: 'mg',
  mg: 'mg',
  p: 'mg',
  k: 'mg',
  na: 'mg',
  zn: 'mg',
  cu: 'mg',
  se: 'µg',
});

export const FOCUS_NUTRIENT_AVAILABILITY = Object.freeze({
  present: 'present',
  real_zero: 'real_zero',
  absent: 'absent',
  unverified_zero: 'unverified_zero',
});

const ALLOWED_DB_SOURCES = new Set(['personal', 'kentu_it', 'global', 'off']);

/** Alias diary → chiave canonica (allineati a computeTotaliCore dove utile). */
const KEY_ALIASES = Object.freeze({
  fibre: ['fiber', 'fibreTotali'],
  vitB2: ['b2'],
  vitB6: ['b6'],
  na: ['sodium', 'sale'],
  k: ['potassium', 'potassio'],
  mg: ['magnesium', 'magnesio'],
  omega3: ['n3', 'ω3'],
  omega6: ['n6', 'ω6'],
});

/**
 * @param {object|null|undefined} item
 * @returns {Set<string>}
 */
export function readDbProvidedNutrientKeys(item) {
  const out = new Set();
  if (!item || typeof item !== 'object') return out;
  const raw = item.dbProvidedNutrientKeys
    ?? item.dbProvidedKeys
    ?? item.nutrientKeysFromDb
    ?? item.dbNutrientKeys;
  if (Array.isArray(raw)) {
    for (const k of raw) {
      const s = String(k || '').trim();
      if (s) out.add(s);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (v) out.add(String(k).trim());
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} item
 * @param {string} key
 * @returns {{ found: boolean, value: number|null, viaAlias: string|null }}
 */
export function readItemMicronutrientRaw(item, key) {
  if (!item || typeof item !== 'object') {
    return { found: false, value: null, viaAlias: null };
  }
  if (Object.prototype.hasOwnProperty.call(item, key)) {
    const n = finiteNumber(item[key]);
    if (n == null) return { found: true, value: null, viaAlias: null };
    return { found: true, value: n, viaAlias: null };
  }
  for (const alias of KEY_ALIASES[key] || []) {
    if (!Object.prototype.hasOwnProperty.call(item, alias)) continue;
    const n = finiteNumber(item[alias]);
    if (n == null) return { found: true, value: null, viaAlias: alias };
    return { found: true, value: n, viaAlias: alias };
  }
  return { found: false, value: null, viaAlias: null };
}

/**
 * @param {object|null|undefined} item
 * @param {string} key
 */
export function resolveMicronutrientPresence(item, key) {
  const unit = FOCUS_LAB_MICRONUTRIENT_UNITS[key] || undefined;
  const provided = readDbProvidedNutrientKeys(item);
  const raw = readItemMicronutrientRaw(item, key);

  if (!raw.found || raw.value == null) {
    return {
      key,
      availability: FOCUS_NUTRIENT_AVAILABILITY.absent,
      metric: missingMetric(unit),
      contributesToSum: false,
    };
  }

  if (raw.value > 0) {
    return {
      key,
      availability: FOCUS_NUTRIENT_AVAILABILITY.present,
      metric: focusMetric(roundMicro(raw.value), {
        unit,
        provenance: FOCUS_PROVENANCE.recorded,
        source: raw.viaAlias ? `diary_alias:${raw.viaAlias}` : 'diary_item',
      }),
      contributesToSum: true,
    };
  }

  // value === 0
  if (provided.has(key) || (raw.viaAlias && provided.has(raw.viaAlias))) {
    return {
      key,
      availability: FOCUS_NUTRIENT_AVAILABILITY.real_zero,
      metric: focusMetric(0, {
        unit,
        provenance: FOCUS_PROVENANCE.recorded,
        source: 'db_provided_keys',
      }),
      contributesToSum: true,
    };
  }

  return {
    key,
    availability: FOCUS_NUTRIENT_AVAILABILITY.unverified_zero,
    metric: {
      value: null,
      unit,
      provenance: FOCUS_PROVENANCE.ambiguous,
      source: 'zero_without_db_presence_evidence',
      note: 'Possibile zero-fill; non trattare come apporto verificato.',
    },
    contributesToSum: false,
  };
}

/**
 * @param {object|null|undefined} item
 */
export function buildFoodItemMicronutrients(item) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const key of FOCUS_LAB_MICRONUTRIENT_KEYS) {
    const resolved = resolveMicronutrientPresence(item, key);
    out[key] = {
      ...resolved.metric,
      availability: resolved.availability,
    };
  }
  return out;
}

/**
 * Riferimento catalogo controllato — no path Firebase, no uid.
 * @param {object|null|undefined} item
 */
export function buildFoodItemCatalogRef(item) {
  if (!item || typeof item !== 'object') {
    return {
      foodDbKey: null,
      dbSource: null,
      dbSourceProvenance: FOCUS_PROVENANCE.missing,
      nutrientPresenceEvidence: 'none',
    };
  }

  const keyRaw = item.foodDbKey ?? item.matchedKey ?? null;
  const foodDbKey = keyRaw != null && String(keyRaw).trim()
    ? String(keyRaw).trim()
    : null;

  const srcRaw = item.dbSource != null ? String(item.dbSource).trim() : '';
  const dbSource = ALLOWED_DB_SOURCES.has(srcRaw) ? srcRaw : null;

  const provided = readDbProvidedNutrientKeys(item);
  return {
    foodDbKey,
    dbSource,
    dbSourceProvenance: dbSource
      ? FOCUS_PROVENANCE.recorded
      : FOCUS_PROVENANCE.missing,
    nutrientPresenceEvidence: provided.size > 0 ? 'db_provided_keys' : 'none',
  };
}

/**
 * Aggrega micronutrienti giorno: somma solo present + real_zero.
 * @param {object[]} foodItems
 */
export function aggregateDayMicronutrients(foodItems) {
  const items = Array.isArray(foodItems) ? foodItems : [];
  const itemsTotal = items.length;

  /** @type {Record<string, object>} */
  const totals = {};

  for (const key of FOCUS_LAB_MICRONUTRIENT_KEYS) {
    const unit = FOCUS_LAB_MICRONUTRIENT_UNITS[key] || undefined;
    let sum = 0;
    let itemsKnown = 0;
    let itemsAbsent = 0;
    let itemsUnverifiedZero = 0;

    for (const item of items) {
      const resolved = resolveMicronutrientPresence(item, key);
      if (resolved.availability === FOCUS_NUTRIENT_AVAILABILITY.absent) {
        itemsAbsent += 1;
        continue;
      }
      if (resolved.availability === FOCUS_NUTRIENT_AVAILABILITY.unverified_zero) {
        itemsUnverifiedZero += 1;
        continue;
      }
      if (resolved.contributesToSum && resolved.metric?.value != null) {
        sum += Number(resolved.metric.value) || 0;
        itemsKnown += 1;
      }
    }

    const completenessRatio = itemsTotal > 0
      ? Math.round((itemsKnown / itemsTotal) * 1000) / 1000
      : 0;

    const base = itemsKnown > 0
      ? focusMetric(roundMicro(sum), {
        unit,
        provenance: FOCUS_PROVENANCE.calculated,
        source: 'focusLabMicronutrients',
      })
      : missingMetric(unit);

    totals[key] = {
      ...base,
      itemsKnown,
      itemsTotal,
      itemsAbsent,
      itemsUnverifiedZero,
      completenessRatio,
      sumIncludesOnly: ['present', 'real_zero'],
      limits: 'missing_and_unverified_zero_excluded_from_sum',
      /** Nessun giudizio clinico in questa fase. */
      judgement: null,
    };
  }

  return {
    keys: [...FOCUS_LAB_MICRONUTRIENT_KEYS],
    byKey: totals,
    note: 'Totali micro: solo valori present/real_zero. Nessuna etichetta carenza/adeguato/eccessivo.',
  };
}

/** @param {number} n */
function roundMicro(n) {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  if (abs >= 100) return Math.round(n * 10) / 10;
  if (abs >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 1000) / 1000;
}
