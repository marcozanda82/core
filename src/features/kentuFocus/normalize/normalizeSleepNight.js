/**
 * Normalizzatore puro sonno della notte successiva (storage su publicationDate).
 * SSOT: trackerStorico log type=sleep. Ignora sleep_logs.
 *
 * Politica REM/deep (prudente):
 * - Il diario scrive spesso deepMin=60 e remMin=60 come placeholder di form.
 * - Non è possibile distinguere un 60/60 intenzionale da un default UI senza flag esplicito.
 * - Quindi: se deep===60 e rem===60 e non ci sono indizi wearable → provenance `missing`
 *   (value null). Non sono né misurazioni né stime fisiologiche.
 * - Con indizio wearable (hr, qualityScore>5, source wearable) → `recorded`.
 * - Valori diversi da 60/60 → `recorded` (assunti inseriti/misurati).
 */

import {
  FOCUS_CERTAINTY,
  FOCUS_PROVENANCE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import {
  computeBedtimeFromWakeAndDuration,
  parseDecimalHour,
  wrap24,
} from './focusDateUtils.js';
import { finiteNumber, getLogArray } from './logUtils.js';
import {
  MAIN_NIGHT_STATUS,
  resolveMainNightSleep,
  sleepHoursFromEntry,
} from './resolveMainNightSleep.js';

export { sleepHoursFromEntry, resolveMainNightSleep, MAIN_NIGHT_STATUS };

/** Tolleranza (ore) per match bedtime ≈ wake − duration. */
export const BEDTIME_FORMULA_MATCH_EPS_H = 0.05;

/**
 * Provenienza bedtime (tre stati prodotto):
 * - recorded: bedtime inserito dall'utente o da dispositivo
 * - derived: bedtime = wakeTime − hours, con entrambi disponibili (recorded)
 * - missing: manca wakeTime o hours (e non c'è bedtime recorded affidabile);
 *   bedtime 0 non è mai mezzanotte in questo caso
 *
 * @param {object} entry
 * @param {number|null} wakeTime
 * @param {number|null} hours
 * @returns {{
 *   value: number|null,
 *   provenance: string,
 *   source?: string,
 *   certainty?: string,
 * }}
 */
export function resolveBedtimeProvenance(entry, wakeTime, hours) {
  const explicit = String(
    entry?.bedtimeProvenance
      ?? entry?.bedtimeSource
      ?? entry?._bedtimeOrigin
      ?? '',
  ).trim().toLowerCase();
  const bedtimeRaw = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  const wakeOk = wakeTime != null && Number.isFinite(Number(wakeTime));
  const hoursOk = hours != null && Number.isFinite(Number(hours)) && Number(hours) > 0;
  const expected = (wakeOk && hoursOk)
    ? computeBedtimeFromWakeAndDuration(wakeTime, hours)
    : null;
  const looksMidnight = bedtimeRaw != null
    && (bedtimeRaw === 0 || bedtimeRaw >= 23.95 || bedtimeRaw < 0.05);

  if (
    explicit === 'recorded'
    || explicit === 'user'
    || explicit === 'manual'
  ) {
    if (bedtimeRaw == null) {
      return { value: null, provenance: FOCUS_PROVENANCE.missing };
    }
    return {
      value: bedtimeRaw,
      provenance: FOCUS_PROVENANCE.recorded,
      source: 'explicit_bedtime_flag',
    };
  }

  if (
    explicit === 'derived'
    || explicit === 'calculated'
    || explicit === 'formula'
  ) {
    if (expected == null) {
      return {
        value: null,
        provenance: FOCUS_PROVENANCE.missing,
        source: 'derived_flag_without_wake_hours',
      };
    }
    return {
      value: bedtimeRaw != null ? bedtimeRaw : expected,
      provenance: FOCUS_PROVENANCE.derived,
      source: 'explicit_bedtime_flag',
    };
  }

  // wake + hours disponibili → bedtime derivabile
  if (expected != null) {
    if (bedtimeRaw == null) {
      return {
        value: expected,
        provenance: FOCUS_PROVENANCE.derived,
        source: 'computeBedtimeFromWakeAndDuration',
      };
    }
    const delta = circularAbsHourDelta(bedtimeRaw, expected);
    if (delta != null && delta <= BEDTIME_FORMULA_MATCH_EPS_H) {
      return {
        value: bedtimeRaw,
        provenance: FOCUS_PROVENANCE.derived,
        source: 'wake_minus_hours',
      };
    }
    // Presente e diverso dalla formula → inserito da utente/dispositivo
    return {
      value: bedtimeRaw,
      provenance: FOCUS_PROVENANCE.recorded,
      source: 'sleep_entry_bedtime_field',
    };
  }

  // Manca wake o hours: 0 / ~00:00 non è mezzanotte
  if (bedtimeRaw == null || looksMidnight) {
    return {
      value: null,
      provenance: FOCUS_PROVENANCE.missing,
      source: 'wake_or_hours_missing',
    };
  }

  return {
    value: bedtimeRaw,
    provenance: FOCUS_PROVENANCE.recorded,
    source: 'bedtime_without_wake_hours',
  };
}

/** @param {number} a @param {number} b */
function circularAbsHourDelta(a, b) {
  const wa = wrap24(a);
  const wb = wrap24(b);
  if (wa == null || wb == null) return null;
  let d = Math.abs(wa - wb);
  if (d > 12) d = 24 - d;
  return d;
}

/** Placeholder tipico scritto dal diario quando deep/REM non sono misurati. */
export const DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN = 60;

/**
 * Compat: restituisce l’entry notte principale, o null se assente/ambigua/solo nap.
 * @param {object[]} sleepEntries
 */
export function pickMainNightSleepEntry(sleepEntries) {
  return resolveMainNightSleep(sleepEntries).entry;
}

/** @param {unknown} raw */
export function normalizeQualityStars(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  const label = String(raw ?? '').trim().toLowerCase();
  if (!label) return null;
  if (label.includes('ottim') || label.includes('eccell') || label === 'good') return 5;
  if (label.includes('buon')) return 4;
  if (label === 'ok' || label.includes('discret')) return 3;
  if (label.includes('scars')) return 2;
  if (label.includes('pess') || label === 'poor' || label.includes('bad')) return 1;
  return null;
}

/** @param {number|null} stars */
export function qualityBandFromStars(stars) {
  if (stars == null) return null;
  if (stars >= 4) return 'good';
  if (stars === 3) return 'ok';
  if (stars >= 1) return 'poor';
  return null;
}

/**
 * @param {object} entry
 * @param {number|null} deepMin
 * @param {number|null} remMin
 */
export function isDefaultSleepStagePlaceholder(entry, deepMin, remMin) {
  if (deepMin !== DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN) return false;
  if (remMin !== DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN) return false;
  const hr = finiteNumber(entry?.hr);
  const qualityScore = finiteNumber(entry?.qualityScore);
  const wearableHint =
    (hr != null && hr > 0)
    || (qualityScore != null && qualityScore > 5)
    || entry?.source === 'wearable'
    || entry?.source === 'WEARABLE';
  return !wearableHint;
}

/**
 * Buffer cena→bedtime (wrap mezzanotte). Null se > 18h (dato sospetto).
 * @param {number|null} bedtime
 * @param {number|null} lastMealHour
 */
export function computeDinnerSleepBufferH(bedtime, lastMealHour) {
  if (!Number.isFinite(bedtime) || !Number.isFinite(lastMealHour)) return null;
  let delta = bedtime - lastMealHour;
  if (delta < 0) delta += 24;
  if (delta > 18) return null;
  return Math.round(delta * 100) / 100;
}

/**
 * @param {object|null|undefined} publicationDayNode
 * @param {{
 *   publicationDate: string,
 *   lastMealHour?: number|null,
 * }} opts
 */
export function normalizeSleepNight(publicationDayNode, opts) {
  const publicationDate = opts.publicationDate;
  const sleepEntries = getLogArray(publicationDayNode).filter(
    (e) => e && e.type === 'sleep',
  );
  const selection = resolveMainNightSleep(sleepEntries);
  const entry = selection.entry;
  const sleepAmbiguous = selection.status === MAIN_NIGHT_STATUS.ambiguous;

  if (!entry) {
    return {
      sleepAvailable: false,
      sleepPartial: false,
      sleepAmbiguous,
      sleepSelection: selection,
      sleep: {
        linkedToPublicationDate: true,
        storageDate: publicationDate,
        hours: missingMetric('h'),
        wakeTime: missingMetric('hour_decimal'),
        bedtime: missingMetric('hour_decimal'),
        qualityStars: missingMetric(),
        qualityBand: missingMetric(),
        deepMin: missingMetric('min'),
        remMin: missingMetric('min'),
        dinnerSleepBufferH: missingMetric('h'),
        napsIncludedInHours: false,
        mainNightStatus: selection.status,
        mainNightReason: selection.reason,
      },
    };
  }

  const hours = sleepHoursFromEntry(entry);
  const wakeTime = parseDecimalHour(entry.wakeTime ?? entry.sleepEnd);
  const bedtimeResolved = resolveBedtimeProvenance(entry, wakeTime, hours);
  const bedtime = bedtimeResolved.value;
  const bedtimeProvenance = bedtimeResolved.provenance;

  const qualityStars = normalizeQualityStars(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const qualityBand = qualityBandFromStars(qualityStars);

  const deepMin = finiteNumber(entry.deepMin ?? entry.deepMinutes ?? entry.deep);
  const remMin = finiteNumber(entry.remMin ?? entry.remMinutes ?? entry.rem);
  const stagesUnreliable = isDefaultSleepStagePlaceholder(entry, deepMin, remMin);

  const sleepPartial =
    (hours == null || hours <= 0)
    || wakeTime == null
    || bedtime == null;

  const buffer = computeDinnerSleepBufferH(
    bedtime,
    opts.lastMealHour == null ? null : Number(opts.lastMealHour),
  );

  return {
    sleepAvailable: hours != null && hours > 0,
    sleepPartial,
    sleepAmbiguous: false,
    sleepSelection: selection,
    sleep: {
      linkedToPublicationDate: true,
      storageDate: publicationDate,
      hours: hours == null || hours <= 0
        ? missingMetric('h')
        : focusMetric(hours, {
          unit: 'h',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      wakeTime: wakeTime == null
        ? missingMetric('hour_decimal')
        : focusMetric(wakeTime, {
          unit: 'hour_decimal',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      bedtime: bedtime == null
        ? missingMetric('hour_decimal')
        : focusMetric(bedtime, {
          unit: 'hour_decimal',
          provenance: bedtimeProvenance,
          source: bedtimeResolved.source,
          certainty: bedtimeResolved.certainty,
        }),
      qualityStars: qualityStars == null
        ? missingMetric()
        : focusMetric(qualityStars, { provenance: FOCUS_PROVENANCE.recorded }),
      qualityBand: qualityBand == null
        ? missingMetric()
        : focusMetric(qualityBand, {
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'qualityBandFromStars',
        }),
      deepMin: stagesUnreliable
        ? focusMetric(null, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.missing,
          source: 'form_placeholder_60_suppressed',
        })
        : deepMin == null
          ? missingMetric('min')
          : focusMetric(deepMin, {
            unit: 'min',
            provenance: FOCUS_PROVENANCE.recorded,
            certainty: FOCUS_CERTAINTY.medium,
          }),
      remMin: stagesUnreliable
        ? focusMetric(null, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.missing,
          source: 'form_placeholder_60_suppressed',
        })
        : remMin == null
          ? missingMetric('min')
          : focusMetric(remMin, {
            unit: 'min',
            provenance: FOCUS_PROVENANCE.recorded,
            certainty: FOCUS_CERTAINTY.medium,
          }),
      dinnerSleepBufferH: buffer == null
        ? missingMetric('h')
        : focusMetric(buffer, {
          unit: 'h',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'computeDinnerSleepBufferH',
        }),
      napsIncludedInHours: false,
      mainNightStatus: selection.status,
      mainNightReason: selection.reason,
    },
  };
}
