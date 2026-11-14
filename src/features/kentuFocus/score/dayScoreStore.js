/**
 * Lettura e scrittura di users/{uid}/focus_day_scores/{data}.
 * Fino al lancio un metodo nuovo riscrive il giorno. Dopo il lancio solo a parità di versione.
 */

import { get, ref, set } from 'firebase/database';
import { isIsoDate } from '../../dayStatus/dayStatusRecord.js';
import { computeDayScore } from './computeDayScore.js';
import {
  dayScorePath,
  decodeDayScoreFromRtdb,
  encodeDayScoreForRtdb,
} from './dayScoreRecord.js';
import { HISTORY_LOCKED } from './scoreConfig.kds-3.js';

/**
 * @param {{ db: object, uid: string }} deps
 */
export function createDayScoreStore({ db, uid }) {
  if (!db) throw new Error('db mancante');
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  return {
    async read(date) {
      if (!isIsoDate(date)) return null;
      const snap = await get(ref(db, dayScorePath(id, date)));
      if (!snap.exists()) return null;
      return decodeDayScoreFromRtdb(snap.val());
    },

    async write(date, record) {
      if (!isIsoDate(date)) throw new Error('data non valida');
      const payload = encodeDayScoreForRtdb(record);
      await set(ref(db, dayScorePath(id, date)), payload);
      return decodeDayScoreFromRtdb(payload);
    },
  };
}

/**
 * Fino al lancio (HISTORY_LOCKED = false) un metodo nuovo riscrive lo storico.
 * Dopo il lancio una versione diversa resta dov'è: la migrazione è un altro modulo.
 *
 * @param {{ read: Function, write: Function }} store
 * @param {string} date
 * @param {object} context
 */
export async function persistDayScore(store, date, context = {}) {
  const fresh = computeDayScore(date, context);
  const existing = await store.read(date);
  const locked = context.historyLocked === true || HISTORY_LOCKED;
  if (locked && existing?.version && existing.version !== fresh.version) {
    return { record: existing, wrote: false, needsMigration: true };
  }
  if (existing && existing.version === fresh.version && existing.dataVersion === fresh.dataVersion) {
    return { record: existing, wrote: false, needsMigration: false };
  }
  const record = {
    version: fresh.version,
    score: fresh.score,
    reliability: fresh.reliability,
    cylinders: fresh.cylinders,
    dataVersion: fresh.dataVersion,
  };
  const stored = await store.write(date, record);
  return { record: stored || record, wrote: true, needsMigration: false };
}
