/** Add n days to dateStr (YYYY-MM-DD), return YYYY-MM-DD. Noon anchor avoids DST edge cases. */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Giorni di calendario tra due ISO date (inclusivo verso `toIso` se successiva). */
export function differenceInCalendarDays(fromIso, toIso) {
  const from = new Date(String(fromIso || '') + 'T12:00:00');
  const to = new Date(String(toIso || '') + 'T12:00:00');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
