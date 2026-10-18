/**
 * P3.3 — misura UTF-8 senza Buffer obbligatorio (Node + browser).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  measureJsonBytes,
  utf8ByteLength,
} from '../sanitize/rtdbSanitize.js';
import { validateFocusEditionRevision } from '../validate/validateFocusEdition.js';

test('P3.3 utf8ByteLength: ASCII / accenti / emoji equivalenti a Buffer', () => {
  const samples = [
    '',
    'hello',
    'caffè',
    'àèéìòù',
    '🙂',
    'Focus — edizione',
    'a'.repeat(1000),
    JSON.stringify({ a: 1, b: ['x', 'ü', '🔥'], n: null }),
  ];
  for (const s of samples) {
    assert.equal(utf8ByteLength(s), Buffer.byteLength(s, 'utf8'), `mismatch for ${s.slice(0, 24)}`);
  }
});

test('P3.3 measureJsonBytes: oggetti/array, parità con Buffer.byteLength(JSON)', () => {
  const cases = [
    null,
    { a: 1 },
    { s: 'caffè', e: '🙂' },
    [1, 2, 'ü'],
    { nested: { arr: [{ k: 'ok' }] } },
  ];
  for (const c of cases) {
    const viaEncoder = measureJsonBytes(c);
    const viaBuffer = Buffer.byteLength(JSON.stringify(c), 'utf8');
    assert.equal(viaEncoder, viaBuffer);
  }
});

test('P3.3 validazione senza Buffer globale: no payload_measure_failed', () => {
  const real = globalThis.Buffer;
  // @ts-ignore
  delete globalThis.Buffer;
  try {
    assert.equal(typeof Buffer, 'undefined');
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
      inputFingerprint: 'p33',
      dossierContentHash: 'p33',
      publishedAt: '2026-10-18T08:00:00.000Z',
      editorialNotes: [],
      technicalOnly: true,
    };
    const v = validateFocusEditionRevision(doc);
    assert.equal(v.errors.includes('payload_measure_failed'), false);
    assert.equal(v.ok, true);
    const bytes = measureJsonBytes(doc);
    assert.ok(Number.isInteger(bytes) && bytes > 0);
  } finally {
    globalThis.Buffer = real;
  }
});
