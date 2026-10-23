/**
 * P6.2 — routine sonno: serie, aggregati, affidabilità, lab (offline).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateSleepRoutine,
  bedtimeHourStats,
  circularHourDelta,
  linearHourStats,
  medianOfSorted,
  quartilesOfSorted,
  SLEEP_ROUTINE_RELIABILITY,
} from '../aggregate/aggregateSleepRoutine.js';
import {
  buildSleepNightRecord,
  buildSleepNightSeries,
} from '../aggregate/buildSleepNightSeries.js';
import { buildSleepRoutineSignals } from '../aggregate/buildSleepRoutineSignals.js';
import { DEFAULT_SLEEP_ROUTINE_THRESHOLDS } from '../aggregate/sleepRoutineConfig.js';
import {
  buildFocusLabDossier,
  buildSleepRoutineLabBlock,
  summarizeFocusLabDossier,
} from '../lab/buildFocusLabDossier.js';
import {
  addCalendarDays,
  bedtimeLinearOffset,
  isoWeekdayFromDate,
  wakeSegmentFromDate,
} from '../normalize/focusDateUtils.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from './fixtures/focusDayFixtures.js';

/** @param {string} nightEndedOn @param {Partial<object>} sleep */
function sleepNode(nightEndedOn, sleep) {
  return {
    data: nightEndedOn,
    log: [
      {
        type: 'sleep',
        id: `sleep_${nightEndedOn}`,
        deepMin: 60,
        remMin: 60,
        ...sleep,
      },
    ],
  };
}

/**
 * Storia sintetica: feriali wake 7.0, weekend wake 9.0, durata 7 / 8.5.
 * @param {string} endDate nightEndedOn ultimo
 * @param {number} days
 */
function buildSyntheticNightMap(endDate, days) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = addCalendarDays(endDate, -i);
    const seg = wakeSegmentFromDate(d);
    const wake = seg === 'weekend' ? 9 : 7;
    const hours = seg === 'weekend' ? 8.5 : 7;
    map.set(d, sleepNode(d, {
      hours,
      wakeTime: wake,
      // bedtime calcolato dal form (assente) → calculated in normalizer
      quality: 4,
    }));
  }
  return map;
}

describe('P6.2 sleep routine — date e classificazione', () => {
  it('associa nightEndedOn alla mattina di risveglio e classifica lun–dom', () => {
    // 2026-10-19 = lunedì
    assert.equal(isoWeekdayFromDate('2026-10-19'), 1);
    assert.equal(wakeSegmentFromDate('2026-10-19'), 'weekday');
    assert.equal(wakeSegmentFromDate('2026-10-17'), 'weekend'); // sab
    assert.equal(wakeSegmentFromDate('2026-10-18'), 'weekend'); // dom
    assert.equal(wakeSegmentFromDate('2026-10-16'), 'weekday'); // ven

    const night = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 7.5,
      wakeTime: 7,
      bedtime: 22, // ≠ wake−duration (23.5) → recorded
      quality: 4,
    }));
    assert.equal(night.nightEndedOn, '2026-10-19');
    assert.equal(night.wakeWeekday, 1);
    assert.equal(night.segment, 'weekday');
    assert.equal(night.wakeTime.value, 7);
    assert.equal(night.wakeTime.provenance, 'recorded');
    assert.equal(night.bedtime.provenance, 'recorded');
    assert.equal(night.stages.usedForRoutine, false);
    assert.equal(night.stages.note, 'placeholder_excluded');
  });

  it('bedtime calcolato vs registrato; wrap mezzanotte', () => {
    const calculated = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 8,
      wakeTime: 7,
      // no bedtime → wake − hours
    }));
    assert.equal(calculated.bedtime.provenance, 'calculated');
    assert.equal(calculated.bedtime.value, 23);

    const wrap = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 6,
      bedtime: 23,
    }));
    assert.equal(wrap.bedtime.value, 23);
    assert.equal(bedtimeLinearOffset(23), 23);
    assert.equal(bedtimeLinearOffset(0.5), 24.5);

    const stats = bedtimeHourStats([23, 23.5, 0.5, 1]);
    assert.equal(stats.n, 4);
    assert.ok(stats.median != null);
    // mediana lineare di [23, 23.5, 24.5, 25] = 24 → wrap 0
    assert.ok(stats.median === 0 || stats.median === 24 || stats.median < 2);
  });

  it('non confonde wakeTime con risvegli notturni; deep/REM esclusi', () => {
    const night = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 7.25,
      awakenings: undefined,
    }));
    assert.equal(night.nightAwakenings.provenance, 'missing');
    assert.equal(night.nightAwakenings.note, 'no_structured_awakenings');
    assert.notEqual(night.wakeTime.value, night.nightAwakenings.value);

    const withAwake = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 7,
      awakenings: 2,
    }));
    assert.equal(withAwake.nightAwakenings.value, 2);
    assert.equal(withAwake.nightAwakenings.provenance, 'recorded');

    const pack = normalizeSleepNight(sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 7,
      deepMin: 60,
      remMin: 60,
    }), { publicationDate: '2026-10-19' });
    assert.equal(pack.sleep.deepMin.provenance, 'missing');
  });
});

describe('P6.2 sleep routine — metriche e soglie', () => {
  it('mediana e IQR su campione noto', () => {
    assert.equal(medianOfSorted([1, 2, 3, 4, 5]), 3);
    assert.equal(medianOfSorted([1, 2, 3, 4]), 2.5);
    const { iqr } = quartilesOfSorted([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(iqr != null && iqr > 0);
    const wake = linearHourStats([7, 7, 7.1, 6.9, 7, 7.05]);
    assert.ok(wake.iqr != null && wake.iqr < 0.5);
  });

  it('confronto feriali/weekend e insufficient_evidence con pochi weekend', () => {
    const map = buildSyntheticNightMap('2026-10-19', 14);
    const nights = buildSleepNightSeries({
      dayNodes: map,
      fromDate: addCalendarDays('2026-10-19', -13),
      toDate: '2026-10-19',
    });
    const agg = aggregateSleepRoutine({
      nights,
      windowDays: 14,
      fromDate: addCalendarDays('2026-10-19', -13),
      toDate: '2026-10-19',
    });
    assert.equal(agg.convention.segmentBy, 'wake_morning_nightEndedOn');
    assert.ok(agg.wake.weekday.n >= 4);
    assert.ok(agg.wake.weekend.n >= 2);
    assert.equal(agg.reliability.weekdayWeekendCompare.status, SLEEP_ROUTINE_RELIABILITY.reliable);
    assert.ok(Math.abs(agg.wake.deltaWeekendMinusWeekdayH - 2) < 0.01);
    assert.ok(agg.duration.deltaWeekendMinusWeekdayH > 1);
    assert.match(agg.duration.interpretationNote, /not sleep debt/i);

    // Solo 1 weekend → insufficient
    const thin = nights.filter((n) => n.segment === 'weekday')
      .concat(nights.filter((n) => n.segment === 'weekend').slice(0, 1));
    const thinAgg = aggregateSleepRoutine({
      nights: thin,
      windowDays: 14,
      thresholds: DEFAULT_SLEEP_ROUTINE_THRESHOLDS,
    });
    assert.equal(
      thinAgg.reliability.weekdayWeekendCompare.status,
      SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    );
    assert.ok(
      thinAgg.reliability.weekdayWeekendCompare.reasons.some((r) => r.includes('weekend')),
    );
  });

  it('delta circolare bedtime e soglie configurabili', () => {
    assert.equal(circularHourDelta(23, 1), 2);
    assert.equal(circularHourDelta(1, 23), -2);
    const agg = aggregateSleepRoutine({
      nights: [],
      windowDays: 7,
      thresholds: { minWeekdayWakeNights: 99 },
    });
    assert.equal(agg.thresholds.minWeekdayWakeNights, 99);
    assert.equal(
      agg.reliability.weekdayWeekendCompare.status,
      SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    );
  });
});

describe('P6.2 sleep routine — segnali e lab', () => {
  it('emette segnali strutturati con topicId; non forza publish su campione debole', () => {
    const map = buildSyntheticNightMap('2026-10-19', 21);
    const from = addCalendarDays('2026-10-19', -20);
    const nights = buildSleepNightSeries({ dayNodes: map, fromDate: from, toDate: '2026-10-19' });
    const aggregate = aggregateSleepRoutine({
      nights,
      windowDays: 21,
      fromDate: from,
      toDate: '2026-10-19',
    });
    const signals = buildSleepRoutineSignals({ aggregate, fromDate: from, toDate: '2026-10-19' });
    const ids = signals.map((s) => s.topicId);
    assert.ok(ids.includes('sleep_wake_weekday_stable'));
    assert.ok(ids.includes('sleep_wake_weekend_vs_weekday'));
    assert.ok(ids.includes('sleep_duration_weekend_vs_weekday'));
    assert.ok(ids.includes('sleep_bedtime_shift_recent'));
    assert.ok(ids.includes('sleep_wake_regularity_change'));

    const weekendWake = signals.find((s) => s.topicId === 'sleep_wake_weekend_vs_weekday');
    assert.equal(weekendWake.publishable, true);
    assert.equal(weekendWake.reliability, SLEEP_ROUTINE_RELIABILITY.reliable);
    assert.ok(weekendWake.antiRepeatHint?.topicId);

    const weak = buildSleepRoutineSignals({
      aggregate: aggregateSleepRoutine({ nights: nights.slice(0, 3), windowDays: 3 }),
    });
    assert.ok(weak.every((s) => s.publishable === false));
    assert.ok(weak.every((s) => s.withholdReason));
  });

  it('lab dossier espone sleepRoutine; regressione notte principale e history', () => {
    const fixture = buildFullDayFixture();
    /** @type {Record<string, object>} */
    const fullHistory = {};
    fullHistory[`trackerStorico_${fixture.analysisDate}`] = fixture.analysisDayNode;
    fullHistory[`trackerStorico_${fixture.publicationDate}`] = fixture.publicationDayNode;

    for (let i = 0; i < 35; i += 1) {
      const date = addCalendarDays(fixture.analysisDate, -i);
      if (!fullHistory[`trackerStorico_${date}`]) {
        fullHistory[`trackerStorico_${date}`] = {
          data: date,
          log: [{ type: 'food', id: `f_${date}`, mealType: 'pranzo', mealTime: 13, name: 'X', kcal: 500, prot: 30, carb: 40, fat: 15, fibre: 4 }],
        };
      }
      const sleepDate = addCalendarDays(date, 1);
      const seg = wakeSegmentFromDate(sleepDate);
      if (!fullHistory[`trackerStorico_${sleepDate}`]?.log?.some((e) => e.type === 'sleep')) {
        const existing = fullHistory[`trackerStorico_${sleepDate}`];
        const sleepEntry = {
          type: 'sleep',
          id: `sleep_${sleepDate}`,
          hours: seg === 'weekend' ? 8.5 : 7,
          wakeTime: seg === 'weekend' ? 9 : 7,
          quality: 4,
          deepMin: 60,
          remMin: 60,
        };
        if (existing) {
          existing.log = [...(existing.log || []), sleepEntry];
        } else {
          fullHistory[`trackerStorico_${sleepDate}`] = { data: sleepDate, log: [sleepEntry] };
        }
      }
    }

    const dossier = buildFocusLabDossier({
      historyLoadState: 'ready',
      editionMode: 'focus_standard',
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'essential',
      exportedAt: '2026-10-17T12:00:00.000Z',
    });

    assert.ok(dossier.sleepRoutine);
    assert.equal(dossier.sleepRoutine.schema, 'kentu.focusSleepRoutine.v1');
    assert.ok(dossier.sleepRoutine.nights.length >= 14);
    assert.ok(dossier.sleepRoutine.aggregate.coverage.nightsLogged > 0);
    assert.ok(Array.isArray(dossier.sleepRoutine.signals));
    assert.equal(dossier.lastCompletedNight.storageDate, PUBLICATION_DATE);
    assert.equal(dossier.lastCompletedNight.stagesNote, 'placeholder_stages_detected');
    assert.ok(dossier.history.d10.aggregates.sleep.nightsLogged >= 0);
    assert.equal(dossier.history.d30.presentedAsComplete, true);

    const summary = summarizeFocusLabDossier(dossier);
    assert.ok(summary.sleepRoutineNights > 0);
    assert.ok(summary.sleepRoutineWeekdayWeekendReliability);

    const block = buildSleepRoutineLabBlock({
      dayNodes: new Map(
        Object.entries(fullHistory).map(([k, v]) => [k.replace('trackerStorico_', ''), v]),
      ),
      publicationDate: PUBLICATION_DATE,
      historyDays: 30,
      d30Allowed: true,
    });
    assert.equal(block.d30.available, true);
    assert.ok(block.d30.aggregate.wake.weekday.n >= 4);
  });
});
