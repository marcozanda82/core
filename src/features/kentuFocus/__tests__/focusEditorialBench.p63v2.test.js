/**
 * P6.3-V2 — banco prova redazione da fullHistory in memoria (offline).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { SLEEP_WEEKLY_RHYTHM_TOPIC_ID } from '../editorial/composeSleepRoutineEditorial.js';
import { addCalendarDays, wakeSegmentFromDate } from '../normalize/focusDateUtils.js';
import {
  buildFocusDossierFromInMemoryHistory,
  FOCUS_EDITORIAL_BENCH_DEFAULT_DATES,
  runFocusEditorialBench,
  summarizeFocusEditorialBench,
} from '../lab/runFocusEditorialBench.js';

function sleepEntry(nightEndedOn, overrides = {}) {
  const seg = wakeSegmentFromDate(nightEndedOn);
  return {
    type: 'sleep',
    id: `sleep_${nightEndedOn}`,
    hours: seg === 'weekend' ? 8.5 : 7.1,
    wakeTime: seg === 'weekend' ? 9 : 7,
    quality: 4,
    deepMin: 60,
    remMin: 60,
    ...overrides,
  };
}

/**
 * Albero tracker sintetico sufficientemente ricco per sleep_weekly_rhythm.
 * @param {string} analysisDate
 * @param {string} publicationDate
 * @param {number} historyDays
 */
function buildRealShapedHistory(analysisDate, publicationDate, historyDays = 30) {
  /** @type {Record<string, object>} */
  const fullHistory = {};
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    fullHistory[`trackerStorico_${date}`] = {
      data: date,
      log: [
        {
          type: 'food',
          id: `food_${date}`,
          mealType: 'pranzo',
          mealTime: 13,
          name: 'Pasto',
          kcal: 720,
          prot: 52,
          carb: 60,
          fat: 22,
          fibre: 8,
        },
        {
          type: 'workout',
          id: `w_${date}`,
          name: 'Pesi',
          duration: 40,
          kcal: 220,
        },
      ],
    };
    const sleepDate = addCalendarDays(date, 1);
    const node = fullHistory[`trackerStorico_${sleepDate}`] || { data: sleepDate, log: [] };
    if (!node.log.some((e) => e.type === 'sleep')) {
      node.log = [...node.log, sleepEntry(sleepDate)];
    }
    fullHistory[`trackerStorico_${sleepDate}`] = node;
  }
  // Notte anomala 26/09 (se nella finestra)
  if (fullHistory['trackerStorico_2026-09-26']) {
    fullHistory['trackerStorico_2026-09-26'] = {
      data: '2026-09-26',
      log: [
        ...(fullHistory['trackerStorico_2026-09-26'].log || []).filter((e) => e.type !== 'sleep'),
        sleepEntry('2026-09-26', {
          hours: 7.5,
          wakeTime: 18.75,
          bedtime: 11.25,
        }),
      ],
    };
  } else {
    fullHistory['trackerStorico_2026-09-26'] = {
      data: '2026-09-26',
      log: [sleepEntry('2026-09-26', {
        hours: 7.5,
        wakeTime: 18.75,
        bedtime: 11.25,
      })],
    };
  }
  // Assicura publication night
  if (!fullHistory[`trackerStorico_${publicationDate}`]) {
    fullHistory[`trackerStorico_${publicationDate}`] = {
      data: publicationDate,
      log: [sleepEntry(publicationDate)],
    };
  }
  return fullHistory;
}

describe('P6.3-V2 editorial bench', () => {
  const { analysisDate, publicationDate } = FOCUS_EDITORIAL_BENCH_DEFAULT_DATES;

  it('blocca se storico non ready (cache 15g non basta)', () => {
    const blocked = buildFocusDossierFromInMemoryHistory({
      fullHistory: {},
      fullHistoryLoadState: 'loading',
      analysisDate,
      publicationDate,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'history_not_ready');
  });

  it('costruisce FocusDossier con sleepRoutine da fullHistory ready', () => {
    const fullHistory = buildRealShapedHistory(analysisDate, publicationDate, 30);
    const built = buildFocusDossierFromInMemoryHistory({
      fullHistory,
      fullHistoryLoadState: 'ready',
      analysisDate,
      publicationDate,
      historyDays: 30,
      userTargets: {
        targetHistory: [{
          effectiveDate: '2026-10-01',
          targets: { kcal: 2300, proteinG: 150 },
        }],
      },
      bodyMetrics: {
        entries: [{ date: '2026-10-15', weightKg: 78.2 }],
      },
    });
    assert.equal(built.ok, true);
    assert.equal(built.diagnostics.rtdbReads, 0);
    assert.ok(built.diagnostics.sleepRoutinePresent);
    assert.ok(built.dossier.sleepRoutine?.aggregate);
    assert.equal(built.dossier.meta.publicationDate, publicationDate);
    // 26/09 se in serie: unusual
    const anomaly = built.dossier.sleepRoutine.nights.find(
      (n) => n.nightEndedOn === '2026-09-26',
    );
    if (anomaly) {
      assert.equal(anomaly.timingClass, 'unusual');
      assert.ok(anomaly.available);
    }
  });

  it('prima selezione: candidati + esito sleep_weekly_rhythm; nessun triplo member', () => {
    const fullHistory = buildRealShapedHistory(analysisDate, publicationDate, 30);
    const first = runFocusEditorialBench({
      fullHistory,
      fullHistoryLoadState: 'ready',
      analysisDate,
      publicationDate,
      historyDays: 30,
      userTargets: {
        targetHistory: [{
          effectiveDate: '2026-10-01',
          targets: { kcal: 2300, proteinG: 150 },
        }],
      },
      bodyMetrics: { entries: [{ date: '2026-10-17', weightKg: 78 }] },
      mode: 'first',
    });
    assert.equal(first.ok, true);
    assert.equal(first.rtdbReads, 0);
    assert.equal(first.firebaseWrites, 0);
    assert.equal(first.gemini, false);
    assert.equal(first.texts.kind, 'seed_only');
    assert.equal(first.memorySimulation.kind, 'empty');
    assert.ok(Array.isArray(first.candidates));
    assert.ok(first.candidates.length > 0);
    assert.equal(
      first.candidates.filter((c) => c.topicId === 'sleep_wake_weekday_stable').length,
      0,
    );
    assert.ok(
      ['selected', 'excluded', 'not_generated'].includes(first.sleepWeeklyRhythm.status),
    );
    const summary = summarizeFocusEditorialBench(first);
    assert.equal(summary.ok, true);
  });

  it('seconda selezione: sopprime o marca controfattuale; stessi dati/date', () => {
    const fullHistory = buildRealShapedHistory(analysisDate, publicationDate, 30);
    const baseInput = {
      fullHistory,
      fullHistoryLoadState: 'ready',
      analysisDate,
      publicationDate,
      historyDays: 30,
      userTargets: {
        targetHistory: [{
          effectiveDate: '2026-10-01',
          targets: { kcal: 2300, proteinG: 150 },
        }],
      },
      bodyMetrics: { entries: [{ date: '2026-10-17', weightKg: 78 }] },
    };
    const first = runFocusEditorialBench({ ...baseInput, mode: 'first' });
    const second = runFocusEditorialBench({
      ...baseInput,
      mode: 'second_anti_repeat',
      priorBenchReport: first,
    });
    assert.equal(second.ok, true);
    assert.equal(second.dates.publicationDate, publicationDate);
    assert.equal(second.memoryPersisted, false);
    assert.match(String(second.memorySimulation.note || ''), /non è un’edizione del giorno dopo|CONTROFATTUALE|impossibile/i);

    if (first.sleepWeeklyRhythm.status === 'selected'
      || first.sleepWeeklyRhythm.status === 'excluded') {
      assert.ok(second.memorySimulation.evidenceFingerprint);
      if (first.sleepWeeklyRhythm.fingerprint) {
        assert.equal(
          second.memorySimulation.evidenceFingerprint,
          first.sleepWeeklyRhythm.fingerprint,
        );
      }
      // Storia tipicamente soppressa in seconda passata
      if (second.sleepWeeklyRhythm.status === 'excluded') {
        assert.ok(
          String(second.sleepWeeklyRhythm.reason || '').includes('repeat')
          || String(second.sleepWeeklyRhythm.reason || '').includes('not_publishable')
          || String(second.sleepWeeklyRhythm.reason || '').includes('family')
          || second.sleepWeeklyRhythm.reason === 'not_selected_after_ranking',
        );
      }
    }
  });

  it('non inventa day briefs oltre i nodi presenti', () => {
    const brief = buildDayBrief({
      date: analysisDate,
      dayNode: null,
      sleepNode: null,
      sleepStorageDate: publicationDate,
    });
    assert.equal(brief.sleepAvailable, false);
    const thin = buildFocusDossierFromInMemoryHistory({
      fullHistory: {
        [`trackerStorico_${publicationDate}`]: {
          data: publicationDate,
          log: [sleepEntry(publicationDate)],
        },
      },
      fullHistoryLoadState: 'ready',
      analysisDate,
      publicationDate,
      historyDays: 7,
    });
    assert.equal(thin.ok, true);
    assert.ok(thin.diagnostics.fieldsMissing.includes(`trackerStorico_${analysisDate}`));
  });
});
