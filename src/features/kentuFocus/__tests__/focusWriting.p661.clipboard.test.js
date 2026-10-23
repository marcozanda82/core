/**
 * P6.6.1 — clipboard JSON revisione Gemini anche se respinta (zero chiamate reali).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFocusGeminiReviewClipboardPayload,
  runFocusGeminiPreview,
} from '../editorial/writing/index.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';

function minimalSelection() {
  return {
    schemaVersion: '1.0.0',
    analysisDate: '2026-10-17',
    publicationDate: '2026-10-18',
    editionKind: 'sunday_plus',
    openingMode: 'progress',
    lead: {
      id: 'news_a',
      role: 'lead',
      tone: 'neutral',
      claimType: 'calculated',
      domain: 'sleep',
      headlineSeed: 'Lead',
      summarySeed: 'Sommario lead.',
      refs: ['sleep.x'],
      metrics: [{ path: 'sleep.x', value: 1, unit: null, provenance: 'calculated' }],
      limitations: ['limite lead obbligatorio abbastanza lungo'],
      doNotClaim: ['divieto lead'],
      evidenceQuality: 'high',
    },
    centerpiece: null,
    goodNews: [],
    features: [],
    concerns: [],
    coach: null,
    omitted: [],
    editorialNotes: [],
    caps: {},
  };
}

describe('P6.6.1 clipboard revisione Gemini (respinta)', () => {
  it('payload disponibile con raw + articoli autorizzati + errori, senza diario', async () => {
    const selection = minimalSelection();
    // Articolo con placeholder sconosciuto → reject
    const badWritten = {
      schemaVersion: '1.0.0',
      kind: 'FocusWrittenEdition',
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
      openingMode: 'progress',
      articles: [{
        id: 'news_a',
        role: 'lead',
        title: 'Titolo accettabile',
        body: 'Corpo abbastanza lungo con riferimento ignoto {{path.inesistente.zzz}} nel testo.',
        evidenceIds: ['sleep.x'],
        metricsCited: selection.lead.metrics,
        cautions: [],
        selectionIndex: 0,
      }],
      coach: null,
      mastheadTeaser: 'Teaser',
    };
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(badWritten) }],
    });
    const result = await runFocusGeminiPreview({ selection, geminiProvider: provider });
    assert.equal(result.ok, false);
    assert.ok(result.rawAiOutput);

    const clip = buildFocusGeminiReviewClipboardPayload(result);
    assert.ok(clip);
    assert.equal(clip.kind, 'FocusGeminiReviewClipboard');
    assert.equal(clip.rawAiAvailableInSession, true);
    assert.ok(String(clip.geminiRawResponse).includes('FocusWrittenEdition'));
    assert.ok(clip.authorizedArticles.some((a) => a.id === 'news_a'));
    assert.ok(clip.validationErrors.some((e) => /unresolved_metric_placeholder|placeholder_not_in/.test(e)));
    const blob = JSON.stringify(clip);
    assert.equal(/fullHistory|personalNotes|firebaseConfig/i.test(blob), false);
  });

  it('null se non c’è anteprima in stato', () => {
    assert.equal(buildFocusGeminiReviewClipboardPayload(null), null);
  });
});
