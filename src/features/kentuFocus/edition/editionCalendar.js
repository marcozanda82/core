/**
 * Calendario edizioni Focus — funzioni pure (P6.5).
 * Un solo giornale; il tipo dipende dalla data di pubblicazione.
 */

import {
  addCalendarDays,
  isIsoDateString,
  isoWeekdayFromDate,
} from '../normalize/focusDateUtils.js';

export const FOCUS_EDITION_KIND = Object.freeze({
  daily: 'daily',
  sunday_plus: 'sunday_plus',
  month_plus: 'month_plus',
  sunday_month_plus: 'sunday_month_plus',
});

/**
 * Preset banco. `asOfDate` di default del banco = 2026-10-19 (giorno delle prove P6.5.1).
 * I preset con publicationDate > asOfDate sono simulazioni, mai “prova reale completa”.
 */
export const FOCUS_EDITION_BENCH_AS_OF_DEFAULT = '2026-10-19';

/** Preset utili al banco di prova (non equivalgono a prova su diario reale). */
export const FOCUS_EDITION_BENCH_PRESETS = Object.freeze({
  daily_regression: {
    id: 'daily_regression',
    label: 'Quotidiano 19/10/2026 (regressione)',
    publicationDate: '2026-10-19',
    dataOriginHint: 'historical_real',
    forceSimulation: false,
  },
  sunday_past: {
    id: 'sunday_past',
    label: 'Domenicale 18/10/2026 (storico RAM)',
    publicationDate: '2026-10-18',
    dataOriginHint: 'historical_real',
    forceSimulation: false,
  },
  sunday_example: {
    id: 'sunday_example',
    label: 'Domenicale 25/10/2026 (SIMULAZIONE / fixture)',
    publicationDate: '2026-10-25',
    dataOriginHint: 'fixture_simulation',
    forceSimulation: true,
  },
  month_first: {
    id: 'month_first',
    label: 'Mensile 01/10/2026 (primo del mese, non domenica)',
    publicationDate: '2026-10-01',
    dataOriginHint: 'historical_real',
    forceSimulation: false,
  },
  sunday_month: {
    id: 'sunday_month',
    label: 'Domenica=1º 01/11/2026 (SIMULAZIONE futura)',
    publicationDate: '2026-11-01',
    dataOriginHint: 'fixture_simulation',
    forceSimulation: true,
  },
});

/**
 * @param {string} publicationDate
 * @returns {boolean}
 */
export function isSundayPublication(publicationDate) {
  return isoWeekdayFromDate(publicationDate) === 7;
}

/**
 * @param {string} publicationDate
 * @returns {boolean}
 */
export function isFirstOfMonth(publicationDate) {
  if (!isIsoDateString(publicationDate)) return false;
  return publicationDate.slice(8, 10) === '01';
}

/**
 * @param {string} publicationDate YYYY-MM-DD
 * @returns {keyof typeof FOCUS_EDITION_KIND|null}
 */
export function resolveEditionKind(publicationDate) {
  if (!isIsoDateString(publicationDate)) return null;
  const sunday = isSundayPublication(publicationDate);
  const first = isFirstOfMonth(publicationDate);
  if (sunday && first) return FOCUS_EDITION_KIND.sunday_month_plus;
  if (sunday) return FOCUS_EDITION_KIND.sunday_plus;
  if (first) return FOCUS_EDITION_KIND.month_plus;
  return FOCUS_EDITION_KIND.daily;
}

/**
 * Settimana domenica→sabato appena conclusa rispetto a una pubblicazione domenicale.
 * Pub 25/10 → 18–24; la notte del 25 resta fuori (solo quotidiano).
 * @param {string} publicationDate domenica
 */
export function resolveSundayWeekWindow(publicationDate) {
  if (!isIsoDateString(publicationDate) || !isSundayPublication(publicationDate)) {
    return null;
  }
  const weekEnd = addCalendarDays(publicationDate, -1); // sabato
  const weekStart = addCalendarDays(publicationDate, -7); // domenica precedente
  return {
    fromDate: weekStart,
    toDate: weekEnd,
    label: 'week_sun_sat',
    sleepWakeFrom: weekStart,
    sleepWakeTo: weekEnd,
    excludesPublicationNight: publicationDate,
    note: 'Risvegli conclusi dom→sab; notte della domenica di pubblicazione esclusa dal bilancio.',
  };
}

/**
 * Mese solare precedente completo rispetto al 1º del mese di pubblicazione.
 * @param {string} publicationDate primo del mese
 */
export function resolvePreviousCalendarMonthWindow(publicationDate) {
  if (!isIsoDateString(publicationDate) || !isFirstOfMonth(publicationDate)) {
    return null;
  }
  const y = Number(publicationDate.slice(0, 4));
  const m = Number(publicationDate.slice(5, 7)); // 1–12
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const fromDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate(); // day 0 of next month
  const toDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    fromDate,
    toDate,
    label: 'prev_calendar_month',
    sleepWakeFrom: fromDate,
    sleepWakeTo: toDate,
    note: 'Mese solare precedente, primo→ultimo giorno inclusi.',
  };
}

/**
 * Finestre e date Focus per una data di pubblicazione.
 * @param {string} publicationDate
 */
export function resolveEditionWindows(publicationDate) {
  if (!isIsoDateString(publicationDate)) {
    return {
      ok: false,
      reason: 'invalid_publication_date',
      editionKind: null,
    };
  }
  const editionKind = resolveEditionKind(publicationDate);
  const analysisDate = addCalendarDays(publicationDate, -1);
  const week = (editionKind === FOCUS_EDITION_KIND.sunday_plus
    || editionKind === FOCUS_EDITION_KIND.sunday_month_plus)
    ? resolveSundayWeekWindow(publicationDate)
    : null;
  const month = (editionKind === FOCUS_EDITION_KIND.month_plus
    || editionKind === FOCUS_EDITION_KIND.sunday_month_plus)
    ? resolvePreviousCalendarMonthWindow(publicationDate)
    : null;

  /** Giorni di storico utili al bilancio (escluso padding confronti). */
  let perspectiveFrom = analysisDate;
  let perspectiveTo = publicationDate;
  if (week) perspectiveFrom = week.fromDate < perspectiveFrom ? week.fromDate : perspectiveFrom;
  if (month) perspectiveFrom = month.fromDate < perspectiveFrom ? month.fromDate : perspectiveFrom;

  return {
    ok: true,
    reason: null,
    editionKind,
    publicationDate,
    analysisDate,
    lastCompletedNight: publicationDate,
    week,
    month,
    perspectiveFrom,
    perspectiveTo,
    /**
     * Requisiti futuri di caricamento (non implementati automaticamente).
     * Confronto mese precedente al bilancio richiede ~2 mesi di nodi.
     */
    futureHistoryLoadHints: {
      dailyMinDays: 30,
      sundayPlusMinDays: 14,
      monthPlusMinDays: 31,
      monthPlusWithPriorComparisonDays: 62,
      sundayMonthPlusMinDays: 62,
      note: 'Operativo futuro: allineare bootstrap fullHistory a questi minimi per edizione. '
        + 'Il banco usa solo RAM già presente; non inventa nodi mancanti.',
    },
  };
}

/**
 * Giorni di calendario inclusivi.
 * @param {string} fromDate
 * @param {string} toDate
 */
export function countInclusiveCalendarDays(fromDate, toDate) {
  if (!isIsoDateString(fromDate) || !isIsoDateString(toDate) || fromDate > toDate) {
    return 0;
  }
  let n = 0;
  let cursor = fromDate;
  while (cursor <= toDate) {
    n += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return n;
}
