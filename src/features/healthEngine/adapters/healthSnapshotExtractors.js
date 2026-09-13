/**
 * Helper puri per getHealthSnapshot. Nessun import da salaComandi / centroAnalisi / trendHub.
 */

import {
  CERTAINTY_LEVELS,
  DEFAULT_CARDIO_TARGET_7D_MINUTES,
  DEFAULT_GLYCEMIC_PENALTY,
  DEFAULT_NUTRITION_TARGETS,
  EMPTY_MUSCLE_DECAY,
  METABOLIC_PHASE_IDS,
  MUSCLE_DISTRICT_IDS,
  PHASE_ABSORPTION_END_HOURS,
  PHASE_DIGESTION_HOURS,
  SLEEP_SOURCES,
} from '../contracts/healthSnapshot.types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NIGHT_SLEEP_MIN_HOURS = 3;

const PURE_CARDIO_TYPES = new Set([
  'cardio',
  'hiit',
  'liss',
  'corsa',
  'running',
  'run',
  'bike',
  'cycling',
  'cyclette',
  'spinning',
  'indoor_bike',
  'tapis',
  'tapis_roulant',
  'treadmill',
  'ellittica',
  'elliptical',
  'nuoto',
  'swim',
  'remo',
  'rowing',
  'camminata',
  'walking',
  'passi',
  'walk',
  'passeggio',
  'zona2',
  'z2',
]);

const CARDIO_LABEL_PATTERN =
  /\b(cardio|hiit|liss|corsa|correr|running|run|bike|cicl|cyclette|spinning|nuoto|swim|camminat|walking|walk|passi|tapis|treadmill|ellitt|remo|rowing|zona\s?2|\bz2\b)\b/i;

export function freezeDeep(value) {
  if (value == null || typeof value !== 'object') return value;
  Object.keys(value).forEach((key) => {
    freezeDeep(value[key]);
  });
  return Object.freeze(value);
}

export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export function isIsoDate(value) {
  return DATE_RE.test(String(value || '').slice(0, 10));
}

export function toIsoDateStr(value) {
  const raw = String(value || '').slice(0, 10);
  return isIsoDate(raw) ? raw : null;
}

export function addDaysIso(dateStr, deltaDays) {
  const base = toIsoDateStr(dateStr);
  if (!base) return null;
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(deltaDays || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function wrap24(hours) {
  let h = Number(hours);
  if (!Number.isFinite(h)) return 0;
  while (h < 0) h += 24;
  while (h >= 24) h -= 24;
  return round2(h);
}

export function asLogArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((e) => e && typeof e === 'object');
  if (typeof raw === 'object') {
    return Object.values(raw).filter((e) => e && typeof e === 'object');
  }
  return [];
}

export function resolveDayDateStr(node, fallbackKey = '') {
  const fromNode = toIsoDateStr(node?.data ?? node?.date ?? node?.dateStr);
  if (fromNode) return fromNode;
  const fromKey = String(fallbackKey || '').replace(/^trackerStorico_/, '');
  return toIsoDateStr(fromKey);
}

export function normalizeWeekDays(trackerStoricoWeek, trackerStoricoDay, dateStr) {
  const byDate = new Map();

  const ingest = (node, key) => {
    if (!node || typeof node !== 'object') return;
    const iso = resolveDayDateStr(node, key);
    if (!iso) return;
    byDate.set(iso, node);
  };

  if (Array.isArray(trackerStoricoWeek)) {
    trackerStoricoWeek.forEach((node, idx) => ingest(node, node?.data || node?.date || String(idx)));
  } else if (trackerStoricoWeek && typeof trackerStoricoWeek === 'object') {
    Object.entries(trackerStoricoWeek).forEach(([key, node]) => ingest(node, key));
  }

  if (trackerStoricoDay && typeof trackerStoricoDay === 'object') {
    ingest(trackerStoricoDay, dateStr);
  }

  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const iso = addDaysIso(dateStr, -i);
    if (!iso) continue;
    const node = byDate.get(iso) || null;
    days.push({
      dateStr: iso,
      node,
      log: asLogArray(node?.log),
      mealTimes: node?.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : {},
      manualNodes: asLogArray(node?.manualNodes),
    });
  }
  return days;
}

function parseDecimalHour(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return wrap24(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? wrap24(n) : null;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return wrap24(h + m / 60);
  }
  return null;
}

function msFromDayAndDecimalHour(dayKey, decimalHour) {
  const iso = toIsoDateStr(dayKey);
  if (!iso || decimalHour == null || !Number.isFinite(Number(decimalHour))) return null;
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hours) * 60);
  base.setHours(hours, minutes, 0, 0);
  const ms = base.getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function isFoodEntry(entry) {
  const type = String(entry?.type || '').toLowerCase();
  return type === 'food' || type === 'recipe';
}

function isUnresolvedDraft(entry) {
  return entry?.isDraft === true || entry?.unresolved === true || entry?.status === 'unassigned';
}

export function sumNutritionFromLog(log) {
  let calories = 0;
  let proteinGrams = 0;
  let fiberGrams = 0;
  (Array.isArray(log) ? log : []).forEach((item) => {
    if (!isFoodEntry(item) || isUnresolvedDraft(item)) return;
    calories += Number(item.kcal ?? item.cal ?? 0) || 0;
    proteinGrams += Number(item.prot ?? item.protein ?? item.proteine ?? 0) || 0;
    fiberGrams += Number(item.fibre ?? item.fiber ?? item.fibreTotali ?? 0) || 0;
  });
  return {
    calories: round2(calories),
    proteinGrams: round2(proteinGrams),
    fiberGrams: round2(fiberGrams),
  };
}

export function resolveFoodClockHour(entry, mealTimes = {}) {
  const fromEntry =
    parseDecimalHour(entry?.mealTime)
    ?? parseDecimalHour(entry?.time)
    ?? parseDecimalHour(entry?.consumedAt);
  if (fromEntry != null) return fromEntry;
  const mealType = String(entry?.mealType || '').trim();
  if (mealType && mealTimes && typeof mealTimes === 'object') {
    return parseDecimalHour(mealTimes[mealType]);
  }
  return null;
}

export function findLastMeal(log, mealTimes, dateStr) {
  let bestHour = null;
  let bestMs = null;
  (Array.isArray(log) ? log : []).forEach((entry) => {
    if (!isFoodEntry(entry) || isUnresolvedDraft(entry)) return;
    const hour = resolveFoodClockHour(entry, mealTimes);
    const loggedAt = Number(entry?.loggedAt ?? entry?.timestamp ?? 0);
    const fromClock = hour != null ? msFromDayAndDecimalHour(dateStr, hour) : null;
    const ms = fromClock
      ?? (Number.isFinite(loggedAt) && loggedAt > 0 ? loggedAt : null);
    if (ms == null) return;
    if (bestMs == null || ms >= bestMs) {
      bestMs = ms;
      bestHour = hour;
    }
  });

  if (bestHour == null && mealTimes && typeof mealTimes === 'object') {
    Object.values(mealTimes).forEach((raw) => {
      const hour = parseDecimalHour(raw);
      const ms = hour != null ? msFromDayAndDecimalHour(dateStr, hour) : null;
      if (ms == null) return;
      if (bestMs == null || ms >= bestMs) {
        bestMs = ms;
        bestHour = hour;
      }
    });
  }

  return {
    lastMealTimestamp: bestMs,
    lastMealDecimalHour: bestHour,
  };
}

export function sleepHoursFromEntry(entry) {
  const n = Number(entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function pickMainNightSleep(log) {
  const sleeps = (Array.isArray(log) ? log : []).filter((e) => e && e.type === 'sleep');
  if (sleeps.length === 0) return null;
  const longNights = sleeps.filter((e) => sleepHoursFromEntry(e) >= NIGHT_SLEEP_MIN_HOURS);
  const pool = longNights.length > 0 ? longNights : sleeps;
  return pool.reduce((best, entry) => {
    const hours = sleepHoursFromEntry(entry);
    if (!best || hours > sleepHoursFromEntry(best)) return entry;
    return best;
  }, null);
}

export function normalizeSleepQuality(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);

  const label = String(raw ?? '').trim().toLowerCase();
  if (!label) return 0;
  if (label.includes('ottim') || label.includes('eccell') || label === 'good') return 5;
  if (label.includes('buon') || label === 'ok') return label === 'ok' ? 3 : 4;
  if (label.includes('discret')) return 3;
  if (label.includes('scars') || label.includes('pess') || label.includes('bad') || label === 'poor') {
    return label.includes('pess') || label === 'poor' || label.includes('bad') ? 1 : 2;
  }
  return 0;
}

export function inferSleepSource(entry) {
  const explicit = String(entry?.source || '').toUpperCase();
  if (explicit === SLEEP_SOURCES.MANUAL || explicit === SLEEP_SOURCES.WEARABLE || explicit === SLEEP_SOURCES.CHAT) {
    return { source: explicit, certainty: CERTAINTY_LEVELS.MEASURED };
  }
  const id = String(entry?.id || '');
  if (id.includes('sleep_cmd') || id.includes('sleep_smart')) {
    return { source: SLEEP_SOURCES.CHAT, certainty: CERTAINTY_LEVELS.INFERRED };
  }
  const hr = Number(entry?.hr);
  const qualityScore = Number(entry?.qualityScore);
  const deepMin = Number(entry?.deepMin ?? entry?.deep);
  const remMin = Number(entry?.remMin ?? entry?.rem);
  const wearableHint =
    (Number.isFinite(hr) && hr > 0)
    || (Number.isFinite(qualityScore) && qualityScore > 5)
    || (Number.isFinite(deepMin) && Number.isFinite(remMin) && (deepMin !== 60 || remMin !== 60));
  if (wearableHint) {
    return { source: SLEEP_SOURCES.WEARABLE, certainty: CERTAINTY_LEVELS.INFERRED };
  }
  return { source: SLEEP_SOURCES.MANUAL, certainty: CERTAINTY_LEVELS.INFERRED };
}

export function resolveWakeTime(entry, hours) {
  const wake = parseDecimalHour(entry?.wakeTime ?? entry?.sleepEnd);
  if (wake != null) return wake;
  const start = parseDecimalHour(entry?.sleepStart ?? entry?.bedtime);
  if (start != null && hours > 0) return wrap24(start + hours);
  return null;
}

/**
 * Differenza oraria in avanti da lastMealHour a bedtime (wrap mezzanotte).
 * @param {number} bedtime
 * @param {number} lastMealHour
 */
export function computeDinnerSleepBuffer(bedtime, lastMealHour) {
  if (!Number.isFinite(bedtime) || !Number.isFinite(lastMealHour)) return null;
  let delta = bedtime - lastMealHour;
  if (delta < 0) delta += 24;
  if (delta > 18) return null;
  return round2(delta);
}

export function circularStdevHours(hoursList) {
  const samples = (Array.isArray(hoursList) ? hoursList : [])
    .map((h) => Number(h))
    .filter((h) => Number.isFinite(h));
  if (samples.length < 2) return 0;
  const rads = samples.map((h) => (wrap24(h) / 24) * 2 * Math.PI);
  const sinMean = rads.reduce((s, r) => s + Math.sin(r), 0) / rads.length;
  const cosMean = rads.reduce((s, r) => s + Math.cos(r), 0) / rads.length;
  const R = Math.hypot(sinMean, cosMean);
  if (!(R > 0) || R >= 1) return 0;
  const stdRad = Math.sqrt(-2 * Math.log(Math.min(1, R)));
  return round2((stdRad / (2 * Math.PI)) * 24);
}

export function durationToMinutes(entry) {
  const explicitMin = Number(entry?.durationMinutes ?? entry?.durationMin ?? entry?.minutes);
  if (Number.isFinite(explicitMin) && explicitMin > 0) return Math.round(explicitMin);
  const dur = Number(entry?.duration ?? entry?.hours);
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  if (dur > 5) return Math.round(dur);
  return Math.round(dur * 60);
}

function workoutTypeLabel(entry) {
  return String(
    entry?.workoutType
    ?? entry?.subType
    ?? entry?.type
    ?? entry?.name
    ?? entry?.desc
    ?? 'workout',
  ).trim() || 'workout';
}

export function isCardioWorkout(entry) {
  if (!entry || entry.type !== 'workout') return false;
  const typeId = String(entry.workoutType ?? entry.subType ?? '').trim().toLowerCase();
  if (PURE_CARDIO_TYPES.has(typeId)) return true;
  const label = `${entry.name || ''} ${entry.desc || ''} ${typeId}`;
  return CARDIO_LABEL_PATTERN.test(label);
}

export function collectTodayWorkouts(log, manualNodes = []) {
  const fromLog = (Array.isArray(log) ? log : []).filter((e) => e && e.type === 'workout');
  const fromNodes = (Array.isArray(manualNodes) ? manualNodes : []).filter((e) => e && e.type === 'workout');
  const seen = new Set();
  const merged = [];
  [...fromLog, ...fromNodes].forEach((entry) => {
    const id = entry?.id != null ? String(entry.id) : '';
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    merged.push({
      type: workoutTypeLabel(entry),
      durationMin: durationToMinutes(entry),
      timestamp: Number(entry?.loggedAt ?? entry?.timestamp ?? 0) || null,
      clockHour: parseDecimalHour(entry?.time ?? entry?.startTime),
      dateStrHint: toIsoDateStr(entry?.date),
    });
  });
  return merged;
}

export function cardioMinutesFromDaysAccurate(weekDays) {
  let minutes = 0;
  weekDays.forEach((day) => {
    const seen = new Set();
    const entries = [...asLogArray(day.log), ...asLogArray(day.manualNodes)];
    entries.forEach((entry) => {
      if (!entry || entry.type !== 'workout') return;
      const id = entry.id != null ? String(entry.id) : '';
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      if (isCardioWorkout(entry)) minutes += durationToMinutes(entry);
    });
  });
  return Math.max(0, Math.round(minutes));
}

export function lastWorkoutTimestamp(weekDays, dateStr, fourCylinderData) {
  let best = null;
  weekDays.forEach((day) => {
    const entries = [...asLogArray(day.log), ...asLogArray(day.manualNodes)];
    entries.forEach((entry) => {
      if (!entry || entry.type !== 'workout') return;
      const clock = parseDecimalHour(entry.time ?? entry.startTime);
      const fromClock = clock != null ? msFromDayAndDecimalHour(day.dateStr, clock) : null;
      const logged = Number(entry.loggedAt ?? entry.timestamp ?? 0);
      const ms = fromClock || (Number.isFinite(logged) && logged > 0 ? logged : null);
      if (ms != null && (best == null || ms > best)) best = ms;
    });
  });
  const fromCylinder = Number(fourCylinderData?.lastStimulus?.at);
  if (Number.isFinite(fromCylinder) && fromCylinder > 0 && (best == null || fromCylinder > best)) {
    return fromCylinder;
  }
  void dateStr;
  return best;
}

export function resolveTargets(userTargets) {
  const kcal = Number(userTargets?.kcal ?? userTargets?.targetCalories);
  const prot = Number(userTargets?.prot ?? userTargets?.protein ?? userTargets?.targetProteinGrams);
  const fibre = Number(userTargets?.fibre ?? userTargets?.fiber ?? userTargets?.targetFiberGrams);
  const hasAny = [kcal, prot, fibre].some((n) => Number.isFinite(n) && n > 0);
  return {
    targetCalories: Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : DEFAULT_NUTRITION_TARGETS.kcal,
    targetProteinGrams: Number.isFinite(prot) && prot > 0 ? round2(prot) : DEFAULT_NUTRITION_TARGETS.prot,
    targetFiberGrams: Number.isFinite(fibre) && fibre > 0 ? round2(fibre) : DEFAULT_NUTRITION_TARGETS.fibre,
    certainty: hasAny ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
  };
}

export function resolveMetabolicPhase(hoursSinceLastMeal, hasMeal) {
  if (!hasMeal || hoursSinceLastMeal == null || !Number.isFinite(hoursSinceLastMeal)) {
    return METABOLIC_PHASE_IDS.FASTING;
  }
  const h = Math.max(0, hoursSinceLastMeal);
  if (h < PHASE_DIGESTION_HOURS) return METABOLIC_PHASE_IDS.DIGESTION;
  if (h < PHASE_ABSORPTION_END_HOURS) return METABOLIC_PHASE_IDS.ABSORPTION;
  return METABOLIC_PHASE_IDS.FASTING;
}

export function normalizePhaseId(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (s === METABOLIC_PHASE_IDS.DIGESTION || s === 'DIGESTIONE') return METABOLIC_PHASE_IDS.DIGESTION;
  if (s === METABOLIC_PHASE_IDS.ABSORPTION || s === 'ASSORBIMENTO') return METABOLIC_PHASE_IDS.ABSORPTION;
  if (s === METABOLIC_PHASE_IDS.FASTING || s === 'DIGIUNO' || s.includes('FAST')) {
    return METABOLIC_PHASE_IDS.FASTING;
  }
  if (s.includes('DIGEST')) return METABOLIC_PHASE_IDS.DIGESTION;
  if (s.includes('ASSORB') || s.includes('ABSORB')) return METABOLIC_PHASE_IDS.ABSORPTION;
  return null;
}

export function extractMuscleDecay(fourCylinderData) {
  const src = fourCylinderData?.decay && typeof fourCylinderData.decay === 'object'
    ? fourCylinderData.decay
    : fourCylinderData;
  const out = { ...EMPTY_MUSCLE_DECAY };
  MUSCLE_DISTRICT_IDS.forEach((id) => {
    const n = Number(src?.[id]);
    out[id] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  });
  return out;
}

export function cloneFourCylinders(fourCylinderData) {
  if (!fourCylinderData || typeof fourCylinderData !== 'object') return null;
  try {
    return typeof structuredClone === 'function'
      ? structuredClone(fourCylinderData)
      : JSON.parse(JSON.stringify(fourCylinderData));
  } catch {
    return { ...fourCylinderData };
  }
}

export function resolveGlycemicPenalty(kineticsData) {
  const n = Number(
    kineticsData?.glycemicPenalty
    ?? kineticsData?.metabolicPenalty
    ?? kineticsData?.sleepMetabolicPenalty,
  );
  if (Number.isFinite(n) && n > 0) {
    return {
      value: Math.max(1, Math.min(1.3, n)),
      certainty: CERTAINTY_LEVELS.CALCULATED,
    };
  }
  return {
    value: DEFAULT_GLYCEMIC_PENALTY,
    certainty: CERTAINTY_LEVELS.ESTIMATED,
  };
}

export function resolveCardioTarget(kineticsData, userTargets) {
  const n = Number(
    kineticsData?.cardioTarget7d
    ?? userTargets?.cardioMinutes
    ?? userTargets?.cardioTarget7d,
  );
  if (Number.isFinite(n) && n > 0) {
    return { value: Math.round(n), certainty: CERTAINTY_LEVELS.MEASURED };
  }
  return {
    value: DEFAULT_CARDIO_TARGET_7D_MINUTES,
    certainty: CERTAINTY_LEVELS.ESTIMATED,
  };
}
