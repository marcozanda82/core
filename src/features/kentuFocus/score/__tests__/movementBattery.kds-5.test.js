/**
 * kds-5: batteria movimento — schemi a–e, calibrazione, azione, fixture 14g.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { computeDayScore } from '../computeDayScore.js';
import { pillarStatusFromValue } from '../scoreConfig.kds-3.js';
import {
  BATTERY_CAPACITY,
  BATTERY_CHECKIN_CAP_MIN,
  BATTERY_DECAY,
  BATTERY_FULL_LEVEL,
  BATTERY_ON_TRACK_MIN,
  BATTERY_READY_MIN_SPAN_DAYS,
  batteryLevel,
  chargeMinutesToReach,
  computeMovementBattery,
  dayMovementCharge,
  isMovementBatteryReady,
  levelTomorrowIfIdle,
  movementBatteryAction,
  scoreMovimentoBattery,
  simulateBattery,
  stepBattery,
} from '../movementBattery.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const FIXTURE = path.join(
  ROOT,
  'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json',
);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function schemeLevels(charges) {
  return simulateBattery(charges).levels.map(round2);
}

test('kds-5 constants: d, C, piena all\'80%', () => {
  assert.ok(Math.abs(BATTERY_DECAY - 2 ** (-1 / 3)) < 1e-12);
  const cStar = 150 / 7;
  assert.ok(Math.abs(BATTERY_CAPACITY - cStar / (1 - BATTERY_DECAY)) < 1e-9);
  assert.ok(Math.abs(BATTERY_FULL_LEVEL - BATTERY_CAPACITY * 0.8) < 1e-9);
  assert.equal(round2(batteryLevel(BATTERY_FULL_LEVEL)), 1);
});

test('schemi a–e con taratura L = B / (0,8·C)', () => {
  const a = schemeLevels([30, 30, 30, 30, 30, 0, 0]);
  const b = schemeLevels([50, 0, 50, 0, 50, 0, 0]);
  const c = schemeLevels([0, 0, 0, 0, 0, 0, 150]);
  const d = schemeLevels([60, 60, 60]);
  const eLoad = schemeLevels(Array(7).fill(150 / 7));
  const eFull = schemeLevels([...Array(7).fill(150 / 7), ...Array(7).fill(0)]);

  assert.deepEqual(a, [0.36, 0.65, 0.87, 1, 1, 0.95, 0.76]);
  assert.deepEqual(b, [0.6, 0.48, 0.98, 0.78, 1, 0.97, 0.77]);
  assert.deepEqual(c, [0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(d, [0.72, 1, 1]);
  assert.equal(eLoad.at(-1), 1);
  assert.equal(eFull[6], 1);
  assert.equal(eFull[13], 0.2);
});

test('azione: ricarica solo sotto 0,75 o se scende sotto domani; no camminata su forza se L≥0,75', () => {
  const low = movementBatteryAction(0.6);
  assert.ok(low);
  assert.equal(low.minutes, chargeMinutesToReach(0.6, 0.85));
  assert.match(low.phrase, /minuti di camminata domani riportano la batteria al 85%/);

  assert.ok(levelTomorrowIfIdle(0.75) < BATTERY_ON_TRACK_MIN);
  const edge = movementBatteryAction(0.75);
  assert.ok(edge);

  const ok = movementBatteryAction(0.95);
  assert.equal(ok, null);

  assert.equal(movementBatteryAction(0.8, { strengthDay: true }), null);
  assert.ok(movementBatteryAction(0.6, { strengthDay: true }));
});

test('check-in: solo senza cardio diary, tetto 30', () => {
  const history = {
    'trackerStorico_2026-11-01': {
      data: '2026-11-01',
      log: [],
    },
  };
  const raw = dayMovementCharge('2026-11-01', history, {
    '2026-11-01': { minutes: 60, estimated: true },
  });
  assert.equal(raw.usedCheckIn, true);
  assert.equal(raw.checkInMin, BATTERY_CHECKIN_CAP_MIN);
  assert.equal(raw.charge, 30);

  const withWalk = {
    'trackerStorico_2026-11-01': {
      data: '2026-11-01',
      log: [{ type: 'workout', id: 'w1', workoutType: 'camminata', durationMinutes: 40 }],
    },
  };
  const ignored = dayMovementCharge('2026-11-01', withWalk, {
    '2026-11-01': { minutes: 30, estimated: true },
  });
  assert.equal(ignored.usedCheckIn, false);
  assert.equal(ignored.charge, 40);
});

test('calibrazione: movimento no_data finché span < 7 giorni', () => {
  const history = {};
  for (let i = 0; i < 6; i += 1) {
    const d = addCalendarDays('2026-11-01', i);
    history[`trackerStorico_${d}`] = { data: d, log: [] };
  }
  assert.equal(isMovementBatteryReady(history, '2026-11-06'), false);
  assert.equal(BATTERY_READY_MIN_SPAN_DAYS, 7);
  const mid = scoreMovimentoBattery('2026-11-06', history, {});
  assert.equal(mid.status, 'no_data');
  assert.equal(mid.value, null);

  history['trackerStorico_2026-11-07'] = { data: '2026-11-07', log: [] };
  assert.equal(isMovementBatteryReady(history, '2026-11-07'), true);
});

test('stepBattery e decadimento ≈20%/giorno', () => {
  const next = stepBattery(100, 0);
  assert.ok(Math.abs(next / 100 - BATTERY_DECAY) < 1e-12);
  assert.ok(Math.abs(1 - BATTERY_DECAY - 0.206) < 0.01);
});

test('fixture 14g: kds-4 vs kds-5 movimento, pilastro, giornata', () => {
  const RANGE = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const TODAY = '2026-11-10';
  const baseKcal = 2456;
  const records = {};
  for (const key of Object.keys(RANGE.fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= TODAY) continue;
    if (getDayStatus(date, { today: TODAY, fullHistory: RANGE.fullHistory }) !== 'unconfirmed') continue;
    records[date] = { confirmed: true, approximate: false, paused: false };
  }
  const base = {
    today: TODAY,
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    targetKcal: baseKcal,
    settingsBaseKcal: baseKcal,
    userTargets: { kcal: baseKcal },
    records,
    cylinders: { forza: { enabled: true } },
  };

  const rows = [];
  for (let d = '2026-10-27'; d <= '2026-11-09'; d = addCalendarDays(d, 1)) {
    const k4 = computeDayScore(d, { ...base, scoreVersion: 'kds-4' });
    const k5 = computeDayScore(d, { ...base, scoreVersion: 'kds-5' });
    const bat = computeMovementBattery(d, RANGE.fullHistory, { movementBatteryReady: true });
    assert.equal(k5.version, 'kds-5');
    assert.ok(k5.cylinders.movimento.signals?.includes('movement_battery')
      || k5.cylinders.movimento.status === 'no_data');
    if (k5.cylinders.movimento.value != null) {
      assert.equal(k5.cylinders.movimento.status, pillarStatusFromValue(k5.cylinders.movimento.value));
      assert.equal(round2(k5.cylinders.movimento.value), round2(bat.level));
    }
    // alimentazione/sonno invariati rispetto a kds-4
    assert.equal(
      round2(k4.cylinders.alimentazione.value),
      round2(k5.cylinders.alimentazione.value),
    );
    assert.equal(
      round2(k4.cylinders.sonno.value),
      round2(k5.cylinders.sonno.value),
    );
    rows.push({
      date: d,
      moveK4: k4.cylinders.movimento.value,
      statusK4: k4.cylinders.movimento.status,
      moveK5: k5.cylinders.movimento.value,
      statusK5: k5.cylinders.movimento.status,
      scoreK4: k4.score,
      scoreStatusK4: k4.scoreStatus,
      scoreK5: k5.score,
      scoreStatusK5: k5.scoreStatus,
    });
  }
  assert.equal(rows.length, 14);
  // almeno un giorno con batteria diversa dal 50/50
  assert.ok(rows.some((row) => round2(row.moveK4) !== round2(row.moveK5)));
});

test('regressione: kds-3 e kds-4 restano selezionabili', () => {
  const RANGE = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const ctx = {
    today: '2026-11-10',
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    targetKcal: 2456,
    settingsBaseKcal: 2456,
    userTargets: { kcal: 2456 },
    records: { '2026-11-01': { confirmed: true, approximate: false, paused: false } },
    cylinders: { forza: { enabled: true } },
  };
  assert.equal(computeDayScore('2026-11-01', { ...ctx, scoreVersion: 'kds-3' }).version, 'kds-3');
  assert.equal(computeDayScore('2026-11-01', { ...ctx, scoreVersion: 'kds-4' }).version, 'kds-4');
  assert.equal(computeDayScore('2026-11-01', { ...ctx, scoreVersion: 'kds-5' }).version, 'kds-5');
  assert.equal(computeDayScore('2026-11-01', ctx).version, 'kds-5');
});
