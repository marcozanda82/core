/**
 * P6.12 — Diff strutturale rules pubblicate (trascritte) vs locali.
 * Offline puro: nessuna rete, nessun emulator.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../../');

/** Rules attualmente pubblicate su mio-tracker (trascritte dall'operatore). */
const PUBLISHED_ONLINE = {
  rules: {
    users: {
      $uid: {
        '.read': '$uid === auth.uid',
        '.write': '$uid === auth.uid',
      },
    },
    planning: {
      $uid: {
        '.read': '$uid === auth.uid',
        '.write': '$uid === auth.uid',
      },
    },
    weeklyPlanning: {
      $uid: {
        '.read': '$uid === auth.uid',
        '.write': '$uid === auth.uid',
      },
    },
  },
};

function loadLocal(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

test('P6.12 diff: users/planning/weeklyPlanning identici a production trascritta', () => {
  const local = loadLocal('database.rules.json');
  for (const branch of ['users', 'planning', 'weeklyPlanning']) {
    assert.deepEqual(
      local.rules[branch],
      PUBLISHED_ONLINE.rules[branch],
      `branch ${branch} must match published`,
    );
  }
});

test('P6.12 diff: nessun .read/.write alla radice; unico ramo aggiunto kentu_focus', () => {
  const local = loadLocal('database.rules.json');
  assert.equal(local.rules['.read'], undefined);
  assert.equal(local.rules['.write'], undefined);
  const keys = Object.keys(local.rules).sort();
  assert.deepEqual(keys, ['kentu_focus', 'planning', 'users', 'weeklyPlanning']);
  const publishedKeys = Object.keys(PUBLISHED_ONLINE.rules).sort();
  assert.deepEqual(publishedKeys, ['planning', 'users', 'weeklyPlanning']);
  const added = keys.filter((k) => !publishedKeys.includes(k));
  assert.deepEqual(added, ['kentu_focus']);
});

test('P6.12 diff: database.rules.json ≡ database.rules.focus.local.json', () => {
  const a = loadLocal('database.rules.json');
  const b = loadLocal('database.rules.focus.local.json');
  assert.deepEqual(a, b);
});

test('P6.12 diff: meta/rev richiedono status published|published_fallback', () => {
  const local = loadLocal('database.rules.json');
  const metaRead = local.rules.kentu_focus.$uid.editions.$publicationDate.meta['.read'];
  assert.match(metaRead, /published/);
  assert.match(metaRead, /published_fallback/);
  const revRead = local.rules.kentu_focus.$uid.editions.$publicationDate.rev.$revision['.read'];
  assert.match(revRead, /currentRevision/);
  assert.match(revRead, /published/);
  assert.equal(
    local.rules.kentu_focus.$uid.editions.$publicationDate.meta['.write'],
    false,
  );
});
