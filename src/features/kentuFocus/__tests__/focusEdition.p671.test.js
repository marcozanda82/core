/**
 * P6.7.1 — notiziabilità prima del riempimento (selezione, non Gemini).
 *
 * Prima del fix (documentato offline):
 * - Domenicale 18/10 con 14 giorni forza: feature = strength_continuity_d30
 * - Giornaliera con 150,8 g / target 127: good = protein_near_target (target_above)
 * - Centerpiece proteico Δ −12,1 resta caso positivo significativo
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
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { resolveFocusTargetsFromProfile } from '../server/reader/resolveFocusProfileData.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

const ANALYSIS_SUN = '2026-10-17';
const PUB_SUN = '2026-10-18';
const ANALYSIS_DAY = '2026-10-18';
const PUB_DAY = '2026-10-19';

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

/**
 * @param {string} date
 * @param {'protein_delta'|'strength_count14'} mode
 */
function briefForDate(date, mode) {
  const sleepDate = addCalendarDays(date, 1);
  let prot = 140;
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    prot = date === '2026-10-17' ? 145.42 : 145;
  } else if (date >= '2026-10-04' && date <= '2026-10-10') {
    prot = date === '2026-10-10' ? 158.12 : 157;
  }
  /** protein_delta: poca forza in settimana (vince Δ proteico). strength_count14: 14 giorni d30. */
  const strengthDays = mode === 'strength_count14'
    ? [
      '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-28', '2026-09-30',
      '2026-10-02', '2026-10-04', '2026-10-06', '2026-10-08', '2026-10-10',
      '2026-10-12', '2026-10-14', '2026-10-15', '2026-10-17',
    ]
    : ['2026-10-05', '2026-10-12'];
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
  if (strengthDays.includes(date)) {
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

function buildBriefsTo(analysisDate, mode = 'protein_delta') {
  /** @type {object[]} */
  const out = [];
  let c = '2026-09-20';
  while (c <= analysisDate) {
    out.push(briefForDate(c, mode));
    c = addCalendarDays(c, 1);
  }
  return out;
}

function targets127(asOfDate) {
  return resolveFocusTargetsFromProfile({
    profile: { proteinTarget: 150, targetCalories: 2300 },
    targets: {
      targetHistory: [
        { effectiveDate: '2026-01-01', targets: { prot: 127, kcal: 2100 } },
      ],
    },
  }, asOfDate);
}

function buildEdition({ analysisDate, publicationDate, dayProt, mode = 'protein_delta' }) {
  const briefs = buildBriefsTo(analysisDate, mode);
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
        type: 'food',
        id: 'f_a',
        mealType: 'pranzo',
        mealTime: 13,
        name: 'Pasto',
        kcal: 800,
        prot: dayProt,
        carb: 70,
        fat: 20,
        fibre: 8,
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
  return { dossier, selection: selectFocusEditorial({ dossier, memory: null }) };
}

describe('P6.7.1 notiziabilità — above-target e forza thin', () => {
  it('150,8 g vs 127: target_above non è good/feature', () => {
    const { dossier, selection } = buildEdition({
      analysisDate: ANALYSIS_DAY,
      publicationDate: PUB_DAY,
      dayProt: 150.8,
    });
    assert.equal(dossier.day.nutrition.targets.proteinG.value, 127);
    const sig = extractFocusSignals(dossier, null).find((s) => s.topicId === 'protein_near_target');
    assert.ok(sig);
    assert.equal(sig.typology, 'target_above');
    assert.equal(sig.publishable, false);
    assert.equal(sig.omitReason, 'ordinary_above_target_not_newsworthy');
    assert.equal(
      (selection.goodNews || []).some((g) => g.topicId === 'protein_near_target'),
      false,
    );
    assert.equal(
      (selection.features || []).some((f) => f.topicId === 'protein_near_target'),
      false,
    );
    assert.ok(
      selection.omitted.some((o) => o.candidateId === 'sig_protein_near_target'
        && (o.reason === 'ordinary_above_target_not_newsworthy'
          || o.reason === 'not_publishable')),
    );
  });

  it('14 giorni forza solo conteggio → non feature; al più continuity', () => {
    const { dossier, selection } = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 136.8,
      mode: 'strength_count14',
    });
    assert.equal(dossier.history.d30.activity.strengthDaysLogged, 14);
    const sig = extractFocusSignals(dossier, null).find(
      (s) => s.topicId === 'strength_continuity_d30',
    );
    assert.ok(sig);
    assert.equal(sig.storyClass, FOCUS_STORY_CLASS.routine_log);
    assert.deepEqual(sig.preferredRoles, ['continuity']);
    assert.equal(
      (selection.features || []).some((f) => f.topicId === 'strength_continuity_d30'),
      false,
    );
    assert.equal(
      selection.lead?.topicId === 'strength_continuity_d30',
      false,
    );
    assert.equal(
      (selection.goodNews || []).some((g) => g.topicId === 'strength_continuity_d30'),
      false,
    );
    const inCont = (selection.continuity || []).some(
      (c) => c.topicId === 'strength_continuity_d30',
    );
    const omitted = selection.omitted.some(
      (o) => String(o.candidateId).includes('strength_continuity'),
    );
    assert.ok(inCont || omitted, 'continuity o omitted, mai feature');
  });

  it('centerpiece proteico settimanale Δ −12,1 conservato (notizia significativa)', () => {
    const { dossier, selection } = buildEdition({
      analysisDate: ANALYSIS_SUN,
      publicationDate: PUB_SUN,
      dayProt: 145.42,
      mode: 'protein_delta',
    });
    assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.sunday_plus);
    assert.ok(selection.centerpiece);
    assert.equal(selection.centerpiece.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    assert.equal(
      Number(selection.centerpiece.storySpine?.mainMetricValue),
      -12.1,
    );
    // Con poca forza in settimana il conteggio d30 non ruba lo slot feature
    assert.equal(
      (selection.features || []).some((f) => f.topicId === 'strength_continuity_d30'),
      false,
    );
  });

  it('proteine in linea (target_hit): non good/lead (P6.7.2a); al più continuity', () => {
    // 127 * 0.99 ≈ 125.7 → hit band (≥0.97, <1.08)
    const { dossier, selection } = buildEdition({
      analysisDate: ANALYSIS_DAY,
      publicationDate: PUB_DAY,
      dayProt: 126,
    });
    assert.equal(dossier.day.nutrition.targets.proteinG.value, 127);
    const sig = extractFocusSignals(dossier, null).find((s) => s.topicId === 'protein_near_target');
    assert.ok(sig);
    assert.equal(sig.typology, 'target_hit');
    assert.equal(sig.storyClass, FOCUS_STORY_CLASS.routine_log);
    assert.equal(
      (selection.goodNews || []).some((g) => g.topicId === 'protein_near_target'),
      false,
    );
    assert.equal(selection.lead?.topicId === 'protein_near_target', false);
  });

  it('slot vuoti accettati: daily senza centerpiece obbligatorio', () => {
    const { selection } = buildEdition({
      analysisDate: ANALYSIS_DAY,
      publicationDate: PUB_DAY,
      dayProt: 150.8,
    });
    assert.equal(selection.editionKind, FOCUS_EDITION_KIND.daily);
    assert.equal(selection.centerpiece, null);
  });
});
