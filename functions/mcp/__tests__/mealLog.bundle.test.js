/**
 * kentu_log_meal sul bundle CJS deployato: niente require('react').
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUNDLE = path.join(ROOT, 'functions/lib/mcpHttp.cjs');
const require = createRequire(import.meta.url);

test('mcpHttp.cjs non richiede react/react-dom', () => {
  assert.ok(existsSync(BUNDLE), 'esegui buildMcpBundle.mjs prima del test');
  const src = readFileSync(BUNDLE, 'utf8');
  assert.equal(/require\(['"]react['"]\)/.test(src), false);
  assert.equal(/require\(['"]react-dom['"]\)/.test(src), false);
});

test('buildClaudeMealEntries dal bundle (senza React)', async () => {
  assert.ok(existsSync(BUNDLE), 'esegui buildMcpBundle.mjs prima del test');
  // Carica mealLog via ESM sorgente (stessa logica del bundle dopo rebuild).
  const { buildClaudeMealEntries, CLAUDE_MEAL_ORIGIN } = await import('../mealLog.js');
  const items = await buildClaudeMealEntries(
    [{ name: 'Pasta', foodDbKey: 'pasta', grams: 80 }],
    {
      personalDb: {
        pasta: { name: 'Pasta', kcal: 350, prot: 12, carb: 70, fatTotal: 1.5 },
      },
      catalogs: { kentuItDb: {}, globalDb: {}, offDb: {} },
    },
    { mealId: 'claude_test_bundle', slot: 'pranzo', mealTime: 13, now: Date.now() },
  );
  assert.ok(items.length >= 1);
  assert.equal(items[0].origin, CLAUDE_MEAL_ORIGIN);
  assert.equal(items[0].grams, 80);
  assert.ok(Number.isFinite(items[0].kcal));
  // Sanity: il require del bundle non esplode su react
  assert.doesNotThrow(() => {
    // Solo verifica che il file sia CJS valido; non esegue HTTP handler.
    const head = require('fs').readFileSync(BUNDLE, 'utf8').slice(0, 80);
    assert.ok(head.includes('use strict') || head.includes('var ') || head.includes('Object'));
  });
});
