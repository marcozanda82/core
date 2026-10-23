/**
 * P6.3 — plausibilità orari, provenienza bedtime, integrazione editoriale routine.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aggregateSleepRoutine } from '../aggregate/aggregateSleepRoutine.js';
import {
  buildSleepNightRecord,
  buildSleepNightSeries,
  buildSleepNightSeriesFromBriefs,
} from '../aggregate/buildSleepNightSeries.js';
import { buildSleepRoutineSignals } from '../aggregate/buildSleepRoutineSignals.js';
import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import {
  composeSleepWeeklyRhythmCandidate,
  SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
} from '../editorial/composeSleepRoutineEditorial.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
  evaluateSleepRoutineAntiRepeat,
  SLEEP_ROUTINE_EDITORIAL_FAMILY,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { addCalendarDays, wakeSegmentFromDate } from '../normalize/focusDateUtils.js';
import { classifySleepTiming } from '../normalize/focusSleepTimingPlausibility.js';
import {
  normalizeSleepNight,
  resolveBedtimeProvenance,
} from '../normalize/normalizeSleepNight.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from './fixtures/focusDayFixtures.js';

function sleepNode(nightEndedOn, sleep) {
  return {
    data: nightEndedOn,
    log: [{ type: 'sleep', id: `sleep_${nightEndedOn}`, deepMin: 60, remMin: 60, ...sleep }],
  };
}

function buildOrdinaryRhythmMap(endDate, days) {
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
      // bedtime omesso → calculated
      quality: 4,
    }));
  }
  return map;
}

describe('P6.3 timing plausibility', () => {
  it('sveglia 18:45 + bedtime 11:15 → unusual, non cancellata; aggregati duali', () => {
    const daySleep = classifySleepTiming({
      available: true,
      wakeTime: 18.75,
      bedtime: 11.25,
      hours: 7.5,
    });
    assert.equal(daySleep.timingClass, 'unusual');
    assert.ok(daySleep.keepInSeries);
    assert.equal(daySleep.useInStrongRegularity, false);
    assert.equal(daySleep.spanMatchesDuration, true);

    const end = '2026-10-19';
    const map = buildOrdinaryRhythmMap(end, 14);
    map.set('2026-09-26', sleepNode('2026-09-26', {
      hours: 7.5,
      wakeTime: 18.75,
      bedtime: 11.25,
      quality: 3,
    }));
    // ricostruisci serie 14gg + forza inclusione 26/09 fuori finestra per record singolo
    const night = buildSleepNightRecord('2026-09-26', map.get('2026-09-26'));
    assert.equal(night.timingClass, 'unusual');
    assert.equal(night.wakeTime.value, 18.75);
    assert.ok(night.available);

    const from = addCalendarDays(end, -13);
    const nights = buildSleepNightSeries({ dayNodes: map, fromDate: from, toDate: end });
    // inietta la notte unusual nella serie per confronto aggregati
    const withUnusual = [...nights.filter((n) => n.nightEndedOn !== '2026-09-26'), night]
      .sort((a, b) => a.nightEndedOn.localeCompare(b.nightEndedOn));
    const agg = aggregateSleepRoutine({
      nights: withUnusual,
      windowDays: withUnusual.length,
      fromDate: withUnusual[0].nightEndedOn,
      toDate: end,
    });
    assert.ok(agg.anomalies.unusualNights >= 1);
    assert.equal(agg.anomalies.retainedInSeries, true);
    assert.ok(agg.ordinary.nightsUsed < agg.coverage.nightsLogged);
    assert.ok(agg.wake.all.n >= agg.ordinary.wake.all.n);
  });

  it('sonno diurno coerente conservato; mismatch → ambiguous', () => {
    const ok = classifySleepTiming({
      available: true,
      wakeTime: 16,
      bedtime: 10,
      hours: 6,
    });
    assert.equal(ok.timingClass, 'unusual');

    const bad = classifySleepTiming({
      available: true,
      wakeTime: 18.75,
      bedtime: 11.25,
      hours: 3,
    });
    assert.equal(bad.timingClass, 'ambiguous');
  });
});

describe('P6.3 bedtime provenance', () => {
  it('distinguie calculated, ambiguous, recorded', () => {
    const calc = resolveBedtimeProvenance({ hours: 8, wakeTime: 7 }, 7, 8);
    assert.equal(calc.provenance, 'calculated');
    assert.equal(calc.value, 23);

    const amb = resolveBedtimeProvenance({
      hours: 7.5,
      wakeTime: 18.75,
      bedtime: 11.25,
    }, 18.75, 7.5);
    assert.equal(amb.provenance, 'ambiguous');

    const rec = resolveBedtimeProvenance({
      hours: 7,
      wakeTime: 7,
      bedtime: 22,
    }, 7, 7);
    assert.equal(rec.provenance, 'recorded');

    const pack = normalizeSleepNight(sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 7,
      bedtime: 0, // 7 - 7 = 0 → ambiguous
    }), { publicationDate: '2026-10-19' });
    assert.equal(pack.sleep.bedtime.provenance, 'ambiguous');
  });

  it('non inferisce risvegli notturni da wakeTime', () => {
    const night = buildSleepNightRecord('2026-10-19', sleepNode('2026-10-19', {
      hours: 7,
      wakeTime: 18.75,
      bedtime: 11.25,
    }));
    assert.equal(night.nightAwakenings.provenance, 'missing');
    assert.notEqual(night.wakeTime.value, night.nightAwakenings.value);
  });
});

describe('P6.3 editorial integration', () => {
  it('tre segnali → una sola storia sleep_weekly_rhythm', () => {
    const map = buildOrdinaryRhythmMap('2026-10-19', 21);
    const from = addCalendarDays('2026-10-19', -20);
    const nights = buildSleepNightSeries({ dayNodes: map, fromDate: from, toDate: '2026-10-19' });
    const aggregate = aggregateSleepRoutine({
      nights,
      windowDays: 21,
      fromDate: from,
      toDate: '2026-10-19',
    });
    const signals = buildSleepRoutineSignals({ aggregate, fromDate: from, toDate: '2026-10-19' });
    const publishable = signals.filter((s) => s.publishable);
    assert.ok(publishable.length >= 2);

    const candidate = composeSleepWeeklyRhythmCandidate({
      aggregate,
      signals,
      primaryWindow: { from, to: '2026-10-19', windowDays: 21 },
    }, null, { publicationDate: '2026-10-19' });
    assert.ok(candidate);
    assert.equal(candidate.topicId, SLEEP_WEEKLY_RHYTHM_TOPIC_ID);
    assert.ok(candidate.memberTopicIds.length >= 2);
    assert.ok(candidate.headlineSeed.length > 0);
  });

  it('campione insufficiente → nessuna storia pubblicabile', () => {
    const map = buildOrdinaryRhythmMap('2026-10-19', 3);
    const nights = buildSleepNightSeries({
      dayNodes: map,
      fromDate: addCalendarDays('2026-10-19', -2),
      toDate: '2026-10-19',
    });
    const aggregate = aggregateSleepRoutine({ nights, windowDays: 3 });
    const candidate = composeSleepWeeklyRhythmCandidate({
      aggregate,
      signals: buildSleepRoutineSignals({ aggregate }),
    }, null, { publicationDate: '2026-10-19' });
    assert.equal(candidate, null);
  });

  it('anti-ripetizione: stessa storia soppressa; cambiamento significativo riapre; no falsa memoria', () => {
    const noMem = evaluateSleepRoutineAntiRepeat({
      memory: null,
      publicationDate: '2026-10-19',
      familyId: SLEEP_ROUTINE_EDITORIAL_FAMILY,
      topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      evidenceFingerprint: 'S|W2|D1.5|-|-|A0',
    });
    assert.equal(noMem.suppress, false);
    assert.equal(noMem.note, 'no_editorial_memory_or_date');

    let memory = createEmptyEditorialMemory();
    memory = applyEditorialMemoryAfterPublish(memory, {
      publicationDate: '2026-10-12',
      selection: {
        lead: null,
        features: [{
          topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
          editorialFamily: SLEEP_ROUTINE_EDITORIAL_FAMILY,
          evidenceFingerprint: 'S|W2|D1.5|-|-|A0',
        }],
        goodNews: [],
        concerns: [],
        coach: null,
      },
    });

    const same = evaluateSleepRoutineAntiRepeat({
      memory,
      publicationDate: '2026-10-15',
      familyId: SLEEP_ROUTINE_EDITORIAL_FAMILY,
      topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      evidenceFingerprint: 'S|W2|D1.5|-|-|A0',
      significantChange: false,
    });
    assert.equal(same.suppress, true);

    const changed = evaluateSleepRoutineAntiRepeat({
      memory,
      publicationDate: '2026-10-15',
      familyId: SLEEP_ROUTINE_EDITORIAL_FAMILY,
      topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      evidenceFingerprint: 'S|W2|D1.5|R-0.4|-|A0',
      significantChange: true,
    });
    assert.equal(changed.suppress, false);
    assert.equal(changed.note, 'significant_change_bypasses_cooldown');
  });

  it('compete con segnali non-sonno; non tre topic member separati', () => {
    const fixture = buildFullDayFixture();
    /** @type {object[]} */
    const briefs = [];
    for (let i = 20; i >= 0; i -= 1) {
      const date = addCalendarDays(ANALYSIS_DATE, -i);
      const sleepDate = addCalendarDays(date, 1);
      const seg = wakeSegmentFromDate(sleepDate);
      briefs.push(buildDayBrief({
        date,
        dayNode: {
          data: date,
          log: [{
            type: 'food',
            id: `f_${date}`,
            mealType: 'pranzo',
            mealTime: 13,
            name: 'Pasto',
            kcal: 700,
            prot: 55,
            carb: 60,
            fat: 20,
            fibre: 8,
          }, {
            type: 'workout',
            id: `w_${date}`,
            name: 'Pesi',
            duration: 45,
            kcal: 250,
          }],
        },
        sleepNode: sleepNode(sleepDate, {
          hours: seg === 'weekend' ? 8.5 : 7.2,
          wakeTime: seg === 'weekend' ? 9 : 7,
          quality: 4,
        }),
        sleepStorageDate: sleepDate,
        bodyWeightKg: date === ANALYSIS_DATE ? 78 : null,
      }));
    }

    const dossier = buildFocusDossier({
      ...fixture,
      targets: { kcal: 2300, proteinG: 150 },
      bodyWeightKg: 78,
      historyDayBriefs: briefs,
    });
    assert.ok(dossier.sleepRoutine?.aggregate);
    assert.ok(
      dossier.sleepRoutine.nights.some((n) => n.bedtime?.provenance === 'calculated'
        || n.bedtime?.provenance === 'ambiguous'),
    );

    const signals = extractFocusSignals(dossier, null);
    const rhythm = signals.filter((s) => s.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID);
    assert.equal(rhythm.length, 1);
    assert.equal(
      signals.filter((s) => s.topicId === 'sleep_wake_weekday_stable').length,
      0,
    );

    const selection = selectFocusEditorial({ dossier, memory: null });
    const allNews = [
      selection.lead,
      ...selection.goodNews,
      ...selection.features,
      ...(selection.continuity || []),
      ...selection.concerns,
    ].filter(Boolean);
    const rhythmNews = allNews.filter((n) => n.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID);
    assert.ok(rhythmNews.length <= 1);
    // P6.4: sleep_weekly_rhythm può essere lead se più significativo delle conferme quotidiane
    assert.ok(selection.lead || rhythmNews.length === 1 || selection.features.length > 0);
  });
});

describe('P6.3 series from briefs', () => {
  it('buildSleepNightSeriesFromBriefs usa nightEndedOn della sveglia', () => {
    const brief = buildDayBrief({
      date: '2026-10-18',
      dayNode: { data: '2026-10-18', log: [] },
      sleepNode: sleepNode('2026-10-19', { hours: 7, wakeTime: 7 }),
      sleepStorageDate: '2026-10-19',
    });
    assert.equal(brief.sleep.nightEndedOn, '2026-10-19');
    const series = buildSleepNightSeriesFromBriefs([brief]);
    assert.equal(series[0].nightEndedOn, '2026-10-19');
    assert.equal(series[0].segment, 'weekday');
  });
});
