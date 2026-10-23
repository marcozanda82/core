/**
 * P6.6.1 — contratto cautele: conflitto max vs obblighi, match naturale (FakeGemini).
 * Zero chiamate Gemini reali.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import {
  FOCUS_AGGREGATE_BOILERPLATE_LIMITATIONS,
  FOCUS_WRITING_LIMITS,
  runFocusGeminiPreview,
  selectRequiredCautionsForArticle,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import {
  classifyArticleCautionLayers,
  isMandatoryContextSatisfied,
} from '../editorial/writing/focusCautionContract.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';

const AGG_LIMITS = [...FOCUS_AGGREGATE_BOILERPLATE_LIMITATIONS];

function centerpieceItem() {
  return {
    id: 'news_week_habits_story',
    role: 'centerpiece',
    tone: 'neutral',
    claimType: 'calculated',
    domain: 'nutrition',
    headlineSeed: 'Proteine medie settimanali',
    summarySeed: 'Media circa 145 g; scostamento moderato vs settimana precedente.',
    refs: ['edition.week.nutrition.avgProteinG'],
    metrics: [
      {
        path: 'edition.week.nutrition.avgProteinG',
        value: 145.06,
        unit: 'g',
        provenance: 'calculated',
      },
      {
        path: 'edition.week.comparison.deltas.avgProteinG',
        value: -12.1,
        unit: 'g',
        provenance: 'calculated',
      },
    ],
    evidenceQuality: 'high',
    limitations: [
      ...AGG_LIMITS,
      'Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente. '
        + 'Differenze di conteggio possono riflettere copertura diversa, non solo comportamento.',
      'Nessuna causalità tra domini senza evidenza dedicata',
    ],
    doNotClaim: [
      'correlazione causale inventata',
      'diagnosi',
      'inattività da assenza di log',
      'conclusione corporea da misure vecchie',
    ],
  };
}

function selectionWithHeavyCenterpiece() {
  return {
    schemaVersion: '1.0.0',
    analysisDate: '2026-10-17',
    publicationDate: '2026-10-18',
    editionKind: 'sunday_plus',
    openingMode: 'progress',
    lead: {
      id: 'news_sleep_weekly_rhythm',
      role: 'lead',
      tone: 'neutral',
      claimType: 'calculated',
      domain: 'sleep',
      headlineSeed: 'Sveglia feriale e weekend',
      summarySeed: 'Ritmo sveglia distinto.',
      refs: ['sleepRoutine.week.wakeMedian'],
      metrics: [
        { path: 'sleepRoutine.week.wakeMedian', value: 7.2, unit: 'h', provenance: 'calculated' },
      ],
      limitations: ['non è diagnosi del sonno'],
      doNotClaim: ['cura del sonno'],
      evidenceQuality: 'high',
    },
    centerpiece: centerpieceItem(),
    goodNews: [],
    features: [],
    concerns: [],
    coach: null,
    omitted: [],
    editorialNotes: [],
    caps: {},
  };
}

function baseWritten(selection, centerpieceCautions) {
  return {
    schemaVersion: selection.schemaVersion,
    kind: 'FocusWrittenEdition',
    analysisDate: selection.analysisDate,
    publicationDate: selection.publicationDate,
    openingMode: selection.openingMode,
    articles: [
      {
        id: selection.lead.id,
        role: 'lead',
        title: 'Sveglie diverse tra feriali e weekend',
        body: 'Il ritmo della sveglia cambia tra feriali e weekend, intorno a {{sleepRoutine.week.wakeMedian}}. '
          + 'Non è una cura del sonno né una diagnosi del sonno.',
        evidenceIds: ['sleepRoutine.week.wakeMedian'],
        metricsCited: selection.lead.metrics,
        cautions: ['non è diagnosi del sonno', 'cura del sonno'],
        selectionIndex: 0,
      },
      {
        id: selection.centerpiece.id,
        role: 'centerpiece',
        title: 'Un calo moderato nelle proteine medie',
        body: 'Media {{edition.week.nutrition.avgProteinG}} g, scostamento '
          + '{{edition.week.comparison.deltas.avgProteinG}} g rispetto alla finestra precedente. '
          + 'Non implica correlazione causale inventata, diagnosi, inattività da assenza di log '
          + 'né conclusione corporea da misure vecchie. Nessuna causalità tra domini senza evidenza dedicata. '
          + 'Il confronto non è un mese solare precedente.',
        evidenceIds: selection.centerpiece.refs,
        metricsCited: selection.centerpiece.metrics,
        cautions: centerpieceCautions,
        selectionIndex: 1,
      },
    ],
    coach: null,
    mastheadTeaser: 'Settimana tra ritmi e proteine',
  };
}

describe('P6.6.1 contratto cautele — diagnosi conflitto', () => {
  it('obblighi grezzi (doNotClaim+tutte limitations) superano cautionsMax', () => {
    const item = centerpieceItem();
    const rawCount = (item.doNotClaim.length + item.limitations.length);
    assert.ok(rawCount > FOCUS_WRITING_LIMITS.cautionsMax);
    assert.equal(rawCount, 12);
  });

  it('selectRequiredCautionsForArticle: solo mandatory, senza doNotClaim/boilerplate', () => {
    const req = selectRequiredCautionsForArticle(centerpieceItem());
    const layers = classifyArticleCautionLayers(centerpieceItem());
    assert.ok(req.length <= FOCUS_WRITING_LIMITS.cautionsMax);
    assert.equal(req.includes('diagnosi'), false);
    for (const b of AGG_LIMITS) {
      assert.equal(req.includes(b), false, `boilerplate non richiesto: ${b}`);
    }
    assert.ok(layers.doNotClaim.includes('diagnosi'));
    assert.ok(req.some((r) => /finestra|mese solare|causalità tra domini/i.test(r)));
  });

  it('AiBrief: mandatoryContext senza doNotClaim obbligatori', () => {
    const selection = selectionWithHeavyCenterpiece();
    const brief = buildFocusAiBrief({ selection });
    const req = brief.selection.centerpiece.requiredCautions;
    assert.ok(req.length <= FOCUS_WRITING_LIMITS.cautionsMax);
    assert.equal(req.includes('diagnosi'), false);
    assert.ok((brief.selection.centerpiece.mandatoryContext || []).length >= 1);
    assert.ok((brief.selection.centerpiece.contextualLimitations || []).length > 0);
    assert.ok(brief.selection.centerpiece.doNotClaim.includes('diagnosi'));
  });
});

describe('P6.6.1 validazione — riproduzione errori e casi naturali', () => {
  it('riproduce too_many + mandatory_context_missing', () => {
    const selection = selectionWithHeavyCenterpiece();
    const bloated = Array.from({ length: 9 }, (_, i) => `cautela parafrasata generica numero ${i + 1}`);
    const doc = baseWritten(selection, bloated);
    doc.articles[1].body = 'Media {{edition.week.nutrition.avgProteinG}} g con scostamento '
      + '{{edition.week.comparison.deltas.avgProteinG}} g. Osservazione neutra senza limiti.';
    const v = validateFocusWrittenEdition(doc, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('articles[1]_cautions_too_many'));
    assert.ok(v.errors.some((e) => e.startsWith('mandatory_context_missing:')));
  });

  it('cautele naturali in prosa + lista breve → ok', () => {
    const selection = selectionWithHeavyCenterpiece();
    // Poche voci in cautions[]; il corpo copre doNotClaim e limiti interpretativi
    const doc = baseWritten(selection, [
      'Nessuna causalità tra domini senza evidenza dedicata',
      'Confronto su finestra equivalente, non mese solare precedente',
    ]);
    const v = validateFocusWrittenEdition(doc, { selection });
    assert.equal(v.ok, true, v.errors?.join(', '));
  });

  it('isMandatoryContextSatisfied: parafrasi finestra; assenza respinta', () => {
    assert.equal(
      isMandatoryContextSatisfied(
        { id: 'equal_length_window_not_calendar_month', sourceText: 'Non è un mese solare precedente…' },
        ['Confronto su finestra equivalente, non mese solare'],
        '',
        '',
      ),
      true,
    );
    assert.equal(
      isMandatoryContextSatisfied(
        { id: 'equal_length_window_not_calendar_month', sourceText: 'Non è un mese solare precedente…' },
        [],
        'Titolo',
        'Solo una media settimanale senza contesto di confronto.',
      ),
      false,
    );
  });

  it('FakeGemini: centerpiece con cautele naturali accettato', async () => {
    const selection = selectionWithHeavyCenterpiece();
    const written = baseWritten(selection, [
      'Nessuna causalità tra domini senza evidenza dedicata',
      'Non è un mese solare precedente: finestra equivalente',
    ]);
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(written) }],
    });
    const result = await runFocusGeminiPreview({
      selection,
      geminiProvider: provider,
    });
    assert.equal(result.ok, true, result.aiValidation?.errors?.join(', '));
    assert.equal(result.callCount, 1);
  });

  it('FakeGemini: too_many ancora respinto (limite conservato)', async () => {
    const selection = selectionWithHeavyCenterpiece();
    const written = baseWritten(
      selection,
      Array.from({ length: 9 }, (_, i) => `cautela ${i} diagnosi correlazione causale inventata inattività da assenza di log conclusione corporea da misure vecchie causalità`),
    );
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(written) }],
    });
    const result = await runFocusGeminiPreview({
      selection,
      geminiProvider: provider,
    });
    assert.equal(result.ok, false);
    assert.ok(result.aiValidation.errors.includes('articles[1]_cautions_too_many'));
  });
});
