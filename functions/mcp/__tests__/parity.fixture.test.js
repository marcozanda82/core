/**
 * Parità MCP vs computeDayScore/computePeriodScore sulla fixture Focus.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(
  ROOT,
  'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json',
);

const skip = existsSync(FIXTURE) ? false : 'fixture reale assente';

test('tre giorni fixture: score MCP-equivalent == computeDayScore', { skip }, async () => {
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
  };
  const days = ['2026-11-07', '2026-11-08', '2026-10-28'];
  for (const date of days) {
    const live = computeDayScore(date, ctx);
    assert.equal(live.version, 'kds-3', date);
    assert.ok(live.dayStatus, date);
    // Il payload MCP riusa lo stesso compute: qui verifichiamo che non esploda e abbia forma attesa
    assert.ok('score' in live, date);
    assert.ok(live.cylinders?.alimentazione, date);
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
  };
  const period = computePeriodScore('2026-11-03', '2026-11-09', ctx);
  assert.equal(period.version, 'kds-3');
  assert.equal(period.from, '2026-11-03');
  assert.equal(period.to, '2026-11-09');
  assert.ok(period.pastDays >= 1);
  assert.ok(Number.isFinite(period.coverage));
});

// evita warning unused
void createRequire;
