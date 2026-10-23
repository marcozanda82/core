/**
 * Stato banco Gemini — sempre leggibile; zero chiamate / zero persistenza.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeFocusGeminiBenchStatus } from '../lab/focusGeminiBenchStatus.js';
import { buildFocusGeminiReviewClipboardPayload } from '../editorial/writing/runFocusGeminiPreview.js';

describe('focusGeminiBenchStatus', () => {
  it('senza 1ª selezione: stato perso / awaiting, C logica showDiagnostics', () => {
    const s = describeFocusGeminiBenchStatus({
      editorialFirst: null,
      geminiPreview: null,
    });
    assert.equal(s.code, 'awaiting_first_selection');
    assert.equal(s.sessionHasGeminiResult, false);
    assert.equal(s.canCopyReviewJson, false);
    assert.equal(s.showDiagnostics, true);
    assert.match(s.detail, /non è recuperabile|hot-reload/i);
  });

  it('dopo reject in sessione: copia JSON abilitata', () => {
    const preview = {
      ok: false,
      status: 'gemini_rejected_or_unavailable',
      rawAiOutput: '{"kind":"FocusWrittenEdition"}',
      reviewJson: { schema: 'kentu.focusGeminiPreview.v1' },
      aiValidation: { ok: false, errors: ['articles[0]_missing_required_caution'] },
      proseSource: 'fallback',
      callCount: 1,
      model: 'gemini-3.8-flash',
    };
    const clip = buildFocusGeminiReviewClipboardPayload(preview);
    const s = describeFocusGeminiBenchStatus({
      editorialFirst: { ok: true, mode: 'first' },
      geminiEligibility: { ok: true },
      geminiPreview: preview,
      hasReviewClipboard: Boolean(clip),
    });
    assert.equal(s.code, 'rejected_in_session');
    assert.equal(s.canCopyReviewJson, true);
    assert.equal(s.sessionHasGeminiResult, true);
    assert.ok(clip.geminiRawResponse);
    assert.ok(clip.validationErrors.includes('articles[0]_missing_required_caution'));
  });

  it('1ª selezione ok senza generazione: ready_no_generation', () => {
    const s = describeFocusGeminiBenchStatus({
      editorialFirst: { ok: true, mode: 'first' },
      geminiEligibility: { ok: true },
      geminiPreview: null,
    });
    assert.equal(s.code, 'ready_no_generation');
    assert.equal(s.canCopyReviewJson, false);
  });
});
