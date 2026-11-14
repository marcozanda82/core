/**
 * Record di users/{uid}/focus_day_scores/{YYYY-MM-DD}.
 * Realtime Database non conserva null: uno score assente si scrive con scoreIsNull.
 */

import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';

export function dayScorePath(uid, date) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  if (!isIsoDate(date)) throw new Error('data non valida');
  return `users/${id}/focus_day_scores/${date}`;
}

/**
 * Impronta dei fatti del giorno. Non include la versione del metodo:
 * un metodo nuovo non deve sembrare un dato cambiato.
 * @param {unknown} value
 */
export function hashDayFacts(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * @param {object|null|undefined} record
 */
export function encodeDayScoreForRtdb(record) {
  if (!record || typeof record !== 'object') return null;
  const out = {
    version: record.version,
    reliability: record.reliability,
    cylinders: record.cylinders,
    dataVersion: record.dataVersion,
  };
  if (record.score == null) out.scoreIsNull = true;
  else out.score = record.score;
  return out;
}

/**
 * @param {unknown} raw
 */
export function decodeDayScoreFromRtdb(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const score = raw.scoreIsNull === true || raw.score == null
    ? null
    : Number(raw.score);
  return {
    version: raw.version ?? null,
    score: Number.isFinite(score) ? score : null,
    reliability: raw.reliability ?? null,
    cylinders: normalizeCylinders(raw.cylinders),
    dataVersion: raw.dataVersion ?? null,
  };
}

function normalizeCylinders(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of ['alimentazione', 'sonno', 'movimento', 'forza', 'cardio']) {
    const cylinder = source[key] && typeof source[key] === 'object' ? source[key] : {};
    const value = Number(cylinder.value);
    out[key] = {
      status: cylinder.status ?? 'no_data',
      keyFact: cylinder.keyFact ?? '',
      signals: asArray(cylinder.signals),
      value: Number.isFinite(value) ? value : null,
    };
  }
  return out;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(value[key]));
  }
  return [];
}

function stableStringify(value) {
  if (value == null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return 'null';
}
