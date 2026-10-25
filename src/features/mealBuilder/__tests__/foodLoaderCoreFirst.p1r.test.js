/**
 * P1R — Contratto loader pasti: core prima di OFF (no import Vite-only foodLoader in Node).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('foodLoader core-first P1R (source contract)', () => {
  it('loadKentuDatabases non attende OFF nel Promise.all critico', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/foodLoader.js'), 'utf8');
    assert.match(src, /loadKentuCoreDatabasesUncached/);
    assert.match(src, /loadOffDatabaseBackground/);
    assert.match(src, /subscribeKentuDatabases/);
    assert.match(src, /whenKentuOffReady/);
    // Il fetch OFF non è più nel Promise.all insieme a CREA+USDA
    const coreFn = src.slice(
      src.indexOf('async function loadKentuCoreDatabasesUncached'),
      src.indexOf('export function loadKentuDatabases'),
    );
    assert.match(coreFn, /Promise\.all\(/);
    assert.ok(!/OFF_DB_URL/.test(coreFn), 'core path must not fetch OFF_DB_URL');
    assert.match(src, /enrichUnits:\s*false/);
    assert.match(src, /indexRecordsChunked/);

    const useFood = fs.readFileSync(path.join(ROOT, 'src/useFoodDb.js'), 'utf8');
    assert.match(useFood, /subscribeKentuDatabases/);
    assert.match(useFood, /setIsLoading\(false\)/);

    const boot = fs.readFileSync(
      path.join(ROOT, 'src/hooks/salaComandi/usePersonalFoodDbBootstrap.js'),
      'utf8',
    );
    assert.match(boot, /useFoodDb\(\{\s*defer:\s*false/);

    const offSize = fs.statSync(path.join(ROOT, 'public/kentu_off_master_db.json')).size;
    const itSize = fs.statSync(path.join(ROOT, 'public/kentu_smart_master_db.json')).size;
    const usdaSize = fs.statSync(path.join(ROOT, 'public/kentu_smart_master_usda_FINAL.json')).size;
    assert.ok(offSize > 20_000_000, 'OFF remains large (~35MB) — deferred for a reason');
    assert.ok(itSize + usdaSize < offSize, 'core catalogs smaller than OFF');

    // eslint-disable-next-line no-console
    console.log('\n===== P1R_FOODDB_CONTRACT =====\n', JSON.stringify({
      offMB: Math.round(offSize / 1e6),
      coreMB: Math.round((itSize + usdaSize) / 1e6),
      coreExcludesOffFetch: true,
      offChunkedNoEnrich: true,
      bootstrapDeferFalse: true,
    }, null, 2));
  });
});
