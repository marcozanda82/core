import { getTodayString } from './coreEngine';

/** Allineato a {@link metabolicDirectionEngine.TIMEFRAME_DAY_WINDOW}. */
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

const EMPTY_MAP_INPUTS = {
  energyBalance: 0,
  trainingLoad: 0,
  sleepHours: 8,
  glycemicInstability: 0,
  realSleepDays: 0,
  totalWindowDays: 0,
};

const EMPTY_RAW_DETAILS = {
  meanKcal: null,
  effectiveMeanKcal: null,
  meanTraining01: null,
  sleepRegisteredMean: null,
  realSleepDays: 0,
  totalWindowDays: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timeframeImpactMultiplier(timeframe) {
  if (timeframe === '30d' || timeframe === '14d') return 1.0;
  if (timeframe === '7d') return 0.75;
  return 0.4; // '1d' (ieri) e fallback conservativo
}

/** ±75 kcal = zona neutra: micro-fluttuazioni giornaliere non devono spostare il segnale energia. */
const CALORIE_NEUTRAL_BAND_KCAL = 75;

/**
 * Bilancio calorico "effettivo" dopo neutral band ±100 kcal e attenuazione.
 * @param {number} kcalBalance
 * @returns {number}
 */
export function applyCalorieNeutralBand(kcalBalance) {
  const k = Number(kcalBalance) || 0;
  if (Math.abs(k) <= CALORIE_NEUTRAL_BAND_KCAL) return 0;
  return Math.sign(k) * (Math.abs(k) - CALORIE_NEUTRAL_BAND_KCAL);
}

/**
 * Asse energia mappa (-100..100): pressione calorica progressiva oltre la banda neutra.
 * Target intuitivi:
 * -150 -> ~15, -300 -> ~35, +300 -> ~35, +500 -> ~60
 *
 * `trainingLoad01to100` è mantenuto in firma per compatibilità chiamanti.
 * @param {number} kcalBalance
 * @param {number} trainingLoad01to100
 * @param {number} impact
 * @returns {number}
 */
export function mapEnergyAxisFromCalorieBalance(kcalBalance, trainingLoad01to100 = 0, impact = 1) {
  void trainingLoad01to100;
  const eff = applyCalorieNeutralBand(kcalBalance);
  const absEff = Math.abs(eff);
  let axisAbs = 0;
  if (absEff <= 75) {
    axisAbs = absEff * 0.2; // 75 -> 15
  } else if (absEff <= 225) {
    axisAbs = 15 + (absEff - 75) * (20 / 150); // 225 -> 35
  } else if (absEff <= 425) {
    axisAbs = 35 + (absEff - 225) * (25 / 200); // 425 -> 60
  } else {
    axisAbs = 60 + (absEff - 425) * 0.08;
  }
  // Timeframe damping molto lieve: mantiene i segnali leggibili tra 1d/7d/14d/30d.
  const timeframeMildImpact = 0.9 + 0.1 * (Number(impact) || 1);
  return clamp(Math.sign(eff) * axisAbs * timeframeMildImpact, -100, 100);
}

function softenGlycemicInstability(raw0to100) {
  const v = clamp(Number(raw0to100) || 0, 0, 100);
  if (v <= 25) return v * 0.45; // basso impatto
  if (v <= 50) return 11.25 + (v - 25) * 0.55; // moderato
  return 25 + (v - 50) * 0.7; // alto, ma non dominante
}

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

function stddevSample(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = arithmeticMean(arr);
  let v = 0;
  for (let i = 0; i < n; i += 1) {
    const d = arr[i] - m;
    v += d * d;
  }
  return Math.sqrt(v / (n - 1));
}

/**
 * Giorni senza sonno registrato: imputazione con media degli altri giorni della finestra; se nessun dato, 8 h.
 *
 * @param {Array<number | null | undefined>} rawHours
 * @returns {number[]}
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
 * Stesso slice e stessa matematica di {@link computeMetabolicMapInputsFromDailyHistory}, con medie diario esposte per audit.
 *
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} timeframe
 * @returns {{
 *   mapInputs: { energyBalance: number, trainingLoad: number, sleepHours: number, glycemicInstability: number, realSleepDays: number, totalWindowDays: number },
 *   rawDetails: { meanKcal: number | null, effectiveMeanKcal: number | null, meanTraining01: number | null, sleepRegisteredMean: number | null, realSleepDays: number, totalWindowDays: number }
 * }}
 */
export function computeMetabolicMapInputsAndAudit(dailyHistory, timeframe = '7d') {
  const impact = timeframeImpactMultiplier(timeframe);
  const slice = getWindowSlice(dailyHistory, timeframe);
  if (slice.length === 0) {
    return {
      mapInputs: { ...EMPTY_MAP_INPUTS },
      rawDetails: { ...EMPTY_RAW_DETAILS },
    };
  }

  const kcalBalances = slice.map((d) => Number(d.kcalBalance) || 0);
  const trainingLoads = slice.map((d) => clamp(Number(d.trainingLoad) || 0, 0, 100));

  const meanKcal = arithmeticMean(kcalBalances);
  const meanTraining = arithmeticMean(trainingLoads);
  const effectiveMeanKcal = applyCalorieNeutralBand(meanKcal);
  // energyBalance = calorie pressure normalizzata su asse -100..+100.
  const energyBalance = mapEnergyAxisFromCalorieBalance(meanKcal, meanTraining, impact);
  // trainingLoad = stimolo allenante positivo puro (0..100).
  const trainingLoad = clamp(meanTraining, 0, 100);

  const rawSleep = slice.map((d) => {
    if (d.sleepHours == null) return null;
    const h = Number(d.sleepHours);
    if (!Number.isFinite(h) || h <= 0) return null;
    return clamp(h, 0, 12);
  });
  const realSleepDays = rawSleep.filter((h) => h != null).length;
  const totalWindowDays = slice.length;

  const knownSleepHours = rawSleep.filter((h) => h != null);
  const sleepRegisteredMean =
    knownSleepHours.length > 0 ? arithmeticMean(knownSleepHours) : null;

  const filledSleep = imputeSleepHoursSeries(rawSleep);
  const sleepHours = clamp(arithmeticMean(filledSleep), 0, 12);

  const ebStd = stddevSample(kcalBalances);
  const varianceFactor = clamp(ebStd / 400, 0, 1);
  const sleepStress = sleepHours < 7.5 ? clamp((7.5 - sleepHours) / 7.5, 0, 1) : 0;
  const surplusFactor = clamp(Math.max(0, meanKcal) / 500, 0, 1);

  const glycemicRaw =
    0.45 * sleepStress + 0.38 * surplusFactor + 0.22 * varianceFactor;
  // glycemicInstability = segnale di stress metabolico (0..100) ammorbidito per non dominare.
  const glycemicInstability = clamp(softenGlycemicInstability(glycemicRaw * 100), 0, 100);

  return {
    mapInputs: {
      energyBalance,
      trainingLoad,
      sleepHours,
      glycemicInstability,
      realSleepDays,
      totalWindowDays,
    },
    rawDetails: {
      meanKcal,
      effectiveMeanKcal,
      meanTraining01: meanTraining,
      sleepRegisteredMean,
      realSleepDays,
      totalWindowDays,
    },
  };
}

/**
 * Input per {@link calculateMetabolicMapPosition}: medie sul periodo bussola + instabilità glicemica teorica.
 * L’instabilità cresce con sonno basso, surplus calorico medio e variabilità del bilancio giornaliero.
 *
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} timeframe
 * @returns {{ energyBalance: number, trainingLoad: number, sleepHours: number, glycemicInstability: number, realSleepDays: number, totalWindowDays: number }}
 */
export function computeMetabolicMapInputsFromDailyHistory(dailyHistory, timeframe = '7d') {
  return computeMetabolicMapInputsAndAudit(dailyHistory, timeframe).mapInputs;
}
