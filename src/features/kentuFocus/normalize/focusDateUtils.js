/**
 * Helper data/ora puri per Focus (allineati alla regola noon-anchor di calendarDateUtils).
 * Nessun import da coreEngine.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} value */
export function isIsoDateString(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} n
 * @returns {string}
 */
export function addCalendarDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

/** @param {number} h */
export function wrap24(h) {
  let x = Number(h);
  if (!Number.isFinite(x)) return null;
  x %= 24;
  if (x < 0) x += 24;
  return Math.round(x * 1000) / 1000;
}

/**
 * @param {unknown} raw
 * @returns {number|null} ore decimali 0–24
 */
export function parseDecimalHour(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return wrap24(raw);
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [hh, mm] = s.split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return wrap24(h + m / 60);
  }
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return wrap24(n);
}

/**
 * Bedtime da wake − duration (wrap mezzanotte), come computeBedtimeFromWakeAndDuration.
 * @param {number} wakeDec
 * @param {number} durationHours
 */
export function computeBedtimeFromWakeAndDuration(wakeDec, durationHours) {
  const wake = Number(wakeDec);
  const hours = Number(durationHours);
  if (!Number.isFinite(wake) || !Number.isFinite(hours) || hours <= 0) return null;
  return wrap24(wake - hours);
}

/**
 * Giorno ISO della settimana (lunedì=1 … domenica=7) per data calendario noon-anchor.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {number|null}
 */
export function isoWeekdayFromDate(dateStr) {
  if (!isIsoDateString(dateStr)) return null;
  const js = new Date(`${dateStr}T12:00:00`).getDay(); // 0=dom … 6=sab
  return js === 0 ? 7 : js;
}

/** Nomi corti IT allineati a isoWeekday 1–7. */
export const ISO_WEEKDAY_LABELS_IT = Object.freeze([
  null,
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
  'domenica',
]);

/**
 * Segmento routine: classificazione sulla **mattina di risveglio** (nightEndedOn).
 * lun–ven → weekday; sab–dom → weekend.
 * @param {string} nightEndedOn
 * @returns {'weekday'|'weekend'|null}
 */
export function wakeSegmentFromDate(nightEndedOn) {
  const wd = isoWeekdayFromDate(nightEndedOn);
  if (wd == null) return null;
  return wd <= 5 ? 'weekday' : 'weekend';
}

/**
 * Ore decimali “lineari di notte” per bedtime: se < 12h → +24 (attraversa mezzanotte).
 * Per wake mattutini tipici non usare questo helper.
 * @param {number} hourDecimal
 * @returns {number|null}
 */
export function bedtimeLinearOffset(hourDecimal) {
  const h = Number(hourDecimal);
  if (!Number.isFinite(h)) return null;
  const wrapped = wrap24(h);
  if (wrapped == null) return null;
  return wrapped < 12 ? wrapped + 24 : wrapped;
}

/**
 * Inverse di bedtimeLinearOffset → ore 0–24.
 * @param {number} linear
 * @returns {number|null}
 */
export function bedtimeFromLinearOffset(linear) {
  const x = Number(linear);
  if (!Number.isFinite(x)) return null;
  return wrap24(x);
}

/**
 * @param {string} analysisDate
 * @param {string} publicationDate
 */
export function assertPublicationFollowsAnalysis(analysisDate, publicationDate) {
  if (!isIsoDateString(analysisDate) || !isIsoDateString(publicationDate)) {
    return { ok: false, reason: 'invalid_iso_date' };
  }
  const expected = addCalendarDays(analysisDate, 1);
  if (publicationDate !== expected) {
    return { ok: false, reason: 'publication_not_analysis_plus_one', expected };
  }
  return { ok: true, expected };
}
