/**
 * P6.12 — Diff strutturale rules pubblicate (trascritte) vs locali.
 * Offline puro: nessuna rete, nessun emulator.
 *
 * Dopo Focus AI history: database.rules.focus.local.json può contenere
 * validazioni nested sotto users/$uid (kentu_focus_ai*). database.rules.json
 * resta allineato alla produzione trascritta + kentu_focus finché non c’è
 * consenso al deploy delle rules AI.
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

test('P6.12 diff: planning/weeklyPlanning identici a production trascritta', () => {
  const local = loadLocal('database.rules.json');
  for (const branch of ['planning', 'weeklyPlanning']) {
    assert.deepEqual(
      local.rules[branch],
      PUBLISHED_ONLINE.rules[branch],
      `branch ${branch} must match published`,
    );
  }
});

test('P6.12 diff: users base .read/.write invariati (nessun allargamento)', () => {
  const prod = loadLocal('database.rules.json');
  const focusLocal = loadLocal('database.rules.focus.local.json');
  assert.equal(prod.rules.users.$uid['.read'], PUBLISHED_ONLINE.rules.users.$uid['.read']);
  assert.equal(prod.rules.users.$uid['.write'], PUBLISHED_ONLINE.rules.users.$uid['.write']);
  assert.equal(focusLocal.rules.users.$uid['.read'], PUBLISHED_ONLINE.rules.users.$uid['.read']);
  assert.equal(focusLocal.rules.users.$uid['.write'], PUBLISHED_ONLINE.rules.users.$uid['.write']);
});

test('P6.12 diff: database.rules.json users senza nested AI (non ancora deploy)', () => {
  const prod = loadLocal('database.rules.json');
  const keys = Object.keys(prod.rules.users.$uid).filter((k) => !k.startsWith('.')).sort();
  assert.deepEqual(keys, [], 'production rules file must not yet include kentu_focus_ai until deploy consent');
});

test('P6.12 diff: focus.local aggiunge solo kentu_focus_ai* sotto users', () => {
  const focusLocal = loadLocal('database.rules.focus.local.json');
  const keys = Object.keys(focusLocal.rules.users.$uid).filter((k) => !k.startsWith('.')).sort();
  assert.deepEqual(keys, ['kentu_focus_ai', 'kentu_focus_ai_index']);
  assert.ok(focusLocal.rules.users.$uid.kentu_focus_ai.$periodId['.validate']);
  assert.ok(focusLocal.rules.users.$uid.kentu_focus_ai_index.$indexKey['.validate']);
});

test('P6.12 diff: nessun .read/.write alla radice; rami = kentu_focus + planning + users + weeklyPlanning', () => {
  const local = loadLocal('database.rules.json');
  assert.equal(local.rules['.read'], undefined);
  assert.equal(local.rules['.write'], undefined);
  const keys = Object.keys(local.rules).sort();
  assert.deepEqual(keys, ['kentu_focus', 'planning', 'users', 'weeklyPlanning']);
});

test('P6.12 diff: kentu_focus edizioni identiche tra prod file e focus.local', () => {
  const a = loadLocal('database.rules.json');
  const b = loadLocal('database.rules.focus.local.json');
  assert.deepEqual(a.rules.kentu_focus, b.rules.kentu_focus);
  assert.deepEqual(a.rules.planning, b.rules.planning);
  assert.deepEqual(a.rules.weeklyPlanning, b.rules.weeklyPlanning);
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
