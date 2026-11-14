/**
 * Record di users/{uid}/safety_status/{YYYY-MM-DD}.
 * L'elenco vuoto porta un segnaposto: Realtime Database non conserva un oggetto vuoto.
 */

import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';

export function safetyStatusPath(uid, date) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  if (!isIsoDate(date)) throw new Error('data non valida');
  return `users/${id}/safety_status/${date}`;
}

/**
 * @param {object|null|undefined} result
 */
export function encodeSafetyForRtdb(result) {
  if (!result || typeof result !== 'object') return null;
  const signals = { _count: 0 };
  const list = Array.isArray(result.signals) ? result.signals : [];
  for (const item of list) {
    if (!item?.id) continue;
    signals[item.id] = {
      id: String(item.id),
      area: String(item.area || ''),
      level: item.level === 'act' ? 'act' : 'watch',
      evidence: plainEvidence(item.evidence) ?? {},
    };
    signals._count += 1;
  }
  return {
    version: result.version || 'sfv-1',
    level: result.level === 'act' || result.level === 'watch' ? result.level : 'none',
    signals,
  };
}

/**
 * @param {unknown} raw
 */
export function decodeSafetyFromRtdb(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.signals && typeof raw.signals === 'object' ? raw.signals : {};
  const signals = Object.keys(source)
    .filter((key) => key !== '_count')
    .sort()
    .map((key) => {
      const item = source[key] || {};
      return {
        id: String(item.id || key),
        area: String(item.area || ''),
        level: item.level === 'act' ? 'act' : 'watch',
        evidence: plainEvidence(item.evidence) ?? {},
      };
    });
  const level = raw.level === 'act' || raw.level === 'watch'
    ? raw.level
    : 'none';
  return {
    version: raw.version || 'sfv-1',
    level,
    signals,
    suppressNumbers: signals.some((item) => item.id === 'restrictive_pattern'),
  };
}

function plainEvidence(value) {
  if (Array.isArray(value)) {
    return value.map((item) => plainEvidence(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const next = plainEvidence(item);
      if (next === undefined) continue;
      out[key] = next;
    }
    return out;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return undefined;
}
