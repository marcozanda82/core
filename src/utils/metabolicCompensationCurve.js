/**
 * Curva di Compensazione Metabolica (Ghost Car) — rolling 7 giorni.
 * Ghost = Σ deltaKcal pianificati (target − base).
 * Reale = Σ (intake − baseTDEE).
 */

import { addDays } from '../calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  getYesterdayString,
  TRACKER_STORICO_KEY,
} from '../coreEngine';
import { computeDayEnergySnapshot } from '../features/energyBalance/energyBalanceMath';
import { resolveTargetConfigForDate } from '../features/salaComandi/engines/bodyMetricsEngine';
import { dayHasFoodLog, isDayIntentionalFast } from './dayTrackingStatus';

export const METABOLIC_TREND_WINDOW_DAYS = 7;
export const GHOST_CORRIDOR_HALF_WIDTH_KCAL = 300;

/**
 * Ancora della finestra Ghost Car: sempre ieri (cicli metabolici chiusi).
 * Oggi è escluso — i log parziali genererebbero un finto deficit.
 * @param {string | null | undefined} requestedEndIso
 * @returns {string} ISO YYYY-MM-DD ≤ ieri
 */
export function resolveMetabolicTrendEndDate(requestedEndIso) {
  const yesterday = getYesterdayString();
  const today = getTodayString();
  const requested = String(requestedEndIso || '').slice(0, 10);
  if (!requested || requested >= today || requested > yesterday) {
    return yesterday;
  }
  return requested;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function shortDayLabel(iso) {
  const d = String(iso || '').slice(0, 10);
  const [, m, day] = d.split('-');
  if (!m || !day) return d || '—';
  return `${day}/${m}`;
}

/**
 * Risolve baseKcal (TDEE) e targetKcal per un giorno.
 * @param {object} targetsResolved — da resolveTargetConfigForDate
 * @param {number} fallbackBase
 * @returns {{ baseKcal: number, targetKcal: number, deltaKcal: number }}
 */
export function resolveDayCalorieSplit(targetsResolved, fallbackBase = 2000) {
  const base = Math.round(
    Number(targetsResolved?.baseKcal)
    || Number(fallbackBase)
    || Number(targetsResolved?.kcal)
    || 2000,
  );
  const target = Math.round(
    Number(targetsResolved?.targetKcal)
    || Number(targetsResolved?.kcal)
    || base,
  );
  const delta = Number.isFinite(Number(targetsResolved?.deltaKcal))
    ? Math.round(Number(targetsResolved.deltaKcal))
    : target - base;
  return {
    baseKcal: Math.max(800, base),
    targetKcal: Math.max(800, target),
    deltaKcal: delta,
  };
}

/**
 * Serie cumulativa Ghost Car / traiettoria reale (più vecchio → più recente).
 * Finestra chiusa su ieri: [ieri − (N−1)] … [ieri]. Oggi escluso del tutto.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   windowDays?: number,
 *   corridorHalfWidth?: number,
 *   endDateIso?: string | null,
 * }} input
 */
export function buildMetabolicCompensationSeries(input = {}) {
  const windowDays = Math.max(
    2,
    Math.min(30, Math.round(Number(input.windowDays) || METABOLIC_TREND_WINDOW_DAYS)),
  );
  const corridor = Math.max(
    50,
    Math.round(Number(input.corridorHalfWidth) || GHOST_CORRIDOR_HALF_WIDTH_KCAL),
  );
  const todayIso = getTodayString();
  const endIso = resolveMetabolicTrendEndDate(input.endDateIso);
  const tree = input.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : {};
  const userTargets = input.userTargets && typeof input.userTargets === 'object'
    ? input.userTargets
    : {};
  const activeDate = String(input.activeDate || '').slice(0, 10);
  const activeLog = Array.isArray(input.activeLog) ? input.activeLog : [];
  // Non iniettare mai il log live di oggi nella serie (giornata incompleta).
  const canUseActiveLog = Boolean(
    activeDate
    && activeDate !== todayIso
    && activeDate <= endIso
    && activeLog.length,
  );

  const profileFallback = Math.round(
    Number(userTargets.baseKcal)
    || Number(userTargets.kcal)
    || 2000,
  );

  /** @type {Array<object>} */
  const points = [];
  let cumGhost = 0;
  let cumReal = 0;

  for (let back = windowDays - 1; back >= 0; back -= 1) {
    const dateKey = addDays(endIso, -back);
    // Hard skip: oggi non entra mai nel cumulativo
    if (dateKey >= todayIso) continue;

    const dayNode = tree[TRACKER_STORICO_KEY(dateKey)];
    const log = (
      canUseActiveLog && activeDate === dateKey
        ? activeLog
        : (getLogFromStoricoTree(tree, dateKey) || [])
    );
    const intentional = isDayIntentionalFast(dayNode);
    const hasFood = dayHasFoodLog(log);

    const dayTargets = resolveTargetConfigForDate({
      targets: userTargets,
      date: dateKey,
      todayDate: todayIso,
    });
    const split = resolveDayCalorieSplit(dayTargets, profileFallback);

    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal: split.targetKcal,
      date: dateKey,
      isIntentionalFast: intentional,
    });

    const plannedDelta = split.deltaKcal;
    // Surplus/deficit reale vs TDEE base (non vs target del giorno).
    // Giorni Null (senza cibo né digiuno): restano sulla Ghost (neutri).
    const hasTrackable = hasFood || intentional || snapshot.hasTrackableData;
    let actualDelta;
    if (hasTrackable) {
      actualDelta = Math.round(Number(snapshot.intakeKcal) || 0) - split.baseKcal;
    } else {
      actualDelta = plannedDelta;
    }

    cumGhost += plannedDelta;
    cumReal += actualDelta;

    const deviation = cumReal - cumGhost;
    const inCorridor = Math.abs(deviation) <= corridor;
    const ghostLower = cumGhost - corridor;

    points.push({
      date: dateKey,
      label: shortDayLabel(dateKey),
      dayIndex: windowDays - back,
      baseKcal: split.baseKcal,
      targetKcal: split.targetKcal,
      plannedDelta,
      actualDelta,
      intakeKcal: Math.round(Number(snapshot.intakeKcal) || 0),
      ghost: cumGhost,
      real: cumReal,
      ghostLower,
      ghostUpper: cumGhost + corridor,
      /** Base stacked + ampiezza per Area corridoio Recharts */
      corridorBase: ghostLower,
      corridorWidth: corridor * 2,
      deviation,
      inCorridor,
      hasTrackable,
      stroke: inCorridor ? '#22d3ee' : '#fb923c',
    });
  }

  const latest = points[points.length - 1] || null;
  const adherenceOk = Boolean(latest?.inCorridor);

  return {
    points,
    windowDays,
    corridorHalfWidth: corridor,
    latest,
    adherenceOk,
    endIso,
  };
}

/**
 * Spezza la serie in campi paralleli ciano/arancio (stesso asse X, null dove non appartiene).
 * @param {Array<object>} points
 * @returns {Array<object>}
 */
export function withCompensationStrokeFields(points = []) {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points.map((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const cyanHere = p.inCorridor;
    const orangeHere = !p.inCorridor;
    // Bridge: includi il vertice di confine nel segmento successivo per continuità
    const cyanBridge = Boolean(
      (prev && prev.inCorridor !== p.inCorridor && prev.inCorridor)
      || (next && next.inCorridor !== p.inCorridor && next.inCorridor),
    );
    const orangeBridge = Boolean(
      (prev && prev.inCorridor !== p.inCorridor && !prev.inCorridor)
      || (next && next.inCorridor !== p.inCorridor && !next.inCorridor),
    );
    return {
      ...p,
      realCyan: cyanHere || cyanBridge ? p.real : null,
      realOrange: orangeHere || orangeBridge ? p.real : null,
    };
  });
}

