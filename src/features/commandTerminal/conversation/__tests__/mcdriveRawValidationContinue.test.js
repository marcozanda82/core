/**
 * Contratto validazione bozza: solo `raw` è processabile; `requires_disambiguation`
 * non deve bloccare gli altri (allineato a processNextRawMcdriveItem).
 * Non importa mcdriveWizard.js (grafo pesante / ESM).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function findNextRawMcDriveIndex(items = []) {
  return (Array.isArray(items) ? items : [])
    .findIndex((item) => String(item?.status || '').toLowerCase() === 'raw');
}

function draftHasRawMcDriveItems(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => {
    const status = String(item?.status || '').toLowerCase();
    return status === 'raw' || status === 'processing' || status === 'validating';
  });
}

function hasPendingMcDriveEnrichment(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => {
    const status = String(item?.status || '').toLowerCase();
    return status === 'requires_disambiguation' || status === 'pending_enrichment';
  });
}

test('findNextRawMcDriveIndex salta requires_disambiguation', () => {
  const items = [
    { id: '1', status: 'requires_disambiguation', foodName: 'xyz' },
    { id: '2', status: 'resolved', foodName: 'mela' },
    { id: '3', status: 'raw', foodName: 'kiwi' },
  ];
  assert.equal(findNextRawMcDriveIndex(items), 2);
  assert.equal(draftHasRawMcDriveItems(items), true);
  assert.equal(hasPendingMcDriveEnrichment(items), true);
});

test('dopo tutti da scegliere, nessun raw resta (loop può terminare)', () => {
  const items = [
    { id: '1', status: 'requires_disambiguation', foodName: 'a', choiceHint: 'da_scegliere' },
    { id: '2', status: 'resolved', foodName: 'mela' },
    { id: '3', status: 'requires_disambiguation', foodName: 'b', choiceHint: 'da_scegliere' },
  ];
  assert.equal(findNextRawMcDriveIndex(items), -1);
  assert.equal(draftHasRawMcDriveItems(items), false);
  assert.equal(hasPendingMcDriveEnrichment(items), true);
});
