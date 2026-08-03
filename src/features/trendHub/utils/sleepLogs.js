import { ref, update } from 'firebase/database';

/**
 * Sleep logs leggeri per SaluteView / HealthAnalyzer.
 * Path RTDB: users/{uid}/sleep_logs/{YYYY-MM-DD}
 *
 * @typedef {'poor' | 'ok' | 'good'} SleepQuality
 * @typedef {{ hours: number, quality: SleepQuality, recordedAt: number }} SleepLogEntry
 */

export const SLEEP_QUALITY_OPTIONS = Object.freeze([
  { value: 'poor', label: 'Scarso', icon: '🔴' },
  { value: 'ok', label: 'Ok', icon: '🟡' },
  { value: 'good', label: 'Buono', icon: '🟢' },
]);

export const SLEEP_HOURS_MIN = 3;
export const SLEEP_HOURS_MAX = 14;
export const SLEEP_HOURS_STEP = 0.5;
export const DEFAULT_SLEEP_HOURS = 7.5;

/**
 * @param {unknown} value
 * @returns {SleepQuality | null}
 */
export function normalizeSleepQuality(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'poor' || v === 'ok' || v === 'good') return v;
  return null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeSleepHours(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const stepped = Math.round(n / SLEEP_HOURS_STEP) * SLEEP_HOURS_STEP;
  if (stepped < SLEEP_HOURS_MIN || stepped > SLEEP_HOURS_MAX) return null;
  return Math.round(stepped * 10) / 10;
}

/**
 * @param {unknown} raw
 * @returns {SleepLogEntry | null}
 */
export function normalizeSleepLogEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const hours = normalizeSleepHours(raw.hours);
  const quality = normalizeSleepQuality(raw.quality);
  if (hours == null || !quality) return null;
  const recordedAt = Number(raw.recordedAt);
  return {
    hours,
    quality,
    recordedAt: Number.isFinite(recordedAt) && recordedAt > 0 ? recordedAt : Date.now(),
  };
}

/**
 * @param {{ hours: unknown, quality: unknown, recordedAt?: number }} input
 * @returns {{ payload: SleepLogEntry | null, error?: string }}
 */
export function buildSleepLogPayload(input = {}) {
  const hours = normalizeSleepHours(input.hours);
  const quality = normalizeSleepQuality(input.quality);
  if (hours == null) {
    return { payload: null, error: `Ore sonno non valide (${SLEEP_HOURS_MIN}–${SLEEP_HOURS_MAX}, step ${SLEEP_HOURS_STEP}).` };
  }
  if (!quality) {
    return { payload: null, error: 'Seleziona la qualità del sonno (poor | ok | good).' };
  }
  return {
    payload: {
      hours,
      quality,
      recordedAt: Number(input.recordedAt) || Date.now(),
    },
  };
}

/**
 * Salva (upsert) il log sonno per una data.
 * @param {{
 *   db: import('firebase/database').Database,
 *   uid: string,
 *   date: string,
 *   hours: unknown,
 *   quality: unknown,
 * }} args
 * @returns {Promise<SleepLogEntry>}
 */
export async function saveSleepMetrics({ db, uid, date, hours, quality }) {
  if (!db || !uid) throw new Error('Accedi per salvare il sonno.');
  const dateKey = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('Data sonno non valida.');
  }
  const { payload, error } = buildSleepLogPayload({ hours, quality, recordedAt: Date.now() });
  if (!payload) throw new Error(error || 'Dati sonno non validi.');

  await update(ref(db, `users/${uid}/sleep_logs`), {
    [dateKey]: payload,
  });
  return payload;
}

/**
 * @param {SleepQuality | null | undefined} quality
 */
export function sleepQualityLabel(quality) {
  const hit = SLEEP_QUALITY_OPTIONS.find((o) => o.value === quality);
  return hit ? hit.label : '—';
}

/**
 * @param {SleepQuality | null | undefined} quality
 */
export function sleepQualityIcon(quality) {
  const hit = SLEEP_QUALITY_OPTIONS.find((o) => o.value === quality);
  return hit ? hit.icon : '⚪';
}
