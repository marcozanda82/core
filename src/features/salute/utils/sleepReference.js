export const SLEEP_REFERENCE_MIN_H = 5;
export const SLEEP_REFERENCE_MAX_H = 10;
export const SLEEP_REFERENCE_STEP_H = 0.25;
/** Default `/salute` only — does not feed Longevity Score. */
export const SLEEP_REFERENCE_DEFAULT_H = 7;

function finiteHours(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function snapSleepReferenceHours(value) {
  const n = finiteHours(value);
  if (n == null) return null;
  const snapped = Math.round(n / SLEEP_REFERENCE_STEP_H) * SLEEP_REFERENCE_STEP_H;
  const clamped = Math.min(
    SLEEP_REFERENCE_MAX_H,
    Math.max(SLEEP_REFERENCE_MIN_H, snapped),
  );
  return Math.round(clamped * 100) / 100;
}

export function recommendedSleepReferenceHours(_age) {
  return SLEEP_REFERENCE_DEFAULT_H;
}

export function formatSleepClock(hours) {
  const n = finiteHours(hours);
  if (n == null) return '—';
  const totalMins = Math.max(0, Math.round(n * 60));
  const whole = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${whole}h`;
  return `${whole}h ${mins}m`;
}

export function formatSleepHoursShort(hours) {
  const n = finiteHours(hours);
  if (n == null) return '—';
  return `${n.toFixed(1).replace('.', ',')} h`;
}

export function formatVsReferenceHours(deltaHours) {
  const n = finiteHours(deltaHours);
  if (n == null) return null;
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded) < 0.05) return 'in linea';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toFixed(1).replace('.', ',')}h`;
}

export function formatVsReferenceClock(deltaHours) {
  const n = finiteHours(deltaHours);
  if (n == null) return null;
  const mins = Math.round(n * 60);
  if (mins === 0) return 'in linea con il riferimento';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = mins > 0 ? '+' : '−';
  if (h === 0) return `${sign}${m}m rispetto al riferimento`;
  if (m === 0) return `${sign}${h}h rispetto al riferimento`;
  return `${sign}${h}h ${m}m rispetto al riferimento`;
}

export function sleepReferenceStory({ averageHours, effectiveHours, sampleDays } = {}) {
  const avg = finiteHours(averageHours);
  const ref = finiteHours(effectiveHours);
  if (avg == null || ref == null || !(Number(sampleDays) > 0)) {
    return 'Registra qualche notte per vedere come sta andando il sonno.';
  }
  const delta = avg - ref;
  if (delta < -0.25) {
    return 'Negli ultimi giorni il tuo sonno è stato mediamente sotto il tuo riferimento.';
  }
  if (delta > 0.25) {
    return 'Negli ultimi giorni il tuo sonno è stato mediamente sopra il tuo riferimento.';
  }
  return 'Negli ultimi giorni il tuo sonno è rimasto vicino al tuo riferimento.';
}
