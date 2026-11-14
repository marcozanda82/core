/**
 * Breve del periodo per il dossier AI. Il codice decide punteggio, salvavita
 * e pilastro dell'azione. L'AI non li sceglie.
 */

import { expandTrackerLogEntries } from '../normalize/expandTrackerDayLog.js';
import { addCalendarDays, focusMonthName, formatFocusHoursIt, isIsoDateString } from '../normalize/focusDateUtils.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { STRENGTH_CURVE } from '../score/scoreConfig.kds-2.js';
import { monthOf } from './ui/focusPeriodCursor.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { assessEnergyIrregularity } from './focusEnergyVariability.js';
import { equivalentAerobicMinutes } from '../../commandTerminal/context/workoutMovement.js';
import { computeDayScore } from '../score/computeDayScore.js';
import {
  ACTION_PILLAR_WEIGHTS,
  ENERGY_IRREGULAR_PERIOD_PENALTY,
  MOVEMENT_CURVE,
  PERIOD_RULES,
  PILLAR_STATUS,
  SCORE_VERSION,
  isPeriodDataStatus,
  periodDayWeight,
  unconfirmedPeriodNote,
} from '../score/scoreConfig.kds-3.js';
import { SLEEP_CURVE } from '../score/scoreConfig.kds-2.js';
import { computeSafety } from '../safety/computeSafety.js';
import { SCORE_PENALTY_IDS } from './focusPenaltyCite.js';
import { buildBaseline, resolveCalibration } from './calibration.js';

const MOVEMENT_ESTIMATE_NOTE = 'Movimento in gran parte stimato dal check-in.';

const PILLAR_ORDER = Object.freeze(['alimentazione', 'sonno', 'movimento', 'forza']);
const SUPPORT_GAP_DAYS = 7;
const chainCache = new WeakMap();

/** Segnale del salvavita → pilastro del punteggio. */
const SIGNAL_PILLAR = Object.freeze({
  energy_deficit_sustained: 'alimentazione',
  energy_very_low_repeated: 'alimentazione',
  weight_loss_fast: 'alimentazione',
  protein_low_in_deficit: 'alimentazione',
  restrictive_pattern: 'alimentazione',
  no_rest_streak: 'movimento',
  load_spike: 'movimento',
  same_district_no_recovery: 'forza',
  overreaching: 'sonno',
});

/**
 * @param {string} periodId
 * @param {string} analysisDate
 * @param {object} [context] stesso contesto di computeDayScore, più profile
 */
export function buildFocusPeriodBrief(periodId, analysisDate, context = {}) {
  if (periodId === 'anno') {
    return { version: SCORE_VERSION, periodId, ai: false, reason: 'year_has_no_ai' };
  }
  if (!isIsoDateString(analysisDate)) return null;
  const window = windowFor(periodId, analysisDate, context);
  const box = chainBox(context);
  const days = [];
  for (let date = window.from; date <= window.to; date = addCalendarDays(date, 1)) {
    days.push(daySnapshot(date, context, box));
  }
  const anchor = days.find((day) => day.date === analysisDate) || days[days.length - 1];
  const past = days.filter((day) => isPastBriefDay(day, context.today));
  const eligible = past.filter((day) => (
    day.score.score != null && isPeriodDataStatus(day.score.dayStatus)
  ));
  const single = days.length === 1;
  const coverage = past.length === 0 ? 0 : round3(eligible.length / past.length);
  const score = single
    ? anchor.score.score
    : weightedScore(eligible, (day) => day.score.score, coverage);
  const forcePool = single ? [anchor] : eligible;
  const forceIntensity = forcePool.length === 0
    ? 0
    : round3(weightedScore(forcePool, (day) => Number(day.score.forceIntensity || 0), 1) || 0);
  const unconfirmedDays = past.filter((day) => day.score.dayStatus === 'unconfirmed').length;

  const pillars = PILLAR_ORDER.map((id) => pillarOf(
    id,
    single ? [anchor] : eligible,
    anchor,
    single,
    single ? [anchor] : past,
    window,
    context,
  ));
  if (!single) applyEnergyIrregularPenalty(pillars, analysisDate, context);
  const safety = mergeSafety(days);
  const reliability = anchor.score.reliability === 'low' || (!single && coverage < PERIOD_RULES.minCoverage)
    ? 'low'
    : single && anchor.score.reliability === 'medium'
      ? 'medium'
      : 'high';
  const actionPillar = single
    ? choiceOnDay(analysisDate, context, box)
    : chooseActionPillar(pillars, safety, {
      previous: [
        choiceOnDay(addCalendarDays(analysisDate, -1), context, box),
        choiceOnDay(addCalendarDays(analysisDate, -2), context, box),
      ],
    });

  return {
    version: SCORE_VERSION,
    periodId: periodId || 'ieri',
    from: window.from,
    to: window.to,
    horizon: window.horizon,
    actionHorizon: actionHorizonFor(periodId, window, context.today),
    ai: true,
    score,
    forceIntensity,
    dayStatus: anchor.score.dayStatus,
    reliability,
    pillars,
    safety,
    actionPillar,
    actionClose: actionCloseFor(actionPillar, pillars, single ? [anchor] : eligible, window, context),
    unconfirmedNote: unconfirmedPeriodNote(unconfirmedDays, past.length),
    movementEstimateNote: movementEstimateNote(window, context),
    calibration: resolveCalibration({
      today: context.today,
      registeredAt: context.profile_targets?.profile?.registeredAt
        || context.profile_targets?.profile?.onboardingCompletedAt
        || null,
      fullHistory: context.fullHistory,
      dayStatus: context.records || context.dayStatus || null,
    }),
    baseline: buildBaseline({
      fullHistory: context.fullHistory,
      registeredAt: context.profile_targets?.profile?.registeredAt
        || context.profile_targets?.profile?.onboardingCompletedAt
        || null,
      today: context.today,
      targetKcal: context.targetKcal,
      checkins: context.movementCheckins,
      dayStatus: context.records || context.dayStatus || null,
    }),
    support: supportDue(analysisDate, context, box)
      ? { id: 'restrictive_pattern' }
      : null,
  };
}

/**
 * Pilastro dell'azione. Un act del salvavita vince.
 * Altrimenti vince l'impatto maggiore: (1 − punteggio) × peso.
 * Se quel pilastro è già uscito nei due giorni precedenti, passa al successivo
 * solo se non è on_track. Se nessun altro è fuori dalla rotta, resta il primo.
 * Se anche il primo è on_track, l'azione è di mantenimento sul pilastro migliore.
 * @param {Array<{ id: string, status: string, value: number|null }>} pillars
 * @param {{ signals?: Array<{ id: string, level: string }> }} safety
 * @param {{ previous?: Array<string|null> }} [opts]
 */
export function chooseActionPillar(pillars, safety, opts = {}) {
  const list = Array.isArray(pillars) ? pillars : [];
  const act = (safety?.signals || []).find((item) => item?.level === 'act');
  if (act) {
    const mapped = SIGNAL_PILLAR[act.id] || 'alimentazione';
    return usablePillar(mapped, list);
  }
  const ranked = rankByImpact(list);
  if (ranked.length === 0) return 'alimentazione';
  const previous = Array.isArray(opts.previous) ? opts.previous : [];
  const repeated = previous.length >= 2
    && previous[0]
    && previous[0] === previous[1]
    && previous[0] === ranked[0].id;
  let chosenId = ranked[0].id;
  if (repeated) {
    const next = ranked.find((item) => item.id !== ranked[0].id && pillarStatus(list, item.id) !== 'on_track');
    if (next) chosenId = next.id;
  }
  if (pillarStatus(list, chosenId) === 'on_track') {
    return bestPillar(list)?.id || chosenId;
  }
  return chosenId;
}

function pillarStatus(list, id) {
  return list.find((item) => item.id === id)?.status || null;
}

function bestPillar(list) {
  return list
    .filter((item) => item.status !== 'no_data' && item.status !== 'inactive' && item.value != null)
    .slice()
    .sort((a, b) => b.value - a.value || PILLAR_ORDER.indexOf(a.id) - PILLAR_ORDER.indexOf(b.id))[0] || null;
}

function rankByImpact(pillars) {
  return pillars
    .filter((item) => item.status !== 'no_data' && item.status !== 'inactive' && item.value != null)
    .map((item) => ({
      id: item.id,
      impact: (1 - item.value) * (ACTION_PILLAR_WEIGHTS[item.id] || 0),
    }))
    .filter((item) => item.impact >= 0 && ACTION_PILLAR_WEIGHTS[item.id] > 0)
    .sort((a, b) => b.impact - a.impact || PILLAR_ORDER.indexOf(a.id) - PILLAR_ORDER.indexOf(b.id));
}

function pillarOf(id, pool, anchor, acute, past, window, context) {
  const anchorCylinder = anchor.score.cylinders?.[id] || {};
  if (anchorCylinder.status === 'inactive') {
    return { id, status: 'inactive', value: null, keyFact: '', active: false };
  }
  if (id === 'forza' && !acute) {
    const last = [...pool].reverse().find((day) => {
      const cylinder = day.score.cylinders?.forza;
      return cylinder && cylinder.status !== 'no_data' && cylinder.status !== 'inactive' && cylinder.value != null;
    });
    const cylinder = last?.score.cylinders?.forza || {};
    if (cylinder.status === 'inactive') {
      return { id, status: 'inactive', value: null, keyFact: '', active: false };
    }
    if (!last || cylinder.status === 'no_data' || cylinder.value == null) {
      return { id, status: 'no_data', value: null, keyFact: cylinder.keyFact || '', active: false };
    }
    const status = cylinder.status === 'on_track' || cylinder.status === 'halfway' || cylinder.status === 'off_track'
      ? cylinder.status
      : statusFromValue(cylinder.value);
    return {
      id,
      status,
      value: round3(cylinder.value),
      keyFact: acute ? (cylinder.keyFact || '') : periodKeyFact(id, pool, past, anchor, window, context),
      active: true,
    };
  }
  const value = weightedScore(
    pool,
    (day) => readingOf(id, day),
    1,
  );
  if (value == null) {
    return {
      id,
      status: 'no_data',
      value: null,
      keyFact: anchorCylinder.keyFact || '',
      active: false,
    };
  }
  return withPenalties({
    id,
    status: statusFromValue(value),
    value,
    keyFact: acute ? (anchorCylinder.keyFact || '') : periodKeyFact(id, pool, past, anchor, window, context),
    active: true,
  }, id, pool, acute);
}

const OUTSIDE_BAND = 0.15;

function periodKeyFact(id, pool, past, anchor, window, context) {
  const total = past?.length || pool.length || 0;
  if (id === 'alimentazione') return foodPeriodFact(pool, total, context);
  if (id === 'sonno') return sleepPeriodFact(pool, total);
  if (id === 'movimento') return movePeriodFact(window, context);
  if (id === 'forza') return forcePeriodFact(pool, window, context);
  return anchor?.score?.cylinders?.[id]?.keyFact || '';
}

function foodPeriodFact(pool, total, context) {
  const intakes = pool
    .map((day) => Number(day.score.cylinders?.alimentazione?.intakeKcal))
    .filter((kcal) => kcal > 0);
  if (intakes.length === 0 || total === 0) return '';
  const mean = Math.round(intakes.reduce((sum, kcal) => sum + kcal, 0) / intakes.length);
  const target = Number(context.targetKcal ?? context.userTargets?.kcal);
  const outside = target > 0
    ? intakes.filter((kcal) => Math.abs(kcal - target) / target > OUTSIDE_BAND).length
    : 0;
  const word = outside === 1 ? 'giorno' : 'giorni';
  return `media ${mean} kcal · ${outside} ${word} su ${total} fuori fascia`;
}

function sleepPeriodFact(pool, total) {
  const nights = pool
    .map((day) => Number(day.score.cylinders?.sonno?.sleepHours))
    .filter((hours) => hours > 0);
  if (nights.length === 0 || total === 0) return '';
  const mean = nights.reduce((sum, hours) => sum + hours, 0) / nights.length;
  const word = nights.length === 1 ? 'notte' : 'notti';
  return `media ${formatFocusHoursIt(mean)} · ${nights.length} ${word} su ${total}`;
}

function movePeriodFact(window, context) {
  const to = scoredWindowEnd(window, context.today);
  const days = inclusiveDays(window.from, to);
  if (days === 0) return '';
  const current = Math.round(movementMinutes(context.fullHistory, window.from, to));
  const reference = Math.round(MOVEMENT_CURVE.weeklyEquivalentMinutes * (days / MOVEMENT_CURVE.windowDays));
  return `${current} min su ${reference}`;
}

function forcePeriodFact(pool, window, context) {
  const to = scoredWindowEnd(window, context.today);
  const counts = countStrengthMacros(context.fullHistory, window.from, to);
  const parts = [];
  for (const id of ['parte_alta', 'parte_bassa']) {
    const n = counts.get(id) || 0;
    const label = STRENGTH_CURVE.macroLabels[id] || id;
    parts.push(n <= 0
      ? `${label}: nessuna`
      : `${label} ${n} ${n === 1 ? 'sessione' : 'sessioni'}`);
  }
  const other = counts.get('altre') || 0;
  if (other > 0) {
    parts.push(`${other} ${other === 1 ? 'altra sessione' : 'altre sessioni'}`);
  }
  const last = [...pool].reverse().find((day) => day.score.cylinders?.forza?.keyFact);
  if (last?.score.cylinders?.forza?.status === 'off_track') {
    const stale = staleMacros(last.score.cylinders.forza.keyFact || '');
    if (stale) parts.push(stale);
  }
  return parts.join(' · ');
}

function staleMacros(fact) {
  const stale = [];
  for (const part of String(fact).split('·').map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(parte (?:bassa|alta))\s+(\d+)\s+giorn/i);
    if (!match) continue;
    const days = Number(match[2]);
    stale.push(`${match[1]} ferma da ${days} ${days === 1 ? 'giorno' : 'giorni'}`);
  }
  return stale.join(' · ');
}

function countStrengthMacros(fullHistory, from, to) {
  const counts = new Map();
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const node = getTrackerDayNode(fullHistory, date);
    const pack = normalizeWorkoutEvents(node);
    for (const workout of pack?.activity?.workouts || []) {
      if (workout?.activityKind?.value !== 'strength') continue;
      const macros = macrosOfWorkout(workout);
      if (macros.length === 0) {
        counts.set('altre', (counts.get('altre') || 0) + 1);
        continue;
      }
      for (const id of macros) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

function macrosOfWorkout(workout) {
  const recorded = Array.isArray(workout?.muscleGroups?.value) ? workout.muscleGroups.value : [];
  const found = new Set();
  if (recorded.includes(STRENGTH_CURVE.totalBodyGroup)) {
    for (const id of STRENGTH_CURVE.obligationMacros) found.add(id);
  }
  for (const id of STRENGTH_CURVE.obligationMacros) {
    const groups = STRENGTH_CURVE.macros[id] || [];
    if (recorded.some((group) => groups.includes(group))) found.add(id);
  }
  return [...found];
}

function withPenalties(pillar, id, pool, acute) {
  if (id !== 'alimentazione' || pillar.value == null) return pillar;
  const found = new Set();
  for (const day of pool) {
    if (readingOf(id, day) == null) continue;
    const signals = day.score?.cylinders?.alimentazione?.signals || [];
    for (const signal of SCORE_PENALTY_IDS) {
      if (signals.includes(signal)) found.add(signal);
    }
  }
  const penalties = SCORE_PENALTY_IDS.filter((signal) => found.has(signal));
  if (penalties.length === 0) return pillar;
  return { ...pillar, penalties };
}

function isPastBriefDay(day, today) {
  if (isIsoDateString(today)) return day.date < today;
  return day.score.dayStatus !== 'future' && day.score.dayStatus !== 'in_progress';
}

function weightedScore(days, read, coverage) {
  const rows = [];
  for (const day of days) {
    const value = read(day);
    if (value == null || !Number.isFinite(value)) continue;
    const weight = periodDayWeight(day.score?.dayStatus);
    rows.push({ value, weight });
  }
  if (rows.length === 0 || coverage < PERIOD_RULES.minCoverage) return null;
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (weight === 0) return null;
  return round3(rows.reduce((sum, row) => sum + row.value * row.weight, 0) / weight);
}

function readingOf(id, day) {
  const cylinder = day.score.cylinders?.[id];
  if (!cylinder || cylinder.status === 'no_data' || cylinder.status === 'inactive') return null;
  if (cylinder.value == null) return null;
  return cylinder.value;
}

function usablePillar(id, pillars) {
  const found = pillars.find((item) => item.id === id);
  if (found && found.status !== 'inactive') return id;
  if (id === 'forza') return 'movimento';
  return 'alimentazione';
}

function mergeSafety(days) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  let suppressNumbers = false;
  for (const day of days) {
    if (day.safety?.suppressNumbers) suppressNumbers = true;
    for (const signal of day.safety?.signals || []) {
      const prev = byId.get(signal.id);
      if (!prev || signal.level === 'act') byId.set(signal.id, signal);
    }
  }
  const signals = [...byId.values()];
  const level = signals.some((item) => item.level === 'act')
    ? 'act'
    : signals.length > 0 ? 'watch' : 'none';
  return { level, signals, suppressNumbers };
}

function windowFor(periodId, analysisDate, context = {}) {
  if (periodId === 'settimana') {
    return { from: addCalendarDays(analysisDate, -6), to: analysisDate, horizon: 'questa settimana' };
  }
  if (periodId === 'mese') {
    const month = monthOf(analysisDate);
    const from = isIsoDateString(context.periodFrom) ? context.periodFrom : month.from;
    const to = isIsoDateString(context.periodTo) ? context.periodTo : month.to;
    return { from, to, horizon: 'questo mese' };
  }
  return { from: analysisDate, to: analysisDate, horizon: 'oggi' };
}

function applyEnergyIrregularPenalty(pillars, analysisDate, context) {
  const food = pillars.find((item) => item.id === 'alimentazione');
  if (!food || food.value == null || food.status === 'no_data' || food.status === 'inactive') return;
  const targetKcal = Number(context.targetKcal ?? context.userTargets?.kcal);
  const irregular = assessEnergyIrregularity({
    fullHistory: context.fullHistory,
    analysisDate,
    targetKcal,
    periodId: 'settimana',
  });
  if (!irregular.irregular) return;
  const value = round3(Math.max(0, food.value - ENERGY_IRREGULAR_PERIOD_PENALTY));
  food.value = value;
  food.status = statusFromValue(value);
  food.energyIrregular = true;
}

function actionCloseFor(actionPillar, pillars, pool, window, context) {
  const chosen = pillars.find((item) => item.id === actionPillar);
  const weekly = window.horizon === 'questo mese';
  const day = !isPeriodHorizon(window.horizon);
  if (chosen?.id === 'alimentazione') {
    const cause = foodCauseClose(pool, context, chosen);
    if (cause) return cause;
  }
  if (!chosen || chosen.status === 'on_track' || chosen.status === 'no_data' || chosen.status === 'inactive') {
    return null;
  }
  if (chosen.id === 'movimento') return day ? dayMovementClose(pool) : movementClose(window, context, weekly);
  if (chosen.id === 'alimentazione') return foodClose(pool, context, day);
  if (chosen.id === 'sonno') return sleepClose(pool, day);
  if (chosen.id === 'forza') return strengthClose(pool, weekly);
  return null;
}

function isPeriodHorizon(horizon) {
  return horizon === 'questa settimana' || horizon === 'questo mese';
}

function actionHorizonFor(periodId, window, today) {
  const complete = isIsoDateString(today) && today > window.to;
  if (!complete) return window.horizon;
  if (periodId === 'settimana') return 'la prossima settimana';
  if (periodId === 'mese') {
    const name = focusMonthName(addCalendarDays(window.to, 1));
    return name ? `a ${name}` : window.horizon;
  }
  return window.horizon;
}

function scoredWindowEnd(window, today) {
  if (!isIsoDateString(today) || today > window.to) return window.to;
  const end = addCalendarDays(today, -1);
  if (end < window.from) return window.from;
  return end < window.to ? end : window.to;
}

function movementClose(window, context, weekly) {
  const to = scoredWindowEnd(window, context.today);
  const days = inclusiveDays(window.from, to);
  const weeks = Math.max(days / MOVEMENT_CURVE.windowDays, 1);
  const current = movementMinutes(context.fullHistory, window.from, to);
  const reference = weekly
    ? MOVEMENT_CURVE.weeklyEquivalentMinutes
    : MOVEMENT_CURVE.weeklyEquivalentMinutes * weeks;
  const currentRate = weekly ? current / weeks : current;
  const gap = Math.max(0, reference - currentRate);
  const minimum = stepped(gap, 10);
  if (!minimum) return null;
  const phrase = weekly ? `${walkPhrase(minimum)} ogni settimana` : walkPhrase(minimum);
  return {
    unit: 'min',
    minimum,
    current: Math.round(weekly ? currentRate : current),
    reference: Math.round(reference),
    phrase,
  };
}

function foodCauseClose(pool, context, chosen) {
  const target = Number(context.targetKcal ?? context.userTargets?.kcal);
  if (!(target > 0)) return null;
  const intakes = pool
    .map((day) => Number(day.score.cylinders?.alimentazione?.intakeKcal))
    .filter((kcal) => kcal > 0);
  if (intakes.length === 0) return null;
  const mean = intakes.reduce((sum, item) => sum + item, 0) / intakes.length;
  const outside = intakes.filter((kcal) => Math.abs(kcal - target) / target > OUTSIDE_BAND).length;
  const inBand = Math.abs(mean - target) / target <= OUTSIDE_BAND;
  if (!inBand || !(chosen.energyIrregular || outside >= 2)) return null;
  return { unit: 'causa', minimum: 0, phrase: foodCausePhrase(pool, target) };
}

function foodCausePhrase(pool, target) {
  const tally = { heavy_late_meal: 0, late_first_meal: 0, late_meal_before_sleep: 0, over: 0, under: 0 };
  for (const day of pool) {
    const cylinder = day.score.cylinders?.alimentazione;
    const kcal = Number(cylinder?.intakeKcal);
    if (!(kcal > 0) || Math.abs(kcal - target) / target <= OUTSIDE_BAND) continue;
    const signals = cylinder?.signals || [];
    if (signals.includes('heavy_late_meal')) tally.heavy_late_meal += 1;
    if (signals.includes('late_first_meal')) tally.late_first_meal += 1;
    if (signals.includes('late_meal_before_sleep')) tally.late_meal_before_sleep += 1;
    if (kcal > target) tally.over += 1;
    else tally.under += 1;
  }
  const ranked = [
    ['heavy_late_meal', 'alleggerisci le cene abbondanti'],
    ['late_first_meal', 'anticipa il primo pasto'],
    ['late_meal_before_sleep', 'allontana l’ultimo pasto dal sonno'],
  ].sort((a, b) => tally[b[0]] - tally[a[0]]);
  if (tally[ranked[0][0]] > 0) return ranked[0][1];
  if (tally.over > tally.under) return 'avvicina le giornate alte all’obiettivo';
  if (tally.under > 0) return 'avvicina le giornate basse all’obiettivo';
  return 'avvicina i giorni fuori fascia all’obiettivo';
}

function foodClose(pool, context, day) {
  const target = Number(context.targetKcal ?? context.userTargets?.kcal);
  if (!(target > 0)) return null;
  const intakes = pool
    .map((item) => Number(item.score.cylinders?.alimentazione?.intakeKcal))
    .filter((kcal) => kcal > 0);
  if (intakes.length === 0) return null;
  const mean = intakes.reduce((sum, item) => sum + item, 0) / intakes.length;
  const under = mean < target;
  const amount = stepped(Math.abs(mean - target), 100);
  const place = day && pool.length === 1
    ? mealPlace(context.fullHistory, pool[0].date)
    : 'dal pasto più abbondante';
  const phrase = under
    ? (amount
      ? `aggiungi uno spuntino a metà pomeriggio (circa ${amount} kcal)`
      : 'aggiungi uno spuntino a metà pomeriggio')
    : (amount
      ? `togli circa ${amount} kcal ${place}`
      : `alleggerisci ${place}`);
  return { unit: 'kcal', minimum: amount || 0, phrase };
}

function dayMovementClose(pool) {
  const acute = Number(pool.at(-1)?.score.cylinders?.movimento?.acuteValue);
  if (!Number.isFinite(acute)) return null;
  const today = acute * MOVEMENT_CURVE.dailyWalkMinutes;
  const amount = stepped(Math.max(0, MOVEMENT_CURVE.dailyWalkMinutes - today), 10);
  if (!amount) return null;
  return {
    unit: 'min',
    minimum: amount,
    phrase: `fai una camminata di ${amount} minuti nel pomeriggio`,
  };
}

function sleepClose(pool, day) {
  const hours = pool
    .map((item) => Number(item.score.cylinders?.sonno?.sleepHours))
    .filter((value) => value > 0);
  if (hours.length === 0) return null;
  const mean = hours.reduce((sum, item) => sum + item, 0) / hours.length;
  let gap = 0;
  if (mean < SLEEP_CURVE.fullMinHours) gap = SLEEP_CURVE.fullMinHours - mean;
  else if (mean > SLEEP_CURVE.fullMaxHours) gap = mean - SLEEP_CURVE.fullMaxHours;
  const minimum = stepped(gap * 60, 10);
  if (!minimum) return null;
  const when = day ? 'stasera' : 'ogni sera';
  const phrase = mean > SLEEP_CURVE.fullMaxHours
    ? `accorcia il sonno di ${minimum} minuti, ${when}`
    : `vai a letto ${minimum} minuti prima, ${when}`;
  return { unit: 'min', minimum, phrase };
}

function strengthClose(pool, weekly) {
  const fact = [...pool].reverse()
    .map((item) => item.score?.cylinders?.forza?.keyFact || '')
    .find(Boolean) || '';
  const when = weekly ? 'ogni settimana' : 'nel pomeriggio';
  return {
    unit: 'sessioni',
    minimum: 1,
    phrase: `fai una sessione di ${stalerPart(fact)} ${when}`,
  };
}

function stalerPart(fact) {
  const text = String(fact || '');
  const upperNone = /parte alta:\s*nessuna/i.test(text);
  const lowerNone = /parte bassa:\s*nessuna/i.test(text);
  if (upperNone && !lowerNone) return 'parte alta';
  if (lowerNone && !upperNone) return 'parte bassa';
  let best = 'parte alta';
  let days = -1;
  for (const match of text.matchAll(/parte (bassa|alta)\s+(\d+)\s+giorn/gi)) {
    const n = Number(match[2]);
    if (n > days) {
      days = n;
      best = `parte ${match[1].toLowerCase()}`;
    }
  }
  return best;
}

function mealPlace(fullHistory, date) {
  const node = getTrackerDayNode(fullHistory, date);
  const totals = new Map();
  for (const entry of expandTrackerLogEntries(node?.log || node?.dati?.log || [])) {
    const type = String(entry?.type || '').toLowerCase();
    if (type !== 'food' && type !== 'meal') continue;
    const meal = mealKind(entry.mealType || entry.meal);
    const kcal = Number(entry.kcal);
    if (!meal || !(kcal > 0)) continue;
    totals.set(meal, (totals.get(meal) || 0) + kcal);
  }
  let best = '';
  let bestKcal = 0;
  for (const [meal, kcal] of totals) {
    if (kcal > bestKcal) {
      best = meal;
      bestKcal = kcal;
    }
  }
  if (best === 'colazione') return 'dalla colazione';
  if (best === 'pranzo') return 'dal pranzo';
  if (best === 'cena') return 'dalla cena';
  if (best === 'spuntino' || best === 'snack') return 'dallo spuntino';
  if (best === 'merenda') return 'dalla merenda';
  return 'dal pasto più abbondante';
}

function mealKind(meal) {
  const name = String(meal || '').toLowerCase();
  if (name.startsWith('colazione')) return 'colazione';
  if (name.startsWith('pranzo')) return 'pranzo';
  if (name.startsWith('cena')) return 'cena';
  if (name.startsWith('spuntino') || name.startsWith('snack') || name.startsWith('merenda')) return 'spuntino';
  return '';
}

/** Un terzo del divario, arrotondato al passo, senza superare metà del divario. */
function stepped(gap, step) {
  if (!(gap > 0) || !(step > 0)) return null;
  const third = Math.round((gap / 3) / step) * step;
  const halfCap = Math.floor((gap / 2) / step) * step;
  const proposed = third > 0 ? third : step;
  const amount = Math.min(proposed, halfCap);
  return amount >= step ? amount : null;
}

function walkPhrase(minimum) {
  if (minimum <= 45) return `fai una camminata di ${minimum} minuti nel pomeriggio`;
  const count = Math.min(10, Math.ceil(minimum / 20));
  const word = ['', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'][count];
  return `fai ${word} camminate da 20 minuti nel pomeriggio`;
}

function movementEstimateNote(window, context) {
  const to = scoredWindowEnd(window, context.today);
  let diary = 0;
  let estimated = 0;
  for (let date = window.from; date <= to; date = addCalendarDays(date, 1)) {
    const node = getTrackerDayNode(context.fullHistory, date);
    let dayDiary = 0;
    for (const entry of expandTrackerLogEntries(node?.log || node?.dati?.log || [])) {
      const type = String(entry?.type || '').toLowerCase();
      if (type !== 'workout' && type !== 'cardio' && type !== 'activity') continue;
      dayDiary += equivalentAerobicMinutes(entry);
    }
    const raw = context.movementCheckins?.[date];
    const minutes = Number(raw?.minutes ?? raw);
    if (dayDiary > 0) diary += dayDiary;
    else if (Number.isFinite(minutes) && minutes > 0) estimated += minutes;
  }
  const total = diary + estimated;
  if (!(total > 0) || estimated <= total / 2) return null;
  return MOVEMENT_ESTIMATE_NOTE;
}

function movementMinutes(fullHistory, from, to) {
  let total = 0;
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const node = getTrackerDayNode(fullHistory, date);
    for (const entry of expandTrackerLogEntries(node?.log || node?.dati?.log || [])) {
      const type = String(entry?.type || '').toLowerCase();
      if (type !== 'workout' && type !== 'cardio' && type !== 'activity') continue;
      total += equivalentAerobicMinutes(entry);
    }
  }
  return total;
}

function inclusiveDays(from, to) {
  let count = 0;
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) count += 1;
  return count;
}

function statusFromValue(value) {
  if (value >= PILLAR_STATUS.onTrackMin) return 'on_track';
  if (value >= PILLAR_STATUS.halfwayMin) return 'halfway';
  return 'off_track';
}

function chainBox(context) {
  let box = chainCache.get(context);
  if (!box) {
    box = { days: new Map(), choice: new Map(), earliest: earliestDate(context.fullHistory) };
    chainCache.set(context, box);
  }
  return box;
}

function earliestDate(fullHistory) {
  let min = null;
  for (const key of Object.keys(fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (!isIsoDateString(date)) continue;
    if (!min || date < min) min = date;
  }
  return min;
}

function daySnapshot(date, context, box) {
  const cached = box.days.get(date);
  if (cached) return cached;
  const pre = context.precomputedDays?.[date];
  const score = pre
    || (context.allowComputeFallback === false
      ? {
        version: SCORE_VERSION,
        score: null,
        reliability: 'low',
        cylinders: {},
        dayStatus: date >= context.today ? 'future' : 'hole',
      }
      : computeDayScore(date, context));
  const snap = {
    date,
    score,
    safety: context.allowComputeFallback === false && !pre
      ? { signals: [], suppressNumbers: false }
      : computeSafety(date, context),
  };
  box.days.set(date, snap);
  return snap;
}

function actionPillarsFor(snap) {
  return PILLAR_ORDER.map((id) => {
    const shown = pillarOf(id, [snap], snap, true);
    if (id !== 'movimento' || shown.value == null) return shown;
    const acute = snap.score.cylinders?.movimento?.acuteValue;
    if (acute == null || !Number.isFinite(Number(acute))) return shown;
    return { ...shown, value: round3(Number(acute)), status: statusFromValue(Number(acute)) };
  });
}

function choiceOnDay(date, context, box) {
  if (box.choice.has(date)) return box.choice.get(date);
  if (!box.earliest || date < box.earliest) {
    box.choice.set(date, null);
    return null;
  }
  const snap = daySnapshot(date, context, box);
  const pillars = actionPillarsFor(snap);
  const pick = chooseActionPillar(pillars, snap.safety, {
    previous: [
      choiceOnDay(addCalendarDays(date, -1), context, box),
      choiceOnDay(addCalendarDays(date, -2), context, box),
    ],
  });
  box.choice.set(date, pick);
  return pick;
}

function supportDue(anchor, context, box) {
  if (!box.earliest) return false;
  let last = null;
  for (let date = box.earliest; date <= anchor; date = addCalendarDays(date, 1)) {
    const snap = daySnapshot(date, context, box);
    const on = (snap.safety?.signals || []).some((item) => (
      item.id === 'restrictive_pattern' && item.level === 'act'
    ));
    if (!on) continue;
    if (last == null || daysBetween(last, date) >= SUPPORT_GAP_DAYS) {
      last = date;
      if (date === anchor) return true;
    }
  }
  return false;
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
