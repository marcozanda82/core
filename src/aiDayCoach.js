/**
 * Analisi del log giornaliero (voci food/recipe/ghost_meal).
 * Nessun suggerimento automatico di pasti: solo metriche per motori che le richiedono.
 */

import { toCanonicalMealType } from './coreEngine';

function isCoachCountableMealEntry(entry) {
  if (!entry) return false;
  return entry.type === 'food' || entry.type === 'recipe' || entry.type === 'ghost_meal';
}

function coachEntryMacros(entry) {
  if (entry?.type === 'ghost_meal') {
    let kcal = Number(entry.kcal ?? entry.cal) || 0;
    let prot = Number(entry.prot ?? entry.proteine) || 0;
    if (kcal <= 0 && Array.isArray(entry.draftFoods)) {
      for (let i = 0; i < entry.draftFoods.length; i += 1) {
        const draft = entry.draftFoods[i];
        kcal += Number(draft?.kcal ?? draft?.cal) || 0;
        prot += Number(draft?.prot ?? draft?.proteine) || 0;
      }
    }
    return { kcal, prot };
  }
  return {
    kcal: Number(entry?.kcal ?? entry?.cal) || 0,
    prot: Number(entry?.prot ?? entry?.proteine) || 0,
  };
}

/**
 * Analizza il log giornaliero (voci food/recipe/ghost_meal — allineato a timeline metabolica).
 * @param {function} toCanon — es. toCanonicalMealType
 */
export function analyzeTodayFromLog(log, toCanon = toCanonicalMealType) {
  const dist = { colazione: 0, pranzo: 0, cena: 0, snack: 0 };
  let totalCalories = 0;
  let totalProt = 0;
  const slots = new Set();
  let foodCount = 0;

  (log || []).forEach((e) => {
    if (!isCoachCountableMealEntry(e)) return;
    foodCount += 1;
    const raw = String(e.mealType || 'snack').split('_')[0];
    const k0 = toCanon(raw);
    const k = ['colazione', 'pranzo', 'cena', 'snack'].includes(k0) ? k0 : 'snack';
    const { kcal, prot } = coachEntryMacros(e);
    totalCalories += kcal;
    totalProt += prot;
    dist[k] += kcal;
    slots.add(k);
  });

  const mealSlotsWithFood = slots.size;
  const breakfastShare = totalCalories > 0 ? dist.colazione / totalCalories : 0;
  const protPerKcal = totalCalories > 0 ? totalProt / totalCalories : 0;

  return {
    totalCalories,
    totalProt,
    calorieDistribution: dist,
    mealSlotsWithFood,
    foodCount,
    breakfastShare,
    protPerKcal,
  };
}
