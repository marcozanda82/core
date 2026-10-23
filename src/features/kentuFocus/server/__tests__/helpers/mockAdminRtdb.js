/**
 * Mock minimo Firebase Admin RTDB per test offline (nessuna rete).
 * Supporta get/transaction/update e query orderByKey/limitToLast usate da listArchiveIndex.
 * `update` con path annidati (es. jobs/{date}/status) fa merge sul nodo padre, come RTDB.
 */

/**
 * @param {Record<string, unknown>} parent
 * @param {string[]} pathParts
 * @param {unknown} value
 */
function setDeep(parent, pathParts, value) {
  let cursor = parent;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const key = pathParts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  const leaf = pathParts[pathParts.length - 1];
  if (value === null) delete cursor[leaf];
  else cursor[leaf] = structuredClone(value);
}

/**
 * @param {Map<string, unknown>} store
 * @param {string} path
 * @param {unknown} value
 */
function applyPathWrite(store, path, value) {
  const absolute = String(path || '');
  if (!absolute) return;
  const parts = absolute.split('/').filter(Boolean);
  for (let len = parts.length - 1; len >= 1; len -= 1) {
    const parentPath = parts.slice(0, len).join('/');
    if (!store.has(parentPath)) continue;
    const parentVal = store.get(parentPath);
    if (!parentVal || typeof parentVal !== 'object' || Array.isArray(parentVal)) continue;
    const parent = structuredClone(parentVal);
    setDeep(parent, parts.slice(len), value);
    store.set(parentPath, parent);
    return;
  }
  if (value === null) store.delete(absolute);
  else store.set(absolute, structuredClone(value));
}

/**
 * @param {Record<string, unknown>} [seed]
 */
export function createMockAdminRtdb(seed = {}) {
  /** @type {Map<string, unknown>} */
  const store = new Map(Object.entries(seed));

  function snapOf(path) {
    const exists = store.has(path) && store.get(path) != null;
    return {
      exists: () => exists,
      val: () => (exists ? structuredClone(store.get(path)) : null),
    };
  }

  /**
   * @param {string} rootPath
   * @param {{ startAt?: string, endAt?: string, limitToLast?: number }} query
   */
  function querySnap(rootPath, query = {}) {
    const prefix = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
    let keys = [...store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .filter((child) => child && !child.includes('/'))
      .sort();

    if (query.startAt != null) keys = keys.filter((k) => k >= query.startAt);
    if (query.endAt != null) keys = keys.filter((k) => k <= query.endAt);
    if (query.limitToLast != null) {
      keys = keys.slice(Math.max(0, keys.length - Number(query.limitToLast)));
    }

    const rows = keys.map((child) => ({
      key: child,
      val: () => structuredClone(store.get(`${prefix}${child}`)),
    }));

    return {
      exists: () => rows.length > 0,
      val: () => {
        if (!rows.length) return null;
        /** @type {Record<string, unknown>} */
        const out = {};
        for (const row of rows) out[row.key] = row.val();
        return out;
      },
      forEach: (fn) => {
        for (const row of rows) {
          fn({ key: row.key, val: row.val });
        }
      },
    };
  }

  function makeRef(path, query = {}) {
    const absolute = String(path || '');
    return {
      get: async () => {
        if (query.orderByKey) return querySnap(absolute, query);
        return snapOf(absolute);
      },
      orderByKey: () => makeRef(absolute, { ...query, orderByKey: true }),
      startAt: (v) => makeRef(absolute, { ...query, startAt: v }),
      endAt: (v) => makeRef(absolute, { ...query, endAt: v }),
      limitToLast: (n) => makeRef(absolute, { ...query, limitToLast: n }),
      /**
       * @param {(current: unknown) => unknown} updateFn
       */
      transaction: async (updateFn) => {
        const proposed = updateFn(null);
        if (proposed === undefined) {
          return {
            committed: false,
            snapshot: snapOf(absolute),
          };
        }
        if (proposed === null) {
          store.delete(absolute);
        } else {
          store.set(absolute, structuredClone(proposed));
        }
        return {
          committed: true,
          snapshot: snapOf(absolute),
        };
      },
      update: async (patch) => {
        for (const [key, value] of Object.entries(patch || {})) {
          applyPathWrite(store, key, value);
        }
      },
    };
  }

  return {
    /** @param {string} path */
    ref(path) {
      return makeRef(path);
    },
    _get(path) {
      return store.has(path) ? structuredClone(store.get(path)) : undefined;
    },
    _set(path, value) {
      store.set(path, structuredClone(value));
    },
    _store: store,
  };
}
