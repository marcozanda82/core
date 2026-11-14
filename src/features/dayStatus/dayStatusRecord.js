/**
 * Record persistito in users/{uid}/day_status/{YYYY-MM-DD}.
 * Nessun giudizio: solo i flag che l'utente (o il recupero) ha dichiarato.
 */

export const DAY_STATUS_SCHEMA = 'kentu.dayStatus.v1';

export const PAUSE_REASONS = Object.freeze(['vacanza', 'malattia', 'altro']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} value */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year
    && dt.getUTCMonth() === month - 1
    && dt.getUTCDate() === day;
}

/**
 * @param {string} uid
 * @param {string} date
 */
export function dayStatusPath(uid, date) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  if (!isIsoDate(date)) throw new Error('data non valida');
  return `users/${id}/day_status/${date}`;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   confirmed: boolean,
 *   confirmedAt: number|null,
 *   approximate: boolean,
 *   paused: boolean,
 *   pauseReason: string|null,
 *   loggedLateAt: number|null,
 * }|null}
 */
export function normalizeDayStatusRecord(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const confirmed = raw.confirmed === true;
  const approximate = raw.approximate === true;
  const paused = raw.paused === true;
  const confirmedAt = finiteEpoch(raw.confirmedAt);
  const loggedLateAt = finiteEpoch(raw.loggedLateAt);
  const pauseReason = PAUSE_REASONS.includes(raw.pauseReason) ? raw.pauseReason : null;
  return {
    confirmed,
    confirmedAt: confirmed ? confirmedAt : null,
    approximate,
    paused,
    pauseReason: paused ? pauseReason : null,
    loggedLateAt,
  };
}

/**
 * Record pronto per RTDB. Omette i campi opzionali vuoti.
 * @param {object} input
 */
export function buildDayStatusRecord(input = {}) {
  const normalized = normalizeDayStatusRecord({
    confirmed: false,
    approximate: false,
    paused: false,
    ...input,
  });
  const record = {
    confirmed: normalized.confirmed,
    approximate: normalized.approximate,
    paused: normalized.paused,
  };
  if (normalized.confirmed && normalized.confirmedAt != null) {
    record.confirmedAt = normalized.confirmedAt;
  }
  if (normalized.paused && normalized.pauseReason) {
    record.pauseReason = normalized.pauseReason;
  }
  if (normalized.loggedLateAt != null) {
    record.loggedLateAt = normalized.loggedLateAt;
  }
  return record;
}

/** @param {unknown} value */
export function finiteEpoch(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e12) return Math.round(n);
  if (n >= 1e9) return Math.round(n * 1000);
  return null;
}
