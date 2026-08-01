/**
 * Curva di Compensazione Metabolica (Ghost Car) — rolling 7 giorni.
 * Ghost (simulabile) = Σ delta giornaliero fisso da obiettivo What-If.
 * Reale = Σ (intake − TDEE/base operativa), indipendente dalla simulazione.
 */

import { addDays } from '../calendarDateUtils';
import {
  getLogFromStoricoTree,
  getTodayString,
  getYesterdayString,
  TRACKER_STORICO_KEY,
  CALORIE_STRATEGY_KCAL_DELTA,
  normalizeCalorieStrategyTarget,
} from '../coreEngine';
import { computeDayEnergySnapshot } from '../features/energyBalance/energyBalanceMath';
import { resolveTargetConfigForDate } from '../features/salaComandi/engines/bodyMetricsEngine';
import { dayHasFoodLog, isDayIntentionalFast } from './dayTrackingStatus';

export const METABOLIC_TREND_WINDOW_DAYS = 7;
export const GHOST_CORRIDOR_HALF_WIDTH_KCAL = 300;

/** Obiettivi simulabili (What-If) — allineati a Kentu strategy. */
export const GHOST_SIM_GOALS = Object.freeze(['cut', 'maintain', 'bulk']);

/** Range cursore analogico Ghost Car (kcal/giorno). */
export const GHOST_SIM_DELTA_MIN = -1000;
export const GHOST_SIM_DELTA_MAX = 1000;
export const GHOST_SIM_DELTA_STEP = 50;
/** Soglia smart-label: |Δ| ≤ 100 → Mantenimento. */
export const GHOST_SIM_GOAL_LABEL_THRESHOLD = 100;

/**
 * Delta kcal/giorno per obiettivo simulato (stessi valori di CALORIE_STRATEGY_KCAL_DELTA).
 * @type {Record<'cut'|'maintain'|'bulk', number>}
 */
export const GHOST_SIM_GOAL_DAILY_DELTA = Object.freeze({
  cut: CALORIE_STRATEGY_KCAL_DELTA.deficit,
  maintain: CALORIE_STRATEGY_KCAL_DELTA.pari,
  bulk: CALORIE_STRATEGY_KCAL_DELTA.surplus,
});

/**
 * Normalizza goal/strategy/profile verso 'cut' | 'maintain' | 'bulk'.
 * @param {unknown} value
 * @returns {'cut'|'maintain'|'bulk'}
 */
export function normalizeGhostSimGoal(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'maintain';
  if (
    raw === 'cut'
    || raw === 'deficit'
    || raw === 'lose'
    || raw === 'dimagrimento'
    || raw === 'perdita_grasso'
  ) {
    return 'cut';
  }
  if (
    raw === 'bulk'
    || raw === 'surplus'
    || raw === 'gain'
    || raw === 'massa'
  ) {
    return 'bulk';
  }
  if (raw === 'pari' || raw === 'maintain' || raw === 'maintenance' || raw === 'mantenimento' || raw === 'recomp') {
    return 'maintain';
  }
  const strat = normalizeCalorieStrategyTarget(raw);
  if (strat === 'deficit') return 'cut';
  if (strat === 'surplus') return 'bulk';
  return 'maintain';
}

/**
 * @param {'cut'|'maintain'|'bulk'|string} goal
 * @returns {number}
 */
export function resolveGhostDailyDeltaFromGoal(goal) {
  const g = normalizeGhostSimGoal(goal);
  return Math.round(Number(GHOST_SIM_GOAL_DAILY_DELTA[g]) || 0);
}

/**
 * Clamp + snap al passo del cursore analogico (−1000…1000, step 50).
 * @param {unknown} raw
 * @returns {number}
 */
export function clampGhostSimDelta(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const snapped = Math.round(n / GHOST_SIM_DELTA_STEP) * GHOST_SIM_DELTA_STEP;
  return Math.max(GHOST_SIM_DELTA_MIN, Math.min(GHOST_SIM_DELTA_MAX, snapped));
}

/**
 * Deduce nutritionGoal da delta continuo (smart labels).
 * @param {unknown} delta
 * @returns {'cut'|'maintain'|'bulk'}
 */
export function ghostSimDeltaToGoal(delta) {
  const d = Number(delta) || 0;
  if (d < -GHOST_SIM_GOAL_LABEL_THRESHOLD) return 'cut';
  if (d > GHOST_SIM_GOAL_LABEL_THRESHOLD) return 'bulk';
  return 'maintain';
}

/**
 * Etichetta UI da delta continuo.
 * @param {unknown} delta
 * @returns {'Cut'|'Bulk'|'Mantenimento'}
 */
export function ghostSimDeltaSmartLabel(delta) {
  const g = ghostSimDeltaToGoal(delta);
  if (g === 'cut') return 'Cut';
  if (g === 'bulk') return 'Bulk';
  return 'Mantenimento';
}

/**
 * Mappa goal → strategy Kentu persistibile.
 * @param {'cut'|'maintain'|'bulk'|string} goal
 * @returns {'deficit'|'pari'|'surplus'}
 */
export function ghostSimGoalToKentuStrategy(goal) {
  const g = normalizeGhostSimGoal(goal);
  if (g === 'cut') return 'deficit';
  if (g === 'bulk') return 'surplus';
  return 'pari';
}

/**
 * Mappa delta continuo → strategy Kentu (via smart-label thresholds).
 * @param {unknown} delta
 * @returns {'deficit'|'pari'|'surplus'}
 */
export function ghostSimDeltaToKentuStrategy(delta) {
  return ghostSimGoalToKentuStrategy(ghostSimDeltaToGoal(delta));
}

/**
 * Ancora della finestra Ghost Car: sempre ieri (cicli metabolici chiusi).
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
 * Risolve baseKcal (TDEE operativo) per la traiettoria REALE.
 * @param {object} targetsResolved
 * @param {number} fallbackBase
 * @returns {{ baseKcal: number, targetKcal: number }}
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
  return {
    baseKcal: Math.max(800, base),
    targetKcal: Math.max(800, target),
  };
}

/**
 * Serie cumulativa Ghost (What-If) / traiettoria reale.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   windowDays?: number,
 *   corridorHalfWidth?: number,
 *   endDateIso?: string | null,
 *   simulatedDeltaKcal?: number | null,
 *   simulatedGoal?: string | null,
 *   settingsBaseKcal?: number | null,
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
  const ghostDailyDelta = input.simulatedDeltaKcal != null && input.simulatedDeltaKcal !== ''
    ? clampGhostSimDelta(input.simulatedDeltaKcal)
    : resolveGhostDailyDeltaFromGoal(input.simulatedGoal);
  const simulatedGoal = ghostSimDeltaToGoal(ghostDailyDelta);

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
  const canUseActiveLog = Boolean(
    activeDate
    && activeDate !== todayIso
    && activeDate <= endIso
    && activeLog.length,
  );

  const settingsBase = Math.round(Number(input.settingsBaseKcal) || 0);
  const profileFallback = settingsBase > 0
    ? settingsBase
    : Math.round(
      Number(userTargets.baseKcal)
      || Number(userTargets.kcal)
      || 2000,
    );

  /** @type {Array<object>} */
  const points = [];
  let cumGhost = 0;
  let cumReal = 0;

  // Punto Zero (Giorno 0): origine comune Ghost + Reale prima della finestra.
  const windowStartIso = addDays(endIso, -(windowDays - 1));
  const originIso = addDays(windowStartIso, -1);
  const originGhostLower = 0 - corridor;
  points.push({
    date: originIso,
    label: shortDayLabel(originIso),
    dayIndex: 0,
    isOrigin: true,
    baseKcal: profileFallback,
    targetKcal: profileFallback,
    plannedDelta: 0,
    actualDelta: 0,
    intakeKcal: 0,
    ghost: 0,
    real: 0,
    ghostLower: originGhostLower,
    ghostUpper: 0 + corridor,
    corridorBase: originGhostLower,
    corridorWidth: corridor * 2,
    deviation: 0,
    inCorridor: true,
    hasTrackable: false,
    simulatedGoal,
    ghostDailyDelta,
    stroke: '#22d3ee',
  });

  for (let back = windowDays - 1; back >= 0; back -= 1) {
    const dateKey = addDays(endIso, -back);
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
    // Base operativa per la REALE (impostazioni se disponibili, altrimenti history).
    const split = resolveDayCalorieSplit(
      settingsBase > 0 ? { ...dayTargets, baseKcal: settingsBase } : dayTargets,
      profileFallback,
    );

    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal: split.targetKcal,
      date: dateKey,
      isIntentionalFast: intentional,
    });

    // Ghost What-If: delta fisso dal cursore, MAI da targetHistory.
    const plannedDelta = ghostDailyDelta;

    const hasTrackable = hasFood || intentional || snapshot.hasTrackableData;
    // Traiettoria reale: solo cronaca. Giorni vuoti = 0 (non agganciati alla Ghost simulata).
    let actualDelta;
    if (hasTrackable) {
      actualDelta = Math.round(Number(snapshot.intakeKcal) || 0) - split.baseKcal;
    } else {
      actualDelta = 0;
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
      corridorBase: ghostLower,
      corridorWidth: corridor * 2,
      deviation,
      inCorridor,
      hasTrackable,
      simulatedGoal,
      ghostDailyDelta,
      stroke: inCorridor ? '#22d3ee' : '#fb923c',
    });
  }

  const latest = [...points].reverse().find((p) => !p.isOrigin) || points[points.length - 1] || null;
  const adherenceOk = Boolean(latest?.inCorridor);

  return {
    points,
    windowDays,
    corridorHalfWidth: corridor,
    latest,
    adherenceOk,
    endIso,
    simulatedGoal,
    ghostDailyDelta,
  };
}

/**
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
