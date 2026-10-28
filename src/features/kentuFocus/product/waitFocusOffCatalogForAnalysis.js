/**
 * Attesa catalogo OFF prima della generazione Focus AI Coach.
 * Timeout default 8s: abbastanza per IndexedDB/cache, senza bloccare troppo la UX.
 */

import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { OFF_CATALOG_STATUS, resolveOffCatalogStatus } from './buildFocusFoodQualityBlock.js';

export const FOCUS_OFF_WAIT_TIMEOUT_MS = 8000;

/**
 * Lazy load foodLoader solo in runtime browser/app (evita import ESM spezzati nei test Node).
 * @returns {Promise<{ whenKentuOffReady: Function, peekKentuDatabasesSnapshot: Function }|null>}
 */
async function loadFoodLoaderFns() {
  try {
    const mod = await import('../../../foodLoader.js');
    return {
      whenKentuOffReady: mod.whenKentuOffReady,
      peekKentuDatabasesSnapshot: mod.peekKentuDatabasesSnapshot,
    };
  } catch {
    return null;
  }
}

/**
 * @param {unknown} db
 * @param {string} key
 */
function dbHasKey(db, key) {
  if (!db || !key || typeof db !== 'object') return false;
  return Boolean(db[key]);
}

/**
 * True se nella finestra ci sono item con foodDbKey risolvibili solo su OFF
 * e OFF non è pronto nei catalogs passati.
 * @param {object|null|undefined} catalogs
 * @param {object} fullHistory
 * @param {string[]} dates
 */
export function focusWindowNeedsOffCatalog(catalogs, fullHistory, dates) {
  if (!fullHistory || !Array.isArray(dates) || !dates.length) return false;
  const offStatus = resolveOffCatalogStatus(catalogs);
  if (offStatus.status === OFF_CATALOG_STATUS.ready) return false;
  if (offStatus.status === OFF_CATALOG_STATUS.absent && catalogs?.offDb) return false;

  for (const date of dates) {
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const foods = collectDayLogForNutrition(node).filter(
      (e) => e && (e.type === 'food' || e.type === 'recipe' || !e.type),
    );
    for (const item of foods) {
      const key = String(item?.foodDbKey || item?.matchedKey || item?.dbKey || '').trim();
      if (!key) continue;
      if (dbHasKey(catalogs?.personalDb, key)) continue;
      if (dbHasKey(catalogs?.kentuItDb, key)) continue;
      if (dbHasKey(catalogs?.globalDb, key)) continue;
      // Solo OFF potrebbe risolvere
      return true;
    }
  }
  return false;
}

/**
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {() => Promise<object>} [opts.waitFn]
 * @param {() => object} [opts.peekFn]
 */
export async function waitFocusOffCatalogForAnalysis(opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs)
    ? Math.max(0, Number(opts.timeoutMs))
    : FOCUS_OFF_WAIT_TIMEOUT_MS;

  let waitFn = typeof opts.waitFn === 'function' ? opts.waitFn : null;
  let peekFn = typeof opts.peekFn === 'function' ? opts.peekFn : null;
  if (!waitFn || !peekFn) {
    const fl = await loadFoodLoaderFns();
    if (!waitFn && fl?.whenKentuOffReady) waitFn = fl.whenKentuOffReady;
    if (!peekFn && fl?.peekKentuDatabasesSnapshot) peekFn = fl.peekKentuDatabasesSnapshot;
  }
  if (!peekFn) {
    peekFn = () => ({ offReady: false, offDb: {} });
  }
  if (!waitFn) {
    waitFn = async () => peekFn();
  }

  const snap0 = peekFn() || {};
  const offPopulated0 = Boolean(
    snap0.offDb
    && typeof snap0.offDb === 'object'
    && Object.keys(snap0.offDb).length > 0,
  );
  if (offPopulated0 || snap0.offReady === true) {
    return {
      offReady: true,
      timedOut: false,
      catalogsPatch: {
        kentuItDb: snap0.kentuItDb || null,
        globalDb: snap0.globalDb || snap0.usdaDb || null,
        offDb: snap0.offDb || {},
        offReady: true,
      },
      offStatus: { status: OFF_CATALOG_STATUS.ready, note: 'OFF ready after peek.' },
    };
  }

  if (timeoutMs <= 0) {
    return {
      offReady: false,
      timedOut: true,
      catalogsPatch: {
        kentuItDb: snap0.kentuItDb || null,
        globalDb: snap0.globalDb || snap0.usdaDb || null,
        offDb: null,
        offReady: false,
      },
      offStatus: {
        status: OFF_CATALOG_STATUS.not_ready,
        note: 'OFF wait skipped (timeoutMs=0).',
      },
    };
  }

  let timedOut = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(() => waitFn()),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    timedOut = true;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const snap = peekFn() || {};
  const offPopulated = Boolean(
    snap.offDb
    && typeof snap.offDb === 'object'
    && Object.keys(snap.offDb).length > 0,
  );
  const offReady = offPopulated || snap.offReady === true;
  return {
    offReady,
    timedOut: timedOut || !offReady,
    catalogsPatch: {
      kentuItDb: snap.kentuItDb || null,
      globalDb: snap.globalDb || snap.usdaDb || null,
      offDb: offReady ? (snap.offDb || {}) : null,
      offReady,
    },
    offStatus: offReady
      ? { status: OFF_CATALOG_STATUS.ready, note: 'OFF ready after wait.' }
      : {
        status: OFF_CATALOG_STATUS.not_ready,
        note: 'OFF wait timed out or still loading.',
      },
  };
}
