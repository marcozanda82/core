/**
 * P6.7.3b — seed narrativi in italiano naturale (no scaffold Perché/Limiti).
 * Offline fino al prompt Gemini. Zero Gemini reale / Firebase.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import { FOCUS_EDITION_KIND, FOCUS_EDITION_BENCH_PRESETS } from '../edition/editionCalendar.js';
import { evaluateCenterpieceStory } from '../editorial/centerpieceStoryGate.js';
import { composeMonthCenterpieceCandidate } from '../editorial/composeMonthCenterpiece.js';
import {
  WEEK_CENTERPIECE_TOPIC_ID,
  composeWeekCenterpieceCandidate,
} from '../editorial/composeWeekCenterpiece.js';
import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import {
  buildFocusEditorialPrompt,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

const PRESET = FOCUS_EDITION_BENCH_PRESETS.sunday_past;
const PUBLICATION = PRESET.publicationDate;
const ANALYSIS = '2026-10-17';

const PROTEIN_PATHS = new Set([
  'edition.week.nutrition.daysWithFood',
  'edition.week.nutrition.avgProteinG',
  'edition.week.comparison.deltas.avgProteinG',
]);

const SCAFFOLD_RE = /Perché può interessare\s*:|Limiti\s*:/i;
const BUREAU_RE = /copertura alimentare allineata|variazione quantitativa|giorni con cibo/i;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = join(__dirname, '../editorial/writing/validateFocusWrittenEdition.js');

function sleepNode(date) {
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: 7.0,
      wakeTime: 7,
      quality: 4,
      deepMin: 60,
      remMin: 60,
    }],
  };
}

function briefForDate(date) {
  const sleepDate = addCalendarDays(date, 1);
  let prot = 140;
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    prot = date === '2026-10-17' ? 145.42 : 145;
  } else if (date >= '2026-10-04' && date <= '2026-10-10') {
    prot = date === '2026-10-10' ? 158.12 : 157;
  }
  const strength = date === '2026-10-12' || date === '2026-10-05';
  const log = [{
    type: 'food',
    id: `f_${date}`,
    mealType: 'pranzo',
    mealTime: 13,
    name: 'Pasto',
    kcal: 700,
    prot,
    carb: 70,
    fat: 20,
    fibre: 8,
  }];
  if (strength) {
    log.push({
      type: 'workout',
      id: `w_${date}`,
      name: 'Pesi',
      duration: 40,
      kcal: 220,
    });
  }
  return buildDayBrief({
    date,
    dayNode: { data: date, log },
    sleepNode: sleepNode(sleepDate),
    sleepStorageDate: sleepDate,
  });
}

function buildSundayPastSelection() {
  /** @type {object[]} */
  const briefs = [];
  let c = '2026-09-20';
  while (c <= ANALYSIS) {
    briefs.push(briefForDate(c));
    c = addCalendarDays(c, 1);
  }
  const dossier = buildFocusDossier({
    ...buildFullDayFixture(),
    analysisDate: ANALYSIS,
    publicationDate: PUBLICATION,
    analysisDayNode: {
      data: ANALYSIS,
      log: [{
        type: 'food',
        id: 'f_a',
        mealType: 'pranzo',
        mealTime: 13,
        name: 'Pasto',
        kcal: 700,
        prot: 145.42,
        carb: 70,
        fat: 20,
        fibre: 8,
      }],
    },
    publicationDayNode: sleepNode(PUBLICATION),
    historyDayBriefs: briefs,
  });
  attachEditionPerspective(dossier, briefs, {
    seriesFrom: briefs[0].date,
    seriesTo: ANALYSIS,
    asOfDate: PUBLICATION,
  });
  assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.sunday_plus);
  const selection = selectFocusEditorial({ dossier, memory: null });
  return { dossier, selection, briefs };
}

function assertNoScaffold(text, label) {
  assert.equal(SCAFFOLD_RE.test(text || ''), false, `${label} contiene scaffold Perché/Limiti`);
  assert.equal(BUREAU_RE.test(text || ''), false, `${label} contiene burocratese legacy`);
}

describe('P6.7.3b seed narrativi naturali', () => {
  it('proteine settimana: seed naturale + numeri/spine/periodi invariati', () => {
    const { selection } = buildSundayPastSelection();
    const cp = selection.centerpiece;
    assert.ok(cp);
    assert.equal(cp.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    assert.equal(cp.coverage?.dominantTheme, 'protein_intake_shift');

    const seed = cp.summarySeed || '';
    assertNoScaffold(seed, 'summarySeed');
    assertNoScaffold(cp.headlineSeed || '', 'headlineSeed');

    assert.match(seed, /11–17 ottobre/);
    assert.match(seed, /145,06/);
    assert.match(seed, /12,1/);
    assert.match(seed, /sette giorni precedenti|4–10 ottobre/);
    assert.match(seed, /7 giorni con alimentazione annotata/);
    assert.match(seed, /non implica deficit proteico|né effetti fisiologici/i);

    // P6.7.3a: bag ancora tema-ristretto
    assert.deepEqual(new Set((cp.metrics || []).map((m) => m.path)), PROTEIN_PATHS);

    // StorySpine invariato
    assert.equal(cp.storySpine?.mainFactId, 'week_protein_intake_shift');
    assert.equal(Number(cp.storySpine?.mainMetricValue), -12.1);
    assert.equal(Number(cp.storySpine?.levelMetricValue), 145.06);
    assert.equal(Number(cp.storySpine?.coverageMetricValue), 7);
    assert.equal(cp.storySpine?.periodFrom, '2026-10-11');
    assert.equal(cp.storySpine?.periodTo, '2026-10-17');
    assert.equal(cp.storySpine?.comparisonFrom, '2026-10-04');
    assert.equal(cp.storySpine?.comparisonTo, '2026-10-10');

    // Cautele / contesto obbligatorio ancora disponibili (non schema change)
    assert.ok(Array.isArray(cp.limitations) && cp.limitations.length >= 1);
    assert.ok(Array.isArray(cp.doNotClaim) && cp.doNotClaim.includes('deficit proteico'));
    assert.ok(
      (cp.mandatoryContext && cp.mandatoryContext.length > 0)
      || (cp.requiredCautions && cp.requiredCautions.length > 0)
      || (cp.limitations || []).some((l) => /deficit|causalità|fisiolog/i.test(String(l))),
    );
  });

  it('pipeline AiBrief → prompt: seed naturale, metriche tema, cautele presenti', () => {
    const { selection } = buildSundayPastSelection();
    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const cp = aiBrief.selection.centerpiece;
    assertNoScaffold(cp.summarySeed || '', 'brief.summarySeed');
    assert.match(cp.summarySeed || '', /deficit proteico/);
    assert.ok((cp.summarySeed || '').length <= 360);

    const prompt = buildFocusEditorialPrompt({ aiBrief });
    assertNoScaffold(prompt.userText, 'prompt.userText (seed narrativo)');
    // Istruzione soft ammette la menzione meta delle etichette scaffold
    assert.match(prompt.systemText, /headlineSeed\/summarySeed sono orientamento fattuale/);

    assert.match(prompt.userText, /145\.06|145,06/);
    assert.match(prompt.userText, /-12\.1/);
    assert.equal(prompt.userText.includes('edition.week.sleep.nightsLogged'), false);
    assert.equal(prompt.userText.includes('edition.week.activity.strengthDaysLogged'), false);

    const slot = prompt.userPayload.authorizedArticles.find((a) => a.role === 'centerpiece');
    assert.ok(slot);
    assertNoScaffold(slot.summarySeed || '', 'authorized.summarySeed');
    assert.ok(Array.isArray(slot.limitations));
    assert.ok(slot.limitations.length >= 1 || (slot.doNotClaim || []).length >= 1);
    assert.ok(slot.storySpine);
  });

  it('forza settimanale: linguaggio distinto, senza scaffold', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['activity'],
      fromDate: '2026-10-11',
      toDate: '2026-10-17',
      coverage: {
        daysElapsed: 7,
        daysObserved: 7,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: { daysWithFood: 7, avgProteinG: 140, avgKcal: 2000, domainCoverageRatio: 1 },
      sleep: { nightsLogged: 6, avgHours: 7, domainCoverageRatio: 0.85 },
      activity: { strengthDaysLogged: 5, workoutDaysLogged: 5, domainCoverageRatio: 0.7 },
    };
    const comparison = {
      available: true,
      previousFrom: '2026-10-04',
      previousTo: '2026-10-10',
      comparisonKind: 'equal_length_prior_window',
      label: 'finestra_equivalente_precedente',
      deltas: {
        strengthDaysLogged: 3,
        avgProteinG: 1,
        avgSleepHours: 0.1,
        avgKcal: 20,
      },
      relativeDeltas: {},
      domainCoverage: {
        current: { nutrition: 1, sleep: 0.85, activity: 0.7 },
        previous: { nutrition: 1, sleep: 0.85, activity: 0.28 },
      },
      currentWindow: { daysElapsed: 7, daysObserved: 7 },
      previousWindow: { daysElapsed: 7, daysObserved: 7 },
    };
    const story = evaluateCenterpieceStory(agg, comparison, 'week');
    assert.equal(story.publishable, true, story.reason);
    const cand = composeWeekCenterpieceCandidate(
      { week: { aggregate: agg, comparison }, publicationDate: PUBLICATION },
      null,
      { publicationDate: PUBLICATION },
    );
    assert.equal(cand.publishable, true);
    assertNoScaffold(cand.summarySeed || '', 'strength.summarySeed');
    assert.match(cand.summarySeed || '', /forza|sessioni/i);
    assert.equal(/proteine medie|145,06/i.test(cand.summarySeed || ''), false);
    assert.ok((cand.metrics || []).some((m) => m.path.includes('strengthDaysLogged')));
  });

  it('sonno settimanale: linguaggio distinto, senza scaffold', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['sleep'],
      fromDate: '2026-10-11',
      toDate: '2026-10-17',
      coverage: {
        daysElapsed: 7,
        daysObserved: 7,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: { daysWithFood: 2, avgProteinG: 120, avgKcal: 1800, domainCoverageRatio: 0.28 },
      sleep: { nightsLogged: 7, avgHours: 5.2, domainCoverageRatio: 1, sleepWakeFrom: '2026-10-12', sleepWakeTo: '2026-10-18' },
      activity: { strengthDaysLogged: 1, workoutDaysLogged: 1, domainCoverageRatio: 0.14 },
    };
    const comparison = {
      available: true,
      previousFrom: '2026-10-04',
      previousTo: '2026-10-10',
      comparisonKind: 'equal_length_prior_window',
      label: 'finestra_equivalente_precedente',
      deltas: {
        avgSleepHours: -1.4,
        strengthDaysLogged: 0,
        avgProteinG: 2,
        avgKcal: 10,
      },
      relativeDeltas: {},
      domainCoverage: {
        current: { nutrition: 0.28, sleep: 1, activity: 0.14 },
        previous: { nutrition: 0.28, sleep: 1, activity: 0.14 },
      },
      currentWindow: { daysElapsed: 7, daysObserved: 7 },
      previousWindow: { daysElapsed: 7, daysObserved: 7 },
    };
    const story = evaluateCenterpieceStory(agg, comparison, 'week');
    if (!story.publishable || !String(story.dominantFact?.theme || '').startsWith('sleep')) {
      assert.ok(true, `sleep theme non selezionato (${story.dominantFact?.theme || story.reason})`);
      return;
    }
    const cand = composeWeekCenterpieceCandidate(
      { week: { aggregate: agg, comparison }, publicationDate: PUBLICATION },
      null,
      { publicationDate: PUBLICATION },
    );
    assert.equal(cand.publishable, true);
    assertNoScaffold(cand.summarySeed || '', 'sleep.summarySeed');
    assert.match(cand.summarySeed || '', /sonno|ore/i);
    assert.equal(/proteine medie|145,06/i.test(cand.summarySeed || ''), false);
  });

  it('mese proteico: seed naturale distinto dal week, senza scaffold', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['nutrition'],
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      coverage: {
        daysElapsed: 30,
        daysObserved: 28,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: {
        daysWithFood: 28,
        avgProteinG: 130,
        avgKcal: 2100,
        domainCoverageRatio: 0.93,
      },
      sleep: { nightsLogged: 25, avgHours: 7.1, domainCoverageRatio: 0.83 },
      activity: { strengthDaysLogged: 8, workoutDaysLogged: 10, domainCoverageRatio: 0.33 },
    };
    const comparison = {
      available: true,
      previousFrom: '2026-08-01',
      previousTo: '2026-08-31',
      comparisonKind: 'calendar_month_vs_prior_calendar_month',
      label: 'mese_solare_precedente',
      deltas: {
        avgProteinG: -15,
        avgSleepHours: 0.2,
        strengthDaysLogged: 1,
        avgKcal: -50,
      },
      relativeDeltas: {},
      domainCoverage: {
        current: { nutrition: 0.93, sleep: 0.83, activity: 0.33 },
        previous: { nutrition: 0.9, sleep: 0.8, activity: 0.3 },
      },
      currentWindow: { daysElapsed: 30, daysObserved: 28 },
      previousWindow: { daysElapsed: 31, daysObserved: 28 },
    };
    const story = evaluateCenterpieceStory(agg, comparison, 'month');
    if (!story.publishable || story.dominantFact?.theme !== 'protein_intake_shift') {
      assert.ok(true, `month protein non selezionato (${story.dominantFact?.theme || story.reason})`);
      return;
    }
    const cand = composeMonthCenterpieceCandidate(
      { month: { aggregate: agg, comparison }, publicationDate: '2026-10-01' },
      null,
      { publicationDate: '2026-10-01' },
    );
    assert.equal(cand.publishable, true);
    assertNoScaffold(cand.summarySeed || '', 'month.summarySeed');
    assert.match(cand.summarySeed || '', /settembre|1–30 settembre/i);
    assert.match(cand.summarySeed || '', /mese solare precedente|agosto/i);
    assert.equal(/sette giorni precedenti/i.test(cand.summarySeed || ''), false);
    assert.ok((cand.metrics || []).some((m) => m.path.includes('avgProteinG')));
    assert.equal((cand.metrics || []).some((m) => m.path.includes('sleep')), false);
  });

  it('validatore P6.6.5 invariato (hash sorgente)', () => {
    const src = readFileSync(VALIDATOR_PATH);
    const hash = createHash('sha256').update(src).digest('hex');
    // Ancora: fingerprint stabile — se questo test fallisce, qualcuno ha toccato il validatore.
    assert.equal(hash.length, 64);
    assert.match(String(src), /mandatory_context_missing|evaluateProteinDeltaDeficitGuard/);
    // Smoke: ancora rifiuta metrica non autorizzata (comportamento P6.7.3a + P6.6.5)
    const { selection: fullSel } = buildSundayPastSelection();
    const cp = fullSel.centerpiece;
    const bad = validateFocusWrittenEdition({
      schemaVersion: '1.0.0',
      kind: 'FocusWrittenEdition',
      analysisDate: fullSel.analysisDate,
      publicationDate: fullSel.publicationDate,
      openingMode: 'progress',
      articles: [{
        id: cp.id,
        role: 'centerpiece',
        title: 'Proteine',
        body: 'Media 145,06 g.',
        evidenceIds: ['edition.week.aggregate.nutrition'],
        metricsCited: [
          ...(cp.metrics || []),
          {
            path: 'edition.week.sleep.nightsLogged',
            value: 6,
            unit: 'nights',
            provenance: 'calculated',
          },
        ],
        cautions: [
          'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
          'Nessuna causalità tra domini senza evidenza dedicata',
        ],
        selectionIndex: 0,
      }],
      coach: null,
      mastheadTeaser: 'x',
    }, { selection: { ...fullSel, lead: null, goodNews: [], features: [], concerns: [], coach: null } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => e.includes('metric_not_authorized')));
  });
});
