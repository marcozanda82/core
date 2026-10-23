/**
 * P6.6 — anteprima Gemini: payload, gate, validazione, errori (zero chiamate reali).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import {
  assessFocusGeminiPreviewEligibility,
  buildFocusEditorialPrompt,
  FOCUS_GEMINI_PROMPT_FIELDS_DOC,
  formatFocusWrittenEditionText,
  generateFocusWrittenEdition,
  listSelectedArticlesForPreview,
  runFocusGeminiPreview,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { createAskAiFocusGeminiProvider } from '../editorial/writing/createAskAiFocusGeminiProvider.js';
import { FOCUS_VERIFICATION_STATUS } from '../edition/editionVerification.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';

function news(id, role, overrides = {}) {
  return {
    id,
    topicId: `topic_${id}`,
    role,
    tone: role === 'concern' ? 'caution' : 'neutral',
    claimType: 'calculated',
    domain: 'nutrition',
    headlineSeed: overrides.headlineSeed || `Titolo ${id}`,
    summarySeed: overrides.summarySeed || `Sommario ${id} con valore 12.`,
    refs: overrides.refs || ['edition.week.nutrition.avgProteinG'],
    metrics: overrides.metrics || [
      {
        path: 'edition.week.nutrition.avgProteinG',
        value: 145.06,
        unit: 'g',
        provenance: 'calculated',
      },
    ],
    evidenceQuality: 'high',
    limitations: overrides.limitations || ['scostamento non è deficit dimostrato'],
    doNotClaim: overrides.doNotClaim || ['consiglio proteico automatico'],
    score: 70,
    ...overrides,
  };
}

function baseSelection(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    analysisDate: '2026-10-17',
    publicationDate: '2026-10-18',
    editionKind: 'sunday_plus',
    openingMode: 'progress',
    lead: news('news_sleep_weekly_rhythm', 'lead', {
      domain: 'sleep',
      headlineSeed: 'Sveglia feriale e weekend',
      summarySeed: 'Ritmo sveglia distinto nei giorni feriali e nel weekend.',
      refs: ['sleepRoutine.week.wakeMedian'],
      metrics: [
        { path: 'sleepRoutine.week.wakeMedian', value: 7.2, unit: 'h', provenance: 'calculated' },
      ],
      limitations: ['non è diagnosi del sonno'],
      doNotClaim: ['cura del sonno'],
    }),
    centerpiece: news('news_week_habits_story', 'centerpiece', {
      editorialScale: 'week_interpretation',
      storyKind: 'significant_change',
      headlineSeed: 'Proteine medie settimanali in calo moderato',
      summarySeed: 'Media circa 145,06 g; Δ −12,1 g vs settimana precedente. Non è un deficit dimostrato.',
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
      observedPeriod: { from: '2026-10-11', to: '2026-10-17' },
      limitations: ['scostamento non è deficit dimostrato'],
      doNotClaim: ['consiglio proteico automatico', 'causalità fisiologica'],
    }),
    goodNews: [],
    features: [],
    concerns: [],
    coach: null,
    omitted: [],
    editorialNotes: [],
    caps: {},
    ...overrides,
  };
}

function validWritten(selection) {
  const articles = [];
  let i = 0;
  if (selection.lead) {
    articles.push({
      id: selection.lead.id,
      role: 'lead',
      title: 'Sveglie diverse tra feriali e weekend',
      body: 'Nel periodo osservato il ritmo della sveglia cambia tra i giorni feriali e il weekend, '
        + 'con mediana intorno a {{sleepRoutine.week.wakeMedian}}. È un quadro di routine, non una diagnosi.',
      evidenceIds: ['sleepRoutine.week.wakeMedian'],
      metricsCited: selection.lead.metrics,
      cautions: [...selection.lead.limitations, ...selection.lead.doNotClaim],
      selectionIndex: i,
    });
    i += 1;
  }
  if (selection.centerpiece) {
    articles.push({
      id: selection.centerpiece.id,
      role: 'centerpiece',
      title: 'Un calo moderato nelle proteine medie della settimana',
      body: 'Nella settimana {{edition.week.nutrition.avgProteinG}} grammi di proteine in media, '
        + 'con uno scostamento di {{edition.week.comparison.deltas.avgProteinG}} grammi rispetto '
        + 'alla finestra precedente. Va letto con misura: non è un deficit dimostrato né un invito '
        + 'automatico a mangiare più proteine. Resta un’osservazione del diario.',
      evidenceIds: selection.centerpiece.refs,
      metricsCited: selection.centerpiece.metrics,
      cautions: [...selection.centerpiece.limitations, ...selection.centerpiece.doNotClaim],
      selectionIndex: i,
    });
  }
  return {
    schemaVersion: selection.schemaVersion,
    kind: 'FocusWrittenEdition',
    analysisDate: selection.analysisDate,
    publicationDate: selection.publicationDate,
    openingMode: selection.openingMode,
    articles,
    coach: null,
    mastheadTeaser: 'Settimana tra ritmi di sveglia e un segnale proteico da contestualizzare',
  };
}

describe('P6.6 payload minimo e campi documentati', () => {
  it('AiBrief include centerpiece e non UID/diario grezzo', () => {
    const selection = baseSelection();
    const brief = buildFocusAiBrief({ selection, memory: null });
    assert.ok(brief.selection.centerpiece);
    assert.equal(brief.selection.centerpiece.id, selection.centerpiece.id);
    assert.equal(brief.editionKind, 'sunday_plus');
    assert.ok(brief.constraints.forbidProteinAdviceUnlessAuthorizedCoach);
    const blob = JSON.stringify(brief);
    assert.equal(/uid|fullHistory|firebase/i.test(blob), false);
    assert.ok(FOCUS_GEMINI_PROMPT_FIELDS_DOC.neverSent.length >= 4);
  });

  it('prompt elenca solo articoli autorizzati con id immutabili', () => {
    const selection = baseSelection();
    const brief = buildFocusAiBrief({ selection });
    const prompt = buildFocusEditorialPrompt({ aiBrief: brief });
    assert.deepEqual(
      prompt.authorizedArticleIds.sort(),
      [selection.lead.id, selection.centerpiece.id].sort(),
    );
    assert.match(prompt.systemText, /non sei il caporedattore/i);
    assert.ok(prompt.userPayload.authorizedArticles.some((a) => a.role === 'centerpiece'));
  });
});

describe('P6.6 gate anteprima', () => {
  it('rifiuta senza 1ª selezione', () => {
    const r = assessFocusGeminiPreviewEligibility({ firstBenchReport: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'missing_first_selection');
  });

  it('rifiuta preset futuro / fixture', () => {
    const r = assessFocusGeminiPreviewEligibility({
      firstBenchReport: {
        ok: true,
        mode: 'first',
        selectionForWriting: baseSelection(),
        diagnostics: { verificationStatus: FOCUS_VERIFICATION_STATUS.historical_real },
      },
      preset: { forceSimulation: true, id: 'sunday_month' },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'future_or_fixture_preset');
  });

  it('rifiuta finestra future_unverified', () => {
    const r = assessFocusGeminiPreviewEligibility({
      firstBenchReport: {
        ok: true,
        mode: 'first',
        selectionForWriting: baseSelection({
          publicationDate: '2026-11-01',
          analysisDate: '2026-10-31',
        }),
        diagnostics: { verificationStatus: FOCUS_VERIFICATION_STATUS.future_unverified },
      },
      preset: { forceSimulation: false },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'window_unevaluable');
  });

  it('accetta 1ª selezione storica', () => {
    const selection = baseSelection();
    const r = assessFocusGeminiPreviewEligibility({
      firstBenchReport: {
        ok: true,
        mode: 'first',
        selectionForWriting: selection,
        diagnostics: { verificationStatus: FOCUS_VERIFICATION_STATUS.historical_real },
      },
      preset: { forceSimulation: false, id: 'sunday_past' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.selection, selection);
  });
});

describe('P6.6 validazione e errori (FakeGemini)', () => {
  it('risposta valida con centerpiece → gemini_accepted', async () => {
    const selection = baseSelection();
    const written = validWritten(selection);
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(written) }],
    });
    const result = await runFocusGeminiPreview({
      selection,
      geminiProvider: provider,
      preset: { id: 'sunday_past', publicationDate: '2026-10-18' },
      firstBenchReport: {
        ok: true,
        mode: 'first',
        diagnostics: { verificationStatus: 'historical_real', asOfDate: '2026-10-19' },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'gemini_accepted');
    assert.equal(result.callCount, 1);
    assert.ok(result.displayText.includes('KENTU FOCUS'));
    assert.ok(result.written.articles.some((a) => a.role === 'centerpiece'));
    assert.equal(result.persistence.published, false);
    assert.equal(result.persistence.firebaseWrites, 0);
  });

  it('articolo non autorizzato → rifiuto (niente edizione Gemini)', async () => {
    const selection = baseSelection();
    const bad = validWritten(selection);
    bad.articles.push({
      id: 'news_invented',
      role: 'feature',
      title: 'Articolo inventato',
      body: 'Questo pezzo non era nella selezione e non deve passare la validazione deterministica.',
      evidenceIds: [],
      metricsCited: [],
      cautions: [],
      selectionIndex: 99,
    });
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(bad) }],
    });
    const result = await runFocusGeminiPreview({
      selection,
      geminiProvider: provider,
    });
    assert.equal(result.ok, false);
    assert.equal(result.written, null);
    assert.ok((result.aiValidation?.errors || []).some((e) => /count_mismatch|not_authorized/i.test(e)));
  });

  it('numero alterato → validazione fallisce', () => {
    const selection = baseSelection();
    const bad = validWritten(selection);
    bad.articles[1].body = bad.articles[1].body.replace(
      '{{edition.week.nutrition.avgProteinG}}',
      '999',
    );
    const v = validateFocusWrittenEdition(bad, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /unauthorized_number|body_length/i.test(e) || e.includes('unauthorized')));
  });

  it('chiamata Gemini fallita → un solo tentativo, no edizione accettata', async () => {
    const selection = baseSelection();
    const provider = new FakeGeminiProvider({
      responses: [{ status: 500 }],
    });
    const result = await runFocusGeminiPreview({ selection, geminiProvider: provider });
    assert.equal(result.ok, false);
    assert.equal(provider.calls, 1);
    assert.equal(result.written, null);
  });

  it('provider assente → blocked senza throw', async () => {
    const result = await runFocusGeminiPreview({
      selection: baseSelection(),
      geminiProvider: null,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.error, 'gemini_provider_unavailable');
  });

  it('askAI adapter: mock senza rete', async () => {
    let calls = 0;
    const provider = createAskAiFocusGeminiProvider({
      askAiFn: async () => {
        calls += 1;
        return JSON.stringify(validWritten(baseSelection()));
      },
    });
    const out = await provider.generate({ systemText: 's', userText: 'u' });
    assert.equal(out.ok, true);
    assert.equal(calls, 1);
    assert.equal(provider.getCallCount(), 1);
  });
});

describe('P6.6 utilità presentazione', () => {
  it('listSelectedArticles e format testo separano seed da prosa', () => {
    const selection = baseSelection();
    const listed = listSelectedArticlesForPreview(selection);
    assert.equal(listed.length, 2);
    assert.ok(listed.some((a) => a.role === 'centerpiece'));
    const text = formatFocusWrittenEditionText(validWritten(selection));
    assert.match(text, /Articolo centrale/);
    assert.equal(/headlineSeed|strength_frequency_change/.test(text), false);
  });

  it('generateFocusWrittenEdition con FakeGemini resta compatibile', async () => {
    const selection = baseSelection();
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(validWritten(selection)) }],
    });
    const gen = await generateFocusWrittenEdition({
      selection,
      geminiProvider: provider,
    });
    assert.equal(gen.usedFallback, false);
    assert.equal(gen.aiValidation.ok, true);
  });
});
