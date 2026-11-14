/**
 * Check-in del mattino: «Ieri quanto hai camminato?».
 * Il valore è una stima. Un movimento già nel diario dello stesso giorno ha la precedenza.
 */

import { get, ref, set } from 'firebase/database';
import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';
import { MOVEMENT_CURVE } from './scoreConfig.kds-3.js';

export const WALK_CHECKIN_OPTIONS = Object.freeze([
  { id: 'poco', label: 'Poco', minutes: MOVEMENT_CURVE.checkInMinutes.poco },
  { id: 'mezzora', label: 'Circa mezz’ora', minutes: MOVEMENT_CURVE.checkInMinutes.mezzora },
  { id: 'ora', label: 'Un’ora o più', minutes: MOVEMENT_CURVE.checkInMinutes.ora },
]);

const BY_ID = new Map(WALK_CHECKIN_OPTIONS.map((option) => [option.id, option]));

export function movementCheckinPath(uid, date) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  if (!isIsoDate(date)) throw new Error('data non valida');
  return `users/${id}/movement_checkin/${date}`;
}

export function encodeMovementCheckin(input) {
  const option = BY_ID.get(String(input?.walked || ''));
  if (!option) throw new Error('risposta non valida');
  return {
    walked: option.id,
    minutes: option.minutes,
    estimated: true,
    answeredAt: Number(input?.answeredAt) || Date.now(),
  };
}

export function decodeMovementCheckin(raw, date) {
  if (!raw || typeof raw !== 'object') return null;
  const option = BY_ID.get(raw.walked);
  if (!option) return null;
  return {
    date: date || null,
    walked: option.id,
    minutes: option.minutes,
    estimated: true,
    answeredAt: Number(raw.answeredAt) || null,
  };
}

export function createMovementCheckinStore({ db, uid }) {
  if (!db) throw new Error('db mancante');
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  return {
    async readAll() {
      const snap = await get(ref(db, `users/${id}/movement_checkin`));
      if (!snap.exists()) return {};
      const raw = snap.val() || {};
      const out = {};
      for (const date of Object.keys(raw)) {
        const decoded = decodeMovementCheckin(raw[date], date);
        if (decoded) out[date] = decoded;
      }
      return out;
    },

    async write(date, walked) {
      const payload = encodeMovementCheckin({ walked, answeredAt: Date.now() });
      await set(ref(db, movementCheckinPath(id, date)), payload);
      return decodeMovementCheckin(payload, date);
    },
  };
}

export function forzaSettingPath(uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');
  return `users/${id}/cylinders/forza/enabled`;
}
