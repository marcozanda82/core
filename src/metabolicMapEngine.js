import { getTodayString } from './coreEngine';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Allineato alla finestra giorni in `metabolicMapPeriodInputs.js`. */
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

function compassHistoryForEngine(days) {
  const today = getTodayString();
  return (days || []).filter((e) => e?.date !== today);
}

function getWindowSlice(days, timeframe) {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safe = compassHistoryForEngine(days);
  if (!safe.length) return [];
  return safe.length <= windowDays ? safe : safe.slice(-windowDays);
}

function arithmeticMean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += arr[i];
  return s / arr.length;
}

/**
 * Serie tracker 0–100 → asse mappa −100…+100 (sedentarietà ↔ sovrallenamento).
 * Stessa scala usata per gli input periodo in `metabolicMapPeriodInputs.js`.
 */
function trainingLoadAxisFromMean(mean01to100) {
  const m = clamp(Number(mean01to100) || 0, 0, 100);
  return clamp(m * 2 - 100, -100, 100);
}

/**
 * Giorni senza sonno: imputazione con media degli altri giorni della finestra; se nessun dato, 8 h.
 * Stessa logica di `imputeSleepHoursSeries` in metabolicMapPeriodInputs.
 */
function imputeSleepHoursSeries(rawHours) {
  const known = rawHours
    .map((x) => (x == null ? null : Number(x)))
    .filter((h) => h != null && Number.isFinite(h) && h > 0);
  const fallback = known.length ? arithmeticMean(known) : 8;
  return rawHours.map((x) => {
    if (x == null || !Number.isFinite(Number(x)) || Number(x) <= 0) return fallback;
    return clamp(Number(x), 0, 12);
  });
}

/**
 * Instabilità glicemica teorica per un singolo giorno, coerente con la formula aggregata in
 * computeMetabolicMapInputsFromDailyHistory (stress sonno, surplus calorico, scostamento dal bilancio medio della finestra).
 *
 * @param {number} dayKcal
 * @param {number} sleepHoursImputed
 * @param {number} windowMeanKcal
 */
function computeTheoreticalGlycemicInstabilityForDay(dayKcal, sleepHoursImputed, windowMeanKcal) {
  const varianceFactor = clamp(Math.abs(dayKcal - windowMeanKcal) / 400, 0, 1);
  const sleepStress =
    sleepHoursImputed < 7.5 ? clamp((7.5 - sleepHoursImputed) / 7.5, 0, 1) : 0;
  const surplusFactor = clamp(Math.max(0, dayKcal) / 500, 0, 1);
  const glycemicRaw = 0.45 * sleepStress + 0.38 * surplusFactor + 0.22 * varianceFactor;
  return clamp(glycemicRaw * 100, 0, 100);
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

/**
 * Traiettoria storica sulla mappa metabolica: una posizione per ogni giorno della finestra (escluso oggi).
 * Ogni punto applica la stessa fisica di {@link calculateMetabolicMapPosition} ai dati di quel giorno.
 *
 * La polilinea che collega i punti in ordine cronologico mostra come il profilo si sia spostato tra i quadranti
 * di rischio (NW/NE/SW/SE): spostamenti lungo l'asse orizzontale riflettono surplus vs deficit energetico nel tempo,
 * mentre l'asse verticale segue carico/stress da allenamento (e debito sonno); così si vede se si tende verso
 * zone più periferiche (rosso) o verso il centro (verde).
 *
 * @param {Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} [timeframe='7d']
 * @returns {Array<{ x: number, y: number, date?: string, zone: string, finalAura: number }>}
 *   Ordinato dal giorno più vecchio al più recente (ieri) all'interno della finestra.
 */
export function computeMetabolicMapHistory(dailyHistory, timeframe = '7d') {
  const slice = getWindowSlice(dailyHistory, timeframe);
  if (!slice.length) return [];
  const EMA_ALPHA = 0.6;
  const EMA_PREV_WEIGHT = 0.4;

  const kcalBalances = slice.map((d) => Number(d.kcalBalance) || 0);
  const meanKcal = arithmeticMean(kcalBalances);

  const rawSleep = slice.map((d) => {
    if (d.sleepHours == null) return null;
    const h = Number(d.sleepHours);
    if (!Number.isFinite(h) || h <= 0) return null;
    return clamp(h, 0, 12);
  });
  const filledSleep = imputeSleepHoursSeries(rawSleep);

  const out = [];
  let prevFilteredX = null;
  let prevFilteredY = null;
  for (let i = 0; i < slice.length; i += 1) {
    const day = slice[i];
    const kcal = kcalBalances[i];
    const energyBalance = clamp(kcal / 5, -100, 100);
    const trainingLoad = trainingLoadAxisFromMean(Number(day.trainingLoad) || 0);
    const sleepHours = filledSleep[i];

    const glycemicInstability = computeTheoreticalGlycemicInstabilityForDay(
      kcal,
      sleepHours,
      meanKcal
    );

    const point = computeMetabolicMapPoint({
      energyBalance,
      trainingLoad,
      sleepHours,
      glycemicInstability,
    });

    const filteredX = prevFilteredX == null
      ? point.x
      : (point.x * EMA_ALPHA) + (prevFilteredX * EMA_PREV_WEIGHT);
    const filteredY = prevFilteredY == null
      ? point.y
      : (point.y * EMA_ALPHA) + (prevFilteredY * EMA_PREV_WEIGHT);

    const distance = Math.hypot(filteredX, filteredY);
    let zone = 'green';
    if (distance > 70) {
      zone = 'red';
    } else if (distance > 35) {
      zone = 'orange';
    }

    prevFilteredX = filteredX;
    prevFilteredY = filteredY;

    out.push({
      x: filteredX,
      y: filteredY,
      date: day.date,
      zone,
      finalAura: point.finalAura,
    });
  }

  return out;
}
