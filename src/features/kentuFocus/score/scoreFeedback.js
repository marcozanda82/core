/**
 * «Ti torna?» sul rapporto di ieri.
 * Il feedback si salva a parte e non rientra nel punteggio.
 */

import { get, ref, set } from 'firebase/database';
import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';

export const SCORE_FEEDBACK_ANSWERS = Object.freeze({
  yes: 'Sì',
  better: 'È andata meglio',
  worse: 'È andata peggio',
});

const ANSWER_IDS = new Set(Object.keys(SCORE_FEEDBACK_ANSWERS));
const CYLINDER_KEYS = ['alimentazione', 'sonno', 'movimento', 'forza', 'cardio'];
export const SCORE_FEEDBACK_REASON_MAX = 200;

export function scoreFeedbackPath(uid, date) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  if (!isIsoDate(date)) throw new Error('data non valida');
  return `users/${id}/score_feedback/${date}`;
}

/**
 * @param {object} input
 */
export function encodeScoreFeedback(input) {
  const answer = String(input?.answer || '');
  if (!ANSWER_IDS.has(answer)) throw new Error('risposta non valida');
  const reason = String(input?.reason || '').trim().slice(0, SCORE_FEEDBACK_REASON_MAX);
  const out = {
    answer,
    scoreVersion: String(input?.scoreVersion || ''),
    cylinders: encodeCylinders(input?.cylinders),
    answeredAt: Number(input?.answeredAt) || Date.now(),
  };
  if (reason) out.reason = reason;
  if (input?.score == null) out.scoreIsNull = true;
  else out.score = input.score;
  return out;
}

export function decodeScoreFeedback(raw, date) {
  if (!raw || typeof raw !== 'object') return null;
  const answer = ANSWER_IDS.has(raw.answer) ? raw.answer : null;
  if (!answer) return null;
  const score = raw.scoreIsNull === true || raw.score == null ? null : Number(raw.score);
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, SCORE_FEEDBACK_REASON_MAX) : '';
  return {
    date: date || null,
    answer,
    reason: reason || null,
    scoreVersion: raw.scoreVersion ?? null,
    score: Number.isFinite(score) ? score : null,
    cylinders: decodeCylinders(raw.cylinders),
    answeredAt: Number(raw.answeredAt) || null,
  };
}

/**
 * I disaccordi (meglio / peggio) raggruppati per tipo di giornata:
 * cilindro più basso e segnali attivi.
 * @param {object[]} entries
 */
export function groupDisagreements(entries) {
  const groups = new Map();
  for (const entry of entries || []) {
    if (!entry || entry.answer === 'yes') continue;
    const lowest = lowestCylinder(entry.cylinders);
    const signals = activeSignals(entry.cylinders);
    const key = `${lowest} · ${signals.length ? signals.join(', ') : 'nessun segnale'}`;
    const group = groups.get(key) || { key, lowest, signals, count: 0, dates: [] };
    group.count += 1;
    if (entry.date) group.dates.push(entry.date);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function createScoreFeedbackStore({ db, uid }) {
  if (!db) throw new Error('db mancante');
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  return {
    async read(date) {
      if (!isIsoDate(date)) return null;
      const snap = await get(ref(db, scoreFeedbackPath(id, date)));
      if (!snap.exists()) return null;
      return decodeScoreFeedback(snap.val(), date);
    },

    async readAll() {
      const snap = await get(ref(db, `users/${id}/score_feedback`));
      if (!snap.exists()) return [];
      const raw = snap.val() || {};
      return Object.keys(raw)
        .filter((date) => isIsoDate(date))
        .sort()
        .map((date) => decodeScoreFeedback(raw[date], date))
        .filter(Boolean);
    },

    async write(date, record) {
      if (!isIsoDate(date)) throw new Error('data non valida');
      const payload = encodeScoreFeedback({ ...record, answeredAt: record.answeredAt || Date.now() });
      await set(ref(db, scoreFeedbackPath(id, date)), payload);
      return decodeScoreFeedback(payload, date);
    },
  };
}

function encodeCylinders(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of CYLINDER_KEYS) {
    const cylinder = source[key] && typeof source[key] === 'object' ? source[key] : {};
    const encoded = {
      status: cylinder.status || 'no_data',
      keyFact: String(cylinder.keyFact || ''),
      signals: Array.isArray(cylinder.signals) ? cylinder.signals.map(String) : [],
    };
    const value = Number(cylinder.value);
    if (Number.isFinite(value)) encoded.value = value;
    out[key] = encoded;
  }
  return out;
}

function decodeCylinders(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of CYLINDER_KEYS) {
    const cylinder = source[key] && typeof source[key] === 'object' ? source[key] : {};
    const value = Number(cylinder.value);
    out[key] = {
      status: cylinder.status || 'no_data',
      keyFact: cylinder.keyFact || '',
      signals: Array.isArray(cylinder.signals) ? cylinder.signals.map(String) : [],
      value: Number.isFinite(value) ? value : null,
    };
  }
  return out;
}

function lowestCylinder(cylinders) {
  let bestKey = 'nessuno';
  let bestValue = Infinity;
  for (const key of CYLINDER_KEYS) {
    if (cylinders?.[key]?.value == null) continue;
    const value = Number(cylinders[key].value);
    if (!Number.isFinite(value)) continue;
    if (value < bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey;
}

function activeSignals(cylinders) {
  const found = new Set();
  for (const key of CYLINDER_KEYS) {
    const signals = cylinders?.[key]?.signals;
    if (!Array.isArray(signals)) continue;
    for (const signal of signals) found.add(String(signal));
  }
  return [...found].sort();
}
