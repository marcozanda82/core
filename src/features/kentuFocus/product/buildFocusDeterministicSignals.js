/**
 * Segnali deterministici per dossier AI Coach (sonno corto, digiuno lungo, cena vicina al letto).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { resolveFoodClockHourDetailed } from '../normalize/focusMealSlots.js';

const SLEEP_SHORT_HOURS = 7;
const LONG_FAST_HOURS = 14;
const LATE_MEAL_BEFORE_BED_HOURS = 3;
const FASTING_PATTERN_MIN_DAYS = 3;
const FIRST_MEAL_IRREGULAR_SPREAD_H = 2;

/**
 * @param {number|null|undefined} a
 * @param {number|null|undefined} b
 * @returns {number|null} ore positive attraverso mezzanotte se serve
 */
export function hoursBetweenClock(a, b) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  let delta = Number(b) - Number(a);
  if (delta < 0) delta += 24;
  return Math.round(delta * 100) / 100;
}

/**
 * @param {object|null|undefined} dayNode
 * @returns {{ hour: number, name: string|null }|null}
 */
function pickExtremeMealHour(dayNode, mode) {
  if (!dayNode) return null;
  const mealTimes = dayNode.mealTimes && typeof dayNode.mealTimes === 'object'
    ? dayNode.mealTimes
    : {};
  const foods = collectDayLogForNutrition(dayNode).filter(
    (e) => e && (e.type === 'food' || e.type === 'recipe' || !e.type),
  );
  /** @type {{ hour: number, name: string|null }[]} */
  const clocks = [];
  for (const item of foods) {
    const clock = resolveFoodClockHourDetailed(item, mealTimes);
    if (clock.hour == null || !Number.isFinite(Number(clock.hour))) continue;
    clocks.push({
      hour: Number(clock.hour),
      name: String(item?.name || item?.desc || item?.label || '').trim() || null,
    });
  }
  if (!clocks.length) return null;
  clocks.sort((a, b) => a.hour - b.hour);
  return mode === 'first' ? clocks[0] : clocks[clocks.length - 1];
}

/**
 * Bedtime usabile per segnale cena↔sonno: recorded o derived.
 * @param {string|null} provenance
 */
function bedtimeUsableForMealSignal(provenance) {
  const p = String(provenance || '').trim().toLowerCase();
  return p === 'recorded' || p === 'derived' || p === 'calculated';
}

/**
 * Digiuno notturno su una data (ultimo pasto D-1 → primo pasto D).
 * @returns {{ hours: number, firstMealHour: number, lastMealHour: number }|null}
 */
function overnightFastForDate(fullHistory, date) {
  const node = getTrackerDayNode(fullHistory, date);
  const prev = getTrackerDayNode(fullHistory, addCalendarDays(date, -1));
  const lastPrev = pickExtremeMealHour(prev, 'last');
  const firstDay = pickExtremeMealHour(node, 'first');
  if (!lastPrev || !firstDay) return null;
  const hours = hoursBetweenClock(lastPrev.hour, firstDay.hour);
  if (hours == null) return null;
  return {
    hours,
    firstMealHour: firstDay.hour,
    lastMealHour: lastPrev.hour,
    firstMealName: firstDay.name,
    lastMealName: lastPrev.name,
  };
}

/**
 * @param {{
 *   fullHistory: object,
 *   analysisDate: string,
 *   publicationDate: string,
 *   sleepNight?: object|null,
 *   periodId?: string|null,
 *   windowDays?: number|null,
 *   intermittentFasting?: boolean|null,
 * }} input
 */
export function buildFocusDeterministicSignals(input) {
  const fullHistory = input?.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : null;
  const analysisDate = String(input?.analysisDate || '').trim();
  const publicationDate = String(input?.publicationDate || '').trim();
  const sleepNight = input?.sleepNight && typeof input.sleepNight === 'object'
    ? input.sleepNight
    : null;
  const periodId = String(input?.periodId || 'ieri').trim() || 'ieri';
  const windowDays = Math.max(
    1,
    Number(input?.windowDays)
      || (periodId === 'mese' ? 30 : periodId === 'settimana' ? 7 : 1),
  );
  const intermittentFasting = input?.intermittentFasting === true;

  /** @type {object[]} */
  const signals = [];

  if (!fullHistory || !isIsoDateString(analysisDate)) {
    return {
      available: false,
      reason: 'missing_history_or_date',
      signals: [],
      thresholds: {
        sleepShortHours: SLEEP_SHORT_HOURS,
        longFastHours: LONG_FAST_HOURS,
        lateMealBeforeBedHours: LATE_MEAL_BEFORE_BED_HOURS,
      },
    };
  }

  const hours = sleepNight?.hours != null ? Number(sleepNight.hours) : null;
  if (hours != null && Number.isFinite(hours) && hours > 0 && hours < SLEEP_SHORT_HOURS) {
    signals.push({
      id: 'sleep_under_7h',
      area: 'sleep',
      active: true,
      hours,
      thresholdHours: SLEEP_SHORT_HOURS,
      detail: `Sonno documentato ${hours} h (soglia < ${SLEEP_SHORT_HOURS} h).`,
    });
  } else {
    signals.push({
      id: 'sleep_under_7h',
      area: 'sleep',
      active: false,
      hours: hours != null && Number.isFinite(hours) ? hours : null,
      thresholdHours: SLEEP_SHORT_HOURS,
      detail: hours == null || !Number.isFinite(hours) || hours <= 0
        ? 'Durata sonno non disponibile per il segnale <7 h.'
        : `Sonno ${hours} h: non sotto la soglia di ${SLEEP_SHORT_HOURS} h.`,
    });
  }

  const analysisNode = getTrackerDayNode(fullHistory, analysisDate);
  const previousDate = addCalendarDays(analysisDate, -1);
  const dayFast = overnightFastForDate(fullHistory, analysisDate);
  const fastingHours = dayFast?.hours ?? null;

  if (intermittentFasting) {
    signals.push({
      id: 'fasting_over_14h',
      area: 'rhythm',
      active: false,
      hours: fastingHours,
      thresholdHours: LONG_FAST_HOURS,
      previousDate,
      firstMealHour: dayFast?.firstMealHour ?? null,
      lastMealHour: dayFast?.lastMealHour ?? null,
      detail: 'Profilo intermittentFasting attivo: segnale digiuno lungo disattivato.',
      inactiveReason: 'intermittent_fasting_profile',
      summaryEligible: false,
    });
  } else if (periodId === 'ieri') {
    // Giorno: osservato ma non in summary / activeIds.
    signals.push({
      id: 'fasting_over_14h',
      area: 'rhythm',
      active: false,
      observed: fastingHours != null && fastingHours > LONG_FAST_HOURS,
      hours: fastingHours,
      thresholdHours: LONG_FAST_HOURS,
      previousDate,
      lastMealHour: dayFast?.lastMealHour ?? null,
      lastMealName: dayFast?.lastMealName ?? null,
      firstMealHour: dayFast?.firstMealHour ?? null,
      firstMealName: dayFast?.firstMealName ?? null,
      detail: fastingHours != null && fastingHours > LONG_FAST_HOURS
        ? `Digiuno notturno ${fastingHours} h osservato: escluso dalla summary del giorno.`
        : (fastingHours == null
          ? 'Impossibile calcolare digiuno notturno sul giorno.'
          : `Intervallo ${fastingHours} h: non sopra ${LONG_FAST_HOURS} h.`),
      inactiveReason: 'day_report_excludes_fasting',
      summaryEligible: false,
    });
  } else {
    /** @type {{ date: string, hours: number, firstMealHour: number }[]} */
    const longFastDays = [];
    for (let i = 0; i < windowDays; i += 1) {
      const date = addCalendarDays(analysisDate, -i);
      const pack = overnightFastForDate(fullHistory, date);
      if (pack && pack.hours > LONG_FAST_HOURS) {
        longFastDays.push({
          date,
          hours: pack.hours,
          firstMealHour: pack.firstMealHour,
        });
      }
    }
    const firstHours = longFastDays.map((d) => d.firstMealHour).filter((h) => Number.isFinite(h));
    const spread = firstHours.length >= 2
      ? Math.round((Math.max(...firstHours) - Math.min(...firstHours)) * 100) / 100
      : null;
    const irregular = spread != null && spread > FIRST_MEAL_IRREGULAR_SPREAD_H;
    const active = longFastDays.length >= FASTING_PATTERN_MIN_DAYS && irregular;
    signals.push({
      id: 'fasting_over_14h',
      area: 'rhythm',
      active,
      hours: fastingHours,
      thresholdHours: LONG_FAST_HOURS,
      windowDays,
      longFastDayCount: longFastDays.length,
      firstMealHourSpreadH: spread,
      previousDate,
      firstMealHour: dayFast?.firstMealHour ?? null,
      lastMealHour: dayFast?.lastMealHour ?? null,
      detail: active
        ? `Digiuno >${LONG_FAST_HOURS} h in ${longFastDays.length} giorni con primo pasto irregolare (scarto ${spread} h).`
        : (longFastDays.length < FASTING_PATTERN_MIN_DAYS
          ? `Digiuno lungo in ${longFastDays.length}/${FASTING_PATTERN_MIN_DAYS} giorni richiesti (finestra ${windowDays}g).`
          : `Primo pasto regolare (scarto ${spread ?? 'n/d'} h ≤ ${FIRST_MEAL_IRREGULAR_SPREAD_H} h): segnale digiuno non attivo.`),
      inactiveReason: active
        ? null
        : (longFastDays.length < FASTING_PATTERN_MIN_DAYS
          ? 'insufficient_long_fast_days'
          : 'first_meal_not_irregular'),
      summaryEligible: active,
    });
  }

  const lastDayMeal = pickExtremeMealHour(analysisNode, 'last');
  const bedtime = sleepNight?.bedtime != null ? Number(sleepNight.bedtime) : null;
  const bedtimeProvenance = String(sleepNight?.bedtimeProvenance || '').trim().toLowerCase() || null;
  const approx = bedtimeProvenance === 'derived' || bedtimeProvenance === 'calculated';

  if (bedtimeProvenance === 'missing' || bedtime == null || !Number.isFinite(bedtime)) {
    signals.push({
      id: 'meal_within_3h_of_bedtime',
      area: 'rhythm',
      active: false,
      hoursBeforeBed: null,
      thresholdHours: LATE_MEAL_BEFORE_BED_HOURS,
      bedtime: bedtime != null && Number.isFinite(bedtime) ? bedtime : null,
      bedtimeProvenance: bedtimeProvenance || 'missing',
      lastMealHour: lastDayMeal?.hour ?? null,
      lastMealName: lastDayMeal?.name ?? null,
      detail: 'Bedtime missing (manca wakeTime o hours, oppure non affidabile): segnale cena↔sonno inattivo.',
      inactiveReason: 'bedtime_missing',
    });
  } else if (!bedtimeUsableForMealSignal(bedtimeProvenance)) {
    signals.push({
      id: 'meal_within_3h_of_bedtime',
      area: 'rhythm',
      active: false,
      hoursBeforeBed: null,
      thresholdHours: LATE_MEAL_BEFORE_BED_HOURS,
      bedtime,
      bedtimeProvenance,
      lastMealHour: lastDayMeal?.hour ?? null,
      lastMealName: lastDayMeal?.name ?? null,
      detail: `Bedtime provenance «${bedtimeProvenance}» non usata per cena↔sonno (servono recorded o derived).`,
      inactiveReason: 'bedtime_provenance_unusable',
    });
  } else if (!lastDayMeal) {
    signals.push({
      id: 'meal_within_3h_of_bedtime',
      area: 'rhythm',
      active: false,
      hoursBeforeBed: null,
      thresholdHours: LATE_MEAL_BEFORE_BED_HOURS,
      bedtime,
      bedtimeProvenance,
      lastMealHour: null,
      detail: 'Nessun pasto con orario nel giorno di analisi.',
      inactiveReason: 'no_meal_clock',
    });
  } else {
    let delta = bedtime - lastDayMeal.hour;
    if (delta < 0) delta += 24;
    const hoursBeforeBed = Math.round(delta * 100) / 100;
    const active = hoursBeforeBed < LATE_MEAL_BEFORE_BED_HOURS && hoursBeforeBed <= 18;
    const approxMark = approx ? 'circa ' : '';
    signals.push({
      id: 'meal_within_3h_of_bedtime',
      area: 'rhythm',
      active,
      hoursBeforeBed,
      thresholdHours: LATE_MEAL_BEFORE_BED_HOURS,
      bedtime,
      bedtimeProvenance,
      lastMealHour: lastDayMeal.hour,
      lastMealName: lastDayMeal.name,
      detail: active
        ? `Ultimo pasto a ${approxMark}${hoursBeforeBed} h dall'addormentamento (soglia < ${LATE_MEAL_BEFORE_BED_HOURS} h${approx ? '; bedtime derived' : ''}).`
        : `Ultimo pasto a ${approxMark}${hoursBeforeBed} h dal bedtime: non sotto ${LATE_MEAL_BEFORE_BED_HOURS} h.`,
      inactiveReason: active ? null : 'outside_threshold',
    });
  }

  return {
    available: true,
    reason: null,
    analysisDate,
    publicationDate: isIsoDateString(publicationDate) ? publicationDate : null,
    signals,
    activeIds: signals.filter((s) => s.active).map((s) => s.id),
    thresholds: {
      sleepShortHours: SLEEP_SHORT_HOURS,
      longFastHours: LONG_FAST_HOURS,
      lateMealBeforeBedHours: LATE_MEAL_BEFORE_BED_HOURS,
    },
  };
}
