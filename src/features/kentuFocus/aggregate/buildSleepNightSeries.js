/**
 * Serie cronologica notti Focus (P6.2).
 * nightEndedOn = data storage = mattina di risveglio.
 * Non confonde wakeTime con risvegli notturni.
 * Non espone deep/REM placeholder come osservazioni.
 */

import {
  addCalendarDays,
  isIsoDateString,
  ISO_WEEKDAY_LABELS_IT,
  isoWeekdayFromDate,
  wakeSegmentFromDate,
} from '../normalize/focusDateUtils.js';
import { finiteNumber, getLogArray } from '../normalize/logUtils.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import {
  classifySleepTiming,
  SLEEP_TIMING_CLASS,
} from '../normalize/focusSleepTimingPlausibility.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';

/**
 * @param {object|null|undefined} metric
 * @returns {{ value: number|string|null, provenance: string, source?: string, certainty?: string }}
 */
export function sleepMetricSnapshot(metric) {
  if (!metric || metric.provenance === FOCUS_PROVENANCE.missing || metric.value == null) {
    return { value: null, provenance: FOCUS_PROVENANCE.missing };
  }
  const out = {
    value: metric.value,
    provenance: metric.provenance || FOCUS_PROVENANCE.missing,
  };
  if (metric.source) out.source = metric.source;
  if (metric.certainty) out.certainty = metric.certainty;
  return out;
}

/**
 * Risvegli notturni strutturati sull’entry (mai da wakeTime).
 * @param {object|null} entry
 */
export function structuredNightAwakenings(entry) {
  if (!entry) {
    return { value: null, provenance: FOCUS_PROVENANCE.missing, note: 'no_structured_awakenings' };
  }
  const raw = finiteNumber(
    entry.awakenings
      ?? entry.wakeCount
      ?? entry.interruptions
      ?? entry.awakeCount,
  );
  if (raw == null) {
    return { value: null, provenance: FOCUS_PROVENANCE.missing, note: 'no_structured_awakenings' };
  }
  return {
    value: raw,
    provenance: FOCUS_PROVENANCE.recorded,
    source: 'sleep_entry_structured',
  };
}

/**
 * Una notte dalla notte principale normalizzata.
 * @param {string} nightEndedOn
 * @param {object|null|undefined} dayNode
 */
export function buildSleepNightRecord(nightEndedOn, dayNode) {
  if (!isIsoDateString(nightEndedOn)) {
    throw new Error(`buildSleepNightRecord: nightEndedOn non ISO: ${nightEndedOn}`);
  }
  const pack = normalizeSleepNight(dayNode ?? null, { publicationDate: nightEndedOn });
  const sleep = pack.sleep || {};
  const isoWeekday = isoWeekdayFromDate(nightEndedOn);
  const segment = wakeSegmentFromDate(nightEndedOn);
  const entry = pack.sleepSelection?.entry || null;

  const hours = sleepMetricSnapshot(sleep.hours);
  const wakeTime = sleepMetricSnapshot(sleep.wakeTime);
  const bedtime = sleepMetricSnapshot(sleep.bedtime);
  const qualityStars = sleepMetricSnapshot(sleep.qualityStars);

  const stagesSuppressed = sleep.deepMin?.source === 'form_placeholder_60_suppressed'
    || sleep.remMin?.source === 'form_placeholder_60_suppressed';

  const timing = classifySleepTiming({
    available: Boolean(pack.sleepAvailable),
    wakeTime: wakeTime.value,
    bedtime: bedtime.value,
    hours: hours.value,
  });

  return {
    nightEndedOn,
    wakeWeekday: isoWeekday,
    wakeWeekdayLabel: isoWeekday != null ? (ISO_WEEKDAY_LABELS_IT[isoWeekday] || null) : null,
    segment,
    available: Boolean(pack.sleepAvailable),
    partial: Boolean(pack.sleepPartial),
    ambiguous: Boolean(pack.sleepAmbiguous),
    mainNightStatus: sleep.mainNightStatus || pack.sleepSelection?.status || null,
    mainNightReason: sleep.mainNightReason || pack.sleepSelection?.reason || null,
    nodePresent: Boolean(dayNode),
    hours,
    wakeTime,
    bedtime,
    qualityStars,
    /** Mai derivato da wakeTime. */
    nightAwakenings: structuredNightAwakenings(entry),
    timingClass: timing.timingClass,
    timing: {
      class: timing.timingClass,
      reasons: timing.reasons,
      keepInSeries: timing.keepInSeries,
      useInStrongRegularity: timing.useInStrongRegularity,
      spanHours: timing.spanHours ?? null,
      spanMatchesDuration: timing.spanMatchesDuration,
    },
    stages: {
      usedForRoutine: false,
      note: stagesSuppressed
        ? 'placeholder_excluded'
        : (sleep.deepMin?.provenance === FOCUS_PROVENANCE.recorded
          || sleep.remMin?.provenance === FOCUS_PROVENANCE.recorded)
          ? 'recorded_but_excluded_from_routine'
          : 'missing_excluded',
    },
  };
}

/**
 * Serie da history day briefs arricchiti (buildDayBrief / FocusDossier).
 * @param {object[]} briefs
 */
export function buildSleepNightSeriesFromBriefs(briefs) {
  if (!Array.isArray(briefs)) return [];
  /** @type {object[]} */
  const nights = [];
  for (const brief of briefs) {
    const nightEndedOn = brief?.sleep?.nightEndedOn
      || brief?.sleepStorageDate
      || null;
    if (!nightEndedOn || !isIsoDateString(nightEndedOn)) continue;
    const hoursVal = brief?.sleep?.hours ?? null;
    const wakeVal = brief?.sleep?.wakeTime ?? null;
    const bedVal = brief?.sleep?.bedtime ?? null;
    const bedProv = brief?.sleep?.bedtimeProvenance || FOCUS_PROVENANCE.missing;
    const available = Boolean(brief?.sleepAvailable) && hoursVal != null;
    const timing = classifySleepTiming({
      available,
      wakeTime: wakeVal,
      bedtime: bedVal,
      hours: hoursVal,
    });
    const isoWeekday = isoWeekdayFromDate(nightEndedOn);
    nights.push({
      nightEndedOn,
      wakeWeekday: isoWeekday,
      wakeWeekdayLabel: isoWeekday != null ? (ISO_WEEKDAY_LABELS_IT[isoWeekday] || null) : null,
      segment: wakeSegmentFromDate(nightEndedOn),
      available,
      partial: Boolean(brief?.sleep?.partial),
      ambiguous: false,
      mainNightStatus: brief?.sleep?.mainNightStatus || null,
      mainNightReason: brief?.sleep?.mainNightReason || null,
      nodePresent: true,
      hours: {
        value: hoursVal,
        provenance: hoursVal == null ? FOCUS_PROVENANCE.missing : FOCUS_PROVENANCE.recorded,
      },
      wakeTime: {
        value: wakeVal,
        provenance: wakeVal == null
          ? FOCUS_PROVENANCE.missing
          : (brief?.sleep?.wakeProvenance || FOCUS_PROVENANCE.recorded),
      },
      bedtime: {
        value: bedVal,
        provenance: bedVal == null ? FOCUS_PROVENANCE.missing : bedProv,
        source: brief?.sleep?.bedtimeSource,
      },
      qualityStars: {
        value: brief?.sleep?.qualityStars ?? null,
        provenance: brief?.sleep?.qualityStars == null
          ? FOCUS_PROVENANCE.missing
          : FOCUS_PROVENANCE.recorded,
      },
      nightAwakenings: {
        value: null,
        provenance: FOCUS_PROVENANCE.missing,
        note: 'no_structured_awakenings',
      },
      timingClass: timing.timingClass,
      timing: {
        class: timing.timingClass,
        reasons: timing.reasons,
        keepInSeries: timing.keepInSeries,
        useInStrongRegularity: timing.useInStrongRegularity,
        spanHours: timing.spanHours ?? null,
        spanMatchesDuration: timing.spanMatchesDuration,
      },
      stages: { usedForRoutine: false, note: 'excluded_from_brief_series' },
    });
  }
  nights.sort((a, b) => String(a.nightEndedOn).localeCompare(String(b.nightEndedOn)));
  // Dedup by nightEndedOn (ultimo vince)
  const byDate = new Map();
  for (const n of nights) byDate.set(n.nightEndedOn, n);
  return [...byDate.values()].sort((a, b) => a.nightEndedOn.localeCompare(b.nightEndedOn));
}

export { SLEEP_TIMING_CLASS };

/**
 * Serie ordinata crescente per nightEndedOn.
 * @param {{
 *   dayNodes: Map<string, object|null>|Record<string, object|null>,
 *   fromDate: string,
 *   toDate: string,
 * }} input
 */
export function buildSleepNightSeries(input) {
  const fromDate = input.fromDate;
  const toDate = input.toDate;
  if (!isIsoDateString(fromDate) || !isIsoDateString(toDate)) {
    throw new Error('buildSleepNightSeries: fromDate/toDate ISO richieste');
  }
  if (fromDate > toDate) {
    throw new Error('buildSleepNightSeries: fromDate > toDate');
  }

  /** @type {Map<string, object|null>} */
  const map = input.dayNodes instanceof Map
    ? input.dayNodes
    : new Map(Object.entries(input.dayNodes || {}));

  /** @type {object[]} */
  const nights = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    nights.push(buildSleepNightRecord(cursor, map.get(cursor) ?? null));
    cursor = addCalendarDays(cursor, 1);
  }
  return nights;
}

/**
 * Conta entry sleep grezze (debug/test; non usato per aggregati).
 * @param {object|null|undefined} dayNode
 */
export function countRawSleepEntries(dayNode) {
  return getLogArray(dayNode).filter((e) => e && e.type === 'sleep').length;
}
