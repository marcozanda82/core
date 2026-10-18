/**
 * Nucleo puro di somma nutrizionale del diario (senza React).
 * Usato da useBiochimico e da Kentu Focus per coerenza dei totali.
 */

import { isUnresolvedMealDraftItem } from './mealDraftStatus.js';

/**
 * TARGET BIOCHIMICI — Tutti i 40+ parametri (macro, aminoacidi, vitamine, minerali, omega).
 * Nessun dato biochimico deve essere perso: ogni chiave è usata per somma e delta correction.
 */
export const TARGETS = {
  macro: { prot: 140, carb: 300, fatTotal: 85, fibre: 30 },
  amino: { leu: 2900, iso: 1500, val: 1900, lys: 2200, met: 1100, phe: 1800, thr: 1100, trp: 300, his: 750 },
  vit: { vitA: 900, vitB1: 1.2, vitB2: 1.3, vitB3: 16, vitB5: 5, vitB6: 1.3, b9: 400, vitB12: 2.4, vitc: 90, vitD: 15, vitE: 15, vitK: 120 },
  min: { ca: 1000, fe: 18, mg: 420, p: 700, k: 3400, na: 2000, zn: 11, cu: 0.9, se: 55 },
  fat: { fatSat: 20, fatTrans: 2, fatMono: 45, fatPoly: 20, omega3: 2, omega6: 10, colest: 300 },
};

/** Target piatti per Profilo Utente (salvati su Firebase). Fallback per l'app quando non ci sono target custom. */
export const DEFAULT_TARGETS = {
  kcal: 2000, prot: 150, carb: 200, fatTotal: 60, fibre: 30,
  vitc: 90, vitD: 20, omega3: 1.5, mg: 400, k: 3000, fe: 18, ca: 1000, water: 2500,
};

/** Elenco piatto di tutte le chiavi nutrizionali (macro + amino + vit + min + fat) per iterazione */
export const ALL_NUTRIENT_KEYS = Object.values(TARGETS).flatMap((g) => Object.keys(g));

/** Alias legacy su voci diario → chiave canonica TARGETS (somma widget Home). */
const LOG_ITEM_NUTRIENT_ALIASES = {
  vitB2: ['b2'],
  vitB6: ['b6'],
  fibre: ['fibreTotali', 'fiber'],
  na: ['sodium', 'sale'],
  fatTotal: ['fat', 'fatTot'],
};

const SALT_G_TO_SODIUM_MG = 393.4;

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} key — chiave canonica TARGETS
 * @returns {number | null}
 */
export function readLogItemNutrient(item, key) {
  if (!item || typeof item !== 'object') return null;

  if (key === 'fatTotal') {
    const fat = item.fatTotal ?? item.fat ?? item.fatTot;
    return fat != null && typeof fat === 'number' && Number.isFinite(fat) ? fat : null;
  }

  const direct = item[key];
  if (direct != null && typeof direct === 'number' && Number.isFinite(direct)) return direct;

  for (const alias of LOG_ITEM_NUTRIENT_ALIASES[key] || []) {
    const raw = item[alias];
    if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    if (key === 'na' && alias === 'sale') {
      return Math.round(raw * SALT_G_TO_SODIUM_MG * 100) / 100;
    }
    return raw;
  }

  return null;
}

/**
 * Inizializza un oggetto totali con tutte le chiavi nutrizionali a 0.
 */
export function buildEmptyTotali() {
  const init = { kcal: 0, workout: 0 };
  ALL_NUTRIENT_KEYS.forEach((k) => { init[k] = 0; });
  return init;
}

/**
 * Somma i nutrienti da dailyLog (food e recipe) e workout.
 * Ogni singolo item viene iterato con ALL_NUTRIENT_KEYS: nessun dato biochimico perso.
 * @param {unknown} dailyLog
 */
export function computeTotali(dailyLog) {
  const totali = buildEmptyTotali();
  let workoutKcal = 0;
  const log = Array.isArray(dailyLog) ? dailyLog : [];
  log.forEach((item) => {
    if (item.type === 'food' || item.type === 'recipe') {
      if (isUnresolvedMealDraftItem(item)) return;
      totali.kcal += Number(item.kcal || item.cal || 0) || 0;
      ALL_NUTRIENT_KEYS.forEach((k) => {
        const raw = readLogItemNutrient(item, k);
        if (raw != null) totali[k] += raw;
      });
    } else if (item.type === 'stimulant' || item.type === 'energizer') {
      const kcal = Number(item.kcal || item.cal || 0) || 0;
      const carb = Number(item.carb || item.carbs || 0) || 0;
      if (item.isFastingSafe === true || (kcal <= 5 && carb <= 0)) return;
      totali.kcal += kcal;
      ALL_NUTRIENT_KEYS.forEach((k) => {
        const raw = readLogItemNutrient(item, k);
        if (raw != null) totali[k] += raw;
      });
    } else if (item.type === 'workout') {
      workoutKcal += Number(item.kcal || item.cal || 0) || 0;
    }
  });
  totali.workout = workoutKcal;
  return totali;
}
