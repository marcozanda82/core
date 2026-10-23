/**
 * P6.7.2a — gerarchia: proteine conferma ≠ lead/good; sonno lead solo se giustificato.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import { FOCUS_EDITION_KIND } from '../edition/editionCalendar.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import { FOCUS_STORY_CLASS } from '../editorial/focusEditorialConfig.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../editorial/focusEditorialMemory.js';
import {
  isSleepWeeklyRhythmLeadEligible,
  selectFocusEditorial,
} from '../editorial/selectFocusEditorial.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { resolveFocusTargetsFromProfile } from '../server/reader/resolveFocusProfileData.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

const ANALYSIS_SUN = '2026-10-17';
const PUB_SUN = '2026-10-18';
const ANALYSIS_DAY = '2026-10-18';
const PUB_DAY = '2026-10-19';

function sleepNode(date, wake = 6.5) {
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: 7.0,
      wakeTime: wake,
      quality: 4,
      deepMin: 60,
      remMin: 60,
    }],
  };
}

function briefProteinDelta(date) {
  const sleepDate = addCalendarDays(date, 1);
  let prot = 140;
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    prot = date === '2026-10-17' ? 145.42 : 145;
  } else if (date >= '2026-10-04' && date <= '2026-10-10') {
    prot = date === '2026-10-10' ? 158.12 : 157;
  }
  const strength = date === '2026-10-05' || date === '2026-10-12';
  const log = [{
    type: 'food', id: `f_${date}`, mealType: 'pranzo', mealTime: 13,
    name: 'Pasto', kcal: 700, prot, carb: 70, fat: 20, fibre: 8,
  }];
  if (strength) {
    log.push({
      type: 'workout', id: `w_${date}`, name: 'Pesi', duration: 40, kcal: 220,
    });
  }
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const wake = (dow === 0 || dow === 6) ? 7.5 : 6.5;
  return buildDayBrief({
    date,
    dayNode: { data: date, log },
    sleepNode: sleepNode(sleepDate, wake),
    sleepStorageDate: sleepDate,
  });
}

function briefOrdinaryWeek(date) {
  const sleepDate = addCalendarDays(date, 1);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const wake = (dow === 0 || dow === 6) ? 7.5 : 6.5;
  return buildDayBrief({
    date,
    dayNode: {
      data: date,
      log: [{
        type: 'food', id: `f_${date}`, mealType: 'pranzo', mealTime: 13,
        name: 'Pasto', kcal: 700, prot: 145, carb: 70, fat: 20, fibre: 8,
      }],
    },
    sleepNode: sleepNode(sleepDate, wake),
    sleepStorageDate: sleepDate,
  });
}

function targets127(asOf) {
  return resolveFocusTargetsFromProfile({
    profile: { proteinTarget: 150, targetCalories: 2300 },
    targets: {
      targetHistory: [
        { effectiveDate: '2026-01-01', targets: { prot: 127, kcal: 2100 } },
      ],
    },
  }, asOf);
}

function buildEdition({ analysisDate, publicationDate, dayProt, briefFn }) {
  const briefs = [];
  let c = '2026-09-20';
  while (c <= analysisDate) {
    briefs.push(briefFn(c));
    c = addCalendarDays(c, 1);
  }
  const pack = targets127(analysisDate);
  const dossier = buildFocusDossier({
    ...buildFullDayFixture(),
    analysisDate,
    publicationDate,
    targets: pack.targets,
    targetMeta: {
      referenceDate: pack.provenance.referenceDate,
      proteinSource: pack.provenance.proteinSource,
      kcalSource: pack.provenance.kcalSource,
    },
    analysisDayNode: {
      data: analysisDate,
      log: [{
        type: 'food', id: 'f_a', mealType: 'pranzo', mealTime: 13,
        name: 'Pasto', kcal: 700, prot: dayProt, carb: 70, fat: 20, fibre: 8,
      }],
    },
    publicationDayNode: sleepNode(publicationDate),
    historyDayBriefs: briefs,
  });
  attachEditionPerspective(dossier, briefs, {
    seriesFrom: briefs[0].date,
    seriesTo: analysisDate,
    asOfDate: publicationDate,
  });
  return dossier;
}

describe('P6.7.2a helper lead sonno', () => {
  it('memory null + significantChange false → non lead', () => {
    assert.equal(
      isSleepWeeklyRhythmLeadEligible(
        {
          topicId: 'sleep_weekly_rhythm',
          typology: 'sleep_weekly_rhythm',
          significantChange: false,
          evidenceFingerprint: 'fp1',
        },
        null,
        PUB_SUN,
      ),
      false,
    );
  });

  it('significantChange true anche con memory null → lead ammesso', () => {
    assert.equal(
      isSleepWeeklyRhythmLeadEligible(
        {
          topicId: 'sleep_weekly_rhythm',
          typology: 'sleep_weekly_rhythm',
          significantChange: true,
          evidenceFingerprint: 'fp_new',
        },
        null,
        PUB_SUN,
      ),
      true,
    );
  });

  it('memoria vuota (store presente) + novelty new → prima scoperta documentabile', () => {
    const mem = createEmptyEditorialMemory();
    assert.equal(
      isSleepWeeklyRhythmLeadEligible(
        {
          topicId: 'sleep_weekly_rhythm',
          typology: 'sleep_weekly_rhythm',
          editorialFamily: 'sleep_routine',
          significantChange: false,
          evidenceFingerprint: 'fp_first',
        },
        mem,
        PUB_SUN,
      ),
      true,
    );
  });
});

describe('P6.7.2a selezione offline', () => {
  it('1) sonno stabile sigChange false, memory null → lead vuoto (non riempito)', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 126,
      briefFn: briefProteinDelta,
    });
    const sleep = extractFocusSignals(dossier, null).find(
      (s) => s.topicId === 'sleep_weekly_rhythm',
    );
    assert.ok(sleep);
    assert.equal(sleep.significantChange, false);
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.lead?.topicId === 'sleep_weekly_rhythm', false);
    // Non promuove proteine a lead/good per riempire
    assert.equal(sel.lead?.topicId === 'protein_near_target', false);
    assert.equal(
      (sel.goodNews || []).some((g) => g.topicId === 'protein_near_target'),
      false,
    );
  });

  it('2) significantChange dimostrato → lead sonno ammesso anche memory null', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 126,
      briefFn: briefProteinDelta,
    });
    const ranked = extractFocusSignals(dossier, null);
    const sleep = ranked.find((s) => s.topicId === 'sleep_weekly_rhythm');
    assert.ok(sleep);
    // Simula evidenza di cambiamento (regolarità/bedtime) senza inventare metriche nel dossier
    const forced = { ...sleep, significantChange: true };
    assert.equal(
      isSleepWeeklyRhythmLeadEligible(forced, null, PUB_SUN),
      true,
    );
  });

  it('3) prima scoperta con memoria vuota documentabile → lead sonno possibile', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 126,
      briefFn: briefProteinDelta,
    });
    const mem = createEmptyEditorialMemory();
    const sel = selectFocusEditorial({ dossier, memory: mem });
    const sleep = extractFocusSignals(dossier, mem).find(
      (s) => s.topicId === 'sleep_weekly_rhythm',
    );
    assert.ok(sleep);
    assert.equal(sleep.significantChange, false);
    assert.equal(sel.lead?.topicId, 'sleep_weekly_rhythm');
  });

  it('4) sonno già raccontato con memoria → non lead; centerpiece/week gestiti da anti-repeat', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 126,
      briefFn: briefProteinDelta,
    });
    const first = selectFocusEditorial({
      dossier,
      memory: createEmptyEditorialMemory(),
    });
    assert.equal(first.lead?.topicId, 'sleep_weekly_rhythm');
    let mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate: PUB_SUN,
      selection: first,
    });
    const second = selectFocusEditorial({ dossier, memory: mem });
    assert.equal(second.lead?.topicId === 'sleep_weekly_rhythm', false);
    assert.ok(
      second.omitted.some((o) => String(o.candidateId).includes('sleep_weekly')),
    );
  });

  it('5) giornata target_hit ordinario → good e lead vuoti (no riempitivi)', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_DAY,
      publicationDate: PUB_DAY,
      dayProt: 126,
      briefFn: briefOrdinaryWeek,
    });
    assert.equal(dossier.edition?.editionKind || dossier.meta?.editionKind, FOCUS_EDITION_KIND.daily);
    const sig = extractFocusSignals(dossier, null).find(
      (s) => s.topicId === 'protein_near_target',
    );
    assert.equal(sig.typology, 'target_hit');
    assert.equal(sig.storyClass, FOCUS_STORY_CLASS.routine_log);
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
    assert.equal((sel.goodNews || []).length, 0);
    assert.equal(sel.lead?.topicId === 'protein_near_target', false);
    assert.equal(sel.lead?.topicId === 'sleep_weekly_rhythm', false);
  });

  it('6) domenicale Δ proteico −12,1 → centerpiece conservato', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 145.42,
      briefFn: briefProteinDelta,
    });
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece?.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    assert.equal(Number(sel.centerpiece.storySpine?.mainMetricValue), -12.1);
  });

  it('7) domenicale senza cambiamento significativo → centerpiece null', () => {
    const dossier = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 126,
      briefFn: briefOrdinaryWeek,
    });
    const sel = selectFocusEditorial({ dossier, memory: null });
    assert.equal(sel.centerpiece, null);
    assert.ok(
      sel.omitted.some((o) => String(o.candidateId).includes('week_habits')
        && /ordinary_oscillation|descriptive/i.test(o.reason)),
    );
  });
});
