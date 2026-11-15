/**
 * kds-4: status pilastri e giornata dal value post-penalità (Modello Kentu).
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const FIXTURE = path.join(
  ROOT,
  'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json',
);

test('pillarStatusFromValue: soglie Modello Kentu', () => {
  assert.equal(pillarStatusFromValue(0.75), 'on_track');
  assert.equal(pillarStatusFromValue(0.749), 'halfway');
  assert.equal(pillarStatusFromValue(0.45), 'halfway');
  assert.equal(pillarStatusFromValue(0.449), 'off_track');
  assert.equal(pillarStatusFromValue(null), 'no_data');
});

test('kds-4: status alimentazione segue value dopo penalità, non ENERGY_CURVE 10/35', () => {
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
  const ctx = {
    today: TODAY,
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    targetKcal: baseKcal,
    settingsBaseKcal: baseKcal,
    userTargets: { kcal: baseKcal },
    records,
    cylinders: { forza: { enabled: true } },
    scoreVersion: 'kds-4',
  };

  // 30/10: scarto −33,9% sarebbe halfway sulle fasce 10/35; value post-penalità < 0,45 → off_track
  const oct30 = computeDayScore('2026-10-30', ctx);
  assert.ok(oct30.cylinders.alimentazione.value < 0.45);
  assert.equal(oct30.cylinders.alimentazione.status, 'off_track');
  assert.equal(oct30.scoreStatus, pillarStatusFromValue(oct30.score));

  // 28/10: scarto +10,7% sarebbe halfway sulle fasce; value alto → on_track
  const oct28 = computeDayScore('2026-10-28', ctx);
  assert.ok(oct28.cylinders.alimentazione.value >= 0.75);
  assert.equal(oct28.cylinders.alimentazione.status, 'on_track');

  // 04/11: value in fascia halfway
  const nov04 = computeDayScore('2026-11-04', ctx);
  assert.ok(nov04.cylinders.alimentazione.value >= 0.45);
  assert.ok(nov04.cylinders.alimentazione.value < 0.75);
  assert.equal(nov04.cylinders.alimentazione.status, 'halfway');

  // kds-3 resta sulle fasce scarto ENERGY_CURVE (nessun scoreStatus)
  const oct28k3 = computeDayScore('2026-10-28', { ...ctx, scoreVersion: 'kds-3' });
  assert.equal(oct28k3.cylinders.alimentazione.status, 'halfway'); // +10,7% su base → halfway fasce
  assert.equal(oct28k3.scoreStatus, undefined);
  // stesso giorno in kds-4: value alto → on_track
  assert.equal(oct28.cylinders.alimentazione.status, 'on_track');
});

test('kds-4: scoreStatus giornata allineato alle soglie 0,75 / 0,45', () => {
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
  const ctx = {
    today: TODAY,
    fullHistory: RANGE.fullHistory,
    profile_targets: RANGE.profile_targets,
    targetKcal: baseKcal,
    settingsBaseKcal: baseKcal,
    userTargets: { kcal: baseKcal },
    records,
    cylinders: { forza: { enabled: true } },
    scoreVersion: 'kds-4',
  };
  for (let d = '2026-10-27'; d <= '2026-11-09'; d = addCalendarDays(d, 1)) {
    const s = computeDayScore(d, ctx);
    if (s.score == null) {
      assert.equal(s.scoreStatus, null);
      continue;
    }
    assert.equal(s.scoreStatus, pillarStatusFromValue(s.score), d);
  }
});
