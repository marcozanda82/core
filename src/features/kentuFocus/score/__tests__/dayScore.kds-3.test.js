import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { realFixtureSkipReason } from '../../__tests__/fixtures/focusDiaryRealOct27.js';
import { addCalendarDays, formatFocusHoursIt } from '../../normalize/focusDateUtils.js';
import { buildFocusPeriodBrief } from '../../product/focusPeriodBrief.js';
import { focusPeriodWindow } from '../../product/ui/focusPeriodCursor.js';
import { computeDayScore } from '../computeDayScore.js';
import { computePeriodScore } from '../computePeriodScore.js';
import { dayScoreColor } from '../scoreColor.js';
import { SCORE_COLORS, unconfirmedPeriodNote } from '../scoreConfig.kds-3.js';

const require = createRequire(import.meta.url);
const RANGE_FILE = 'focusDiary.2026-11-09.real.json';

const TODAY = '2026-11-10';
const TARGET = 2000;

function slot(history, date) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, mealTimes: { pranzo: 13, cena: 21 }, log: [] };
  return history[key];
}

function add(history, date, entry) {
  slot(history, date).log.push(entry);
}

function food(kcal) {
  return { type: 'food', id: `f-${kcal}`, name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal, prot: 20, carb: 40, fat: 10 };
}

function night(hours) {
  return { type: 'sleep', id: `s-${hours}`, hours, wakeTime: 7, bedtime: 23, bedtimeProvenance: 'recorded' };
}

function walk(minutes, id) {
  return { type: 'workout', id, name: 'camminata', duration: minutes };
}

function baseContext(history, extra = {}) {
  return {
    today: TODAY,
    fullHistory: history,
    targetKcal: TARGET,
    record: { confirmed: true, approximate: false, paused: false },
    cylinders: { forza: { enabled: true } },
    ...extra,
  };
}

test('sotto un’ora la durata è in minuti', () => {
  assert.equal(formatFocusHoursIt(58 / 60), '58 min');
  assert.equal(formatFocusHoursIt(1.5), '1 h 30');
  assert.equal(formatFocusHoursIt(7), '7 h');
  assert.equal(formatFocusHoursIt(7 + 4 / 60), '7 h 04');
});

test('il movimento somma camminata di oggi e minuti equivalenti della settimana', () => {
  const history = {};
  for (let i = 0; i < 7; i += 1) add(history, addCalendarDays('2026-11-01', -i), walk(30, `w-${i}`));
  add(history, '2026-11-01', food(2000));
  add(history, '2026-11-02', night(8));
  const result = computeDayScore('2026-11-01', baseContext(history));
  assert.equal(result.version, 'kds-3');
  assert.equal(result.cylinders.movimento.value, 1);
  assert.equal(result.cylinders.movimento.status, 'on_track');
  assert.match(result.cylinders.movimento.keyFact, /oggi 30 min/);
  assert.equal(result.score, 1);
  assert.equal(result.forceIntensity, 0);

  const runDay = {};
  add(runDay, '2026-11-01', { type: 'workout', id: 'run', name: 'corsa', duration: 30 });
  add(runDay, '2026-11-01', food(2000));
  add(runDay, '2026-11-02', night(8));
  const run = computeDayScore('2026-11-01', baseContext(runDay));
  assert.match(run.cylinders.movimento.keyFact, /oggi 0 min/);
  assert.match(run.cylinders.movimento.keyFact, /1 h eq/);
});

test('il diario vince sulla stima, i passi vincono sulla camminata', () => {
  const history = {};
  add(history, '2026-11-01', walk(10, 'w'));
  add(history, '2026-11-01', food(2000));
  add(history, '2026-11-02', night(8));
  const withEstimate = computeDayScore('2026-11-01', baseContext(history, {
    movementCheckins: { '2026-11-01': { minutes: 60, estimated: true } },
  }));
  assert.match(withEstimate.cylinders.movimento.keyFact, /oggi 10 min/);
  assert.equal(withEstimate.cylinders.movimento.signals.includes('walk_estimated'), false);
  assert.ok(withEstimate.cylinders.movimento.signals.includes('diary_movement'));

  const empty = {};
  add(empty, '2026-11-01', food(2000));
  add(empty, '2026-11-02', night(8));
  const estimated = computeDayScore('2026-11-01', baseContext(empty, {
    movementCheckins: { '2026-11-01': { minutes: 30, estimated: true } },
  }));
  assert.match(estimated.cylinders.movimento.keyFact, /oggi 30 min stimati/);

  slot(history, '2026-11-01').steps = 6500;
  const steps = computeDayScore('2026-11-01', baseContext(history, { age: 40 }));
  assert.match(steps.cylinders.movimento.keyFact, /oggi 6500 passi/);
  const older = computeDayScore('2026-11-01', baseContext(history, { age: 60 }));
  assert.ok(older.cylinders.movimento.value > steps.cylinders.movimento.value);
});

test('la forza non entra nel punteggio e colora solo un giorno già blu', () => {
  const history = {};
  for (let i = 0; i < 7; i += 1) add(history, addCalendarDays('2026-11-01', -i), walk(30, `w-${i}`));
  add(history, '2026-11-01', food(2000));
  add(history, '2026-11-02', night(8));
  add(history, '2026-11-01', { type: 'workout', id: 'p', name: 'Scale', workoutType: 'scale', duration: 20 });
  add(history, '2026-10-31', { type: 'workout', id: 'q', name: 'Elastici', workoutType: 'elastici', duration: 15 });
  const on = computeDayScore('2026-11-01', baseContext(history));
  const offHistory = {};
  for (let i = 0; i < 7; i += 1) add(offHistory, addCalendarDays('2026-11-01', -i), walk(30, `w-${i}`));
  add(offHistory, '2026-11-01', food(2000));
  add(offHistory, '2026-11-02', night(8));
  const off = computeDayScore('2026-11-01', baseContext(offHistory));
  assert.equal(on.score, off.score);
  assert.equal(on.forceIntensity, 1);
  assert.equal(off.forceIntensity, 0);
  assert.match(on.cylinders.forza.keyFact, /parte|sessioni|non attiva|giorno/);

  const low = {};
  add(low, '2026-11-01', food(1200));
  add(low, '2026-11-02', night(8));
  add(low, '2026-11-01', { type: 'workout', id: 'p', name: 'pesi', muscles: ['Gambe'], duration: 40 });
  const lowScore = computeDayScore('2026-11-01', baseContext(low));
  assert.ok(lowScore.score < 0.75);
  assert.equal(lowScore.forceIntensity, 0);

  const faded = {};
  add(faded, '2026-10-29', { type: 'workout', id: 'old', name: 'Alzate dalla sedia', workoutType: 'alzate_sedia', duration: 10 });
  add(faded, '2026-11-01', food(2000));
  add(faded, '2026-11-02', night(8));
  for (let i = 0; i < 7; i += 1) add(faded, addCalendarDays('2026-11-01', -i), walk(30, `w-${i}`));
  assert.equal(computeDayScore('2026-11-01', baseContext(faded)).forceIntensity, 0.585);

  const disabled = computeDayScore('2026-11-01', baseContext(history, {
    cylinders: { forza: { enabled: false } },
  }));
  assert.equal(disabled.cylinders.forza.keyFact, 'Forza · non attiva');
  assert.equal(disabled.forceIntensity, 0);
  assert.equal(disabled.score, on.score);

  const quiet = dayScoreColor(0.4, 1);
  const light = dayScoreColor(1, 0);
  const electric = dayScoreColor(1, 1);
  assert.equal(quiet.forceApplied, false);
  assert.notEqual(quiet.hex, SCORE_COLORS.electricBlue);
  assert.equal(light.hex, SCORE_COLORS.lightBlue.toLowerCase());
  assert.equal(electric.hex, SCORE_COLORS.electricBlue.toLowerCase());
  assert.equal(dayScoreColor(null, 1).hex, SCORE_COLORS.missing);
});

test('il tipo classifica una sessione senza nome, e durationMinutes vince sulla durata grezza', () => {
  const bare = {};
  add(bare, '2026-11-01', { type: 'workout', id: 'bare', name: '', workoutType: 'camminata', duration: 0.5 });
  add(bare, '2026-11-01', food(2000));
  add(bare, '2026-11-02', night(8));
  assert.match(computeDayScore('2026-11-01', baseContext(bare)).cylinders.movimento.keyFact, /oggi 30 min/);

  const minutes = {};
  add(minutes, '2026-11-01', { type: 'workout', id: 'm', name: '', workoutType: 'camminata', duration: 20 });
  add(minutes, '2026-11-01', food(2000));
  add(minutes, '2026-11-02', night(8));
  assert.match(computeDayScore('2026-11-01', baseContext(minutes)).cylinders.movimento.keyFact, /oggi 20 min/);

  const explicit = {};
  add(explicit, '2026-11-01', {
    type: 'workout', id: 'e', name: '', workoutType: 'camminata', duration: 0.5, durationMinutes: 12,
  });
  add(explicit, '2026-11-01', food(2000));
  add(explicit, '2026-11-02', night(8));
  assert.match(computeDayScore('2026-11-01', baseContext(explicit)).cylinders.movimento.keyFact, /oggi 12 min/);

  const weights = {};
  add(weights, '2026-11-01', { type: 'workout', id: 'p', name: 'Pesi', workoutType: 'pesi', muscles: ['Gambe'], duration: 1 });
  add(weights, '2026-11-01', food(2000));
  add(weights, '2026-11-02', night(8));
  assert.match(computeDayScore('2026-11-01', baseContext(weights)).cylinders.movimento.keyFact, /oggi 0 min/);
});

test('kds-3 toglie 0,15 per la cena abbondante e non supera 0,20', () => {
  const heavy = {};
  add(heavy, '2026-11-01', food(800));
  add(heavy, '2026-11-01', { ...food(1200), id: 'cena', mealType: 'cena', mealTime: 21 });
  add(heavy, '2026-11-02', night(8));
  const heavyScore = computeDayScore('2026-11-01', baseContext(heavy)).cylinders.alimentazione;
  assert.ok(heavyScore.signals.includes('heavy_late_meal'));
  assert.equal(heavyScore.signals.includes('late_meal_before_sleep'), false);
  assert.equal(heavyScore.value, 0.85);

  const both = {};
  add(both, '2026-11-01', food(800));
  add(both, '2026-11-01', { ...food(1200), id: 'cena', mealType: 'cena', mealTime: 22 });
  add(both, '2026-11-02', {
    type: 'sleep', id: 's', hours: 8, wakeTime: 7, bedtime: 23.5, bedtimeProvenance: 'recorded',
  });
  const bothScore = computeDayScore('2026-11-01', baseContext(both)).cylinders.alimentazione;
  assert.ok(bothScore.signals.includes('heavy_late_meal'));
  assert.ok(bothScore.signals.includes('late_meal_before_sleep'));
  assert.equal(bothScore.value, 0.8);
});

test('il giorno non confermato pesa 0,8 e la copertura conta i giorni con dati', () => {
  const history = {};
  add(history, '2026-11-07', food(1200));
  add(history, '2026-11-08', night(8));
  add(history, '2026-11-08', food(2000));
  add(history, '2026-11-09', night(8));
  const context = {
    today: TODAY,
    fullHistory: history,
    targetKcal: TARGET,
    records: { '2026-11-08': { confirmed: true, approximate: false, paused: false } },
    cylinders: { forza: { enabled: false } },
  };
  const open = computeDayScore('2026-11-07', context);
  const closed = computeDayScore('2026-11-08', context);
  assert.equal(open.dayStatus, 'unconfirmed');
  assert.equal(closed.dayStatus, 'closed');
  const period = computePeriodScore('2026-11-07', '2026-11-08', context);
  const expected = Math.round(((closed.score + open.score * 0.8) / 1.8) * 1000) / 1000;
  assert.equal(period.coverage, 1);
  assert.equal(period.eligibleDays, 2);
  assert.equal(period.score, expected);
  assert.notEqual(open.score, closed.score);

  const hole = computePeriodScore('2026-11-06', '2026-11-07', context);
  assert.equal(hole.coverage, 0.5);
  assert.equal(hole.score, null);
  assert.equal(unconfirmedPeriodNote(4, 7), '4 giorni su 7 non confermati');
  assert.equal(unconfirmedPeriodNote(3, 7), null);
  assert.equal(unconfirmedPeriodNote(1, 1), '1 giorno su 1 non confermato');
});

function calibrationRecords(fullHistory, today) {
  const records = {};
  for (const key of Object.keys(fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= today) continue;
    if (getDayStatus(date, { today, fullHistory }) !== 'unconfirmed') continue;
    records[date] = { confirmed: true, approximate: false, paused: false };
  }
  return records;
}

test('kds-3 sul diario reale: punteggi, stati, colori, scie e azione (fixture 2026-11-09)', {
  skip: realFixtureSkipReason(RANGE_FILE),
}, () => {
  const RANGE = require(`../../__tests__/fixtures/${RANGE_FILE}`);
  const base = {
    today: TODAY,
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    records: calibrationRecords(RANGE.fullHistory, TODAY),
    scoreVersion: 'kds-3',
    cylinders: { forza: { enabled: true } },
  };

  const oct28 = computeDayScore('2026-10-28', base);
  assert.equal(oct28.version, 'kds-3');
  assert.equal(oct28.score, 0.639);
  assert.equal(oct28.dayStatus, 'closed');
  assert.equal(oct28.cylinders.alimentazione.status, 'halfway');
  assert.equal(oct28.cylinders.alimentazione.keyFact, '2913 kcal · 457 sopra');
  assert.equal(oct28.cylinders.sonno.keyFact, '7 h');
  assert.equal(dayScoreColor(oct28.score, oct28.forceIntensity ?? 0).tone, 'off_blue');

  const oct29 = computeDayScore('2026-10-29', base);
  assert.equal(oct29.score, 0.703);
  assert.equal(oct29.cylinders.alimentazione.status, 'on_track');
  assert.equal(oct29.cylinders.forza.status, 'on_track');
  assert.equal(oct29.cylinders.forza.keyFact, 'parte bassa oggi · parte alta 5 giorni fa');

  const oct30 = computeDayScore('2026-10-30', base);
  assert.equal(oct30.score, 0.388);
  assert.equal(oct30.cylinders.alimentazione.status, 'off_track');
  assert.equal(oct30.cylinders.alimentazione.keyFact, '1509 kcal · 947 sotto');
  assert.equal(oct30.cylinders.sonno.keyFact, '7 h 30');

  const nov09 = computeDayScore('2026-11-09', base);
  assert.equal(nov09.score, 0.846);
  assert.equal(dayScoreColor(nov09.score, nov09.forceIntensity ?? 0).tone, 'on_track');
  assert.equal(nov09.forceIntensity, 0.923);

  const ieriWin = focusPeriodWindow('ieri', TODAY, 0);
  const ieriPeriod = computePeriodScore(ieriWin.from, ieriWin.to, base);
  const ieriBrief = buildFocusPeriodBrief('ieri', ieriWin.analysisDate, {
    ...base,
    periodFrom: ieriWin.from,
    periodTo: ieriWin.to,
  });
  assert.equal(ieriPeriod.score, 0.846);
  assert.equal(ieriPeriod.longestStreak, 0);
  assert.equal(ieriBrief.actionPillar, 'forza');
  assert.match(String(ieriBrief.actionClose?.phrase || ''), /parte bassa/);

  const weekWin = focusPeriodWindow('settimana', TODAY, 0);
  const weekPeriod = computePeriodScore(weekWin.from, weekWin.to, base);
  const weekBrief = buildFocusPeriodBrief('settimana', weekWin.analysisDate, {
    ...base,
    periodFrom: weekWin.from,
    periodTo: weekWin.to,
  });
  assert.equal(weekPeriod.score, 0.584);
  assert.equal(weekPeriod.onTrackDays, 0);
  assert.equal(weekBrief.actionPillar, 'movimento');
  assert.match(String(weekBrief.actionClose?.phrase || ''), /camminata/);

  const monthWin = focusPeriodWindow('mese', TODAY, 0);
  const monthPeriod = computePeriodScore(monthWin.from, monthWin.to, base);
  const monthBrief = buildFocusPeriodBrief('mese', monthWin.analysisDate, {
    ...base,
    periodFrom: monthWin.from,
    periodTo: monthWin.to,
  });
  assert.equal(monthWin.from, '2026-10-01');
  assert.equal(monthWin.to, '2026-10-31');
  assert.equal(monthPeriod.score, 0.639);
  assert.equal(monthPeriod.longestStreak, 3);
  assert.deepEqual(monthPeriod.streaks, [{ from: '2026-10-15', to: '2026-10-17', length: 3 }]);
  assert.equal(monthBrief.actionPillar, 'movimento');
  assert.equal(monthBrief.pillars.find((p) => p.id === 'forza')?.status, 'on_track');
});
