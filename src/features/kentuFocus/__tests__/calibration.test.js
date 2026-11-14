import assert from 'node:assert/strict';
import test from 'node:test';
import { composeFocusV5Report } from '../product/composeFocusV5Report.js';
import {
  BASELINE_SPARSE_THRESHOLD,
  baselineWords,
  buildBaseline,
  resolveCalibration,
} from '../product/calibration.js';

function foodDay(date, kcal = 2100) {
  return {
    [`trackerStorico_${date}`]: {
      log: [{ type: 'food', name: 'Pasta', kcal, mealTime: 20 }],
    },
  };
}

test('la taratura conta i giorni con dati, non il calendario grezzo', () => {
  const history = {
    ...foodDay('2026-11-08'),
    ...foodDay('2026-11-09'),
    ...foodDay('2026-11-11'),
  };
  const dayStatus = {
    '2026-11-10': { paused: true },
  };
  const state = resolveCalibration({
    today: '2026-11-12',
    registeredAt: '2026-11-08T09:00:00.000Z',
    fullHistory: history,
    dayStatus,
  });
  assert.equal(state.active, true);
  assert.equal(state.day, 3);
  assert.equal(state.total, 14);
  assert.equal(state.baselineDue, false);
});

test('dopo 14 giorni con dati la baseline è pronta', () => {
  const history = {};
  for (let i = 0; i < 14; i += 1) {
    const d = `2026-10-${String(i + 1).padStart(2, '0')}`;
    Object.assign(history, foodDay(d, 2000 + i * 10));
  }
  const state = resolveCalibration({
    today: '2026-10-20',
    registeredAt: '2026-10-01T09:00:00.000Z',
    fullHistory: history,
  });
  assert.equal(state.active, false);
  assert.equal(state.baselineDue, true);
  assert.equal(state.dataDays, 14);
  const row = buildBaseline({
    fullHistory: history,
    registeredAt: '2026-10-01T09:00:00.000Z',
    today: '2026-10-20',
    targetKcal: 2300,
  });
  assert.ok(row.meanKcal > 0);
  assert.match(baselineWords(row).join(' '), /Pasti registrati in \d+ giorni su \d+/);
});

test('a 28 giorni di calendario con pochi dati la baseline è sparse', () => {
  const history = {
    ...foodDay('2026-10-01', 1800),
    ...foodDay('2026-10-10', 1900),
    ...foodDay('2026-10-20', 2000),
  };
  const state = resolveCalibration({
    today: '2026-10-28',
    registeredAt: '2026-10-01T09:00:00.000Z',
    fullHistory: history,
  });
  assert.equal(state.active, false);
  assert.equal(state.baselineDue, true);
  assert.ok(state.dataDays < BASELINE_SPARSE_THRESHOLD);
  assert.equal(state.sparse, true);
  const row = buildBaseline({
    fullHistory: history,
    registeredAt: '2026-10-01T09:00:00.000Z',
    today: '2026-10-28',
    targetKcal: 2300,
  });
  assert.equal(row.sparse, true);
  assert.match(baselineWords(row).join(' '), /Basata su pochi giorni/);
});

test('senza registrazione la linea usa i primi giorni con dati', () => {
  const history = {
    'trackerStorico_2026-10-01': {
      log: [
        { type: 'food', name: 'Pasta', kcal: 2100, mealTime: 20.5 },
        { type: 'workout', workoutType: 'pesi', duration: 45, durationMinutes: 45, muscleGroups: ['Petto', 'Spalle'] },
      ],
    },
    'trackerStorico_2026-10-02': {
      log: [
        { type: 'food', name: 'Riso', kcal: 1800, mealTime: 19 },
        { type: 'sleep', hours: 7.4, wakeTime: 6.5, bedtime: 23.1, bedtimeProvenance: 'recorded' },
      ],
    },
  };
  const state = resolveCalibration({ today: '2026-11-12', registeredAt: null, fullHistory: history });
  assert.equal(state.active, false);
  assert.equal(state.source, 'first-data');
  const row = buildBaseline({ fullHistory: history, today: '2026-11-12', targetKcal: 2300 });
  assert.equal(row.source, 'first-data');
  assert.equal(row.meanKcal, 1950);
  assert.ok(row.outsideDays >= 1);
  assert.equal(row.strength.parte_alta, 1);
  const text = baselineWords(row).join(' ');
  assert.match(text, /1950 kcal/);
  assert.match(text, /rispetto alla tua partenza/);
});

test('in taratura il titolo non giudica e i limits citano il check-in', () => {
  const report = composeFocusV5Report({
    periodId: 'ieri',
    horizon: 'oggi',
    score: 0.3,
    reliability: 'high',
    actionPillar: 'alimentazione',
    calibration: { active: true, day: 5, total: 14 },
    movementEstimateNote: 'Movimento in gran parte stimato dal check-in.',
    pillars: [{ id: 'alimentazione', active: true, status: 'off_track', keyFact: '1200 kcal sotto obiettivo' }],
    safety: { signals: [] },
  });
  assert.equal(report.headline, "Kentu sta imparando: pasti sotto l'obiettivo");
  assert.doesNotMatch(report.headline, /fuori rotta|sulla rotta|a metà/);
  assert.ok(report.deepDive.limits.includes('Movimento in gran parte stimato dal check-in.'));
});
