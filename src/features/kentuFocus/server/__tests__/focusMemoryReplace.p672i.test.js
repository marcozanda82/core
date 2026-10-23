/**
 * P6.7.2i — replaceEditorialMemoryIfUnchanged (commit atomico protetto).
 * Offline: MemoryFocusPersistence + AdminRtdb su mock. Zero Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  FOCUS_MEMORY_REPLACE_AUTHORITY,
  buildEditorialMemoryCursor,
  canonicalizeJsonValue,
  evaluateEditorialMemoryReplace,
  fingerprintEditorialMemoryPayload,
  fingerprintEditorialMemoryState,
} from '../memory/editorialMemoryCommit.js';
import { focusEditorialMemoryPath } from '../paths/focusRtdbPaths.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { MemoryFocusPersistence } from '../persist/MemoryFocusPersistence.js';
import { createMockAdminRtdb } from './helpers/mockAdminRtdb.js';

function sampleMemory(overrides = {}) {
  const base = createEmptyEditorialMemory();
  return {
    ...base,
    updatedAt: '2026-10-17T10:00:00.000Z',
    lastAppliedEdition: '2026-10-17#1',
    recentTopics: [
      {
        topicId: 'protein_near_target',
        lastDates: ['2026-10-17'],
        count14d: 1,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
    cooldown: {
      ...base.cooldown,
      topics: { protein_near_target: '2026-10-20' },
      families: { sleep_routine: '2026-10-24' },
    },
    ...overrides,
  };
}

function nextFrom(base, patch) {
  return {
    ...base,
    ...patch,
    recentTopics: patch.recentTopics || base.recentTopics,
    cooldown: patch.cooldown || base.cooldown,
  };
}

test('P6.7.2i fingerprint canonico ignora ordine proprietà', () => {
  const a = { z: 1, a: { b: 2, a: 1 }, list: [1, 2] };
  const b = { a: { a: 1, b: 2 }, list: [1, 2], z: 1 };
  assert.deepEqual(canonicalizeJsonValue(a), canonicalizeJsonValue(b));
  assert.equal(
    fingerprintEditorialMemoryState(a),
    fingerprintEditorialMemoryState(b),
  );
});

test('P6.7.2i stessa lastApplied ma payload diverso → fingerprint diverso', () => {
  const m1 = sampleMemory();
  const m2 = sampleMemory({
    recentTopics: [
      {
        topicId: 'protein_near_target',
        lastDates: ['2026-10-17'],
        count14d: 2,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });
  assert.equal(m1.lastAppliedEdition, m2.lastAppliedEdition);
  assert.notEqual(
    fingerprintEditorialMemoryPayload(m1),
    fingerprintEditorialMemoryPayload(m2),
  );
  assert.notEqual(
    fingerprintEditorialMemoryState(m1),
    fingerprintEditorialMemoryState(m2),
  );
});

test('P6.7.2i evaluate: authority obbligatoria', () => {
  const current = sampleMemory();
  const cursor = buildEditorialMemoryCursor(current);
  const rejected = evaluateEditorialMemoryReplace({
    current,
    expected: cursor,
    nextMemory: nextFrom(current, { updatedAt: '2026-10-18T00:00:00.000Z' }),
    authority: 'wrong',
  });
  assert.equal(rejected.action, 'reject');
  assert.equal(rejected.error, 'memory_replace_authority_required');
});

test('P6.7.2i Memory: commit con stato invariato', async () => {
  const persistence = new MemoryFocusPersistence();
  const current = sampleMemory();
  persistence.memoryByUid.set('u1', current);
  const expected = buildEditorialMemoryCursor(current);
  const next = nextFrom(current, {
    updatedAt: '2026-10-18T12:00:00.000Z',
    lastAppliedEdition: '2026-10-18#1',
    recentTopics: [
      ...current.recentTopics,
      {
        topicId: 'workout_logged',
        lastDates: ['2026-10-18'],
        count14d: 1,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u1', {
    expected,
    nextMemory: next,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.unchanged, false);
  assert.equal(result.conflict, false);
  assert.equal(result.memory.lastAppliedEdition, '2026-10-18#1');
  assert.equal(
    (await persistence.getEditorialMemory('u1')).lastAppliedEdition,
    '2026-10-18#1',
  );
});

test('P6.7.2i Memory: conflitto lastAppliedEdition diverso', async () => {
  const persistence = new MemoryFocusPersistence();
  const current = sampleMemory({ lastAppliedEdition: '2026-10-18#1' });
  persistence.memoryByUid.set('u2', current);
  const stale = buildEditorialMemoryCursor(sampleMemory({ lastAppliedEdition: '2026-10-17#1' }));
  const result = await persistence.replaceEditorialMemoryIfUnchanged('u2', {
    expected: stale,
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-19#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, 'memory_conflict_last_applied');
  assert.equal(
    (await persistence.getEditorialMemory('u2')).lastAppliedEdition,
    '2026-10-18#1',
  );
});

test('P6.7.2i Memory: conflitto stessa chiave ma conteggi diversi', async () => {
  const persistence = new MemoryFocusPersistence();
  const read = sampleMemory();
  const expected = buildEditorialMemoryCursor(read);
  const concurrent = sampleMemory({
    recentTopics: [
      {
        topicId: 'protein_near_target',
        lastDates: ['2026-10-17'],
        count14d: 9,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });
  assert.equal(concurrent.lastAppliedEdition, read.lastAppliedEdition);
  persistence.memoryByUid.set('u3', concurrent);

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u3', {
    expected,
    nextMemory: nextFrom(read, { lastAppliedEdition: '2026-10-18#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, 'memory_conflict_state');
  assert.equal(
    (await persistence.getEditorialMemory('u3')).recentTopics[0].count14d,
    9,
  );
});

test('P6.7.2i Memory: conflitto stessa chiave ma cooldown diversi', async () => {
  const persistence = new MemoryFocusPersistence();
  const read = sampleMemory();
  const expected = buildEditorialMemoryCursor(read);
  const concurrent = sampleMemory({
    cooldown: {
      ...read.cooldown,
      families: { sleep_routine: '2026-10-30' },
    },
  });
  persistence.memoryByUid.set('u4', concurrent);

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u4', {
    expected,
    nextMemory: nextFrom(read, { lastAppliedEdition: '2026-10-18#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, 'memory_conflict_state');
  assert.equal(
    (await persistence.getEditorialMemory('u4')).cooldown.families.sleep_routine,
    '2026-10-30',
  );
});

test('P6.7.2i Memory: memoria inizialmente assente', async () => {
  const persistence = new MemoryFocusPersistence();
  const expected = buildEditorialMemoryCursor(null);
  assert.equal(expected.lastAppliedEdition, null);

  const next = sampleMemory({ lastAppliedEdition: '2026-10-17#1' });
  const result = await persistence.replaceEditorialMemoryIfUnchanged('u5', {
    expected,
    nextMemory: next,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal((await persistence.getEditorialMemory('u5')).lastAppliedEdition, '2026-10-17#1');
});

test('P6.7.2i Memory: due processi concorrenti — uno solo vince', async () => {
  const persistence = new MemoryFocusPersistence();
  const base = sampleMemory();
  persistence.memoryByUid.set('u6', base);
  const cursor = buildEditorialMemoryCursor(base);

  const nextA = nextFrom(base, {
    lastAppliedEdition: '2026-10-18#1',
    updatedAt: '2026-10-18T01:00:00.000Z',
    recentTopics: [
      ...base.recentTopics,
      {
        topicId: 'a_only',
        lastDates: ['2026-10-18'],
        count14d: 1,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });
  const nextB = nextFrom(base, {
    lastAppliedEdition: '2026-10-18#1',
    updatedAt: '2026-10-18T02:00:00.000Z',
    recentTopics: [
      ...base.recentTopics,
      {
        topicId: 'b_only',
        lastDates: ['2026-10-18'],
        count14d: 1,
        editorialFamily: null,
        evidenceFingerprint: null,
      },
    ],
  });

  const [ra, rb] = await Promise.all([
    persistence.replaceEditorialMemoryIfUnchanged('u6', {
      expected: cursor,
      nextMemory: nextA,
      authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
    }),
    persistence.replaceEditorialMemoryIfUnchanged('u6', {
      expected: cursor,
      nextMemory: nextB,
      authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
    }),
  ]);

  const wins = [ra, rb].filter((r) => r.ok && r.committed);
  const conflicts = [ra, rb].filter((r) => r.conflict);
  assert.equal(wins.length, 1);
  assert.equal(conflicts.length, 1);
  const stored = await persistence.getEditorialMemory('u6');
  const topicIds = stored.recentTopics.map((t) => t.topicId);
  assert.equal(topicIds.includes('a_only') && topicIds.includes('b_only'), false);
  assert.ok(topicIds.includes('a_only') || topicIds.includes('b_only'));
});

test('P6.7.2i Memory: seconda richiesta identica → unchanged, no doppio effetto', async () => {
  const persistence = new MemoryFocusPersistence();
  const current = sampleMemory();
  persistence.memoryByUid.set('u7', current);
  const expected = buildEditorialMemoryCursor(current);
  // Stesso payload editoriale, updatedAt diverso
  const samePayload = nextFrom(current, { updatedAt: '2099-01-01T00:00:00.000Z' });

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u7', {
    expected,
    nextMemory: samePayload,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(result.committed, false);
  assert.equal(
    (await persistence.getEditorialMemory('u7')).updatedAt,
    current.updatedAt,
  );

  const again = await persistence.replaceEditorialMemoryIfUnchanged('u7', {
    expected: buildEditorialMemoryCursor(await persistence.getEditorialMemory('u7')),
    nextMemory: samePayload,
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(again.unchanged, true);
  assert.equal(
    (await persistence.getEditorialMemory('u7')).recentTopics[0].count14d,
    1,
  );
});

test('P6.7.2i Memory: fallimento transazione → memoria invariata', async () => {
  const persistence = new MemoryFocusPersistence();
  const current = sampleMemory();
  persistence.memoryByUid.set('u8', current);
  persistence._failMemoryReplaceOnce = true;
  const expected = buildEditorialMemoryCursor(current);

  const result = await persistence.replaceEditorialMemoryIfUnchanged('u8', {
    expected,
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-18#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_replace_transaction_failed');
  assert.equal(
    (await persistence.getEditorialMemory('u8')).lastAppliedEdition,
    '2026-10-17#1',
  );
});

test('P6.7.2i Admin mock: parità semantica commit/conflict/unchanged', async () => {
  const uid = 'admin_u';
  const path = focusEditorialMemoryPath(uid);
  const current = sampleMemory();
  const db = createMockAdminRtdb({ [path]: current });
  const persistence = new AdminRtdbFocusPersistence(db);

  const expected = buildEditorialMemoryCursor(current);
  const committed = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected,
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-18#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal((await persistence.getEditorialMemory(uid)).lastAppliedEdition, '2026-10-18#1');

  // conflict: stale cursor
  const stale = buildEditorialMemoryCursor(current);
  const conflict = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected: stale,
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-19#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);

  // unchanged payload
  const after = await persistence.getEditorialMemory(uid);
  const cursor2 = buildEditorialMemoryCursor(after);
  const unchanged = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected: cursor2,
    nextMemory: { ...after, updatedAt: '2099-01-01T00:00:00.000Z' },
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.unchanged, true);
  assert.equal((await persistence.getEditorialMemory(uid)).updatedAt, after.updatedAt);
});

test('P6.7.2i Admin mock: fail transaction lascia memoria invariata', async () => {
  const uid = 'admin_fail';
  const path = focusEditorialMemoryPath(uid);
  const current = sampleMemory();
  const db = createMockAdminRtdb({ [path]: current });
  const persistence = new AdminRtdbFocusPersistence(db, { failMemoryReplaceOnce: true });
  const expected = buildEditorialMemoryCursor(current);

  const result = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected,
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-18#1' }),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_replace_transaction_failed');
  assert.equal((await persistence.getEditorialMemory(uid)).lastAppliedEdition, '2026-10-17#1');
});

test('P6.7.2i Admin mock: memoria assente → commit', async () => {
  const uid = 'admin_empty';
  const db = createMockAdminRtdb();
  const persistence = new AdminRtdbFocusPersistence(db);
  const expected = buildEditorialMemoryCursor(null);
  const result = await persistence.replaceEditorialMemoryIfUnchanged(uid, {
    expected,
    nextMemory: sampleMemory(),
    authority: FOCUS_MEMORY_REPLACE_AUTHORITY,
  });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.ok(await persistence.getEditorialMemory(uid));
});

test('P6.7.2i reject senza authority non scrive (Memory)', async () => {
  const persistence = new MemoryFocusPersistence();
  const current = sampleMemory();
  persistence.memoryByUid.set('u9', current);
  const result = await persistence.replaceEditorialMemoryIfUnchanged('u9', {
    expected: buildEditorialMemoryCursor(current),
    nextMemory: nextFrom(current, { lastAppliedEdition: '2026-10-18#1' }),
    // authority mancante
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'memory_replace_authority_required');
  assert.equal(
    (await persistence.getEditorialMemory('u9')).lastAppliedEdition,
    '2026-10-17#1',
  );
});
