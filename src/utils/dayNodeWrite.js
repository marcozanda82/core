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

const trackerStoricoKey = (date) => `trackerStorico_${String(date || '').trim()}`;
const REV_META_KEYS = new Set(['rev', 'revBy', 'revAt', 'writeProtocol']);

/** Protocollo scritture giorno richiesto dalle regole RTDB. */
export const DAY_WRITE_PROTOCOL = 1;

/**
 * Campi tipici del diario (documentazione / sync). Il patch può includere anche
 * dayTargetSnapshot, customTargets, ecc.: tutto tranne rev/revBy/revAt/writeProtocol.
 */
export const CLIENT_MANAGED_DAY_FIELDS = Object.freeze([
  'data',
  'log',
  'mealTimes',
  'manualNodes',
  'hasEditedNodes',
  'isIntentionalFast',
  'autopilotCorrection',
  'dayTargetSnapshot',
  'customTargets',
]);

export class DayNodeConflictError extends Error {
  /**
   * @param {{ dateStr?: string, currentRev?: number|null, expectedRev?: number|null, remote?: object|null }} [info]
   */
  constructor(info = {}) {
    super('Il giorno è stato modificato altrove (revisione non allineata).');
    this.name = 'DayNodeConflictError';
    this.code = 'day_rev_conflict';
    this.dateStr = info.dateStr || null;
    this.currentRev = info.currentRev ?? null;
    this.expectedRev = info.expectedRev ?? null;
    this.remote = info.remote ?? null;
  }
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDayNodePermissionDenied(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return code.includes('permission_denied')
    || code.includes('permission-denied')
    || message.includes('permission_denied')
    || message.includes('permission denied');
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDayNodeOfflineError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return code.includes('unavailable')
    || code.includes('network-request-failed')
    || message.includes('network error')
    || message.includes('offline')
    || message.includes('failed to fetch')
    || message.includes('socket hang up');
}

/**
 * @param {unknown} error
 * @returns {'conflict'|'permission'|'offline'|'outdated'|'unknown'}
 */
export function classifyDayWriteError(error) {
  if (error instanceof DayNodeConflictError || error?.code === 'day_rev_conflict') {
    return 'conflict';
  }
  if (isDayNodeOfflineError(error)) return 'offline';
  if (isDayNodePermissionDenied(error)) {
    // Dopo il deploy del writeProtocol, un deny tipico = client troppo vecchio.
    return 'outdated';
  }
  return 'unknown';
}

/**
 * Patch sicuro: niente meta rev/writeProtocol (li scrive solo il merge) e niente undefined.
 * @param {Record<string, unknown>} payload
 */
export function sanitizeDayPatch(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (REV_META_KEYS.has(key) || key.startsWith('_') || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** @deprecated usa sanitizeDayPatch — tenuto per i test esistenti */
export function pickClientManagedDayFields(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of CLIENT_MANAGED_DAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined) {
      out[key] = src[key];
    }
  }
  return out;
}

/**
 * Pure: fonde il patch nel nodo attuale e gestisce `rev`.
 * @param {Record<string, unknown>|null} current
 * @param {Record<string, unknown>} patchFields
 * @param {{ expectedRev?: number|null, uid?: string, now?: number }} [opts]
 * @returns {{ ok: true, next: object } | { ok: false, conflict: true, currentRev: number|null }}
 */
export function mergeDayNodeWrite(current, patchFields, opts = {}) {
  const managed = sanitizeDayPatch(patchFields);
  const uid = String(opts.uid || '').trim();
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const expectedRaw = opts.expectedRev;
  const expectedRev = expectedRaw == null || expectedRaw === ''
    ? null
    : Number(expectedRaw);

  if (current == null || typeof current !== 'object') {
    // Prima invocazione della transazione: spesso `null` anche se il nodo esiste.
    // Non abortire: il protocollo ritenta con i dati reali.
    // saveDayNodeWithRev fa get() prima per scaldare la cache e ridurre
    // permission_denied (rev proposta incompatibile con le regole).
    const seedRev = expectedRev != null && Number.isFinite(expectedRev) && expectedRev > 0
      ? Math.floor(expectedRev) + 1
      : 1;
    return {
      ok: true,
      next: {
        ...managed,
        rev: seedRev,
        revBy: uid || null,
        revAt: now,
        writeProtocol: DAY_WRITE_PROTOCOL,
      },
    };
  }

  const currentRevNum = Number(current.rev);
  const hasRev = Number.isFinite(currentRevNum) && currentRevNum > 0;

  if (hasRev) {
    if (expectedRev == null || !Number.isFinite(expectedRev) || expectedRev !== currentRevNum) {
      return { ok: false, conflict: true, currentRev: currentRevNum };
    }
  } else if (expectedRev != null && Number.isFinite(expectedRev) && expectedRev > 0) {
    return { ok: false, conflict: true, currentRev: null };
  }

  const nextRev = hasRev ? currentRevNum + 1 : 1;
  return {
    ok: true,
    next: {
      ...current,
      ...managed,
      rev: nextRev,
      revBy: uid || current.revBy || null,
      revAt: now,
      writeProtocol: DAY_WRITE_PROTOCOL,
    },
  };
}

/**
 * @param {{ db: import('firebase/database').Database, uid: string, dateStr: string, managedFields: object, expectedRev?: number|null }} input
 * @returns {Promise<{ node: object, rev: number, conflict: false }>}
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

  let conflictRemote = null;
  let conflictRev = null;

  const result = await runTransaction(dayRef, (current) => {
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
  };
}

/**
 * In caso di conflitto o permission_denied rilegge e **riapplica lo stesso patch**
 * con la rev fresca (la modifica utente non viene scartata).
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
      // stesso managedFields → riapplicazione sul dato fresco
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

/**
 * Id di voci log / nodi da marcare non salvati.
 * @param {unknown} log
 * @param {unknown} manualNodes
 * @returns {string[]}
 */
export function collectDayEntryIds(log, manualNodes) {
  const ids = [];
  const pushId = (row) => {
    const id = row?.id ?? row?.mealId;
    if (id != null && String(id).trim()) ids.push(String(id));
    if (Array.isArray(row?.items)) {
      for (const item of row.items) {
        const itemId = item?.id;
        if (itemId != null && String(itemId).trim()) ids.push(String(itemId));
      }
    }
  };
  const rows = Array.isArray(log) ? log : Object.values(log || {});
  rows.forEach(pushId);
  const nodes = Array.isArray(manualNodes) ? manualNodes : Object.values(manualNodes || {});
  nodes.forEach(pushId);
  return [...new Set(ids)];
}
