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
 * Chiave giorno assoluta YYYY-MM-DD: da `timestamp` (UTC calendar day) oppure parsing della stringa `date`
 * (es. "03-01-2026 09:26:41" o ISO).
 *
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
export function calendarDayKeyFromRow(row) {
  const ts = Number(row?.timestamp);
  if (Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  const raw = row?.date;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const isoStart = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoStart) return isoStart[1];
  const dm = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dm) {
    const dd = dm[1].padStart(2, '0');
    const mm = dm[2].padStart(2, '0');
    return `${dm[3]}-${mm}-${dd}`;
  }
  return null;
}

function pickFirstNumeric(row, keys) {
  for (let k = 0; k < keys.length; k += 1) {
    const key = keys[k];
    if (hasNumericValue(row[key])) return Number(row[key]);
  }
  return null;
}

function mergeMetricPair(base, r, outKey, sourceKeys) {
  if (pickFirstNumeric(base, sourceKeys) != null) return;
  const v = pickFirstNumeric(r, sourceKeys);
  if (v != null) base[outKey] = v;
}

/**
 * Unisce righe con lo stesso giorno di calendario: la chiave è {@link calendarDayKeyFromRow} (ignora ora nel campo testuale `date`).
 * Riempie i null con valori validi dalle altre righe dello stesso giorno.
 *
 * @param {Array<Record<string, unknown>>} parsedRows righe tipo `{ date, timestamp, weight, bodyFat?, muscle?, ... }`
 * @returns {Array<Record<string, unknown>>} una riga per dayKey; `date` sempre `YYYY-MM-DD`.
 */
export function mergeDuplicateBiometrics(parsedRows) {
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) return [];

  const byDay = new Map();
  for (const row of parsedRows) {
    const dayKey = calendarDayKeyFromRow(row);
    if (!dayKey) continue;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(row);
  }

  const out = [];
  for (const [dayKey, rows] of byDay) {
    if (rows.length === 1) {
      out.push({ ...rows[0], date: dayKey });
      continue;
    }
    const sorted = [...rows].sort(
      (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0),
    );
    const base = { ...sorted[0], date: dayKey };
    for (let i = 1; i < sorted.length; i += 1) {
      const r = sorted[i];
      if (pickFirstNumeric(base, ['weight']) == null && pickFirstNumeric(r, ['weight']) != null) {
        base.weight = Number(r.weight);
      }
      mergeMetricPair(base, r, 'bodyFat', ['bodyFat', 'fat', 'fatPercentage']);
      mergeMetricPair(base, r, 'muscle', ['muscleMass', 'muscle', 'leanMass', 'muscle_pct']);
      mergeMetricPair(base, r, 'water', ['bodyWater', 'water', 'waterPercentage', 'water_pct']);
      mergeMetricPair(base, r, 'visceral', ['visceralFat', 'visceral', 'visceral_fat']);
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
  const muscleRaw = raw.muscleMass ?? raw.muscle ?? raw.leanMass ?? raw.muscle_pct;
  const muscleMass =
    muscleRaw != null && muscleRaw !== ''
      ? Number(muscleRaw)
      : null;
  const waterRaw = raw.bodyWater ?? raw.water ?? raw.waterPercentage ?? raw.water_pct;
  const waterPercentage =
    waterRaw != null && waterRaw !== ''
      ? Number(waterRaw)
      : null;
  const viscRaw = raw.visceralFat ?? raw.visceral ?? raw.visceral_fat;
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
 * Record composito per la baseline mappa: parte dall’ultima pesata e applica forward-fill
 * sui campi BIA mancanti (muscolo, acqua, viscerale) usando le righe più vecchie.
 * Opzionale: se manca anche il % grasso sull’ultima riga, viene preso dal più recente storico che lo abbia.
 *
 * @param {Array<Record<string, unknown>>} history
 * @returns {BiometricHistoryEntry | null}
 */
export function getCompositeLatestBiometrics(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const normalized = history.map(normalizeBiometricEntry).filter(Boolean);
  if (normalized.length === 0) return null;

  normalized.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const composite = { ...normalized[0] };

  for (let i = 1; i < normalized.length; i += 1) {
    const row = normalized[i];
    if (!hasNumericValue(composite.bodyFat) && hasNumericValue(row.bodyFat)) {
      composite.bodyFat = Number(row.bodyFat);
    }
    if (!hasNumericValue(composite.muscleMass) && hasNumericValue(row.muscleMass)) {
      composite.muscleMass = Number(row.muscleMass);
    }
    if (!hasNumericValue(composite.waterPercentage) && hasNumericValue(row.waterPercentage)) {
      composite.waterPercentage = Number(row.waterPercentage);
    }
    if (!hasNumericValue(composite.visceralFat) && hasNumericValue(row.visceralFat)) {
      composite.visceralFat = Number(row.visceralFat);
    }
  }

  return composite;
}

/** Fallback asse Y (massa muscolare %) sulla mappa se nessuno storico ha un valore BIA muscolo. */
const MAP_BASELINE_MUSCLE_MASS_FALLBACK = 50;

/**
 * Input per {@link calculateBaselineOffset}: % grasso e massa muscolare (score).
 * Se `muscleMass` manca ancora dopo il composite, si usa solo per Y un fallback neutro (50).
 *
 * @param {BiometricHistoryEntry | null} entry
 * @returns {{ weight: number, bodyFat: number, muscleMass: number } | null}
 */
export function biometricsToMapBaselineInput(entry) {
  if (!entry) return null;
  const bf = entry.bodyFat;
  if (!Number.isFinite(bf)) return null;
  let mm = entry.muscleMass;
  if (!Number.isFinite(mm)) mm = MAP_BASELINE_MUSCLE_MASS_FALLBACK;
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
  const composite = getCompositeLatestBiometrics(bodyMetricsHistory);
  const input = biometricsToMapBaselineInput(composite);
  if (!input) return null;
  return calculateBaselineOffset(input);
}
