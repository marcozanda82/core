/**
 * Salvavita sfv-2. Puro: niente UI, niente Firebase.
 * Legge solo i giorni chiusi. Un giorno in pausa, aperto, bucato o non confermato
 * non produce segnali.
 */

import { getDayStatus } from '../../dayStatus/dayStatus.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { expandTrackerLogEntries, pickDayLogRaw } from '../normalize/expandTrackerDayLog.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import {
  normalizeQualityStars,
  normalizeSleepNight,
  pickMainNightSleepEntry,
} from '../normalize/normalizeSleepNight.js';
import {
  classifyWorkoutByType,
  resolveWorkoutDurationMinutes,
  strengthSessionPrimaries,
} from '../../commandTerminal/context/workoutMovement.js';
import { computeTotali } from '../../../utils/computeTotaliCore.js';
import {
  CLOSED_LOOKBACK_DAYS,
  DISTRICT_RECOVERY_HOURS,
  DISTRICT_SHORT_RECOVERY_TIMES,
  ENERGY_SUSTAINED_RATIO,
  ENERGY_UNDER_BASAL_DAYS,
  ENERGY_VERY_LOW_DAYS,
  ENERGY_VERY_LOW_RATIO,
  ENERGY_WINDOW_DAYS,
  LOAD_BASELINE_WEEKS,
  LOAD_SPIKE_RATIO,
  LOW_MORNING_SCORE,
  MORNING_CLUSTER_DAYS,
  MORNING_CLUSTER_HITS,
  OVERREACHING_CLUSTERS,
  PROTEIN_DEFICIT_RATIO,
  PROTEIN_GRAMS_PER_KG,
  REST_STREAK_ACT_DAYS,
  REST_STREAK_WATCH_DAYS,
  RESTRICTIVE_DAYS,
  RESTRICTIVE_WINDOW_DAYS,
  SAFETY_AREAS,
  SAFETY_VERSION,
  SHORT_SLEEP_HOURS,
  TRAINING_WINDOW_DAYS,
  WEIGHT_BLOCK_DAYS,
  WEIGHT_MIN_SAMPLES,
  WEIGHT_SAMPLE_DAYS,
  WEIGHT_WEEKLY_LOSS_RATIO,
} from './safetyConfig.sfv-1.js';

const FOOD_TYPES = new Set(['food', 'recipe']);
const WAKE_ENERGY_FIELDS = ['wakeEnergy', 'morningEnergy', 'energyOnWake', 'energiaRisveglio'];
const DISTRICT_OF = Object.freeze({
  gambe: 'gambe',
  petto: 'petto',
  schiena: 'dorso_spalle',
  spalle: 'dorso_spalle',
  braccia: 'braccia',
  core: 'core',
});
const DISTRICTS = Object.freeze(['gambe', 'petto', 'dorso_spalle', 'braccia', 'core']);

/**
 * @param {string} date
 * @param {object} [context]
 * @returns {{
 *   version: 'sfv-2',
 *   level: 'none' | 'watch' | 'act',
 *   signals: Array<{ id: string, area: string, level: 'watch' | 'act', evidence: object }>,
 *   suppressNumbers: boolean,
 * }}
 */
export function computeSafety(date, context = {}) {
  const empty = blank();
  if (!isIsoDateString(date)) return empty;
  const statusOf = makeStatus(date, context);
  if (statusOf(date) !== 'closed') return empty;

  const history = context.fullHistory;
  const targetKcal = resolveTargetKcal(context);
  const profile = profileOf(context);
  const basal = estimateBasalKcal(profile);
  const weighIns = collectWeighIns(context);
  const days = indexDays(history);

  const signals = [];
  signals.push(...energySignals(date, statusOf, history, targetKcal, basal));
  const weight = weightSignal(date, weighIns);
  if (weight) signals.push(weight);
  const protein = proteinSignal(date, statusOf, history, targetKcal, profile, weighIns);
  if (protein) signals.push(protein);
  const training = trainingSignals(date, statusOf, days);
  signals.push(...training);
  const over = overreachingSignal(date, statusOf, days, training);
  if (over) signals.push(over);
  const restrictive = restrictiveSignal(date, statusOf, history, targetKcal, basal);
  if (restrictive) signals.push(restrictive);

  const level = signals.some((item) => item.level === 'act')
    ? 'act'
    : signals.length > 0 ? 'watch' : 'none';
  return {
    version: SAFETY_VERSION,
    level,
    signals,
    suppressNumbers: signals.some((item) => item.id === 'restrictive_pattern'),
  };
}

function energySignals(date, statusOf, history, targetKcal, basal) {
  if (!(targetKcal > 0)) return [];
  const recent = lastClosedIntake(date, ENERGY_WINDOW_DAYS, statusOf, history);
  const out = [];
  if (recent.length === ENERGY_WINDOW_DAYS) {
    const mean = average(recent.map((day) => day.kcal));
    if (mean < targetKcal * ENERGY_SUSTAINED_RATIO) {
      out.push(signal('energy_deficit_sustained', SAFETY_AREAS.energia, 'watch', {
        days: recent.length,
        meanKcal: Math.round(mean),
        targetKcal: Math.round(targetKcal),
        ratio: round3(mean / targetKcal),
      }));
    }
  }
  const veryLow = recent.filter((day) => day.kcal < targetKcal * ENERGY_VERY_LOW_RATIO).length;
  const underBasal = basal > 0
    ? recent.filter((day) => day.kcal < basal).length
    : 0;
  if (veryLow >= ENERGY_VERY_LOW_DAYS || underBasal >= ENERGY_UNDER_BASAL_DAYS) {
    out.push(signal('energy_very_low_repeated', SAFETY_AREAS.energia, 'act', {
      days: recent.length,
      underTargetDays: veryLow,
      underBasalDays: underBasal,
      basalKcal: basal > 0 ? Math.round(basal) : null,
      targetKcal: Math.round(targetKcal),
    }));
  }
  return out;
}

function weightSignal(date, weighIns) {
  const sampleFrom = addCalendarDays(date, -(WEIGHT_SAMPLE_DAYS - 1));
  const samples = weighIns.filter((row) => row.date >= sampleFrom && row.date <= date);
  if (samples.length < WEIGHT_MIN_SAMPLES) return null;
  const recent = meanBetween(weighIns, addCalendarDays(date, -(WEIGHT_BLOCK_DAYS - 1)), date);
  const previous = meanBetween(
    weighIns,
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 2 - 1)),
    addCalendarDays(date, -WEIGHT_BLOCK_DAYS),
  );
  const prior = meanBetween(
    weighIns,
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 3 - 1)),
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 2)),
  );
  if (!(recent > 0) || !(previous > 0) || !(prior > 0)) return null;
  const lossRecent = (previous - recent) / previous;
  const lossPrevious = (prior - previous) / prior;
  if (!(lossRecent > WEIGHT_WEEKLY_LOSS_RATIO) || !(lossPrevious > WEIGHT_WEEKLY_LOSS_RATIO)) {
    return null;
  }
  return signal('weight_loss_fast', SAFETY_AREAS.peso, 'act', {
    weighIns: samples.length,
    recentKg: round3(recent),
    previousKg: round3(previous),
    priorKg: round3(prior),
    weeklyLoss: round3(lossRecent),
  });
}

function proteinSignal(date, statusOf, history, targetKcal, profile, weighIns) {
  if (!(targetKcal > 0)) return null;
  const recent = lastClosedIntake(date, ENERGY_WINDOW_DAYS, statusOf, history);
  if (recent.length < ENERGY_WINDOW_DAYS) return null;
  const weight = weightKgOn(date, weighIns, profile);
  if (!(weight > 0)) return null;
  const meanKcal = average(recent.map((day) => day.kcal));
  const meanProtein = average(recent.map((day) => day.prot));
  const gramsPerKg = meanProtein / weight;
  const deficit = (targetKcal - meanKcal) / targetKcal;
  if (!(deficit > PROTEIN_DEFICIT_RATIO) || !(gramsPerKg < PROTEIN_GRAMS_PER_KG)) return null;
  return signal('protein_low_in_deficit', SAFETY_AREAS.proteine, 'watch', {
    days: recent.length,
    meanKcal: Math.round(meanKcal),
    targetKcal: Math.round(targetKcal),
    meanProteinG: Math.round(meanProtein),
    gramsPerKg: round3(gramsPerKg),
    weightKg: round3(weight),
  });
}

function trainingSignals(date, statusOf, days) {
  const out = [];
  let streak = 0;
  for (let back = 0; back < CLOSED_LOOKBACK_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== 'closed') break;
    if (!hasHardSession(days.get(day))) break;
    streak += 1;
  }
  if (streak >= REST_STREAK_ACT_DAYS) {
    out.push(signal('no_rest_streak', SAFETY_AREAS.allenamento, 'act', { days: streak }));
  } else if (streak >= REST_STREAK_WATCH_DAYS) {
    out.push(signal('no_rest_streak', SAFETY_AREAS.allenamento, 'watch', { days: streak }));
  }

  const district = shortRecovery(date, statusOf, days);
  if (district) {
    out.push(signal('same_district_no_recovery', SAFETY_AREAS.allenamento, 'watch', district));
  }

  const spike = loadSpike(date, statusOf, days);
  if (spike) out.push(signal('load_spike', SAFETY_AREAS.allenamento, 'watch', spike));
  return out;
}

function overreachingSignal(date, statusOf, days, training) {
  const load = (training || []).filter((item) => item.id === 'no_rest_streak' || item.id === 'load_spike');
  if (load.length === 0) return null;
  const mornings = [];
  for (let back = 0; back < MORNING_CLUSTER_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== 'closed') continue;
    mornings.push(readMorning(days.get(day)));
  }
  const shortNights = mornings.filter((item) => item.hours != null && item.hours < SHORT_SLEEP_HOURS).length;
  const lowWake = mornings.filter((item) => item.wakeEnergy != null && item.wakeEnergy <= LOW_MORNING_SCORE).length;
  const lowQuality = mornings.filter((item) => item.quality != null && item.quality <= LOW_MORNING_SCORE).length;
  const clusters = [
    shortNights >= MORNING_CLUSTER_HITS,
    lowWake >= MORNING_CLUSTER_HITS,
    lowQuality >= MORNING_CLUSTER_HITS,
  ].filter(Boolean).length;
  if (clusters < OVERREACHING_CLUSTERS) return null;
  return signal('overreaching', SAFETY_AREAS.sovraccarico, 'act', {
    training: load.map((item) => item.id),
    shortNights,
    lowWakeEnergy: lowWake,
    lowSleepQuality: lowQuality,
  });
}

function restrictiveSignal(date, statusOf, history, targetKcal, basal) {
  if (!(targetKcal > 0)) return null;
  let days = 0;
  for (let back = 0; back < RESTRICTIVE_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== 'closed') continue;
    const intake = readIntake(history, day);
    if (!intake) continue;
    const underTarget = intake.kcal < targetKcal * ENERGY_VERY_LOW_RATIO;
    const underBasal = basal > 0 && intake.kcal < basal;
    if (underTarget || underBasal) days += 1;
  }
  if (days < RESTRICTIVE_DAYS) return null;
  return signal('restrictive_pattern', SAFETY_AREAS.rapporto, 'act', {
    days,
    windowDays: RESTRICTIVE_WINDOW_DAYS,
  });
}

function lastClosedIntake(date, count, statusOf, history) {
  const out = [];
  for (let back = 0; back < CLOSED_LOOKBACK_DAYS && out.length < count; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== 'closed') continue;
    const intake = readIntake(history, day);
    if (!intake) continue;
    out.push(intake);
  }
  return out;
}

function readIntake(history, date) {
  const foods = collectDayLogForNutrition(getTrackerDayNode(history, date)).filter((item) => {
    const type = String(item?.type || 'food').toLowerCase();
    return FOOD_TYPES.has(type);
  });
  if (foods.length === 0) return null;
  const totals = computeTotali(foods);
  const kcal = Math.round(Number(totals.kcal) || 0);
  if (!(kcal > 0)) return null;
  return { date, kcal, prot: Number(totals.prot) || 0 };
}

function hasHardSession(node) {
  return workoutsOf(node).some((entry) => {
    const kind = classifyWorkoutByType(entry).kind;
    return kind === 'strength' || kind === 'vigorous';
  });
}

function hardMinutes(node) {
  let minutes = 0;
  for (const entry of workoutsOf(node)) {
    const kind = classifyWorkoutByType(entry).kind;
    if (kind !== 'strength' && kind !== 'vigorous') continue;
    minutes += resolveWorkoutDurationMinutes(entry);
  }
  return minutes;
}

function shortRecovery(date, statusOf, days) {
  /** @type {Map<string, number[]>} */
  const instants = new Map();
  for (let back = 0; back < TRAINING_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== 'closed') continue;
    for (const entry of workoutsOf(days.get(day))) {
      if (classifyWorkoutByType(entry).kind !== 'strength') continue;
      const at = sessionMs(day, entry);
      for (const district of districtsOf(entry)) {
        const list = instants.get(district) || [];
        list.push(at);
        instants.set(district, list);
      }
    }
  }
  const limit = DISTRICT_RECOVERY_HOURS * 60 * 60 * 1000;
  let worst = null;
  for (const [district, stamps] of instants) {
    const sorted = [...stamps].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] - sorted[i - 1] < limit) gaps += 1;
    }
    if (gaps >= DISTRICT_SHORT_RECOVERY_TIMES && (!worst || gaps > worst.shortGaps)) {
      worst = { district, shortGaps: gaps };
    }
  }
  return worst;
}

function loadSpike(date, statusOf, days) {
  const current = weekMinutes(date, 0, statusOf, days);
  const baselines = [];
  for (let week = 1; week <= LOAD_BASELINE_WEEKS; week += 1) {
    const block = weekBlock(date, week, statusOf, days);
    if (!block.closed) return null;
    baselines.push(block.minutes);
  }
  const baseline = average(baselines);
  if (!(baseline > 0)) return null;
  if (!(current > baseline * LOAD_SPIKE_RATIO)) return null;
  return {
    weekMinutes: Math.round(current),
    baselineMinutes: Math.round(baseline),
    ratio: round3(current / baseline),
  };
}

function weekMinutes(date, weeksBack, statusOf, days) {
  return weekBlock(date, weeksBack, statusOf, days).minutes;
}

function weekBlock(date, weeksBack, statusOf, days) {
  const end = addCalendarDays(date, -weeksBack * TRAINING_WINDOW_DAYS);
  let minutes = 0;
  let closed = false;
  for (let back = 0; back < TRAINING_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(end, -back);
    if (statusOf(day) !== 'closed') continue;
    closed = true;
    minutes += hardMinutes(days.get(day));
  }
  return { minutes, closed };
}

function readMorning(node) {
  const night = normalizeSleepNight(node, { publicationDate: '1970-01-01' });
  const hours = night?.sleepAvailable ? Number(night.sleep?.hours?.value) : null;
  const quality = night?.sleep?.qualityStars?.provenance === 'recorded'
    ? Number(night.sleep.qualityStars.value)
    : null;
  const entry = pickMainNightSleepEntry(
    expandTrackerLogEntries(pickDayLogRaw(node)).filter((item) => item?.type === 'sleep'),
  );
  let wakeEnergy = null;
  for (const field of WAKE_ENERGY_FIELDS) {
    const value = Number(entry?.[field]);
    if (Number.isFinite(value)) {
      wakeEnergy = value;
      break;
    }
  }
  const stars = quality != null ? quality : normalizeQualityStars(entry?.quality ?? entry?.sleepQuality ?? entry?.rating);
  return {
    hours: hours > 0 ? hours : null,
    quality: Number.isFinite(stars) ? stars : null,
    wakeEnergy,
  };
}

function districtsOf(entry) {
  const found = new Set();
  for (const primary of strengthSessionPrimaries(entry)) {
    if (primary === 'total') {
      for (const district of DISTRICTS) found.add(district);
      continue;
    }
    const district = DISTRICT_OF[primary];
    if (district) found.add(district);
  }
  return [...found];
}

function workoutsOf(node) {
  const out = [];
  const seen = new Set();
  for (const entry of expandTrackerLogEntries(pickDayLogRaw(node))) {
    if (!entry || entry.isGhost === true) continue;
    if (String(entry.type || '').toLowerCase() !== 'workout') continue;
    const id = String(entry.id || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(entry);
  }
  return out;
}

function sessionMs(date, entry) {
  const hour = Number(entry?.mealTime ?? entry?.time ?? entry?.startHour);
  const clock = Number.isFinite(hour) ? hour : 12;
  return new Date(`${date}T00:00:00`).getTime() + clock * 60 * 60 * 1000;
}

function collectWeighIns(context) {
  const bags = [
    context.bodyMetrics,
    context.profile_targets?.bodyMetrics,
    context.fullHistory?.body_metrics,
    context.fullHistory?.bodyMetrics,
  ];
  const seen = new Set();
  const rows = [];
  for (const bag of bags) {
    const list = Array.isArray(bag) ? bag : (bag && typeof bag === 'object' ? Object.values(bag) : []);
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const day = String(entry.date || entry.effectiveDate || '').slice(0, 10);
      const kg = Number(entry.weight ?? entry.weightKg);
      if (!isIsoDateString(day) || !(kg > 0)) continue;
      const key = `${day}|${Math.round(kg * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ date: day, kg });
    }
  }
  return rows;
}

function weightKgOn(date, weighIns, profile) {
  const prior = weighIns.filter((row) => row.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  if (prior.length > 0) return prior[prior.length - 1].kg;
  const weight = Number(profile?.weight ?? profile?.peso);
  return weight > 0 ? weight : null;
}

function meanBetween(rows, from, to) {
  const found = rows.filter((row) => row.date >= from && row.date <= to);
  if (found.length === 0) return null;
  return average(found.map((row) => row.kg));
}

/**
 * Mifflin–St Jeor. Stesso offset dell'onboarding: M +5, F −161, N −78.
 * Un bmr già presente nel profilo resta quello stimato.
 * @param {object|null|undefined} profile
 * @returns {number|null}
 */
export function estimateBasalKcal(profile) {
  const stored = Number(profile?.bmr ?? profile?.BMR);
  if (stored > 0) return stored;
  const weight = Number(profile?.weight ?? profile?.peso);
  const height = Number(profile?.height ?? profile?.altezza);
  const age = Number(profile?.age ?? profile?.eta);
  if (!(weight > 0) || !(height > 0) || !(age > 0)) return null;
  const gender = String(profile?.gender || profile?.sesso || '').trim().toUpperCase();
  const offset = gender === 'F' || gender === 'FEMALE' || gender === 'DONNA'
    ? -161
    : gender === 'N' || gender === 'NEUTRO'
      ? -78
      : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + offset;
  return bmr > 0 ? Math.round(bmr) : null;
}

function profileOf(context) {
  return context.profile
    || context.userProfile
    || context.profile_targets?.profile
    || null;
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

function makeStatus(date, context) {
  return (day) => getDayStatus(day, day === date ? context : {
    today: context.today,
    fullHistory: context.fullHistory,
    records: context.records,
  });
}

function indexDays(history) {
  const days = new Map();
  if (!history || typeof history !== 'object') return days;
  for (const [key, node] of Object.entries(history)) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (!isIsoDateString(date) || !node || typeof node !== 'object') continue;
    days.set(date, node);
  }
  return days;
}

function signal(id, area, level, evidence) {
  return { id, area, level, evidence };
}

function blank() {
  return {
    version: SAFETY_VERSION,
    level: 'none',
    signals: [],
    suppressNumbers: false,
  };
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
