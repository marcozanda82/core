/** Add n days to dateStr (YYYY-MM-DD), return YYYY-MM-DD. Noon anchor avoids DST edge cases. */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
