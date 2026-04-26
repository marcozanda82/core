import React, { useEffect, useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { computeMetabolicEngineTargetVec, historyFingerprint } from './metabolicDirectionEngine';
import {
  calendarDayKeyFromRow,
  getStructuralBaselineOffsetFromHistory,
} from './biometricHistory';
import {
  calculateBaselineOffset,
  calculateMetabolicMapPosition,
  getLastBiometricData,
} from './metabolicMapEngine';
import {
  applyCalorieNeutralBand,
  computeMetabolicMapInputsAndAudit,
} from './metabolicMapPeriodInputs';
import { computeWeightProjectionFromInputs, formatWeightProjectionUI } from './weightProjectionEngine';
import MetabolicDataAudit from './MetabolicDataAudit';
import MetabolicCompass from './MetabolicCompass';
import MetabolicMap from './MetabolicMap';

const DEFAULT_TIMEFRAME = '7d';
const METABOLIC_COMPASS_TIMEFRAMES = [
  { value: '1d', label: 'IERI' },
  { value: '7d', label: '7G' },
  { value: '14d', label: '14G' },
  { value: '30d', label: '30G' },
];
const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};
const QUADRANT_DIRECTION_LABELS = {
  NE: 'accumulo grasso',
  NW: 'ricomposizione',
  SE: 'catabolismo',
  SW: 'scarso stimolo',
};

function mapZoneToGlowRgba(zone) {
  if (zone === 'red') return 'rgba(120, 88, 92, 0.28)';
  if (zone === 'orange') return 'rgba(125, 100, 82, 0.28)';
  if (zone === 'green') return 'rgba(88, 108, 128, 0.28)';
  return '';
}

function clampAxis(v) {
  return Math.max(-100, Math.min(100, Number(v) || 0));
}

function getAnchorFromLastWeighIn(baselineOffset) {
  return {
    x: clampAxis(Number(baselineOffset?.x) || 0),
    y: clampAxis(Number(baselineOffset?.y) || 0),
  };
}

function timeframeDateRangeFromDailyHistory(dailyHistory, timeframe) {
  const arr = Array.isArray(dailyHistory) ? dailyHistory : [];
  const dated = arr
    .filter((d) => typeof d?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (dated.length === 0) return null;
  const windowLen = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const slice = dated.length <= windowLen ? dated : dated.slice(-windowLen);
  const startDate = slice[0]?.date;
  const endDate = slice[slice.length - 1]?.date;
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

function filterBodyMetricsByDateRange(bodyMetricsHistory, startDate, endDate) {
  if (!startDate || !endDate) return [];
  const src = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  return src.filter((row) => {
    const dayKey = calendarDayKeyFromRow(row);
    return typeof dayKey === 'string' && dayKey >= startDate && dayKey <= endDate;
  });
}

const MOVEMENT_INERTIA = 0.02;

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function consistencyFactorFromInputs(mapInputs) {
  const days = Number(mapInputs?.totalWindowDays) || 0;
  const realSleepDays = Number(mapInputs?.realSleepDays) || 0;
  const dataAvailability = days > 0 ? clamp01(realSleepDays / days) : 0;
  if (days < 3) return 0.2 * (0.6 + 0.4 * dataAvailability);
  if (days < 7) return 0.35 * (0.6 + 0.4 * dataAvailability);
  return 0.65 * (0.6 + 0.4 * dataAvailability);
}

function behaviorLabelFromVector(x, y, context = {}) {
  const trainingRaw = Number(context.trainingRaw) || 0;
  const glycemicInstability = Number(context.glycemicInstability) || 0;
  const kcalAfterNeutral = Number(context.kcalAfterNeutral) || 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude < 1.4) return { label: 'neutrale', reason: 'magnitude_low' };
  if (x > 4 && trainingRaw < 30 && glycemicInstability > 45) {
    return { label: 'surplus disfunzionale', reason: 'surplus_low_training_high_stress' };
  }
  if (x > 4) return { label: 'accumulo grasso', reason: 'positive_energy_drift' };
  if (y > 6 && trainingRaw >= 65 && glycemicInstability < 35) {
    return { label: 'massa pulita', reason: 'high_training_low_stress' };
  }
  if (y > 4 && trainingRaw >= 30) return { label: 'ricomposizione', reason: 'training_recomposition' };
  if (y >= 0 && kcalAfterNeutral <= 0) return { label: 'recupero attivo', reason: 'deficit_or_neutral_with_recovery' };
  if (y < -5) return { label: 'stress metabolico', reason: 'high_stress_downward_pull' };
  return { label: 'recupero attivo', reason: 'fallback_recovery' };
}

function computeBehaviorVectorFromMapInputs(mapInputs, rawDetails, selectedTimeframe) {
  const energyBalance = Number(mapInputs?.energyBalance) || 0;
  const trainingAxis = Number(mapInputs?.trainingLoad) || 0;
  const glycemicInstability = Number(mapInputs?.glycemicInstability) || 0;
  const sleepHours = Number(mapInputs?.sleepHours) || 8;
  const sleepDebt = Math.max(0, 7.5 - sleepHours);
  const trainingRaw = Number(rawDetails?.meanTraining01) || 0;
  const kcalRaw = Number(rawDetails?.meanKcal) || 0;
  const kcalAfterNeutral = applyCalorieNeutralBand(kcalRaw);
  const vectorXRaw =
    energyBalance * 0.72 +
    (kcalAfterNeutral / 160) * 10 +
    glycemicInstability * 0.1 -
    trainingRaw * 0.16;
  const vectorYRaw =
    trainingAxis * 0.58 +
    trainingRaw * 0.18 -
    glycemicInstability * 0.34 -
    sleepDebt * 5.2 -
    Math.max(0, kcalAfterNeutral) * 0.02;
  const x = clampAxis(Math.max(-26, Math.min(26, vectorXRaw)));
  const y = clampAxis(Math.max(-26, Math.min(26, vectorYRaw)));
  const magnitude = Math.hypot(x, y);
  let quadrant = 'NE';
  if (x < 0 && y >= 0) quadrant = 'NW';
  else if (x >= 0 && y < 0) quadrant = 'SE';
  else if (x < 0 && y < 0) quadrant = 'SW';
  const { label, reason } = behaviorLabelFromVector(x, y, {
    trainingRaw,
    glycemicInstability,
    kcalAfterNeutral,
  });
  const timeframeBoost =
    selectedTimeframe === '1d' ? 0.78 : selectedTimeframe === '7d' ? 0.9 : 1;
  const confidence = clamp01((magnitude / 24) * timeframeBoost);
  return {
    vector: { x, y },
    label,
    quadrant,
    confidence,
    reason,
  };
}

function movementFromBehaviorVector(behaviorVector, mapInputs) {
  const v = behaviorVector?.vector || { x: 0, y: 0 };
  const consistencyFactor = consistencyFactorFromInputs(mapInputs);
  return {
    x: (Number(v.x) || 0) * consistencyFactor * MOVEMENT_INERTIA,
    y: (Number(v.y) || 0) * consistencyFactor * MOVEMENT_INERTIA,
    behaviorVector: v,
    consistencyFactor,
  };
}

function directionStateFromBehaviorVector(behaviorVector) {
  const mx = Number(behaviorVector?.vector?.x) || 0;
  const my = Number(behaviorVector?.vector?.y) || 0;
  const length = Math.hypot(mx, my);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return { vector: { x: 0, y: 0 }, available: false, reason: 'behavior_near_zero' };
  }
  return {
    vector: { x: mx / length, y: my / length },
    available: true,
    reason: 'ok',
  };
}

function resolveAnchorForTimeframeDebug(timeframeRange, bodyMetricsHistory, dailyHistory) {
  if (timeframeRange) {
    const rangedBodyMetrics = filterBodyMetricsByDateRange(
      bodyMetricsHistory,
      timeframeRange.startDate,
      timeframeRange.endDate
    );
    const rangedOffset = getStructuralBaselineOffsetFromHistory(rangedBodyMetrics);
    if (rangedOffset) return getAnchorFromLastWeighIn(rangedOffset);
  }
  const fromScale = getStructuralBaselineOffsetFromHistory(bodyMetricsHistory);
  if (fromScale) return getAnchorFromLastWeighIn(fromScale);
  const biometrics = getLastBiometricData(dailyHistory);
  return getAnchorFromLastWeighIn(calculateBaselineOffset(biometrics));
}

function directionModeLabelFromState(directionState) {
  return directionState?.available
    ? 'movement_active'
    : `unavailable_${String(directionState?.reason || 'unknown')}`;
}

function directionLabelFromQuadrant(quadrant) {
  return QUADRANT_DIRECTION_LABELS[String(quadrant || '')] || 'neutral';
}

function IconMapSwitch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5 9 4v13l-5 2.5V6.5Zm10-2.5 5 2.5v13l-5-2.5V4Zm1 .6v11.8l3-1.5V6.1l-3-1.5Zm-9-.1v11.8l3 1.5V5.5l-3 1.5Z"
        fill="currentColor"
        opacity={0.92}
      />
      <path
        d="M15 8.5h4M15 11h3"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  );
}

function IconCompassSwitch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.1} opacity={0.35} />
      <path
        d="M12 6.5 13.8 12 12 17.5 10.2 12 12 6.5Z"
        fill="currentColor"
        opacity={0.9}
      />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity={0.95} />
    </svg>
  );
}

/**
 * Bussola + mappa metabolica in un unico flusso: traiettoria storica, mini-freccia allineata alla bussola,
 * alone bezel dalla zona dell’ultimo giorno della finestra.
 *
 * @param {{ dailyHistory?: Array<{ date?: string, kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>, bodyMetricsHistory?: Array<Record<string, unknown>>, compassScreenActive?: boolean, fullHistory?: object | null, userTargets?: { kcal?: number } | null, projectionAnchorDate?: string | null }} props
 */
export default function MetabolicUnifiedView({
  dailyHistory: dailyHistoryProp = [],
  bodyMetricsHistory: bodyMetricsHistoryProp = [],
  compassScreenActive = true,
  fullHistory = null,
  userTargets = null,
  projectionAnchorDate = null,
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];
  const bodyMetricsHistory = Array.isArray(bodyMetricsHistoryProp) ? bodyMetricsHistoryProp : [];
  const [viewMode, setViewMode] = useState('compass');
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [mapZoom, setMapZoom] = useState(1);
  const [showRoute, setShowRoute] = useState(false);

  const compassHistoryKey = useMemo(
    () => historyFingerprint(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  const { mapInputs: metabolicMapInputs, rawDetails: metabolicMapRawDetails } = useMemo(
    () => computeMetabolicMapInputsAndAudit(dailyHistory, selectedTimeframe),
    [compassHistoryKey]
  );

  const timeframeRange = useMemo(
    () => timeframeDateRangeFromDailyHistory(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  const baselineOffset = useMemo(() => {
    const range = timeframeRange;
    if (range) {
      const rangedBodyMetrics = filterBodyMetricsByDateRange(
        bodyMetricsHistory,
        range.startDate,
        range.endDate
      );
      const rangedOffset = getStructuralBaselineOffsetFromHistory(rangedBodyMetrics);
      if (rangedOffset) return rangedOffset;
    }
    const fromScale = getStructuralBaselineOffsetFromHistory(bodyMetricsHistory);
    if (fromScale) return fromScale;
    const biometrics = getLastBiometricData(dailyHistory);
    return calculateBaselineOffset(biometrics);
  }, [bodyMetricsHistory, dailyHistory, timeframeRange]);

  const anchorPosition = useMemo(() => getAnchorFromLastWeighIn(baselineOffset), [baselineOffset]);
  const behaviorVector = useMemo(
    () =>
      computeBehaviorVectorFromMapInputs(
        metabolicMapInputs,
        metabolicMapRawDetails,
        selectedTimeframe
      ),
    [metabolicMapInputs, metabolicMapRawDetails, selectedTimeframe]
  );
  const movementState = useMemo(
    () => movementFromBehaviorVector(behaviorVector, metabolicMapInputs),
    [behaviorVector, metabolicMapInputs]
  );
  const estimatedPosition = useMemo(
    () => ({
      x: clampAxis(anchorPosition.x + movementState.x),
      y: clampAxis(anchorPosition.y + movementState.y),
    }),
    [anchorPosition, movementState.x, movementState.y]
  );
  const normalizedMetabolicState = useMemo(() => {
    const estimatedX = clampAxis(Number(estimatedPosition?.x) || 0);
    const estimatedY = clampAxis(Number(estimatedPosition?.y) || 0);
    const computed = calculateMetabolicMapPosition({
      energyBalance: estimatedX,
      trainingLoad: estimatedY,
      sleepHours: metabolicMapInputs?.sleepHours,
      glycemicInstability: metabolicMapInputs?.glycemicInstability,
    });
    return {
      ...computed,
      quadrant: behaviorVector?.quadrant || computed.quadrant,
    };
  }, [estimatedPosition, metabolicMapInputs, behaviorVector]);

  const mapZoneColor = useMemo(() => {
    const zone = normalizedMetabolicState?.zone;
    if (!zone) return '';
    return mapZoneToGlowRgba(zone);
  }, [normalizedMetabolicState]);

  const weightProjection = useMemo(
    () =>
      computeWeightProjectionFromInputs({
        bodyMetricsHistory,
        fullHistory,
        userTargets: userTargets || undefined,
        anchorDateStr: projectionAnchorDate,
      }),
    [bodyMetricsHistory, fullHistory, userTargets, projectionAnchorDate]
  );
  const { lineProjection, lineTrend, lineConfidence } = useMemo(
    () => formatWeightProjectionUI(weightProjection),
    [weightProjection]
  );
  const trajectoryPositions = useMemo(
    () => [{ ...anchorPosition }, { ...estimatedPosition }],
    [anchorPosition, estimatedPosition]
  );
  const currentTrajectoryPosition = useMemo(
    () => ({
      x: clampAxis(Number(trajectoryPositions[trajectoryPositions.length - 1]?.x) || Number(estimatedPosition?.x) || 0),
      y: clampAxis(Number(trajectoryPositions[trajectoryPositions.length - 1]?.y) || Number(estimatedPosition?.y) || 0),
    }),
    [trajectoryPositions, estimatedPosition]
  );
  const directionState = useMemo(
    () => directionStateFromBehaviorVector(behaviorVector),
    [behaviorVector]
  );
  const directionVector = directionState.vector;
  const unifiedCompassQuadrant = String(behaviorVector?.quadrant || normalizedMetabolicState?.quadrant || 'neutral');
  const unifiedCompassLabel = String(behaviorVector?.label || directionLabelFromQuadrant(unifiedCompassQuadrant));
  const unifiedDirectionModeLabel = directionModeLabelFromState(directionState);
  const movementAuditByTimeframe = useMemo(() => {
    return METABOLIC_COMPASS_TIMEFRAMES.reduce((acc, tf) => {
      const { mapInputs: inputs, rawDetails } = computeMetabolicMapInputsAndAudit(dailyHistory, tf.value);
      const range = timeframeDateRangeFromDailyHistory(dailyHistory, tf.value);
      const tfAnchor = (() => {
        if (range) {
          const rangedBodyMetrics = filterBodyMetricsByDateRange(
            bodyMetricsHistory,
            range.startDate,
            range.endDate
          );
          const rangedOffset = getStructuralBaselineOffsetFromHistory(rangedBodyMetrics);
          if (rangedOffset) return getAnchorFromLastWeighIn(rangedOffset);
        }
        return anchorPosition;
      })();
      const tfBehavior = computeBehaviorVectorFromMapInputs(inputs, rawDetails, tf.value);
      const tfMovement = movementFromBehaviorVector(tfBehavior, inputs);
      const tfEstimated = {
        x: clampAxis(tfAnchor.x + tfMovement.x),
        y: clampAxis(tfAnchor.y + tfMovement.y),
      };
      const tfDirection = directionStateFromBehaviorVector(tfBehavior);
      acc[tf.value] = {
        anchorPosition: {
          x: Number(tfAnchor.x.toFixed(4)),
          y: Number(tfAnchor.y.toFixed(4)),
        },
        mapInputs: {
          energyBalance: Number((inputs.energyBalance || 0).toFixed(4)),
          trainingLoad: Number((inputs.trainingLoad || 0).toFixed(4)),
          glycemicInstability: Number((inputs.glycemicInstability || 0).toFixed(4)),
          sleepHours: Number((inputs.sleepHours || 0).toFixed(4)),
          totalWindowDays: Number(inputs.totalWindowDays || 0),
        },
        movement: {
          x: Number(tfMovement.x.toFixed(6)),
          y: Number(tfMovement.y.toFixed(6)),
          consistencyFactor: Number(tfMovement.consistencyFactor.toFixed(4)),
        },
        behaviorVector: {
          x: Number((tfBehavior?.vector?.x || 0).toFixed(6)),
          y: Number((tfBehavior?.vector?.y || 0).toFixed(6)),
          label: tfBehavior?.label || 'neutral',
          quadrant: tfBehavior?.quadrant || 'neutral',
          confidence: Number((tfBehavior?.confidence || 0).toFixed(4)),
          reason: tfBehavior?.reason || 'n/a',
        },
        estimatedPosition: {
          x: Number(tfEstimated.x.toFixed(4)),
          y: Number(tfEstimated.y.toFixed(4)),
        },
        directionVector: {
          x: Number(tfDirection.vector.x.toFixed(4)),
          y: Number(tfDirection.vector.y.toFixed(4)),
        },
        directionAvailable: tfDirection.available,
        directionReason: tfDirection.reason,
      };
      return acc;
    }, {});
  }, [dailyHistory, bodyMetricsHistory, anchorPosition]);

  useEffect(() => {
    console.info('[MetabolicMovement] timeframe audit', movementAuditByTimeframe);
  }, [movementAuditByTimeframe]);

  const diagnosticsByTimeframe = useMemo(() => {
    return METABOLIC_COMPASS_TIMEFRAMES.map((tf) => {
      const timeframe = tf.value;
      const timeframeRangeLocal = timeframeDateRangeFromDailyHistory(dailyHistory, timeframe);
      const { mapInputs, rawDetails } = computeMetabolicMapInputsAndAudit(dailyHistory, timeframe);
      const anchor = resolveAnchorForTimeframeDebug(
        timeframeRangeLocal,
        bodyMetricsHistory,
        dailyHistory
      );
      const behaviorVectorLocal = computeBehaviorVectorFromMapInputs(
        mapInputs,
        rawDetails,
        timeframe
      );
      const movement = movementFromBehaviorVector(behaviorVectorLocal, mapInputs);
      const estimated = {
        x: clampAxis(anchor.x + movement.x),
        y: clampAxis(anchor.y + movement.y),
      };
      const directionStateLocal = directionStateFromBehaviorVector(behaviorVectorLocal);
      const directionVectorLocal = directionStateLocal.vector;
      const mapState = calculateMetabolicMapPosition({
        energyBalance: estimated.x,
        trainingLoad: estimated.y,
        sleepHours: mapInputs?.sleepHours,
        glycemicInstability: mapInputs?.glycemicInstability,
      });
      return {
        timeframe,
        range: timeframeRangeLocal
          ? `${timeframeRangeLocal.startDate} -> ${timeframeRangeLocal.endDate}`
          : 'n/a',
        kcalBalanceRaw: Number(rawDetails?.meanKcal ?? 0),
        kcalBalanceAfterNeutralBand: Number(
          applyCalorieNeutralBand(rawDetails?.meanKcal ?? 0)
        ),
        trainingLoadRaw: Number(rawDetails?.meanTraining01 ?? 0),
        trainingLoadAxis: Number(mapInputs?.trainingLoad ?? 0),
        sleepHours: Number(mapInputs?.sleepHours ?? 0),
        glycemicInstability: Number(mapInputs?.glycemicInstability ?? 0),
        anchorPosition: anchor,
        movement: { x: movement.x, y: movement.y },
        estimatedPosition: estimated,
        directionVector: directionVectorLocal,
        behaviorVector: behaviorVectorLocal,
        mapZoneQuadrant: {
          zone: String(mapState?.zone || 'neutral'),
          quadrant: String(behaviorVectorLocal?.quadrant || mapState?.quadrant || 'neutral'),
        },
        compassLabelQuadrant: {
          quadrant: String(behaviorVectorLocal?.quadrant || 'neutral'),
          label: String(behaviorVectorLocal?.label || 'neutral'),
        },
        directionModeLabel: directionModeLabelFromState(directionStateLocal),
        sourceTags: {
          mapInputsRaw: 'metabolicMapPeriodInputs',
          directionEngineVec: 'metabolicDirectionEngine',
          compassInterpretation: 'MetabolicCompass',
          mapInterpretation: 'MetabolicMap',
        },
        directionEngineVec: computeMetabolicEngineTargetVec(dailyHistory, timeframe),
      };
    });
  }, [dailyHistory, bodyMetricsHistory]);

  useEffect(() => {
    if (selectedTimeframe !== '1d') return;
    const selectedDateUsed = timeframeRange?.endDate ?? null;
    const interpretedQuadrant = String(behaviorVector?.quadrant || normalizedMetabolicState?.quadrant || 'neutral');
    console.info('[MetabolicMovement][1d debug]', {
      selectedTimeframe,
      selectedDateUsed,
      kcalBalance: Number(metabolicMapRawDetails?.meanKcal ?? 0),
      trainingLoad: Number(metabolicMapRawDetails?.meanTraining01 ?? 0),
      energyBalance: Number(metabolicMapInputs?.energyBalance ?? 0),
      glycemicInstability: Number(metabolicMapInputs?.glycemicInstability ?? 0),
      mapInputs: metabolicMapInputs,
      rawDetails: metabolicMapRawDetails,
      behaviorVector,
      movement: {
        x: Number(movementState.x.toFixed(6)),
        y: Number(movementState.y.toFixed(6)),
      },
      directionVector: {
        x: Number(directionVector.x.toFixed(6)),
        y: Number(directionVector.y.toFixed(6)),
      },
      interpreted: {
        quadrant: interpretedQuadrant,
        label: behaviorVector?.label || QUADRANT_DIRECTION_LABELS[interpretedQuadrant] || 'neutral',
      },
    });
  }, [
    selectedTimeframe,
    timeframeRange,
    metabolicMapRawDetails,
    metabolicMapInputs,
    behaviorVector,
    movementState,
    directionVector,
    normalizedMetabolicState,
  ]);

  useEffect(() => {
    console.info('[MetabolicUnifiedDirection]', {
      selectedTimeframe,
      rawDetailsMeanKcal: Number(metabolicMapRawDetails?.meanKcal ?? 0),
      rawDetailsMeanTraining01: Number(metabolicMapRawDetails?.meanTraining01 ?? 0),
      mapInputs: metabolicMapInputs,
      behaviorVector,
      movementState: {
        x: Number((movementState?.x || 0).toFixed(6)),
        y: Number((movementState?.y || 0).toFixed(6)),
        consistencyFactor: Number((movementState?.consistencyFactor || 0).toFixed(4)),
      },
      directionVector: {
        x: Number((directionVector?.x || 0).toFixed(6)),
        y: Number((directionVector?.y || 0).toFixed(6)),
      },
      compassLabel: unifiedCompassLabel,
      mapQuadrant: unifiedCompassQuadrant,
      directionModeLabel: unifiedDirectionModeLabel,
    });
  }, [
    selectedTimeframe,
    metabolicMapRawDetails,
    metabolicMapInputs,
    behaviorVector,
    movementState,
    directionVector,
    unifiedCompassLabel,
    unifiedCompassQuadrant,
    unifiedDirectionModeLabel,
  ]);

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(10, 12, 16, 0.74)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode((m) => (m === 'compass' ? 'map' : 'compass'))}
          aria-label={
            viewMode === 'compass' ? 'Apri mappa metabolica' : 'Apri bussola metabolica'
          }
          aria-pressed={viewMode === 'map'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(240, 245, 250, 0.9)',
            transition: reducedMotion ? 'none' : 'background 0.25s ease, transform 0.2s ease',
          }}
        >
          {viewMode === 'compass' ? <IconMapSwitch /> : <IconCompassSwitch />}
        </button>
        <button
          type="button"
          onClick={() => setMapZoom((z) => Math.max(0.8, z - 0.12))}
          disabled={viewMode !== 'map'}
          aria-label="Riduci zoom mappa"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          -
        </button>
        <button
          type="button"
          onClick={() => setMapZoom((z) => Math.min(2.5, z + 0.12))}
          disabled={viewMode !== 'map'}
          aria-label="Aumenta zoom mappa"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setShowRoute((v) => !v)}
          disabled={viewMode !== 'map'}
          aria-label={showRoute ? 'Nascondi rotta' : 'Mostra rotta'}
          style={{
            minWidth: 54,
            height: 32,
            padding: '0 10px',
            borderRadius: 9,
            border: `1px solid ${showRoute ? 'rgba(148, 163, 184, 0.48)' : 'rgba(255,255,255,0.12)'}`,
            background: showRoute ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: viewMode === 'map' ? 'pointer' : 'default',
            opacity: viewMode === 'map' ? 1 : 0.45,
          }}
        >
          Rotta
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Periodo analisi"
        className="metabolic-compass-timeframe"
        style={{
          position: 'relative',
          zIndex: 25,
          display: 'flex',
          width: '100%',
          maxWidth: 340,
          padding: 3,
          gap: 2,
          margin: '58px auto 8px',
          borderRadius: 12,
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {METABOLIC_COMPASS_TIMEFRAMES.map(({ value, label }) => {
          const active = selectedTimeframe === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedTimeframe(value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 5px',
                borderRadius: 9,
                border: 'none',
                margin: 0,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 650,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                color: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.36)',
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                boxShadow: active ? '0 0 18px rgba(255,255,255,0.05)' : 'none',
                transition:
                  'background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 480,
          paddingTop: 4,
          boxSizing: 'border-box',
        }}
      >
        <div
          aria-hidden={viewMode !== 'compass'}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            opacity: viewMode === 'compass' ? 1 : 0,
            transform:
              viewMode === 'compass'
                ? 'translateY(0) scale(1)'
                : 'translateY(6px) scale(0.99)',
            pointerEvents: viewMode === 'compass' ? 'auto' : 'none',
            transition: reducedMotion
              ? 'none'
              : 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
            width: '100%',
          }}
        >
          <MetabolicCompass
            dailyHistory={dailyHistory}
            compassScreenActive={compassScreenActive}
            mapZoneColor={mapZoneColor}
            hideMetabolicMapSection
            goal={goal}
            onGoalChange={setGoal}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            normalizedMetabolicState={normalizedMetabolicState}
            neutralStaticMode={!directionState.available}
            unifiedDirectionMode
            unifiedDirectionLabel={unifiedCompassLabel}
            unifiedDirectionModeLabel={unifiedDirectionModeLabel}
            unifiedDirectionVector={directionVector}
            unifiedMovementState={movementState}
            unifiedBehaviorConfidence={behaviorVector?.confidence}
          />
        </div>

        <div
          aria-hidden={viewMode !== 'map'}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            opacity: viewMode === 'map' ? 1 : 0,
            transform:
              viewMode === 'map'
                ? 'translateY(0) scale(1)'
                : 'translateY(6px) scale(0.99)',
            pointerEvents: viewMode === 'map' ? 'auto' : 'none',
            transition: reducedMotion
              ? 'none'
              : 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
            width: '100%',
          }}
        >
          <div style={{ padding: 'clamp(0.75rem, 3vw, 1rem)', boxSizing: 'border-box' }}>
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.42)',
                textAlign: 'center',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              Analisi Stato Metabolico
            </h3>
            <div
              style={{
                margin: '0 0 10px',
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(16, 20, 24, 0.72)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'rgba(200, 210, 220, 0.88)',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {lineProjection ? (
                <div style={{ fontWeight: 500, color: 'rgba(226, 232, 240, 0.92)', marginBottom: 4 }}>
                  {lineProjection}
                </div>
              ) : null}
              <div style={{ fontSize: 11, opacity: 0.9 }}>{lineTrend}</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{lineConfidence}</div>
            </div>
            <MetabolicMap
              energyBalance={metabolicMapInputs.energyBalance}
              trainingLoad={metabolicMapInputs.trainingLoad}
              sleepHours={metabolicMapInputs.sleepHours}
              glycemicInstability={metabolicMapInputs.glycemicInstability}
              realSleepDays={metabolicMapInputs.realSleepDays}
              totalWindowDays={metabolicMapInputs.totalWindowDays}
              selectedTimeframe={selectedTimeframe}
              baselineOffset={baselineOffset}
              bodyMetricsHistory={bodyMetricsHistory}
              zoomLevel={mapZoom}
              onZoomLevelChange={setMapZoom}
              trajectoryPositions={trajectoryPositions}
              currentPosition={currentTrajectoryPosition}
              normalizedMetabolicState={normalizedMetabolicState}
              directionVector={directionVector}
              directionAvailable={directionState.available}
              directionUnavailableReason={directionState.reason}
              showRoute={false}
            />
            <MetabolicDataAudit
              rawDetails={metabolicMapRawDetails}
              mapInputs={metabolicMapInputs}
            />
            <details
              open
              style={{
                marginTop: 10,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(8, 12, 18, 0.7)',
                padding: '8px 10px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(230,236,245,0.9)',
                  marginBottom: 6,
                }}
              >
                Diagnostic Panel (Temporary)
              </summary>
              {diagnosticsByTimeframe.map((d) => (
                <pre
                  key={`diag-${d.timeframe}`}
                  style={{
                    margin: '0 0 8px',
                    padding: '8px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.28)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: 'rgba(223,232,242,0.92)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  }}
                >
{`selectedTimeframe: ${d.timeframe}
selected date range: ${d.range}
kcalBalance raw: ${d.kcalBalanceRaw.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
kcalBalance after neutral band: ${d.kcalBalanceAfterNeutralBand.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
trainingLoad raw: ${d.trainingLoadRaw.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
trainingLoad axis value: ${d.trainingLoadAxis.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
sleepHours: ${d.sleepHours.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
glycemicInstability: ${d.glycemicInstability.toFixed(4)} (source: ${d.sourceTags.mapInputsRaw})
anchorPosition: x=${d.anchorPosition.x.toFixed(4)}, y=${d.anchorPosition.y.toFixed(4)} (source: MetabolicUnifiedView)
movement: x=${d.movement.x.toFixed(6)}, y=${d.movement.y.toFixed(6)} (source: MetabolicUnifiedView)
estimatedPosition: x=${d.estimatedPosition.x.toFixed(4)}, y=${d.estimatedPosition.y.toFixed(4)} (source: MetabolicUnifiedView)
directionVector: x=${d.directionVector.x.toFixed(6)}, y=${d.directionVector.y.toFixed(6)} (source: MetabolicUnifiedView)
map zone/quadrant: ${d.mapZoneQuadrant.zone} / ${d.mapZoneQuadrant.quadrant} (source: ${d.sourceTags.mapInterpretation})
compass label/quadrant: ${d.compassLabelQuadrant.label} / ${d.compassLabelQuadrant.quadrant} (source: ${d.sourceTags.compassInterpretation})
direction-mode label: ${d.directionModeLabel} (source: MetabolicUnifiedView)
directionEngine vec: x=${Number(d.directionEngineVec?.x || 0).toFixed(6)}, y=${Number(d.directionEngineVec?.y || 0).toFixed(6)} (source: ${d.sourceTags.directionEngineVec})`}
                </pre>
              ))}
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
