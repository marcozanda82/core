/**
 * Lookup cataloghi Focus AI — O(1) per chiave, senza Object.keys sull’OFF.
 * Memo per foodDbKey entro una costruzione dossier.
 */

/**
 * True se l’oggetto ha almeno una chiave (senza materializzare Object.keys).
 * @param {object|null|undefined} db
 * @param {WeakMap<object, boolean>} [cache]
 */
export function catalogDbNonEmpty(db, cache) {
  if (!db || typeof db !== 'object') return false;
  if (cache instanceof WeakMap && cache.has(db)) return cache.get(db);
  let nonEmpty = false;
  // eslint-disable-next-line no-restricted-syntax
  for (const _k in db) {
    if (Object.prototype.hasOwnProperty.call(db, _k)) {
      nonEmpty = true;
      break;
    }
  }
  if (cache instanceof WeakMap) cache.set(db, nonEmpty);
  return nonEmpty;
}

/**
 * @param {object|null|undefined} catalogs
 * @returns {{
 *   lookup: (key: string) => { row: object, sourceLabel: string, layer: string }|null,
 *   dbNonEmpty: (db: object) => boolean,
 *   memoSize: () => number,
 * }}
 */
export function createFocusCatalogLookupSession(catalogs) {
  /** @type {Map<string, { row: object, sourceLabel: string, layer: string }|null>} */
  const memo = new Map();
  const emptyCache = new WeakMap();

  const layers = [
    { db: catalogs?.personalDb, label: 'personal' },
    { db: catalogs?.kentuItDb, label: 'crea' },
    { db: catalogs?.globalDb, label: 'usda' },
    { db: catalogs?.offDb, label: 'off' },
  ];

  const dbNonEmpty = (db) => catalogDbNonEmpty(db, emptyCache);

  /**
   * @param {string} key
   */
  function lookup(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    if (memo.has(k)) return memo.get(k);
    let hit = null;
    for (const layer of layers) {
      if (!layer.db || typeof layer.db !== 'object') continue;
      if (layer.label === 'off' && !dbNonEmpty(layer.db)) continue;
      const row = layer.db[k];
      if (!row) continue;
      hit = { row, sourceLabel: `catalog:${layer.label}`, layer: layer.label };
      break;
    }
    memo.set(k, hit);
    return hit;
  }

  return {
    lookup,
    dbNonEmpty,
    memoSize: () => memo.size,
  };
}

/**
 * Allega una sessione di lookup a catalogs (mutazione leggera, solo per la build corrente).
 * @param {object|null|undefined} catalogs
 */
export function withFocusCatalogLookupSession(catalogs) {
  if (!catalogs || typeof catalogs !== 'object') {
    return { catalogs: null, lookupSession: createFocusCatalogLookupSession(null) };
  }
  if (catalogs.__focusLookupSession) {
    return { catalogs, lookupSession: catalogs.__focusLookupSession };
  }
  const lookupSession = createFocusCatalogLookupSession(catalogs);
  const next = { ...catalogs, __focusLookupSession: lookupSession };
  return { catalogs: next, lookupSession };
}
