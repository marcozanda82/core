/**
 * Matrice di distribuzione target per i 4 pasti principali.
 * I valori sono percentuali espresse in decimali (es. 0.3 = 30%).
 * La somma di ogni macro colonna deve essere 1.0.
 */
export const MEAL_DISTRIBUTION_MATRIX = {
  merenda_am: { pro: 0.20, carbo: 0.10, fat: 0.40 },
  pranzo:     { pro: 0.30, carbo: 0.30, fat: 0.30 },
  merenda_pm: { pro: 0.20, carbo: 0.20, fat: 0.15 },
  cena:       { pro: 0.30, carbo: 0.40, fat: 0.15 }
};

/** Ordine canonico dei 4 pasti nella matrice residuo ponderato. */
export const MEAL_DISTRIBUTION_ORDER = ['merenda_am', 'pranzo', 'merenda_pm', 'cena'];

/**
 * Mappa mealType del diario → chiave MEAL_DISTRIBUTION_MATRIX.
 * Snack generico: AM se ora < 14, altrimenti PM.
 */
export function resolveDistributionMealId(mealType, decimalHour = 12) {
  const base = String(mealType || '').split('_')[0].toLowerCase();
  if (MEAL_DISTRIBUTION_MATRIX[base]) return base;
  if (base === 'snack' || base === 'spuntino' || base === 'merenda') {
    const h = Number(decimalHour);
    return Number.isFinite(h) && h >= 14 ? 'merenda_pm' : 'merenda_am';
  }
  return null;
}

/** Id matrice da una voce food/recipe nel log (usa mealTime per snack ambigui). */
export function distributionMealIdFromLogEntry(entry) {
  const base = String(entry?.mealType || '').split('_')[0].toLowerCase();
  if (MEAL_DISTRIBUTION_MATRIX[base]) return base;
  const t = typeof entry?.mealTime === 'number' && !Number.isNaN(entry.mealTime) ? entry.mealTime : 12;
  if (base === 'snack' || base === 'spuntino' || base === 'merenda') {
    return resolveDistributionMealId('snack', t);
  }
  return null;
}

/** Macro assunti oggi in tutti i pasti tranne lo slot matrice corrente (include colazione, ecc.). */
export function sumConsumedMacrosExcludingMeal(log, excludeDistributionId) {
  let pro = 0;
  let carbo = 0;
  let fat = 0;
  (log || []).forEach((e) => {
    if (!e || (e.type !== 'food' && e.type !== 'recipe')) return;
    const slotId = distributionMealIdFromLogEntry(e);
    if (excludeDistributionId && slotId === excludeDistributionId) return;
    pro += Number(e.prot ?? e.proteine) || 0;
    carbo += Number(e.carb ?? e.carboidrati) || 0;
    fat += Number(e.fat ?? e.fatTotal ?? e.grassi) || 0;
  });
  return { pro, carbo, fat };
}

/** Pasti matrice ancora da fare oggi (include il pasto corrente in composizione). */
export function buildRemainingDistributionMeals(log, currentDistributionId) {
  const logged = new Set();
  (log || []).forEach((e) => {
    if (!e || (e.type !== 'food' && e.type !== 'recipe')) return;
    const id = distributionMealIdFromLogEntry(e);
    if (id) logged.add(id);
  });
  return MEAL_DISTRIBUTION_ORDER.filter((id) => id === currentDistributionId || !logged.has(id));
}

/**
 * Calcola i macro target dinamici per un pasto specifico,
 * distribuendo il peso dei macro rimanenti sui pasti ancora da consumare.
 * * @param {string} currentMealId - Es. 'pranzo', 'cena'
 * @param {object} dailyTarget - Es. { pro: 150, carbo: 200, fat: 60 }
 * @param {object} consumedMacros - Es. { pro: 30, carbo: 20, fat: 24 } (Macro già mangiati oggi in ALTRI pasti)
 * @param {array} remainingMeals - Array degli ID dei pasti ancora da fare oggi (incluso quello corrente). Es. ['pranzo', 'merenda_pm', 'cena']
 * @returns {object} - Il target in grammi per il pasto corrente: { pro, carbo, fat }
 */
export const calculateDynamicMealTarget = (currentMealId, dailyTarget, consumedMacros, remainingMeals) => {
  // Se il pasto non è nella matrice (es. un pasto extra imprevisto), restituisce fallback a 0
  if (!MEAL_DISTRIBUTION_MATRIX[currentMealId]) {
    return { pro: 0, carbo: 0, fat: 0 };
  }

  const target = { pro: 0, carbo: 0, fat: 0 };
  const macros = ['pro', 'carbo', 'fat'];

  macros.forEach(macro => {
    // 1. Calcola i grammi rimanenti per la giornata
    const remainingGrams = Math.max(0, dailyTarget[macro] - (consumedMacros[macro] || 0));

    // 2. Calcola il "peso" totale dei pasti rimasti per questo macro
    const totalRemainingWeight = remainingMeals.reduce((sum, mealId) => {
      const weight = MEAL_DISTRIBUTION_MATRIX[mealId] ? MEAL_DISTRIBUTION_MATRIX[mealId][macro] : 0;
      return sum + weight;
    }, 0);

    // 3. Se per qualche motivo il peso residuo è 0 (es. matrice vuota), assegna 0
    if (totalRemainingWeight === 0) {
      target[macro] = 0;
    } else {
      // 4. Formula del Residuo Ponderato: Rimanenti * (Peso Pasto Corrente / Peso Totale Rimanente)
      const currentMealWeight = MEAL_DISTRIBUTION_MATRIX[currentMealId][macro];
      target[macro] = Math.round(remainingGrams * (currentMealWeight / totalRemainingWeight));
    }
  });

  return target;
};
