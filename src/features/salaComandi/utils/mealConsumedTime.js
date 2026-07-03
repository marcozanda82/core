/**
 * Orario di consumo pasto per calcoli metabolici (NON timestamp di salvataggio).
 * Allineato alla barra nodi: mealTime decimale o HH:mm + data del log.
 */

/** Converte mealTime/time in ore decimali (0–24). Accetta number o "13:30". */
export function parseDecimalHourFromValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(24, value));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? Math.max(0, Math.min(24, n)) : null;
  }

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return h + m / 60;
    }
  }

  return null;
}

function msFromDayKeyAndDecimalHour(dayKey, decimalHour) {
  if (!dayKey || decimalHour == null) return 0;
  const baseDate = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return 0;

  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hours) * 60);
  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate.getTime();
}

function extractBatchTimestampFromId(entry) {
  const id = String(entry?.id ?? entry?.batchId ?? '');
  const batchMatch = id.match(/(?:^|_)(\d{10,13})(?:_|$)/);
  if (!batchMatch) return 0;
  const ts = Number(batchMatch[1]);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts > 1e12 ? ts : ts * 1000;
}

/**
 * Timestamp ms dell'istante in cui il pasto è stato consumato.
 * Priorità: mealTime/time del diario → slot mealTimes → loggedAt (solo fallback).
 *
 * @param {object} entry
 * @param {string} dayKey — YYYY-MM-DD del giorno di log
 * @param {object} [mealTimesObj] — mappa mealType → ora decimale (Firebase)
 */
export function resolveEntryMealConsumedAtMs(entry, dayKey, mealTimesObj = null) {
  let mealDecimal =
    parseDecimalHourFromValue(entry?.mealTime)
    ?? parseDecimalHourFromValue(entry?.time);

  if (mealDecimal == null && entry?.mealType && mealTimesObj) {
    mealDecimal = parseDecimalHourFromValue(mealTimesObj[entry.mealType]);
  }

  if (mealDecimal != null && dayKey) {
    const fromMeal = msFromDayKeyAndDecimalHour(dayKey, mealDecimal);
    if (fromMeal > 0) return fromMeal;
  }

  const loggedAt = Number(
    entry?.loggedAt ?? entry?.timestamp ?? entry?.lastUsedAt ?? entry?.lastUsed ?? entry?._loggedAtMs,
  );
  if (Number.isFinite(loggedAt) && loggedAt > 0) return loggedAt;

  const fromBatchId = extractBatchTimestampFromId(entry);
  if (fromBatchId > 0) return fromBatchId;

  if (dayKey) {
    const startOfDay = new Date(`${dayKey}T00:00:00`).getTime();
    if (Number.isFinite(startOfDay) && startOfDay > 0) return startOfDay;
  }

  return 0;
}
