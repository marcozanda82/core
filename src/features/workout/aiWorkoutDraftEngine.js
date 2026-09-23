/**
 * Motore proposte AI per Sessioni: bozze efimere allineate a Cruscotto Stimolo + Cardio.
 * Non scrive sul diario: produce solo payload da confermare.
 */

import { addDays } from '../../calendarDateUtils';
import { getLogFromStoricoTree, getTodayString } from '../../coreEngine';
import {
  getMuscleGroupsForMacro,
  getWorkoutActivityTypeDef,
  resolveWorkoutActivityTypeId,
} from '../../activityCatalog';
import {
  calculateCardioStatus,
  isPureCardioEntry,
  isStrengthWorkoutType,
  resolveWorkoutTypeId,
} from '../commandTerminal/context/cardioCylinderStatus';
import { collectRecentWorkoutLogs } from '../commandTerminal/context/kentuGlobalState';
import { buildMuscleTelemetryRows } from '../trendHub/utils/muscleTelemetryModel';
import { DEFAULT_WORKOUT_KCAL } from './lastWorkoutMemory';
import { AI_WORKOUT_PROPOSAL_SOURCE } from './activityDrafts';

export const STRENGTH_LOOKBACK_DAYS = 30;
export const STRENGTH_PROPOSAL_MINUTES = 45;
export const CARDIO_PROPOSAL_MIN_MINUTES = 10;
export const CARDIO_PROPOSAL_MAX_MINUTES = 75;

const SKIP_ENTRY_TYPES = new Set([
  'food',
  'meal',
  'recipe',
  'sleep',
  'nap',
  'work',
  'cognitive',
  'ghost_workout',
  'ghost_meal',
]);

const DISTRICT_WORKOUT_TYPE = {
  legs: 'gambe',
  chest: 'spinta',
  back_shoulders: 'trazione',
  arms: 'altro',
  core: 'altro',
};

function asIsoDay(value, fallback = '') {
  const day = String(value || fallback || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function roundToStep(value, step = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / step) * step;
}

function isGhostEntry(entry) {
  if (!entry || typeof entry !== 'object') return true;
  if (entry.isGhost === true) return true;
  const type = String(entry.type || '').toLowerCase();
  return type === 'ghost_workout' || type === 'ghost_meal';
}

export function isLoggedStrengthWorkout(entry) {
  if (isGhostEntry(entry)) return false;
  const type = String(entry.type || '').toLowerCase();
  if (SKIP_ENTRY_TYPES.has(type)) return false;
  if (isPureCardioEntry(entry)) return false;
  const typeId = resolveWorkoutTypeId(entry);
  if (isStrengthWorkoutType(typeId)) return true;
  const resolved = resolveWorkoutActivityTypeId(typeId || type);
  if (resolved && getWorkoutActivityTypeDef(resolved)?.category === 'strength') return true;
  if (resolved === 'pesi') return true;
  if ((type === 'workout' || type === 'activity') && resolved !== 'camminata' && resolved !== 'corsa' && resolved !== 'hiit' && resolved !== 'cardio') {
    return !isPureCardioEntry({ ...entry, workoutType: resolved || typeId });
  }
  return false;
}

export function collectLogsForLookbackDays({
  fullHistory = {},
  activeLog = [],
  todayIso = '',
  days = STRENGTH_LOOKBACK_DAYS,
} = {}) {
  const today = asIsoDay(todayIso, getTodayString());
  const rows = [];
  const seen = new Set();
  const lookback = Math.max(1, Math.round(Number(days) || STRENGTH_LOOKBACK_DAYS));

  for (let back = 0; back <= lookback; back += 1) {
    const dateKey = back === 0 ? today : addDays(today, -back);
    const log = back === 0 && Array.isArray(activeLog) && activeLog.length > 0
      ? activeLog
      : (getLogFromStoricoTree(fullHistory, dateKey) || []);
    (Array.isArray(log) ? log : []).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const id = String(entry.id || `${dateKey}:${entry.desc || entry.name || index}`);
      if (seen.has(id)) return;
      seen.add(id);
      rows.push({ ...entry, __dateKey: dateKey });
    });
  }
  return rows;
}

export function hasStrengthWorkoutInLookback(input = {}) {
  return collectLogsForLookbackDays(input).some(isLoggedStrengthWorkout);
}

/**
 * Attività già registrate oggi (niente ghost / planner): fonte per il blocco Forza.
 */
export function collectCompletedWorkoutsToday({
  fullHistory = {},
  activeLog = [],
  todayIso = '',
} = {}) {
  const today = asIsoDay(todayIso, getTodayString());
  const log = Array.isArray(activeLog) && activeLog.length > 0
    ? activeLog
    : (getLogFromStoricoTree(fullHistory, today) || []);
  return (Array.isArray(log) ? log : []).filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (isGhostEntry(entry)) return false;
    const type = String(entry.type || '').toLowerCase();
    if (SKIP_ENTRY_TYPES.has(type)) return false;
    if (type === 'workout' || type === 'activity') return true;
    const typeId = resolveWorkoutTypeId(entry);
    return Boolean(typeId && (isStrengthWorkoutType(typeId) || isPureCardioEntry(entry)));
  });
}

export function hasCompletedStrengthWorkoutToday(input = {}) {
  return collectCompletedWorkoutsToday(input).some(isLoggedStrengthWorkout);
}

export function preferredAerobicType({
  fullHistory = {},
  activeLog = [],
  todayIso = '',
} = {}) {
  const logs = collectLogsForLookbackDays({
    fullHistory,
    activeLog,
    todayIso,
    days: STRENGTH_LOOKBACK_DAYS,
  });
  const hasRun = logs.some((entry) => {
    if (isGhostEntry(entry)) return false;
    const hay = [
      resolveWorkoutTypeId(entry),
      entry.desc,
      entry.name,
      entry.title,
      entry.activityType,
    ].join(' ').toLowerCase();
    return /\b(corsa|running|run|jog)\b/.test(hay);
  });
  return hasRun ? 'corsa' : 'camminata';
}

export function readStimulusPriorityDistrict({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activeDate = null,
} = {}) {
  const { muscleRows } = buildMuscleTelemetryRows({
    fourCylinder,
    fullHistory,
    activeLog,
    activeDate,
    historyDays: 7,
  });
  const rows = Array.isArray(muscleRows) ? muscleRows : [];
  const labeled = rows.find((row) => String(row?.hubLabel || '').toUpperCase() === 'PRIORITÀ');
  const fallback = rows[0] || null;
  const district = labeled || fallback;
  if (!district) return null;
  const muscles = getMuscleGroupsForMacro(district.id).map((item) => item.id);
  return {
    id: district.id,
    label: district.label || district.id,
    pct: Math.round(Number(district.pct) || 0),
    hubLabel: district.hubLabel || null,
    muscles: muscles.length > 0 ? muscles : [district.label].filter(Boolean),
    workoutType: DISTRICT_WORKOUT_TYPE[district.id] || 'altro',
  };
}

export function readCardioDeficitMinutes({
  fullHistory = {},
  activeLog = [],
  todayIso = '',
  nowMs = Date.now(),
} = {}) {
  const today = asIsoDay(todayIso, getTodayString());
  const pools = collectRecentWorkoutLogs(fullHistory, activeLog, today);
  const status = calculateCardioStatus(pools.cardioLogs, pools.workoutLogs, { nowMs });
  const remaining = Math.max(0, Math.round(Number(status.remainingMinutes) || 0));
  return {
    remainingMinutes: remaining,
    accumulatedMinutes: Math.round(Number(status.accumulatedMinutes) || 0),
    weeklyTargetMinutes: Math.round(Number(status.weeklyTargetMinutes) || 150),
  };
}

function clampCardioMinutes(remaining) {
  const raw = Math.max(0, Math.round(Number(remaining) || 0));
  if (raw < CARDIO_PROPOSAL_MIN_MINUTES) return 0;
  return Math.min(CARDIO_PROPOSAL_MAX_MINUTES, Math.max(CARDIO_PROPOSAL_MIN_MINUTES, roundToStep(raw, 5)));
}

function buildStrengthPayload({ today, district, cardioRemainingMinutes }) {
  const workoutType = district.workoutType === 'altro' ? 'pesi' : district.workoutType;
  const minutes = STRENGTH_PROPOSAL_MINUTES;
  return {
    id: `ai_proposal_strength_${today}`,
    workoutName: `Forza · ${district.label}`,
    workoutType,
    activityType: 'pesi',
    subType: 'pesi',
    muscles: district.muscles,
    muscleTarget: district.id,
    durationMinutes: minutes,
    estimatedKcal: DEFAULT_WORKOUT_KCAL,
    cardioMinutesMissing: cardioRemainingMinutes,
    ephemeral: true,
    generatedBy: AI_WORKOUT_PROPOSAL_SOURCE,
  };
}

function buildCardioPayload({ today, minutes, aerobicType, exclusive = false }) {
  const label = aerobicType === 'corsa' ? 'Corsa' : 'Camminata';
  const kcalPerMin = aerobicType === 'corsa' ? 10 : 5;
  return {
    id: `ai_proposal_cardio_${today}`,
    workoutName: `${label} · ${minutes} min`,
    workoutType: aerobicType,
    activityType: aerobicType,
    subType: aerobicType,
    durationMinutes: minutes,
    estimatedKcal: Math.max(40, Math.round(minutes * kcalPerMin)),
    cardioMinutesMissing: minutes,
    exclusiveCardio: exclusive,
    ephemeral: true,
    generatedBy: AI_WORKOUT_PROPOSAL_SOURCE,
  };
}

/**
 * Genera 0–2 payload di bozza AI per la giornata.
 * Forza solo se c'è storico pesi ≤30g, il distretto PRIORITÀ, e NESSUNA Forza già completata oggi.
 * Cardio se manca il target settimanale (anche dopo una sessione pesi odierna).
 */
export function buildAiWorkoutDraftProposals({
  todayIso = '',
  fourCylinder = null,
  fullHistory = {},
  activeLog = [],
  nowMs = Date.now(),
} = {}) {
  const today = asIsoDay(todayIso, getTodayString());
  const completedToday = collectCompletedWorkoutsToday({
    fullHistory,
    activeLog,
    todayIso: today,
  });
  const strengthDoneToday = completedToday.some(isLoggedStrengthWorkout);
  const strengthHistoryOk = hasStrengthWorkoutInLookback({
    fullHistory,
    activeLog,
    todayIso: today,
    days: STRENGTH_LOOKBACK_DAYS,
  });

  const district = strengthDoneToday
    ? null
    : readStimulusPriorityDistrict({
      fourCylinder,
      fullHistory,
      activeLog,
      activeDate: today,
    });
  const cardio = readCardioDeficitMinutes({
    fullHistory,
    activeLog,
    todayIso: today,
    nowMs,
  });
  const cardioMinutes = clampCardioMinutes(cardio.remainingMinutes);
  const aerobicType = preferredAerobicType({
    fullHistory,
    activeLog,
    todayIso: today,
  });

  const payloads = [];
  const proposeStrength = !strengthDoneToday && strengthHistoryOk && district;

  if (proposeStrength) {
    payloads.push(buildStrengthPayload({
      today,
      district,
      cardioRemainingMinutes: cardio.remainingMinutes,
    }));
  }

  if (cardioMinutes > 0) {
    payloads.push(buildCardioPayload({
      today,
      minutes: cardioMinutes,
      aerobicType,
      exclusive: !proposeStrength,
    }));
  }

  return {
    today,
    strengthAllowed: strengthHistoryOk,
    strengthDoneToday,
    cardioRemainingMinutes: cardio.remainingMinutes,
    cardioProposalMinutes: cardioMinutes,
    priorityDistrict: district,
    payloads,
  };
}
