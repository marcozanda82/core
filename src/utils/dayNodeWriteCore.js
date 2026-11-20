/**
 * Merge/rev puri del nodo giorno (senza Firebase client).
 * Usato dal client (dayNodeWrite.js) e dal MCP Admin (dayWriteAdmin.js).
 */

const trackerStoricoKey = (date) => `trackerStorico_${String(date || '').trim()}`;
const REV_META_KEYS = new Set(['rev', 'revBy', 'revAt', 'writeProtocol']);
/** Chiavi di controllo merge: non vanno persistite sul nodo. */
const MERGE_CONTROL_KEYS = new Set(['logDeleteIds', 'manualNodesDeleteIds']);
/** Liste voci: mai sostituire con un array più corto senza delete espliciti. */
const ENTRY_LIST_KEYS = Object.freeze({
  log: 'logDeleteIds',
  manualNodes: 'manualNodesDeleteIds',
});

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
 * Id stabile di una voce log / manualNode (meal → mealId, altrimenti id).
 * @param {unknown} row
 * @returns {string|null}
 */
export function dayEntryKey(row) {
  if (!row || typeof row !== 'object') return null;
  const mealId = row.mealId;
  if (mealId != null && String(mealId).trim()) return String(mealId).trim();
  const id = row.id;
  if (id != null && String(id).trim()) return String(id).trim();
  return null;
}

/**
 * Normalizza una lista voci (array o mappa Firebase) in array.
 * @param {unknown} list
 * @returns {object[]}
 */
export function coerceEntryList(list) {
  if (Array.isArray(list)) return list.filter((row) => row && typeof row === 'object');
  if (list && typeof list === 'object') {
    return Object.values(list).filter((row) => row && typeof row === 'object');
  }
  return [];
}

/**
 * Merge per id: server ∪ client (client vince sui campi della stessa voce).
 * Le voci solo sul server restano. Remozioni solo via deleteIds espliciti.
 * @param {unknown} serverList
 * @param {unknown} clientList
 * @param {unknown} deleteIds
 * @returns {object[]}
 */
export function mergeEntryListsById(serverList, clientList, deleteIds = null) {
  const del = new Set(
    (Array.isArray(deleteIds) ? deleteIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {string[]} */
  const order = [];
  /** @type {object[]} */
  const anon = [];

  const take = (row, preferClient) => {
    const key = dayEntryKey(row);
    if (!key) {
      anon.push(row);
      return;
    }
    if (del.has(key)) return;
    if (byId.has(key)) {
      byId.set(key, preferClient ? { ...byId.get(key), ...row } : byId.get(key));
      return;
    }
    byId.set(key, row);
    order.push(key);
  };

  for (const row of coerceEntryList(serverList)) take(row, false);
  for (const row of coerceEntryList(clientList)) take(row, true);

  return [...order.map((key) => byId.get(key)), ...anon];
}

/**
 * Confronto profondo stabile (ordine chiavi irrilevante).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function dayValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  return stableDayJson(a) === stableDayJson(b);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableDayJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableDayJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableDayJson(value[k])}`).join(',')}}`;
}

/**
 * True se applicare `patchFields` sul nodo server non cambierebbe nessun campo gestito
 * (merge-by-id per log/manualNodes). Usato per non bumpare `rev` a vuoto.
 * @param {Record<string, unknown>|null|undefined} current
 * @param {Record<string, unknown>} patchFields
 * @returns {boolean}
 */
export function managedPatchIsNoop(current, patchFields) {
  if (current == null || typeof current !== 'object') return false;
  const managed = sanitizeDayPatch(patchFields);
  const keys = Object.keys(managed);
  if (keys.length === 0) return true;

  const logDeletes = Array.isArray(managed.logDeleteIds)
    ? managed.logDeleteIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const manualDeletes = Array.isArray(managed.manualNodesDeleteIds)
    ? managed.manualNodesDeleteIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (logDeletes.length > 0 || manualDeletes.length > 0) return false;

  for (const [key, value] of Object.entries(managed)) {
    if (MERGE_CONTROL_KEYS.has(key)) continue;

    if (key === 'log' || key === 'manualNodes') {
      const deleteKey = ENTRY_LIST_KEYS[key];
      const merged = mergeEntryListsById(current[key], value, managed[deleteKey]);
      if (!dayValuesEqual(merged, coerceEntryList(current[key]))) return false;
      continue;
    }

    if (key === 'mealTimes') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        if (!dayValuesEqual(value, current.mealTimes)) return false;
        continue;
      }
      const prev = current.mealTimes && typeof current.mealTimes === 'object' && !Array.isArray(current.mealTimes)
        ? current.mealTimes
        : {};
      const next = { ...prev, ...value };
      if (!dayValuesEqual(next, prev)) return false;
      continue;
    }

    // null in patch = delete chiave RTDB
    if (value === null) {
      if (current[key] != null) return false;
      continue;
    }

    if (!dayValuesEqual(value, current[key])) return false;
  }
  return true;
}

/**
 * Patch sicuro: niente meta rev/writeProtocol (li scrive solo il merge) e niente undefined.
 * Consente logDeleteIds / manualNodesDeleteIds (strip al merge, non persistiti).
 * @param {Record<string, unknown>} payload
 */
export function sanitizeDayPatch(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (REV_META_KEYS.has(key) || key.startsWith('_') || value === undefined) continue;
    // null su liste voci = ometti (non cancellare la chiave sul server via spread)
    if ((key === 'log' || key === 'manualNodes') && value == null) continue;
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
    /** @type {Record<string, unknown>} */
    const seed = { ...managed };
    for (const [listKey, deleteKey] of Object.entries(ENTRY_LIST_KEYS)) {
      if (!Object.prototype.hasOwnProperty.call(managed, listKey)) continue;
      seed[listKey] = mergeEntryListsById(null, managed[listKey], managed[deleteKey]);
    }
    for (const key of MERGE_CONTROL_KEYS) delete seed[key];
    return {
      ok: true,
      next: {
        ...seed,
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
  /** @type {Record<string, unknown>} */
  const applied = { ...managed };
  for (const [listKey, deleteKey] of Object.entries(ENTRY_LIST_KEYS)) {
    if (!Object.prototype.hasOwnProperty.call(managed, listKey)) continue;
    applied[listKey] = mergeEntryListsById(
      current[listKey],
      managed[listKey],
      managed[deleteKey],
    );
  }
  for (const key of MERGE_CONTROL_KEYS) {
    delete applied[key];
  }

  // mealTimes: unione per chiave (non azzerare orari presenti sul server)
  if (
    Object.prototype.hasOwnProperty.call(managed, 'mealTimes')
    && managed.mealTimes
    && typeof managed.mealTimes === 'object'
    && !Array.isArray(managed.mealTimes)
  ) {
    const prevTimes = current.mealTimes && typeof current.mealTimes === 'object' && !Array.isArray(current.mealTimes)
      ? current.mealTimes
      : {};
    applied.mealTimes = { ...prevTimes, ...managed.mealTimes };
    const logDeletes = Array.isArray(managed.logDeleteIds) ? managed.logDeleteIds : [];
    for (const id of logDeletes) {
      const k = String(id || '').trim();
      if (k && Object.prototype.hasOwnProperty.call(applied.mealTimes, k)) {
        delete applied.mealTimes[k];
      }
    }
  }

  return {
    ok: true,
    next: {
      ...current,
      ...applied,
      rev: nextRev,
      revBy: uid || current.revBy || null,
      revAt: now,
      writeProtocol: DAY_WRITE_PROTOCOL,
    },
  };
}

export function diffRemovedEntryIds(beforeList, afterList) {
  const afterKeys = new Set(
    coerceEntryList(afterList).map((row) => dayEntryKey(row)).filter(Boolean),
  );
  const out = [];
  for (const row of coerceEntryList(beforeList)) {
    const key = dayEntryKey(row);
    if (key && !afterKeys.has(key)) out.push(key);
  }
  return [...new Set(out)];
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
