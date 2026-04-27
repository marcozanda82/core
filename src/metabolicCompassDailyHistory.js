import { addDays } from './calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  getYesterdayString,
} from './coreEngine';
import { computeTotali } from './useBiochimico';

const DEFAULT_WINDOW_DAYS = 30;
/** kcal allenamento / divisore → trainingLoad 0–100 (≈600 kcal → 100). */
const WORKOUT_KCAL_PER_LOAD_UNIT = 6;

/** Sotto questa soglia (ore) il segmento è considerato sonnellino, non notte principale. */
const NIGHT_SLEEP_MIN_HOURS = 3;

/**
 * Durata sonno in ore da una entry `type === 'sleep'` (smartwatch / Mi Fitness / manuale).
 * Accetta anche totalSleep/sleep in minuti se il numero è > 36 (es. 420 → 7 h).
 *
 * @param {Record<string, unknown>} e
 * @returns {number | null}
 */
function sleepHoursFromSleepEntry(e) {
  if (!e || e.type !== 'sleep') return null;
  let h = Number(
    e.hours ?? e.duration ?? e.sleepHours ?? e.totalSleep ?? e.sleep
  );
  if (!Number.isFinite(h) || h <= 0) return null;
  if (h > 36) h /= 60;
  if (h > 24) h /= 60;
  if (!Number.isFinite(h) || h <= 0 || h > 24) return null;
  return h;
}

/**
 * Tra le entry sonno, sceglie la notte principale (≥ {@link NIGHT_SLEEP_MIN_HOURS} h), la più lunga.
 *
 * @param {Array<Record<string, unknown>>} log
 * @returns {number | null} ore di sonno o null se assenti
 */
function mainNightSleepHoursFromLog(log) {
  const sleeps = (log || []).filter((x) => x && x.type === 'sleep');
  if (sleeps.length === 0) return null;
  let best = null;
  let bestH = -1;
  for (const e of sleeps) {
    const h = sleepHoursFromSleepEntry(e);
    if (h != null && h >= NIGHT_SLEEP_MIN_HOURS && h > bestH) {
      bestH = h;
      best = h;
    }
  }
  if (best != null) return best;
  const fallback = sleeps.map(sleepHoursFromSleepEntry).filter((x) => x != null && x > 0);
  if (fallback.length === 0) return null;
  return Math.max(...fallback);
}

/**
 * Serie giornaliera per {@link useMetabolicDirectionEngine}: più vecchio → più recente, ultimo = ieri (calendario).
 * Oggi non compare mai: 1d = solo ieri, 7d = da (ieri − 6) a ieri, 14d / 30d analoghi sul motore.
 *
 * @param {Record<string, unknown>} fullHistory albero tracker (es. `tracker_data` RTDB)
 * @param {string} anchorDateStr mantenuto per compatibilità chiamate (es. `currentTrackerDate`); non estende la finestra a oggi
 * @param {{ kcal?: number }} userTargets target kcal (TDEE di riferimento)
 * @param {{ calorieStrategy?: string }} [options]
 * @param {number} [maxDays=30]
 * @returns {Array<{ date: string, kcalBalance: number, trainingLoad: number, sleepHours?: number | null, consumedKcal?: number, baseTargetKcal?: number, workoutKcal?: number, effectiveTargetKcal?: number, remainingKcal?: number, computedKcalBalance?: number, source?: string }>}
 */
export function buildMetabolicCompassDailyHistory(
  fullHistory,
  anchorDateStr,
  userTargets,
  options = {},
  maxDays = 30
) {
  if (!anchorDateStr || typeof anchorDateStr !== 'string') return [];
  
  // UI: Target Dietetico (Aderenza). Usa calorie_target se calcolato dal motore, altrimenti kcal, fallback a 2000
  const baseTargetKcal = Number(userTargets?.calorie_target || userTargets?.kcal || 2000);
  
  // BUSSOLA: Mantenimento (Fisiologia). Usa il TDEE calcolato dal motore, altrimenti kcal, fallback a 2000
  const physiologicalMaintenanceKcal = Number(userTargets?.tdee || userTargets?.kcal || 2000);

  const today = getTodayString();
  const yesterday = getYesterdayString();
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const out = [];

  for (let i = maxDays - 1; i >= 0; i -= 1) {
    const dStr = addDays(yesterday, -i);
    const log = getLogFromStoricoTree(tree, dStr) || [];
    
    if (log.length === 0) {
      out.push({
        date: dStr, kcalBalance: 0, trainingLoad: 0, sleepHours: null, consumedKcal: 0,
        baseTargetKcal, workoutKcal: 0, effectiveTargetKcal: baseTargetKcal,
        remainingKcal: baseTargetKcal, computedKcalBalance: 0, source: 'home_energy_summary'
      });
      continue;
    }
    
    const t = computeTotali(log);
    const consumedKcal = Number(t.kcal) || 0;
    const wk = Number(t.workout) || 0;
    
    // UI: Target Dietetico (Aderenza)
    const effectiveTargetKcal = baseTargetKcal + wk;
    const remainingKcal = effectiveTargetKcal - consumedKcal;
    
    // BUSSOLA: Target Reale (Fisiologia) basato sul TDEE dell'utente
    const physiologicalEffectiveTarget = physiologicalMaintenanceKcal + wk;
    const kcalBalance = consumedKcal - physiologicalEffectiveTarget;
    
    const trainingLoad = Math.min(100, Math.round(wk / 6));
    const sleepHours = mainNightSleepHoursFromLog(log);
    
    out.push({
      date: dStr,
      kcalBalance, 
      trainingLoad,
      sleepHours,
      consumedKcal,
      baseTargetKcal,
      workoutKcal: wk,
      effectiveTargetKcal,
      remainingKcal,
      computedKcalBalance: kcalBalance,
      source: 'home_energy_summary',
    });
  }
  return out;
}
