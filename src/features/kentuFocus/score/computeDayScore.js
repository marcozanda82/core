/**
 * Punteggio deterministico di un giorno. Puro: niente UI, niente Firebase.
 */

import { detectDayGaps, getDayStatus } from '../../dayStatus/dayStatus.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import {
  resolveFocusMealIdentity,
  resolveFoodClockHourDetailed,
} from '../normalize/focusMealSlots.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import {
  computeDinnerSleepBufferH,
  normalizeSleepNight,
} from '../normalize/normalizeSleepNight.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { buildFocusFoodQualityBlock } from '../product/buildFocusFoodQualityBlock.js';
import {
  assessEnergyLowDay,
  assessHeavyLateMeal,
  LATE_FIRST_MEAL_HOUR,
  SUBSTANTIAL_MEAL_MIN_KCAL,
} from '../product/focusMealEnergySignals.js';
import { formatFocusHoursIt } from '../normalize/focusDateUtils.js';
import { computeTotali } from '../../../utils/computeTotaliCore.js';
import { hashDayFacts } from './dayScoreRecord.js';
import {
  CARDIO_WINDOW,
  CYLINDER_POINTS,
  CYLINDER_WEIGHTS as WEIGHTS_K1,
  ENERGY_BANDS,
  LOW_RELIABILITY_STATUSES as LOW_RELIABILITY_K1,
  MIN_CYLINDERS_WITH_DATA as MIN_CYLINDERS_K1,
  NOVA4_CRITIQUE_SIGNAL_ID as NOVA4_K1,
  NULL_SCORE_STATUSES as NULL_STATUSES_K1,
  SCORE_VERSION as VERSION_K1,
  SLEEP_BANDS,
  STRENGTH_WINDOW,
} from './scoreConfig.kds-1.js';
import {
  CARDIO_CURVE,
  CYLINDER_WEIGHTS as WEIGHTS_K2,
  ENERGY_CURVE,
  LOW_RELIABILITY_STATUSES as LOW_RELIABILITY_K2,
  MIN_CYLINDERS_WITH_DATA as MIN_CYLINDERS_K2,
  NOVA4_CRITIQUE_SIGNAL_ID as NOVA4_K2,
  NULL_SCORE_STATUSES as NULL_STATUSES_K2,
  SCORE_VERSION as VERSION_K2,
  SLEEP_CURVE,
  STRENGTH_CURVE,
} from './scoreConfig.kds-2.js';
import {
  CYLINDER_WEIGHTS as WEIGHTS_K3,
  LOW_RELIABILITY_STATUSES as LOW_RELIABILITY_K3,
  MIN_CYLINDERS_WITH_DATA as MIN_CYLINDERS_K3,
  NULL_SCORE_STATUSES as NULL_STATUSES_K3,
  MEAL_PENALTY_CAP,
  ON_TRACK_SCORE,
  SCORE_VERSION as VERSION_K3,
} from './scoreConfig.kds-3.js';
import { forzaEnabled, forceLoad, scoreMovimento } from './scoreMovement.js';
import { computeSafety } from '../safety/computeSafety.js';
import { ENERGY_ACT_SCORE_CAP } from '../safety/safetyConfig.sfv-1.js';

const CYLINDER_KEYS = ['alimentazione', 'sonno', 'forza', 'cardio'];
const FOOD_TYPES = new Set(['food', 'recipe']);

/**
 * @param {string} date
 * @param {{
 *   today: string,
 *   fullHistory?: object|null,
 *   userTargets?: { kcal?: number }|null,
 *   profile_targets?: object|null,
 *   targetKcal?: number|null,
 *   records?: Record<string, object>|null,
 *   record?: object|null,
 *   catalogs?: object|null,
 * }} context
 */
export function computeDayScore(date, context = {}) {
  const version = context.scoreVersion === VERSION_K1
    ? VERSION_K1
    : context.scoreVersion === VERSION_K2
      ? VERSION_K2
      : VERSION_K3;
  const weights = version === VERSION_K1 ? WEIGHTS_K1 : version === VERSION_K2 ? WEIGHTS_K2 : WEIGHTS_K3;
  const minCylinders = version === VERSION_K1
    ? MIN_CYLINDERS_K1
    : version === VERSION_K2 ? MIN_CYLINDERS_K2 : MIN_CYLINDERS_K3;
  const nullStatuses = version === VERSION_K1
    ? NULL_STATUSES_K1
    : version === VERSION_K2 ? NULL_STATUSES_K2 : NULL_STATUSES_K3;
  const lowStatuses = version === VERSION_K1
    ? LOW_RELIABILITY_K1
    : version === VERSION_K2 ? LOW_RELIABILITY_K2 : LOW_RELIABILITY_K3;
  const cylinderKeys = version === VERSION_K3
    ? ['alimentazione', 'sonno', 'movimento']
    : CYLINDER_KEYS;
  const targetKcal = resolveTargetKcal(context);
  const dayStatus = getDayStatus(date, {
    today: context.today,
    fullHistory: context.fullHistory,
    records: context.records,
    record: context.record,
    targetKcal,
  });
  const gaps = detectDayGaps(date, {
    fullHistory: context.fullHistory,
    targetKcal,
  });
  const facts = readDayFacts(date, context.fullHistory, targetKcal);
  const curveVersion = version === VERSION_K1 ? VERSION_K1 : VERSION_K2;
  const cylinders = version === VERSION_K3
    ? {
      alimentazione: scoreAlimentazione(curveVersion, date, context, facts, targetKcal, version),
      sonno: scoreSonno(curveVersion, facts),
      movimento: scoreMovimento(date, context.fullHistory, context),
      forza: forzaEnabled(context)
        ? scoreForza(curveVersion, date, context.fullHistory)
        : cylinder('inactive', 'Forza · non attiva', [], null),
    }
    : {
      alimentazione: scoreAlimentazione(version, date, context, facts, targetKcal),
      sonno: scoreSonno(version, facts),
      forza: scoreForza(version, date, context.fullHistory),
      cardio: scoreCardio(version, date, context.fullHistory),
    };

  const safety = version === VERSION_K3 ? computeSafety(date, context) : null;
  const withData = cylinderKeys.filter((key) => cylinders[key].status !== 'no_data' && cylinders[key].status !== 'inactive');
  let score = null;
  if (withData.length >= minCylinders) {
    const weightSum = withData.reduce((sum, key) => sum + weights[key], 0);
    const weighted = withData.reduce((sum, key) => {
      const points = version === VERSION_K1
        ? CYLINDER_POINTS[cylinders[key].status]
        : cylinders[key].value;
      return sum + points * weights[key];
    }, 0);
    score = round3(weighted / weightSum);
  }
  if (nullStatuses.includes(dayStatus)) score = null;

  const reliability = reliabilityOf(version, dayStatus, gaps, lowStatuses);

  const result = {
    version,
    score,
    reliability,
    cylinders,
    dayStatus,
    dataVersion: hashDayFacts({
      targetKcal,
      dayStatus,
      gaps: gaps.reasons,
      facts,
      movementCheckin: context.movementCheckins?.[date] ?? null,
      forzaEnabled: forzaEnabled(context),
      safety: safety ? safety.signals.map((item) => `${item.id}:${item.level}`) : null,
    }),
  };
  if (safety?.signals.some((item) => item.area === 'Energia' && item.level === 'act') && score != null) {
    score = Math.min(score, ENERGY_ACT_SCORE_CAP);
    result.score = score;
  }
  if (safety?.suppressNumbers) result.suppressNumbers = true;
  if (version === VERSION_K3) {
    const load = forzaEnabled(context) ? forceLoad(date, context.fullHistory) : 0;
    result.forceIntensity = score != null && score >= ON_TRACK_SCORE ? load : 0;
  }
  return result;
}

function scoreAlimentazione(version, date, context, facts, targetKcal, scoreVersion = version) {
  const kcal = facts.kcal;
  if (!(kcal > 0) || !(targetKcal > 0)) {
    return cylinder('no_data', `${Math.round(kcal || 0)} kcal`, [], null);
  }

  const deviation = Math.abs(kcal - targetKcal) / targetKcal;
  const signals = [];
  const energy = assessEnergyLowDay(kcal, targetKcal, {
    firstMealHour: facts.firstSubstantialHour,
  });
  if (energy.active) signals.push('energy_low_day');
  if (
    scoreVersion === VERSION_K3
    && facts.firstSubstantialHour != null
    && facts.firstSubstantialHour >= LATE_FIRST_MEAL_HOUR
  ) {
    signals.push('late_first_meal');
  }
  const heavy = assessHeavyLateMeal(facts.dinnerKcal, kcal, targetKcal);
  if (heavy.active) signals.push('heavy_late_meal');
  const critique = countAdverseUltraProcessed(date, context);

  if (version === VERSION_K1) {
    let status = 'off_track';
    if (deviation <= ENERGY_BANDS.onTrackMaxDeviation) status = 'on_track';
    else if (deviation <= ENERGY_BANDS.halfwayMaxDeviation) status = 'halfway';
    if (critique > 0) {
      status = downgrade(status);
      signals.push(NOVA4_K1);
    }
    return cylinder(status, energyKeyFact(kcal, targetKcal), signals, CYLINDER_POINTS[status]);
  }

  let status = 'off_track';
  if (deviation <= ENERGY_CURVE.fullCreditDeviation) status = 'on_track';
  else if (deviation < ENERGY_CURVE.floorDeviation) status = 'halfway';

  let value = energyCurveValue(deviation);
  if (critique > 0) {
    value *= ENERGY_CURVE.ultraProcessedFactor;
    signals.push(NOVA4_K2);
  }
  let fact = energyKeyFact(kcal, targetKcal);
  const bedtimeUsable = ENERGY_CURVE.usableBedtimeProvenance.includes(facts.bedtimeProvenance);
  const buffer = facts.sleepBufferH;
  let penalty = 0;
  if (scoreVersion === VERSION_K3 && heavy.active) penalty += ENERGY_CURVE.lateMealPenalty;
  if (bedtimeUsable && buffer != null && buffer < ENERGY_CURVE.lateMealHours) {
    penalty += ENERGY_CURVE.lateMealPenalty;
    signals.push('late_meal_before_sleep');
    fact = `${fact} · ultimo pasto a ${formatDuration(buffer)}`;
  }
  if (scoreVersion === VERSION_K3) penalty = Math.min(penalty, MEAL_PENALTY_CAP);
  value -= penalty;
  return {
    ...cylinder(status, fact, signals, clamp01(value)),
    intakeKcal: Math.round(kcal),
  };
}

function scoreSonno(version, facts) {
  const hours = facts.sleepHours;
  if (!(hours > 0)) return cylinder('no_data', 'non registrato', [], null);

  if (version === VERSION_K1) {
    let status = 'off_track';
    if (hours >= SLEEP_BANDS.onTrackMinHours) status = 'on_track';
    else if (hours >= SLEEP_BANDS.halfwayMinHours) status = 'halfway';
    const signals = [];
    if (hours < SLEEP_BANDS.onTrackMinHours) signals.push('sleep_under_7h');
    const buffer = facts.sleepBufferH;
    const bedtimeUsable = SLEEP_BANDS.usableBedtimeProvenance.includes(facts.bedtimeProvenance);
    if (bedtimeUsable && buffer != null && buffer < SLEEP_BANDS.existingMealSignalHours) {
      signals.push('meal_within_3h_of_bedtime');
    }
    let fact = formatDuration(hours);
    if (bedtimeUsable && buffer != null && buffer < SLEEP_BANDS.mealBufferPenaltyHours) {
      status = downgrade(status);
      fact = `${fact} · ultimo pasto a ${formatDuration(buffer)}`;
    }
    return cylinder(status, fact, signals, CYLINDER_POINTS[status]);
  }

  let status = 'off_track';
  if (hours >= SLEEP_CURVE.fullMinHours && hours <= SLEEP_CURVE.fullMaxHours) status = 'on_track';
  else if (hours > SLEEP_CURVE.shortFloorHours && hours < SLEEP_CURVE.longFloorHours) status = 'halfway';

  const signals = [];
  if (hours < SLEEP_CURVE.fullMinHours) signals.push('sleep_under_7h');
  if (hours > SLEEP_CURVE.fullMaxHours) signals.push('sleep_over_9h');

  let value = sleepCurveValue(hours);
  const stars = facts.sleepQualityStars;
  if (stars != null && SLEEP_CURVE.qualityFactor[stars] != null) {
    value *= SLEEP_CURVE.qualityFactor[stars];
    signals.push('sleep_quality');
  }
  return {
    ...cylinder(status, formatDuration(hours), signals, clamp01(value)),
    sleepHours: hours,
  };
}

function scoreForza(version, date, fullHistory) {
  const cfg = version === VERSION_K1 ? STRENGTH_WINDOW : STRENGTH_CURVE;
  if (!fullHistory || typeof fullHistory !== 'object') {
    return cylinder('no_data', '0 sessioni in 30 giorni', [], null);
  }

  const trainedOn = new Map();
  let sessions = 0;
  for (const day of datesEnding(date, cfg.windowDays)) {
    for (const workout of strengthWorkouts(dayNode(fullHistory, day))) {
      sessions += 1;
      for (const macroId of obligationMacrosOf(workout, cfg)) {
        const dates = trainedOn.get(macroId) || [];
        dates.push(day);
        trainedOn.set(macroId, dates);
      }
    }
  }

  if (sessions === 0) return cylinder('no_data', '0 sessioni in 30 giorni', [], null);
  if (trainedOn.size === 0) {
    const value = version === VERSION_K1 ? CYLINDER_POINTS.on_track : 1;
    return cylinder('on_track', `${sessions} sessioni · nessuna parte alta o bassa`, [], value);
  }

  let status = 'on_track';
  const lastSince = new Map();
  let worst = 0;
  for (const [macroId, dates] of trainedOn) {
    const unique = [...new Set(dates)].sort();
    const since = calendarDaysBetween(unique[unique.length - 1], date);
    lastSince.set(macroId, since);
    if (since > worst) worst = since;
    const band = version === VERSION_K1 ? strengthBand(since) : strengthBandK2(since);
    if (bandRank(band) > bandRank(status)) status = band;
  }

  const fact = cfg.obligationMacros
    .filter((macroId) => lastSince.has(macroId))
    .map((macroId) => `${cfg.macroLabels[macroId]} ${agoPhrase(lastSince.get(macroId))}`)
    .join(' · ');
  const value = version === VERSION_K1
    ? CYLINDER_POINTS[status]
    : strengthCurveValue(worst);
  return cylinder(status, fact, [], value);
}

function scoreCardio(version, date, fullHistory) {
  const windowDays = version === VERSION_K1 ? CARDIO_WINDOW.windowDays : CARDIO_CURVE.windowDays;
  if (!fullHistory || typeof fullHistory !== 'object') {
    return cylinder('no_data', '0 min / 7 giorni', [], null);
  }
  let minutes = 0;
  for (const day of datesEnding(date, windowDays)) {
    minutes += cardioMinutesOf(dayNode(fullHistory, day));
  }
  minutes = Math.round(minutes * 10) / 10;
  let status = 'off_track';
  if (version === VERSION_K1) {
    if (minutes >= CARDIO_WINDOW.onTrackMinMinutes) status = 'on_track';
    else if (minutes >= CARDIO_WINDOW.halfwayMinMinutes) status = 'halfway';
    return cylinder(status, `${formatMinutes(minutes)} min / 7 giorni`, [], CYLINDER_POINTS[status]);
  }
  if (minutes >= CARDIO_CURVE.fullMinutes) status = 'on_track';
  else if (minutes >= CARDIO_CURVE.halfwayMinMinutes) status = 'halfway';
  const value = Math.min(1, minutes / CARDIO_CURVE.fullMinutes);
  return cylinder(status, `${formatMinutes(minutes)} min / 7 giorni`, [], round3(value));
}

function countAdverseUltraProcessed(date, context) {
  if (!context.fullHistory || !isIsoDateString(date)) return 0;
  const block = buildFocusFoodQualityBlock({
    fullHistory: context.fullHistory,
    analysisDate: date,
    catalogs: context.catalogs || null,
    recentDays: 1,
  });
  const items = block?.day?.nova4Items;
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item?.critiqueWorthy === true).length;
}

function readDayFacts(date, fullHistory, targetKcal) {
  const node = dayNode(fullHistory, date);
  const foods = foodEntries(node);
  const kcal = Math.round(Number(computeTotali(foods).kcal) || 0);
  const hours = foods
    .map((item) => resolveFoodClockHourDetailed(item, node?.mealTimes).hour)
    .filter((hour) => hour != null && Number.isFinite(hour));
  const lastMealHour = hours.length ? Math.max(...hours) : null;
  const substantial = foods
    .filter((item) => Number(item.kcal ?? item.cal) >= SUBSTANTIAL_MEAL_MIN_KCAL)
    .map((item) => resolveFoodClockHourDetailed(item, node?.mealTimes).hour)
    .filter((hour) => hour != null && Number.isFinite(hour));
  const dinnerKcal = Math.round(foods.reduce((sum, item) => {
    const meal = resolveFocusMealIdentity(item).canonicalMealType;
    if (meal !== 'cena') return sum;
    return sum + (Number(item.kcal ?? item.cal) || 0);
  }, 0));

  const night = readNight(fullHistory, date, lastMealHour);
  const sleepHours = night?.sleepAvailable ? Number(night.sleep?.hours?.value) : null;
  const bedtimeProvenance = night?.sleep?.bedtime?.provenance ?? null;
  const bedtime = Number(night?.sleep?.bedtime?.value);
  const sleepBufferH = Number.isFinite(bedtime)
    ? computeDinnerSleepBufferH(bedtime, lastMealHour)
    : null;

  return {
    kcal,
    targetKcal: targetKcal ?? null,
    lastMealHour,
    firstSubstantialHour: substantial.length ? Math.min(...substantial) : null,
    dinnerKcal,
    foodIds: foods.map((item) => String(item.id || item.name || '')).sort(),
    sleepHours: sleepHours > 0 ? sleepHours : null,
    sleepStorageDate: night?.sleep?.storageDate ?? null,
    sleepQualityStars: night?.sleep?.qualityStars?.provenance === 'recorded'
      ? night.sleep.qualityStars.value
      : null,
    bedtimeProvenance,
    sleepBufferH,
  };
}

function readNight(fullHistory, date, lastMealHour) {
  if (!isIsoDateString(date)) return null;
  const publicationDate = addCalendarDays(date, 1);
  return normalizeSleepNight(dayNode(fullHistory, publicationDate), {
    publicationDate,
    lastMealHour,
  });
}

function strengthWorkouts(node) {
  const pack = normalizeWorkoutEvents(node);
  return (pack?.activity?.workouts || []).filter(
    (workout) => workout?.activityKind?.value === 'strength',
  );
}

function obligationMacrosOf(workout, cfg) {
  const recorded = Array.isArray(workout?.muscleGroups?.value) ? workout.muscleGroups.value : [];
  const macros = new Set();
  if (recorded.includes(cfg.totalBodyGroup)) {
    for (const macroId of cfg.obligationMacros) macros.add(macroId);
  }
  for (const macroId of cfg.obligationMacros) {
    const groups = cfg.macros[macroId] || [];
    if (recorded.some((group) => groups.includes(group))) macros.add(macroId);
  }
  return [...macros];
}

function agoPhrase(days) {
  if (days === 0) return 'oggi';
  if (days === 1) return '1 giorno fa';
  return `${days} giorni fa`;
}

function strengthBand(daysSince) {
  if (daysSince <= STRENGTH_WINDOW.onTrackMaxDaysSince) return 'on_track';
  if (
    daysSince >= STRENGTH_WINDOW.halfwayMinDaysSince
    && daysSince <= STRENGTH_WINDOW.halfwayMaxDaysSince
  ) {
    return 'halfway';
  }
  if (daysSince > STRENGTH_WINDOW.halfwayMaxDaysSince) return 'off_track';
  // Distanza fra on_track e halfway: non resta senza regola.
  return 'halfway';
}

function cardioMinutesOf(node) {
  const pack = normalizeWorkoutEvents(node);
  const metric = pack?.activity?.cardioMinutes;
  const value = Number(metric?.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function energyKeyFact(kcal, targetKcal) {
  const rounded = Math.round(kcal);
  const delta = Math.round(rounded - targetKcal);
  if (delta < 0) return `${rounded} kcal · ${Math.abs(delta)} sotto`;
  if (delta > 0) return `${rounded} kcal · ${delta} sopra`;
  return `${rounded} kcal · 0 di scarto`;
}

function downgrade(status) {
  if (status === 'on_track') return 'halfway';
  if (status === 'halfway') return 'off_track';
  return status;
}

function bandRank(status) {
  if (status === 'off_track') return 2;
  if (status === 'halfway') return 1;
  return 0;
}

function cylinder(status, keyFact, signals, value) {
  return { status, keyFact, signals, value: value == null ? null : round3(value) };
}

function energyCurveValue(deviation) {
  const { fullCreditDeviation, floorDeviation, floorValue } = ENERGY_CURVE;
  if (deviation <= fullCreditDeviation) return 1;
  if (deviation >= floorDeviation) return floorValue;
  const span = floorDeviation - fullCreditDeviation;
  const t = (deviation - fullCreditDeviation) / span;
  return 1 - t * (1 - floorValue);
}

function sleepCurveValue(hours) {
  const { fullMinHours, fullMaxHours, shortFloorHours, longFloorHours, floorValue } = SLEEP_CURVE;
  if (hours >= fullMinHours && hours <= fullMaxHours) return 1;
  if (hours <= shortFloorHours || hours >= longFloorHours) return floorValue;
  if (hours < fullMinHours) {
    const t = (fullMinHours - hours) / (fullMinHours - shortFloorHours);
    return 1 - t * (1 - floorValue);
  }
  const t = (hours - fullMaxHours) / (longFloorHours - fullMaxHours);
  return 1 - t * (1 - floorValue);
}

function strengthCurveValue(daysSince) {
  const { fullMaxDaysSince, floorDaysSince, floorValue } = STRENGTH_CURVE;
  if (daysSince <= fullMaxDaysSince) return 1;
  if (daysSince >= floorDaysSince) return floorValue;
  const t = (daysSince - fullMaxDaysSince) / (floorDaysSince - fullMaxDaysSince);
  return 1 - t * (1 - floorValue);
}

function strengthBandK2(daysSince) {
  if (daysSince <= STRENGTH_CURVE.fullMaxDaysSince) return 'on_track';
  if (daysSince >= STRENGTH_CURVE.floorDaysSince) return 'off_track';
  return 'halfway';
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function reliabilityOf(version, dayStatus, gaps, lowStatuses) {
  if (version === VERSION_K3) {
    if (dayStatus === 'approximate' || gaps.hasGaps) return 'low';
    if (dayStatus === 'unconfirmed') return 'medium';
    return 'high';
  }
  return lowStatuses.includes(dayStatus) || gaps.hasGaps ? 'low' : 'high';
}

function formatDuration(hours) {
  return formatFocusHoursIt(hours) || 'non registrato';
}

function formatMinutes(minutes) {
  const rounded = Math.round(Number(minutes) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return text.replace('.', ',');
}

function foodEntries(node) {
  return collectDayLogForNutrition(node).filter((item) => {
    const type = String(item?.type || 'food').toLowerCase();
    return FOOD_TYPES.has(type);
  });
}

function dayNode(fullHistory, date) {
  return getTrackerDayNode(fullHistory, date);
}

function datesEnding(date, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addCalendarDays(date, -i));
  return out;
}

function calendarDaysBetween(from, to) {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function resolveTargetKcal(context) {
  const candidates = [
    context.targetKcal,
    context.userTargets?.kcal,
    context.profile_targets?.targetCalories,
    context.profile_targets?.targets?.kcal,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
