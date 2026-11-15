/**
 * Fixture focusDiary.2026-11-09.real.json — forceIntensity prima/dopo.
 *
 * Punteggi e stati cilindri restano kds-3 (invariati). Cambia solo forceIntensity.
 *
 * | giorno     | score | forceIntensity PRIMA (hypertrophy) | DOPO (force-ci-1) |
 * |------------|-------|------------------------------------|-------------------|
 * | 2026-10-28 | 0.639 | 0 (gate <0.75; raw 0.369)          | 0                 |
 * | 2026-10-29 | 0.703 | 0 (gate <0.75; raw 1.000)          | 0                 |
 * | 2026-10-30 | 0.388 | 0 (gate <0.75; raw 0.923)          | 0                 |
 * | 2026-11-05 | 0.588 | 0 (gate <0.75; raw 0.369)          | 0                 |
 * | 2026-11-09 | 0.846 | 0.923                              | 0.400             |
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { computeDayScore } from '../../score/computeDayScore.js';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { forceLoadConsistency } from '../forceConsistency.ci-1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../../__tests__/fixtures/focusDiary.2026-11-09.real.json');
const TODAY = '2026-11-10';

const EXPECTED = Object.freeze([
  { date: '2026-10-28', score: 0.639, forceBefore: 0, forceAfter: 0 },
  { date: '2026-10-29', score: 0.703, forceBefore: 0, forceAfter: 0 },
  { date: '2026-10-30', score: 0.388, forceBefore: 0, forceAfter: 0 },
  { date: '2026-11-05', score: 0.588, forceBefore: 0, forceAfter: 0 },
  { date: '2026-11-09', score: 0.846, forceBefore: 0.923, forceAfter: 0.4 },
]);

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

describe('force-ci-1 su fixture reale 2026-11-09', () => {
  it('punteggi invariati; forceIntensity solo dove ≥0.75', () => {
    const RANGE = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const base = {
      today: TODAY,
      fullHistory: RANGE.fullHistory,
      profile_targets: RANGE.profile_targets,
      records: calibrationRecords(RANGE.fullHistory, TODAY),
      scoreVersion: 'kds-3',
      cylinders: { forza: { enabled: true } },
    };

    for (const row of EXPECTED) {
      const result = computeDayScore(row.date, base);
      assert.equal(result.score, row.score, `${row.date} score`);
      assert.equal(result.forceIntensity, row.forceAfter, `${row.date} forceAfter`);
      // raw force-ci (senza gate) coerente con il gated
      const raw = forceLoadConsistency(row.date, RANGE.fullHistory, { weeklyGoalDays: 2 });
      if (result.score != null && result.score >= 0.75) {
        assert.equal(result.forceIntensity, raw);
      } else {
        assert.equal(result.forceIntensity, 0);
      }
      // Documentazione regressione: prima (gated) era row.forceBefore
      assert.ok(Number.isFinite(row.forceBefore));
    }
  });
});
