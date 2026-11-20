/**
 * Scrittura del nodo giorno (trackerStorico_YYYY-MM-DD) con controllo di versione.
 *
 * Tutte le scritture client sul giorno devono passare da qui: la transazione fonde
 * solo i campi indicati, incrementa `rev` e lascia intatto il resto.
 * Le regole RTDB accettano: nodo nuovo → rev===1; legacy senza rev → rev===1;
 * aggiornamento → rev === data.rev + 1. Serve anche writeProtocol === DAY_WRITE_PROTOCOL.
 * Un set() senza rev/protocol resta rifiutato.
 */

import { get, ref, runTransaction } from 'firebase/database';
import {
  DAY_WRITE_PROTOCOL,
  CLIENT_MANAGED_DAY_FIELDS,
  DayNodeConflictError,
  isDayNodePermissionDenied,
  isDayNodeOfflineError,
  classifyDayWriteError,
  dayEntryKey,
  coerceEntryList,
  mergeEntryListsById,
  dayValuesEqual,
  managedPatchIsNoop,
  sanitizeDayPatch,
  pickClientManagedDayFields,
  mergeDayNodeWrite,
  diffRemovedEntryIds,
  collectDayEntryIds,
} from './dayNodeWriteCore.js';

export {
  DAY_WRITE_PROTOCOL,
  CLIENT_MANAGED_DAY_FIELDS,
  DayNodeConflictError,
  isDayNodePermissionDenied,
  isDayNodeOfflineError,
  classifyDayWriteError,
  dayEntryKey,
  coerceEntryList,
  mergeEntryListsById,
  dayValuesEqual,
  managedPatchIsNoop,
  sanitizeDayPatch,
  pickClientManagedDayFields,
  mergeDayNodeWrite,
  diffRemovedEntryIds,
  collectDayEntryIds,
};

const trackerStoricoKey = (date) => `trackerStorico_${String(date || '').trim()}`;

/**
 * @param {{ db: import('firebase/database').Database, uid: string, dateStr: string, managedFields: object, expectedRev?: number|null }} input
 * @returns {Promise<{ node: object, rev: number, conflict: false, skipped?: boolean }>}
 */
export async function saveDayNodeWithRev({
  db,
  uid,
  dateStr,
  managedFields,
  expectedRev = null,
}) {
  const id = String(uid || '').trim();
  const date = String(dateStr || '').trim();
  if (!db || !id || !date) {
    throw new Error('saveDayNodeWithRev: parametri mancanti');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err = new Error('offline');
    err.code = 'unavailable';
    throw err;
  }
  const dbPath = `users/${id}/tracker_data/${trackerStoricoKey(date)}`;
  const dayRef = ref(db, dbPath);

  // Scalda la cache locale: senza get(), la prima passata della transazione vede
  // spesso `null` e propone rev=1 (o expected+1) contro un nodo già a rev N →
  // le regole rispondono permission_denied e l'SDK non ritenta.
  const warm = await get(dayRef);
  const warmed = warm.exists() ? warm.val() : null;
  const warmedRevNum = Number(warmed?.rev);
  const warmedHasRev = Number.isFinite(warmedRevNum) && warmedRevNum > 0;
  let effectiveExpected = expectedRev;
  if (
    (effectiveExpected == null || effectiveExpected === '')
    && warmedHasRev
  ) {
    effectiveExpected = warmedRevNum;
  }

  // Nessun bump rev se i campi gestiti sono già allineati al server.
  if (warmed && managedPatchIsNoop(warmed, managedFields)) {
    return {
      node: warmed,
      rev: warmedHasRev ? warmedRevNum : 1,
      conflict: false,
      skipped: true,
    };
  }

  let conflictRemote = null;
  let conflictRev = null;

  const result = await runTransaction(dayRef, (current) => {
    // Race: tra get() e txn il nodo può essere già allineato.
    if (current && typeof current === 'object' && managedPatchIsNoop(current, managedFields)) {
      return; // abort senza scrivere
    }
    const merged = mergeDayNodeWrite(current, managedFields, {
      expectedRev: effectiveExpected,
      uid: id,
      now: Date.now(),
    });
    if (!merged.ok) {
      conflictRemote = current && typeof current === 'object' ? current : null;
      conflictRev = merged.currentRev;
      return; // abort
    }
    return merged.next;
  });

  if (!result.committed) {
    const remote = conflictRemote
      || (result.snapshot?.exists?.() ? result.snapshot.val() : null)
      || warmed;
    // Abort per noop in-txn: non è un conflitto.
    if (remote && managedPatchIsNoop(remote, managedFields)) {
      return {
        node: remote,
        rev: Number(remote?.rev) || 1,
        conflict: false,
        skipped: true,
      };
    }
    throw new DayNodeConflictError({
      dateStr: date,
      currentRev: conflictRev ?? (remote?.rev ?? null),
      expectedRev: effectiveExpected,
      remote,
    });
  }

  const node = result.snapshot.val();
  return {
    node,
    rev: Number(node?.rev) || 1,
    conflict: false,
    skipped: false,
  };
}

/**
 * In caso di conflitto o permission_denied rilegge e **riapplica lo stesso patch**
 * con la rev fresca. Per log/manualNodes il merge è per id sul dato fresco
 * (non sostituzione dell'array completo → niente wipe di voci altrui).
 * @param {{ db: import('firebase/database').Database, uid: string, dateStr: string, managedFields: object, expectedRev?: number|null }} input
 * @param {{ maxAttempts?: number }} [opts]
 */
export async function saveDayNodeWithRevRetry(input, opts = {}) {
  const maxAttempts = Math.max(1, Math.min(8, Number(opts.maxAttempts) || 3));
  let expectedRev = input.expectedRev;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await saveDayNodeWithRev({
        ...input,
        expectedRev,
      });
    } catch (err) {
      lastErr = err;
      if (isDayNodeOfflineError(err)) throw err;
      const conflict = err instanceof DayNodeConflictError || err?.code === 'day_rev_conflict';
      const denied = isDayNodePermissionDenied(err);
      if (!conflict && !denied) throw err;

      const remote = (conflict && err.remote) || await fetchDayNode({
        db: input.db,
        uid: input.uid,
        dateStr: input.dateStr,
      });
      expectedRev = remote?.rev ?? null;
      // stesso managedFields → merge-by-id sul dato fresco (log/manualNodes)
    }
  }
  throw lastErr;
}

/**
 * Rilegge un singolo giorno da Firebase (giorni passati / dopo conflitto).
 * @param {{ db: import('firebase/database').Database, uid: string, dateStr: string }} input
 */
export async function fetchDayNode({ db, uid, dateStr }) {
  const id = String(uid || '').trim();
  const date = String(dateStr || '').trim();
  if (!db || !id || !date) return null;
  const snap = await get(ref(db, `users/${id}/tracker_data/${trackerStoricoKey(date)}`));
  return snap.exists() ? snap.val() : null;
}
