import { calculateBaselineOffset } from './metabolicMapEngine';

/**
 * Voce cronologica pesate / composizione (allineata a `users/.../body_metrics` su RTDB).
 *
 * @typedef {{
 *   id?: string,
 *   date?: string,
 *   timestamp?: number,
 *   weight: number,
 *   bodyFat?: number | null,
 *   muscleMass?: number | null,
 *   waterPercentage?: number | null,
 *   visceralFat?: number | null,
 * }} BiometricHistoryEntry
 */

/**
 * Normalizza un record Firebase o form in forma unica.
 *
 * @param {Record<string, unknown>} raw
 * @returns {BiometricHistoryEntry | null}
 */
/**
 * Valore numerico usabile (non null / finito).
 * @param {unknown} v
 * @returns {boolean}
 */
function hasNumericValue(v) {
  if (v == null || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n);
}

/**
 * Unisce righe CSV con la stessa data (YYYY-MM-DD): compone un solo record per giorno,
 * riempiendo i campi mancanti dalle altre righe (es. una riga solo peso + una riga BIA).
 * Ordine di merge: righe ordinate per `timestamp` crescente; per ogni campo si mantiene il primo valore valido,
 * poi si integrano i null con le righe successive.
 *
 * @param {Array<Record<string, unknown>>} parsedRows righe tipo `{ date, timestamp, weight, bodyFat?, muscle?, water?, visceral? }`
 * @returns {Array<Record<string, unknown>>}
 */
export function mergeDuplicateBiometrics(parsedRows) {
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) return [];

  const byDate = new Map();
  for (const row of parsedRows) {
    const d = row?.date;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(row);
  }

  const out = [];
  for (const [, rows] of byDate) {
    if (rows.length === 1) {
      out.push(rows[0]);
      continue;
    }
    const sorted = [...rows].sort(
      (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0),
    );
    const base = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i += 1) {
      const r = sorted[i];
      if (!hasNumericValue(base.weight) && hasNumericValue(r.weight)) {
        base.weight = Number(r.weight);
      }
      for (const key of ['bodyFat', 'muscle', 'water', 'visceral']) {
        if (!hasNumericValue(base[key]) && hasNumericValue(r[key])) {
          base[key] = Number(r[key]);
        }
      }
      base.timestamp = Math.max(Number(base.timestamp) || 0, Number(r.timestamp) || 0);
    }
    out.push(base);
  }

  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

export function normalizeBiometricEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const w = Number(raw.weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  const ts = Number(raw.timestamp);
  const bf =
    raw.bodyFat != null && raw.bodyFat !== ''
      ? Number(raw.bodyFat)
      : null;
  const muscleRaw = raw.muscle ?? raw.muscleMass;
  const muscleMass =
    muscleRaw != null && muscleRaw !== ''
      ? Number(muscleRaw)
      : null;
  const waterRaw = raw.water ?? raw.waterPercentage;
  const waterPercentage =
    waterRaw != null && waterRaw !== ''
      ? Number(waterRaw)
      : null;
  const viscRaw = raw.visceral ?? raw.visceralFat;
  const visceralFat =
    viscRaw != null && viscRaw !== ''
      ? Number(viscRaw)
      : null;
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    date: typeof raw.date === 'string' ? raw.date : undefined,
    timestamp: Number.isFinite(ts) ? ts : 0,
    weight: w,
    bodyFat: bf != null && Number.isFinite(bf) ? bf : null,
    muscleMass: muscleMass != null && Number.isFinite(muscleMass) ? muscleMass : null,
    waterPercentage: waterPercentage != null && Number.isFinite(waterPercentage) ? waterPercentage : null,
    visceralFat: visceralFat != null && Number.isFinite(visceralFat) ? visceralFat : null,
  };
}

/**
 * Ordina per tempo crescente (più vecchio prima).
 *
 * @param {Array<Record<string, unknown>>} records
 * @returns {BiometricHistoryEntry[]}
 */
export function sortBiometricsByTimeAsc(records) {
  if (!Array.isArray(records)) return [];
  const out = records.map(normalizeBiometricEntry).filter(Boolean);
  out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return out;
}

/**
 * Ultima pesata per timestamp (Peso Attuale strutturale).
 *
 * @param {Array<Record<string, unknown>>} records
 * @returns {BiometricHistoryEntry | null}
 */
export function getLatestBiometricRecord(records) {
  const asc = sortBiometricsByTimeAsc(records);
  if (!asc.length) return null;
  return asc[asc.length - 1];
}

/**
 * Input per {@link calculateBaselineOffset}: richiede % massa grassa e punteggio massa muscolare (come nel diario).
 *
 * @param {BiometricHistoryEntry | null} entry
 * @returns {{ weight: number, bodyFat: number, muscleMass: number } | null}
 */
export function biometricsToMapBaselineInput(entry) {
  if (!entry) return null;
  const bf = entry.bodyFat;
  const mm = entry.muscleMass;
  if (!Number.isFinite(bf) || !Number.isFinite(mm)) return null;
  return {
    weight: entry.weight,
    bodyFat: bf,
    muscleMass: mm,
  };
}

/**
 * Offset mappa metabolica dalla cronologia bilancia; `null` se dati insufficienti.
 *
 * @param {Array<Record<string, unknown>>} bodyMetricsHistory
 * @returns {{ x: number, y: number } | null}
 */
export function getStructuralBaselineOffsetFromHistory(bodyMetricsHistory) {
  const latest = getLatestBiometricRecord(bodyMetricsHistory);
  const input = biometricsToMapBaselineInput(latest);
  if (!input) return null;
  return calculateBaselineOffset(input);
}
