import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFocusCatalogsFromPublic } from '../loadFocusCatalogsNode.js';

test('i test caricano il catalogo OFF pubblico, come l’app', async () => {
  const catalogs = await loadFocusCatalogsFromPublic();
  assert.equal(catalogs.offReady, true);
  assert.ok(Object.keys(catalogs.offDb).length > 1000);
  assert.ok(Object.keys(catalogs.kentuItDb).length > 0);
});
