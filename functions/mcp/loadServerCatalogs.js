/**
 * Cataloghi MCP per Cloud Functions: CREA + USDA da functions/lib/catalog-data/
 * (copiati dal predeploy). OFF escluso (troppo grande).
 * Path relativi a __dirname del bundle (lib/), non a process.cwd().
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadFocusCatalogsFromPublic } from '../../src/features/kentuFocus/product/loadFocusCatalogsNode.js';

/** Solo per test ESM (niente __dirname): punta a catalog-data assoluto. */
let dataDirOverride = null;

export function setMcpDataDirForTests(absoluteDir) {
  dataDirOverride = absoluteDir ? String(absoluteDir) : null;
}

/**
 * Da functions/lib (bundle CJS) → ./catalog-data.
 * In ESM di test usare setMcpDataDirForTests.
 */
export function resolveMcpDataDir() {
  if (dataDirOverride) return dataDirOverride;
  if (typeof __dirname === 'string') {
    const besideBundle = path.join(__dirname, 'catalog-data');
    if (existsSync(path.join(besideBundle, 'kentu_smart_master_db.json'))) {
      return besideBundle;
    }
    // Source ESM non usa questo ramo; fallback legacy
    const legacy = path.join(__dirname, '../data');
    if (existsSync(path.join(legacy, 'kentu_smart_master_db.json'))) return legacy;
    return besideBundle;
  }
  throw new Error(
    'MCP data dir non risolvibile: manca __dirname (bundle CJS) e nessun setMcpDataDirForTests',
  );
}

const OFF_WARNING =
  'Catalogo OFF non incluso sul server MCP: lookup solo su CREA, USDA e DB personale. '
  + 'Se un alimento del diario esisteva solo in OFF, il match catalogo può mancare.';

/** @type {Promise<object>|null} */
let loading = null;
/** @type {object|null} */
let cached = null;

export function clearServerCatalogsCache() {
  loading = null;
  cached = null;
}

/**
 * Lazy + cache per istanza Cloud Functions.
 * @returns {Promise<{
 *   personalDb: object,
 *   kentuItDb: object,
 *   globalDb: object,
 *   offDb: object,
 *   offReady: boolean,
 *   offExcluded: boolean,
 *   warnings: string[],
 * }>}
 */
export async function loadServerCatalogs() {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    const dataDir = resolveMcpDataDir();
    const catalogs = await loadFocusCatalogsFromPublic(process.cwd(), {
      dataDir,
      includeOff: false,
    });
    const result = {
      ...catalogs,
      offDb: {},
      offReady: false,
      offExcluded: true,
      warnings: [OFF_WARNING],
    };
    cached = result;
    return result;
  })();

  try {
    return await loading;
  } catch (error) {
    loading = null;
    throw error;
  }
}
