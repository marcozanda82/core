import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { buildFallbackWrittenEdition } from '../editorial/writing/buildFallbackWrittenEdition.js';
import { generateFocusWrittenEdition } from '../editorial/writing/generateFocusWrittenEdition.js';
import { FOCUS_WRITTEN_SCHEMA_VERSION } from '../editorial/writing/focusWrittenEdition.v1.js';
import {
  materializeAuthorizedProse,
  materializeWrittenEdition,
} from '../editorial/writing/materializeAuthorizedProse.js';
import { validateFocusWrittenEdition } from '../editorial/writing/validateFocusWrittenEdition.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
  buildMissingValuesFixture,
  buildNoMealsFixture,
} from './fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from './fixtures/focusHistoryFixtures.js';

function news(id, role, overrides = {}) {
  return {
    id,
    topicId: `topic_${id}`,
    role,
    tone: role === 'concern' ? 'caution' : 'positive',
    claimType: 'fact',
    domain: 'nutrition',
    headlineSeed: overrides.headlineSeed || `Titolo ${id}`,
    summarySeed: overrides.summarySeed || `Sommario ${id} con valore 12.`,
    refs: overrides.refs || ['day.nutrition.proteinG'],
    metrics: overrides.metrics || [
      { path: 'day.nutrition.proteinG', value: 12, unit: 'g', provenance: 'recorded' },
    ],
    evidenceQuality: 'high',
    limitations: overrides.limitations || ['non è diagnosi'],
    doNotClaim: overrides.doNotClaim || ['cura medica'],
    score: 60,
    ...overrides,
  };
}

function baseSelection(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    openingMode: 'neutral',
    lead: null,
    goodNews: [news('g1', 'good')],
    features: [],
    concerns: [],
    coach: null,
    omitted: [],
    editorialNotes: [],
    caps: {},
    ...overrides,
  };
}

test('I4-D3 placeholder: autorizzato, duplicato, sconosciuto, irrisolto, missing, invalid, unit, lookalike', () => {
  const metric = { path: 'sleep.hours', value: 7.2, unit: 'h', provenance: 'recorded' };

  const ok = materializeAuthorizedProse('Durata {{sleep.hours}} registrata.', [metric]);
  assert.equal(ok.ok, true);
  assert.equal(ok.text, 'Durata 7.2 h registrata.');
  assert.equal(ok.resolvedCount, 1);

  const dup = materializeAuthorizedProse('A {{sleep.hours}} e poi {{sleep.hours}}.', [metric]);
  assert.equal(dup.ok, true);
  assert.equal(dup.resolvedCount, 2);
  assert.equal(dup.text, 'A 7.2 h e poi 7.2 h.');

  const unknown = materializeAuthorizedProse('Valore {{sleep.deep}} ignoto.', [metric]);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((e) => e.includes('unknown_placeholder')));
  assert.match(unknown.text, /\{\{sleep\.deep\}\}/);

  const missing = materializeAuthorizedProse('X {{sleep.hours}}.', [{
    path: 'sleep.hours', value: null, unit: 'h', provenance: 'missing',
  }]);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes('missing_value')));

  const invalid = materializeAuthorizedProse('X {{sleep.hours}}.', [{
    path: 'sleep.hours', value: Number.NaN, unit: 'h', provenance: 'recorded',
  }]);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((e) => e.includes('invalid_numeric')));

  const badUnit = materializeAuthorizedProse('X {{sleep.hours}}.', [{
    path: 'sleep.hours', value: 7, unit: { weird: true }, provenance: 'recorded',
  }]);
  assert.equal(badUnit.ok, false);
  assert.ok(badUnit.errors.some((e) => e.includes('incompatible_unit')));

  const lookalike = materializeAuthorizedProse('Testo {{sleep hours}} sospetto.', [metric]);
  assert.equal(lookalike.ok, false);
  assert.ok(lookalike.errors.some((e) => e.includes('lookalike') || e.includes('unresolved')));

  const titleOk = materializeAuthorizedProse('Sonno {{sleep.hours}}', [metric]);
  assert.equal(titleOk.ok, true);

  const edition = materializeWrittenEdition({
    articles: [{
      title: 'Titolo {{sleep.hours}}',
      body: 'Corpo con {{sleep.hours}} ok.',
      metricsCited: [metric],
    }],
    coach: { title: 'Coach', body: 'Niente placeholder qui.' },
  });
  assert.equal(edition.ok, true);
  assert.ok(!/\{\{/.test(edition.written.articles[0].title));
  assert.ok(!/\{\{/.test(edition.written.articles[0].body));

  const coachPh = materializeWrittenEdition({
    articles: [],
    coach: { title: 'C', body: 'Evita {{sleep.hours}} nel coach.' },
  });
  assert.equal(coachPh.ok, false);
});

test('I4-D3 estimated-as-measured + unresolved → fallback pipeline', async () => {
  const item = news('g1', 'good', {
    metrics: [{ path: 'sleep.hours', value: 5, unit: 'h', provenance: 'estimated' }],
    refs: ['sleep.hours'],
    summarySeed: 'Stima 5 h.',
  });
  const sel = baseSelection({ goodNews: [item] });
  const base = buildFallbackWrittenEdition({ selection: sel });

  const measured = {
    ...base,
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
    articles: base.articles.map((a) => ({
      ...a,
      body: 'Sono state misurate direttamente 5 h senza incertezza residua nel diario.',
      cautions: a.cautions,
      metricsCited: a.metricsCited,
    })),
  };
  assert.ok(
    validateFocusWrittenEdition(measured, { selection: sel }).errors
      .some((e) => e.includes('unreliable_presented_as_measured')),
  );

  const withUnresolved = {
    ...base,
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
    articles: base.articles.map((a) => ({
      ...a,
      body: `${a.body} Placeholder {{path.inesistente}} lasciato.`,
      cautions: a.cautions,
      metricsCited: a.metricsCited,
    })),
  };
  const out = await generateFocusWrittenEdition({
    selection: sel,
    rawAiOutput: withUnresolved,
  });
  assert.equal(out.usedFallback, true);
  const blob = JSON.stringify(out.written);
  assert.ok(!/\{\{[^}]*\}\}/.test(blob), 'edizione finale senza placeholder');
});

test('I4-D3 semantica simulata: causalità, medico, storia, coach, cautele, numeri', async () => {
  const item = news('g1', 'good', {
    claimType: 'hypothesis',
    metrics: [{ path: 'sleep.hours', value: 5, unit: 'h', provenance: 'recorded' }],
    refs: ['sleep.hours'],
  });
  const sel = baseSelection({
    goodNews: [item],
    editorialNotes: ['d7_comparison_unavailable'],
  });
  const base = buildFallbackWrittenEdition({ selection: sel });
  sel.goodNews[0].claimType = 'hypothesis';

  const cases = [
    {
      name: 'causal',
      patch: (a) => ({
        ...a,
        body: 'La stanchezza è quindi causata dal digiuno incompleto con certezza narrativa.',
      }),
      err: /hypothesis_causal|unauthorized_number/,
    },
    {
      name: 'medical',
      patch: (a) => ({
        ...a,
        body: 'Questa è una diagnosi: ti diagnostico un deficit e ti prescrivo riposo farmacologico.',
      }),
      err: /medical_overclaim/,
    },
    {
      name: 'history',
      patch: (a) => ({
        ...a,
        body: 'Rispetto alla settimana scorsa la media settimanale è nettamente migliorata nel diario.',
      }),
      err: /unavailable_history_comparison/,
    },
    {
      name: 'numbers',
      patch: (a) => ({
        ...a,
        body: `${a.body} Inventato 999 kcal nel pezzo.`,
      }),
      err: /unauthorized_number/,
    },
    {
      name: 'cautions',
      patch: (a) => ({
        ...a,
        cautions: [],
        body: 'Questa è una diagnosi: ti diagnostico un problema e ti prescrivo riposo farmacologico.',
      }),
      err: /forbidden_claim_detected|medical_overclaim|mandatory_context_missing/,
    },
  ];

  for (const c of cases) {
    const doc = {
      ...base,
      articles: base.articles.map((a) => ({ ...a, ...c.patch(a), metricsCited: a.metricsCited })),
    };
    const v = validateFocusWrittenEdition(doc, { selection: sel });
    assert.equal(v.ok, false, c.name);
    assert.ok(v.errors.some((e) => c.err.test(e)), `${c.name}: ${v.errors.join(',')}`);
  }

  const coachHack = {
    ...base,
    coach: { id: 'hack', body: 'Consiglio non autorizzato abbastanza lungo da passare il minimo.' },
  };
  assert.ok(
    validateFocusWrittenEdition(coachHack, { selection: sel }).errors
      .some((e) => e.includes('coach_not_authorized')),
  );

  // Wrong-day attribution: limite residuo — non bloccato se non ci sono date errate letterali
  const wrongDay = {
    ...base,
    articles: base.articles.map((a) => ({
      ...a,
      body: 'Ieri (giornata di analisi) abbiamo già visto lo stesso schema del giorno di pubblicazione, senza date ISO errate.',
      cautions: a.cautions,
    })),
  };
  // può passare il validatore (limite documentato)
  const wd = validateFocusWrittenEdition(wrongDay, { selection: sel });
  assert.ok(wd.semanticLimits.cannotVerify.some((x) => x.includes('giornata sbagliata')));
});

test('I4-D3 tre edizioni fixture: positiva, scarsa, prudente (fallback deterministico)', async () => {
  const positive = selectFocusEditorial({
    dossier: buildFocusDossier({
      uid: 'd3p',
      ...buildFullDayFixture(),
      historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20 }),
    }),
    memory: createEmptyEditorialMemory(),
  });
  const sparse = selectFocusEditorial({
    dossier: buildFocusDossier({
      uid: 'd3s',
      ...buildMissingValuesFixture(),
      historyDayBriefs: [],
    }),
    memory: createEmptyEditorialMemory(),
  });
  const cautiousDay = buildNoMealsFixture();
  const cautious = selectFocusEditorial({
    dossier: buildFocusDossier({
      uid: 'd3c',
      ...cautiousDay,
      historyDayBriefs: buildHistoryBriefSeries({ dayCount: 7 }),
    }),
    memory: createEmptyEditorialMemory(),
  });

  const editions = [];
  for (const [label, selection] of [
    ['positiva', positive],
    ['scarsa', sparse],
    ['prudente', cautious],
  ]) {
    const out = await generateFocusWrittenEdition({ selection });
    assert.equal(out.usedFallback, true);
    assert.equal(out.proseSource, 'fallback');
    assert.ok(!/\{\{[^}]*\}\}/.test(JSON.stringify(out.written)));
    editions.push({
      label,
      masthead: out.written.mastheadTeaser,
      articles: out.written.articles.map((a) => ({
        role: a.role,
        title: a.title,
        body: a.body,
        cautions: a.cautions,
      })),
      coach: out.written.coach,
      proseSource: out.proseSource,
    });
  }

  // Espone struttura per report (senza fingere Gemini)
  assert.equal(editions.length, 3);
  console.log('I4_D3_EDITORIAL_SAMPLES', JSON.stringify(editions, null, 2));
});

test('I4-D3 FakeGemini valido con placeholder materializzato', async () => {
  const sel = baseSelection();
  const fb = buildFallbackWrittenEdition({ selection: sel });
  const metric = sel.goodNews[0].metrics[0];
  const aiDoc = {
    ...fb,
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
    articles: fb.articles.map((a) => ({
      ...a,
      title: `Proteine circa {{${metric.path}}}`,
      body: `Nel diario risultano {{${metric.path}}} di proteine, senza conclusioni cliniche aggiuntive qui.`,
      metricsCited: [metric],
      cautions: a.cautions,
    })),
  };
  const provider = new FakeGeminiProvider({ responses: [{ text: JSON.stringify(aiDoc) }] });
  const out = await generateFocusWrittenEdition({ selection: sel, geminiProvider: provider });
  assert.equal(out.usedFallback, false);
  assert.match(out.written.articles[0].title, /12 g/);
  assert.ok(!/\{\{/.test(out.written.articles[0].body));
});
