import { computeMetabolicMapInputsFromDailyHistory } from './metabolicMapPeriodInputs';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


/**
 * Calcolo unificato del punto sulla mappa (coordinate, zona, aura, quadrante).
 * Usato sia per lo snapshot corrente sia per ogni giorno della cronologia.
 *
 * @param {{ energyBalance?: number, trainingLoad?: number, sleepHours?: number, glycemicInstability?: number }} params
 */
function computeMetabolicMapPoint(params = {}) {
  const {
    energyBalance = 0,
    trainingLoad = 0,
    sleepHours = 8,
    glycemicInstability = 0,
  } = params;

  let x = energyBalance;
  let y = trainingLoad;

  // Modificatore sonno: abbassa la leptina, alza il cortisolo e aumenta la fame.
  if (sleepHours < 7.5) {
    const sleepDebt = 7.5 - sleepHours;
    y += sleepDebt * 12;
    x += sleepDebt * 6;
  }

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
 */
export function calculateMetabolicMapPosition(params = {}) {
  return computeMetabolicMapPoint(params);
}

function macroPointForTimeframe(dailyHistory, timeframe) {
  const inputs = computeMetabolicMapInputsFromDailyHistory(dailyHistory, timeframe);
  return computeMetabolicMapPoint(inputs);
}

/**
 * Macro-traiettoria per i 4 periodi UI: 30g → 14g → 7g → ieri.
 * Se periodi adiacenti producono coordinate identiche, i duplicati vengono rimossi.
 *
 * @param {Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @returns {Array<{ x: number, y: number, zone: string, quadrant: string, finalAura: number, distance: number, timeframe: '30d' | '14d' | '7d' | '1d' }>}
 */
export function computeMacroTrajectory(dailyHistory) {
  const macros = [
    { timeframe: '30d', point: macroPointForTimeframe(dailyHistory, '30d') },
    { timeframe: '14d', point: macroPointForTimeframe(dailyHistory, '14d') },
    { timeframe: '7d', point: macroPointForTimeframe(dailyHistory, '7d') },
    { timeframe: '1d', point: macroPointForTimeframe(dailyHistory, '1d') },
  ];

  const out = [];
  for (let i = 0; i < macros.length; i += 1) {
    const { timeframe, point } = macros[i];
    const prev = out[out.length - 1];
    if (prev && prev.x === point.x && prev.y === point.y) continue;
    out.push({
      timeframe,
      x: point.x,
      y: point.y,
      zone: point.zone,
      quadrant: point.quadrant,
      finalAura: point.finalAura,
      distance: point.distance,
    });
  }
  return out;
}
