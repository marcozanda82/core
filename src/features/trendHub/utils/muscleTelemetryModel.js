import { useMemo, useState } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
} from '../../salaComandi/engines/fourCylinderEngine';
import {
  buildFourCylinderTelemetrySeries,
} from '../../salaComandi/utils/fourCylinderTelemetryHistory';
import { getTodayString } from '../../../coreEngine';
import { buildCostanzaUiModel } from '../../kentuFocus/costanza/costanzaUiModel.js';
import {
  computeCostanzaForza,
  normalizeWeeklyGoalDays,
} from '../../kentuFocus/costanza/costanzaForza.js';

/**
 * Rank badge cruscotto: PRIORITÀ / DA STIMOLARE prima di IN RECUPERO / OTTIMALE.
 * @param {string | null | undefined} hubLabel
 * @returns {number}
 */
export function stimulusPriorityRank(hubLabel) {
  const label = String(hubLabel || '').trim().toUpperCase();
  if (label === 'PRIORITÀ') return 0;
  if (label === 'DA STIMOLARE') return 1;
  if (label === 'IN RECUPERO') return 2;
  return 3;
}

/**
 * Sort deterministico: stato (badge) → percentuale crescente → nome.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareMuscleRowsByStimulusPriority(a, b) {
  const rankA = stimulusPriorityRank(a?.hubLabel || a?.triageLabel);
  const rankB = stimulusPriorityRank(b?.hubLabel || b?.triageLabel);
  if (rankA !== rankB) return rankA - rankB;
  const pctA = Math.round(Number(a?.pct) || 0);
  const pctB = Math.round(Number(b?.pct) || 0);
  if (pctA !== pctB) return pctA - pctB;
  return String(a?.label || a?.id || '').localeCompare(String(b?.label || b?.id || ''), 'it');
}

/**
 * @param {unknown} rows
 * @returns {object[]}
 */
export function sortMuscleRowsByStimulusPriority(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort(compareMuscleRowsByStimulusPriority);
}

/** Target volume normalizzato (100% = gruppo coperto). */
export const MUSCLE_VOLUME_TARGET = 100;

/** Finestra copertura Costanza (7 giorni). */
export const MUSCLE_STIMULUS_LOOKBACK_DAYS = 7;

/** Compat triage legacy (≤15 → DA STIMOLARE). */
export const HYPERTROPHY_TRIAGE_STIMULATE_MAX = 15;

/**
 * Media 0–100 copertura gruppi Costanza (Petto, Schiena, Spalle, Gambe, Core — Braccia inclusa in UI avg).
 *
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   averageStimulus?: number | null,
 *   weeklyGoalDays?: number,
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
    weeklyGoalDays: input?.weeklyGoalDays,
  });

  const values = (Array.isArray(muscleRows) ? muscleRows : []).map((row) => (
    Math.max(0, Math.min(100, Number(row.pct) || 0))
  ));
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
  const p = Math.round(Number(percent0to100) || 0);
  if (p >= 100) return 'OTTIMALE';
  if (p > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'IN RECUPERO';
  return 'DA STIMOLARE';
}

export function muscleTriageLevel(value) {
  const pct = clamp01(value) * 100;
  if (pct >= 100) return 'good';
  if (pct > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'warning';
  return 'critical';
}

/**
 * Distretti Costanza ordinati per priorità (vuoti / toccati / coperti).
 */
export function buildMuscleTelemetryRows({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  historyDays = 14,
  weeklyGoalDays = undefined,
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

  const ui = buildCostanzaUiModel({
    fullHistory: fullHistory || {},
    asOfDate: activeIso,
    weeklyGoalDays: normalizeWeeklyGoalDays(weeklyGoalDays),
  });

  const labeled = ui.groups.map((group) => ({
    ...group,
    triageLabel: group.hubLabel,
    isTopPriority: group.status === 'vuoto',
    daysSinceStimulus: group.muscles?.[0]?.daysSinceTrained ?? null,
    currentVolume: group.pct,
    targetVolume: MUSCLE_VOLUME_TARGET,
    completionRatio: group.pct / MUSCLE_VOLUME_TARGET,
    shortLabel: group.label,
  }));

  return {
    state,
    telemetrySeries,
    muscleRows: sortMuscleRowsByStimulusPriority(labeled),
    costanza: ui,
  };
}

/**
 * Hook: serie storica + distretti Costanza.
 */
export function useMuscleTelemetryModel({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  weeklyGoalDays = undefined,
} = {}) {
  const [historyDays, setHistoryDays] = useState(14);

  const model = useMemo(
    () => buildMuscleTelemetryRows({
      fourCylinder,
      fullHistory,
      activeLog,
      activeDate,
      historyDays,
      weeklyGoalDays,
    }),
    [fourCylinder, fullHistory, activeLog, activeDate, historyDays, weeklyGoalDays],
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

/**
 * Giorni dall'ultimo allenamento (peso 1) su un gruppo Costanza / pilastro legacy.
 * @param {object|null|undefined} fullHistory
 * @param {string} cylinderOrGroupId
 * @param {{ todayIso?: string }} [opts]
 * @returns {number|null}
 */
export function getDaysSinceLastStimulus(fullHistory, cylinderOrGroupId, opts = {}) {
  const todayIso = String(opts.todayIso || getTodayString()).slice(0, 10);
  const snap = computeCostanzaForza({
    fullHistory: fullHistory || {},
    asOfDate: todayIso,
  });
  const id = String(cylinderOrGroupId || '').trim().toLowerCase();
  const groupAlias = {
    legs: 'gambe',
    chest: 'petto',
    back_shoulders: 'schiena',
    arms: 'braccia',
    core: 'core',
  };
  const groupId = groupAlias[id] || id;
  const g = snap.groups?.[groupId];
  if (!g?.muscleIds?.length) return null;
  let best = null;
  for (const mid of g.muscleIds) {
    const d = snap.muscles?.[mid]?.daysSinceTrained;
    if (d == null) continue;
    if (best == null || d < best) best = d;
  }
  return best;
}
