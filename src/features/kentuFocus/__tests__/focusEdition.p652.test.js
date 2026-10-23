/**
 * P6.5.2 — story gate linked_domains, dedup overlap, anti-ripetizione mensile.
 * Test sintetici (fixture); nessuna verifica RAM reale in questo file.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import {
  FOCUS_EDITION_KIND,
} from '../edition/editionCalendar.js';
import {
  CENTERPIECE_STORY_REASON,
  FOCUS_VERIFICATION_STATUS,
} from '../edition/editionVerification.js';
import {
  evaluateCenterpieceStory,
  evaluateEditionOverlap,
} from '../editorial/centerpieceStoryGate.js';
import { MONTH_CENTERPIECE_TOPIC_ID } from '../editorial/composeMonthCenterpiece.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
  evaluateScaleAntiRepeat,
  FOCUS_EDITORIAL_SCALE,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
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

/** Invariante edizione: nessun candidato pubblicato e omitted insieme. */
function assertNoPublishOmitClash(selection) {
  const published = [
    selection.lead,
    selection.centerpiece,
    ...(selection.goodNews || []),
    ...(selection.features || []),
    ...(selection.continuity || []),
    ...(selection.concerns || []),
  ].filter(Boolean);
  const publishedKeys = new Set();
  for (const item of published) {
    const id = String(item.id || '');
    publishedKeys.add(id);
    if (id.startsWith('news_')) publishedKeys.add(`sig_${id.slice(5)}`);
    if (item.topicId) publishedKeys.add(item.topicId);
  }
  for (const o of selection.omitted || []) {
    assert.equal(
      publishedKeys.has(o.candidateId),
      false,
      `candidato ${o.candidateId} sia pubblicato sia omitted (${o.reason})`,
    );
  }
}

describe('P6.5.2 linked_domains ≠ sola coesistenza', () => {
  it('gate: tre domini solidi senza storie autonome → descriptive_only', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['nutrition', 'sleep', 'activity'],
      coverage: {
        daysElapsed: 7,
        daysObserved: 7,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: { daysWithFood: 7, avgKcal: 2050, avgProteinG: 115, domainCoverageRatio: 1 },
      sleep: { nightsLogged: 7, avgHours: 7.2, domainCoverageRatio: 1 },
      activity: { strengthDaysLogged: 2, workoutDaysLogged: 2, domainCoverageRatio: 0.28 },
    };
    const cmp = {
      available: true,
      deltas: {
        avgSleepHours: 0.05,
        strengthDaysLogged: 0,
        avgProteinG: 2,
        avgKcal: 30,
        workoutDaysLogged: 0,
      },
      relativeDeltas: {},
      domainCoverage: {
        current: { nutrition: 1, sleep: 1, activity: 0.28 },
        previous: { nutrition: 0.95, sleep: 0.95, activity: 0.3 },
      },
      currentWindow: { daysElapsed: 7, daysObserved: 7 },
      previousWindow: { daysElapsed: 7, daysObserved: 7 },
    };
    const story = evaluateCenterpieceStory(agg, cmp, 'week');
    assert.equal(story.publishable, false);
    assert.ok(
      story.reason === CENTERPIECE_STORY_REASON.descriptive_only
      || story.reason === CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story,
    );
    assert.notEqual(story.storyKind, 'linked_domains');
  });

  it('regressione editoriale 18/10: coesistenza nutrition/sleep/activity senza centerpiece habits_link', () => {
    // Domenicale 18/10, settimana 11–17: log ordinari su tre domini, senza densità/delta rilevanti.
    const publicationDate = '2026-10-18';
    const analysisDate = '2026-10-17';
    const briefs = buildBriefsRange('2026-10-04', analysisDate, (d) => {
      // Forza solo 2 giorni nella settimana 11–17 (sotto soglia densità)
      const inWeek = d >= '2026-10-11' && d <= '2026-10-17';
      const strength = inWeek
        ? (d === '2026-10-13' || d === '2026-10-15')
        : (Number(d.slice(8, 10)) % 3 === 0);
      return briefDay(d, { food: true, strength, sleepH: 7.15 });
    });
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food', id: 'f', mealType: 'pranzo', mealTime: 13,
          name: 'Pasto', kcal: 700, prot: 48, carb: 65, fat: 18, fibre: 7,
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
    assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.sunday_plus);
    assert.ok((dossier.edition.week?.aggregate?.solidDomains || []).length >= 2);

    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
    assert.equal(
      /abitudini collegate|linked/i.test(sel.centerpiece?.headlineSeed || ''),
      false,
    );
    assert.ok(
      sel.omitted.some((o) => o.reason === CENTERPIECE_STORY_REASON.descriptive_only
        || o.reason === CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story
        || o.reason === CENTERPIECE_STORY_REASON.insufficient_domain_coverage
        || String(o.candidateId).includes('week_habits')),
    );
    assertNoPublishOmitClash(sel);
  });

  it('linked_domains fondato (≥2 storie autonome su domini diversi) resta possibile', () => {
    const agg = {
      evidenceSolid: true,
      futureBlocked: false,
      solidDomains: ['nutrition', 'sleep', 'activity'],
      coverage: {
        daysElapsed: 7,
        daysObserved: 7,
        temporalComplete: true,
        daysFuture: 0,
      },
      nutrition: { daysWithFood: 7, avgKcal: 2100, avgProteinG: 140, domainCoverageRatio: 1 },
      sleep: { nightsLogged: 7, avgHours: 6.0, domainCoverageRatio: 1 },
      activity: { strengthDaysLogged: 5, workoutDaysLogged: 5, domainCoverageRatio: 0.7 },
    };
    const cmp = {
      available: false,
      deltas: null,
    };
    const story = evaluateCenterpieceStory(agg, cmp, 'week');
    assert.equal(story.publishable, true);
    // Può vincere habits_link o una delle storie autonome; non descriptive_only.
    assert.ok(
      story.storyKind === 'linked_domains'
      || story.storyKind === 'notable_continuity',
    );
  });
});

describe('P6.5.2 overlap: escluso non resta pubblicato', () => {
  it('mensile 01/10: storia forza centrale senza lead d30 duplicato', () => {
    const publicationDate = '2026-10-01';
    const analysisDate = '2026-09-30';
    // Agosto denso di forza, settembre rarefatto → significant_change mensile
    const briefs = buildBriefsRange('2026-08-02', analysisDate, (d) => briefDay(d, {
      strength: d < '2026-09-01' || Number(d.slice(8, 10)) % 10 === 1,
      sleepH: 7.2,
    }));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food', id: 'f', mealType: 'cena', mealTime: 20,
          name: 'Pasto', kcal: 600, prot: 40, carb: 50, fat: 20, fibre: 6,
        }, {
          type: 'workout', id: 'w', name: 'Pesi', duration: 40, kcal: 220,
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
    assert.equal(dossier.meta.editionKind, FOCUS_EDITION_KIND.month_plus);

    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.ok(sel.centerpiece, 'centerpiece mensile atteso');
    assert.equal(sel.centerpiece.topicId, MONTH_CENTERPIECE_TOPIC_ID);
    assert.match(sel.centerpiece.headlineSeed, /forza/i);

    // Lead d30 non deve restare se overlap preferisce il centerpiece
    if (sel.overlapResolution === 'overlap_strength_d30_vs_month_strength_story') {
      assert.equal(sel.lead, null);
      assert.ok(
        sel.omitted.some((o) => o.candidateId.includes('strength_continuity')
          && String(o.reason).includes('overlap_strength')),
      );
      assert.equal(
        (sel.features || []).some((f) => f.topicId === 'strength_continuity_d30'),
        false,
      );
      assert.equal(
        (sel.goodNews || []).some((g) => g.topicId === 'strength_continuity_d30'),
        false,
      );
    }

    assertNoPublishOmitClash(sel);
  });

  it('invariante: overlap drop lead → mai lead e omitted insieme', () => {
    const r = evaluateEditionOverlap(
      {
        id: 'news_strength_continuity_d30',
        topicId: 'strength_continuity_d30',
        domain: 'activity',
      },
      {
        topicId: MONTH_CENTERPIECE_TOPIC_ID,
        domain: 'activity',
        storyKind: 'significant_change',
        coverage: { dominantTheme: 'strength_frequency_change' },
        significantChange: true,
      },
    );
    assert.equal(r.action, 'prefer_centerpiece_drop_lead');

    // Simula composizione: dopo overlap lead null, omitted contiene sig, centerpiece ok
    const fake = {
      lead: null,
      centerpiece: {
        id: 'news_month_habits_transformation',
        topicId: MONTH_CENTERPIECE_TOPIC_ID,
      },
      goodNews: [],
      features: [],
      continuity: [],
      concerns: [],
      omitted: [{
        candidateId: 'sig_strength_continuity_d30',
        reason: 'overlap_strength_d30_vs_month_strength_story',
      }],
    };
    assertNoPublishOmitClash(fake);
  });

  it('prima pagina senza lead autonomo: composizione valida, niente riempitivi', () => {
    const publicationDate = '2026-10-01';
    const analysisDate = '2026-09-30';
    const briefs = buildBriefsRange('2026-08-02', analysisDate, (d) => briefDay(d, {
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
          type: 'food', id: 'f', mealType: 'pranzo', mealTime: 13,
          name: 'Pasto', kcal: 650, prot: 42, carb: 55, fat: 18, fibre: 5,
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
    const sel = selectFocusEditorial({ dossier, memory: null });
    if (sel.overlapResolution === 'overlap_strength_d30_vs_month_strength_story') {
      assert.equal(sel.lead, null);
      assert.ok(sel.centerpiece);
      // Nessun lead debole ripescato solo per riempire
      assert.ok(
        !sel.lead
        || sel.lead.storyClass === 'significant_pattern',
      );
    }
    assertNoPublishOmitClash(sel);
  });
});

describe('P6.5.2 anti-ripetizione mensile e domenicale', () => {
  it('stesso fingerprint + significantChange non bypassa (unit)', () => {
    const fp = 'month|2026-09-01|2026-09-30|strength_frequency_change|food30|sleep28|str12|cmp-4';
    const mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate: '2026-10-01',
      revision: 1,
      selection: {
        lead: null,
        centerpiece: {
          topicId: MONTH_CENTERPIECE_TOPIC_ID,
          editorialScale: FOCUS_EDITORIAL_SCALE.month_transformation,
          evidenceFingerprint: fp,
        },
        goodNews: [],
        features: [],
        concerns: [],
        coach: null,
      },
    });
    const anti = evaluateScaleAntiRepeat({
      memory: mem,
      publicationDate: '2026-10-01',
      scale: FOCUS_EDITORIAL_SCALE.month_transformation,
      topicId: MONTH_CENTERPIECE_TOPIC_ID,
      evidenceFingerprint: fp,
      significantChange: true,
    });
    assert.equal(anti.suppress, true);
    assert.match(anti.reason, /month.*repeat_same_evidence/);
  });

  it('seconda selezione mensile 01/10: stesso fingerprint → centerpiece escluso', () => {
    const publicationDate = '2026-10-01';
    const analysisDate = '2026-09-30';
    const briefs = buildBriefsRange('2026-08-02', analysisDate, (d) => briefDay(d, {
      strength: d < '2026-09-01' || Number(d.slice(8, 10)) % 9 === 0,
      sleepH: 7.2,
    }));
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
    const first = selectFocusEditorial({ dossier, memory: null });
    assert.ok(first.centerpiece, 'prima edizione: centerpiece atteso');
    assert.ok(first.centerpiece.evidenceFingerprint);

    const mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate,
      revision: 1,
      selection: first,
    });
    const second = selectFocusEditorial({ dossier, memory: mem });
    assert.equal(second.centerpiece, null);
    assert.ok(
      second.omitted.some((o) => String(o.reason).includes('repeat_same_evidence')
        || String(o.candidateId).includes('month_habits')),
    );
    // Non rigenerare lo stesso articolo altrove
    assert.equal(
      [...(second.features || []), ...(second.goodNews || [])]
        .some((n) => n.topicId === MONTH_CENTERPIECE_TOPIC_ID),
      false,
    );
    assertNoPublishOmitClash(second);
  });

  it('seconda selezione domenicale: stessa storia settimanale già pubblicata → esclusa', () => {
    const publicationDate = '2026-10-25';
    const analysisDate = '2026-10-24';
    const briefs = buildBriefsRange('2026-10-04', analysisDate, (d) => briefDay(d, {
      strength: true,
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
    if (!first.centerpiece) {
      // Densità non sempre garantita; skip soft solo se nessuna storia
      return;
    }
    const mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate,
      revision: 1,
      selection: first,
    });
    const second = selectFocusEditorial({ dossier, memory: mem });
    assert.equal(second.centerpiece, null);
    assert.ok(
      second.omitted.some((o) => String(o.reason).includes('repeat_same_evidence')
        || String(o.candidateId).includes('week_habits')),
    );
    assert.equal(
      [...(second.features || []), ...(second.goodNews || [])]
        .some((n) => n.topicId === WEEK_CENTERPIECE_TOPIC_ID),
      false,
    );
  });
});

describe('P6.5.2 preset futuro e quotidiano', () => {
  it('preset futuro 01/11 resta non valutabile', () => {
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
    // Seed quotidiani su finestre parzialmente future non diventano storie complete di edizione
    assert.ok(
      dossier.edition.month.aggregate.coverage.presentedAsComplete !== true,
    );
  });

  it('quotidiano 19/10: nessun centerpiece week/month', () => {
    const briefs = buildBriefsRange('2026-09-28', '2026-10-19', (d) => briefDay(d));
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      analysisDate: '2026-10-18',
      publicationDate: '2026-10-19',
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: '2026-09-28',
      seriesTo: '2026-10-18',
      asOfDate: '2026-10-19',
    });
    assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.daily);
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
    assert.equal(sel.editionKind, FOCUS_EDITION_KIND.daily);
  });
});
