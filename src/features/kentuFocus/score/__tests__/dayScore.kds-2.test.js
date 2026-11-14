import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { realFixtureSkipReason } from '../../__tests__/fixtures/focusDiaryRealOct27.js';
import { computeDayScore } from '../computeDayScore.js';
import { encodeScoreFeedback, groupDisagreements } from '../scoreFeedback.js';

const require = createRequire(import.meta.url);
const TODAY = '2026-11-10';
const TARGET = 2000;
const RANGE_FILE = 'focusDiary.2026-11-09.real.json';

function slot(history, date) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, mealTimes: { pranzo: 13, cena: 21 }, log: [] };
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

function night(hours, bedtime = 23, extra = {}) {
  return {
    type: 'sleep',
    id: `sleep-${hours}-${bedtime}`,
    hours,
    wakeTime: 7,
    bedtime,
    bedtimeProvenance: 'recorded',
    ...extra,
  };
}

function scoreAt(date, history, extra = {}) {
  return computeDayScore(date, {
    today: TODAY,
    fullHistory: history,
    targetKcal: TARGET,
    record: { confirmed: true, approximate: false, paused: false },
    scoreVersion: 'kds-2',
    ...extra,
  });
}

test('kds-2 dà un valore continuo e lascia gli stati sulle soglie', () => {
  const on = {};
  add(on, '2026-11-01', food('a', 2000));
  add(on, '2026-11-02', night(7.5));
  const onScore = scoreAt('2026-11-01', on);
  assert.equal(onScore.version, 'kds-2');
  assert.equal(onScore.cylinders.alimentazione.status, 'on_track');
  assert.equal(onScore.cylinders.alimentazione.value, 1);
  assert.equal(onScore.cylinders.sonno.keyFact, '7 h 30');
  assert.equal(onScore.cylinders.sonno.value, 1);

  const mid = {};
  add(mid, '2026-11-01', food('a', 2450));
  const midScore = scoreAt('2026-11-01', mid);
  assert.equal(midScore.cylinders.alimentazione.status, 'halfway');
  assert.ok(midScore.cylinders.alimentazione.value < 1);
  assert.ok(midScore.cylinders.alimentazione.value > 0.15);

  const floor = {};
  add(floor, '2026-11-01', food('a', 1200));
  assert.equal(scoreAt('2026-11-01', floor).cylinders.alimentazione.value, 0.15);

  const missing = {};
  add(missing, '2026-11-01', food('a', 2000));
  assert.equal(scoreAt('2026-11-01', missing).cylinders.sonno.keyFact, 'non registrato');
  assert.equal(scoreAt('2026-11-01', missing).cylinders.sonno.status, 'no_data');
});

test('kds-2 sposta il pasto vicino al sonno sull’alimentazione', () => {
  const history = {};
  add(history, '2026-11-01', food('cena', 2000, { mealType: 'cena', mealTime: 22 }));
  add(history, '2026-11-02', night(8, 23.5));
  const result = scoreAt('2026-11-01', history);
  assert.equal(result.cylinders.sonno.status, 'on_track');
  assert.equal(result.cylinders.sonno.keyFact, '8 h');
  assert.equal(result.cylinders.alimentazione.value, 0.85);
  assert.match(result.cylinders.alimentazione.keyFact, /ultimo pasto a 1 h 30/);
  assert.ok(result.cylinders.alimentazione.signals.includes('late_meal_before_sleep'));
  assert.equal(result.cylinders.sonno.signals.includes('late_meal_before_sleep'), false);
});

test('kds-2 moltiplica per 0,8 un ultra-processato sfavorevole', () => {
  const history = {};
  add(history, '2026-11-01', food('a', 2000, {
    name: 'Merendina',
    sugars: 20,
    semanticTags: { novaGroup: 4 },
  }));
  const result = scoreAt('2026-11-01', history);
  assert.equal(result.cylinders.alimentazione.status, 'on_track');
  assert.equal(result.cylinders.alimentazione.value, 0.8);
});

test('kds-2 cardio e forza scendono in linea fino al pavimento', () => {
  const cardio = {};
  for (let i = 0; i < 7; i += 1) {
    const date = addCalendarDays('2026-11-01', -i);
    add(cardio, date, { type: 'workout', id: `c-${date}`, name: 'camminata', duration: 15 });
  }
  add(cardio, '2026-11-01', food('a', 2000));
  const cardioScore = scoreAt('2026-11-01', cardio);
  assert.equal(cardioScore.cylinders.cardio.value, 0.7);
  assert.equal(cardioScore.cylinders.cardio.status, 'halfway');

  const strength = {};
  add(strength, '2026-10-20', {
    type: 'workout',
    id: 'gambe',
    name: 'pesi',
    duration: 40,
    muscles: ['Gambe'],
  });
  add(strength, '2026-11-01', food('a', 2000));
  add(strength, '2026-11-02', night(8));
  const strengthScore = scoreAt('2026-11-01', strength);
  assert.equal(strengthScore.cylinders.forza.status, 'off_track');
  assert.equal(strengthScore.cylinders.forza.value, 0.15);
});

test('il feedback non entra nel punteggio e raggruppa i disaccordi', () => {
  const history = {};
  add(history, '2026-11-01', food('a', 2000));
  add(history, '2026-11-02', night(8));
  const before = scoreAt('2026-11-01', history);
  const saved = encodeScoreFeedback({
    answer: 'worse',
    reason: 'x'.repeat(250),
    scoreVersion: before.version,
    score: before.score,
    cylinders: before.cylinders,
    answeredAt: 1,
  });
  assert.equal(saved.reason.length, 200);
  const after = scoreAt('2026-11-01', history);
  assert.equal(after.score, before.score);
  assert.equal(after.version, before.version);

  const groups = groupDisagreements([
    {
      date: '2026-11-01',
      answer: 'worse',
      cylinders: {
        alimentazione: { value: 0.2, signals: ['energy_low_day'] },
        sonno: { value: 1, signals: [] },
        forza: { value: null, signals: [] },
        cardio: { value: 0.4, signals: [] },
      },
    },
    {
      date: '2026-11-02',
      answer: 'yes',
      cylinders: before.cylinders,
    },
    {
      date: '2026-11-03',
      answer: 'better',
      cylinders: {
        alimentazione: { value: 0.2, signals: ['energy_low_day'] },
        sonno: { value: 0.9, signals: [] },
        forza: { value: null, signals: [] },
        cardio: { value: 0.5, signals: [] },
      },
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].lowest, 'alimentazione');
  assert.deepEqual(groups[0].signals, ['energy_low_day']);
  assert.equal(groups[0].count, 2);
});

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

test('kds-2 sul diario completo ha più punteggi distinti di kds-1', {
  skip: realFixtureSkipReason(RANGE_FILE),
}, () => {
  const RANGE = require(`../../__tests__/fixtures/${RANGE_FILE}`);
  const base = {
    today: TODAY,
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    records: calibrationRecords(RANGE.fullHistory, TODAY),
    scoreVersion: 'kds-2',
  };
  const k1 = [];
  const k2 = [];
  for (let date = '2026-10-15'; date <= '2026-11-09'; date = addCalendarDays(date, 1)) {
    k1.push(computeDayScore(date, { ...base, scoreVersion: 'kds-1' }).score);
    const day = computeDayScore(date, base);
    assert.equal(day.version, 'kds-2');
    assert.equal(day.dayStatus, 'closed', date);
    assert.notEqual(day.cylinders.sonno.keyFact, '0 h', date);
    k2.push(day.score);
  }
  const distinct = new Set(k2.filter((score) => score != null));
  assert.ok(distinct.size > new Set(k1).size);
  assert.equal(computeDayScore('2026-11-10', base).score, null);
});
