/**
 * P6.6.3 — diagnosi raw reale 20/10/2026 (offline).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateProteinDeltaDeficitGuard,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { detectMetricUnitMismatches } from '../editorial/writing/focusMetricUnitGuard.js';
import {
  FOCUS_GEMINI_RAW_SUNDAY_1810_V2_META,
  buildSunday1810V2AuthorizedSelection,
  buildSunday1810V2RejectedRawEdition,
} from './fixtures/focusGeminiRawSunday1810.v2.minimized.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL = path.join(ROOT, 'geminiRawResponse_20261020.txt');

describe('P6.6.3 raw reale 20/10 — meta e allineamento', () => {
  it('fixture allineata a geminiRawResponse_20261020.txt', () => {
    assert.ok(fs.existsSync(REAL));
    const clip = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    assert.equal(clip.schema, 'kentu.focusGeminiPreview.v1');
    assert.equal(clip.exportedAt, '2026-10-20T05:03:11.364Z');
    assert.deepEqual(FOCUS_GEMINI_RAW_SUNDAY_1810_V2_META.historicalValidationErrors, [
      'mandatory_context_missing:protein_delta_not_proven_deficit',
      'articles[1]_unauthorized_number_in_prose',
      'metric_unit_mismatch',
    ]);
    const realRaw = JSON.parse(clip.geminiRawResponse);
    const fixture = buildSunday1810V2RejectedRawEdition();
    assert.equal(fixture.articles[1].body, realRaw.articles[1].body);
    assert.equal(fixture.articles[3].title, realRaw.articles[3].title);
  });
});

describe('P6.6.3 deficit guard — falso positivo vs veri errori', () => {
  it('«non definisce un deficit» + caution → non produce mandatory_context_missing', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    const a = raw.articles[1];
    assert.match(a.body, /non definisce un deficit/i);
    const guard = evaluateProteinDeltaDeficitGuard(sel.centerpiece, a.title, a.body, a.cautions);
    assert.equal(
      guard.includes('mandatory_context_missing:protein_delta_not_proven_deficit'),
      false,
      guard.join(' | '),
    );
  });

  it('affermazione indebita di deficit resta rifiutata', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const hits = evaluateProteinDeltaDeficitGuard(
      sel.centerpiece,
      'Calo proteico',
      'Media 145.06 g con calo di 12.1 g: quindi c\'è un deficit proteico.',
      [],
    );
    assert.ok(hits.some((e) => /forbidden_claim_detected:protein_deficit/.test(e)));
  });
});

describe('P6.6.3 numero «4» da intervallo 4–10 ottobre', () => {
  it('dopo fix allowlist date, «4-10 ottobre» non genera unauthorized_number', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(
      v.errors.some((e) => e.includes('unauthorized_number_in_prose')),
      false,
      v.errors.join(' | '),
    );
  });

  it('numero davvero estraneo resta rifiutato', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    raw.articles[1].body += ' Valore inventato 999 kcal.';
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.ok(v.errors.some((e) => /unauthorized_number_in_prose:.*999/.test(e)));
  });
});

describe('P6.6.3 unità forza — regressione titolo reale', () => {
  it('titolo «Quattordici sessioni…» → metric_unit_mismatch (errore Gemini vero)', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    const feat = raw.articles[3];
    assert.match(feat.title, /Quattordici sessioni di forza/i);
    assert.match(feat.body, /14 giornate con sessioni/i);
    const hits = detectMetricUnitMismatches(sel.features[0], feat.title, feat.body);
    assert.ok(hits.includes('metric_unit_mismatch'));
  });
});

describe('P6.6.3 validazione raw dopo correzioni validatore', () => {
  it('restano solo errori veri di Gemini (unità titolo)', () => {
    const sel = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('metric_unit_mismatch'));
    assert.equal(
      v.errors.some((e) => e.includes('protein_delta_not_proven_deficit')),
      false,
    );
    assert.equal(
      v.errors.some((e) => e.includes('unauthorized_number_in_prose')),
      false,
    );
  });
});
