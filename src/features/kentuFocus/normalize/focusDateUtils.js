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

const MONTHS_IT = Object.freeze([
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]);

/**
 * Data in linguaggio naturale IT (niente ISO).
 * @param {string} isoDate YYYY-MM-DD
 * @param {{ relativeToToday?: string|null, preferIeri?: boolean }} [opts]
 * @returns {string|null}
 */
export function formatFocusNaturalDay(isoDate, opts = {}) {
  if (!isIsoDateString(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00`);
  const weekday = ISO_WEEKDAY_LABELS_IT[isoWeekdayFromDate(isoDate)] || '';
  const day = d.getDate();
  const month = MONTHS_IT[d.getMonth()];
  const base = `${weekday} ${day} ${month}`;
  const todayIso = opts.relativeToToday && isIsoDateString(opts.relativeToToday)
    ? opts.relativeToToday
    : null;
  if (todayIso && opts.preferIeri !== false) {
    const yeri = addCalendarDays(todayIso, -1);
    if (isoDate === yeri) return `Ieri, ${base}`;
    if (isoDate === todayIso) return `Oggi, ${base}`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {string|null}
 */
export function formatFocusNaturalRange(fromIso, toIso) {
  if (!isIsoDateString(fromIso) || !isIsoDateString(toIso)) return null;
  const a = new Date(`${fromIso}T12:00:00`);
  const b = new Date(`${toIso}T12:00:00`);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `dal ${a.getDate()} al ${b.getDate()} ${MONTHS_IT[b.getMonth()]}`;
  }
  return `dal ${a.getDate()} ${MONTHS_IT[a.getMonth()]} al ${b.getDate()} ${MONTHS_IT[b.getMonth()]}`;
}

/**
 * Etichetta periodo Focus per UI.
 * @param {{ periodId?: string, analysisDate?: string, publicationDate?: string, windowFrom?: string, windowTo?: string, todayIso?: string }} ctx
 */
export function formatFocusPeriodNaturalLabel(ctx = {}) {
  const periodId = String(ctx.periodId || 'ieri');
  const today = ctx.todayIso || null;
  if (periodId === 'ieri' && isIsoDateString(ctx.analysisDate)) {
    return formatFocusNaturalDay(ctx.analysisDate, { relativeToToday: today, preferIeri: true });
  }
  if ((periodId === 'settimana' || periodId === 'mese') && isIsoDateString(ctx.windowFrom) && isIsoDateString(ctx.windowTo)) {
    const range = formatFocusNaturalRange(ctx.windowFrom, ctx.windowTo);
    return periodId === 'settimana' ? `Settimana ${range}` : `Mese ${range}`;
  }
  if (isIsoDateString(ctx.analysisDate)) {
    return formatFocusNaturalDay(ctx.analysisDate, { relativeToToday: today });
  }
  return null;
}

/**
 * Numero in formato italiano (virgola decimale).
 * @param {number|null|undefined} value
 * @param {{ maxFrac?: number, minFrac?: number }} [opts]
 * @returns {string|null}
 */
export function formatFocusItNumber(value, opts = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const maxFrac = opts.maxFrac ?? 0;
  const minFrac = opts.minFrac ?? 0;
  return n.toLocaleString('it-IT', {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: minFrac,
  });
}

/**
 * Ore decimali → "6 h 30" / "7 h".
 * @param {number|null|undefined} hours
 * @returns {string|null}
 */
export function formatFocusHoursIt(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 0) return null;
  const h = Math.floor(n);
  const mins = Math.round((n - h) * 60);
  if (mins <= 0) return `${h} h`;
  if (mins >= 60) return `${h + 1} h`;
  return `${h} h ${mins}`;
}

/**
 * "generato oggi alle 19:08" / "generato il 27 ottobre alle 19:08"
 * @param {number|string|Date} generatedAt
 * @param {{ now?: Date }} [opts]
 */
export function formatFocusGeneratedAtNatural(generatedAt, opts = {}) {
  const d = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `generato oggi alle ${hh}:${mm}`;
  return `generato il ${d.getDate()} ${MONTHS_IT[d.getMonth()]} alle ${hh}:${mm}`;
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
