import { useMemo, useState } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
  MUSCLE_CYLINDER_DEFS,
} from '../../salaComandi/engines/fourCylinderEngine';
import {
  buildFourCylinderTelemetrySeries,
  getDaysSinceLastStimulus,
} from '../../salaComandi/utils/fourCylinderTelemetryHistory';
import {
  hypertrophyTriageLabel,
  hypertrophyTriageTone,
  HYPERTROPHY_TRIAGE_STIMULATE_MAX,
} from '../../../utils/hypertrophyMath';
import { getTodayString } from '../../../coreEngine';

/** Target volume normalizzato (100% = stimolo ottimale nel ciclo). */
export const MUSCLE_VOLUME_TARGET = 100;

/** Finestra biologica per lo stimolo residuo usato nel Progression Score. */
export const MUSCLE_STIMULUS_LOOKBACK_DAYS = 7;

/**
 * Media 0–100 dello stimolo attuale sui 5 distretti (Abs, Petto, Braccia, Gambe, Schiena).
 * Stesso modello della Telemetria Muscolare (accumulo 7g), non aderenza da calendario.
 *
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   averageStimulus?: number | null,
 * }} [input]
 * @returns {number}
 */
export function computeAverageMuscleStimulus(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const rawDirect = src.averageStimulus ?? src.muscleStimulusAvg;
  if (rawDirect != null && rawDirect !== '') {
    const direct = Number(rawDirect);
    if (Number.isFinite(direct)) {
      return Math.max(0, Math.min(100, direct));
    }
  }

  const { muscleRows } = buildMuscleTelemetryRows({
    fourCylinder: input?.fourCylinder ?? null,
    fullHistory: input?.fullHistory ?? null,
    activeLog: input?.activeLog ?? null,
    activeDate: input?.activeDate ?? input?.todayDate ?? null,
    historyDays: MUSCLE_STIMULUS_LOOKBACK_DAYS,
  });

  const byId = new Map(
    (Array.isArray(muscleRows) ? muscleRows : []).map((row) => [
      row.id,
      Math.max(0, Math.min(100, Number(row.pct) || 0)),
    ]),
  );
  const values = MUSCLE_CYLINDER_DEFS.map((cyl) => byId.get(cyl.id) ?? 0);
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/**
 * Etichetta triage UI: PRIORITÀ / DA STIMOLARE / IN RECUPERO / OTTIMALE.
 * @param {number} percent0to100
 * @param {boolean} isPriority
 */
export function muscleHubTriageLabel(percent0to100, isPriority) {
  if (isPriority) return 'PRIORITÀ';
  const raw = hypertrophyTriageLabel(percent0to100);
  if (raw === 'STIMOLO OTTIMALE') return 'OTTIMALE';
  return raw;
}

export function muscleTriageLevel(value) {
  const tone = hypertrophyTriageTone(clamp01(value) * 100);
  if (tone === 'good') return 'good';
  if (tone === 'warning') return 'warning';
  return 'critical';
}

/**
 * Distretti ordinati per priorità (stimolo più basso in cima).
 */
export function buildMuscleTelemetryRows({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  historyDays = 14,
} = {}) {
  const state = fourCylinder && typeof fourCylinder === 'object'
    ? fourCylinderFromPhysiologyModel({ fourCylinder })
    : createDefaultFourCylinderState();

  const todayIso = getTodayString();
  const activeIso = String(activeDate || todayIso).slice(0, 10);
  const todayLiveLog = activeIso === todayIso && Array.isArray(activeLog) ? activeLog : null;
  const telemetrySeries = buildFourCylinderTelemetrySeries(fullHistory, {
    daysBack: historyDays,
    endDate: todayIso,
    fourCylinder: state,
    todayLiveLog,
  });

  const tip = telemetrySeries.length > 0 ? telemetrySeries[telemetrySeries.length - 1] : null;
  const rows = MUSCLE_CYLINDER_DEFS.map((cyl) => {
    const value = tip ? clamp01(tip[cyl.id]) : 0;
    const currentVolume = Math.round(value * MUSCLE_VOLUME_TARGET);
    return {
      ...cyl,
      value,
      currentVolume,
      targetVolume: MUSCLE_VOLUME_TARGET,
      completionRatio: currentVolume / MUSCLE_VOLUME_TARGET,
      pct: currentVolume,
      triageLabel: hypertrophyTriageLabel(value * 100),
      level: muscleTriageLevel(value),
      daysSinceStimulus: getDaysSinceLastStimulus(fullHistory, cyl.id, {
        todayIso,
        fourCylinder: state,
      }),
    };
  });

  const sorted = [...rows].sort(
    (a, b) => a.completionRatio - b.completionRatio || a.label.localeCompare(b.label, 'it'),
  );

  return {
    state,
    telemetrySeries,
    muscleRows: sorted.map((row, index) => {
      const isTopPriority = index === 0
        || (index === 1 && row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX);
      return {
        ...row,
        isTopPriority,
        hubLabel: muscleHubTriageLabel(row.pct, isTopPriority && row.pct <= HYPERTROPHY_TRIAGE_STIMULATE_MAX),
      };
    }),
  };
}

/**
 * Hook: serie storica + distretti ordinati per priorità.
 */
export function useMuscleTelemetryModel({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
} = {}) {
  const [historyDays, setHistoryDays] = useState(14);

  const model = useMemo(
    () => buildMuscleTelemetryRows({
      fourCylinder,
      fullHistory,
      activeLog,
      activeDate,
      historyDays,
    }),
    [fourCylinder, fullHistory, activeLog, activeDate, historyDays],
  );

  return {
    ...model,
    historyDays,
    setHistoryDays,
  };
}

export function muscleLevelClasses(level) {
  switch (level) {
    case 'critical':
      return {
        border: 'border-red-500/45',
        bg: 'bg-red-950/30',
        bar: 'bg-gradient-to-r from-red-600 to-red-400',
        text: 'text-red-200',
        badge: 'bg-red-500/15 text-red-100 border-red-500/35',
      };
    case 'warning':
      return {
        border: 'border-orange-500/45',
        bg: 'bg-orange-950/25',
        bar: 'bg-gradient-to-r from-orange-600 to-amber-400',
        text: 'text-orange-200',
        badge: 'bg-orange-500/15 text-orange-100 border-orange-500/35',
      };
    default:
      return {
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-950/20',
        bar: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
        text: 'text-emerald-200',
        badge: 'bg-emerald-500/15 text-emerald-100 border-emerald-500/35',
      };
  }
}

export function formatMusclePct(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}
