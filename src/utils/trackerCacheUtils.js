import { getTodayString, TRACKER_STORICO_KEY } from '../coreEngine';

/** SWR: aggiorna localStorage per il giorno corrente (sync, best-effort). */
export function writeTodayTrackerLocalCache(dateStr, log, mealTimes) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (dateStr !== getTodayString()) return;
  try {
    window.localStorage.setItem(
      TRACKER_STORICO_KEY(dateStr),
      JSON.stringify({ log: log ?? [], mealTimes: mealTimes ?? {} }),
    );
  } catch (err) {
    console.warn('tracker local cache write failed:', err);
  }
}
