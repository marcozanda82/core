/**
 * P6.5.1 — copertura temporale, confronti etichettati, storia centerpiece, overlap, coach.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import {
  aggregateEditionPeriod,
  assessWindowCoverage,
  compareEditionPeriods,
  previousEqualLengthWindow,
} from '../edition/aggregateEditionWindows.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import {
  FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
  FOCUS_EDITION_KIND,
  resolveEditionWindows,
} from '../edition/editionCalendar.js';
import {
  CENTERPIECE_STORY_REASON,
  FOCUS_VERIFICATION_STATUS,
} from '../edition/editionVerification.js';
import {
  evaluateCenterpieceStory,
  evaluateEditionOverlap,
} from '../editorial/centerpieceStoryGate.js';
import { selectFocusCoach } from '../editorial/focusCoachCatalog.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import { MONTH_CENTERPIECE_TOPIC_ID } from '../editorial/composeMonthCenterpiece.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

function sleepNode(date) {
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: 7.1,
      wakeTime: 7,
      quality: 4,
      deepMin: 60,
      remMin: 60,
    }],
  };
}

function briefDay(date, { food = true, strength = true, sleepH = 7.1 } = {}) {
  const sleepDate = addCalendarDays(date, 1);
  const log = [];
  if (food) {
    log.push({
      type: 'food', id: `f_${date}`, mealType: 'pranzo', mealTime: 13,
      name: 'Pasto', kcal: 700, prot: 50, carb: 70, fat: 20, fibre: 8,
    });
  }
  if (strength) {
    log.push({
      type: 'workout', id: `w_${date}`, name: 'Pesi full body', duration: 45, kcal: 250,
    });
  }
  return buildDayBrief({
    date,
    dayNode: { data: date, log },
    sleepNode: {
      data: sleepDate,
      log: [{
        type: 'sleep', id: `s_${date}`, hours: sleepH, wakeTime: 7, quality: 4,
        deepMin: 60, remMin: 60,
      }],
    },
    sleepStorageDate: sleepDate,
  });
}

function buildBriefsRange(fromDate, toDate, factory) {
  /** @type {object[]} */
  const out = [];
  let c = fromDate;
  while (c <= toDate) {
    out.push(factory(c));
    c = addCalendarDays(c, 1);
  }
  return out;
}

describe('P6.5.1 coverage vs future nodes', () => {
  it('01/11 con asOf 19/10: nessuna falsa completezza su ottobre', () => {
    const pub = '2026-11-01';
    const windows = resolveEditionWindows(pub);
    const briefs = buildBriefsRange('2026-09-01', '2026-10-31', (d) => {
      if (d <= '2026-10-19') return briefDay(d);
      return buildDayBrief({
        date: d,
        dayNode: { data: d, log: [] },
        sleepNode: { data: addCalendarDays(d, 1), log: [] },
        sleepStorageDate: addCalendarDays(d, 1),
      });
    });
    const cov = assessWindowCoverage(briefs, windows.month.fromDate, windows.month.toDate, {
      asOfDate: FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
      publicationDate: pub,
      seriesFrom: '2026-09-01',
      seriesTo: '2026-10-31',
      forceSimulation: true,
      presetHint: 'fixture_simulation',
    });
    assert.ok(cov.daysFuture > 0);
    assert.equal(cov.presentedAsComplete, false);
    assert.ok(
      cov.verificationStatus === FOCUS_VERIFICATION_STATUS.future_unverified
      || cov.verificationStatus === FOCUS_VERIFICATION_STATUS.fixture_simulation,
    );
    assert.ok(cov.daysObserved < cov.calendarDays);
    assert.ok(cov.daysObserved <= cov.daysElapsed);
  });

  it('fixture futura esplicitamente simulata: etichetta chiara, no centerpiece', () => {
    const briefs = buildBriefsRange('2026-10-01', '2026-10-31', (d) => briefDay(d));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate: '2026-10-31',
      publicationDate: '2026-11-01',
      analysisDayNode: { data: '2026-10-31', log: [] },
      publicationDayNode: sleepNode('2026-11-01'),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-10-01',
      seriesTo: '2026-10-31',
      asOfDate: '2026-10-19',
      forceSimulation: true,
      presetHint: 'fixture_simulation',
    });
    assert.equal(
      dossier.edition.verificationStatus,
      FOCUS_VERIFICATION_STATUS.fixture_simulation,
    );
    assert.equal(dossier.edition.month.aggregate.futureBlocked, true);
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
  });
});

describe('P6.5.1 comparison labeling', () => {
  it('settembre con storico dal 02/08: confronto etichettato come finestra equivalente', () => {
    const monthWin = {
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      label: 'prev_calendar_month',
      sleepWakeFrom: '2026-09-01',
      sleepWakeTo: '2026-09-30',
    };
    const prev = previousEqualLengthWindow(monthWin);
    assert.equal(prev.fromDate, '2026-08-02');
    assert.equal(prev.toDate, '2026-08-31');

    const briefs = buildBriefsRange('2026-08-02', '2026-09-30', (d) => briefDay(d, {
      strength: d >= '2026-09-01' ? Number(d.slice(8, 10)) % 3 === 0 : true,
    }));
    const cur = aggregateEditionPeriod(briefs, monthWin, {
      asOfDate: '2026-10-01',
      seriesFrom: '2026-08-02',
      seriesTo: '2026-09-30',
    });
    const prevAgg = aggregateEditionPeriod(briefs, prev, {
      asOfDate: '2026-10-01',
      seriesFrom: '2026-08-02',
      seriesTo: '2026-09-30',
    });
    const cmp = compareEditionPeriods(cur, prevAgg, { intendedLabel: 'prev_calendar_month' });
    assert.equal(cmp.available, true);
    assert.equal(cmp.comparisonKind, 'equal_length_prior_window');
    assert.equal(cmp.label, 'finestra_equivalente_precedente');
    assert.equal(cmp.previousFrom, '2026-08-02');
    assert.equal(cmp.previousTo, '2026-08-31');
    assert.match(cmp.interpretativeLimit, /Non è un mese solare precedente/i);
    assert.ok(cmp.currentWindow.daysObserved != null);
    assert.ok(cmp.domainCoverage);
  });
});

describe('P6.5.1 centerpiece story gate', () => {
  it('medie ordinarie senza cambiamenti: centerpiece assente', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['sleep', 'nutrition'],
      coverage: {
        daysElapsed: 7,
        daysObserved: 6,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: { daysWithFood: 6, avgKcal: 2000, avgProteinG: 120, domainCoverageRatio: 0.85 },
      sleep: { nightsLogged: 6, avgHours: 7.1, domainCoverageRatio: 0.85 },
      activity: { strengthDaysLogged: 1, workoutDaysLogged: 1, domainCoverageRatio: 0.14 },
    };
    const cmp = {
      available: true,
      deltas: {
        avgSleepHours: 0.1,
        strengthDaysLogged: 0,
        avgProteinG: 3,
        avgKcal: 40,
        workoutDaysLogged: 0,
      },
      relativeDeltas: {},
      domainCoverage: {
        current: { nutrition: 0.85, sleep: 0.85, activity: 0.14 },
        previous: { nutrition: 0.8, sleep: 0.8, activity: 0.2 },
      },
    };
    const story = evaluateCenterpieceStory(agg, cmp, 'week');
    assert.equal(story.publishable, false);
    assert.equal(story.reason, CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story);
  });

  it('cambiamento mensile forte e documentato: centerpiece presente', () => {
    const publicationDate = '2026-10-01';
    const analysisDate = '2026-09-30';
    const briefs = buildBriefsRange('2026-08-02', '2026-09-30', (d) => briefDay(d, {
      strength: d < '2026-09-01',
      sleepH: 7.2,
    }));
    for (let i = 0; i < 3; i += 1) {
      const d = addCalendarDays('2026-09-01', i * 8);
      const idx = briefs.findIndex((b) => b.date === d);
      if (idx >= 0) briefs[idx] = briefDay(d, { strength: true });
    }
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food', id: 'f', mealType: 'cena', mealTime: 20,
          name: 'Pasto', kcal: 600, prot: 40, carb: 50, fat: 20, fibre: 6,
        }],
      },
      publicationDayNode: sleepNode(publicationDate),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-08-02',
      seriesTo: analysisDate,
      asOfDate: publicationDate,
    });
    assert.ok(dossier.edition.month.comparison?.available);
    assert.equal(
      dossier.edition.month.comparison.comparisonKind,
      'equal_length_prior_window',
    );
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.ok(sel.centerpiece);
    assert.equal(sel.centerpiece.topicId, MONTH_CENTERPIECE_TOPIC_ID);
    assert.match(sel.centerpiece.headlineSeed, /forza/i);
    assert.equal(/oscillazioni ordinarie/i.test(sel.centerpiece.headlineSeed), false);
    assert.equal(/cambiamenti rilevanti/i.test(sel.centerpiece.headlineSeed), false);
  });

  it('domenicale senza storia significativa: centerpiece assente', () => {
    const publicationDate = '2026-10-18';
    const analysisDate = '2026-10-17';
    const briefs = buildBriefsRange('2026-10-04', analysisDate, (d) => briefDay(d, {
      strength: false,
      food: true,
      sleepH: 7.0,
    }));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food', id: 'f', mealType: 'pranzo', mealTime: 13,
          name: 'Pasto', kcal: 700, prot: 45, carb: 60, fat: 20, fibre: 6,
        }],
      },
      publicationDayNode: sleepNode(publicationDate),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-10-04',
      seriesTo: analysisDate,
      asOfDate: publicationDate,
    });
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
    assert.ok(
      sel.omitted.some((o) => o.reason === CENTERPIECE_STORY_REASON.descriptive_only
        || o.reason === CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story
        || o.reason === CENTERPIECE_STORY_REASON.insufficient_domain_coverage
        || String(o.candidateId).includes('week_habits')),
    );
  });
});

describe('P6.5.1 overlap + coach + memory', () => {
  it('stesso tema senza valore autonomo: drop centerpiece', () => {
    const r = evaluateEditionOverlap(
      { topicId: 'sleep_weekly_rhythm', domain: 'sleep', typology: 'sleep_weekly_rhythm' },
      {
        topicId: WEEK_CENTERPIECE_TOPIC_ID,
        domain: 'sleep',
        storyKind: null,
        coverage: { dominantTheme: 'sleep_week_pattern' },
        significantChange: false,
      },
    );
    assert.equal(r.action, 'drop_centerpiece');
  });

  it('overlap strength: mensile forte declassa lead d30', () => {
    const r = evaluateEditionOverlap(
      { topicId: 'strength_continuity_d30', domain: 'activity' },
      {
        topicId: MONTH_CENTERPIECE_TOPIC_ID,
        domain: 'activity',
        storyKind: 'significant_change',
        coverage: { dominantTheme: 'strength_frequency_change' },
        significantChange: true,
      },
    );
    assert.equal(r.action, 'prefer_centerpiece_drop_lead');
  });

  it('distinct sleep questions possono coesistere', () => {
    const r = evaluateEditionOverlap(
      { topicId: 'sleep_weekly_rhythm', domain: 'sleep', typology: 'sleep_weekly_rhythm' },
      {
        topicId: WEEK_CENTERPIECE_TOPIC_ID,
        domain: 'sleep',
        storyKind: 'significant_change',
        coverage: { dominantTheme: 'sleep_hours_shift' },
        significantChange: true,
      },
    );
    assert.equal(r.action, 'keep_both');
  });

  it('nessun coach proteico automatico in edizione speciale senza storia', () => {
    const briefs = buildBriefsRange('2026-09-01', '2026-09-30', (d) => briefDay(d));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate: '2026-09-30',
      publicationDate: '2026-10-01',
      targets: { kcal: 2300, proteinG: 150 },
      analysisDayNode: {
        data: '2026-09-30',
        log: [{
          type: 'food', id: 'f', mealType: 'pranzo', mealTime: 13,
          name: 'Pasto', kcal: 500, prot: 40, carb: 50, fat: 15, fibre: 4,
        }],
      },
      publicationDayNode: sleepNode('2026-10-01'),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-09-01',
      seriesTo: '2026-09-30',
      asOfDate: '2026-10-01',
    });
    assert.equal(dossier.meta.editionKind, FOCUS_EDITION_KIND.month_plus);
    const coach = selectFocusCoach(dossier, [], null, '2026-10-01');
    assert.notEqual(coach?.templateId, 'HIT_PROTEIN_PORTION');
  });

  it('anti-ripetizione settimanale', () => {
    const publicationDate = '2026-10-25';
    const analysisDate = '2026-10-24';
    const briefs = buildBriefsRange('2026-10-04', analysisDate, (d) => briefDay(d, { strength: true }));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food', id: 'f', mealType: 'pranzo', mealTime: 13,
          name: 'Pasto', kcal: 700, prot: 55, carb: 60, fat: 20, fibre: 8,
        }, {
          type: 'workout', id: 'w', name: 'Pesi', duration: 45, kcal: 250,
        }],
      },
      publicationDayNode: sleepNode(publicationDate),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-10-04',
      seriesTo: analysisDate,
      asOfDate: publicationDate,
    });
    const first = selectFocusEditorial({ dossier, memory: null });
    if (!first.centerpiece) return;
    const mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate,
      revision: 1,
      selection: first,
    });
    const second = selectFocusEditorial({ dossier, memory: mem });
    assert.equal(second.centerpiece, null);
  });
});
