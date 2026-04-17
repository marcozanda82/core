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
 * Serie tracker 0–100 → asse mappa non clampato con baseline mantenimento ~35.
 * 0 ≈ -53.8 (sedentario ma non estremo), 35 = 0, 100 = +100.
 *
 * @param {number} mean01to100
 */
function trainingLoadAxisRawFromMean(mean01to100) {
  const m = clamp(Number(mean01to100) || 0, 0, 100);
  return ((m - 35) / 65) * 100;
}

/**
 * Stesso slice e stessa matematica di {@link computeMetabolicMapInputsFromDailyHistory}, con medie diario esposte per audit.
 *
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} timeframe
 * @returns {{
 *   mapInputs: { energyBalance: number, trainingLoad: number, sleepHours: number, glycemicInstability: number, realSleepDays: number, totalWindowDays: number },
 *   rawDetails: { meanKcal: number | null, meanTraining01: number | null, sleepRegisteredMean: number | null, realSleepDays: number, totalWindowDays: number }
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
  const energyBalance = clamp((meanKcal / 5) * impact, -100, 100);

  const meanTraining = arithmeticMean(trainingLoads);
  const trainingLoad = clamp(trainingLoadAxisRawFromMean(meanTraining) * impact, -100, 100);

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
  const glycemicInstability = clamp(glycemicRaw * 100, 0, 100);

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
