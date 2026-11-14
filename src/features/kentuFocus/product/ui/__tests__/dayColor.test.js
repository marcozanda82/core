import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, dayColor, dayScaleMetrics } from '../dayColor.js';
import { focusPeriodWindow } from '../focusPeriodCursor.js';

test('il testo della casella resta almeno a 4,5:1', () => {
  const scores = [0, 0.2, 0.44, 0.5, 0.7, 0.8, 0.91, 1];
  for (const score of scores) {
    for (const force of [0, 1]) {
      const color = dayColor(score, force, 'closed');
      const stops = [...color.background.matchAll(/rgb\((\d+),(\d+),(\d+)\)/g)]
        .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
      const ink = color.color.startsWith('rgb')
        ? color.color.match(/\d+/g).map(Number)
        : [255, 255, 255];
      for (const stop of stops) {
        assert.ok(contrastRatio(ink, stop) >= 4.5, `${score}/${force} ${color.color} su ${stop}`);
      }
    }
  }
  assert.equal(dayColor(null, 0, 'hole').kind, 'hole');
  assert.equal(dayColor(1, 0, 'in_progress').kind, 'today');
  assert.equal(dayColor(1, 0, 'future').kind, 'future');
  assert.equal(dayColor(1, 0, 'paused').kind, 'pause');
});

test('la scala sale fino alla sabbia e non attraversa verdi né ciani', () => {
  const steps = [];
  for (let score = 0; score <= 1.0001; score += 0.05) {
    steps.push({ score: Math.round(score * 100) / 100, ...dayScaleMetrics(score) });
  }
  const untilSand = steps.filter((step) => step.score <= 0.65);
  const afterSand = steps.filter((step) => step.score >= 0.65);
  for (let index = 1; index < untilSand.length; index += 1) {
    assert.ok(untilSand[index].l + 0.004 >= untilSand[index - 1].l, `${untilSand[index].score} più scuro`);
  }
  for (let index = 1; index < afterSand.length; index += 1) {
    assert.ok(afterSand[index].l <= afterSand[index - 1].l + 0.004, `${afterSand[index].score} più chiaro del blu`);
  }
  for (const step of steps) {
    if (step.c < 0.02) continue;
    assert.ok(step.h < 140 || step.h > 220, `${step.score} tinta ${step.h}`);
  }
});

test('l’apertura è l’ultimo periodo completo', () => {
  const today = '2026-11-11';
  const day = focusPeriodWindow('ieri', today, 0);
  assert.equal(day.from, '2026-11-10');
  assert.equal(day.label.startsWith('Ieri · '), true);
  assert.equal(focusPeriodWindow('ieri', today, 1).from, '2026-11-11');
  const week = focusPeriodWindow('settimana', today, 0);
  assert.equal(week.from, '2026-11-02');
  assert.equal(week.to, '2026-11-08');
  assert.equal(focusPeriodWindow('settimana', today, 1).from, '2026-11-09');
  const month = focusPeriodWindow('mese', today, 0);
  assert.equal(month.from, '2026-10-01');
  assert.equal(month.to, '2026-10-31');
  assert.equal(month.label, 'Ottobre 2026');
  assert.equal(focusPeriodWindow('mese', today, 1).label, 'Novembre 2026');
  const monday = focusPeriodWindow('settimana', '2026-11-09', 0);
  assert.equal(monday.from, '2026-11-02');
  assert.equal(monday.to, '2026-11-08');
  const first = focusPeriodWindow('mese', '2026-11-01', 0);
  assert.equal(first.label, 'Ottobre 2026');
});
