/**
 * Parità MCP vs computeDayScore/computePeriodScore + dayDetail sulla fixture Focus.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildDayMealsDetail,
  buildDaySleepDetail,
  buildEvenings,
} from '../dayDetail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(
  ROOT,
  'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json',
);

const skip = existsSync(FIXTURE) ? false : 'fixture reale assente';

test('tre giorni fixture: computeDayScore kds-5 forma attesa', { skip }, async () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const { computeDayScore } = await import(
    '../../../src/features/kentuFocus/score/computeDayScore.js'
  );
  const today = '2026-11-09';
  const ctx = {
    today,
    fullHistory: fixture.fullHistory,
    userTargets: fixture.userTargets || fixture.profile_targets?.targets || {},
    profile_targets: fixture.profile_targets || {},
    records: fixture.day_status || fixture.records || {},
    movementCheckins: fixture.movement_checkin || {},
    catalogs: fixture.catalogs || { personalDb: {}, kentuItDb: {}, globalDb: {}, offDb: {} },
    scoreVersion: 'kds-5',
  };
  const days = ['2026-11-07', '2026-11-08', '2026-10-28'];
  for (const date of days) {
    const live = computeDayScore(date, ctx);
    assert.equal(live.version, 'kds-5', date);
    assert.ok(live.dayStatus, date);
    assert.ok('score' in live, date);
    assert.ok(live.cylinders?.alimentazione, date);
    assert.ok(live.cylinders?.movimento, date);
  }
});

test('settimana fixture: computePeriodScore copertura e score definiti', { skip }, async () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const { computePeriodScore } = await import(
    '../../../src/features/kentuFocus/score/computePeriodScore.js'
  );
  const today = '2026-11-09';
  const ctx = {
    today,
    fullHistory: fixture.fullHistory,
    userTargets: fixture.userTargets || fixture.profile_targets?.targets || {},
    profile_targets: fixture.profile_targets || {},
    records: fixture.day_status || fixture.records || {},
    movementCheckins: fixture.movement_checkin || {},
    catalogs: fixture.catalogs || { personalDb: {}, kentuItDb: {}, globalDb: {}, offDb: {} },
    scoreVersion: 'kds-5',
  };
  const period = computePeriodScore('2026-11-03', '2026-11-09', ctx);
  assert.equal(period.from, '2026-11-03');
  assert.equal(period.to, '2026-11-09');
  assert.ok(period.pastDays >= 1);
  assert.ok(Number.isFinite(period.coverage));
});

test('fixture: dayDetail e evenings non esplodono', { skip }, () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const date = '2026-11-08';
  const meals = buildDayMealsDetail(fixture.fullHistory, date);
  const sleep = buildDaySleepDetail(fixture.fullHistory, date);
  assert.ok(Array.isArray(meals.meals));
  assert.ok(Array.isArray(meals.liquids));
  if (sleep) {
    assert.ok('hours' in sleep);
    assert.ok('qualityStars' in sleep);
    assert.ok('notes' in sleep);
  }
  const evenings = buildEvenings(fixture.fullHistory, '2026-11-03', '2026-11-09');
  assert.equal(evenings.days, 7);
  assert.equal(evenings.evenings.length, 7);
});
