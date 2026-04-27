function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Scorre il diario a ritroso e restituisce l'ultimo set biometrico completo.
 *
 * @param {Array<{ weight?: number, bodyFat?: number, muscleMass?: number }>} dailyHistory
 * @returns {{ weight: number, bodyFat: number, muscleMass: number } | null}
 */
export function getLastBiometricData(dailyHistory) {
  if (!Array.isArray(dailyHistory) || dailyHistory.length === 0) return null;
  for (let i = dailyHistory.length - 1; i >= 0; i -= 1) {
    const day = dailyHistory[i] || {};
    const weight = Number(day.weight);
    const bodyFat = Number(day.bodyFat);
    const muscleMass = Number(day.muscleMass);
    if (Number.isFinite(weight) && Number.isFinite(bodyFat) && Number.isFinite(muscleMass)) {
      return { weight, bodyFat, muscleMass };
    }
  }
  return null;
}

/**
 * Trasforma i biometrics in offset baseline della mappa.
 *
 * @param {{ weight?: number, bodyFat?: number, muscleMass?: number } | null} biometrics
 * @returns {{ x: number, y: number }}
 */
export function calculateBaselineOffset(biometrics) {
  if (!biometrics) return { x: 0, y: 0 };
  const bodyFat = Number(biometrics.bodyFat);
  const muscleMassScore = Number(biometrics.muscleMass);
  if (!Number.isFinite(bodyFat) || !Number.isFinite(muscleMassScore)) return { x: 0, y: 0 };

  const x = (bodyFat - 15) * 4;
  const y = ((muscleMassScore - 50) * 0.5) - ((bodyFat - 15) * 0.5);
  return {
    x: clamp(x, -100, 100),
    y: clamp(y, -100, 100),
  };
}


/**
 * Calcolo unificato del punto sulla mappa (coordinate, zona, aura, quadrante).
 * Usato sia per lo snapshot corrente sia per ogni giorno della cronologia.
 *
 * @param {{
 *   energyBalance?: number,
 *   trainingLoad?: number,
 *   sleepHours?: number,
 *   glycemicInstability?: number,
 *   baselineOffsetX?: number,
 *   baselineOffsetY?: number
 * }} params
 */
function computeMetabolicMapPoint(params = {}) {
  const {
    energyBalance = 0,
    trainingLoad = 0,
    sleepHours = 8,
    glycemicInstability = 0,
    baselineOffsetX = 0,
    baselineOffsetY = 0,
  } = params;

  let x = energyBalance;
  let y = trainingLoad;

  // Modificatore sonno: abbassa la leptina, alza il cortisolo e aumenta la fame.
  if (sleepHours < 7.5) {
    const sleepDebt = 7.5 - sleepHours;
    y += sleepDebt * 12;
    x += sleepDebt * 6;
  }

  // Baseline strutturale (futuro): offset da composizione corporea (es. body fat / muscle mass).
  x += Number(baselineOffsetX) || 0;
  y += Number(baselineOffsetY) || 0;

  // Le coordinate restano sempre entro i limiti della mappa.
  x = clamp(x, -100, 100);
  y = clamp(y, -100, 100);

  // Aura di base: rappresenta l'instabilita' glicemica percepita dal sistema.
  let finalAura = glycemicInstability;

  // Poco sonno: peggiora la sensibilita' insulinica e amplifica l'infiammazione.
  const auraMultiplier = sleepHours < 7.5
    ? 1 + ((7.5 - sleepHours) * 0.3)
    : 1;

  finalAura = clamp(finalAura * auraMultiplier, 0, 100);

  // Distanza dal centro: misura quanto il profilo si allontana dalla zona di equilibrio.
  const distance = Math.hypot(x, y);

  let zone = 'green';
  if (distance > 70) {
    zone = 'red';
  } else if (distance > 35) {
    zone = 'orange';
  }

  // Quadranti metabolici: combinano asse energetico e asse di carico/stress.
  let quadrant = 'NE';
  if (x < 0 && y >= 0) {
    quadrant = 'NW';
  } else if (x >= 0 && y < 0) {
    quadrant = 'SE';
  } else if (x < 0 && y < 0) {
    quadrant = 'SW';
  }

  return {
    x,
    y,
    finalAura,
    distance,
    zone,
    quadrant,
  };
}

/**
 * Calcola la posizione dell'utente sulla Mappa Metabolica.
 * Restituisce coordinate corrette, intensita' dell'aura e metadati di lettura.
 * `baselineOffsetX/Y` sono opzionali e ora defaultano a 0; serviranno per iniettare
 * la baseline strutturale derivata dalla bilancia (Body Fat % e Muscle Mass).
 */
export function calculateMetabolicMapPosition(params = {}) {
  return computeMetabolicMapPoint(params);
}
