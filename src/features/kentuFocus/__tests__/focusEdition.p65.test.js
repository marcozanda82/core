/**
 * P6.5 — edizioni sunday+/month+, centerpiece, memoria per scala.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import {
  FOCUS_EDITION_KIND,
  resolveEditionKind,
  resolveEditionWindows,
  resolvePreviousCalendarMonthWindow,
  resolveSundayWeekWindow,
} from '../edition/editionCalendar.js';
import {
  aggregateEditionPeriod,
  buildEditionPerspective,
  previousEqualLengthWindow,
} from '../edition/aggregateEditionWindows.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
  FOCUS_EDITORIAL_SCALE,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import { MONTH_CENTERPIECE_TOPIC_ID } from '../editorial/composeMonthCenterpiece.js';
import { addCalendarDays, wakeSegmentFromDate } from '../normalize/focusDateUtils.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

function sleepNode(date, overrides = {}) {
  const seg = wakeSegmentFromDate(date);
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: seg === 'weekend' ? 8.2 : 7.1,
      wakeTime: seg === 'weekend' ? 9 : 7,
      quality: 4,
      deepMin: 60,
      remMin: 60,
      ...overrides,
    }],
  };
}

/**
 * Serie densa cibo + forza + sonno per centerpiece pubblicabile.
 * @param {string} endAnalysisDate
 * @param {number} dayCount
 */
function buildDenseBriefs(endAnalysisDate, dayCount) {
  /** @type {object[]} */
  const briefs = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(endAnalysisDate, -i);
    const sleepDate = addCalendarDays(date, 1);
    briefs.push(buildDayBrief({
      date,
      dayNode: {
        data: date,
        log: [
          {
            type: 'food',
            id: `f_${date}`,
            mealType: 'pranzo',
            mealTime: 13,
            name: 'Pasto',
            kcal: 700,
            prot: 50,
            carb: 70,
            fat: 20,
            fibre: 8,
          },
          {
            type: 'workout',
            id: `w_${date}`,
            name: 'Pesi full body',
            duration: 45,
            kcal: 250,
          },
        ],
      },
      sleepNode: sleepNode(sleepDate),
      sleepStorageDate: sleepDate,
    }));
  }
  return briefs;
}

describe('P6.5 edition calendar', () => {
  it('risolve daily / sunday_plus / month_plus / sunday_month_plus', () => {
    assert.equal(resolveEditionKind('2026-10-19'), FOCUS_EDITION_KIND.daily);
    assert.equal(resolveEditionKind('2026-10-18'), FOCUS_EDITION_KIND.sunday_plus);
    assert.equal(resolveEditionKind('2026-10-01'), FOCUS_EDITION_KIND.month_plus);
    assert.equal(resolveEditionKind('2026-11-01'), FOCUS_EDITION_KIND.sunday_month_plus);
  });

  it('settimana dom→sab: pub 25/10 → 18–24; notte 25 esclusa', () => {
    const w = resolveSundayWeekWindow('2026-10-25');
    assert.equal(w.fromDate, '2026-10-18');
    assert.equal(w.toDate, '2026-10-24');
    assert.equal(w.excludesPublicationNight, '2026-10-25');
    const windows = resolveEditionWindows('2026-10-25');
    assert.equal(windows.editionKind, FOCUS_EDITION_KIND.sunday_plus);
    assert.equal(windows.analysisDate, '2026-10-24');
    assert.equal(windows.week.fromDate, '2026-10-18');
  });

  it('mese precedente e coincidenza 1/11/2026', () => {
    const m = resolvePreviousCalendarMonthWindow('2026-11-01');
    assert.equal(m.fromDate, '2026-10-01');
    assert.equal(m.toDate, '2026-10-31');
    const windows = resolveEditionWindows('2026-11-01');
    assert.equal(windows.editionKind, FOCUS_EDITION_KIND.sunday_month_plus);
    assert.ok(windows.week);
    assert.ok(windows.month);
    assert.equal(windows.week.fromDate, '2026-10-25');
    assert.equal(windows.week.toDate, '2026-10-31');
  });
});

describe('P6.5 aggregates + centerpiece', () => {
  it('domenicale: centerpiece settimanale senza riempire se evidenza manca', () => {
    const publicationDate = '2026-10-25';
    const analysisDate = '2026-10-24';
    const briefs = buildDenseBriefs(analysisDate, 21);
    const fixture = buildFullDayFixture();
    const dossier = buildFocusDossier({
      ...fixture,
      analysisDate,
      publicationDate,
      analysisDayNode: {
        data: analysisDate,
        log: [{
          type: 'food',
          id: 'f',
          mealType: 'pranzo',
          mealTime: 13,
          name: 'Pasto',
          kcal: 700,
          prot: 55,
          carb: 60,
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
      asOfDate: '2026-10-25',
    });
    assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.sunday_plus);
    assert.equal(dossier.edition.week.window.fromDate, '2026-10-18');
    assert.equal(dossier.edition.week.window.toDate, '2026-10-24');
    assert.ok(dossier.edition.evaluable.weekCenterpiece);

    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(selection.editionKind, FOCUS_EDITION_KIND.sunday_plus);
    // Densità forza alta → storia di continuità; medie sonno ordinarie da sole non bastano
    assert.ok(selection.centerpiece, 'centerpiece atteso per continuità forza densa');
    assert.equal(selection.centerpiece.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    assert.equal(selection.centerpiece.editorialScale, FOCUS_EDITORIAL_SCALE.week_interpretation);
    assert.ok(selection.centerpiece.observedPeriod);
    assert.match(selection.centerpiece.headlineSeed, /forza|sonno|proteine|kcal|abitudini/i);

    const mem = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate,
      revision: 1,
      selection,
    });
    const second = selectFocusEditorial({ dossier, memory: mem });
    assert.equal(second.centerpiece, null);
    assert.ok(
      second.omitted.some((o) => o.reason === 'week_interpretation_repeat_same_evidence'
        || o.reason === 'week_scale_repeat_same_evidence'
        || String(o.candidateId).includes('week_habits')),
    );
  });

  it('mensile: non inventa confronto se periodo precedente assente', () => {
    const publicationDate = '2026-11-01';
    const analysisDate = '2026-10-31';
    // Solo ~20 giorni: mese ottobre parziale, settembre assente
    const briefs = buildDenseBriefs(analysisDate, 20);
    const seriesFrom = briefs[0].date;
    const perspective = buildEditionPerspective(
      briefs,
      resolveEditionWindows(publicationDate),
      { seriesFrom, seriesTo: analysisDate, asOfDate: '2026-10-19' },
    );
    assert.equal(perspective.editionKind, FOCUS_EDITION_KIND.sunday_month_plus);
    // Pub 01/11 con asOf 19/10 → mese ottobre ancora futuro/parziale
    assert.ok(
      perspective.month.aggregate.coverage.daysFuture > 0
      || perspective.month.aggregate.futureBlocked,
    );
    assert.notEqual(perspective.month.aggregate.coverage.presentedAsComplete, true);
    assert.equal(perspective.month.comparison.available, false);

    // Fixture simulata esplicita con asOf = publication: centerpiece mese possibile
    const dense = buildDenseBriefs(analysisDate, 62);
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
      historyDayBriefs: dense,
    });
    attachEditionPerspective(dossier, dense, {
      seriesFrom: dense[0].date,
      seriesTo: analysisDate,
      asOfDate: publicationDate,
      forceSimulation: true,
      presetHint: 'fixture_simulation',
    });
    assert.ok(dossier.edition.evaluable.monthCenterpiece);
    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(selection.centerpiece?.topicId, MONTH_CENTERPIECE_TOPIC_ID);
    assert.equal(
      selection.centerpiece.editorialScale,
      FOCUS_EDITORIAL_SCALE.month_transformation,
    );
  });

  it('quotidiano: nessun centerpiece week/month', () => {
    const briefs = buildDenseBriefs('2026-10-18', 21);
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      historyDayBriefs: briefs,
    });
    attachEditionPerspective(dossier, briefs, {
      seriesFrom: briefs[0].date,
      seriesTo: '2026-10-18',
      asOfDate: '2026-10-19',
    });
    assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.daily);
    const sigs = extractFocusSignals(dossier, null);
    assert.equal(sigs.some((s) => s.topicId === WEEK_CENTERPIECE_TOPIC_ID), false);
    assert.equal(sigs.some((s) => s.topicId === MONTH_CENTERPIECE_TOPIC_ID), false);
    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(selection.centerpiece, null);
  });

  it('sonno settimanale: risvegli in finestra, non doppio conteggio notte di pub', () => {
    const week = resolveSundayWeekWindow('2026-10-25');
    const analysisDate = '2026-10-24';
    const briefs = buildDenseBriefs(analysisDate, 14);
    const agg = aggregateEditionPeriod(briefs, week, {
      seriesFrom: briefs[0].date,
      seriesTo: analysisDate,
    });
    assert.ok(agg.sleep.nightsLogged >= 4);
    assert.equal(agg.sleep.sleepWakeTo, '2026-10-24');
    // Nessuna notte con wake 25 nel bilancio
    const wakes = filterWakeDates(briefs, week.sleepWakeFrom, week.sleepWakeTo);
    assert.equal(wakes.includes('2026-10-25'), false);
  });

  it('finestra precedente equal-length', () => {
    const prev = previousEqualLengthWindow({
      fromDate: '2026-10-18',
      toDate: '2026-10-24',
      label: 'week_sun_sat',
    });
    assert.equal(prev.fromDate, '2026-10-11');
    assert.equal(prev.toDate, '2026-10-17');
  });
});

/** @param {object[]} briefs @param {string} from @param {string} to */
function filterWakeDates(briefs, from, to) {
  return briefs
    .map((b) => b.sleep?.nightEndedOn)
    .filter((w) => w && w >= from && w <= to);
}
