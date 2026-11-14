/**
 * Movimento e carica di forza di kds-3.
 * I passi, se un giorno ci sono, comandano la camminata di quel giorno.
 * Poi valgono le attività del diario. La stima del check-in entra solo
 * se quel giorno non ha già una camminata o un'attività vigorosa.
 */

import { calculateAge } from '../../../utils/profileAge.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { formatFocusHoursIt } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { getLogArray } from '../normalize/logUtils.js';
import { collectRecentWorkoutLogs } from '../../commandTerminal/context/recentWorkoutLogs.js';
import {
  classifyWorkoutByType,
  equivalentAerobicMinutes,
  strengthSessionPrimaries,
} from '../../commandTerminal/context/workoutMovement.js';
import { computeHypertrophyLevels01, HYPERTROPHY_SESSION_BOOST } from '../../../utils/hypertrophyMath.js';
import { MOVEMENT_CURVE } from './scoreConfig.kds-3.js';

export function scoreMovimento(date, fullHistory, context = {}) {
  const days = datesEnding(date, MOVEMENT_CURVE.windowDays);
  const byDay = workoutsByDay(fullHistory, date);
  const age = resolveAge(context);
  let weeklyEquivalent = 0;
  let sawDiary = fullHistory && typeof fullHistory === 'object';
  let todayWalkMin = 0;
  let todaySteps = null;
  let todayEstimated = false;
  let todayFromDiary = false;

  for (const day of days) {
    const node = dayNode(fullHistory, day);
    const steps = readSteps(node);
    const entries = byDay.get(day) || [];
    const parts = movementParts(entries);
    const checkIn = readCheckIn(context, day);
    const diaryMovement = parts.walkMin > 0 || parts.vigorousMin > 0;
    if (diaryMovement || steps != null) sawDiary = true;

    let walkMin = parts.walkMin;
    let dayEquivalent = entries.reduce((sum, entry) => sum + equivalentAerobicMinutes(entry), 0);
    if (!diaryMovement && checkIn != null) {
      walkMin = checkIn;
      dayEquivalent = checkIn;
      if (day === date) todayEstimated = true;
    }
    weeklyEquivalent += dayEquivalent;

    if (day === date) {
      todaySteps = steps;
      todayWalkMin = walkMin;
      todayFromDiary = diaryMovement;
    }
  }

  if (!sawDiary && todaySteps == null && !todayEstimated && !(todayWalkMin > 0)) {
    return cylinder('no_data', 'non registrato', [], null);
  }

  const dailyRatio = todaySteps != null
    ? Math.min(1, todaySteps / stepReference(age))
    : Math.min(1, todayWalkMin / MOVEMENT_CURVE.dailyWalkMinutes);
  const weeklyRatio = Math.min(1, weeklyEquivalent / MOVEMENT_CURVE.weeklyEquivalentMinutes);
  const value = MOVEMENT_CURVE.dailyWeight * dailyRatio + MOVEMENT_CURVE.weeklyWeight * weeklyRatio;

  let status = 'off_track';
  if (value >= MOVEMENT_CURVE.onTrackMinValue) status = 'on_track';
  else if (value >= MOVEMENT_CURVE.halfwayMinValue) status = 'halfway';

  const todayFact = todaySteps != null
    ? `oggi ${Math.round(todaySteps)} passi`
    : `oggi ${formatMinutes(todayWalkMin)}${todayEstimated ? ' stimati' : ''}`;
  const weekFact = `${formatMinutes(weeklyEquivalent)} eq / 7 giorni`;
  const signals = [];
  if (todayEstimated) signals.push('walk_estimated');
  if (todayFromDiary) signals.push('diary_movement');
  if (todaySteps != null) signals.push('steps');
  return {
    ...cylinder(status, `${todayFact} · ${weekFact}`, signals, value),
    acuteValue: Math.round(dailyRatio * 1000) / 1000,
    weeklyEquivalentMinutes: Math.round(weeklyEquivalent),
  };
}

/**
 * Intensità del blu. Il cruscotto resta sul residuo 0–1.
 * Una sessione piena (0,65 sul distretto) vale 1. Oltre, si ferma a 1.
 */
export function forceLoad(date, fullHistory) {
  const byDate = new Map();
  for (const entry of workoutsByDay(fullHistory, date).values()) {
    for (const session of entry) {
      const primaries = strengthSessionPrimaries(session);
      if (primaries.length === 0) continue;
      const day = String(session.__dateKey || '').slice(0, 10);
      if (!day) continue;
      const sessions = byDate.get(day) || [];
      sessions.push(primaries);
      byDate.set(day, sessions);
    }
  }
  const levels = computeHypertrophyLevels01(byDate, date);
  const max = Math.max(
    levels.legs,
    levels.chest,
    levels.back_shoulders,
    levels.arms,
    levels.core,
  );
  const fullSession = HYPERTROPHY_SESSION_BOOST / 100;
  if (!(fullSession > 0)) return 0;
  return Math.min(1, Math.round((max / fullSession) * 1000) / 1000);
}

export function forzaEnabled(context) {
  return context?.cylinders?.forza?.enabled === true;
}

function workoutsByDay(fullHistory, date) {
  const map = new Map();
  const { all } = collectRecentWorkoutLogs(fullHistory, [], date);
  for (const entry of all) {
    const day = String(entry.__dateKey || '').slice(0, 10);
    if (!day) continue;
    const list = map.get(day) || [];
    list.push(entry);
    map.set(day, list);
  }
  return map;
}

function movementParts(entries) {
  let walkMin = 0;
  let vigorousMin = 0;
  for (const entry of entries) {
    const kind = classifyWorkoutByType(entry).kind;
    const minutes = equivalentAerobicMinutes(entry);
    if (!(minutes > 0)) continue;
    if (kind === 'walk') walkMin += minutes;
    else if (kind === 'vigorous') vigorousMin += minutes / 2;
  }
  return { walkMin, vigorousMin };
}

function readSteps(node) {
  if (!node || typeof node !== 'object') return null;
  const direct = [node.steps, node.stepCount, node.passi, node.activity?.steps, node.activity?.stepCount];
  for (const candidate of direct) {
    const value = finiteSteps(candidate);
    if (value != null) return value;
  }
  for (const entry of getLogArray(node)) {
    const type = String(entry?.type || '').toLowerCase();
    if (type !== 'steps' && type !== 'passi') continue;
    const value = finiteSteps(entry.steps ?? entry.stepCount ?? entry.passi ?? entry.count ?? entry.value);
    if (value != null) return value;
  }
  return null;
}

function readCheckIn(context, date) {
  const raw = context?.movementCheckins?.[date] ?? context?.walkEstimates?.[date];
  if (raw == null) return null;
  if (typeof raw === 'number') return raw > 0 ? raw : null;
  const minutes = Number(raw.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

function stepReference(age) {
  if (age != null && age >= MOVEMENT_CURVE.ageThreshold) return MOVEMENT_CURVE.stepsFrom60;
  return MOVEMENT_CURVE.stepsUnder60;
}

export function resolveAge(context) {
  const direct = Number(
    context?.age
    ?? context?.profile?.age
    ?? context?.profile_targets?.profile?.age
    ?? context?.profile_targets?.age,
  );
  if (Number.isFinite(direct) && direct > 0 && direct < 120) return direct;
  const birth = context?.profile?.birthDate
    || context?.profile_targets?.profile?.birthDate
    || context?.profile_targets?.birthDate
    || null;
  const years = calculateAge(birth);
  return Number.isFinite(years) && years > 0 ? years : null;
}

function finiteSteps(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatMinutes(minutes) {
  return formatFocusHoursIt(Number(minutes) / 60) || '0 min';
}

function datesEnding(date, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addCalendarDays(date, -i));
  return out;
}

function dayNode(fullHistory, date) {
  return getTrackerDayNode(fullHistory, date);
}

function cylinder(status, keyFact, signals, value) {
  const rounded = value == null ? null : Math.round(value * 1000) / 1000;
  return { status, keyFact, signals, value: rounded };
}
