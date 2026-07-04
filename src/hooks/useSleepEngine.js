/**
 * Motore fisiologico del sonno — estrae modificatori metabolici dal dailyLog.
 * Input: nodi `type === 'sleep'`. Output: score di recupero e penalità glicemica/cortisolo.
 *
 * Campi sleep supportati in KentuOS (vedi handleSaveSleepModal / commitLogSleepCommand / normalizeSleepEntry):
 * - Identità: type, id
 * - Durata (ore decimali, alias): hours, duration, sleepHours, sleepDuration
 * - Finestra temporale (ore 0–24): sleepStart, bedtime, sleepEnd, wakeTime
 * - Fasi (minuti): deepMin, deepMinutes, deep | remMin, remMinutes, rem
 * - Qualità: quality, sleepQuality, rating (testo) | qualityScore, score, scoreTotal (numero)
 * - Wearable: hr
 */
import { useMemo } from 'react';

/** Sonno ≥ 3 h = notte principale; < 3 h = sonnellino (coreEngine). */
export const NIGHT_SLEEP_MIN_HOURS = 3;

const OPTIMAL_SLEEP_HOURS = 8;
const MIN_RECOVERY_HOURS = 5;

function sleepHoursFromEntry(entry) {
  const hours = Number(
    entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration,
  );
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

function extractSleepEntries(dailyLog) {
  return (Array.isArray(dailyLog) ? dailyLog : []).filter((entry) => entry?.type === 'sleep');
}

function pickMainNightSleepEntry(sleepEntries) {
  if (!sleepEntries.length) return null;
  let best = null;
  let bestHours = -1;
  sleepEntries.forEach((entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours < NIGHT_SLEEP_MIN_HOURS || hours <= bestHours) return;
    bestHours = hours;
    best = entry;
  });
  if (best) return best;
  return sleepEntries.reduce((acc, entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours <= 0) return acc;
    if (!acc || hours > sleepHoursFromEntry(acc)) return entry;
    return acc;
  }, null);
}

/**
 * Punteggio qualità 0–100 da etichetta testuale o numero esplicito.
 * Allineato a resolveLastNightSleepQuality in metabolicStateEngine.
 */
function resolveQualityScore(entry, hours) {
  const numericQuality = Number(
    entry?.qualityScore ?? entry?.score ?? entry?.scoreTotal ?? entry?.quality,
  );
  if (Number.isFinite(numericQuality) && numericQuality >= 0 && numericQuality <= 100) {
    return Math.round(numericQuality);
  }

  const qualityLabel = String(
    entry?.quality ?? entry?.sleepQuality ?? entry?.rating ?? '',
  ).toLowerCase();

  let score = 58;
  if (qualityLabel.includes('ottim') || qualityLabel.includes('eccell')) score = 92;
  else if (qualityLabel.includes('buon') || qualityLabel.includes('good')) score = 78;
  else if (qualityLabel.includes('discret') || qualityLabel.includes('ok')) score = 66;
  else if (
    qualityLabel.includes('scars')
    || qualityLabel.includes('pess')
    || qualityLabel.includes('bad')
  ) {
    score = 26;
  }

  if (hours >= 7.5) score = Math.min(100, score + 8);
  else if (hours >= 6.5) score = Math.min(100, score + 4);
  else if (hours > 0 && hours < 6) score = Math.max(0, score - 18);
  else if (hours > 0 && hours < MIN_RECOVERY_HOURS) score = Math.max(0, score - 32);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score da durata pura: 8 h → 100, < 5 h → 40 (interpolazione lineare).
 */
function durationRecoveryScore(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  if (hours >= OPTIMAL_SLEEP_HOURS) return 100;
  if (hours <= MIN_RECOVERY_HOURS) return 40;
  const ratio = (hours - MIN_RECOVERY_HOURS) / (OPTIMAL_SLEEP_HOURS - MIN_RECOVERY_HOURS);
  return Math.round(40 + ratio * 60);
}

/**
 * Penalità metabolica 1.0–1.3: sonno scarso alza resistenza insulinica / cortisolo simulato.
 */
function computeMetabolicPenalty(recoveryScore, totalSleepHours) {
  if (totalSleepHours <= 0) return 1.15;
  const deficitFactor = Math.max(0, (OPTIMAL_SLEEP_HOURS - totalSleepHours) / OPTIMAL_SLEEP_HOURS);
  const qualityFactor = Math.max(0, (100 - recoveryScore) / 100);
  const raw = 1 + deficitFactor * 0.18 + qualityFactor * 0.12;
  return Math.round(Math.max(1, Math.min(1.3, raw)) * 1000) / 1000;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @returns {{
 *   hasSleepData: boolean,
 *   sleepEntries: Array<Record<string, unknown>>,
 *   mainNightSleep: Record<string, unknown> | null,
 *   totalSleepHours: number,
 *   recoveryScore: number,
 *   recoveryEfficiency: number,
 *   metabolicPenalty: number,
 * }}
 */
export function computeSleepEngineSnapshot(dailyLog) {
  const sleepEntries = extractSleepEntries(dailyLog);
  const mainNightSleep = pickMainNightSleepEntry(sleepEntries);
  const totalSleepHours = sleepEntries.reduce(
    (sum, entry) => sum + sleepHoursFromEntry(entry),
    0,
  );

  const referenceHours = mainNightSleep
    ? sleepHoursFromEntry(mainNightSleep)
    : totalSleepHours;

  const durationScore = durationRecoveryScore(referenceHours);
  const qualityScore = mainNightSleep
    ? resolveQualityScore(mainNightSleep, referenceHours)
    : (referenceHours > 0 ? durationScore : 0);

  const recoveryScore = referenceHours > 0
    ? Math.round(durationScore * 0.55 + qualityScore * 0.45)
    : 0;

  const recoveryEfficiency = recoveryScore / 100;
  const metabolicPenalty = computeMetabolicPenalty(recoveryScore, referenceHours || totalSleepHours);

  return {
    hasSleepData: sleepEntries.length > 0 && totalSleepHours > 0,
    sleepEntries,
    mainNightSleep,
    totalSleepHours: Math.round(totalSleepHours * 100) / 100,
    recoveryScore,
    recoveryEfficiency,
    metabolicPenalty,
  };
}

/**
 * Hook — modificatori fisiologici del sonno per l'Arco Energetico e i motori metabolici.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @returns {ReturnType<typeof computeSleepEngineSnapshot>}
 */
export default function useSleepEngine(dailyLog) {
  return useMemo(() => computeSleepEngineSnapshot(dailyLog), [dailyLog]);
}
