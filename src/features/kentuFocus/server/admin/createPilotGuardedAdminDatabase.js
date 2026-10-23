/**
 * P6.11c/e — Wrapper Admin RTDB con guard path (read/write separati).
 *
 * P6.11e: nessun accesso al database grezzo (`_inner` rimosso).
 * `ref.parent` / `ref.root` → deny esplicito (nessun escape a reference non protette).
 *
 * Metodi protetti (usati da AdminRtdbFocusPersistence / AdminRtdbTrackerReader):
 * - db.ref(path)
 * - ref.get / ref.once('value')
 * - ref.transaction
 * - ref.update (single-path relative + multi-path assoluto da ref())
 * - ref.orderByKey / startAt / endAt / limitToLast (poi get)
 *
 * Limite: wrapper applicativo. Non sostituisce IAM. Non confina la credenziale SA.
 * Rules RTDB non limitano Admin SDK.
 */

import { createFocusPilotPathGuard } from './focusPilotPathGuard.js';

export const FOCUS_PILOT_GUARDED_DB_KIND = 'FocusPilotGuardedAdminDatabase';

/**
 * @param {string} basePath — '' per root
 * @param {string} relativeKey
 */
function joinPath(basePath, relativeKey) {
  const rel = String(relativeKey || '');
  if (!basePath) return rel;
  if (!rel) return basePath;
  return `${basePath}/${rel}`;
}

/**
 * @param {object} pilotContext
 * @param {object} innerDb — mock o Database Admin (solo closure; mai esposto)
 * @returns {Readonly<object>}
 */
export function createPilotGuardedAdminDatabase(pilotContext, innerDb) {
  if (!innerDb || typeof innerDb.ref !== 'function') {
    throw new Error('createPilotGuardedAdminDatabase: innerDb.ref richiesto');
  }
  const guard = createFocusPilotPathGuard(pilotContext);

  function deny(error, path) {
    const err = new Error(error);
    err.code = error;
    err.pilotPath = path || null;
    throw err;
  }

  function assertReadOrThrow(path) {
    const gate = guard.assertRead(path);
    if (!gate.ok) deny(gate.error || 'pilot_path_read_forbidden', path);
  }

  function assertWriteOrThrow(path) {
    const gate = guard.assertWrite(path);
    if (!gate.ok) deny(gate.error || 'pilot_path_write_forbidden', path);
  }

  /**
   * @param {string} absolutePath
   * @param {{ orderByKey?: boolean, startAt?: unknown, endAt?: unknown, limitToLast?: number }} query
   */
  function makeGuardedRef(absolutePath, query = {}) {
    const path = absolutePath == null ? '' : String(absolutePath);

    function underlying() {
      // Root ref (path '') supportato solo per update multi-path
      if (path === '') return innerDb.ref();
      return innerDb.ref(path);
    }

    const refApi = {
      get: async () => {
        if (path === '') deny('pilot_path_root_read_forbidden', path);
        assertReadOrThrow(path);
        let r = underlying();
        if (query.orderByKey && typeof r.orderByKey === 'function') {
          r = r.orderByKey();
          if (query.startAt != null && typeof r.startAt === 'function') {
            r = r.startAt(query.startAt);
          }
          if (query.endAt != null && typeof r.endAt === 'function') {
            r = r.endAt(query.endAt);
          }
          if (query.limitToLast != null && typeof r.limitToLast === 'function') {
            r = r.limitToLast(query.limitToLast);
          }
        }
        return r.get();
      },

      once: async (event) => {
        if (event !== 'value') {
          deny('pilot_ref_once_event_forbidden', path);
        }
        if (path === '') deny('pilot_path_root_read_forbidden', path);
        assertReadOrThrow(path);
        const r = underlying();
        if (typeof r.once === 'function') return r.once('value');
        return r.get();
      },

      transaction: async (updateFn, onComplete, applyLocally) => {
        if (path === '') deny('pilot_path_root_write_forbidden', path);
        assertWriteOrThrow(path);
        const r = underlying();
        return r.transaction(updateFn, onComplete, applyLocally);
      },

      update: async (patch) => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          deny('pilot_multipath_invalid', path);
        }
        if (path === '') {
          const gate = guard.assertMultiPathWrite(patch);
          if (!gate.ok) {
            deny(gate.error || 'pilot_multipath_forbidden', gate.rejectedPath || path);
          }
          return underlying().update(patch);
        }
        /** @type {Record<string, unknown>} */
        const absoluteMap = {};
        for (const [key, value] of Object.entries(patch)) {
          const abs = joinPath(path, key);
          assertWriteOrThrow(abs);
          absoluteMap[abs] = value;
        }
        return innerDb.ref().update(absoluteMap);
      },

      set: async (value) => {
        if (path === '') deny('pilot_path_root_write_forbidden', path);
        assertWriteOrThrow(path);
        const r = underlying();
        if (typeof r.set !== 'function') {
          deny('pilot_ref_set_unsupported', path);
        }
        return r.set(value);
      },

      remove: async () => {
        if (path === '') deny('pilot_path_root_write_forbidden', path);
        assertWriteOrThrow(path);
        const r = underlying();
        if (typeof r.remove !== 'function') {
          deny('pilot_ref_remove_unsupported', path);
        }
        return r.remove();
      },

      push: () => {
        deny('pilot_ref_push_forbidden', path);
      },

      child: (childPath) => {
        const joined = joinPath(path, String(childPath || ''));
        return makeGuardedRef(joined, {});
      },

      on: () => {
        deny('pilot_ref_on_forbidden', path);
      },

      orderByKey: () => makeGuardedRef(path, { ...query, orderByKey: true }),
      startAt: (v) => makeGuardedRef(path, { ...query, startAt: v }),
      endAt: (v) => makeGuardedRef(path, { ...query, endAt: v }),
      limitToLast: (n) => makeGuardedRef(path, { ...query, limitToLast: n }),
    };

    // Deny esplicito: nessun escape a reference Admin non protette
    Object.defineProperty(refApi, 'parent', {
      enumerable: false,
      configurable: false,
      get() {
        deny('pilot_ref_parent_forbidden', path);
        return undefined;
      },
    });
    Object.defineProperty(refApi, 'root', {
      enumerable: false,
      configurable: false,
      get() {
        deny('pilot_ref_root_forbidden', path);
        return undefined;
      },
    });

    return Object.freeze(refApi);
  }

  const guardedDb = {
    kind: FOCUS_PILOT_GUARDED_DB_KIND,
    pilotUid: guard.pilotUid,
    publicationDate: guard.publicationDate,
    pathGuard: guard,
    /**
     * @param {string} [path]
     */
    ref(path) {
      if (path == null || path === '') {
        return makeGuardedRef('', {});
      }
      return makeGuardedRef(String(path), {});
    },
  };

  // Nessuna proprietà per il db grezzo; freeze impedisce assegnazioni successive
  return Object.freeze(guardedDb);
}

/**
 * Elenco metodi DB protetti / deny dal wrapper (documentazione / STOP).
 */
export const FOCUS_PILOT_GUARDED_DB_METHODS = Object.freeze([
  'ref',
  'ref.get',
  'ref.once',
  'ref.transaction',
  'ref.update',
  'ref.set',
  'ref.remove',
  'ref.push',
  'ref.child',
  'ref.on',
  'ref.parent',
  'ref.root',
  'ref.orderByKey',
  'ref.startAt',
  'ref.endAt',
  'ref.limitToLast',
]);

/**
 * Superfici Admin tipiche fuori dal wrapper (non usate dal path pilota).
 */
export const FOCUS_PILOT_ADMIN_METHODS_UNCOVERED = Object.freeze([
  'ref.toString',
  'goOffline / goOnline',
  'app.options mutation',
  'direct REST / emulator HTTP bypassing db.ref',
]);
