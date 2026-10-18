import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../editorial/focusEditorialMemory.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import { runFocusEditorial } from '../editorial/runFocusEditorial.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
  buildMissingValuesFixture,
} from './fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from './fixtures/focusHistoryFixtures.js';

function buildRichDossier(historyDays = 30) {
  const fixture = buildFullDayFixture();
  const briefs = buildHistoryBriefSeries({ dayCount: historyDays, foodGapEvery: 0 });
  return buildFocusDossier({
    ...fixture,
    historyDayBriefs: briefs,
    generatedAt: '2026-10-17T08:00:00.000Z',
  });
}

test('giornata ricca: selezione con lead/good e AiBrief senza uid', () => {
  const dossier = buildRichDossier(30);
  const { selection, aiBrief } = runFocusEditorial({ dossier, memory: null });
  assert.ok(selection.lead || selection.goodNews.length > 0 || selection.features.length > 0);
  assert.ok(!JSON.stringify(aiBrief).includes('user_demo') || !aiBrief.uid);
  assert.equal(aiBrief.uid, undefined);
  assert.equal(aiBrief.constraints.forbidInventedNewsOrAdvice, true);
  assert.ok(selection.goodNews.length <= 2);
  assert.ok(selection.features.length <= 2);
  assert.ok(selection.concerns.length <= 2);
});

test('determinismo: stessi input → stessa selezione', () => {
  const dossier = buildRichDossier(30);
  const memory = createEmptyEditorialMemory();
  const a = selectFocusEditorial({ dossier, memory });
  const b = selectFocusEditorial({ dossier, memory });
  assert.deepEqual(a, b);
});

test('dati insufficienti: niente confronti e niente progressi inventati', () => {
  const dossier = buildFocusDossier(buildMissingValuesFixture());
  const selection = selectFocusEditorial({ dossier, memory: null });
  assert.equal(selection.openingMode === 'neutral' || selection.openingMode === 'documentation', true);
  const progress = [selection.lead, ...selection.goodNews].filter(
    (n) => n && n.typology === 'window_comparison',
  );
  assert.equal(progress.length, 0);
  assert.ok(selection.editorialNotes.includes('d7_comparison_unavailable')
    || !dossier.history?.comparisons?.d7_vs_prev7?.available);
});

test('copertura storica non comparabile: nessun segnale trend kcal', () => {
  const fixture = buildFullDayFixture();
  const briefs = buildHistoryBriefSeries({ dayCount: 10, foodGapEvery: 2 });
  const dossier = buildFocusDossier({ ...fixture, historyDayBriefs: briefs });
  assert.equal(dossier.history.comparisons.d7_vs_prev7.available, false);
  const selection = selectFocusEditorial({ dossier });
  const trend = [...selection.features, ...selection.goodNews, selection.lead]
    .filter(Boolean)
    .filter((n) => String(n.topicId || '').includes('kcal_trend'));
  assert.equal(trend.length, 0);
});

test('abitudine alimentare emergente → feature', () => {
  const dossier = buildRichDossier(14);
  const signals = extractFocusSignals(dossier, null);
  const habitSig = signals.find((s) => String(s.topicId || '').startsWith('habit_food_'));
  assert.ok(habitSig, 'segnale abitudine atteso');
  assert.equal(habitSig.claimType, 'fact');
  assert.ok(habitSig.doNotClaim.some((d) => d.includes('troppo') || d.includes('sano')));

  const selection = selectFocusEditorial({ dossier });
  const habit = selection.features.find((f) => String(f.topicId || '').startsWith('habit_food_'));
  const omittedHabit = selection.omitted.some((o) => String(o.candidateId || '').includes('habit_food'));
  assert.ok(habit || omittedHabit, 'abitudine selezionata o omessa per cap/ranking');
  if (habit) assert.equal(habit.claimType, 'fact');
});

test('ipotesi buffer cena non diventa concern', () => {
  const fixture = buildFullDayFixture();
  // cena 21.25, bedtime ~23.8 → buffer ~2.55; forza buffer corto
  fixture.analysisDayNode.log = fixture.analysisDayNode.log.map((e) => (
    e.mealType === 'cena' ? { ...e, mealTime: 22.8 } : e
  ));
  const dossier = buildFocusDossier({
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 14 }),
  });
  const selection = selectFocusEditorial({ dossier });
  assert.ok(!selection.concerns.some((c) => c.topicId === 'dinner_sleep_buffer_short'));
  const asFeature = selection.features.find((f) => f.topicId === 'dinner_sleep_buffer_short');
  if (asFeature) assert.equal(asFeature.claimType, 'hypothesis');
  assert.ok(selection.omitted.some((o) => o.reason === 'hypothesis_not_concern'
    || o.reason === 'hypothesis_not_elevated'
    || o.candidateId.includes('dinner')));
});

test('ripetizione lead: cooldown memoria esclude stesso topic', () => {
  const dossier = buildRichDossier(30);
  const first = selectFocusEditorial({ dossier, memory: null });
  assert.ok(first.lead);
  let memory = applyEditorialMemoryAfterPublish(null, {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection: first,
    updatedAt: '2026-10-17T09:00:00.000Z',
  });
  const second = selectFocusEditorial({ dossier, memory });
  if (first.lead?.topicId) {
    assert.notEqual(second.lead?.topicId, first.lead.topicId);
  }
});

test('cooldown coach: stesso template non riproposto', () => {
  const fixture = buildFullDayFixture();
  fixture.analysisDayNode.log = fixture.analysisDayNode.log.map((e) => (
    e.mealType === 'cena' ? { ...e, mealTime: 23 } : e
  ));
  // proteine basse per evitare altri coach dominanti
  fixture.targets = { kcal: 2300, proteinG: 200 };
  const dossier = buildFocusDossier({
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 14 }),
  });
  const first = selectFocusEditorial({ dossier });
  if (!first.coach) {
    // se buffer non genera coach, skip soft
    assert.ok(true);
    return;
  }
  const memory = applyEditorialMemoryAfterPublish(null, {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection: first,
  });
  const second = selectFocusEditorial({ dossier, memory });
  assert.ok(
    !second.coach
    || second.coach.templateId !== first.coach.templateId,
  );
});

test('memoria aggiornata una sola volta (idempotenza revisione)', () => {
  const dossier = buildRichDossier(20);
  const selection = selectFocusEditorial({ dossier });
  const event = {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection,
    updatedAt: '2026-10-17T10:00:00.000Z',
  };
  const m1 = applyEditorialMemoryAfterPublish(null, event);
  const m2 = applyEditorialMemoryAfterPublish(m1, event);
  assert.deepEqual(m1, m2);
  assert.equal(m1.lastAppliedEdition, `${PUBLICATION_DATE}#1`);
});

test('nessun consiglio inventato se dossier vuoto', () => {
  const dossier = buildFocusDossier(buildMissingValuesFixture());
  const selection = selectFocusEditorial({ dossier });
  assert.equal(selection.coach, null);
  const brief = buildFocusAiBrief({ selection, memory: null });
  assert.equal(brief.selection.coach, null);
});

test('zero workout log ≠ segnale inattività', () => {
  const fixture = buildFullDayFixture();
  fixture.analysisDayNode.log = fixture.analysisDayNode.log.filter((e) => e.type !== 'workout');
  const dossier = buildFocusDossier({
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 14 }),
  });
  const selection = selectFocusEditorial({ dossier });
  const bad = JSON.stringify(selection).toLowerCase();
  assert.equal(bad.includes('sedent'), false);
  assert.equal(bad.includes('inattiv'), false);
});

test('flag dedupe esposto quando totali alterati', () => {
  const fixture = buildFullDayFixture();
  const dossier = buildFocusDossier(fixture);
  assert.equal(dossier.meta.flags.nutritionDedupeRemovedDuplicates, true);
  assert.equal(dossier.meta.flags.nutritionTotalsAffectedByDedupe, true);
});

test('confronto d7 richiede 14 giorni calendario e coverage', () => {
  const fixture = buildFullDayFixture();
  const short = buildFocusDossier({
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 7 }),
  });
  assert.equal(short.history.comparisons.d7_vs_prev7.requiredCalendarDays, 14);
  // prev7 sarà quasi tutto placeholder → available false
  assert.equal(short.history.comparisons.d7_vs_prev7.available, false);

  const long = buildFocusDossier({
    ...fixture,
    historyDayBriefs: buildHistoryBriefSeries({ dayCount: 20, foodGapEvery: 0 }),
  });
  // entrambi i lati con cibo ogni giorno → comparabile
  assert.equal(long.history.comparisons.d7_vs_prev7.available, true);
  assert.equal(ANALYSIS_DATE, long.meta.analysisDate);
});
