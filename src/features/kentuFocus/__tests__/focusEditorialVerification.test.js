import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusCoach } from '../editorial/focusCoachCatalog.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import {
  buildFullDayFixture,
  buildMissingValuesFixture,
  ANALYSIS_DATE,
  PUBLICATION_DATE,
} from './fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from './fixtures/focusHistoryFixtures.js';
import {
  EDITION_SPECS,
  briefFromScenarioInput,
  buildBackgroundBriefsBeforeSeries,
  buildScenarioDayInput,
} from './fixtures/focusEditionSeriesFixtures.js';

/**
 * Simula 7 edizioni consecutive con memoria aggiornata solo post-publish.
 * @returns {object[]}
 */
export function simulateSevenEditions() {
  let memory = createEmptyEditorialMemory();
  const history = [...buildBackgroundBriefsBeforeSeries()];
  /** @type {object[]} */
  const rows = [];

  for (const spec of EDITION_SPECS) {
    const dayInput = buildScenarioDayInput(spec.key, spec.analysisDate);
    const dayBrief = briefFromScenarioInput(dayInput);
    history.push(dayBrief);

    const historyUntilToday = history.filter((b) => b.date <= spec.analysisDate);
    const dossier = buildFocusDossier({
      ...dayInput,
      uid: 'sim_user',
      generatedAt: `${spec.publicationDate}T07:30:00.000Z`,
      historyDayBriefs: historyUntilToday,
    });

    const memoryBefore = JSON.parse(JSON.stringify(memory));
    const selection = selectFocusEditorial({ dossier, memory });
    // Memoria non mutata dalla sola selezione
    assert.deepEqual(memory, memoryBefore);

    const rankedTop = extractFocusSignals(dossier, memory)
      .map((c) => ({ id: c.id, topicId: c.topicId, scoreHint: c.evidenceQuality }));

    rows.push({
      key: spec.key,
      label: spec.label,
      analysisDate: spec.analysisDate,
      publicationDate: spec.publicationDate,
      openingMode: selection.openingMode,
      lead: selection.lead
        ? {
          id: selection.lead.id,
          topicId: selection.lead.topicId,
          headline: selection.lead.headlineSeed,
          score: selection.lead.score,
          claimType: selection.lead.claimType,
        }
        : null,
      goodNews: selection.goodNews.map((n) => ({
        topicId: n.topicId,
        headline: n.headlineSeed,
        score: n.score,
      })),
      features: selection.features.map((n) => ({
        topicId: n.topicId,
        headline: n.headlineSeed,
        claimType: n.claimType,
        score: n.score,
      })),
      concerns: selection.concerns.map((n) => ({
        topicId: n.topicId,
        headline: n.headlineSeed,
        score: n.score,
      })),
      coach: selection.coach
        ? { templateId: selection.coach.templateId, text: selection.coach.textSeed }
        : null,
      omittedSample: selection.omitted.slice(0, 6).map((o) => `${o.candidateId}:${o.reason}`),
      rankingNote: selection.lead
        ? `lead score=${selection.lead.score} breakdown=${JSON.stringify(selection.lead.scoreBreakdown)}`
        : `lead=null opening=${selection.openingMode}`,
      signalIds: rankedTop.map((s) => s.id),
    });

    memory = applyEditorialMemoryAfterPublish(memory, {
      publicationDate: spec.publicationDate,
      revision: 1,
      selection,
      updatedAt: `${spec.publicationDate}T08:00:00.000Z`,
    });
  }

  return { rows, finalMemory: memory };
}

test('I3-bis: simulazione 7 edizioni — struttura e anti-ripetizione', () => {
  const { rows, finalMemory } = simulateSevenEditions();
  assert.equal(rows.length, 7);

  // 1 progress: lead positivo o good news su sonno/proteine/workout
  const progress = rows.find((r) => r.key === 'progress');
  assert.ok(progress.lead || progress.goodNews.length > 0);

  // 3 short sleep: concern presente, non nascosto
  const short = rows.find((r) => r.key === 'short_sleep');
  assert.ok(
    short.concerns.some((c) => c.topicId === 'sleep_hours_short'),
    'criticità sonno corto deve emergere',
  );

  // 6 incomplete: niente totali cibo inventati; coach opzionale log
  const incomplete = rows.find((r) => r.key === 'incomplete');
  assert.ok(!incomplete.lead || incomplete.lead.topicId !== 'protein_near_target');

  // 7 no novelty: lead null ammesso
  const none = rows.find((r) => r.key === 'no_novelty');
  assert.equal(none.lead, null);
  assert.equal(none.openingMode, 'neutral');

  // Documentazione mai come lead / progresso fisiologico
  for (const row of rows) {
    if (row.lead) {
      assert.notEqual(row.lead.topicId, 'documentation_complete');
      assert.equal(String(row.lead.headline).toLowerCase().includes('metabolismo'), false);
    }
  }

  // Stesso topic lead non in tutte le edizioni
  const leadTopics = rows.map((r) => r.lead?.topicId).filter(Boolean);
  const uniqueLeads = new Set(leadTopics);
  assert.ok(uniqueLeads.size >= Math.min(2, leadTopics.length) || leadTopics.length <= 1);

  // Coach: nessun template ripetuto entro cooldown (edizioni consecutive < 6 giorni)
  const coachTemplates = rows.map((r) => r.coach?.templateId).filter(Boolean);
  const coachCounts = coachTemplates.reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  for (const [template, count] of Object.entries(coachCounts)) {
    assert.equal(count, 1, `coach ${template} ripetuto ${count} volte durante cooldown`);
  }

  assert.ok(finalMemory.recentLeads.length <= 8);
  assert.ok(finalMemory.lastAppliedEdition);
});

test('I3-bis: evidenza — confronti insufficienti non generano trend news', () => {
  const fixture = buildFullDayFixture();
  const briefs = buildHistoryBriefSeries({ dayCount: 8, foodGapEvery: 2 });
  const dossier = buildFocusDossier({ ...fixture, historyDayBriefs: briefs });
  assert.equal(dossier.history.comparisons.d7_vs_prev7.available, false);
  assert.equal(dossier.history.comparisons.d30_vs_prev30.available, false);
  const selection = selectFocusEditorial({ dossier });
  const all = [selection.lead, ...selection.goodNews, ...selection.features].filter(Boolean);
  assert.equal(all.some((n) => String(n.topicId).includes('trend')), false);
});

test('I3-bis: evidenza — giorni senza log alimentari e zero workout non inventano inattività', () => {
  const fixture = buildMissingValuesFixture();
  fixture.publicationDayNode = {
    data: PUBLICATION_DATE,
    log: [{ type: 'sleep', id: 's', hours: 7, wakeTime: 7, quality: 4, deepMin: 90, remMin: 100 }],
  };
  const dossier = buildFocusDossier(fixture);
  const selection = selectFocusEditorial({ dossier });
  const blob = JSON.stringify(selection).toLowerCase();
  assert.equal(blob.includes('sedent'), false);
  assert.equal(blob.includes('inattiv'), false);
  assert.equal(dossier.meta.coverage.analysisDayHasWorkout, false);
  // Può esserci lead sul sonno; non deve nascere una notizia “inattività”.
  assert.equal(
    [selection.lead, ...selection.goodNews, ...selection.features, ...selection.concerns]
      .filter(Boolean)
      .some((n) => String(n.topicId).includes('inactiv') || String(n.headlineSeed).toLowerCase().includes('sedent')),
    false,
  );
});

test('I3-bis: evidenza — dedupe e REM/deep e ipotesi cena', () => {
  const fixture = buildFullDayFixture();
  fixture.analysisDayNode.log = fixture.analysisDayNode.log.map((e) => (
    e.mealType === 'cena' ? { ...e, mealTime: 23 } : e
  ));
  const dossier = buildFocusDossier(fixture);
  assert.equal(dossier.meta.flags.nutritionTotalsAffectedByDedupe, true);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.missing);
  const signals = extractFocusSignals(dossier, null);
  assert.equal(signals.some((s) => String(s.id).includes('deep') || String(s.id).includes('rem')), false);
  const selection = selectFocusEditorial({ dossier });
  assert.equal(selection.concerns.some((c) => c.topicId === 'dinner_sleep_buffer_short'), false);
  assert.equal(selection.features.some((f) => f.topicId === 'dinner_sleep_buffer_short'), false);
  const hypSig = signals.find((s) => s.topicId === 'dinner_sleep_buffer_short');
  if (hypSig) {
    assert.equal(hypSig.claimType, 'hypothesis');
    assert.ok(hypSig.doNotClaim.some((d) => d.toLowerCase().includes('causa') || d.toLowerCase().includes('rovin')));
  }
});

test('I3-bis: evidenza — target assenti → niente lead proteine né coach protein', () => {
  const fixture = buildFullDayFixture();
  delete fixture.targets;
  const dossier = buildFocusDossier(fixture);
  const selection = selectFocusEditorial({ dossier });
  assert.equal(selection.lead?.topicId === 'protein_near_target', false);
  assert.notEqual(selection.coach?.templateId, 'HIT_PROTEIN_PORTION');
  const signals = extractFocusSignals(dossier, null);
  assert.equal(signals.some((s) => s.topicId === 'protein_near_target'), false);
});

test('I3-bis: coach — facoltativo, no causali cena, esperimento aperto blocca nuovi', () => {
  const fixture = buildFullDayFixture();
  fixture.analysisDayNode.log = fixture.analysisDayNode.log.map((e) => (
    e.mealType === 'cena' ? { ...e, mealTime: 23 } : e
  ));
  const dossier = buildFocusDossier(fixture);
  const coach1 = selectFocusCoach(dossier, [], createEmptyEditorialMemory(), PUBLICATION_DATE);
  assert.ok(!coach1 || coach1.templateId === 'EARLIER_DINNER');
  if (coach1) {
    assert.ok(coach1.doNotClaim.some((d) => d.toLowerCase().includes('insonnia') || d.toLowerCase().includes('causa')));
  }

  const memoryWithExp = createEmptyEditorialMemory();
  memoryWithExp.activeExperiments = [{
    id: 'exp_x',
    templateId: 'EARLIER_DINNER',
    startedOn: ANALYSIS_DATE,
    horizonDays: 3,
    metricPaths: ['sleep.dinnerSleepBufferH'],
    status: 'open',
    followUpNote: null,
  }];
  const coachBlocked = selectFocusCoach(dossier, [], memoryWithExp, PUBLICATION_DATE);
  assert.equal(coachBlocked, null);

  const empty = buildFocusDossier(buildMissingValuesFixture());
  assert.equal(selectFocusCoach(empty, [], null, PUBLICATION_DATE), null);
});

test('I3-bis: null bodyWeight non diventa 0 kg inventato', () => {
  const dossier = buildFocusDossier({
    ...buildFullDayFixture(),
    bodyWeightKg: null,
  });
  assert.equal(dossier.day.body.weightKg.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.day.body.weightKg.value, null);
  assert.equal(
    extractFocusSignals(dossier, null).some((s) => s.topicId === 'body_weight_logged'),
    false,
  );
});

test('I3-bis: determinismo e memoria immutabile + revisioni + mese/anno', () => {
  const dayInput = buildScenarioDayInput('ordinary', '2026-12-29');
  const dossier = buildFocusDossier({
    ...dayInput,
    historyDayBriefs: [
      ...buildBackgroundBriefsBeforeSeries(),
      briefFromScenarioInput(dayInput),
    ],
  });
  const memory = createEmptyEditorialMemory();
  const snap = JSON.stringify(memory);
  const a = selectFocusEditorial({ dossier, memory });
  const b = selectFocusEditorial({ dossier, memory });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(memory), snap);

  const m1 = applyEditorialMemoryAfterPublish(memory, {
    publicationDate: '2026-12-30',
    revision: 1,
    selection: a,
  });
  const m1b = applyEditorialMemoryAfterPublish(m1, {
    publicationDate: '2026-12-30',
    revision: 1,
    selection: a,
  });
  assert.deepEqual(m1, m1b);
  assert.equal(m1.recentLeads.length, m1b.recentLeads.length);

  const m2 = applyEditorialMemoryAfterPublish(m1, {
    publicationDate: '2026-12-30',
    revision: 2,
    selection: a,
  });
  assert.equal(m2.lastAppliedEdition, '2026-12-30#2');
  assert.ok(m2.recentLeads.length >= m1.recentLeads.length);

  // attraversamento anno nelle specs
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  const newYear = EDITION_SPECS.find((s) => s.publicationDate === '2027-01-01');
  assert.ok(newYear);
});
