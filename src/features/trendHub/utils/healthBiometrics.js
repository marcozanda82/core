/**
 * Helpers biometrici Salute (peso + girovita).
 * Campo canonico RTDB: `waist` (cm). Alias letti: girovita, waistCm, waist_cm.
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parsePositiveMetric(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @returns {number | null}
 */
export function readWaistCm(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return parsePositiveMetric(entry.waist ?? entry.girovita ?? entry.waistCm ?? entry.waist_cm);
}

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @returns {number | null}
 */
export function readWeightKg(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return parsePositiveMetric(entry.weight ?? entry.peso);
}

/**
 * @param {Array<Record<string, unknown>>} history
 * @param {string} [fallbackDate]
 * @returns {Array<Record<string, unknown>>}
 */
export function sortHealthBiometricsAsc(history = [], fallbackDate) {
  const safe = Array.isArray(history) ? history : [];
  return [...safe]
    .filter((entry) => readWeightKg(entry) != null || readWaistCm(entry) != null)
    .sort((a, b) => {
      const da = String(a?.date || '').localeCompare(String(b?.date || ''));
      if (da !== 0) return da;
      return (Number(a?.timestamp) || 0) - (Number(b?.timestamp) || 0);
    });
}

/**
 * Ultima entry e precedente (per delta micro-trend).
 * @param {Array<Record<string, unknown>>} history
 * @returns {{ latest: Record<string, unknown> | null, previous: Record<string, unknown> | null }}
 */
export function getLatestHealthBiometricsPair(history = []) {
  const sorted = sortHealthBiometricsAsc(history);
  if (sorted.length === 0) return { latest: null, previous: null };
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  return { latest, previous };
}

/**
 * Ultimo valore non-null per una metrica scorrendo lo storico dal più recente.
 * @param {Array<Record<string, unknown>>} history
 * @param {(entry: Record<string, unknown>) => number | null} reader
 * @returns {{ value: number | null, entry: Record<string, unknown> | null, previousValue: number | null }}
 */
export function getLatestMetricWithDelta(history, reader) {
  const sorted = sortHealthBiometricsAsc(history);
  let value = null;
  let entry = null;
  let previousValue = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const v = reader(sorted[i]);
    if (v == null) continue;
    if (value == null) {
      value = v;
      entry = sorted[i];
      continue;
    }
    previousValue = v;
    break;
  }
  return { value, entry, previousValue };
}

/**
 * @param {number | null} current
 * @param {number | null} previous
 * @returns {{ delta: number | null, direction: 'up' | 'down' | 'flat' | 'none' }}
 */
export function computeMetricDelta(current, previous) {
  if (current == null || previous == null) {
    return { delta: null, direction: 'none' };
  }
  const delta = Math.round((current - previous) * 10) / 10;
  if (delta > 0) return { delta, direction: 'up' };
  if (delta < 0) return { delta, direction: 'down' };
  return { delta: 0, direction: 'flat' };
}

/**
 * Snapshot UI per card salute.
 * @param {Array<Record<string, unknown>>} history
 */
export function buildBiometricsHealthSnapshot(history = []) {
  const weight = getLatestMetricWithDelta(history, readWeightKg);
  const waist = getLatestMetricWithDelta(history, readWaistCm);
  const weightDelta = computeMetricDelta(weight.value, weight.previousValue);
  const waistDelta = computeMetricDelta(waist.value, waist.previousValue);
  return {
    weightKg: weight.value,
    weightDate: weight.entry?.date ?? null,
    weightDelta,
    waistCm: waist.value,
    waistDate: waist.entry?.date ?? null,
    waistDelta,
  };
}
