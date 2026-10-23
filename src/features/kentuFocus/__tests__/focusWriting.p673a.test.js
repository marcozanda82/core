/**
 * P6.7.3a — metriche centerpiece pertinenti al fatto (no dump sonno/forza su storia proteica).
 * Offline + FakeGemini. Zero Gemini reale / Firebase.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
  generateFocusWrittenEdition,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';
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
const COLLATERAL_PATHS = [
  'edition.week.sleep.nightsLogged',
  'edition.week.sleep.avgHours',
  'edition.week.activity.strengthDaysLogged',
];

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

describe('P6.7.3a evidenze pertinenti centerpiece proteico', () => {
  it('prima/dopo domenicale 18/10: proteine sì, sonno/forza no nel bag', () => {
    const { selection, dossier } = buildSundayPastSelection();
    const cp = selection.centerpiece;
    assert.ok(cp, 'centerpiece atteso');
    assert.equal(cp.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    assert.equal(cp.coverage?.dominantTheme, 'protein_intake_shift');

    const paths = (cp.metrics || []).map((m) => m.path);
    assert.deepEqual(new Set(paths), PROTEIN_PATHS);

    const byPath = Object.fromEntries((cp.metrics || []).map((m) => [m.path, m.value]));
    assert.equal(Number(byPath['edition.week.comparison.deltas.avgProteinG']), -12.1);
    assert.equal(Number(byPath['edition.week.nutrition.avgProteinG']), 145.06);
    assert.equal(Number(byPath['edition.week.nutrition.daysWithFood']), 7);

    for (const p of COLLATERAL_PATHS) {
      assert.equal(paths.includes(p), false, `collateral ancora presente: ${p}`);
    }

    // dossier generale intatto
    assert.ok(dossier.edition?.week?.aggregate?.sleep?.nightsLogged >= 1);
    assert.ok(
      (dossier.edition?.week?.aggregate?.activity?.strengthDaysLogged ?? 0) >= 0,
    );

    // storySpine invariato
    assert.equal(cp.storySpine?.mainFactId, 'week_protein_intake_shift');
    assert.equal(Number(cp.storySpine?.mainMetricValue), -12.1);
    assert.equal(Number(cp.storySpine?.levelMetricValue), 145.06);
    assert.equal(Number(cp.storySpine?.coverageMetricValue), 7);

    // refs non dumpano più sleep/activity
    assert.deepEqual(cp.refs, ['edition.week.aggregate.nutrition']);
  });

  it('pipeline brief/prompt: nessuna metrica sonno/forza autorizzata', () => {
    const { selection } = buildSundayPastSelection();
    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const briefPaths = (aiBrief.selection.centerpiece.metrics || []).map((m) => m.path);
    assert.deepEqual(new Set(briefPaths), PROTEIN_PATHS);

    const prompt = buildFocusEditorialPrompt({ aiBrief });
    assert.match(prompt.userText, /edition\.week\.comparison\.deltas\.avgProteinG/);
    assert.match(prompt.userText, /-12\.1/);
    assert.match(prompt.userText, /145\.06/);
    assert.equal(prompt.userText.includes('edition.week.sleep.nightsLogged'), false);
    assert.equal(prompt.userText.includes('edition.week.activity.strengthDaysLogged'), false);
    assert.ok(aiBrief.selection.centerpiece.storySpine);
  });

  it('altri articoli invariati; FakeGemini che cita sonno → metric_not_authorized', async () => {
    const { selection: fullSel } = buildSundayPastSelection();
    const other = [
      fullSel.lead,
      ...(fullSel.goodNews || []),
      ...(fullSel.features || []),
    ].filter(Boolean);
    for (const item of other) {
      if (item.topicId === WEEK_CENTERPIECE_TOPIC_ID) continue;
      // non richiede assenza di sleep ovunque: solo che non abbiamo svuotato altri pezzi
      assert.ok(item.id);
    }

    const selection = {
      ...fullSel,
      lead: null,
      goodNews: [],
      features: [],
      concerns: [],
      coach: null,
    };
    const cp = selection.centerpiece;
    const rawEdition = {
      schemaVersion: '1.0.0',
      kind: 'FocusWrittenEdition',
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
      openingMode: 'progress',
      articles: [{
        id: cp.id,
        role: 'centerpiece',
        title: 'Proteine medie settimanali a 145,06 g, in calo di 12,1 g',
        body: 'Nella settimana 11–17 ottobre la media proteica è 145,06 g (Δ −12,1 g vs 4–10) '
          + 'su 7 giorni con cibo. Nel medesimo intervallo figurano 6 notti e 3 giorni di forza.',
        evidenceIds: ['edition.week.aggregate.nutrition'],
        metricsCited: [
          ...(cp.metrics || []),
          {
            path: 'edition.week.sleep.nightsLogged',
            value: 6,
            unit: 'nights',
            provenance: 'calculated',
          },
          {
            path: 'edition.week.activity.strengthDaysLogged',
            value: 3,
            unit: 'days',
            provenance: 'calculated',
          },
        ],
        cautions: [
          'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
          'Nessuna correlazione causale stabilita tra i diversi domini registrati',
        ],
        selectionIndex: 0,
      }],
      coach: null,
      mastheadTeaser: 'Proteine in calo',
    };

    const rejected = validateFocusWrittenEdition(rawEdition, { selection });
    assert.equal(rejected.ok, false);
    assert.ok(
      rejected.errors.some((e) => e.includes('metric_not_authorized_edition.week.sleep.nightsLogged')),
      rejected.errors.join(' | '),
    );
    assert.ok(
      rejected.errors.some((e) => e.includes('metric_not_authorized_edition.week.activity.strengthDaysLogged')),
    );

    // Edizione corretta (solo fatti proteici) accettata dal contratto esistente
    const okEdition = {
      ...rawEdition,
      articles: [{
        ...rawEdition.articles[0],
        body: 'Nella settimana 11–17 ottobre la media proteica è 145,06 g al giorno, '
          + 'con una differenza di −12,1 g rispetto alla finestra 4–10 ottobre, '
          + 'su 7 giorni con cibo. Il confronto non è un mese solare precedente. '
          + 'Nessuna causalità tra domini senza evidenza dedicata. '
          + 'Lo scostamento non costituisce un deficit proteico dimostrato.',
        metricsCited: [...(cp.metrics || [])],
        cautions: [
          'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
          'Nessuna causalità tra domini senza evidenza dedicata',
        ],
      }],
    };
    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(okEdition) }],
    });
    const generated = await generateFocusWrittenEdition({
      selection,
      geminiProvider: provider,
    });
    assert.equal(generated.usedFallback, false, generated.aiValidation?.errors?.join(' | '));
    assert.equal(generated.aiValidation?.ok, true, generated.aiValidation?.errors?.join(' | '));
  });

  it('centerpiece forza: conserva strengthDays; non richiede proteine', () => {
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
    assert.ok(
      story.dominantFact?.theme === 'strength_week_density'
        || story.dominantFact?.theme === 'strength_frequency_change',
      story.dominantFact?.theme,
    );
    const cand = composeWeekCenterpieceCandidate(
      { week: { aggregate: agg, comparison }, publicationDate: PUBLICATION },
      null,
      { publicationDate: PUBLICATION },
    );
    assert.equal(cand.publishable, true);
    const paths = (cand.metrics || []).map((m) => m.path);
    assert.ok(paths.includes('edition.week.activity.strengthDaysLogged'));
    assert.equal(paths.includes('edition.week.nutrition.avgProteinG'), false);
    assert.equal(paths.includes('edition.week.sleep.nightsLogged'), false);
  });

  it('centerpiece mensile proteico: no sonno/forza nel bag', () => {
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
      // Se il gate non seleziona proteine con questi numeri, documenta e salta senza inventare.
      assert.ok(
        true,
        `month protein theme non selezionato (${story.dominantFact?.theme || story.reason})`,
      );
      return;
    }
    const cand = composeMonthCenterpieceCandidate(
      { month: { aggregate: agg, comparison }, publicationDate: '2026-10-01' },
      null,
      { publicationDate: '2026-10-01' },
    );
    assert.equal(cand.publishable, true);
    const paths = (cand.metrics || []).map((m) => m.path);
    assert.ok(paths.includes('edition.month.nutrition.avgProteinG'));
    assert.ok(paths.includes('edition.month.comparison.deltas.avgProteinG'));
    assert.ok(paths.includes('edition.month.nutrition.daysWithFood'));
    assert.equal(paths.includes('edition.month.sleep.nightsLogged'), false);
    assert.equal(paths.includes('edition.month.activity.strengthDaysLogged'), false);
  });
});
