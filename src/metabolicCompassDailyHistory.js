import { addDays } from './calendarDateUtils';
import { getLogFromStoricoTree, getTodayString, getYesterdayString, TRACKER_STORICO_KEY } from './coreEngine';
import { computeDayEnergySnapshot } from './features/energyBalance/energyBalanceMath';
import { resolveDayKcalTarget } from './features/energyBalance/resolveDayKcalTarget';
import { dayHasFoodLog, isDayIntentionalFast } from './utils/dayTrackingStatus';

const DEFAULT_WINDOW_DAYS = 30;

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
 * Adapter L3 — serie giornaliera per {@link useMetabolicDirectionEngine}.
 * Delega bilancio e training load a L1/L2; mantiene policy UI sui giorni vuoti.
 *
 * Più vecchio → più recente, ultimo = ieri (calendario). Oggi non compare mai.
 *
 * @param {Record<string, unknown>} fullHistory albero tracker (es. `tracker_data` RTDB)
 * @param {string} anchorDateStr mantenuto per compatibilità chiamate (es. `currentTrackerDate`); non estende la finestra a oggi
 * @param {{ kcal?: number }} userTargets target kcal (TDEE di riferimento)
 * @param {number} [maxDays=30]
 * @returns {Array<{ date: string, kcalBalance: number, trainingLoad: number, sleepHours?: number | null }>}
 */
export function buildMetabolicCompassDailyHistory(
  fullHistory,
  anchorDateStr,
  userTargets,
  maxDays = DEFAULT_WINDOW_DAYS
) {
  if (!anchorDateStr || typeof anchorDateStr !== 'string') return [];
  const profileKcal = Number(userTargets?.kcal ?? 2000);
  if (!Number.isFinite(profileKcal)) return [];

  const today = getTodayString();
  const yesterday = getYesterdayString();
  if (yesterday >= today) return [];

  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const targetContext = { mode: 'profile_static', profileKcal };
  const out = [];

  for (let i = maxDays - 1; i >= 0; i -= 1) {
    const dStr = addDays(yesterday, -i);
    const dayNode = tree[TRACKER_STORICO_KEY(dStr)];
    const log = getLogFromStoricoTree(tree, dStr) || [];
    const intentional = isDayIntentionalFast(dayNode);
    const hasFood = dayHasFoodLog(log);

    // Giorni Null: esclusi dalla serie (non contano come 0 kcal nel divisore).
    if (!hasFood && !intentional && log.length === 0) {
      continue;
    }
    if (!hasFood && !intentional) {
      // Log non alimentare (solo workout/sonno): non usare come media kcal.
      const sleepHours = mainNightSleepHoursFromLog(log);
      if (sleepHours == null) continue;
      out.push({ date: dStr, kcalBalance: null, trainingLoad: null, sleepHours, skipEnergyAverage: true });
      continue;
    }

    const { targetKcal } = resolveDayKcalTarget(dStr, targetContext);
    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal,
      date: dStr,
      isIntentionalFast: intentional,
    });

    const kcalBalance = snapshot.hasTrackableData ? snapshot.kcalBalance : 0;
    const trainingLoad = snapshot.hasTrackableData ? snapshot.trainingLoad : 0;
    const sleepHours = mainNightSleepHoursFromLog(log);

    out.push({ date: dStr, kcalBalance, trainingLoad, sleepHours });
  }

  return out;
}
