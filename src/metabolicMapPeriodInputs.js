import { getTodayString } from './coreEngine';

/** Allineato a {@link metabolicDirectionEngine.TIMEFRAME_DAY_WINDOW}. */
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
 * Serie tracker 0–100 → asse mappa −100…+100 (sedentarietà ↔ sovrallenamento).
 *
 * @param {number} mean01to100
 */
function trainingLoadAxisFromMean(mean01to100) {
  const m = clamp(Number(mean01to100) || 0, 0, 100);
  return clamp(m * 2 - 100, -100, 100);
}

/**
 * Input per {@link calculateMetabolicMapPosition}: medie sul periodo bussola + instabilità glicemica teorica.
 * L’instabilità cresce con sonno basso, surplus calorico medio e variabilità del bilancio giornaliero.
 *
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} timeframe
 * @returns {{ energyBalance: number, trainingLoad: number, sleepHours: number, glycemicInstability: number }}
 */
export function computeMetabolicMapInputsFromDailyHistory(dailyHistory, timeframe = '7d') {
  const slice = getWindowSlice(dailyHistory, timeframe);
  if (slice.length === 0) {
    return {
      energyBalance: 0,
      trainingLoad: 0,
      sleepHours: 8,
      glycemicInstability: 0,
    };
  }

  const kcalBalances = slice.map((d) => Number(d.kcalBalance) || 0);
  const trainingLoads = slice.map((d) => clamp(Number(d.trainingLoad) || 0, 0, 100));

  const meanKcal = arithmeticMean(kcalBalances);
  const energyBalance = clamp(meanKcal / 5, -100, 100);

  const meanTraining = arithmeticMean(trainingLoads);
  const trainingLoad = trainingLoadAxisFromMean(meanTraining);

  const rawSleep = slice.map((d) => {
    if (d.sleepHours == null) return null;
    const h = Number(d.sleepHours);
    if (!Number.isFinite(h) || h <= 0) return null;
    return clamp(h, 0, 12);
  });
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
    energyBalance,
    trainingLoad,
    sleepHours,
    glycemicInstability,
  };
}
