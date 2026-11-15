import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDayRef, resolvePeriodRef } from '../dates.js';

// Mercoledì 12 nov 2025 15:00 UTC → 16:00 Europe/Rome
const WED = new Date('2025-11-12T15:00:00.000Z');

test('resolveDayRef today/yesterday/iso', () => {
  assert.equal(resolveDayRef('today', WED).date, '2025-11-12');
  assert.equal(resolveDayRef('yesterday', WED).date, '2025-11-11');
  assert.equal(resolveDayRef('2025-10-01', WED).date, '2025-10-01');
});

test('resolvePeriodRef this_week / last_week (lun–dom Rome)', () => {
  const week = resolvePeriodRef('this_week', WED);
  assert.equal(week.from, '2025-11-10');
  assert.equal(week.to, '2025-11-16');
  assert.equal(week.periodId, 'settimana');
  assert.equal(week.analysisDate, '2025-11-12');

  const last = resolvePeriodRef('last_week', WED);
  assert.equal(last.from, '2025-11-03');
  assert.equal(last.to, '2025-11-09');
  assert.equal(last.analysisDate, '2025-11-09');
});

test('resolvePeriodRef this_month / last_month', () => {
  const month = resolvePeriodRef('this_month', WED);
  assert.equal(month.from, '2025-11-01');
  assert.equal(month.to, '2025-11-30');
  assert.equal(month.analysisDate, '2025-11-12');

  const last = resolvePeriodRef('last_month', WED);
  assert.equal(last.from, '2025-10-01');
  assert.equal(last.to, '2025-10-31');
  assert.equal(last.analysisDate, '2025-10-31');
});
