/**
 * Simula Cloud Functions: cwd fuori dal repo; i cataloghi devono
 * risolversi da functions/data via __dirname, non da process.cwd()/public.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { clearFocusCatalogsCache } from '../../../src/features/kentuFocus/product/loadFocusCatalogsNode.js';
import {
  clearServerCatalogsCache,
  loadServerCatalogs,
  resolveMcpDataDir,
  setMcpDataDirForTests,
} from '../loadServerCatalogs.js';
import { toolGetDay, toolGetEvenings } from '../tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(
  ROOT,
  'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json',
);
const DATA_DIR = path.join(ROOT, 'functions/lib/catalog-data');
const DATA_CREA = path.join(DATA_DIR, 'kentu_smart_master_db.json');

const skip = !existsSync(FIXTURE) || !existsSync(DATA_CREA)
  ? 'serve fixture + functions/lib/catalog-data (esegui buildMcpBundle)'
  : false;

function mockDbFromFixture(fixture, uid = 'cwd_test_user') {
  const tracker = {
    ...(fixture.fullHistory || {}),
    ...(fixture.trackerFoodDatabase
      ? { trackerFoodDatabase: fixture.trackerFoodDatabase }
      : {}),
  };
  const tree = {
    [`users/${uid}/tracker_data`]: tracker,
    [`users/${uid}/profile_targets`]: fixture.profile_targets || {},
    [`users/${uid}/day_status`]: fixture.day_status || fixture.records || {},
    [`users/${uid}/movement_checkin`]: fixture.movement_checkin || {},
    [`users/${uid}/cylinders/forza/enabled`]: true,
  };

  return {
    ref(refPath) {
      const key = String(refPath || '').replace(/^\/+/, '');
      return {
        async get() {
          const val = Object.prototype.hasOwnProperty.call(tree, key) ? tree[key] : null;
          return {
            exists: () => val != null,
            val: () => val,
          };
        },
      };
    },
  };
}

test('resolveMcpDataDir punta a lib/catalog-data indipendentemente dal cwd', { skip }, () => {
  const prev = process.cwd();
  const foreign = mkdtempSync(path.join(tmpdir(), 'kentu-mcp-cwd-'));
  setMcpDataDirForTests(DATA_DIR);
  try {
    process.chdir(foreign);
    assert.equal(
      existsSync(path.join(process.cwd(), 'public', 'kentu_smart_master_db.json')),
      false,
    );
    const dataDir = resolveMcpDataDir();
    assert.equal(path.resolve(dataDir), path.resolve(DATA_DIR));
    assert.ok(existsSync(path.join(dataDir, 'kentu_smart_master_db.json')));
  } finally {
    process.chdir(prev);
    setMcpDataDirForTests(null);
  }
});

test('loadServerCatalogs + get_day/evenings con cwd fuori dal repo', { skip }, async () => {
  const prev = process.cwd();
  const foreign = mkdtempSync(path.join(tmpdir(), 'kentu-mcp-cwd-'));
  clearFocusCatalogsCache();
  clearServerCatalogsCache();
  setMcpDataDirForTests(DATA_DIR);
  try {
    process.chdir(foreign);
    assert.equal(
      existsSync(path.join(process.cwd(), 'public', 'kentu_smart_master_db.json')),
      false,
    );
    const catalogs = await loadServerCatalogs();
    assert.equal(catalogs.offExcluded, true);
    assert.equal(catalogs.offReady, false);
    assert.ok(Object.keys(catalogs.kentuItDb).length > 100);
    assert.ok(Object.keys(catalogs.globalDb).length > 100);

    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const db = mockDbFromFixture(fixture);
    const day = await toolGetDay(db, 'cwd_test_user', '2026-11-08');
    assert.equal(day.date, '2026-11-08');
    assert.ok(Array.isArray(day.meals));
    assert.ok(day.sleep == null || typeof day.sleep === 'object');
    assert.ok(Array.isArray(day.warnings));

    const evenings = await toolGetEvenings(db, 'cwd_test_user', {
      from: '2026-11-01',
      to: '2026-11-09',
    });
    assert.ok(Array.isArray(evenings.evenings));
    assert.ok(Array.isArray(evenings.warnings));
  } finally {
    process.chdir(prev);
    clearFocusCatalogsCache();
    clearServerCatalogsCache();
    setMcpDataDirForTests(null);
  }
});
