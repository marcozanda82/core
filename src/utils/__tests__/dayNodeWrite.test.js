import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeDayNodeWrite,
  sanitizeDayPatch,
} from '../dayNodeWrite.js';

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
  });
  assert.equal(picked.rev, undefined);
  assert.equal(picked.revBy, undefined);
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
});

test('merge: preserva dayTargetSnapshot e customTargets', () => {
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
  assert.deepEqual(next.log, [{ id: 'new' }]);
  assert.equal(next.rev, 4);
  assert.equal(next.revBy, 'u2');
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
