import { metabolicAngleDegToCompassBearingDeg } from '../../../metabolicDirection.js';

/**
 * Fase B-A — adapter puro: legacy bundle → MetabolicState nominato.
 * Nessuna nuova formula metabolica: solo lettura campi già presenti sul bundle.
 *
 * `legacy.rawBundle` mantiene il riferimento all’oggetto originale solo per la migrazione;
 * va rimosso o sostituito con shallow copy quando la pipeline non dipenderà più dal legacy.
 *
 * @param {Record<string, unknown> | null | undefined} bundle Output di
 *   {@link computeMetabolicMapCompassBundle} o oggetto compatibile (campi opzionali extra ok).
 * @returns {MetabolicStateFromBundle}
 */
export function buildMetabolicStateFromBundle(bundle) {
  const b = bundle != null && typeof bundle === 'object' ? bundle : {};

  const rawDetails =
    b.metabolicMapRawDetails != null && typeof b.metabolicMapRawDetails === 'object'
      ? b.metabolicMapRawDetails
      : null;

  const dbg = b.debug != null && typeof b.debug === 'object' ? b.debug : {};

  const zoneRaw = dbg.zone;
  const zone =
    zoneRaw === 'green' || zoneRaw === 'orange' || zoneRaw === 'red' ? zoneRaw : null;

  const aura = numOrNull(dbg.finalAura);

  const bodyX = numOrNull(b.x);
  const bodyY = numOrNull(b.y);
  const bodyDistance = numOrNull(b.distance);
  const quadrant = typeof b.quadrant === 'string' && b.quadrant.length ? b.quadrant : null;

  const position = {
    x: bodyX,
    y: bodyY,
    zone,
    quadrant,
    distance: bodyDistance,
    aura,
  };

  const baselineOffset =
    b.baselineOffset != null && typeof b.baselineOffset === 'object' ? b.baselineOffset : null;

  const compassDirection =
    b.compassDirection != null && typeof b.compassDirection === 'object'
      ? b.compassDirection
      : null;

  const angleDeg = numOrNull(compassDirection?.angleDeg);
  let bearingDeg = null;
  if (angleDeg != null) {
    bearingDeg = metabolicAngleDegToCompassBearingDeg(angleDeg);
  }

  const rawVector = cloneVec2(b.rawVector ?? compassDirection);
  const visualVector =
    b.visualVector != null && typeof b.visualVector === 'object' ? { ...b.visualVector } : null;

  const signalStrength =
    pickSignalStrength(b.compassSignalStrength) ??
    pickSignalStrength(b.mapSignalStrength);

  const traj = b.projectedTrajectory != null && typeof b.projectedTrajectory === 'object'
    ? b.projectedTrajectory
    : null;
  const projected =
    traj?.projected != null && typeof traj.projected === 'object'
      ? { x: numOrNull(traj.projected.x), y: numOrNull(traj.projected.y) }
      : null;
  const velocity = numOrNull(traj?.velocity);

  const dailyPositions = Array.isArray(b.dailyMapPositions) ? b.dailyMapPositions : null;

  /** Mini-ago: geometria + RAF solo in MetabolicMap.jsx — il bundle non espone questo segnale. */
  const miniNeedleSemantics = null;

  const timeframe =
    typeof b.selectedTimeframe === 'string' && b.selectedTimeframe.length
      ? b.selectedTimeframe
      : null;

  const referenceTdeeKcal = numOrNull(b.referenceTdeeKcal);

  const halfWidth = numOrNull(rawDetails?.energyDeadBandHalfWidthKcal);

  const impactMultiplier = numOrNull(b.impactMultiplier ?? rawDetails?.impactMultiplier);

  const persistFrac = numOrNull(
    b.persistFracOutsideDeadband ?? b.persistence?.outsideEnergyDeadbandDayFraction,
  );

  const weightProjectionConfidence = {
    lineProjection: typeof b.lineProjection === 'string' ? b.lineProjection : null,
    lineTrend: typeof b.lineTrend === 'string' ? b.lineTrend : null,
    lineConfidence: typeof b.lineConfidence === 'string' ? b.lineConfidence : null,
  };

  const mapPresentation =
    b.mapPresentation != null && typeof b.mapPresentation === 'object' ? b.mapPresentation : null;

  const rawMagnitude = numOrNull(b.rawMagnitude);

  return {
    calibration: {
      timeframe,
      referenceTdeeKcal: referenceTdeeKcal != null ? referenceTdeeKcal : null,
      energyDeadBandHalfWidthKcal: halfWidth,
      impactMultiplier,
    },
    bodyState: {
      position,
      x: bodyX,
      y: bodyY,
      zone,
      quadrant,
      distance: bodyDistance,
      aura,
      structuralOffset: baselineOffset != null ? { ...baselineOffset } : null,
      periodAudit: rawDetails != null ? { ...rawDetails } : null,
    },
    metabolicDirection: {
      vector: rawVector,
      visualVector,
      angleDeg,
      bearingDeg,
      magnitude: rawMagnitude,
      signalStrength,
      rawSectorLabel: typeof b.compassSectorLabel === 'string' ? b.compassSectorLabel : null,
      displayLabel: typeof b.compassDisplayLabel === 'string' ? b.compassDisplayLabel : null,
    },
    trajectory: {
      dailyPositions,
      projected,
      velocity,
      miniNeedleSemantics,
    },
    confidence: {
      compassSignalStrength: signalStrength,
      mapPresentation,
      weightProjectionConfidence,
    },
    persistence: {
      outsideEnergyDeadbandDayFraction: persistFrac,
    },
    legacy: {
      source: 'computeMetabolicMapCompassBundle',
      /**
       * Snapshot shallow del bundle senza `metabolicState`, per evitare riferimento circolare
       * quando il runtime appende `metabolicState` sul bundle.
       *
       * @deprecated Temporaneo per migrazione — evitare persistenza su storage; rimuovere quando MetabolicState sarà fonte unica.
       */
      rawBundle: bundleLegacySnapshotWithoutMetabolicState(b),
    },
  };
}

/**
 * Esclude il campo parallelo `metabolicState` così `legacy.rawBundle` non punta al grafo circolare bundle↔state.
 *
 * @param {Record<string, unknown>} b
 * @returns {Record<string, unknown>}
 */
function bundleLegacySnapshotWithoutMetabolicState(b) {
  if (b == null || typeof b !== 'object') return {};
  const { metabolicState: _omitParallel, ...rest } = b;
  return rest;
}

/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} v */
function pickSignalStrength(v) {
  if (v === 'very_weak' || v === 'weak' || v === 'moderate' || v === 'strong') return v;
  return null;
}

/** @param {unknown} raw */
function cloneVec2(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { x: null, y: null };
  }
  return {
    x: numOrNull(raw.x),
    y: numOrNull(raw.y),
  };
}

/**
 * @typedef {object} MetabolicStateFromBundle
 * @property {{ timeframe: string | null, referenceTdeeKcal: number | null, energyDeadBandHalfWidthKcal: number | null, impactMultiplier: number | null }} calibration
 * @property {object} bodyState
 * @property {object} metabolicDirection
 * @property {object} trajectory
 * @property {object} confidence
 * @property {{ outsideEnergyDeadbandDayFraction: number | null }} persistence
 * @property {{ source: string, rawBundle: Record<string, unknown> }} legacy
 */
