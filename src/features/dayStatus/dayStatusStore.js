/**
 * Lettura e scrittura di users/{uid}/day_status/{data}.
 * Il database si inietta: questo modulo non apre Firebase da solo.
 */

import { get, ref, set } from 'firebase/database';
import {
  buildDayStatusRecord,
  dayStatusPath,
  isIsoDate,
  normalizeDayStatusRecord,
} from './dayStatusRecord.js';

/**
 * @param {{ db: object, uid: string }} deps
 */
export function createDayStatusStore({ db, uid }) {
  if (!db) throw new Error('db mancante');
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  return {
    async read(date) {
      if (!isIsoDate(date)) return null;
      const snap = await get(ref(db, dayStatusPath(id, date)));
      if (!snap.exists()) return null;
      return normalizeDayStatusRecord(snap.val());
    },

    async write(date, input) {
      if (!isIsoDate(date)) throw new Error('data non valida');
      const record = buildDayStatusRecord(input);
      await set(ref(db, dayStatusPath(id, date)), record);
      return record;
    },
  };
}
