/**
 * P6.7.3d — tre errori di contesto sul raw autentico 16:14.
 * Fonte: geminiRawResponse_20261020_161410.txt
 * Offline. Zero Gemini / Firebase.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyArticleCautionLayers,
  evaluateProteinDeltaDeficitGuard,
  isMandatoryContextSatisfied,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL = path.join(ROOT, 'geminiRawResponse_20261020_161410.txt');

function loadClip() {
  assert.ok(fs.existsSync(REAL), 'geminiRawResponse_20261020_161410.txt deve essere in root');
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

describe('P6.7.3d export reale 16:14', () => {
  it('meta autentica e tre errori storici documentati', () => {
    const clip = loadClip();
    assert.equal(clip.schema, 'kentu.focusGeminiPreview.v1');
    assert.equal(clip.exportedAt, '2026-10-20T16:14:10.422Z');
    assert.ok(clip.authorizedArticles?.length >= 2);
    assert.ok(clip.geminiRawResponse);
    assert.deepEqual(clip.validationErrors, [
      'mandatory_context_missing:equal_length_window_not_calendar_month',
      'mandatory_context_missing:no_domain_causality_without_evidence',
      'mandatory_context_missing:protein_delta_not_proven_deficit',
    ]);
  });

  it('raw autentico → ok:true dopo fix (testo invariato)', () => {
    const clip = loadClip();
    const sel = selectionFromClip(clip);
    const rawString = String(clip.geminiRawResponse);
    const raw = JSON.parse(rawString);
    const snapshot = JSON.stringify(raw);
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(JSON.stringify(raw), snapshot);
    assert.equal(v.ok, true, v.errors.join(' | '));
    assert.equal(v.errors.length, 0);
  });

  it('classificazione: causalità cross-domain non mandatory su centerpiece monodominio', () => {
    const clip = loadClip();
    const cp = selectionFromClip(clip).centerpiece;
    const paths = (cp.metrics || []).map((m) => m.path);
    assert.equal(paths.some((p) => /sleep|activity|strength/i.test(p)), false);
    const layers = classifyArticleCautionLayers(cp);
    assert.ok(layers.mandatoryContext.some((m) => m.id === 'equal_length_window_not_calendar_month'));
    assert.equal(
      layers.mandatoryContext.some((m) => m.id === 'no_domain_causality_without_evidence'),
      false,
    );
    assert.ok(layers.contextualLimitations.some((s) => /causalit/i.test(s) && /domini/i.test(s)));
  });
});

describe('P6.7.3d parafrasi e regressioni', () => {
  const windowCtx = {
    id: 'equal_length_window_not_calendar_month',
    sourceText: 'Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente.',
  };

  it('riconosce finestra di pari durata / mese di calendario / equivalenti', () => {
    assert.equal(
      isMandatoryContextSatisfied(
        windowCtx,
        [],
        'T',
        'Confronto con la finestra precedente di pari durata (4–10 ottobre).',
      ),
      true,
    );
    assert.equal(
      isMandatoryContextSatisfied(
        windowCtx,
        ['Il confronto è calcolato sui sette giorni immediatamente precedenti e non sull\'intero mese di calendario.'],
        'T',
        'Media proteica in calo.',
      ),
      true,
    );
    assert.equal(
      isMandatoryContextSatisfied(
        windowCtx,
        [],
        'T',
        'Due intervalli temporali equivalenti consecutivi.',
      ),
      false,
    );
    // senza finestra né mese: non basta «equivalenti» da solo nel satisfied attuale se manca finestra —
    // body reale ha entrambe; regressione: confronto mese solare sbagliato resta fail se solo date
    assert.equal(
      isMandatoryContextSatisfied(windowCtx, [], 'T', 'Media 145 g rispetto a settembre.'),
      false,
    );
  });

  it('riconosce «non costituisce di per sé un deficit nutrizionale»', () => {
    const item = {
      metrics: [{ path: 'edition.week.comparison.deltas.avgProteinG', value: -12.1, unit: 'g' }],
      storySpine: {
        mainFactId: 'week_protein_intake_shift',
        mainMetricPath: 'edition.week.comparison.deltas.avgProteinG',
      },
    };
    const body = 'Lo scostamento non costituisce di per sé un deficit nutrizionale né attesta effetti sull\'organismo.';
    assert.deepEqual(evaluateProteinDeltaDeficitGuard(item, 'Calo', body, []), []);
  });

  it('resta rifiutato un deficit proteico affermato senza prova', () => {
    const item = {
      metrics: [{ path: 'edition.week.comparison.deltas.avgProteinG', value: -12.1, unit: 'g' }],
      storySpine: {
        mainFactId: 'week_protein_intake_shift',
        mainMetricPath: 'edition.week.comparison.deltas.avgProteinG',
      },
    };
    const hits = evaluateProteinDeltaDeficitGuard(
      item,
      'Calo',
      'Quindi c’è un deficit proteico.',
      [],
    );
    assert.ok(hits.some((e) => /protein_deficit|protein_delta/.test(e)), hits.join(' | '));
  });

  it('causalità cross-domain resta mandatory se autorizzati più domini', () => {
    const layers = classifyArticleCautionLayers({
      limitations: ['Nessuna causalità tra domini senza evidenza dedicata'],
      metrics: [
        { path: 'edition.week.nutrition.avgProteinG', value: 140, unit: 'g' },
        { path: 'edition.week.sleep.avgHours', value: 7, unit: 'h' },
      ],
      doNotClaim: [],
    });
    assert.ok(layers.mandatoryContext.some((m) => m.id === 'no_domain_causality_without_evidence'));
  });

  it('metrica sonno non autorizzata nel centerpiece proteico → reject', () => {
    const clip = loadClip();
    const sel = selectionFromClip(clip);
    const raw = JSON.parse(String(clip.geminiRawResponse));
    const cpArt = raw.articles.find((a) => a.id === sel.centerpiece.id);
    cpArt.metricsCited = [
      ...cpArt.metricsCited,
      {
        path: 'edition.week.sleep.nightsLogged',
        value: 6,
        unit: 'nights',
        provenance: 'calculated',
      },
    ];
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes('metric_not_authorized_edition.week.sleep.nightsLogged')));
  });

  it('Δ proteico principale mancante nello spine → story_spine error se validato', () => {
    const clip = loadClip();
    const sel = selectionFromClip(clip);
    const raw = JSON.parse(String(clip.geminiRawResponse));
    const cpArt = raw.articles.find((a) => a.id === sel.centerpiece.id);
    // rimuove la metrica Δ dal cited — alimenta story spine check se presente
    cpArt.metricsCited = (cpArt.metricsCited || []).filter(
      (m) => m.path !== 'edition.week.comparison.deltas.avgProteinG',
    );
    cpArt.body = cpArt.body.replace('12,1', 'zero');
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(v.ok, false);
    assert.ok(
      v.errors.some((e) => /story_spine|main_story_fact|main_metric|unauthorized_number|metric/i.test(e)),
      v.errors.join(' | '),
    );
  });
});
