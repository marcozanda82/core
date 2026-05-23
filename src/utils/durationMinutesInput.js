export const WORKOUT_DURATION_DEFAULT = 30;
export const WORKOUT_DURATION_MIN = 15;
export const WORKOUT_DURATION_MAX = 600;

export const NAP_DURATION_DEFAULT = 30;
export const NAP_DURATION_MIN = 5;
export const NAP_DURATION_MAX = 1440;

/** Parse minuti da stringa di input; stringa vuota → fallback. */
export function parseDurationMinutesInput(raw, { min, max, fallback }) {
  const s = String(raw ?? '').trim();
  if (s === '') return fallback;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
