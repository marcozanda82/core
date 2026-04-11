import { useMemo } from 'react';

/**
 * TARGET BIOCHIMICI — Tutti i 40+ parametri (macro, aminoacidi, vitamine, minerali, omega).
 * Nessun dato biochimico deve essere perso: ogni chiave è usata per somma e delta correction.
 */
export const TARGETS = {
  macro: { prot: 140, carb: 300, fatTotal: 85, fibre: 30 },
  amino: { leu: 2900, iso: 1500, val: 1900, lys: 2200, met: 1100, phe: 1800, thr: 1100, trp: 300, his: 750 },
  vit: { vitA: 900, vitB1: 1.2, vitB2: 1.3, vitB3: 16, vitB5: 5, vitB6: 1.3, b9: 400, vitB12: 2.4, vitc: 90, vitD: 15, vitE: 15, vitK: 120 },
  min: { ca: 1000, fe: 18, mg: 420, p: 700, k: 3400, na: 2000, zn: 11, cu: 0.9, se: 55 },
  fat: { fatSat: 20, fatTrans: 2, fatMono: 45, fatPoly: 20, omega3: 2, omega6: 10, colest: 300 }
};

/** Target piatti per Profilo Utente (salvati su Firebase). Fallback per l'app quando non ci sono target custom. */
export const DEFAULT_TARGETS = {
  kcal: 2000, prot: 150, carb: 200, fatTotal: 60, fibre: 30,
  vitc: 90, vitD: 20, omega3: 1.5, mg: 400, k: 3000, fe: 18, ca: 1000, water: 2500
};

/** Elenco piatto di tutte le chiavi nutrizionali (macro + amino + vit + min + fat) per iterazione */
const ALL_NUTRIENT_KEYS = Object.values(TARGETS).flatMap(g => Object.keys(g));

/** Ordine pasti per calcolo a cascata (4 pasti ufficiali). */
export const MEAL_ORDER = ['colazione', 'snack', 'pranzo', 'cena'];

/** Peso percentuale ideale per pasto (somma = 1). */
export const MEAL_WEIGHTS = { colazione: 0.2, snack: 0.15, pranzo: 0.35, cena: 0.3 };

const LEGACY_MEAL_TO_BUCKET = {
  merenda1: 'colazione',
  colazione: 'colazione',
  snack: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  spuntino: 'snack',
  pranzo: 'pranzo',
  cena: 'cena',
};

function bucketMealTypeForBio(mt) {
  const base = String(mt || '').split('_')[0];
  return LEGACY_MEAL_TO_BUCKET[base] || (MEAL_ORDER.includes(base) ? base : 'pranzo');
}

/**
 * Restituisce il target giornaliero per una chiave (cerca in tutti i gruppi).
 */
export function getTargetForNutrient(key) {
  for (const group of Object.values(TARGETS)) {
    if (group[key] != null) return group[key];
  }
  return null;
}

/**
 * Inizializza un oggetto totali con tutte le chiavi nutrizionali a 0.
 */
function buildEmptyTotali() {
  const init = { kcal: 0, workout: 0 };
  ALL_NUTRIENT_KEYS.forEach(k => { init[k] = 0; });
  return init;
}

/**
 * Somma i nutrienti da dailyLog (food e recipe) e workout.
 * Ogni singolo item viene iterato con ALL_NUTRIENT_KEYS: nessun dato biochimico perso.
 */
export function computeTotali(dailyLog) {
  const totali = buildEmptyTotali();
  let workoutKcal = 0;
  dailyLog.forEach(item => {
    if (item.type === 'food' || item.type === 'recipe') {
      totali.kcal += Number(item.kcal || item.cal || 0) || 0;
      ALL_NUTRIENT_KEYS.forEach(k => {
        if (item[k] != null && typeof item[k] === 'number') totali[k] += item[k];
      });
    } else if (item.type === 'workout') {
      workoutKcal += Number(item.kcal || item.cal || 0) || 0;
    }
  });
  totali.workout = workoutKcal;
  return totali;
}

const TRACKER_STORICO_PREFIX = 'trackerStorico_';

function getLogArrayFromTrackerNode(node) {
  if (!node || typeof node !== 'object') return [];
  const raw = node.log;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

/**
 * Media giornaliera del nutriente su tutti i giorni con almeno un pasto (tracker_data globale).
 * @returns {number|null} media giornaliera o null se nessuno storico utile
 */
function averageDailyNutrientFromTrackerData(trackerData, key) {
  if (!trackerData || typeof trackerData !== 'object') return null;
  const dayKeys = Object.keys(trackerData).filter(k => k.startsWith(TRACKER_STORICO_PREFIX));
  if (dayKeys.length === 0) return null;
  const samples = [];
  for (const dk of dayKeys) {
    const log = getLogArrayFromTrackerNode(trackerData[dk]);
    if (!log.some(e => e && (e.type === 'food' || e.type === 'recipe'))) continue;
    const totali = computeTotali(log);
    let v;
    if (key === 'kcal' || key === 'cal') v = Number(totali.kcal || 0) || 0;
    else v = totali[key] != null && typeof totali[key] === 'number' ? totali[key] : 0;
    if (!Number.isFinite(v)) v = 0;
    samples.push(v);
  }
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

function defaultNutrientQuarterFallback(key) {
  const target = getTargetForNutrient(key);
  if (target != null && target > 0) return target / 4;
  const defT = DEFAULT_TARGETS[key];
  if (defT != null && defT > 0) return defT / 4;
  if (key === 'kcal' || key === 'cal') return 400;
  if (key === 'prot') return 35;
  if (key === 'carb') return 75;
  if (key === 'fatTotal') return 21;
  return 0;
}

/**
 * Stima per pasto: (media giornaliera dallo storico) / 4 se possibile; altrimenti DEFAULT_TARGETS o TARGET / 4.
 * @param {string} key
 * @param {object} [trackerData] — albero Firebase `tracker_data` (chiavi trackerStorico_YYYY-MM-DD)
 */
export function getDefaultNutrientValue(key, trackerData) {
  const avgDaily = averageDailyNutrientFromTrackerData(trackerData, key);
  if (avgDaily != null && avgDaily > 0) return avgDaily / 4;
  return defaultNutrientQuarterFallback(key);
}

/**
 * Consumi per pasto (food e recipe), ordinati per MEAL_ORDER.
 */
function computeConsumedPerMeal(dailyLog) {
  const consumed = {};
  MEAL_ORDER.forEach(m => { consumed[m] = { kcal: 0 }; ALL_NUTRIENT_KEYS.forEach(k => { consumed[m][k] = 0; }); });
  dailyLog.forEach(item => {
    if ((item.type !== 'food' && item.type !== 'recipe') || !item.mealType) return;
    const meal = bucketMealTypeForBio(item.mealType);
    if (!consumed[meal]) consumed[meal] = { kcal: 0 }; ALL_NUTRIENT_KEYS.forEach(k => { if (!consumed[meal][k]) consumed[meal][k] = 0; });
    consumed[meal].kcal += Number(item.kcal || item.cal || 0) || 0;
    ALL_NUTRIENT_KEYS.forEach(k => {
      if (item[k] != null && typeof item[k] === 'number') consumed[meal][k] += item[k];
    });
  });
  return consumed;
}

/**
 * Delta correction (logica a cascata): obiettivi per ogni pasto in base a quanto già consumato.
 * I target dei pasti successivi sono ricalcolati dinamicamente: rimanente = target_giornaliero - consumato_nei_pasti_precedenti.
 */
export function calcolaObiettiviPastoConArray(dailyLog, targetKcal, targetNutrients) {
  const consumedPerMeal = computeConsumedPerMeal(dailyLog);
  const obiettivi = {};
  let remainingKcal = targetKcal;
  let remainingNutrients = { ...targetNutrients };

  MEAL_ORDER.forEach((meal, index) => {
    const weight = MEAL_WEIGHTS[meal];
    const sumWeightsLeft = MEAL_ORDER.slice(index).reduce((s, m) => s + MEAL_WEIGHTS[m], 0);
    const consumed = consumedPerMeal[meal] || { kcal: 0 };

    obiettivi[meal] = { kcal: 0 };
    // Target pasto = rimanente proporzionato al peso del pasto (cascata)
    obiettivi[meal].kcal = Math.max(0, (remainingKcal * weight) / sumWeightsLeft);
    ALL_NUTRIENT_KEYS.forEach(k => {
      const targetVal = targetNutrients[k] != null ? targetNutrients[k] : getTargetForNutrient(k);
      const rem = remainingNutrients[k] != null ? remainingNutrients[k] : (targetVal || 0);
      obiettivi[meal][k] = Math.max(0, (rem * weight) / sumWeightsLeft);
    });

    // Aggiorna rimanenti per i pasti successivi
    remainingKcal -= consumed.kcal || 0;
    ALL_NUTRIENT_KEYS.forEach(k => {
      if (remainingNutrients[k] == null) remainingNutrients[k] = getTargetForNutrient(k) || 0;
      remainingNutrients[k] -= (consumed[k] || 0);
      if (remainingNutrients[k] < 0) remainingNutrients[k] = 0;
    });
  });

  return obiettivi;
}

/**
 * Hook: motore biochimico (totali + obiettivi a cascata).
 * @param {Array} dailyLog - log giornaliero (food + workout)
 * @param {number} targetKcal - target calorico giornaliero
 * @returns {{ totali, obiettiviPasti, targetNutrients }}
 */
export function useBiochimico(dailyLog, targetKcal) {
  const targetNutrients = useMemo(() => {
    const t = {};
    ALL_NUTRIENT_KEYS.forEach(k => { t[k] = getTargetForNutrient(k) ?? 0; });
    return t;
  }, []);

  const totali = useMemo(() => computeTotali(dailyLog), [dailyLog]);

  const obiettiviPasti = useMemo(
    () => calcolaObiettiviPastoConArray(dailyLog, targetKcal, targetNutrients),
    [dailyLog, targetKcal, targetNutrients]
  );

  return { totali, obiettiviPasti, targetNutrients };
}
