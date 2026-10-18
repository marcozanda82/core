import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { evaluateDomainCoverage, FOCUS_COVERAGE_THRESHOLDS } from '../aggregate/focusCoverageConfig.js';
import { buildFoodFrequency, normalizeFoodNameKey } from '../aggregate/foodFrequency.js';
import {
  aggregateHistoryWindow,
  buildHistoryWindows,
  deriveHistoryThinFlags,
} from '../aggregate/historyWindows.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { validateFocusDossier } from '../validate/validateFocusDossier.js';
import { ANALYSIS_DATE, PUBLICATION_DATE, buildFullDayFixture } from './fixtures/focusDayFixtures.js';
import {
  buildHistoryBriefSeries,
  buildSparseHistoryBriefs,
} from './fixtures/focusHistoryFixtures.js';

test('finestre complete: medie e giorni senza divisione per zero', () => {
  const briefs = buildHistoryBriefSeries({ dayCount: 30, foodGapEvery: 0 });
  const history = buildHistoryWindows(briefs, { analysisDate: ANALYSIS_DATE });
  assert.equal(history.d7.sampleSize, 7);
  assert.equal(history.d7.calendarDays, 7);
  assert.equal(history.d30.sampleSize, 30);
  assert.equal(history.d90.available, false);
  assert.ok(history.d7.nutrition.avgKcal > 0);
  assert.ok(history.d7.nutrition.daysWithFood >= 1);
  assert.ok(history.d7.nutrition.daysWithoutFoodLog === history.d7.nutrition.daysWithoutFood);
  assert.ok(history.d7.sleep.nightsLogged >= 1);
  assert.ok(history.d7.activity.workoutDays >= 0);
  assert.equal(history.d7.activity.zeroLoggedWorkoutsMeans, 'no_workout_events_found');
  assert.equal(Number.isFinite(history.d7.nutrition.avgKcal), true);
  assert.equal(Number.isFinite(history.d30.coverage.nutrition.coverageRatio), true);
});

test('finestre con molti giorni mancanti: coverage nutrition insufficient / none', () => {
  const sparse = buildSparseHistoryBriefs();
  const history = buildHistoryWindows(sparse, { analysisDate: ANALYSIS_DATE });
  assert.ok(history.d30.coverage.nutrition.coverageRatio < FOCUS_COVERAGE_THRESHOLDS.d30.thinBelowRatio
    || history.d30.coverage.nutrition.daysWithData < FOCUS_COVERAGE_THRESHOLDS.d30.minDaysForTrend);
  assert.notEqual(history.d30.coverage.nutrition.sufficiency, 'ok');
  assert.equal(history.d30.nutrition.avgKcal == null || history.d30.nutrition.daysWithFood > 0, true);
});

test('coperture differenti tra domini', () => {
  const briefs = buildHistoryBriefSeries({ dayCount: 14, foodGapEvery: 0, skipSleep: true });
  // forza workout assenti
  const noWorkout = briefs.map((b) => ({
    ...b,
    hasWorkout: false,
    activity: { workoutKcal: null, cardioMinutes: null, workoutCount: 0 },
  }));
  const d7 = aggregateHistoryWindow(noWorkout.slice(-7), 'd7');
  assert.equal(d7.coverage.nutrition.sufficiency === 'ok' || d7.coverage.nutrition.daysWithData >= 3, true);
  assert.equal(d7.coverage.sleep.sufficiency, 'none');
  assert.equal(d7.coverage.activity.sufficiency, 'none');
  assert.notEqual(d7.coverage.nutrition.coverageRatio, d7.coverage.sleep.coverageRatio);
});

test('confronti periodi con copertura insufficiente → trendComparable false', () => {
  const cov = evaluateDomainCoverage(2, 30, FOCUS_COVERAGE_THRESHOLDS.d30);
  assert.equal(cov.sufficiency, 'insufficient');
  assert.equal(cov.trendComparable, false);
  const none = evaluateDomainCoverage(0, 7, FOCUS_COVERAGE_THRESHOLDS.d7);
  assert.equal(none.sufficiency, 'none');
  assert.equal(none.trendComparable, false);
});

test('d90 disponibile solo con abbastanza input', () => {
  const short = buildHistoryWindows(buildHistoryBriefSeries({ dayCount: 30 }), {
    analysisDate: ANALYSIS_DATE,
  });
  assert.equal(short.d90.available, false);
  const long = buildHistoryWindows(buildHistoryBriefSeries({ dayCount: 50 }), {
    analysisDate: ANALYSIS_DATE,
  });
  assert.equal(long.d90.available, true);
  assert.equal(long.d90.calendarDays, 90);
  assert.ok(long.d90.briefsReceived >= 45);
});

test('frequenza alimentare: foodDbKey, nome, ricette, unclassified', () => {
  const briefs = buildHistoryBriefSeries({ dayCount: 8, includeRecipes: true });
  const items = briefs.flatMap((b) => b.foodItems);
  items.push({
    date: ANALYSIS_DATE,
    type: 'food',
    name: '',
    mealType: 'unknown',
  });
  const freq = buildFoodFrequency(items);
  assert.ok(freq.uniqueIdentities >= 2);
  const yogurt = freq.items.find((i) => i.key === 'db:db_yogurt');
  assert.ok(yogurt);
  assert.equal(yogurt.keyType, 'foodDbKey');
  assert.ok(yogurt.distinctDays >= 1);
  assert.ok(yogurt.occasions >= yogurt.distinctDays);
  const recipe = freq.items.find((i) => i.kind === 'recipe');
  assert.ok(recipe);
  assert.ok(freq.unclassifiedOccasions >= 1);
  assert.equal(normalizeFoodNameKey('  Pasta Al Pomodoro '), 'pasta al pomodoro');
});

test('giorni senza pasti + sonno mancante: medie null, nessun invento', () => {
  const brief = buildDayBrief({
    date: ANALYSIS_DATE,
    dayNode: { log: [], manualNodes: [] },
    sleepNode: { log: [] },
  });
  assert.equal(brief.hasFood, false);
  assert.equal(brief.sleepAvailable, false);
  assert.equal(brief.nutrition.kcal, null);
  assert.equal(brief.sleep.hours, null);
  const history = buildHistoryWindows([brief], { analysisDate: ANALYSIS_DATE });
  assert.equal(history.d7.nutrition.avgKcal, null);
  assert.equal(history.d7.sleep.avgHours, null);
  assert.equal(history.d7.nutrition.daysWithFood, 0);
  assert.equal(history.d7.nutrition.daysWithoutFoodLog, 7);
});

test('buildFocusDossier integra history + habits e valida', () => {
  const briefs = buildHistoryBriefSeries({ dayCount: 30 });
  const fixture = buildFullDayFixture();
  const dossier = buildFocusDossier({
    ...fixture,
    historyDayBriefs: briefs,
    generatedAt: '2026-10-17T08:00:00.000Z',
  });
  const v = validateFocusDossier(dossier);
  assert.equal(v.ok, true, v.errors.join(', '));
  assert.ok(dossier.history.d7.coverage.nutrition.windowDays === 7);
  assert.ok(dossier.habits.foodFrequency.items.length >= 1);
  const thin = deriveHistoryThinFlags(dossier.history);
  assert.equal(dossier.meta.flags.historyThin30, thin.historyThin30);
  assert.equal(dossier.meta.analysisDate, ANALYSIS_DATE);
  assert.equal(dossier.meta.publicationDate, PUBLICATION_DATE);
});

test('zero registrato vs missing: cardio 0 con workout non cardio', () => {
  const brief = buildDayBrief({
    date: ANALYSIS_DATE,
    dayNode: {
      log: [{
        type: 'workout',
        id: 'w1',
        name: 'Pesi',
        duration: 40,
        kcal: 200,
      }],
    },
    sleepNode: { log: [] },
  });
  assert.equal(brief.hasWorkout, true);
  assert.equal(brief.activity.cardioMinutes, 0);
  const d7 = aggregateHistoryWindow([brief], 'd7');
  assert.equal(d7.activity.cardioMinutesTotal, 0);
  assert.equal(d7.coverage.activity.daysWithData, 1);
});

test('sonno placeholder 60 non entra nelle medie stage (value null)', () => {
  const fixture = buildFullDayFixture();
  const dossier = buildFocusDossier(fixture);
  assert.equal(dossier.sleep.deepMin.provenance, FOCUS_PROVENANCE.missing);
  assert.equal(dossier.sleep.deepMin.value, null);
});
