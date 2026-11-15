/** Shim server: evita di bundlare buildFocusLabDossier (grafo UI/Firebase client). */

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function getTrackerDayNode(fullHistory, date) {
  if (!fullHistory || typeof fullHistory !== 'object' || !isIsoDateString(date)) {
    return null;
  }
  const key = `trackerStorico_${date}`;
  const node = fullHistory[key];
  return node && typeof node === 'object' ? node : null;
}
