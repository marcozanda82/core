/**
 * Stress index 0–100 → livelli leggibili in UI (testo in inglese come da prodotto).
 */

export function clampStressValue(value) {
  const x = Math.round(Number(value));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

/**
 * @param {number} value — stress 0–100
 * @returns {'Low' | 'Medium' | 'High'}
 */
export function getStressLabel(value) {
  const n = clampStressValue(value);
  if (n <= 33) return 'Low';
  if (n <= 66) return 'Medium';
  return 'High';
}

/** Es. "Medium (55%)" — livello in primo piano, numero come contesto. */
export function formatStressWithPercent(value) {
  const n = clampStressValue(value);
  return `${getStressLabel(value)} (${n}%)`;
}

/** Colore accent per card / hero (low = calmo, high = attenzione). */
export function getStressAccentColor(value) {
  const n = clampStressValue(value);
  if (n >= 67) return '#f87171';
  if (n >= 34) return '#fbbf24';
  return '#86efac';
}
