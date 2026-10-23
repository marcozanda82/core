/**
 * P6.6.5 — falso positivo forbidden_claim su negazione esplicita di deficit.
 * Fonte: geminiRawResponse_20261020_071722.txt (exportedAt 2026-10-20T07:17:22.437Z).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  detectForbiddenClaims,
  evaluateProteinDeltaDeficitGuard,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL = path.join(ROOT, 'geminiRawResponse_20261020_071722.txt');

function loadRealClip() {
  assert.ok(fs.existsSync(REAL), 'geminiRawResponse_20261020_071722.txt deve essere in root');
  return JSON.parse(fs.readFileSync(REAL, 'utf8'));
}

function selectionFromClip(clip) {
  const arts = clip.authorizedArticles || [];
  return {
    schemaVersion: '1.0.0',
    analysisDate: clip.dates?.analysisDate,
    publicationDate: clip.dates?.publicationDate,
    editionKind: clip.editionKind,
    openingMode: 'progress',
    lead: arts.find((a) => a.role === 'lead') || null,
    centerpiece: arts.find((a) => a.role === 'centerpiece') || null,
    goodNews: arts.filter((a) => a.role === 'good'),
    features: arts.filter((a) => a.role === 'feature'),
    concerns: arts.filter((a) => a.role === 'concern'),
    coach: null,
    editorialNotes: [],
  };
}

describe('P6.6.5 export reale 07:17', () => {
  it('meta export e errore storico unico', () => {
    const clip = loadRealClip();
    assert.equal(clip.schema, 'kentu.focusGeminiPreview.v1');
    assert.equal(clip.exportedAt, '2026-10-20T07:17:22.437Z');
    assert.ok(clip.geminiRawResponse);
    assert.deepEqual(clip.validationErrors, [
      'articles[1]_forbidden_claim_detected:protein_deficit',
    ]);
  });

  it('ramo: detectForbiddenClaims (non il guard P6.6.3)', () => {
    const clip = loadRealClip();
    const sel = selectionFromClip(clip);
    const raw = JSON.parse(clip.geminiRawResponse);
    const a = raw.articles[1];
    assert.match(a.body, /non costituisce un deficit proteico/i);
    const guard = evaluateProteinDeltaDeficitGuard(sel.centerpiece, a.title, a.body, a.cautions);
    assert.equal(guard.length, 0, guard.join(' | '));
    // Pre-fix diagnostica: senza negate ampio il claim scatta (coperta dal fix attuale: passa)
    const hits = detectForbiddenClaims(sel.centerpiece.doNotClaim, a.title, a.body);
    assert.equal(hits.includes('forbidden_claim_detected:protein_deficit'), false, hits.join(' | '));
  });

  it('raw autentico → ok:true dopo fix (testo invariato)', () => {
    const clip = loadRealClip();
    const sel = selectionFromClip(clip);
    const rawString = String(clip.geminiRawResponse);
    const raw = JSON.parse(rawString);
    const snapshot = JSON.stringify(raw);
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(JSON.stringify(raw), snapshot);
    assert.equal(v.ok, true, v.errors.join(' | '));
    assert.equal(v.errors.length, 0);
  });
});

describe('P6.6.5 negazioni ammesse vs affermazioni vietate', () => {
  const dnc = ['deficit proteico', 'peggioramento fisiologico'];

  it('ammette negazioni esplicite non ambigue', () => {
    const cases = [
      'Lo scostamento non costituisce un deficit proteico.',
      'Il calo non implica un deficit proteico.',
      'Il dato non dimostra una carenza nutrizionale.',
      'La media non definisce un deficit proteico.',
    ];
    for (const body of cases) {
      const hits = detectForbiddenClaims(dnc, 'Calo', body);
      assert.equal(
        hits.includes('forbidden_claim_detected:protein_deficit'),
        false,
        body,
      );
    }
  });

  it('un «non» generico nel paragrafo non basta a salvare un claim', () => {
    const body = 'Non è una giornata tipica: questo dimostra un deficit proteico.';
    const hits = detectForbiddenClaims(dnc, 'Calo', body);
    assert.ok(hits.includes('forbidden_claim_detected:protein_deficit'), hits.join(' | '));
  });

  it('resta vietata l\'affermazione di deficit / carenza / peggioramento', () => {
    const cases = [
      ['Questo dimostra un deficit proteico.', 'protein_deficit'],
      ['La riduzione comporta una carenza nutrizionale.', 'protein_deficit'],
      ['Si osserva un peggioramento fisiologico.', 'peggioramento_fisiologico'],
    ];
    for (const [body, id] of cases) {
      const hits = detectForbiddenClaims(dnc, 'Titolo', body);
      assert.ok(
        hits.includes(`forbidden_claim_detected:${id}`),
        `${body} → ${hits.join(' | ')}`,
      );
    }
  });
});
