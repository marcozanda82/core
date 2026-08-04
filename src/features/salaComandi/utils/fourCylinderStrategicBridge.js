import {
  clamp01,
  fourCylinderFromPhysiologyModel,
  MUSCLE_CYLINDER_IDS,
} from '../engines/fourCylinderEngine';
import { getLastSleepSnapshot } from './fourCylinderTelemetryHistory';
import { getTodayString } from '../../../coreEngine';

/** Pesi cilindri muscolari v2 per il carico medio (gambe leggermente più pesate). */
const MUSCLE_LOAD_WEIGHTS = Object.freeze({
  legs: 0.26,
  chest: 0.20,
  back_shoulders: 0.22,
  arms: 0.16,
  core: 0.16,
});

/**
 * @typedef {object} FourCylinderStrategicMetrics
 * @property {boolean} hasFourCylinder
 * @property {number} systemicFatigue01 0–1
 * @property {number} muscleLoad01 0–1 media ponderata decay
 * @property {number} legs01
 * @property {number} chest01
 * @property {number} backShoulders01
 * @property {number} arms01
 * @property {number} core01
 * @property {number} recoveryIndex01 0–1 (1 = recuperato)
 * @property {number} muscleTrainingLoad01 0–100 (scala pilastri legacy)
 * @property {number} muscleTrainingLoadAxis -100..100 (asse mappa)
 * @property {number} systemicStressPct 0–100
 * @property {'exhaustion' | 'supercompensation' | 'balanced' | null} physiologyPhase
 * @property {number} compassNeedleNudgeDeg
 */

/**
 * Converte indice training 0–100 nello stesso asse usato da metabolicMapPeriodInputs.
 * @param {number} load01
 * @returns {number}
 */
function muscleLoad01ToMapAxis(load01) {
  const meanTraining01 = clamp01(load01) * 100;
  return Math.max(-100, Math.min(100, ((meanTraining01 - 35) / 65) * 100));
}

/** Soglia minima decay muscolare per feedback visivo in fase balanced. */
const BALANCED_MUSCLE_ACTIVATION_THRESHOLD = 0.15;

/**
 * @param {{ r: number, g: number, b: number }} from
 * @param {{ r: number, g: number, b: number }} to
 * @param {number} t 0–1
 */
function mixRgb(from, to, t) {
  const mix = clamp01(t);
  return {
    r: Math.round(from.r + (to.r - from.r) * mix),
    g: Math.round(from.g + (to.g - from.g) * mix),
    b: Math.round(from.b + (to.b - from.b) * mix),
  };
}

/**
 * Intensità 0–1 del feedback visivo muscolare in fase balanced.
 * @param {number} muscleLoad01
 * @returns {number}
 */
function balancedMuscleActivation01(muscleLoad01) {
  if (muscleLoad01 <= BALANCED_MUSCLE_ACTIVATION_THRESHOLD) return 0;
  return clamp01((muscleLoad01 - BALANCED_MUSCLE_ACTIVATION_THRESHOLD) / 0.55);
}

/**
 * @param {unknown} fourCylinderRaw blocco physiology_model.fourCylinder
 * @param {{ todayIso?: string, fullHistory?: object | null }} [options]
 * @returns {FourCylinderStrategicMetrics}
 */
export function buildFourCylinderStrategicMetrics(fourCylinderRaw, options = {}) {
  const empty = {
    hasFourCylinder: false,
    systemicFatigue01: 0,
    muscleLoad01: 0,
    legs01: 0,
    chest01: 0,
    backShoulders01: 0,
    arms01: 0,
    core01: 0,
    recoveryIndex01: 0.5,
    muscleTrainingLoad01: 0,
    muscleTrainingLoadAxis: 0,
    systemicStressPct: 0,
    physiologyPhase: null,
    compassNeedleNudgeDeg: 0,
  };

  if (!fourCylinderRaw || typeof fourCylinderRaw !== 'object') {
    console.log('[StrategicBridge] 4° Pilastro agganciato:', {
      hasFourCylinder: false,
      reason: 'fourCylinder assente o non oggetto',
    });
    return empty;
  }

  const todayIso = String(options.todayIso || getTodayString()).slice(0, 10);
  const state = fourCylinderFromPhysiologyModel({ fourCylinder: fourCylinderRaw }, todayIso);

  const legs01 = clamp01(state.decay?.legs);
  const chest01 = clamp01(state.decay?.chest);
  const backShoulders01 = clamp01(state.decay?.back_shoulders);
  const arms01 = clamp01(state.decay?.arms);
  const core01 = clamp01(state.decay?.core);
  const systemicFatigue01 = clamp01(state.systemic_fatigue);

  const muscleLoad01 = clamp01(
    MUSCLE_CYLINDER_IDS.reduce(
      (sum, id) => sum + clamp01(state.decay?.[id]) * (MUSCLE_LOAD_WEIGHTS[id] || 0),
      0,
    ),
  );

  const sleepSnap = options.fullHistory
    ? getLastSleepSnapshot(options.fullHistory, { todayIso })
    : { found: false, optimizedRecovery: false, isPoorSleep: true };
  const sleepRecoveryBoost = sleepSnap.found && sleepSnap.optimizedRecovery && !sleepSnap.isPoorSleep
    ? 0.12
    : sleepSnap.found && sleepSnap.isPoorSleep
      ? -0.1
      : 0;

  const systemicRecovery = 1 - systemicFatigue01;
  const muscleFreshness = 1 - muscleLoad01;
  const recoveryIndex01 = clamp01(
    systemicRecovery * 0.62
    + muscleFreshness * 0.28
    + Math.max(0, sleepRecoveryBoost),
  );

  const muscleTrainingLoad01 = Math.round(muscleLoad01 * 100);
  const muscleTrainingLoadAxis = muscleLoad01ToMapAxis(muscleLoad01);
  const systemicStressPct = Math.round(systemicFatigue01 * 100);

  let physiologyPhase = 'balanced';
  if (systemicFatigue01 >= 0.65) {
    physiologyPhase = 'exhaustion';
  } else if (muscleLoad01 >= 0.45 && systemicFatigue01 < 0.35) {
    physiologyPhase = 'supercompensation';
  }

  let compassNeedleNudgeDeg = 0;
  if (physiologyPhase === 'exhaustion') {
    compassNeedleNudgeDeg = Math.min(18, 8 + systemicFatigue01 * 12);
  } else if (physiologyPhase === 'supercompensation') {
    compassNeedleNudgeDeg = Math.max(-14, -6 - muscleLoad01 * 8);
  } else if (physiologyPhase === 'balanced') {
    const activation01 = balancedMuscleActivation01(muscleLoad01);
    if (activation01 > 0) {
      compassNeedleNudgeDeg = activation01 * (3.5 + muscleLoad01 * 5.5);
    }
  }

  const result = {
    hasFourCylinder: true,
    systemicFatigue01,
    muscleLoad01,
    legs01,
    chest01,
    backShoulders01,
    arms01,
    core01,
    recoveryIndex01,
    muscleTrainingLoad01,
    muscleTrainingLoadAxis,
    systemicStressPct,
    physiologyPhase,
    compassNeedleNudgeDeg,
  };

  console.log('[StrategicBridge] 4° Pilastro agganciato:', {
    hasFourCylinder: result.hasFourCylinder,
    legs: result.legs01,
    chest: result.chest01,
    back_shoulders: result.backShoulders01,
    arms: result.arms01,
    core: result.core01,
    muscleLoad01: result.muscleLoad01,
    muscleTrainingLoad01: result.muscleTrainingLoad01,
    muscleTrainingLoadAxis: result.muscleTrainingLoadAxis,
    systemicFatigue01: result.systemicFatigue01,
    physiologyPhase: result.physiologyPhase,
    compassNeedleNudgeDeg: result.compassNeedleNudgeDeg,
  });

  return result;
}

/**
 * Sovrascrive trainingLoad e stress sulla mappa quando il 4° Pilastro è disponibile.
 *
 * @param {object} legacyInputs output computeMetabolicMapInputsAndAudit.mapInputs
 * @param {FourCylinderStrategicMetrics | null | undefined} strategic
 * @returns {object}
 */
export function applyStrategicToMapInputs(legacyInputs, strategic) {
  const base = legacyInputs && typeof legacyInputs === 'object' ? { ...legacyInputs } : {};
  if (!strategic?.hasFourCylinder) return base;

  const legacyGlycemic = Number(base.glycemicInstability) || 0;
  const systemicStress = strategic.systemicStressPct;

  return {
    ...base,
    trainingLoad: strategic.muscleTrainingLoadAxis,
    glycemicInstability: Math.max(legacyGlycemic, systemicStress),
    fourCylinderTrainingLoad01: strategic.muscleTrainingLoad01,
    fourCylinderSystemicStressPct: systemicStress,
    fourCylinderRecoveryIndex01: strategic.recoveryIndex01,
  };
}

/**
 * Adatta alone/anello bussola a esaurimento, supercompensazione o carico muscolare in routine.
 *
 * @param {object | null | undefined} ambientStyle output buildCompassAmbientStyle
 * @param {FourCylinderStrategicMetrics | null | undefined} strategic
 * @returns {object | null}
 */
export function applyStrategicToCompassAmbient(ambientStyle, strategic) {
  if (!ambientStyle || typeof ambientStyle !== 'object') return ambientStyle ?? null;
  if (!strategic?.hasFourCylinder) return { ...ambientStyle };

  const next = { ...ambientStyle };

  if (strategic.physiologyPhase === 'exhaustion') {
    next.color = 'rgb(204, 108, 104)';
    next.glowColor = 'rgb(204, 108, 104)';
    next.opacity = Math.max(Number(next.opacity) || 0.45, 0.72);
    next.ringOpacity = Math.max(Number(next.ringOpacity) || 0.45, 0.82);
    next.intensityLabel = 'Fatica sistemica';
  } else if (strategic.physiologyPhase === 'supercompensation') {
    next.color = 'rgb(64, 132, 218)';
    next.glowColor = 'rgb(88, 148, 228)';
    next.opacity = Math.max(Number(next.opacity) || 0.45, 0.58);
    next.ringOpacity = Math.max(Number(next.ringOpacity) || 0.45, 0.68);
    next.intensityLabel = 'Supercompensazione';
  } else if (strategic.physiologyPhase === 'balanced') {
    const activation01 = balancedMuscleActivation01(strategic.muscleLoad01);
    if (activation01 > 0) {
      const warmBias = strategic.muscleLoad01 * 0.58 + strategic.systemicFatigue01 * 0.42;
      const coolBlue = { r: 72, g: 128, b: 210 };
      const warmOrange = { r: 214, g: 128, b: 86 };
      const mixed = mixRgb(coolBlue, warmOrange, warmBias);
      const color = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
      const baseOpacity = Number(next.opacity) || 0.45;
      const baseRing = Number(next.ringOpacity) || 0.45;

      next.color = color;
      next.glowColor = color;
      next.opacity = baseOpacity + activation01 * 0.2;
      next.ringOpacity = baseRing + activation01 * 0.16;
      next.intensityLabel = activation01 > 0.45 ? 'Carico muscolare' : 'Attivazione';
    }
  }

  return next;
}

/**
 * Metriche pilastri legacy arricchite dal 4° Pilastro (ipertrofia / energia).
 *
 * @param {object} legacyMetrics input mapMetricsToPillars
 * @param {FourCylinderStrategicMetrics | null | undefined} strategic
 * @returns {object}
 */
export function applyStrategicToPillarMetrics(legacyMetrics, strategic) {
  const base = legacyMetrics && typeof legacyMetrics === 'object'
    ? { ...legacyMetrics }
    : { ipertrofia: 0, definizione: 0, longevita: 50, energia: 50 };

  if (!strategic?.hasFourCylinder) return base;

  const legacyIpertrofia = Number(base.ipertrofia) || 0;
  const muscleIpertrofia = strategic.muscleTrainingLoad01;
  const blendedIpertrofia = Math.round(legacyIpertrofia * 0.35 + muscleIpertrofia * 0.65);

  const legacyEnergia = Number(base.energia) || 50;
  const recoveryEnergia = Math.round(strategic.recoveryIndex01 * 100);
  const blendedEnergia = Math.round(legacyEnergia * 0.4 + recoveryEnergia * 0.6);

  let longevita = Number(base.longevita) || 50;
  if (strategic.systemicFatigue01 >= 0.65) {
    longevita = Math.round(longevita * 0.75 + (100 - strategic.systemicStressPct) * 0.25);
  }

  return {
    ...base,
    ipertrofia: Math.max(0, Math.min(100, blendedIpertrofia)),
    energia: Math.max(0, Math.min(100, blendedEnergia)),
    longevita: Math.max(0, Math.min(100, longevita)),
  };
}

/**
 * Sposta leggermente le coordinate bolla radar (asse ipertrofia/energia) verso lo stato live.
 *
 * @param {{ x: number, y: number }} coords
 * @param {FourCylinderStrategicMetrics | null | undefined} strategic
 * @param {number} [influence=0.45] quota 0–1 del pull verso assi muscolari/recupero (es. 0.25 su 7d)
 * @returns {{ x: number, y: number }}
 */
export function applyStrategicToBubbleCoords(coords, strategic, influence = 0.45) {
  const base = coords && typeof coords === 'object' ? coords : { x: 0, y: 0 };
  if (!strategic?.hasFourCylinder) return { ...base };

  const w = Math.max(0, Math.min(1, Number(influence) || 0));
  if (w <= 0) return { ...base };

  const muscleAxis = muscleLoad01ToMapAxis(strategic.muscleLoad01);
  const recoveryAxis = (strategic.recoveryIndex01 - 0.5) * 200;
  const legacyW = 1 - w;

  return {
    x: Math.max(-100, Math.min(100, (Number(base.x) || 0) * legacyW + recoveryAxis * w)),
    y: Math.max(-100, Math.min(100, (Number(base.y) || 0) * legacyW + muscleAxis * w)),
  };
}
