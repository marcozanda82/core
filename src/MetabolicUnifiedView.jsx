import React, { useEffect, useMemo, useState } from 'react';
import { METABOLIC_GOAL } from './metabolicDirection';
import { historyFingerprint } from './metabolicDirectionEngine';
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
  NE: 'Surplus controllato',
  NW: 'Deficit + allenamento',
  SE: 'Surplus con basso allenamento',
  SW: 'Allenamento basso / energia negativa',
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

function timeframeSliceFromDailyHistory(dailyHistory, timeframe) {
  const arr = Array.isArray(dailyHistory) ? dailyHistory : [];
  const dated = arr
    .filter((d) => typeof d?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (dated.length === 0) return [];
  const windowLen = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  return dated.length <= windowLen ? dated : dated.slice(-windowLen);
}

function arithmeticMean(values) {
  const arr = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
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

function movementFromMapInputs(mapInputs) {
  const consistencyFactor = consistencyFactorFromInputs(mapInputs);
  return {
    x: 0,
    y: 0,
    reason: 'movement_disabled_baseline',
    consistencyFactor,
  };
}

function tractionVectorFromSourceValues(sourceInputs) {
  const x = Number(sourceInputs?.kcalBalanceRaw) || 0;
  const trainingRaw = Number(sourceInputs?.trainingLoadRaw) || 0;
  const glycemicPenalty = Number(sourceInputs?.glycemicInstabilityEstimated) || 0;
  const sleepPenalty = Number(sourceInputs?.sleepStressPenalty) || 0;
  const y = trainingRaw - glycemicPenalty - sleepPenalty;
  const len = Math.hypot(x, y);

  if (!Number.isFinite(len) || len < 3) {
    return {
      vector: { x: 0, y: 0 },
      available: false,
      magnitude: 0,
      reason: 'traction_too_weak',
    };
  }

  return {
    vector: { x: x / len, y: y / len },
    available: true,
    magnitude: Math.min(100, len),
    reason: 'traction_from_raw_source_values',
  };
}

function directionStateFromMovement(movement) {
  const mx = Number(movement?.x) || 0;
  const my = Number(movement?.y) || 0;
  const length = Math.hypot(mx, my);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return { vector: { x: 0, y: 0 }, available: false, reason: 'movement_disabled_baseline' };
  }
  return {
    vector: { x: mx / length, y: my / length },
    available: true,
    reason: 'ok',
  };
}

function directionLabelFromQuadrant(quadrant) {
  return QUADRANT_DIRECTION_LABELS[String(quadrant || '')] || 'neutral';
}

function quadrantFromVector(vector) {
  const x = Number(vector?.x) || 0;
  const y = Number(vector?.y) || 0;
  if (Math.hypot(x, y) <= 1e-6) return 'neutral';
  if (x >= 0 && y >= 0) return 'NE';
  if (x < 0 && y >= 0) return 'NW';
  if (x >= 0 && y < 0) return 'SE';
  return 'SW';
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
  const isDev = Boolean(import.meta.env?.DEV);
  const effectiveKcalAfterNeutralBand = useMemo(
    () => applyCalorieNeutralBand(Number(metabolicMapRawDetails?.meanKcal ?? 0)),
    [metabolicMapRawDetails]
  );

  const timeframeRange = useMemo(
    () => timeframeDateRangeFromDailyHistory(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );
  const selectedDayMapInputsDebug = useMemo(() => {
    const endDate = timeframeRange?.endDate;
    const series = Array.isArray(dailyHistory) ? dailyHistory : [];
    const fallback = series.length > 0 ? series[series.length - 1] : null;
    const byDate = endDate
      ? series.find((row) => String(row?.date || '') === String(endDate))
      : null;
    const row = byDate || fallback;
    if (!row) return null;
    const consumedKcal = Number(row?.consumedKcal ?? 0);
    const baseTargetKcal = Number(row?.baseTargetKcal ?? 0);
    const workoutKcal = Number(row?.workoutKcal ?? 0);
    const effectiveTargetKcal = Number(row?.effectiveTargetKcal ?? (baseTargetKcal + workoutKcal));
    const remainingKcal = Number(row?.remainingKcal ?? (effectiveTargetKcal - consumedKcal));
    const computedKcalBalance = Number(
      row?.computedKcalBalance ?? row?.kcalBalance ?? (consumedKcal - effectiveTargetKcal)
    );
    return {
      date: String(row?.date || endDate || 'n/a'),
      consumedKcal,
      baseTargetKcal,
      workoutKcal,
      effectiveTargetKcal,
      remainingKcal,
      computedKcalBalance,
      source: String(row?.source || 'home_energy_summary'),
    };
  }, [dailyHistory, timeframeRange]);
  const timeframeSlice = useMemo(
    () => timeframeSliceFromDailyHistory(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );
  const sourceReadings = useMemo(() => {
    const rows = Array.isArray(timeframeSlice) ? timeframeSlice : [];
    if (rows.length === 0) {
      return {
        windowDays: 0,
        kcalBalanceRaw: 0,
        consumedKcal: 0,
        effectiveTargetKcal: 0,
        remainingKcal: 0,
        workoutKcal: 0,
        trainingLoadRaw: 0,
        sleepHours: null,
        glycemicInstabilityEstimated: Number(metabolicMapRawDetails?.glycemicInstabilityEstimated ?? 0),
        glycemicInstabilityVisual: Number(metabolicMapInputs?.glycemicInstability ?? 0),
        sleepStressPenalty: 0,
        yRawWithPenalty: 0,
      };
    }
    const kcalBalanceRaw = arithmeticMean(rows.map((row) => Number(row?.computedKcalBalance ?? row?.kcalBalance ?? 0)));
    const consumedKcal = arithmeticMean(rows.map((row) => Number(row?.consumedKcal ?? 0)));
    const effectiveTargetKcal = arithmeticMean(rows.map((row) => Number(row?.effectiveTargetKcal ?? 0)));
    const remainingKcal = arithmeticMean(rows.map((row) => Number(row?.remainingKcal ?? 0)));
    const workoutKcal = arithmeticMean(rows.map((row) => Number(row?.workoutKcal ?? 0)));
    const trainingLoadRaw = arithmeticMean(rows.map((row) => Number(row?.trainingLoad ?? 0)));
    const sleepKnown = rows
      .map((row) => Number(row?.sleepHours))
      .filter((h) => Number.isFinite(h) && h > 0);
    const sleepHours = sleepKnown.length > 0 ? arithmeticMean(sleepKnown) : null;
    const glycemicInstabilityEstimated = Number(
      metabolicMapRawDetails?.glycemicInstabilityEstimated ?? metabolicMapInputs?.glycemicInstability ?? 0
    );
    const glycemicInstabilityVisual = Number(metabolicMapInputs?.glycemicInstability ?? 0);
    const sleepStressPenalty = Math.max(0, 7.2 - (sleepHours ?? 8)) * 8;
    const yRawWithPenalty = trainingLoadRaw - glycemicInstabilityEstimated - sleepStressPenalty;
    return {
      windowDays: rows.length,
      kcalBalanceRaw,
      consumedKcal,
      effectiveTargetKcal,
      remainingKcal,
      workoutKcal,
      trainingLoadRaw,
      sleepHours,
      glycemicInstabilityEstimated,
      glycemicInstabilityVisual,
      sleepStressPenalty,
      yRawWithPenalty,
    };
  }, [timeframeSlice, metabolicMapRawDetails, metabolicMapInputs]);
  const periodAverageLine = useMemo(
    () =>
      `Media periodo: ${Math.round(sourceReadings.kcalBalanceRaw)} kcal/g · Allenamento medio: ${sourceReadings.trainingLoadRaw.toFixed(1)}/100`,
    [sourceReadings]
  );
  const directionSourceAudit = useMemo(
    () => ({
      xRaw: sourceReadings.kcalBalanceRaw,
      trainingLoadRaw: sourceReadings.trainingLoadRaw,
      glycemicPenalty: sourceReadings.glycemicInstabilityEstimated,
      sleepPenalty: sourceReadings.sleepStressPenalty,
      yAfterPenalty: sourceReadings.yRawWithPenalty,
      timeframeDays: sourceReadings.windowDays,
    }),
    [sourceReadings]
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
  const movementState = useMemo(
    () => movementFromMapInputs(metabolicMapInputs),
    [metabolicMapInputs]
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
    return computed;
  }, [estimatedPosition, metabolicMapInputs]);

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
  const tractionState = useMemo(
    () => tractionVectorFromSourceValues(sourceReadings),
    [sourceReadings]
  );
  const directionVector = tractionState.vector;
  const unifiedCompassQuadrant = useMemo(
    () => quadrantFromVector(directionVector),
    [directionVector]
  );
  const unifiedCompassLabel = tractionState.available
    ? directionLabelFromQuadrant(unifiedCompassQuadrant)
    : 'direzione non disponibile';
  const unifiedDirectionModeLabel = tractionState.reason;
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
      const tfMovement = movementFromMapInputs(inputs);
      const tfEstimated = {
        x: clampAxis(tfAnchor.x + tfMovement.x),
        y: clampAxis(tfAnchor.y + tfMovement.y),
      };
      const tfSlice = timeframeSliceFromDailyHistory(dailyHistory, tf.value);
      const tfSourceReadings = {
        kcalBalanceRaw: arithmeticMean(tfSlice.map((row) => Number(row?.computedKcalBalance ?? row?.kcalBalance ?? 0))),
        trainingLoadRaw: arithmeticMean(tfSlice.map((row) => Number(row?.trainingLoad ?? 0))),
        glycemicInstabilityEstimated: Number(rawDetails?.glycemicInstabilityEstimated ?? inputs?.glycemicInstability ?? 0),
        sleepStressPenalty: Math.max(0, 7.2 - (Number(rawDetails?.sleepRegisteredMean ?? inputs?.sleepHours ?? 8) || 8)) * 8,
      };
      const tfTraction = tractionVectorFromSourceValues(tfSourceReadings);
      const tfDirection = directionStateFromMovement(tfMovement);
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
          reason: tfMovement.reason,
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
        tractionVector: {
          x: Number((tfTraction.vector?.x || 0).toFixed(4)),
          y: Number((tfTraction.vector?.y || 0).toFixed(4)),
        },
        tractionAvailable: tfTraction.available,
        tractionMagnitude: Number((tfTraction.magnitude || 0).toFixed(4)),
        tractionReason: tfTraction.reason,
        sourceReadings: {
          kcalBalanceRaw: Number((tfSourceReadings.kcalBalanceRaw || 0).toFixed(4)),
          trainingLoadRaw: Number((tfSourceReadings.trainingLoadRaw || 0).toFixed(4)),
          glycemicInstabilityEstimated: Number((tfSourceReadings.glycemicInstabilityEstimated || 0).toFixed(4)),
          sleepStressPenalty: Number((tfSourceReadings.sleepStressPenalty || 0).toFixed(4)),
        },
      };
      return acc;
    }, {});
  }, [dailyHistory, bodyMetricsHistory, anchorPosition]);

  useEffect(() => {
    console.info('[MetabolicMovement] timeframe audit', movementAuditByTimeframe);
  }, [movementAuditByTimeframe]);

  useEffect(() => {
    if (selectedTimeframe !== '1d') return;
    const selectedDateUsed = timeframeRange?.endDate ?? null;
    const interpretedQuadrant = String(normalizedMetabolicState?.quadrant || 'neutral');
    console.info('[MetabolicMovement][1d debug]', {
      selectedTimeframe,
      selectedDateUsed,
      kcalBalance: Number(metabolicMapRawDetails?.meanKcal ?? 0),
      trainingLoad: Number(metabolicMapRawDetails?.meanTraining01 ?? 0),
      energyBalance: Number(metabolicMapInputs?.energyBalance ?? 0),
      glycemicInstability: Number(metabolicMapInputs?.glycemicInstability ?? 0),
      mapInputs: metabolicMapInputs,
      rawDetails: metabolicMapRawDetails,
      movement: {
        x: Number(movementState.x.toFixed(6)),
        y: Number(movementState.y.toFixed(6)),
      },
      directionVector: {
        x: Number(directionVector.x.toFixed(6)),
        y: Number(directionVector.y.toFixed(6)),
      },
      tractionState: {
        available: tractionState.available,
        magnitude: Number((tractionState.magnitude || 0).toFixed(6)),
        reason: tractionState.reason,
      },
      interpreted: {
        quadrant: interpretedQuadrant,
        label: tractionState.available
          ? (QUADRANT_DIRECTION_LABELS[interpretedQuadrant] || 'neutral')
          : 'direzione non disponibile',
      },
    });
  }, [
    selectedTimeframe,
    timeframeRange,
    metabolicMapRawDetails,
    metabolicMapInputs,
    movementState,
    directionVector,
    tractionState,
    normalizedMetabolicState,
  ]);

  useEffect(() => {
    console.info('[MetabolicUnifiedDirection]', {
      selectedTimeframe,
      rawDetailsMeanKcal: Number(metabolicMapRawDetails?.meanKcal ?? 0),
      rawDetailsMeanTraining01: Number(metabolicMapRawDetails?.meanTraining01 ?? 0),
      mapInputs: metabolicMapInputs,
      movementState: {
        x: Number((movementState?.x || 0).toFixed(6)),
        y: Number((movementState?.y || 0).toFixed(6)),
        consistencyFactor: Number((movementState?.consistencyFactor || 0).toFixed(4)),
        reason: movementState?.reason || 'n/a',
      },
      directionVector: {
        x: Number((directionVector?.x || 0).toFixed(6)),
        y: Number((directionVector?.y || 0).toFixed(6)),
      },
      tractionState: {
        available: tractionState.available,
        magnitude: Number((tractionState.magnitude || 0).toFixed(6)),
        reason: tractionState.reason,
      },
      compassLabel: unifiedCompassLabel,
      mapQuadrant: unifiedCompassQuadrant,
      directionModeLabel: unifiedDirectionModeLabel,
    });
  }, [
    selectedTimeframe,
    metabolicMapRawDetails,
    metabolicMapInputs,
    movementState,
    directionVector,
    tractionState,
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
            neutralStaticMode={false}
            unifiedDirectionMode
            unifiedDirectionLabel={unifiedCompassLabel}
            unifiedDirectionModeLabel={unifiedDirectionModeLabel}
            unifiedDirectionVector={tractionState.vector}
            compassDirectionAvailable={tractionState.available}
            unifiedDirectionAudit={directionSourceAudit}
            periodAverageLine={periodAverageLine}
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
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(226, 232, 240, 0.9)', marginBottom: 4 }}>
                {periodAverageLine}
              </div>
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
              directionVector={tractionState.vector}
              directionAvailable={tractionState.available}
              tractionMagnitude={tractionState.magnitude}
              directionUnavailableReason={tractionState.reason}
              showRoute={false}
              sourceReadings={sourceReadings}
              periodAverageLine={periodAverageLine}
            />
            <MetabolicDataAudit
              rawDetails={metabolicMapRawDetails}
              mapInputs={metabolicMapInputs}
            />
            {isDev ? (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(7, 10, 14, 0.64)',
                  fontSize: 10,
                  lineHeight: 1.45,
                  color: 'rgba(214, 224, 236, 0.9)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                }}
              >
                <div>selectedTimeframe: {selectedTimeframe}</div>
                <div>
                  date range used:{' '}
                  {timeframeRange
                    ? `${timeframeRange.startDate} -> ${timeframeRange.endDate}`
                    : 'n/a'}
                </div>
                <div>raw mean kcalBalance: {Number(metabolicMapRawDetails?.meanKcal ?? 0).toFixed(4)}</div>
                <div>effective kcalBalance after neutral band: {Number(effectiveKcalAfterNeutralBand).toFixed(4)}</div>
                <div>raw mean trainingLoad: {Number(metabolicMapRawDetails?.meanTraining01 ?? 0).toFixed(4)}</div>
                <div>computed energyBalance: {Number(metabolicMapInputs?.energyBalance ?? 0).toFixed(4)}</div>
                <div>computed trainingLoad: {Number(metabolicMapInputs?.trainingLoad ?? 0).toFixed(4)}</div>
                <div>sleepHours: {Number(metabolicMapInputs?.sleepHours ?? 0).toFixed(4)}</div>
                <div>glycemicInstability: {Number(metabolicMapInputs?.glycemicInstability ?? 0).toFixed(4)}</div>
                <div>realSleepDays: {Number(metabolicMapInputs?.realSleepDays ?? 0)}</div>
                <div>totalWindowDays: {Number(metabolicMapInputs?.totalWindowDays ?? 0)}</div>
                <div>tractionVector.x: {Number(tractionState?.vector?.x ?? 0).toFixed(4)}</div>
                <div>tractionVector.y: {Number(tractionState?.vector?.y ?? 0).toFixed(4)}</div>
                <div>tractionMagnitude: {Number(tractionState?.magnitude ?? 0).toFixed(4)}</div>
                <div>tractionReason: {String(tractionState?.reason || 'n/a')}</div>
                <div style={{ marginTop: 6, opacity: 0.92 }}>selected day debug ({selectedDayMapInputsDebug?.date || 'n/a'}):</div>
                <div>consumedKcal: {Number(selectedDayMapInputsDebug?.consumedKcal ?? 0).toFixed(4)}</div>
                <div>baseTargetKcal: {Number(selectedDayMapInputsDebug?.baseTargetKcal ?? 0).toFixed(4)}</div>
                <div>workoutKcal: {Number(selectedDayMapInputsDebug?.workoutKcal ?? 0).toFixed(4)}</div>
                <div>effectiveTargetKcal: {Number(selectedDayMapInputsDebug?.effectiveTargetKcal ?? 0).toFixed(4)}</div>
                <div>remainingKcal: {Number(selectedDayMapInputsDebug?.remainingKcal ?? 0).toFixed(4)}</div>
                <div>computedKcalBalance: {Number(selectedDayMapInputsDebug?.computedKcalBalance ?? 0).toFixed(4)}</div>
                <div>source: {String(selectedDayMapInputsDebug?.source || 'home_energy_summary')}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
