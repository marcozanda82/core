/**
 * Criterio deterministico e prudente per la notte principale (I4-E).
 * Non modifica i writer del diario. Ignora sleep_logs legacy.
 *
 * Regole:
 * 1. Solo entry type=sleep dal log del giorno di storage (publicationDate).
 * 2. Dedup per id: prevale l’ultima occorrenza (correzione).
 * 3. Episodi < NIGHT_SLEEP_MIN_HOURS non competono come “notte certa”, ma:
 *    - più frammenti la cui somma ≥ soglia → ambiguous (sonno frammentato / turno);
 *    - singolo episodio corto con timeline overnight → ambiguous (non “nap” falso).
 * 4. Una sola candidata notte → selezionata (anche turni notturni se ore ≥ soglia).
 * 5. Più candidate: preferisci timeline completa; gap ≥ HOURS_CLEAR_GAP → più lunga;
 *    altrimenti → ambiguous.
 * 6. Solo episodi corti non sommabili / assente → only_naps / absent.
 */

import { parseDecimalHour } from './focusDateUtils.js';
import { finiteNumber } from './logUtils.js';

/** Allineato a coreEngine (non importato). */
export const NIGHT_SLEEP_MIN_HOURS = 3;

/** @param {object} entry */
export function sleepHoursFromEntry(entry) {
  return finiteNumber(
    entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration,
  );
}

/** Se due notti distano almeno così tante ore, vince la più lunga. */
export const HOURS_CLEAR_GAP = 1;

export const MAIN_NIGHT_STATUS = Object.freeze({
  selected: 'selected',
  absent: 'absent',
  only_naps: 'only_naps',
  ambiguous: 'ambiguous',
});

/**
 * @param {object} entry
 */
function entryTimestamp(entry) {
  const raw = entry?.updatedAt ?? entry?.ts ?? entry?.createdAt ?? entry?.timestamp;
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

/**
 * Dedup per id: senza id restano tutte; con id uguale vince l’ultima
 * (ordine array, o timestamp se presente e maggiore).
 * @param {object[]} sleepEntries
 */
export function dedupeSleepEntries(sleepEntries) {
  const list = Array.isArray(sleepEntries) ? sleepEntries.filter(Boolean) : [];
  /** @type {Map<string, { entry: object, index: number }>} */
  const byId = new Map();
  const noId = [];
  list.forEach((entry, index) => {
    const id = entry.id != null && String(entry.id).trim() ? String(entry.id) : '';
    if (!id) {
      noId.push(entry);
      return;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { entry, index });
      return;
    }
    const prevTs = entryTimestamp(prev.entry);
    const nextTs = entryTimestamp(entry);
    if (prevTs != null && nextTs != null) {
      if (nextTs >= prevTs) byId.set(id, { entry, index });
      return;
    }
    // Nessun timestamp attendibile → ultima in ordine (correzione tardiva tipica)
    if (index >= prev.index) byId.set(id, { entry, index });
  });
  return [...noId, ...[...byId.values()].map((x) => x.entry)];
}

/**
 * @param {object} entry
 */
export function hasReliableTimeline(entry) {
  const wake = parseDecimalHour(entry?.wakeTime ?? entry?.sleepEnd);
  const bed = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  const hours = sleepHoursFromEntry(entry);
  if (wake != null && bed != null) return true;
  if (wake != null && hours != null && hours >= NIGHT_SLEEP_MIN_HOURS) return true;
  return false;
}

/**
 * Episodio corto ma con segno di overnight (bedtime serale / wrap) → non classificare come nap certo.
 * @param {object} entry
 */
export function looksLikeUncertainOvernightFragment(entry) {
  const hours = sleepHoursFromEntry(entry);
  if (hours == null || hours >= NIGHT_SLEEP_MIN_HOURS) return false;
  const wake = parseDecimalHour(entry?.wakeTime ?? entry?.sleepEnd);
  const bed = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  if (wake == null && bed == null) return false;
  // Bedtime serale tipico (18–24) o wrap (bed > wake) senza ore notte complete
  if (bed != null && bed >= 18) return true;
  if (bed != null && wake != null && bed > wake) return true;
  return false;
}

/**
 * @param {object[]} sleepEntries
 * @returns {{
 *   entry: object|null,
 *   status: string,
 *   reason: string,
 *   candidateCount: number,
 *   nightCandidateCount: number,
 *   napCount: number,
 *   dedupedCount: number,
 * }}
 */
export function resolveMainNightSleep(sleepEntries) {
  const raw = Array.isArray(sleepEntries) ? sleepEntries.filter((e) => e && e.type === 'sleep') : [];
  const deduped = dedupeSleepEntries(raw);
  const candidateCount = deduped.length;

  if (candidateCount === 0) {
    return {
      entry: null,
      status: MAIN_NIGHT_STATUS.absent,
      reason: 'no_sleep_entries',
      candidateCount: 0,
      nightCandidateCount: 0,
      napCount: 0,
      dedupedCount: 0,
    };
  }

  const nights = [];
  const naps = [];
  for (const e of deduped) {
    const h = sleepHoursFromEntry(e);
    if (h != null && h >= NIGHT_SLEEP_MIN_HOURS) nights.push(e);
    else naps.push(e);
  }

  if (nights.length === 0) {
    const napHoursSum = naps.reduce((s, e) => s + (sleepHoursFromEntry(e) ?? 0), 0);
    if (naps.length >= 2 && napHoursSum >= NIGHT_SLEEP_MIN_HOURS) {
      return {
        entry: null,
        status: MAIN_NIGHT_STATUS.ambiguous,
        reason: 'fragmented_sleep_sum_reaches_night_threshold',
        candidateCount,
        nightCandidateCount: 0,
        napCount: naps.length,
        dedupedCount: deduped.length,
      };
    }
    if (naps.some(looksLikeUncertainOvernightFragment)) {
      return {
        entry: null,
        status: MAIN_NIGHT_STATUS.ambiguous,
        reason: 'short_episode_with_overnight_timeline',
        candidateCount,
        nightCandidateCount: 0,
        napCount: naps.length,
        dedupedCount: deduped.length,
      };
    }
    return {
      entry: null,
      status: MAIN_NIGHT_STATUS.only_naps,
      reason: 'only_entries_below_night_min_hours',
      candidateCount,
      nightCandidateCount: 0,
      napCount: naps.length,
      dedupedCount: deduped.length,
    };
  }

  if (nights.length === 1) {
    return {
      entry: nights[0],
      status: MAIN_NIGHT_STATUS.selected,
      reason: 'single_night_candidate',
      candidateCount,
      nightCandidateCount: 1,
      napCount: naps.length,
      dedupedCount: deduped.length,
    };
  }

  // Ordina per ore desc
  const ranked = [...nights].sort(
    (a, b) => (sleepHoursFromEntry(b) ?? 0) - (sleepHoursFromEntry(a) ?? 0),
  );
  const top = ranked[0];
  const second = ranked[1];
  const topH = sleepHoursFromEntry(top) ?? 0;
  const secondH = sleepHoursFromEntry(second) ?? 0;
  const gap = topH - secondH;

  const complete = ranked.filter(hasReliableTimeline);
  if (complete.length === 1 && gap < HOURS_CLEAR_GAP) {
    return {
      entry: complete[0],
      status: MAIN_NIGHT_STATUS.selected,
      reason: 'prefer_complete_timeline',
      candidateCount,
      nightCandidateCount: nights.length,
      napCount: naps.length,
      dedupedCount: deduped.length,
    };
  }

  if (gap >= HOURS_CLEAR_GAP) {
    return {
      entry: top,
      status: MAIN_NIGHT_STATUS.selected,
      reason: 'longest_night_clear_gap',
      candidateCount,
      nightCandidateCount: nights.length,
      napCount: naps.length,
      dedupedCount: deduped.length,
    };
  }

  // Ore simili, timeline incompleta o multiple complete → ambiguità
  return {
    entry: null,
    status: MAIN_NIGHT_STATUS.ambiguous,
    reason: complete.length > 1
      ? 'multiple_comparable_nights'
      : 'comparable_nights_unreliable_timestamps',
    candidateCount,
    nightCandidateCount: nights.length,
    napCount: naps.length,
    dedupedCount: deduped.length,
  };
}
