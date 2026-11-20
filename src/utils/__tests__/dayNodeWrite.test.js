import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_WRITE_PROTOCOL,
  classifyDayWriteError,
  diffRemovedEntryIds,
  managedPatchIsNoop,
  mergeDayNodeWrite,
  mergeEntryListsById,
  sanitizeDayPatch,
} from '../dayNodeWrite.js';
import { DayNodeConflictError } from '../dayNodeWrite.js';

test('sanitizeDayPatch toglie rev* e lascia snapshot/customTargets', () => {
  const picked = sanitizeDayPatch({
    data: '2026-11-10',
    log: [{ id: 'a' }],
    mealTimes: { pranzo: 13 },
    manualNodes: [],
    hasEditedNodes: true,
    dayTargetSnapshot: { total: 2456 },
    customTargets: { kcal: 2600 },
    rev: 9,
    revBy: 'x',
    revAt: 1,
    writeProtocol: 99,
    _syncStatus: 'failed',
  });
  assert.equal(picked.rev, undefined);
  assert.equal(picked.revBy, undefined);
  assert.equal(picked.writeProtocol, undefined);
  assert.equal(picked._syncStatus, undefined);
  assert.equal(picked.dayTargetSnapshot.total, 2456);
  assert.equal(picked.customTargets.kcal, 2600);
});

test('merge: nodo nuovo → rev 1, senza cancellare nulla di esterno (non c’è ancora)', () => {
  const { ok, next } = mergeDayNodeWrite(null, {
    data: '2026-11-10',
    log: [],
    mealTimes: {},
    manualNodes: [],
    hasEditedNodes: true,
  }, { uid: 'u1', now: 1000 });
  assert.equal(ok, true);
  assert.equal(next.rev, 1);
  assert.equal(next.revBy, 'u1');
  assert.equal(next.revAt, 1000);
  assert.equal(next.writeProtocol, DAY_WRITE_PROTOCOL);
});

test('merge: preserva dayTargetSnapshot e customTargets; log merge per id', () => {
  const current = {
    data: '2026-11-10',
    log: [{ id: 'old' }],
    dayTargetSnapshot: { total: 2516, rulesVersion: 'dtr-1' },
    customTargets: { kcal: 2600 },
    rev: 3,
  };
  const { ok, next } = mergeDayNodeWrite(current, {
    data: '2026-11-10',
    log: [{ id: 'new' }],
    mealTimes: { cena: 20 },
    hasEditedNodes: true,
  }, { expectedRev: 3, uid: 'u2', now: 2000 });
  assert.equal(ok, true);
  assert.deepEqual(next.dayTargetSnapshot, { total: 2516, rulesVersion: 'dtr-1' });
  assert.deepEqual(next.customTargets, { kcal: 2600 });
  // senza logDeleteIds la voce solo-server resta
  assert.deepEqual(next.log, [{ id: 'old' }, { id: 'new' }]);
  assert.equal(next.rev, 4);
  assert.equal(next.revBy, 'u2');
  assert.equal(next.writeProtocol, DAY_WRITE_PROTOCOL);
});

test('mergeEntryListsById: non shrink senza delete; delete esplicito ok', () => {
  const merged = mergeEntryListsById(
    [{ id: 'a' }, { id: 'b', label: 'server' }],
    [{ id: 'b', label: 'client' }, { id: 'c' }],
  );
  assert.deepEqual(merged, [
    { id: 'a' },
    { id: 'b', label: 'client' },
    { id: 'c' },
  ]);
  const afterDelete = mergeEntryListsById(
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'b' }],
    ['a'],
  );
  assert.deepEqual(afterDelete, [{ id: 'b' }]);
});

test('merge: array log vuoto senza deleteIds non cancella voci server', () => {
  const current = {
    data: '2026-11-20',
    log: [{ id: 'sleep_1', type: 'sleep' }],
    manualNodes: [{ id: 'c1', type: 'stimulant', label: 'Caffè' }],
    rev: 10,
  };
  const { ok, next } = mergeDayNodeWrite(current, {
    data: '2026-11-20',
    log: [{ id: 'sleep_1', type: 'sleep' }],
    manualNodes: [],
    hasEditedNodes: true,
  }, { expectedRev: 10, uid: 'u', now: 1 });
  assert.equal(ok, true);
  assert.equal(next.manualNodes.length, 1);
  assert.equal(next.manualNodes[0].id, 'c1');
  assert.equal(next.logDeleteIds, undefined);
});

test('merge: logDeleteIds / manualNodesDeleteIds rimuovono e non restano sul nodo', () => {
  const current = {
    data: '2026-11-20',
    log: [{ id: 'sleep_1' }, { mealId: 'pranzo_1', type: 'meal' }],
    manualNodes: [{ id: 'c1' }, { id: 'c2' }],
    mealTimes: { pranzo_1: 13 },
    rev: 2,
  };
  const { ok, next } = mergeDayNodeWrite(current, {
    data: '2026-11-20',
    log: [{ id: 'sleep_1' }],
    manualNodes: [{ id: 'c2' }],
    mealTimes: {},
    logDeleteIds: ['pranzo_1'],
    manualNodesDeleteIds: ['c1'],
  }, { expectedRev: 2, uid: 'u', now: 2 });
  assert.equal(ok, true);
  assert.deepEqual(next.log.map((r) => r.id || r.mealId), ['sleep_1']);
  assert.deepEqual(next.manualNodes.map((r) => r.id), ['c2']);
  assert.equal(next.mealTimes.pranzo_1, undefined);
  assert.equal(next.logDeleteIds, undefined);
  assert.equal(next.manualNodesDeleteIds, undefined);
});

test('diffRemovedEntryIds', () => {
  assert.deepEqual(
    diffRemovedEntryIds([{ id: 'a' }, { mealId: 'm1' }], [{ id: 'a' }]),
    ['m1'],
  );
});

test('managedPatchIsNoop: autopilot/snapshot invariati → true; cambio → false', () => {
  const current = {
    data: '2026-11-20',
    log: [{ id: 'sleep_1', type: 'sleep' }],
    manualNodes: [{ id: 'c1', label: 'Caffè' }],
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
    rev: 53,
  };
  assert.equal(managedPatchIsNoop(current, {
    autopilotCorrection: 201,
    dayTargetSnapshot: { total: 2657, autopilot: 201, rulesVersion: 'dtr-1' },
  }), true);
  assert.equal(managedPatchIsNoop(current, {
    autopilotCorrection: 200,
    dayTargetSnapshot: { total: 2657, autopilot: 200, rulesVersion: 'dtr-1' },
  }), false);
  assert.equal(managedPatchIsNoop(current, {
    log: [{ id: 'sleep_1', type: 'sleep' }],
    manualNodes: [{ id: 'c1', label: 'Caffè' }],
  }), true);
  assert.equal(managedPatchIsNoop(current, {
    manualNodes: [],
    manualNodesDeleteIds: ['c1'],
  }), false);
});

test('merge: rev non allineata → conflitto (client con dati vecchi)', () => {
  const current = { data: '2026-11-10', log: [], rev: 5, dayTargetSnapshot: { total: 1 } };
  const result = mergeDayNodeWrite(current, { data: '2026-11-10', log: [{ id: 'x' }] }, {
    expectedRev: 2,
    uid: 'stale',
  });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.currentRev, 5);
});

test('merge: nodo con rev, client senza rev → conflitto', () => {
  const current = { data: '2026-11-10', log: [], rev: 1 };
  const result = mergeDayNodeWrite(current, { data: '2026-11-10', log: [] }, { expectedRev: null });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
});

test('merge: null (prima passata transazione) non abortisce anche con expectedRev', () => {
  const { ok, next } = mergeDayNodeWrite(null, {
    data: '2026-11-10',
    log: [],
  }, { expectedRev: 4, uid: 'u', now: 9 });
  assert.equal(ok, true);
  assert.equal(next.rev, 5);
});

test('merge: nodo legacy senza rev, client senza rev → accettato e timbra rev 1', () => {
  const current = { data: '2026-11-10', log: [], dayTargetSnapshot: { total: 9 } };
  const { ok, next } = mergeDayNodeWrite(current, {
    data: '2026-11-10',
    log: [{ id: 'a' }],
  }, { expectedRev: null, uid: 'u', now: 3 });
  assert.equal(ok, true);
  assert.equal(next.rev, 1);
  assert.deepEqual(next.dayTargetSnapshot, { total: 9 });
});

test('isDayNodePermissionDenied riconosce il codice Firebase', async () => {
  const { isDayNodePermissionDenied } = await import('../dayNodeWrite.js');
  assert.equal(isDayNodePermissionDenied({ code: 'PERMISSION_DENIED' }), true);
  assert.equal(isDayNodePermissionDenied({ code: 'permission-denied' }), true);
  assert.equal(isDayNodePermissionDenied({ message: 'transaction failed: permission_denied' }), true);
  assert.equal(isDayNodePermissionDenied({ code: 'unavailable' }), false);
});

test('classifyDayWriteError: conflict / offline / outdated', () => {
  assert.equal(classifyDayWriteError(new DayNodeConflictError({ currentRev: 2 })), 'conflict');
  assert.equal(classifyDayWriteError({ code: 'unavailable', message: 'offline' }), 'offline');
  assert.equal(classifyDayWriteError({ code: 'PERMISSION_DENIED' }), 'outdated');
});
