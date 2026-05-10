import { buildMetabolicStateFromBundle } from './metabolicStateBuilder.js';

const TOP_LEVEL = [
  'calibration',
  'bodyState',
  'metabolicDirection',
  'trajectory',
  'confidence',
  'persistence',
  'legacy',
];

const CALIBRATION_KEYS = [
  'timeframe',
  'referenceTdeeKcal',
  'energyDeadBandHalfWidthKcal',
  'impactMultiplier',
];

const BODY_KEYS = [
  'position',
  'x',
  'y',
  'zone',
  'quadrant',
  'distance',
  'aura',
  'structuralOffset',
  'periodAudit',
];

const DIRECTION_KEYS = [
  'vector',
  'visualVector',
  'angleDeg',
  'bearingDeg',
  'magnitude',
  'signalStrength',
  'rawSectorLabel',
  'displayLabel',
];

const TRAJECTORY_KEYS = ['dailyPositions', 'projected', 'velocity', 'miniNeedleSemantics'];

const CONFIDENCE_KEYS = ['compassSignalStrength', 'mapPresentation', 'weightProjectionConfidence'];

const PERSISTENCE_KEYS = ['outsideEnergyDeadbandDayFraction'];

const LEGACY_KEYS = ['source', 'rawBundle'];

/**
 * Smoke test manuale / script: non importare dalla UI.
 * Verifica che il builder non lanci e che la forma sia stabile.
 *
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function runMetabolicStateBuilderDevCheck() {
  const errors = [];

  const expectKeys = (obj, keys, label) => {
    if (obj == null || typeof obj !== 'object') {
      errors.push(`${label}: not an object`);
      return;
    }
    for (const k of keys) {
      if (!(k in obj)) errors.push(`${label}: missing key "${k}"`);
    }
  };

  try {
    buildMetabolicStateFromBundle(null);
    buildMetabolicStateFromBundle(undefined);
    buildMetabolicStateFromBundle({});
  } catch (e) {
    errors.push(`empty input threw: ${e?.message ?? e}`);
    return { ok: false, errors };
  }

  try {
    const minimal = {
      selectedTimeframe: '7d',
      referenceTdeeKcal: 2200,
      impactMultiplier: 0.75,
      persistFracOutsideDeadband: 0.25,
      metabolicMapRawDetails: {
        meanKcal: -30,
        energyDeadBandHalfWidthKcal: 100,
        impactMultiplier: 0.75,
      },
      baselineOffset: { x: 0, y: 0 },
      dailyMapPositions: [],
      projectedTrajectory: { projected: { x: 1, y: 2 }, velocity: 0.5 },
      compassDirection: { angleDeg: 45, magnitude: 0.5, x: 0.1, y: 0.4 },
      rawVector: { x: 0.1, y: 0.4 },
      visualVector: { visualX: 1, visualY: 2, visualMagnitude: 3, rawMagnitude: 0.5 },
      rawMagnitude: 0.5,
      compassSectorLabel: 'Massa Pulita',
      compassSignalStrength: 'weak',
      compassDisplayLabel: 'Ricomposizione lieve',
      x: 5,
      y: 10,
      distance: 11,
      quadrant: 'NE',
      lineProjection: null,
      lineTrend: 'Trend: stabile',
      lineConfidence: 'Confidenza: bassa',
      mapPresentation: { displayX: 0, displayY: 0, displayAura: 0 },
      debug: { zone: 'green', finalAura: 22 },
    };

    const state = buildMetabolicStateFromBundle(minimal);

    if (state.calibration.timeframe !== '7d') errors.push('calibration.timeframe expected 7d');
    if (state.calibration.referenceTdeeKcal !== 2200) errors.push('calibration.referenceTdeeKcal expected 2200');
    if (state.calibration.impactMultiplier !== 0.75) errors.push('calibration.impactMultiplier expected 0.75');
    if (state.persistence.outsideEnergyDeadbandDayFraction !== 0.25) {
      errors.push('persistence.outsideEnergyDeadbandDayFraction expected 0.25');
    }

    expectKeys(state, TOP_LEVEL, 'root');

    expectKeys(state.calibration, CALIBRATION_KEYS, 'calibration');
    expectKeys(state.bodyState, BODY_KEYS, 'bodyState');
    expectKeys(state.metabolicDirection, DIRECTION_KEYS, 'metabolicDirection');
    expectKeys(state.trajectory, TRAJECTORY_KEYS, 'trajectory');
    expectKeys(state.confidence, CONFIDENCE_KEYS, 'confidence');
    expectKeys(state.persistence, PERSISTENCE_KEYS, 'persistence');
    expectKeys(state.legacy, LEGACY_KEYS, 'legacy');

    if (state.legacy.source !== 'computeMetabolicMapCompassBundle') {
      errors.push('legacy.source mismatch');
    }
    const lb = state.legacy.rawBundle;
    if (lb == null || typeof lb !== 'object') {
      errors.push('legacy.rawBundle invalid');
    } else if (Object.prototype.hasOwnProperty.call(lb, 'metabolicState')) {
      errors.push('legacy.rawBundle must omit metabolicState');
    } else if (lb.selectedTimeframe !== '7d') {
      errors.push('legacy.rawBundle snapshot mismatch');
    }
    if (state.metabolicDirection.bearingDeg == null) {
      errors.push('expected bearingDeg for angleDeg 45');
    }

    /** Stesso ordine di {@link computeMetabolicMapCompassBundle}: bundle legacy poi campo parallelo. */
    const bundleParallel = { ...minimal };
    bundleParallel.metabolicState = buildMetabolicStateFromBundle(bundleParallel);
    if (bundleParallel.metabolicState == null) {
      errors.push('parallel attach: metabolicState missing');
    } else {
      expectKeys(bundleParallel.metabolicState, TOP_LEVEL, 'parallel metabolicState');
      const snap = bundleParallel.metabolicState.legacy?.rawBundle;
      if (snap != null && typeof snap === 'object' && Object.prototype.hasOwnProperty.call(snap, 'metabolicState')) {
        errors.push('parallel attach: legacy.rawBundle must omit metabolicState');
      }
    }
  } catch (e) {
    errors.push(`mock bundle threw: ${e?.message ?? e}`);
  }

  return { ok: errors.length === 0, errors };
}
