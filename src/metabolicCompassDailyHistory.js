import { addDays } from './calendarDateUtils';
import { getLogFromStoricoTree } from './coreEngine';
import { computeTotali } from './useBiochimico';

const DEFAULT_WINDOW_DAYS = 30;
/** kcal allenamento / divisore → trainingLoad 0–100 (≈600 kcal → 100). */
const WORKOUT_KCAL_PER_LOAD_UNIT = 6;

/**
 * Serie giornaliera per {@link useMetabolicDirectionEngine}: più vecchio → più recente, ultimo = giorno ancorato.
 *
 * @param {Record<string, unknown>} fullHistory albero tracker (es. `tracker_data` RTDB)
 * @param {string} anchorDateStr giorno finestra `YYYY-MM-DD` (es. `currentTrackerDate`)
 * @param {{ kcal?: number }} userTargets target kcal (TDEE di riferimento)
 * @param {number} [maxDays=30]
 * @returns {Array<{ kcalBalance: number, trainingLoad: number }>}
 */
export function buildMetabolicCompassDailyHistory(
  fullHistory,
  anchorDateStr,
  userTargets,
  maxDays = DEFAULT_WINDOW_DAYS
) {
  if (!anchorDateStr || typeof anchorDateStr !== 'string') return [];
  const tdee = Number(userTargets?.kcal ?? 2000);
  if (!Number.isFinite(tdee)) return [];

  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const out = [];

  for (let i = maxDays - 1; i >= 0; i -= 1) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(tree, dStr) || [];
    if (log.length === 0) {
      out.push({ kcalBalance: 0, trainingLoad: 0 });
      continue;
    }
    const t = computeTotali(log);
    const kcalBalance = (Number(t.kcal) || 0) - tdee;
    const wk = Number(t.workout) || 0;
    const trainingLoad = Math.min(100, Math.round(wk / WORKOUT_KCAL_PER_LOAD_UNIT));
    out.push({ kcalBalance, trainingLoad });
  }

  return out;
}
