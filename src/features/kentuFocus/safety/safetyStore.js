/**
 * Lettura e scrittura di users/{uid}/safety_status/{data}.
 */

import { get, ref, set } from 'firebase/database';
import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';
import { computeSafety } from './computeSafety.js';
import {
  decodeSafetyFromRtdb,
  encodeSafetyForRtdb,
  safetyStatusPath,
} from './safetyRecord.js';

/**
 * @param {{ db: object, uid: string }} deps
 */
export function createSafetyStore({ db, uid }) {
  if (!db) throw new Error('db mancante');
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  return {
    async read(date) {
      if (!isIsoDate(date)) return null;
      const snap = await get(ref(db, safetyStatusPath(id, date)));
      if (!snap.exists()) return null;
      return decodeSafetyFromRtdb(snap.val());
    },

    async write(date, record) {
      if (!isIsoDate(date)) throw new Error('data non valida');
      const payload = encodeSafetyForRtdb(record);
      await set(ref(db, safetyStatusPath(id, date)), payload);
      return decodeSafetyFromRtdb(payload);
    },
  };
}

/**
 * Riscrive il giorno quando il salvavita calcolato non coincide con quello salvato.
 *
 * @param {{ read: Function, write: Function }} store
 * @param {string} date
 * @param {object} context
 */
export async function persistSafetyStatus(store, date, context = {}) {
  const fresh = computeSafety(date, context);
  const existing = await store.read(date);
  if (existing && sameSafety(existing, fresh)) {
    return { record: existing, wrote: false };
  }
  const stored = await store.write(date, fresh);
  return { record: stored || fresh, wrote: true };
}

function sameSafety(a, b) {
  return JSON.stringify(encodeSafetyForRtdb(a)) === JSON.stringify(encodeSafetyForRtdb(b));
}
