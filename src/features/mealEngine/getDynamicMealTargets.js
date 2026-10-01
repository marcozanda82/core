import { isUnresolvedMealDraftItem } from '../../utils/mealDraftStatus.js';
import {
  countRemainingNutritionalSlots,
  toNutritionalMealSlot,
} from './nutritionalSlots.js';

const BREAKFAST_KCAL_RATIO = 0.22;

export const MEAL_PHYSIO_LUNCH_MIN_FIBRE_G = 12;
export const MEAL_PHYSIO_LUNCH_MAX_SIMPLE_SUGAR_G = 8;
export const MEAL_PHYSIO_DINNER_FAT_CAP_G = 23;
export const MEAL_PHYSIO_DINNER_FAT_CAP_SURPLUS_G = 20;
const MEAL_PHYSIO_SURPLUS_KCAL_THRESHOLD = 50;

const LEGACY_STRATEGY_DELTA = { deficit: -500, pari: 0, surplus: 400 };

function normalizeLegacyStrategy(value) {
  const s = String(value ?? '').toLowerCase().trim();
  if (s === 'mantenimento' || s === 'maintenance' || s === 'pari' || s === 'neutro') return 'pari';
  if (s === 'deficit' || s === 'cut' || s === 'dimagrimento') return 'deficit';
  if (s === 'surplus' || s === 'bulk' || s === 'massa') return 'surplus';
  return 'pari';
}

/** Fallback PlanningWizard: non usare se è già stato passato `effectiveDailyKcal`. */
function applyLegacyStrategyToProfileKcal(profileKcal, strategy) {
  const base = Number(profileKcal) || 2000;
  const norm = normalizeLegacyStrategy(strategy);
  const delta = LEGACY_STRATEGY_DELTA[norm] ?? 0;
  return Math.max(1200, Math.round(base + delta));
}

function sumMacroAllFood(log, macro) {
  const rows = log || [];
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    if (!entry || (entry.type !== 'food' && entry.type !== 'recipe')) continue;
    if (isUnresolvedMealDraftItem(entry)) continue;
    if (macro === 'kcal') sum += Number(entry.kcal ?? entry.cal) || 0;
    else if (macro === 'prot') sum += Number(entry.prot ?? entry.proteine) || 0;
    else if (macro === 'carb') sum += Number(entry.carb ?? entry.carboidrati) || 0;
    else if (macro === 'fat') sum += Number(entry.fatTotal ?? entry.fat ?? entry.grassi) || 0;
    else if (macro === 'fibre') sum += Number(entry.fibre) || 0;
  }
  return sum;
}

function resolveMealEngineDailyKcal(userTargets, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'effectiveDailyKcal')) {
    const explicit = Number(options.effectiveDailyKcal);
    if (Number.isFinite(explicit) && explicit >= 0) {
      return Math.round(explicit);
    }
  }
  let tkcal = Number(userTargets?.kcal ?? 2000) || 2000;
  const strat = options.calorieStrategy;
  if (strat != null && String(strat).trim() !== '') {
    tkcal = applyLegacyStrategyToProfileKcal(tkcal, strat);
  }
  const burn = Number(options.burnedKcalBonus);
  if (Number.isFinite(burn) && burn > 0) {
    tkcal += burn;
  }
  return tkcal;
}

/**
 * Target di riferimento dello slot (non è un limite).
 * Colazione: quota fissa sul target effettivo.
 * Pranzo/snack: residuo / slot rimanenti.
 * Cena: max(0, target effettivo − consumato nel log passato).
 *
 * @param {object} [options]
 * @param {number} [options.effectiveDailyKcal] — target giornaliero già calcolato (Home/Ghost). Se presente non si riapplicano strategia/burn.
 * @param {'deficit'|'pari'|'surplus'} [options.calorieStrategy] — solo fallback se manca effectiveDailyKcal.
 * @param {number} [options.burnedKcalBonus] — solo fallback se manca effectiveDailyKcal.
 */
export function getDynamicMealTargets(currentMealType, dailyLog, userTargets, options = {}) {
  void options.currentDecimalHour;
  const log = Array.isArray(dailyLog) ? dailyLog : [];

  const Tkcal = resolveMealEngineDailyKcal(userTargets, options);
  const Tprot = Number(userTargets?.prot ?? 150) || 150;
  const Tcarb = Number(userTargets?.carb ?? 200) || 200;
  const Tfat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 60) || 60;
  const Tfibre = Number(userTargets?.fibre ?? 30) || 30;

  const baseMt = String(currentMealType || 'pranzo').split('_')[0];
  const canon = toNutritionalMealSlot(baseMt) || baseMt;

  const emptyPhysio = {
    maxSimpleSugarG: null,
    minFibreG: null,
    dinnerFatHardCapG: null,
  };

  if (canon === 'colazione') {
    const rkcal = Tkcal * BREAKFAST_KCAL_RATIO;
    return {
      kcal: Math.round(rkcal),
      prot: 15,
      carb: Math.round(Tcarb * BREAKFAST_KCAL_RATIO * 10) / 10,
      fat: Math.round(Tfat * BREAKFAST_KCAL_RATIO * 10) / 10,
      fibre: Math.max(2, Math.round(Tfibre * BREAKFAST_KCAL_RATIO * 10) / 10),
      ...emptyPhysio,
    };
  }

  const remainingSlots = countRemainingNutritionalSlots(log, canon);

  const consumedKcal = sumMacroAllFood(log, 'kcal');
  const consumedProt = sumMacroAllFood(log, 'prot');
  const consumedCarb = sumMacroAllFood(log, 'carb');
  const consumedFat = sumMacroAllFood(log, 'fat');
  const consumedFibre = sumMacroAllFood(log, 'fibre');

  const remKcal = Tkcal - consumedKcal;
  const remProt = Tprot - consumedProt;
  const remCarb = Tcarb - consumedCarb;
  const remFat = Tfat - consumedFat;
  const remFibre = Tfibre - consumedFibre;

  const kcalSurplus = consumedKcal - Tkcal;
  const dailyInCalorieSurplus = kcalSurplus > MEAL_PHYSIO_SURPLUS_KCAL_THRESHOLD;

  /** Cena: tutto il residuo giornaliero (mai negativo come target). Altri pasti: quota su slot rimanenti. */
  let targetKcal =
    canon === 'cena'
      ? Math.max(0, Math.round(remKcal))
      : Math.max(150, Math.round(remKcal / remainingSlots));

  const rawProtTarget = remProt / remainingSlots;
  let targetProt = Math.round(rawProtTarget * 10) / 10;
  if (consumedProt >= Tprot) {
    targetProt = Math.max(20, rawProtTarget);
  } else {
    targetProt = Math.max(10, targetProt);
  }

  const baseCarbResidual = remCarb / remainingSlots;
  const baseFatResidual = remFat / remainingSlots;

  const protKcal = targetProt * 4;
  const remKcalAfterProt = Math.max(80, targetKcal - protKcal);

  const isCena = canon === 'cena';
  const isPranzo = canon === 'pranzo';
  let carbEnergyRatio = 0.41;
  let fatEnergyRatio = 0.38;
  if (isPranzo) {
    carbEnergyRatio = 0.4;
    fatEnergyRatio = 0.34;
  } else if (isCena) {
    carbEnergyRatio = dailyInCalorieSurplus ? 0.54 : 0.5;
    fatEnergyRatio = dailyInCalorieSurplus ? 0.2 : 0.24;
  }

  const carbFromKcal = (remKcalAfterProt * carbEnergyRatio) / 4;
  const fatFromKcal = (remKcalAfterProt * fatEnergyRatio) / 9;

  const blend = 0.55;
  let finalCarb = Math.max(
    5,
    Math.round((carbFromKcal * blend + baseCarbResidual * (1 - blend)) * 10) / 10,
  );
  let finalFat = Math.max(
    3,
    Math.round((fatFromKcal * blend + baseFatResidual * (1 - blend)) * 10) / 10,
  );

  let fibreSlot = Math.max(2, Math.round((remFibre / remainingSlots) * 10) / 10);

  if (isPranzo) {
    fibreSlot = Math.max(MEAL_PHYSIO_LUNCH_MIN_FIBRE_G, fibreSlot);
  }

  if (dailyInCalorieSurplus && (isPranzo || canon === 'snack')) {
    const fatBump = Math.min(8, Math.max(0, remFat) * 0.18);
    if (fatBump > 0) {
      finalFat = Math.round((finalFat + fatBump) * 10) / 10;
    }
  }

  let maxSimpleSugarG = null;
  let minFibreG = null;
  let dinnerFatHardCapG = null;

  if (isPranzo) {
    maxSimpleSugarG = MEAL_PHYSIO_LUNCH_MAX_SIMPLE_SUGAR_G;
    minFibreG = MEAL_PHYSIO_LUNCH_MIN_FIBRE_G;
  }

  if (isCena) {
    dinnerFatHardCapG = dailyInCalorieSurplus ? MEAL_PHYSIO_DINNER_FAT_CAP_SURPLUS_G : MEAL_PHYSIO_DINNER_FAT_CAP_G;
    const preFat = finalFat;
    finalFat = Math.min(finalFat, dinnerFatHardCapG);
    const fatGramsClamped = Math.max(0, preFat - finalFat);
    const kcalShift = fatGramsClamped * 9;
    finalCarb += Math.round(((kcalShift * 0.72) / 4) * 10) / 10;
    targetProt += Math.round(((kcalShift * 0.28) / 4) * 10) / 10;
    targetProt = Math.round(Math.min(55, Math.max(10, targetProt)) * 10) / 10;
    finalCarb = Math.round(Math.max(5, finalCarb) * 10) / 10;
  }

  return {
    kcal: targetKcal,
    prot: targetProt,
    carb: finalCarb,
    fat: finalFat,
    fibre: fibreSlot,
    maxSimpleSugarG,
    minFibreG,
    dinnerFatHardCapG,
  };
}
