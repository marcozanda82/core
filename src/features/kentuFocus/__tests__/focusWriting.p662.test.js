/**
 * P6.6.2 finalizzazione — storySpine, unità titolo, deficit condizionale (offline).
 * Fonte: geminiRawResponse.txt → fixture minimizzata.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyArticleCautionLayers,
  detectForbiddenClaims,
  evaluateProteinDeltaDeficitGuard,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { detectMetricUnitMismatches } from '../editorial/writing/focusMetricUnitGuard.js';
import { describeFocusGeminiBenchStatus } from '../lab/focusGeminiBenchStatus.js';
import {
  FOCUS_GEMINI_RAW_SUNDAY_1810_META,
  buildSunday1810AcceptedEdition,
  buildSunday1810AuthorizedSelection,
  buildSunday1810RejectedRawEdition,
} from './fixtures/focusGeminiRawSunday1810.minimized.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL_REVIEW_PATH = path.join(ROOT, 'geminiRawResponse.txt');

describe('P6.6.2 classificazione cautele', () => {
  it('separa doNotClaim / mandatoryContext / contextualLimitations', () => {
    const sel = buildSunday1810AuthorizedSelection();
    const layers = classifyArticleCautionLayers(sel.centerpiece);
    assert.ok(layers.doNotClaim.includes('diagnosi'));
    assert.ok(layers.doNotClaim.includes('deficit proteico'));
    assert.ok(layers.mandatoryContext.some((m) => m.id === 'equal_length_window_not_calendar_month'));
    // «≠ deficit» è writer-only, non mandatory di stampa
    assert.equal(
      layers.mandatoryContext.some((m) => m.id === 'protein_delta_not_proven_deficit'),
      false,
    );
    assert.ok(layers.contextualLimitations.some((s) => /deficit dimostrato|Giorno senza log/.test(s)));
  });

  it('doNotClaim rispettato senza ripetizione; «non dimostra sedentarietà» non è violazione', () => {
    const hits = detectForbiddenClaims(
      ['inattività da assenza di log', 'sedentarietà'],
      'Continuità forza',
      'L’assenza di log non dimostra sedentarietà né inattività.',
    );
    assert.equal(hits.length, 0);
  });

  it('forbidden_claim quando si afferma davvero una diagnosi', () => {
    const hits = detectForbiddenClaims(
      ['diagnosi'],
      'Titolo',
      'Questa è una diagnosi: ti diagnostico un disturbo del sonno.',
    );
    assert.ok(hits.some((h) => h.includes('forbidden_claim_detected')));
  });
});

describe('P6.6.2 storySpine — fatto centrale', () => {
  it('spine struttura media / Δ / periodi / copertura in modo distinto', () => {
    const spine = buildSunday1810AuthorizedSelection().centerpiece.storySpine;
    assert.equal(spine.mainMetricPath, 'edition.week.comparison.deltas.avgProteinG');
    assert.equal(spine.mainMetricValue, -12.1);
    assert.equal(spine.mainUnit, 'g');
    assert.equal(spine.levelMetricPath, 'edition.week.nutrition.avgProteinG');
    assert.equal(spine.levelMetricValue, 145.06);
    assert.equal(spine.periodFrom, '2026-10-11');
    assert.equal(spine.periodTo, '2026-10-17');
    assert.equal(spine.comparisonFrom, '2026-10-04');
    assert.equal(spine.comparisonTo, '2026-10-10');
    assert.equal(spine.coverageMetricValue, 7);
    assert.ok(spine.essentialContextIds.includes('equal_length_window_not_calendar_month'));
    assert.equal(
      spine.essentialContextIds.includes('protein_delta_not_proven_deficit'),
      false,
    );
    // Δ autorizzato anche nelle evidenze scrittura
    const paths = buildSunday1810AuthorizedSelection().centerpiece.metrics.map((m) => m.path);
    assert.ok(paths.includes('edition.week.comparison.deltas.avgProteinG'));
    assert.ok(paths.includes('edition.week.nutrition.avgProteinG'));
  });

  it('centerpiece senza Δ principale → main_story_fact_missing', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].body = 'Una settimana equilibrata tra cibo e riposo, senza numeri di scostamento.';
    good.articles[1].title = 'Settimana di abitudini alimentari';
    good.articles[1].metricsCited = good.articles[1].metricsCited.filter(
      (m) => !/deltas/.test(m.path),
    );
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('main_story_fact_missing'));
  });

  it('solo media senza Δ → main_story_fact_missing', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].title = 'Media proteica settimanale';
    good.articles[1].body = 'Nel periodo 2026-10-11→2026-10-17 la media proteica è 145.06 g al giorno '
      + 'su finestra equivalente precedente (non un mese solare). '
      + 'Nessuna causalità tra domini senza evidenza dedicata.';
    good.articles[1].metricsCited = good.articles[1].metricsCited.filter(
      (m) => !/deltas/.test(m.path),
    );
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('main_story_fact_missing'));
  });
});

describe('P6.6.2 unità nel titolo', () => {
  it('titolo «14 sessioni» + corpo corretto → metric_unit_mismatch', () => {
    const item = buildSunday1810AuthorizedSelection().features[0];
    const raw = buildSunday1810RejectedRawEdition().articles[3];
    const hits = detectMetricUnitMismatches(item, raw.title, raw.body);
    assert.ok(hits.includes('metric_unit_mismatch'));
  });

  it('titolo fedele «14 giorni con sessioni» passa', () => {
    const item = buildSunday1810AuthorizedSelection().features[0];
    const hits = detectMetricUnitMismatches(
      item,
      'Quattordici giorni con sessioni di forza negli ultimi trenta',
      'Negli ultimi 30 giorni sono presenti 14 giorni con sessioni di forza registrate.',
    );
    assert.equal(hits.includes('metric_unit_mismatch'), false);
  });
});

describe('P6.6.2 deficit proteico — tre casi', () => {
  it('descrittivo corretto senza menzione deficit → passa (nessuna frase negativa obbligatoria)', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    // accepted fixture: Δ esplicito, nessuna frase «non è un deficit»
    assert.match(good.articles[1].body, /12\.1/);
    assert.equal(/deficit/i.test(good.articles[1].body), false);
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, true, v.errors?.join(', '));
    const guard = evaluateProteinDeltaDeficitGuard(
      selection.centerpiece,
      good.articles[1].title,
      good.articles[1].body,
      good.articles[1].cautions,
    );
    assert.deepEqual(guard, []);
  });

  it('affermazione indebita di deficit → forbidden_claim_detected', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].body = 'Nel periodo 2026-10-11→2026-10-17 la media è 145.06 g, in calo di 12.1 g '
      + 'rispetto alla finestra equivalente 2026-10-04→2026-10-10 (non un mese solare). '
      + 'Quindi c\'è un deficit proteico e un peggioramento fisiologico. '
      + 'Nessuna causalità tra domini senza evidenza dedicata.';
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(
      v.errors.some((e) => /forbidden_claim_detected:protein_deficit/.test(e)),
      v.errors.join(' | '),
    );
  });

  it('parla di rischio deficit senza contestualizzazione → mandatory_context_missing', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].body = 'Nel periodo 2026-10-11→2026-10-17 la media è 145.06 g, in calo di 12.1 g '
      + 'rispetto alla finestra equivalente 2026-10-04→2026-10-10 (non un mese solare). '
      + 'Vale la pena discutere il rischio di deficit legato a questo calo. '
      + 'Nessuna causalità tra domini senza evidenza dedicata.';
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(
      v.errors.includes('mandatory_context_missing:protein_delta_not_proven_deficit'),
      v.errors.join(' | '),
    );
  });

  it('rischio deficit con contestualizzazione → passa', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].body = 'Nel periodo 2026-10-11→2026-10-17 la media è 145.06 g, in calo di 12.1 g '
      + 'rispetto alla finestra equivalente 2026-10-04→2026-10-10 (non un mese solare). '
      + 'Si può discutere un rischio ipotetico di deficit, ma lo scostamento non è un deficit dimostrato. '
      + 'Nessuna causalità tra domini senza evidenza dedicata.';
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, true, v.errors?.join(', '));
  });
});

describe('P6.6.2 regressione raw reale 18/10', () => {
  it('meta e errori storici clipboard', () => {
    assert.equal(FOCUS_GEMINI_RAW_SUNDAY_1810_META.schemaSource, 'kentu.focusGeminiPreview.v1');
    assert.equal(FOCUS_GEMINI_RAW_SUNDAY_1810_META.model, 'gemini-3.8-flash');
    assert.equal(FOCUS_GEMINI_RAW_SUNDAY_1810_META.callCount, 1);
    assert.deepEqual(FOCUS_GEMINI_RAW_SUNDAY_1810_META.historicalValidationErrors, [
      'articles[0]_missing_required_caution',
      'articles[1]_missing_required_caution',
      'articles[2]_missing_required_caution',
      'articles[3]_missing_required_caution',
    ]);
  });

  it('fixture allineata al file originale geminiRawResponse.txt', () => {
    assert.ok(fs.existsSync(REAL_REVIEW_PATH), 'geminiRawResponse.txt deve restare in root');
    const clip = JSON.parse(fs.readFileSync(REAL_REVIEW_PATH, 'utf8'));
    assert.equal(clip.schema, 'kentu.focusGeminiPreview.v1');
    assert.ok(clip.geminiRawResponse);
    assert.ok(Array.isArray(clip.validationErrors));
    const realRaw = JSON.parse(clip.geminiRawResponse);
    const fixtureRaw = buildSunday1810RejectedRawEdition();
    assert.equal(realRaw.articles.length, fixtureRaw.articles.length);
    for (let i = 0; i < realRaw.articles.length; i += 1) {
      assert.equal(fixtureRaw.articles[i].id, realRaw.articles[i].id);
      assert.equal(fixtureRaw.articles[i].title, realRaw.articles[i].title);
      assert.equal(fixtureRaw.articles[i].body, realRaw.articles[i].body);
      assert.deepEqual(fixtureRaw.articles[i].cautions, realRaw.articles[i].cautions);
      assert.deepEqual(fixtureRaw.articles[i].metricsCited, realRaw.articles[i].metricsCited);
    }
  });

  it('raw storico: errori attesi vs non più generati', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const raw = buildSunday1810RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection });
    assert.equal(v.ok, false);

    // DEVE ancora generare
    assert.ok(v.errors.includes('main_story_fact_missing'), v.errors.join(' | '));
    assert.ok(v.errors.includes('metric_unit_mismatch'), v.errors.join(' | '));

    // NON deve più generare
    assert.equal(
      v.errors.every((e) => !e.endsWith('_missing_required_caution')),
      true,
    );
    assert.equal(
      v.errors.includes('mandatory_context_missing:protein_delta_not_proven_deficit'),
      false,
    );
    assert.equal(
      v.errors.some((e) => e === 'mandatory_context_missing:equal_length_window_not_calendar_month'),
      false,
    );
    assert.equal(
      v.errors.some((e) => e === 'mandatory_context_missing:no_domain_causality_without_evidence'),
      false,
    );
  });

  it('edizione corretta supera tutti i controlli', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, true, v.errors?.join(', '));
  });

  it('path metrico sconosciuto in placeholder → unresolved_metric_placeholder', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[0].body += ' Vedi anche {{path.inesistente.foo}}.';
    good.articles[0].metricsCited.push({
      path: 'path.inesistente.foo',
      value: 1,
      unit: null,
      provenance: 'calculated',
    });
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('unresolved_metric_placeholder'));
  });

  it('mandatory context finestra omesso → mandatory_context_missing', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const good = buildSunday1810AcceptedEdition();
    good.articles[1].cautions = [];
    good.articles[1].body = 'Media 145.06 g con scostamento di 12.1 g rispetto al periodo prima, '
      + 'senza dire che il confronto non è un mese solare.';
    const v = validateFocusWrittenEdition(good, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.startsWith('mandatory_context_missing:')));
  });
});

describe('P6.6.2 banco status (regressione)', () => {
  it('reject in sessione resta copiabile', () => {
    const s = describeFocusGeminiBenchStatus({
      editorialFirst: { ok: true },
      geminiEligibility: { ok: true },
      geminiPreview: {
        ok: false,
        rawAiOutput: '{}',
        reviewJson: {},
        aiValidation: { ok: false, errors: ['main_story_fact_missing'] },
      },
      hasReviewClipboard: true,
    });
    assert.equal(s.canCopyReviewJson, true);
    assert.equal(s.code, 'rejected_in_session');
  });
});
