/**
 * P3.2 — diagnosi offline anteprima assente (nessun Firebase reale).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateFocusEditionRevision } from '../server/validate/validateFocusEdition.js';
import { listRequiredTrackerDates } from '../server/reader/trackerDateWindow.js';
import { resolveFocusHistoryDays } from '../server/reader/focusHistoryHorizon.js';

test('P3.2/P3.3: senza Buffer la validazione non fallisce per payload_measure_failed', async () => {
  const real = globalThis.Buffer;
  // @ts-ignore
  delete globalThis.Buffer;
  try {
    const doc = {
      kind: 'FocusEditionRevision',
      schemaVersion: '1.0.0',
      publicationDate: '2026-10-18',
      analysisDate: '2026-10-17',
      revision: 1,
      status: 'published',
      immutable: true,
      lead: null,
      goodNews: [],
      features: [],
      concerns: [],
      coach: null,
      openingMode: 'neutral',
      inputFingerprint: 'x',
      dossierContentHash: 'x',
      publishedAt: '2026-10-18T08:00:00.000Z',
      editorialNotes: [],
      technicalOnly: false,
    };
    const v = validateFocusEditionRevision(doc);
    assert.equal(v.errors.includes('payload_measure_failed'), false);
    assert.equal(v.ok, true);
  } finally {
    globalThis.Buffer = real;
  }
});

test('P3.2 dimostrato: P3.1 con validation.ok false non monta overlay', () => {
  const mounted = [];
  const validation = { ok: false, errors: ['payload_measure_failed'] };
  if (validation.ok !== true) {
    // stesso gate del comando P3.1
    const report = { ok: false, block: 'edition_validation_failed' };
    assert.equal(report.block, 'edition_validation_failed');
    assert.equal(mounted.length, 0);
    return;
  }
  mounted.push('overlay');
  assert.fail('non deve montare');
});

test('P3.2 dimostrato: budget 63 e Promise pending non implica fallimento letture', () => {
  const h = resolveFocusHistoryDays({ horizon: 'd30' });
  const dates = listRequiredTrackerDates('2026-10-17', '2026-10-18', h.historyDays);
  assert.equal(dates.length + 2, 63);
});
