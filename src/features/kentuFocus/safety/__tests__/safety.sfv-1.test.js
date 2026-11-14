import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { computeDayScore } from '../../score/computeDayScore.js';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { realFixtureSkipReason } from '../../__tests__/fixtures/focusDiaryRealOct27.js';
import { computeSafety, estimateBasalKcal } from '../computeSafety.js';
import {
  decodeSafetyFromRtdb,
  encodeSafetyForRtdb,
  safetyStatusPath,
} from '../safetyRecord.js';
import { persistSafetyStatus } from '../safetyStore.js';

const require = createRequire(import.meta.url);
const TODAY = '2026-11-10';
const DAY = '2026-11-09';
const CLOSED = { confirmed: true, approximate: false, paused: false };
const PROFILE = { weight: 70, height: 174, age: 44, gender: 'M' };

function datesBack(from, count) {
  return Array.from({ length: count }, (_, index) => addCalendarDays(from, -index));
}

function close(dates) {
  return Object.fromEntries(dates.map((date) => [date, CLOSED]));
}

function slot(history, date) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, log: [] };
  return history[key];
}

function add(history, date, entry) {
  slot(history, date).log.push(entry);
}

function food(kcal, prot = 140) {
  return {
    type: 'food', id: `f-${kcal}-${prot}-${Math.random()}`, name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal, prot, carb: 40, fat: 10,
  };
}

function context(history, extra = {}) {
  return {
    today: TODAY,
    fullHistory: history,
    targetKcal: extra.targetKcal ?? 3000,
    profile: PROFILE,
    records: extra.records || {},
    ...extra,
  };
}

function ids(result) {
  return result.signals.map((item) => `${item.id}:${item.level}`);
}

test('il metabolismo basale si stima dal profilo', () => {
  assert.equal(estimateBasalKcal(PROFILE), 1573);
  assert.equal(estimateBasalKcal({ ...PROFILE, bmr: 1600 }), 1600);
  assert.equal(estimateBasalKcal({ weight: 70 }), null);
});

test('un giorno non chiuso e un giorno in pausa non hanno segnali', () => {
  const history = {};
  for (const date of datesBack(DAY, 8)) {
    add(history, date, food(1000, 40));
    add(history, date, { type: 'workout', id: `p-${date}`, workoutType: 'corsa', duration: 40, mealTime: 10 });
  }
  const open = computeSafety(DAY, context(history));
  assert.equal(open.level, 'none');
  assert.deepEqual(open.signals, []);

  const paused = computeSafety(DAY, context(history, {
    records: close(datesBack(DAY, 8)),
    record: { confirmed: false, approximate: false, paused: true },
  }));
  assert.equal(paused.level, 'none');
  assert.equal(computeSafety(TODAY, context(history, {
    records: { ...close(datesBack(DAY, 8)), [TODAY]: CLOSED },
  })).level, 'none');
});

test('energy_deficit_sustained è sotto osservazione solo sotto il 75%', () => {
  const low = {};
  const days = datesBack(DAY, 7);
  for (const date of days) add(low, date, food(2100, 140));
  const on = computeSafety(DAY, context(low, { records: close(days) }));
  assert.deepEqual(ids(on), ['energy_deficit_sustained:watch']);
  assert.equal(on.level, 'watch');

  const steady = {};
  for (const date of days) add(steady, date, food(2400, 140));
  assert.deepEqual(ids(computeSafety(DAY, context(steady, { records: close(days) }))), []);
});

test('energy_very_low_repeated scatta con 3 giorni sotto il 60% o 2 sotto il basale', () => {
  const repeated = {};
  const days = datesBack(DAY, 7);
  days.forEach((date, index) => add(repeated, date, food(index < 3 ? 1500 : 3000, 140)));
  const on = computeSafety(DAY, context(repeated, { records: close(days) }));
  assert.ok(ids(on).includes('energy_very_low_repeated:act'));
  assert.equal(on.signals.find((item) => item.id === 'energy_very_low_repeated').evidence.underTargetDays, 3);

  const basal = {};
  days.forEach((date, index) => add(basal, date, food(index < 2 ? 1500 : 2400, 140)));
  const byBasal = computeSafety(DAY, context(basal, { targetKcal: 2400, records: close(days) }));
  const basalSignal = byBasal.signals.find((item) => item.id === 'energy_very_low_repeated');
  assert.equal(basalSignal.level, 'act');
  assert.equal(basalSignal.evidence.underTargetDays, 0);
  assert.equal(basalSignal.evidence.underBasalDays, 2);

  const quiet = {};
  days.forEach((date, index) => add(quiet, date, food(index < 2 ? 2000 : 3000, 140)));
  assert.equal(computeSafety(DAY, context(quiet, { records: close(days) })).signals
    .some((item) => item.id === 'energy_very_low_repeated'), false);
});

test('weight_loss_fast scatta solo oltre l’1% per due settimane, con 4 pesate', () => {
  const history = {};
  add(history, DAY, food(3000));
  const fast = [
    { date: addCalendarDays(DAY, -18), weight: 80 },
    { date: addCalendarDays(DAY, -12), weight: 79.1 },
    { date: addCalendarDays(DAY, -8), weight: 79.1 },
    { date: addCalendarDays(DAY, -4), weight: 78.2 },
    { date: addCalendarDays(DAY, -1), weight: 78.2 },
  ];
  const on = computeSafety(DAY, context(history, { records: close([DAY]), bodyMetrics: fast }));
  assert.equal(on.signals.find((item) => item.id === 'weight_loss_fast')?.level, 'act');

  const slow = fast.map((row, index) => ({ ...row, weight: index === 0 ? 80 : 79.6 }));
  assert.equal(computeSafety(DAY, context(history, { records: close([DAY]), bodyMetrics: slow }))
    .signals.some((item) => item.id === 'weight_loss_fast'), false);
  assert.equal(computeSafety(DAY, context(history, {
    records: close([DAY]),
    bodyMetrics: fast.slice(0, 3),
  })).signals.some((item) => item.id === 'weight_loss_fast'), false);
});

test('protein_low_in_deficit osserva solo deficit e proteine basse insieme', () => {
  const days = datesBack(DAY, 7);
  const low = {};
  for (const date of days) add(low, date, food(2400, 70));
  const on = computeSafety(DAY, context(low, { records: close(days) }));
  assert.deepEqual(ids(on), ['protein_low_in_deficit:watch']);
  assert.ok(on.signals[0].evidence.gramsPerKg < 1.2);

  const enoughEnergy = {};
  for (const date of days) add(enoughEnergy, date, food(2850, 70));
  assert.deepEqual(ids(computeSafety(DAY, context(enoughEnergy, { records: close(days) }))), []);

  const enoughProtein = {};
  for (const date of days) add(enoughProtein, date, food(2400, 100));
  assert.deepEqual(ids(computeSafety(DAY, context(enoughProtein, { records: close(days) }))), []);
});

test('no_rest_streak è watch a 6 giorni e act a 8', () => {
  function run(count) {
    const history = {};
    const days = datesBack(DAY, count);
    for (const date of days) {
      add(history, date, food(3000));
      add(history, date, { type: 'workout', id: `run-${date}`, workoutType: 'corsa', duration: 30, mealTime: 18 });
    }
    return computeSafety(DAY, context(history, { records: close(days) }));
  }
  assert.equal(run(5).signals.some((item) => item.id === 'no_rest_streak'), false);
  assert.equal(run(6).signals.find((item) => item.id === 'no_rest_streak')?.level, 'watch');
  assert.equal(run(8).signals.find((item) => item.id === 'no_rest_streak')?.level, 'act');
});

test('same_district_no_recovery conta due recuperi sotto le 48 ore', () => {
  const days = datesBack(DAY, 3);
  const tight = {};
  for (const date of days) {
    add(tight, date, food(3000));
    add(tight, date, {
      type: 'workout', id: `chest-${date}`, workoutType: 'pesi', muscles: ['Petto'], duration: 40, mealTime: 10,
    });
  }
  const on = computeSafety(DAY, context(tight, { records: close(days) }));
  assert.equal(on.signals.find((item) => item.id === 'same_district_no_recovery')?.evidence.shortGaps, 2);

  const once = {};
  for (const date of [DAY, addCalendarDays(DAY, -2)]) {
    add(once, date, food(3000));
    add(once, date, {
      type: 'workout', id: `chest-${date}`, workoutType: 'pesi', muscles: ['Petto'], duration: 40, mealTime: 10,
    });
  }
  assert.equal(computeSafety(DAY, context(once, { records: close([DAY, addCalendarDays(DAY, -2)]) }))
    .signals.some((item) => item.id === 'same_district_no_recovery'), false);
});

test('load_spike confronta la settimana con le quattro precedenti', () => {
  function build(currentMinutes) {
    const history = {};
    const closed = [];
    for (let week = 1; week <= 4; week += 1) {
      const date = addCalendarDays(DAY, -week * 7);
      closed.push(date);
      add(history, date, food(3000));
      add(history, date, { type: 'workout', id: `base-${week}`, workoutType: 'pesi', muscles: ['Gambe'], duration: 100, mealTime: 18 });
    }
    closed.push(DAY);
    add(history, DAY, food(3000));
    add(history, DAY, { type: 'workout', id: 'now', workoutType: 'pesi', muscles: ['Gambe'], duration: currentMinutes, mealTime: 18 });
    return computeSafety(DAY, context(history, { records: close(closed) }));
  }
  assert.equal(build(160).signals.find((item) => item.id === 'load_spike')?.level, 'watch');
  assert.equal(build(140).signals.some((item) => item.id === 'load_spike'), false);

  const noBaseline = {};
  add(noBaseline, DAY, food(3000));
  add(noBaseline, DAY, { type: 'workout', id: 'now', workoutType: 'corsa', duration: 200, mealTime: 18 });
  assert.equal(computeSafety(DAY, context(noBaseline, { records: close([DAY]) }))
    .signals.some((item) => item.id === 'load_spike'), false);
});

test('overreaching sfv-2: serie senza riposo o picco di carico, più due indizi su tre', () => {
  function loaded(hours, quality, wakeEnergy, sessions) {
    const history = {};
    const days = datesBack(DAY, sessions);
    for (const date of days) {
      add(history, date, food(3000));
      add(history, date, {
        type: 'workout', id: `run-${date}`, workoutType: 'corsa', duration: 30, mealTime: 18,
      });
      add(history, date, {
        type: 'sleep', id: `s-${date}`, hours, wakeTime: 7, bedtime: 23, quality, wakeEnergy,
      });
    }
    return computeSafety(DAY, context(history, { records: close(days), systemicFatigue: 0.9 }));
  }
  const on = loaded(5, 2, 4, 6);
  assert.equal(on.version, 'sfv-2');
  assert.equal(on.signals.find((item) => item.id === 'overreaching')?.level, 'act');
  assert.deepEqual(on.signals.find((item) => item.id === 'overreaching')?.evidence.training, ['no_rest_streak']);

  const byWake = loaded(8, 1, 2, 6);
  assert.equal(byWake.signals.find((item) => item.id === 'overreaching')?.evidence.lowWakeEnergy, 3);

  assert.equal(loaded(5, 2, 4, 5).signals.some((item) => item.id === 'overreaching'), false);
  assert.equal(loaded(5, 4, 4, 6).signals.some((item) => item.id === 'overreaching'), false);
  assert.equal(loaded(8, 4, 4, 8).signals.some((item) => item.id === 'overreaching'), false);

  const spikeDays = datesBack(DAY, 3);
  const spike = {};
  const closed = [];
  for (let week = 1; week <= 4; week += 1) {
    const date = addCalendarDays(DAY, -week * 7);
    closed.push(date);
    add(spike, date, food(3000));
    add(spike, date, { type: 'workout', id: `base-${week}`, workoutType: 'pesi', muscles: ['Gambe'], duration: 100, mealTime: 18 });
  }
  for (const date of spikeDays) {
    closed.push(date);
    add(spike, date, food(3000));
    add(spike, date, { type: 'sleep', id: `s-${date}`, hours: 5, wakeTime: 7, bedtime: 23, quality: 2, wakeEnergy: 4 });
  }
  add(spike, DAY, { type: 'workout', id: 'now', workoutType: 'pesi', muscles: ['Gambe'], duration: 160, mealTime: 18 });
  const bySpike = computeSafety(DAY, context(spike, { records: close(closed) }));
  assert.equal(bySpike.signals.find((item) => item.id === 'overreaching')?.evidence.training.includes('load_spike'), true);
});

test('restrictive_pattern spegne i numeri e non è un elogio del deficit', () => {
  const history = {};
  const days = datesBack(DAY, 12);
  days.forEach((date, index) => add(history, date, food(index >= 7 ? 1500 : 3000, 140)));
  const on = computeSafety(DAY, context(history, { records: close(days) }));
  assert.equal(on.signals.find((item) => item.id === 'restrictive_pattern')?.level, 'act');
  assert.equal(on.suppressNumbers, true);
  assert.equal(on.signals.some((item) => item.area === 'Energia' && item.level === 'act'), false);

  const few = {};
  datesBack(DAY, 7).forEach((date, index) => add(few, date, food(index < 4 ? 1500 : 3000, 140)));
  assert.equal(computeSafety(DAY, context(few, { records: close(datesBack(DAY, 7)) })).suppressNumbers, false);
});

test('un act sull’energia ferma il punteggio a 0,74', () => {
  const history = {};
  const days = datesBack('2026-11-01', 7);
  days.forEach((date, index) => {
    add(history, date, food(index > 0 && index <= 3 ? 1500 : 3000, 140));
    add(history, date, { type: 'workout', id: `w-${date}`, workoutType: 'camminata', duration: 30 });
  });
  add(history, '2026-11-02', { type: 'sleep', id: 'night', hours: 8, wakeTime: 7, bedtime: 23, bedtimeProvenance: 'recorded' });
  const scored = computeDayScore('2026-11-01', context(history, {
    records: close(days),
    cylinders: { forza: { enabled: true } },
  }));
  assert.equal(scored.score, 0.74);
  assert.equal(scored.forceIntensity, 0);
  assert.equal(scored.suppressNumbers, undefined);

  const clear = {};
  for (const date of days) {
    add(clear, date, food(3000, 140));
    add(clear, date, { type: 'workout', id: `w-${date}`, workoutType: 'camminata', duration: 30 });
  }
  add(clear, '2026-11-02', { type: 'sleep', id: 'night', hours: 8, wakeTime: 7, bedtime: 23, bedtimeProvenance: 'recorded' });
  const open = computeDayScore('2026-11-01', context(clear, { records: close(days) }));
  assert.equal(open.score, 1);
  assert.equal(open.suppressNumbers, undefined);
});

test('la persistenza conserva versione, livello e segnali', async () => {
  assert.equal(safetyStatusPath('abc', DAY), `users/abc/safety_status/${DAY}`);
  const history = {};
  const days = datesBack(DAY, 7);
  for (const date of days) add(history, date, food(2100, 140));
  const fresh = computeSafety(DAY, context(history, { records: close(days) }));
  const encoded = encodeSafetyForRtdb(fresh);
  assert.equal(encoded.version, 'sfv-2');
  assert.equal(encoded.level, 'watch');
  assert.equal(encoded.signals.energy_deficit_sustained.level, 'watch');
  assert.deepEqual(decodeSafetyFromRtdb(encoded).signals.map((item) => item.id), ['energy_deficit_sustained']);

  const rows = new Map();
  const store = {
    async read(date) { return rows.get(date) || null; },
    async write(date, record) {
      const stored = decodeSafetyFromRtdb(encodeSafetyForRtdb(record));
      rows.set(date, stored);
      return stored;
    },
  };
  const first = await persistSafetyStatus(store, DAY, context(history, { records: close(days) }));
  const second = await persistSafetyStatus(store, DAY, context(history, { records: close(days) }));
  assert.equal(first.wrote, true);
  assert.equal(second.wrote, false);
  assert.equal(second.record.level, 'watch');
});

test('sul diario dal 15 ottobre al 9 novembre i segnali act non scattano', {
  skip: realFixtureSkipReason('focusDiary.2026-11-09.real.json'),
}, () => {
  const fixture = require('../../__tests__/fixtures/focusDiary.2026-11-09.real.json');
  const records = {};
  for (const key of Object.keys(fixture.fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= TODAY) continue;
    const status = getDayStatus(date, { today: TODAY, fullHistory: fixture.fullHistory });
    if (status === 'unconfirmed') records[date] = CLOSED;
  }
  const base = {
    today: TODAY,
    fullHistory: fixture.fullHistory,
    profile_targets: fixture.profile_targets,
    targetKcal: 2456,
    records,
  };
  const active = [];
  for (let date = '2026-10-15'; date <= '2026-11-09'; date = addCalendarDays(date, 1)) {
    const safety = computeSafety(date, base);
    assert.equal(safety.signals.some((item) => item.level === 'act'), false, date);
    if (safety.signals.length > 0) {
      active.push(`${date} ${safety.signals.map((item) => item.id).join(', ')}`);
    }
  }
  assert.deepEqual(active, []);
});
