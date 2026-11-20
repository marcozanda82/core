/**
 * Scrittura nodo giorno via Admin SDK: stesso merge-by-id / rev del client
 * (`mergeDayNodeWrite`), senza sostituire l’intero log.
 */

import {
  mergeDayNodeWrite,
  DAY_WRITE_PROTOCOL,
} from '../../src/utils/dayNodeWriteCore.js';

export { DAY_WRITE_PROTOCOL, mergeDayNodeWrite };

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} dateStr YYYY-MM-DD
 * @param {Record<string, unknown>} managedFields
 * @param {{ now?: number, maxRetries?: number }} [opts]
 * @returns {Promise<{ node: object, rev: number, attempts: number }>}
 */
export async function saveDayNodeWithRevAdmin(db, uid, dateStr, managedFields, opts = {}) {
  const id = String(uid || '').trim();
  const date = String(dateStr || '').trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('uid/date non validi per scrittura giorno');
  }
  const maxRetries = Number.isFinite(Number(opts.maxRetries))
    ? Math.max(1, Math.floor(Number(opts.maxRetries)))
    : 5;
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const path = `users/${id}/tracker_data/trackerStorico_${date}`;
  const ref = db.ref(path);

  let attempts = 0;
  let lastConflict = null;

  while (attempts < maxRetries) {
    attempts += 1;
    const snap = await ref.get();
    const current = snap.exists() ? snap.val() : null;
    const expectedRev = current && Number.isFinite(Number(current.rev))
      ? Number(current.rev)
      : null;

    const tx = await ref.transaction((live) => {
      const merged = mergeDayNodeWrite(live, managedFields, {
        expectedRev,
        uid: id,
        now,
      });
      if (!merged.ok) {
        lastConflict = merged;
        return undefined;
      }
      return merged.next;
    });

    if (tx.committed) {
      const node = tx.snapshot.exists() ? tx.snapshot.val() : {};
      return { node, rev: Number(node.rev) || 0, attempts };
    }
  }

  const err = new Error(
    lastConflict?.conflict
      ? 'Conflitto rev sul giorno: riprova.'
      : 'Scrittura giorno non riuscita.',
  );
  err.code = lastConflict?.conflict ? 'day_rev_conflict' : 'day_write_failed';
  throw err;
}
