import { parseDecimalHourFromValue } from '../features/salaComandi/utils/mealConsumedTime';
import { getTimePositionPercent } from '../timeLayout';

/**
 * Converte number | "HH:mm" | ore decimali → ora 0–24.
 * @param {number | string | null | undefined} timeInput
 * @returns {number}
 */
export function resolveDecimalHour(timeInput) {
  if (typeof timeInput === 'number' && Number.isFinite(timeInput)) {
    return Math.max(0, Math.min(24, timeInput));
  }
  const parsed = parseDecimalHourFromValue(timeInput);
  return parsed != null ? parsed : 0;
}

/**
 * Posizione orizzontale % sull'arco 0–24h (formula condivisa Riga 1 + Riga 2).
 * @param {number | string} timeInput
 * @returns {number} 0–100
 */
export function getLeftPercentage(timeInput) {
  return getTimePositionPercent(resolveDecimalHour(timeInput));
}

/** Stile assoluto left/width per segmenti orizzontali allineati all'asse X. */
export function getSegmentPositionStyle(startHour, endHour) {
  const start = resolveDecimalHour(startHour);
  const end = resolveDecimalHour(endHour);
  const left = getLeftPercentage(start);
  const right = getLeftPercentage(Math.max(start, end));
  return {
    left: `${left}%`,
    width: `${Math.max(0, right - left)}%`,
  };
}

/** Etichetta HH:mm da ora decimale (locale). */
export function formatDecimalHourClock(decimalHour) {
  const hour = resolveDecimalHour(decimalHour);
  const hh = Math.floor(hour);
  const mm = Math.round((hour % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const UNIFIED_TIMELINE_AXIS_HOURS = [0, 6, 12, 18, 24];
