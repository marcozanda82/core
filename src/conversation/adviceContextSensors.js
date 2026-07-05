import { computeTotali } from '../useBiochimico';
import { computeMetabolicMapCompassBundle } from '../features/salaComandi/engines/metabolicMapEngine';
import { formatCurrentSystemTimeContext } from '../features/commandTerminal/conversation/mealSmartDefaults.js';

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function pickTargets(currentAppState) {
  const targets = currentAppState?.userTargets || {};
  const dynamicKcal = Number(currentAppState?.dynamicDailyKcal);
  const kcalTarget = Number.isFinite(dynamicKcal) && dynamicKcal > 0
    ? Math.round(dynamicKcal)
    : Math.round(Number(targets.kcal) || 2000);
  return {
    kcal: kcalTarget,
    pro: Number(targets.prot ?? targets.pro ?? 150) || 150,
    carbo: Number(targets.carb ?? targets.cho ?? 200) || 200,
    fat: Number(targets.fatTotal ?? targets.fat ?? 65) || 65,
  };
}

export function computeRemainingBudgetFromState(currentAppState = {}) {
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const totali = computeTotali(log);
  const targets = pickTargets(currentAppState);
  return {
    kcal: roundMacro(targets.kcal - (Number(totali.kcal) || 0)),
    pro: roundMacro(targets.pro - (Number(totali.prot) || 0)),
    carbo: roundMacro(targets.carbo - (Number(totali.carb) || 0)),
    fat: roundMacro(targets.fat - (Number(totali.fatTotal ?? totali.fat) || 0)),
  };
}

function resolveMetabolicMapBundle(currentAppState = {}) {
  if (currentAppState?.metabolicMapBundle && typeof currentAppState.metabolicMapBundle === 'object') {
    return currentAppState.metabolicMapBundle;
  }

  try {
    return computeMetabolicMapCompassBundle({
      dailyHistory: Array.isArray(currentAppState?.metabolicDailyHistory)
        ? currentAppState.metabolicDailyHistory
        : [],
      bodyMetricsHistory: Array.isArray(currentAppState?.bodyMetricsHistory)
        ? currentAppState.bodyMetricsHistory
        : [],
      fullHistory: currentAppState?.fullHistory || {},
      userTargets: currentAppState?.userTargets || null,
      projectionAnchorDate: currentAppState?.activeDate || null,
      selectedTimeframe: currentAppState?.metabolicTimeframe || '1d',
      currentLog: Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [],
    });
  } catch {
    return null;
  }
}

/**
 * Monitor metabolico + budget residuo per il consulente ADVICE.
 * @param {object} currentAppState
 */
export function buildMetabolicBudgetContext(currentAppState = {}) {
  const remaining = computeRemainingBudgetFromState(currentAppState);
  const targets = pickTargets(currentAppState);
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const consumed = computeTotali(log);
  const bundle = resolveMetabolicMapBundle(currentAppState);
  const metabolicState = bundle?.metabolicState || null;

  const compassLabel =
    bundle?.compassDisplayLabel
    || metabolicState?.metabolicDirection?.displayLabel
    || bundle?.compassSectorLabel
    || null;

  const zone =
    metabolicState?.bodyState?.zone
    || bundle?.mapPositionInertial?.zone
    || null;

  const quadrant =
    metabolicState?.bodyState?.quadrant
    || bundle?.mapPositionInertial?.quadrant
    || bundle?.quadrant
    || null;

  const energyBalance = Number(
    bundle?.energyBalance ?? bundle?.metabolicMapInputs?.energyBalance,
  );
  const trainingLoad = Number(bundle?.trainingLoad ?? bundle?.metabolicMapInputs?.trainingLoad);
  const signalStrength =
    metabolicState?.metabolicDirection?.signalStrength
    ?? bundle?.compassSignalStrength
    ?? null;

  const kcalRemaining = Number(remaining.kcal);
  const isBudgetCritical = !Number.isFinite(kcalRemaining) || kcalRemaining <= 0 || kcalRemaining < 250;

  return {
    remaining,
    targets,
    consumedToday: {
      kcal: roundMacro(consumed.kcal),
      pro: roundMacro(consumed.prot),
      carbo: roundMacro(consumed.carb),
      fat: roundMacro(consumed.fatTotal ?? consumed.fat),
    },
    phase: {
      label: compassLabel,
      zone,
      quadrant,
      energyBalance: Number.isFinite(energyBalance) ? roundMacro(energyBalance) : null,
      trainingLoad: Number.isFinite(trainingLoad) ? roundMacro(trainingLoad) : null,
      signalStrength,
    },
    isBudgetCritical,
    referenceTdeeKcal: Number(bundle?.referenceTdeeKcal) || targets.kcal,
  };
}

/**
 * Normalizza tipo allenamento per il consulente: forza | cardio
 * @param {string} raw
 */
export function normalizeWorkoutTypeLabel(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return 'forza';
  if (t === 'cardio' || t === 'hiit' || t === 'run' || t === 'corsa') return 'cardio';
  if (t === 'pesi' || t === 'forza' || t === 'strength' || t === 'workout') return 'forza';
  if (/cardio|corsa|bike|hiit|spinning|nuot|run/.test(t)) return 'cardio';
  return 'forza';
}

/**
 * @param {object} entry
 * @returns {'forza'|'cardio'}
 */
export function inferWorkoutTypeFromTimelineEntry(entry) {
  if (!entry || typeof entry !== 'object') return 'forza';
  const sub = String(entry.subType || entry.workoutType || entry.kind || '').toLowerCase();
  const title = String(entry.title || entry.label || entry.name || '').toLowerCase();
  const combined = `${sub} ${title}`;
  if (/cardio|corsa|bike|hiit|spinning|nuot|run|zone 2|z2/.test(combined)) return 'cardio';
  return 'forza';
}

/**
 * @param {object} planBlock
 * @returns {'forza'|'cardio'}
 */
export function inferWorkoutTypeFromPlanBlock(planBlock) {
  if (!planBlock) return 'forza';
  const plannerType = planBlock.meta?.plannerWorkoutType;
  if (plannerType) return normalizeWorkoutTypeLabel(plannerType);
  const kind = String(planBlock.activity?.kind || '').toUpperCase();
  if (kind === 'CARDIO') return 'cardio';
  if (kind === 'REST') return 'forza';
  return 'forza';
}

export function resolveDecimalHourFromAppState(currentAppState = {}) {
  const fromState = Number(currentAppState?.decimalHour);
  if (Number.isFinite(fromState)) return fromState;
  return formatCurrentSystemTimeContext().decimalHour;
}
