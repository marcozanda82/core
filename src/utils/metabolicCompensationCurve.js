/**
 * Curva di Compensazione Metabolica (Ghost Car) — rolling 7 giorni.
 * Y = target giornaliero (delta/g), non cumulato.
 * Passato: targetManuale. Finestra Autopilota (oggi incluso): targetManuale − dailyCorrection.
 * Dopo il recupero: di nuovo targetManuale. Reale solo sui cicli chiusi (fino a ieri).
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
import { readAutopilotCorrectionFromDayNode } from './rollingCalorieBank';

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
 * Ancora della finestra Ghost Car.
 * Default: ieri (cicli chiusi). Con includeToday: fino a oggi (punto radar).
 * @param {string | null | undefined} requestedEndIso
 * @param {{ includeToday?: boolean }} [opts]
 * @returns {string} ISO YYYY-MM-DD
 */
export function resolveMetabolicTrendEndDate(requestedEndIso, opts = {}) {
  const yesterday = getYesterdayString();
  const today = getTodayString();
  const includeToday = opts.includeToday === true;
  const cap = includeToday ? today : yesterday;
  const requested = String(requestedEndIso || '').slice(0, 10);
  if (!requested) return cap;
  if (requested > cap) return cap;
  if (!includeToday && requested >= today) return yesterday;
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

function corridorFields(ghostTarget, corridor) {
  const center = Math.round(Number(ghostTarget) || 0);
  const ghostLower = center - corridor;
  return {
    ghostLower,
    ghostUpper: center + corridor,
    corridorBase: ghostLower,
    corridorWidth: corridor * 2,
  };
}

/**
 * True se il punto è un ciclo chiuso (storico fino a ieri) con bilancio reale plottabile.
 * @param {object | null | undefined} point
 * @returns {boolean}
 */
export function isClosedRealCyclePoint(point) {
  if (!point || typeof point !== 'object') return false;
  if (point.isOrigin || point.isToday || point.isProjection) return false;
  return point.real != null && Number.isFinite(Number(point.real));
}

/**
 * Ultimo punto a ciclo chiuso (fino a ieri) — SSOT per ΣΔ e fascia.
 * @param {Array<object>} points
 * @returns {object | null}
 */
export function pickClosedSigmaPoint(points = []) {
  if (!Array.isArray(points) || points.length === 0) return null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (isClosedRealCyclePoint(points[i])) return points[i];
  }
  return null;
}

/**
 * Dominio Y: Ghost + fascia ±corridor + reale chiuso. Esclude cicli aperti (oggi).
 * @param {Array<object>} points
 * @param {number} [corridor]
 * @returns {[number, number]}
 */
export function resolveMetabolicTrendYDomain(points = [], corridor = GHOST_CORRIDOR_HALF_WIDTH_KCAL) {
  const band = Math.max(50, Math.round(Number(corridor) || GHOST_CORRIDOR_HALF_WIDTH_KCAL));
  let min = -band;
  let max = band;
  const list = Array.isArray(points) ? points : [];
  for (const p of list) {
    const candidates = [p?.ghost, p?.ghostLower, p?.ghostUpper];
    if (isClosedRealCyclePoint(p)) candidates.push(p.real);
    for (const raw of candidates) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  const pad = 40;
  const lo = Math.floor((min - pad) / 50) * 50;
  const hi = Math.ceil((max + pad) / 50) * 50;
  if (hi <= lo) return [lo, lo + band * 2];
  return [lo, hi];
}

/**
 * Proiezione Ghost Car a scalini (delta giornaliero, non cumulato).
 * Giorni restanti nella finestra Autopilota: `targetManuale − dailyCorrection`.
 * Primo giorno dopo la strategia: `targetManuale`.
 *
 * Es. TM=0, correzione=204, N=2 → [−204, 0]
 *
 * @param {{
 *   targetManuale?: number,
 *   dailyCorrection?: number,
 *   strategyDays?: number,
 * }} [opts]
 * @returns {number[]}
 */
export function projectGhostRientroPath(opts = {}) {
  const targetManuale = Math.round(Number(opts.targetManuale) || 0);
  const dailyCorrection = Math.round(Number(opts.dailyCorrection) || 0);
  const n = Math.max(0, Math.round(Number(opts.strategyDays) || 0));
  if (n < 1) return [];

  const inWindow = Math.round(targetManuale - dailyCorrection);
  const out = [];
  for (let i = 1; i < n; i += 1) {
    out.push(inWindow);
  }
  out.push(targetManuale);
  return out;
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
 * Serie Ghost Car (delta giornaliero) / reale cicli chiusi.
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
 *   includeToday?: boolean,
 *   ghostAutoPilotEnabled?: boolean,
 *   autoCompensationDelta?: number | null,
 *   effectiveDeltaKcal?: number | null,
 *   autopilotDays?: number | null,
 *   autopilotFullRecovery?: boolean,
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
  const includeToday = input.includeToday !== false;
  const autopilotOn = input.ghostAutoPilotEnabled === true;
  const autoDelta = Math.round(Number(input.autoCompensationDelta) || 0);
  const effectiveTodayDelta = input.effectiveDeltaKcal != null && input.effectiveDeltaKcal !== ''
    ? Math.round(Number(input.effectiveDeltaKcal) || 0)
    : ghostDailyDelta + (autopilotOn ? autoDelta : 0);
  const autopilotDays = Math.max(0, Math.round(Number(input.autopilotDays) || 0));
  const autopilotFullRecovery = input.autopilotFullRecovery !== false;

  const todayIso = getTodayString();
  const endIso = resolveMetabolicTrendEndDate(input.endDateIso, { includeToday: false });
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
    && activeDate <= todayIso
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
  let cumReal = 0;
  let closedDays = 0;
  const targetManuale = ghostDailyDelta;
  const dailyCorrection = autopilotOn ? Math.round(targetManuale - effectiveTodayDelta) : 0;
  const inWindowTarget = Math.round(targetManuale - dailyCorrection);
  const applyAutopilot = autopilotOn && autopilotDays >= 1 && dailyCorrection !== 0;

  const windowStartIso = addDays(endIso, -(windowDays - 1));
  const originIso = addDays(windowStartIso, -1);
  points.push({
    date: originIso,
    label: shortDayLabel(originIso),
    dayIndex: 0,
    isOrigin: true,
    isToday: false,
    isProjection: false,
    baseKcal: profileFallback,
    targetKcal: profileFallback,
    plannedDelta: targetManuale,
    actualDelta: null,
    intakeKcal: 0,
    ghost: targetManuale,
    real: null,
    ...corridorFields(targetManuale, corridor),
    deviation: 0,
    inCorridor: true,
    hasTrackable: false,
    simulatedGoal,
    ghostDailyDelta: targetManuale,
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
    const split = resolveDayCalorieSplit(
      settingsBase > 0 ? { ...dayTargets, baseKcal: settingsBase } : dayTargets,
      profileFallback,
    );

    const storedAuto = readAutopilotCorrectionFromDayNode(dayNode);
    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal: split.targetKcal + storedAuto,
      date: dateKey,
      isIntentionalFast: intentional,
    });

    const hasTrackable = hasFood || intentional || snapshot.hasTrackableData;
    const actualDelta = hasTrackable
      ? Math.round(Number(snapshot.intakeKcal) || 0) - split.baseKcal
      : 0;

    cumReal += actualDelta;
    closedDays += 1;
    const ghostY = targetManuale + storedAuto;
    const deviation = actualDelta - ghostY;
    const inCorridor = Math.abs(deviation) <= corridor;

    points.push({
      date: dateKey,
      label: shortDayLabel(dateKey),
      dayIndex: windowDays - back,
      isToday: false,
      isProjection: false,
      baseKcal: split.baseKcal,
      targetKcal: split.targetKcal + storedAuto,
      plannedDelta: ghostY,
      actualDelta,
      intakeKcal: Math.round(Number(snapshot.intakeKcal) || 0),
      ghost: ghostY,
      real: actualDelta,
      ...corridorFields(ghostY, corridor),
      deviation,
      cumulativeDeviation: cumReal - closedDays * targetManuale,
      inCorridor,
      hasTrackable,
      simulatedGoal,
      ghostDailyDelta: targetManuale,
      stroke: inCorridor ? '#22d3ee' : '#fb923c',
    });
  }

  if (includeToday) {
    const dayNode = tree[TRACKER_STORICO_KEY(todayIso)];
    const log = (
      (activeDate === todayIso || !activeDate) && activeLog.length
        ? activeLog
        : (getLogFromStoricoTree(tree, todayIso) || [])
    );
    const intentional = isDayIntentionalFast(dayNode);
    const hasFood = dayHasFoodLog(log);
    const dayTargets = resolveTargetConfigForDate({
      targets: userTargets,
      date: todayIso,
      todayDate: todayIso,
    });
    const split = resolveDayCalorieSplit(
      settingsBase > 0 ? { ...dayTargets, baseKcal: settingsBase } : dayTargets,
      profileFallback,
    );
    const snapshot = computeDayEnergySnapshot({
      log,
      targetKcal: split.targetKcal,
      date: todayIso,
      isIntentionalFast: intentional,
    });
    const hasTrackable = hasFood || intentional || snapshot.hasTrackableData;
    const ghostY = applyAutopilot ? inWindowTarget : targetManuale;
    const inCorridor = Math.abs(ghostY - targetManuale) <= corridor;

    points.push({
      date: todayIso,
      label: 'Oggi',
      dayIndex: windowDays + 1,
      isToday: true,
      isProjection: false,
      openCycle: true,
      baseKcal: split.baseKcal,
      targetKcal: split.targetKcal,
      plannedDelta: ghostY,
      actualDelta: null,
      intakeKcal: Math.round(Number(snapshot.intakeKcal) || 0),
      ghost: ghostY,
      real: null,
      ...corridorFields(ghostY, corridor),
      deviation: ghostY - targetManuale,
      inCorridor,
      hasTrackable,
      simulatedGoal,
      ghostDailyDelta: targetManuale,
      stroke: '#06b6d4',
    });
  }

  if (applyAutopilot && includeToday) {
    const futureGhosts = projectGhostRientroPath({
      targetManuale,
      dailyCorrection,
      strategyDays: autopilotDays,
    });
    futureGhosts.forEach((ghostY, idx) => {
      const dateKey = addDays(todayIso, idx + 1);
      const inCorridor = Math.abs(ghostY - targetManuale) <= corridor;
      points.push({
        date: dateKey,
        label: shortDayLabel(dateKey),
        dayIndex: windowDays + idx + 2,
        isToday: false,
        isProjection: true,
        baseKcal: profileFallback,
        targetKcal: profileFallback,
        plannedDelta: ghostY,
        actualDelta: null,
        intakeKcal: 0,
        ghost: ghostY,
        real: null,
        ...corridorFields(ghostY, corridor),
        deviation: ghostY - targetManuale,
        inCorridor,
        hasTrackable: false,
        simulatedGoal,
        ghostDailyDelta: targetManuale,
        stroke: '#06b6d4',
      });
    });
  }

  const latestClosed = pickClosedSigmaPoint(points);
  const latestToday = points.find((p) => p.isToday) || null;
  const latest = latestToday || latestClosed || points[points.length - 1] || null;
  const sigmaDelta = latestClosed != null ? Math.round(cumReal) : null;
  const adherenceOk = Boolean(latestClosed?.inCorridor);

  return {
    points,
    windowDays,
    corridorHalfWidth: corridor,
    latest,
    latestClosed,
    sigmaDelta,
    adherenceOk,
    endIso,
    simulatedGoal,
    ghostDailyDelta: targetManuale,
    targetManuale,
    targetEffettivo: applyAutopilot ? inWindowTarget : targetManuale,
  };
}

/**
 * @param {Array<object>} points
 * @returns {Array<object>}
 */
export function withCompensationStrokeFields(points = []) {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points.map((p, i) => {
    const realY = isClosedRealCyclePoint(p) ? p.real : (p.isOrigin ? p.real : null);
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
      realCyan: realY != null && (cyanHere || cyanBridge) ? realY : null,
      realOrange: realY != null && (orangeHere || orangeBridge) ? realY : null,
    };
  });
}
