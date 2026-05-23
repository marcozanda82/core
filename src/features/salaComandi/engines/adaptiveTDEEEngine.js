/**
 * Motore Matematico per TDEE Adattivo e Topografia Corporea
 */

// Costanti metaboliche
const KCAL_PER_KG_FAT = 7700; // Calorie in 1kg di tessuto adiposo
const KCAL_PER_KG_MUSCLE = 2500; // Costo energetico approssimativo per 1kg di massa magra

/**
 * Calcola le coordinate assolute della mappa (Massa Grassa e Massa Magra in kg)
 * partendo dai dati grezzi della bilancia impedenziometrica.
 *
 * @param {number} weightKg - Peso totale in kg
 * @param {number} bfPercentage - Percentuale di massa grassa (es. 15.5)
 * @returns {{ fatMassKg: number, leanMassKg: number }}
 */
export function calculateBodyComposition(weightKg, bfPercentage) {
  if (!weightKg || !bfPercentage) return { fatMassKg: 0, leanMassKg: 0 };

  const fatMassKg = weightKg * (bfPercentage / 100);
  const leanMassKg = weightKg - fatMassKg;

  return { fatMassKg, leanMassKg };
}

/**
 * Stima il delta di composizione corporea basandosi sullo stile di vita cumulato.
 * Il Vettore "Cometa".
 *
 * @param {number} cumulativeCaloricDelta - Surplus/Deficit calorico cumulato nel periodo (es. -3500)
 * @param {number} proteinAdequacy - Valore da 0 a 1 che indica il rispetto dei target proteici
 * @param {number} trainingStimulus - Valore da 0 a 1 che indica lo stimolo ipertrofico/allenante
 * @returns {{ expectedFatDelta: number, expectedLeanDelta: number }}
 */
export function calculateMetabolicTrajectory(cumulativeCaloricDelta, proteinAdequacy = 1, trainingStimulus = 1) {
  let expectedFatDelta = 0;
  let expectedLeanDelta = 0;

  if (cumulativeCaloricDelta < 0) {
    // Fase di Deficit: Si perde peso.
    // Se le proteine e l'allenamento sono bassi, si perde anche muscolo.
    const musclePreservationFactor = (proteinAdequacy * 0.6) + (trainingStimulus * 0.4);

    // Calcolo semplificato MVP: attribuiamo la maggior parte del deficit al grasso,
    // e penalizziamo la massa magra se la preservazione è bassa.
    const fatDeficitShare = cumulativeCaloricDelta * musclePreservationFactor;
    const leanDeficitShare = cumulativeCaloricDelta * (1 - musclePreservationFactor);

    expectedFatDelta = fatDeficitShare / KCAL_PER_KG_FAT;
    expectedLeanDelta = leanDeficitShare / KCAL_PER_KG_MUSCLE;
  } else {
    // Fase di Surplus: Si guadagna peso.
    // L'allenamento devia il surplus verso la massa magra invece che verso il grasso.
    const muscleGrowthPartition = (trainingStimulus * 0.7) + (proteinAdequacy * 0.3);

    const leanSurplusShare = cumulativeCaloricDelta * muscleGrowthPartition;
    const fatSurplusShare = cumulativeCaloricDelta * (1 - muscleGrowthPartition);

    expectedLeanDelta = leanSurplusShare / KCAL_PER_KG_MUSCLE;
    expectedFatDelta = fatSurplusShare / KCAL_PER_KG_FAT;
  }

  return { expectedFatDelta, expectedLeanDelta };
}

/**
 * Confronta la previsione con la realtà al momento della pesata
 * e restituisce la correzione giornaliera da applicare al TDEE.
 *
 * @param {number} expectedFatDelta - Variazione di grasso prevista (in kg)
 * @param {number} realFatDelta - Variazione di grasso reale misurata dalla bilancia (in kg)
 * @param {number} daysPassed - Giorni trascorsi dall'ultima pesata
 * @returns {number} - Kcal da aggiungere o sottrarre al TDEE base giornaliero
 */
export function reconcileTDEE(expectedFatDelta, realFatDelta, daysPassed) {
  if (daysPassed <= 0) return 0;

  // Trasformiamo i kg di grasso in energia (Kcal)
  const expectedEnergyDelta = expectedFatDelta * KCAL_PER_KG_FAT;
  const realEnergyDelta = realFatDelta * KCAL_PER_KG_FAT;

  // L'errore è la differenza tra l'energia che pensavamo fosse uscita/entrata e quella reale
  const energyError = realEnergyDelta - expectedEnergyDelta;

  // Spalmiamo l'errore sui giorni trascorsi per trovare la deviazione giornaliera del TDEE
  const dailyTDEECorrection = energyError / daysPassed;

  return dailyTDEECorrection;
}

/**
 * Calcola il target ideale di composizione corporea in base a dati biologici e alla rotta scelta.
 */
export function calculateDynamicTarget(gender = 'M', heightCm = 174, route = 'longevity') {
  const heightM = heightCm / 100;
  let baseLeanKg = 0;
  let baseFatKg = 0;

  // Tabelle biologiche di base basate su FFMI (Fat-Free Mass Index) di salute
  if (gender === 'F') {
    // FFMI salute donna ~17.5, BF ~22%
    baseLeanKg = 17.5 * (heightM * heightM);
    baseFatKg = baseLeanKg * (22 / 78);
  } else {
    // FFMI salute uomo ~20.5, BF ~13.5%
    baseLeanKg = 20.5 * (heightM * heightM);
    baseFatKg = baseLeanKg * (13.5 / 86.5);
  }

  // Modificatori in base alla Rotta scelta nel menu
  switch (route) {
    case 'performance':
      // Richiede più struttura muscolare, tollera più grasso
      return { targetLeanKg: baseLeanKg * 1.12, targetFatKg: baseFatKg * 1.15 };
    case 'definition':
      // Richiede massima restrizione di grasso, preservando il muscolo base
      return { targetLeanKg: baseLeanKg, targetFatKg: baseFatKg * 0.75 };
    case 'longevity':
    default:
      // Equilibrio omeostatico perfetto
      return { targetLeanKg: baseLeanKg, targetFatKg: baseFatKg };
  }
}
