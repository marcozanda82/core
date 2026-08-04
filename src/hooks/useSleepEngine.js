/**
 * Motore fisiologico del sonno — estrae modificatori metabolici dal dailyLog.
 * Input: nodi `type === 'sleep'` (+ eventuali `type === 'nap'` nello stesso array).
 * Output: score di recupero e penalità glicemica/cortisolo.
 *
 * Aggregazione: `totalSleepHours` = somma di TUTTI i blocchi (notte + pisolini).
 * Qualità / mainNightSleep: solo il blocco più lungo (≥ 3h, o il più lungo in fallback).
 */
import { useMemo } from 'react';

/** Sonno ≥ 3 h = notte principale; < 3 h = sonnellino (coreEngine). */
export const NIGHT_SLEEP_MIN_HOURS = 3;

const OPTIMAL_SLEEP_HOURS = 8;
const MIN_RECOVERY_HOURS = 5;

/** Ore decimali da entry `type === 'sleep'` | `nap`. */
export function sleepHoursFromEntry(entry) {
  const hours = Number(
    entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration,
  );
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * Tutti i blocchi riposo: sleep + nap (pisolino Fast Charge / timeline).
 * I nap sono normalizzati a shape sleep per la somma ore (`isNap: true`).
 */
export function extractSleepEntries(dailyLog) {
  const list = Array.isArray(dailyLog) ? dailyLog : [];
  const sleeps = list.filter((entry) => entry?.type === 'sleep');
  const naps = list
    .filter((entry) => entry?.type === 'nap')
    .map((nap) => {
      const hours = sleepHoursFromEntry(nap);
      return {
        type: 'sleep',
        id: nap.id != null ? nap.id : `nap_${nap.time ?? 'x'}`,
        hours,
        duration: hours,
        sleepHours: hours,
        time: nap.time,
        isNap: true,
        quality: nap.quality,
        sleepQuality: nap.sleepQuality,
      };
    })
    .filter((n) => n.hours > 0);
  return [...sleeps, ...naps];
}

/**
 * Notte principale — per qualità / wake time.
 * Preferisce il blocco ≥ 3h più lungo (esclude i soli nap se esiste una notte).
 */
export function pickMainNightSleepEntry(sleepEntries) {
  if (!sleepEntries.length) return null;
  const nonNap = sleepEntries.filter((e) => e?.isNap !== true);
  const pool = nonNap.length > 0 ? nonNap : sleepEntries;

  let best = null;
  let bestHours = -1;
  pool.forEach((entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours < NIGHT_SLEEP_MIN_HOURS || hours <= bestHours) return;
    bestHours = hours;
    best = entry;
  });
  if (best) return best;
  return pool.reduce((acc, entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (hours <= 0) return acc;
    if (!acc || hours > sleepHoursFromEntry(acc)) return entry;
    return acc;
  }, null);
}

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

function durationRecoveryScore(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  if (hours >= OPTIMAL_SLEEP_HOURS) return 100;
  if (hours <= MIN_RECOVERY_HOURS) return 40;
  const ratio = (hours - MIN_RECOVERY_HOURS) / (OPTIMAL_SLEEP_HOURS - MIN_RECOVERY_HOURS);
  return Math.round(40 + ratio * 60);
}

function computeMetabolicPenalty(recoveryScore, totalSleepHours) {
  if (totalSleepHours <= 0) return 1.15;
  const deficitFactor = Math.max(0, (OPTIMAL_SLEEP_HOURS - totalSleepHours) / OPTIMAL_SLEEP_HOURS);
  const qualityFactor = Math.max(0, (100 - recoveryScore) / 100);
  const raw = 1 + deficitFactor * 0.18 + qualityFactor * 0.12;
  return Math.round(Math.max(1, Math.min(1.3, raw)) * 1000) / 1000;
}

/**
 * Unisce dailyLog + pisolini Fast Charge (`manualNodes` type nap) per lo snapshot.
 * Dedup per id per evitare doppi conteggi se un nap è già nel log.
 */
export function mergeSleepEngineInputLog(dayLog, manualNodesOrExtras = []) {
  const base = Array.isArray(dayLog) ? dayLog : [];
  const extras = (Array.isArray(manualNodesOrExtras) ? manualNodesOrExtras : [])
    .filter((n) => n && n.type === 'nap');
  if (extras.length === 0) return base;
  const seen = new Set(
    base.map((e) => (e?.id != null ? String(e.id) : null)).filter(Boolean),
  );
  const toAdd = extras.filter((n) => {
    if (n?.id == null) return true;
    const id = String(n.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return toAdd.length === 0 ? base : [...base, ...toAdd];
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

  // Totale aggregato: notte + tutti i pisolini / blocchi secondari
  const totalSleepHours = Math.round(
    sleepEntries.reduce((sum, entry) => sum + sleepHoursFromEntry(entry), 0) * 100,
  ) / 100;

  const mainNightHours = mainNightSleep ? sleepHoursFromEntry(mainNightSleep) : 0;

  // Durata → recovery sul TOTALE (un pisolino aggiorna l'Arco)
  const durationScore = durationRecoveryScore(totalSleepHours);
  // Qualità → solo notte principale
  const qualityScore = mainNightSleep
    ? resolveQualityScore(mainNightSleep, mainNightHours)
    : (totalSleepHours > 0 ? durationScore : 0);

  const recoveryScore = totalSleepHours > 0
    ? Math.round(durationScore * 0.55 + qualityScore * 0.45)
    : 0;

  return {
    hasSleepData: sleepEntries.length > 0 && totalSleepHours > 0,
    sleepEntries,
    mainNightSleep,
    totalSleepHours,
    recoveryScore,
    recoveryEfficiency: recoveryScore / 100,
    metabolicPenalty: computeMetabolicPenalty(recoveryScore, totalSleepHours),
  };
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 */
export default function useSleepEngine(dailyLog) {
  return useMemo(() => computeSleepEngineSnapshot(dailyLog), [dailyLog]);
}
