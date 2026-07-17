/**
 * L4 — Aggregazione settimanale per la Livella a Bolla.
 * Combina L1 (snapshot giornaliero) e L2 (target da weeklyBlockPlan).
 * Nessuna dipendenza da React o UI.
 */

import { getLogFromStoricoTree, getTodayString, TRACKER_STORICO_KEY } from '../../coreEngine';
import { isDayIntentionalFast } from '../../utils/dayTrackingStatus';
import { aggregateEnergyBalance, computeDayEnergySnapshot } from './energyBalanceMath';
import { resolveDayKcalTarget } from './resolveDayKcalTarget';

/** weekBalance a ±questo valore → bubbleTilt = ±1.0 (range tollerabile 500–1000 kcal/sett.). */
export const WEEKLY_BUBBLE_TILT_REFERENCE_KCAL = 750;

/** Soglia assoluta (kcal/sett.) per considerare il bilancio "in linea" nell'hook UI. */
export const WEEKLY_BUBBLE_INLINE_THRESHOLD_KCAL = 150;

/**
 * @typedef {object} WeeklyBubbleSnapshot
 * @property {number} weekBalance — Σ kcalBalance sui giorni analizzati
 * @property {number} weekTarget — Σ targetKcal
 * @property {number} weekIntake — Σ intakeKcal
 * @property {number} bubbleTilt — weekBalance normalizzato in [−1, +1]
 * @property {number} daysAnalyzed — giorni inclusi (lun→oggi, esclusi i futuri)
 * @property {number} daysWithLog — giorni con log tracker
 * @property {import('./energyBalanceMath').DayEnergySnapshot[]} days — dettaglio per giorno (per UI/debug)
 */

/**
 * Normalizza il bilancio settimanale su scala −1…+1 per la Livella.
 * @param {number} weekBalance
 * @param {number} [referenceKcal]
 * @returns {number}
 */
export function computeWeeklyBubbleTilt(
  weekBalance,
  referenceKcal = WEEKLY_BUBBLE_TILT_REFERENCE_KCAL
) {
  const ref = Math.max(100, Number(referenceKcal) || WEEKLY_BUBBLE_TILT_REFERENCE_KCAL);
  const bal = Number(weekBalance) || 0;
  return Math.max(-1, Math.min(1, bal / ref));
}

/**
 * Deriva lo status testuale del bilancio settimanale.
 * @param {number} weekBalance
 * @param {number} [bubbleTilt]
 * @returns {'surplus' | 'deficit' | 'inline'}
 */
export function deriveWeeklyBalanceStatus(weekBalance, bubbleTilt) {
  const bal = Number(weekBalance) || 0;
  const tilt = Number(bubbleTilt);
  const inlineByBalance = Math.abs(bal) <= WEEKLY_BUBBLE_INLINE_THRESHOLD_KCAL;
  const inlineByTilt = Number.isFinite(tilt) && Math.abs(tilt) < 0.2;

  if (inlineByBalance || inlineByTilt) return 'inline';
  if (bal > 0) return 'surplus';
  return 'deficit';
}

/**
 * Costruisce lo snapshot settimanale per la Livella a Bolla (Opzione 1: target da weeklyBlockPlan).
 *
 * Regole giorni:
 * - **Futuri** (`date > today`): esclusi dall'aggregazione.
 * - **Passati/oggi senza log**: inclusi nel target; bilancio effettivo = 0 (non penalizza la UI).
 * - **Con log**: bilancio canonico `intakeKcal − targetKcal`.
 *
 * @param {object} params
 * @param {Record<string, unknown>} [params.fullHistory] — albero tracker RTDB
 * @param {import('../weeklyBlocks/weeklyBlockSchema').WeeklyBlockPlan | null | undefined} [params.weeklyBlockPlan]
 * @param {number} [params.profileKcal] — TDEE profilo (fallback L2)
 * @param {string[]} params.weekDateKeys — 7 date ISO lun→dom
 * @param {boolean} [params.includeToday=true] — se `false`, esclude il giorno corrente
 * @param {string} [params.todayDate] — ISO oggi (default: calendario locale app)
 * @returns {WeeklyBubbleSnapshot}
 */
export function buildWeeklyBubbleSnapshot({
  fullHistory,
  weeklyBlockPlan,
  profileKcal,
  weekDateKeys,
  includeToday = true,
  todayDate,
}) {
  const today = String(todayDate || getTodayString()).trim();
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const profile = Number(profileKcal);
  const resolvedProfile = Number.isFinite(profile) && profile > 0 ? Math.round(profile) : 2000;
  const keys = Array.isArray(weekDateKeys) ? weekDateKeys.filter((k) => String(k).trim() !== '') : [];

  const targetContext = {
    mode: 'weekly_block',
    profileKcal: resolvedProfile,
    weeklyBlockPlan: weeklyBlockPlan ?? undefined,
  };

  /** @type {import('./energyBalanceMath').DayEnergySnapshot[]} */
  const days = [];

  for (const date of keys) {
    const dateKey = String(date).trim();
    if (!dateKey) continue;
    if (dateKey > today) continue;
    if (!includeToday && dateKey === today) continue;

    const { targetKcal } = resolveDayKcalTarget(dateKey, targetContext);
    const log = getLogFromStoricoTree(tree, dateKey) || [];
    const dayNode = tree[TRACKER_STORICO_KEY(dateKey)];
    const intentional = isDayIntentionalFast(dayNode);
    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal,
      date: dateKey,
      isIntentionalFast: intentional,
    });

    // I Null restano in lista con hasTrackableData=false (esclusi da mean/divisor).
    days.push({
      ...snapshot,
      intakeKcal: snapshot.hasTrackableData ? snapshot.intakeKcal : 0,
      kcalBalance: snapshot.hasTrackableData ? snapshot.kcalBalance : 0,
      trainingLoad: snapshot.hasTrackableData ? snapshot.trainingLoad : 0,
    });
  }

  const agg = aggregateEnergyBalance(days);
  const weekBalance = agg.sumBalance;
  const bubbleTilt = computeWeeklyBubbleTilt(weekBalance);

  return {
    weekBalance,
    weekTarget: agg.sumTarget,
    weekIntake: agg.sumIntake,
    bubbleTilt,
    daysAnalyzed: agg.dayCount,
    daysWithLog: agg.daysWithData,
    days,
  };
}
