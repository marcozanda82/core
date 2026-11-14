/**
 * kds-1. Il diario completo è focusDiary.2026-11-09.real.json
 * (15 ottobre–9 novembre, con i 30 giorni precedenti per le finestre).
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { computeDayScore } from '../computeDayScore.js';
import { computePeriodScore } from '../computePeriodScore.js';
import { persistDayScore } from '../dayScoreStore.js';
import {
  decodeDayScoreFromRtdb,
  encodeDayScoreForRtdb,
} from '../dayScoreRecord.js';
import { migrateDayScores } from '../migrateDayScores.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { realFixtureSkipReason } from '../../__tests__/fixtures/focusDiaryRealOct27.js';

const require = createRequire(import.meta.url);
const RANGE_FILE = 'focusDiary.2026-11-09.real.json';

function loadRangeFixture() {
  return require(`../../__tests__/fixtures/${RANGE_FILE}`);
}

/** Simulazione di taratura: i giorni passati con dati, senza day_status, si leggono come chiusi. */
function calibrationRecords(fullHistory, today) {
  const records = {};
  for (const key of Object.keys(fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= today) continue;
    const status = getDayStatus(date, { today, fullHistory });
    if (status !== 'unconfirmed') continue;
    records[date] = { confirmed: true, approximate: false, paused: false };
  }
  return records;
}

const TODAY = '2026-11-10';
const TARGET = 2000;
const CLOSED = { confirmed: true, approximate: false, paused: false };

function slot(history, date) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) {
    history[key] = { data: date, mealTimes: { pranzo: 13, cena: 21 }, log: [] };
  }
  return history[key];
}

function add(history, date, entry) {
  slot(history, date).log.push(entry);
}

function food(id, kcal, extra = {}) {
  return {
    type: 'food',
    id,
    name: extra.name || 'Piatto',
    mealType: extra.mealType || 'pranzo',
    mealTime: extra.mealTime ?? 13,
    kcal,
    prot: 20,
    carb: 40,
    fat: 10,
    ...(extra.sugars != null ? { sugars: extra.sugars } : {}),
    ...(extra.semanticTags ? { semanticTags: extra.semanticTags } : {}),
  };
}

function night(hours, bedtime = 23) {
  return {
    type: 'sleep',
    id: `sleep-${hours}-${bedtime}`,
    hours,
    wakeTime: 7,
    bedtime,
    bedtimeProvenance: 'recorded',
  };
}

function cardio(id, minutes) {
  return { type: 'workout', id, name: 'cardio', duration: minutes };
}

function strength(id, muscles, dateTag) {
  return {
    type: 'workout',
    id: `${id}-${dateTag}`,
    name: 'pesi',
    duration: 40,
    muscles,
  };
}

function scoreAt(date, history, extra = {}) {
  return computeDayScore(date, {
    today: TODAY,
    fullHistory: history,
    targetKcal: TARGET,
    scoreVersion: 'kds-1',
    ...extra,
  });
}

function correctedOct30History() {
  const item = (id, name, mealType, mealTime, kcal) => ({
    type: 'food',
    id,
    name,
    desc: name,
    mealType,
    mealTime,
    time: mealTime,
    grams: 100,
    kcal,
    cal: kcal,
    prot: 10,
    carb: 20,
    fat: 5,
    status: 'resolved',
  });
  const coffee = item('caf', 'Caffè', 'colazione', 8.5, 5);
  const lunch = [
    item('l1', 'Riso', 'pranzo', 14.85, 400),
    item('l2', 'Pollo', 'pranzo', 14.85, 280),
    item('l3', 'Verdure', 'pranzo', 14.85, 72),
  ];
  const dinner = [
    item('d1', 'Pasta', 'cena', 21.333, 420),
    item('d2', 'Pesce', 'cena', 21.333, 250),
    item('d3', 'Insalata', 'cena', 21.333, 82),
  ];
  return {
    'trackerStorico_2026-10-30': {
      data: '2026-10-30',
      mealTimes: { colazione: 8.5, pranzo: 14.85, cena: 21.333 },
      log: [
        { type: 'meal', desc: 'Colazione', mealId: 'colazione', items: [coffee] },
        { type: 'meal', desc: 'Pranzo', mealId: 'pranzo', items: lunch },
        { type: 'meal', desc: 'Cena', mealId: 'cena', items: dinner },
      ],
    },
  };
}

function brief(result) {
  const cylinders = {};
  for (const key of ['alimentazione', 'sonno', 'forza', 'cardio']) {
    cylinders[key] = {
      status: result.cylinders[key].status,
      keyFact: result.cylinders[key].keyFact,
      signals: result.cylinders[key].signals,
    };
  }
  return {
    score: result.score,
    dayStatus: result.dayStatus,
    reliability: result.reliability,
    cylinders,
  };
}

describe('kds-1 cilindri', () => {
  it('legge l’energia nei due sensi e cita energy_low_day solo sotto il 25%', () => {
    const on = {};
    add(on, '2026-11-01', food('a', 1700));
    add(on, '2026-11-02', night(8));
    assert.equal(scoreAt('2026-11-01', on).cylinders.alimentazione.status, 'on_track');

    const edge = {};
    add(edge, '2026-11-01', food('a', 1700));
    assert.equal(scoreAt('2026-11-01', edge).cylinders.alimentazione.status, 'on_track');

    const halfway = {};
    add(halfway, '2026-11-01', food('a', 1600));
    const halfwayScore = scoreAt('2026-11-01', halfway);
    assert.equal(halfwayScore.cylinders.alimentazione.status, 'halfway');
    assert.deepEqual(halfwayScore.cylinders.alimentazione.signals, []);

    const off = {};
    add(off, '2026-11-01', food('a', 1400));
    const offScore = scoreAt('2026-11-01', off);
    assert.equal(offScore.cylinders.alimentazione.status, 'off_track');
    assert.equal(offScore.cylinders.alimentazione.keyFact, '1400 kcal · 600 sotto');
    assert.ok(offScore.cylinders.alimentazione.signals.includes('energy_low_day'));

    const surplus = {};
    add(surplus, '2026-11-01', food('a', 2600));
    const surplusScore = scoreAt('2026-11-01', surplus);
    assert.equal(surplusScore.cylinders.alimentazione.status, 'off_track');
    assert.equal(surplusScore.cylinders.alimentazione.keyFact, '2600 kcal · 600 sopra');
    assert.equal(surplusScore.cylinders.alimentazione.signals.includes('energy_low_day'), false);
  });

  it('peggiora di un livello con un ultra-processato sfavorevole, non con il fondente', () => {
    const adverse = {};
    add(adverse, '2026-11-01', food('a', 2000, {
      name: 'Merendina',
      sugars: 20,
      semanticTags: { novaGroup: 4 },
    }));
    const adverseScore = scoreAt('2026-11-01', adverse);
    assert.equal(adverseScore.cylinders.alimentazione.status, 'halfway');
    assert.ok(adverseScore.cylinders.alimentazione.signals.includes('nova4_critique'));

    const chocolate = {};
    add(chocolate, '2026-11-01', food('a', 2000, {
      name: 'Cioccolato fondente 70%',
      sugars: 20,
      semanticTags: { novaGroup: 4 },
    }));
    assert.equal(scoreAt('2026-11-01', chocolate).cylinders.alimentazione.status, 'on_track');
  });

  it('classifica il sonno e peggiora solo sotto le 2 ore, con bedtime registrato o ricavato', () => {
    const history = {};
    add(history, '2026-11-02', night(7));
    add(history, '2026-11-03', night(6));
    add(history, '2026-11-04', night(5.5));
    assert.equal(scoreAt('2026-11-01', history).cylinders.sonno.status, 'on_track');
    assert.equal(scoreAt('2026-11-02', history).cylinders.sonno.status, 'halfway');
    assert.equal(scoreAt('2026-11-03', history).cylinders.sonno.status, 'off_track');
    assert.equal(scoreAt('2026-11-04', history).cylinders.sonno.status, 'no_data');

    const close = {};
    add(close, '2026-11-01', food('cena', 800, { mealType: 'cena', mealTime: 22 }));
    add(close, '2026-11-02', night(8, 23.5));
    const closeScore = scoreAt('2026-11-01', close);
    assert.equal(closeScore.cylinders.sonno.status, 'halfway');
    assert.ok(closeScore.cylinders.sonno.signals.includes('meal_within_3h_of_bedtime'));

    const insideThree = {};
    add(insideThree, '2026-11-01', food('cena', 800, { mealType: 'cena', mealTime: 21 }));
    add(insideThree, '2026-11-02', night(8, 23.5));
    const inside = scoreAt('2026-11-01', insideThree);
    assert.equal(inside.cylinders.sonno.status, 'on_track');
    assert.ok(inside.cylinders.sonno.signals.includes('meal_within_3h_of_bedtime'));

    const derived = {};
    add(derived, '2026-11-01', food('cena', 800, { mealType: 'cena', mealTime: 22 }));
    add(derived, '2026-11-02', {
      type: 'sleep',
      id: 'sleep-derived',
      hours: 8,
      wakeTime: 7.5,
      bedtime: 23.5,
      bedtimeProvenance: 'derived',
    });
    assert.equal(scoreAt('2026-11-01', derived).cylinders.sonno.status, 'halfway');
  });

  it('raggruppa la forza in parte alta e parte bassa, e lascia fuori il core', () => {
    const rest = {};
    add(rest, '2026-11-01', strength('s', ['Petto', 'Dorso', 'Gambe', 'Spalle'], '2026-11-01'));
    const restScore = scoreAt('2026-11-03', rest);
    assert.equal(restScore.cylinders.forza.status, 'on_track');
    assert.equal(restScore.cylinders.forza.keyFact, 'parte bassa 2 giorni fa · parte alta 2 giorni fa');

    const pair = {};
    add(pair, '2026-11-02', strength('s', ['Petto'], 'a'));
    add(pair, '2026-11-03', strength('s', ['Petto'], 'b'));
    const pairScore = scoreAt('2026-11-03', pair);
    assert.equal(pairScore.cylinders.forza.status, 'on_track');
    assert.equal(pairScore.cylinders.forza.keyFact, 'parte alta oggi');

    const fresh = {};
    add(fresh, '2026-11-02', strength('s', ['bicipiti', 'Gambe'], 'fresh'));
    assert.equal(scoreAt('2026-11-09', fresh).cylinders.forza.status, 'on_track');

    const idle = {};
    add(idle, '2026-10-26', strength('s', ['Gambe'], 'old'));
    const idleScore = scoreAt('2026-11-03', idle);
    assert.equal(idleScore.cylinders.forza.status, 'halfway');
    assert.equal(idleScore.cylinders.forza.keyFact, 'parte bassa 8 giorni fa');

    const edge = {};
    add(edge, '2026-10-24', strength('s', ['Spalle'], 'edge'));
    assert.equal(scoreAt('2026-11-03', edge).cylinders.forza.status, 'halfway');

    const late = {};
    add(late, '2026-10-20', strength('s', ['Dorso'], 'late'));
    const lateScore = scoreAt('2026-11-03', late);
    assert.equal(lateScore.cylinders.forza.status, 'off_track');
    assert.equal(lateScore.cylinders.forza.keyFact, 'parte alta 14 giorni fa');

    const coreOnly = {};
    add(coreOnly, '2026-11-01', strength('s', ['Core'], 'core'));
    assert.equal(scoreAt('2026-11-03', coreOnly).cylinders.forza.status, 'on_track');
    assert.match(scoreAt('2026-11-03', coreOnly).cylinders.forza.keyFact, /nessuna parte alta o bassa/);

    const full = {};
    add(full, '2026-11-08', strength('s', ['Total Body'], 'tb'));
    assert.equal(
      scoreAt('2026-11-09', full).cylinders.forza.keyFact,
      'parte bassa 1 giorno fa · parte alta 1 giorno fa',
    );

    assert.equal(scoreAt('2026-11-03', {}).cylinders.forza.status, 'no_data');
  });

  it('confronta i minuti di cardio degli ultimi 7 giorni con 150', () => {
    const history = {};
    add(history, '2026-11-03', cardio('c', 150));
    assert.equal(scoreAt('2026-11-03', history).cylinders.cardio.status, 'on_track');

    const halfway = {};
    add(halfway, '2026-11-03', cardio('c', 75));
    assert.equal(scoreAt('2026-11-03', halfway).cylinders.cardio.status, 'halfway');

    const low = {};
    add(low, '2026-11-03', cardio('c', 74));
    assert.equal(scoreAt('2026-11-03', low).cylinders.cardio.status, 'off_track');
    assert.equal(scoreAt('2026-11-03', {}).cylinders.cardio.status, 'off_track');
    assert.equal(scoreAt('2026-11-03', {}).cylinders.cardio.keyFact, '0 min / 7 giorni');
  });

  it('redistribuisce i pesi e non dà un numero sotto i due cilindri', () => {
    const history = {};
    add(history, '2026-11-01', food('a', 2000));
    add(history, '2026-11-02', night(6.5));
    const result = scoreAt('2026-11-01', history);
    assert.equal(result.cylinders.forza.status, 'no_data');
    assert.equal(result.cylinders.cardio.status, 'off_track');
    assert.equal(result.cylinders.sonno.status, 'halfway');
    assert.equal(result.score, 0.668);

    const empty = computeDayScore('2026-11-01', {
      today: TODAY,
      fullHistory: null,
      targetKcal: TARGET,
      record: CLOSED,
      scoreVersion: 'kds-1',
    });
    assert.equal(empty.score, null);
    assert.equal(empty.dayStatus, 'closed');
  });

  it('lascia null i giorni futuri, in corso, buco e in pausa', () => {
    const history = {};
    add(history, '2026-11-10', food('a', 2000));
    add(history, '2026-11-11', food('b', 2000));
    assert.equal(scoreAt('2026-11-11', history).score, null);
    assert.equal(scoreAt('2026-11-11', history).dayStatus, 'future');
    assert.equal(scoreAt('2026-11-10', history).score, null);
    assert.equal(scoreAt('2026-11-10', history).dayStatus, 'in_progress');
    assert.equal(scoreAt('2026-11-01', {}).score, null);
    assert.equal(scoreAt('2026-11-01', {}).dayStatus, 'hole');

    const paused = scoreAt('2026-11-01', history, {
      record: { confirmed: false, approximate: false, paused: true, pauseReason: 'vacanza' },
    });
    assert.equal(paused.score, null);
    assert.equal(paused.dayStatus, 'paused');
  });
});

describe('kds-1 periodo, memoria, ottobre', () => {
  it('conta i giorni con dati, anche non confermati, e tiene la scia con un buco', () => {
    const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
    const history = {};
    for (const date of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', ...dates]) {
      add(history, date, cardio(`c-${date}`, 40));
    }
    for (const date of dates) {
      add(history, date, food(`f-${date}`, 2000));
      add(history, nextDate(date), night(8));
    }
    const records = Object.fromEntries(dates.map((date) => [date, CLOSED]));
    const context = {
      today: TODAY,
      fullHistory: history,
      targetKcal: TARGET,
      records,
      scoreVersion: 'kds-1',
    };
    const full = computePeriodScore('2026-11-03', '2026-11-07', context);
    assert.equal(full.score, 1);
    assert.equal(full.coverage, 1);
    assert.equal(full.onTrackDays, 5);
    assert.equal(full.longestStreak, 5);
    assert.deepEqual(full.streaks, [{ from: '2026-11-03', to: '2026-11-07', length: 5 }]);

    history['trackerStorico_2026-11-05'].log = history['trackerStorico_2026-11-05'].log.map((entry) => (
      entry.id === 'f-2026-11-05' ? { ...entry, kcal: 1400 } : entry
    ));
    const yellow = computePeriodScore('2026-11-03', '2026-11-07', context);
    assert.equal(yellow.longestStreak, 4);
    assert.equal(yellow.streaks.length, 1);
    assert.equal(yellow.onTrackDays, 4);

    history['trackerStorico_2026-11-06'].log = history['trackerStorico_2026-11-06'].log.map((entry) => (
      entry.id === 'f-2026-11-06' ? { ...entry, kcal: 1400 } : entry
    ));
    const broken = computePeriodScore('2026-11-03', '2026-11-07', context);
    assert.equal(broken.longestStreak, 0);
    assert.deepEqual(broken.streaks, []);

    delete history['trackerStorico_2026-11-05'];
    delete records['2026-11-05'];
    const holeDay = computeDayScore('2026-11-05', context);
    assert.equal(holeDay.dayStatus, 'hole');
    assert.equal(holeDay.score, null);
    const hole = computePeriodScore('2026-11-03', '2026-11-07', context);
    assert.equal(hole.pastDays, 5);
    assert.equal(hole.longestStreak, 0);
    assert.deepEqual(hole.streaks, []);

    const thinRecords = {
      '2026-11-03': CLOSED,
      '2026-11-04': CLOSED,
    };
    const thin = computePeriodScore('2026-11-03', '2026-11-07', {
      ...context,
      records: thinRecords,
    });
    assert.equal(thin.eligibleDays, 4);
    assert.equal(thin.coverage, 0.8);
    assert.notEqual(thin.score, null);

    const sparseHistory = structuredClone(history);
    delete sparseHistory['trackerStorico_2026-11-06'];
    delete sparseHistory['trackerStorico_2026-11-07'];
    const sparse = computePeriodScore('2026-11-03', '2026-11-07', {
      ...context,
      fullHistory: sparseHistory,
      records: thinRecords,
    });
    assert.equal(sparse.coverage, 0.4);
    assert.equal(sparse.score, null);
  });

  it('un buco interrompe la scia e i tre giorni dopo ne aprono un’altra', () => {
    const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const history = {};
    const anchors = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
    for (const date of [...anchors, ...dates]) {
      if (date === '2026-11-05') continue;
      add(history, date, cardio(`c-${date}`, 40));
    }
    for (const date of dates) {
      if (date === '2026-11-05') continue;
      add(history, date, food(`f-${date}`, 2000));
      const wake = nextDate(date);
      if (wake !== '2026-11-05') add(history, wake, night(8));
    }
    const records = Object.fromEntries(
      dates.filter((date) => date !== '2026-11-05').map((date) => [date, CLOSED]),
    );
    const period = computePeriodScore('2026-11-03', '2026-11-08', {
      today: TODAY,
      fullHistory: history,
      targetKcal: TARGET,
      records,
      scoreVersion: 'kds-1',
    });
    assert.equal(period.longestStreak, 3);
    assert.deepEqual(period.streaks, [{ from: '2026-11-06', to: '2026-11-08', length: 3 }]);
  });

  it('riscrive solo se cambiano i fatti e non migra da solo', async () => {
    const history = correctedOct30History();
    const context = {
      today: TODAY,
      fullHistory: history,
      targetKcal: 2456,
      scoreVersion: 'kds-1',
    };
    const rows = new Map();
    const store = {
      async read(date) {
        return rows.get(date) || null;
      },
      async write(date, record) {
        rows.set(date, record);
        return record;
      },
    };

    const first = await persistDayScore(store, '2026-10-30', context);
    assert.equal(first.wrote, true);
    const second = await persistDayScore(store, '2026-10-30', context);
    assert.equal(second.wrote, false);
    assert.equal(second.record.dataVersion, first.record.dataVersion);

    history['trackerStorico_2026-10-30'].log[1].items[0].kcal = 500;
    const third = await persistDayScore(store, '2026-10-30', context);
    assert.equal(third.wrote, true);
    assert.notEqual(third.record.dataVersion, first.record.dataVersion);

    rows.set('2026-10-30', { ...first.record, version: 'kds-0' });
    const held = await persistDayScore(store, '2026-10-30', { ...context, historyLocked: true });
    assert.equal(held.wrote, false);
    assert.equal(held.needsMigration, true);
    assert.equal(held.record.version, 'kds-0');

    const plan = await migrateDayScores({
      fromVersion: 'kds-0',
      dates: ['2026-10-30'],
      store,
      context,
    });
    assert.equal(plan.executed, false);
    assert.equal(rows.get('2026-10-30').version, 'kds-0');

    const rewritten = await persistDayScore(store, '2026-10-30', context);
    assert.equal(rewritten.wrote, true);
    assert.equal(rewritten.needsMigration, false);
    assert.equal(rewritten.record.version, 'kds-1');

    const encoded = encodeDayScoreForRtdb({ ...first.record, score: null });
    assert.equal(encoded.score, undefined);
    assert.equal(encoded.scoreIsNull, true);
    assert.equal(decodeDayScoreFromRtdb(encoded).score, null);
  });

  it('sul diario completo il 28, il 29 e il 30 ottobre tornano i numeri veri', {
    skip: realFixtureSkipReason(RANGE_FILE),
  }, () => {
    const RANGE = loadRangeFixture();
    const context = {
      today: TODAY,
      fullHistory: RANGE.fullHistory,
      profile_targets: RANGE.profile_targets,
      records: calibrationRecords(RANGE.fullHistory, TODAY),
      scoreVersion: 'kds-1',
    };
    const oct28 = computeDayScore('2026-10-28', context);
    const oct29 = computeDayScore('2026-10-29', context);
    const oct30 = computeDayScore('2026-10-30', context);

    assert.equal(oct28.dayStatus, 'closed');
    assert.equal(oct29.dayStatus, 'closed');
    assert.equal(oct30.dayStatus, 'closed');
    assert.equal(computeDayScore('2026-11-10', context).dayStatus, 'in_progress');
    assert.equal(computeDayScore('2026-11-10', context).score, null);
    assert.equal(oct28.cylinders.alimentazione.keyFact, '2913 kcal · 457 sopra');
    assert.equal(oct28.cylinders.alimentazione.status, 'halfway');
    assert.equal(oct28.cylinders.sonno.keyFact, '7 h');
    assert.equal(oct29.cylinders.alimentazione.keyFact, '2431 kcal · 25 sotto');
    assert.equal(oct29.cylinders.forza.keyFact, 'parte bassa oggi · parte alta 5 giorni fa');
    assert.equal(oct29.cylinders.forza.status, 'on_track');
    assert.equal(oct30.cylinders.alimentazione.status, 'off_track');
    assert.equal(oct30.cylinders.alimentazione.keyFact, '1509 kcal · 947 sotto');
    assert.equal(oct30.cylinders.sonno.keyFact, '7 h 30');
    assert.equal(oct30.cylinders.sonno.status, 'on_track');
    assert.equal(oct30.score, 0.49);
    assert.ok(oct30.score < 0.5);

    const scores = [];
    for (let date = '2026-10-15'; date <= '2026-11-09'; date = addCalendarDays(date, 1)) {
      const day = computeDayScore(date, context);
      assert.equal(day.dayStatus, 'closed', date);
      scores.push(day.score);
    }
    assert.deepEqual(scores, [
      0.718, 0.83, 0.83, 0.83, 0.773, 0.618, 0.718, 0.538, 0.83, 0.378,
      0.47, 0.65, 0.65, 0.523, 0.718, 0.49, 0.83, 0.83, 0.378, 0.773,
      0.718, 0.618, 0.683, 0.423, 0.55, 0.703,
    ]);

    const corrected = computeDayScore('2026-10-30', {
      today: TODAY,
      fullHistory: correctedOct30History(),
      targetKcal: 2456,
      scoreVersion: 'kds-1',
    });
    assert.equal(corrected.version, 'kds-1');
    assert.equal(corrected.cylinders.alimentazione.status, 'off_track');
    assert.equal(corrected.cylinders.alimentazione.keyFact, '1509 kcal · 947 sotto');
    assert.ok(corrected.cylinders.alimentazione.signals.includes('energy_low_day'));
    assert.equal(corrected.dayStatus, 'unconfirmed');
    assert.equal(corrected.reliability, 'low');
    assert.equal(corrected.score, 0.15);
    assert.ok(corrected.score < 0.5);
  });
});

function nextDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
