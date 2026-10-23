/**
 * P5.3.1 — qualità dati Focus: meal nested, cardio/forza, body dedupe (offline).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeTotali } from '../../../utils/computeTotaliCore.js';
import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import {
  buildFocusLabDossier,
  dedupeBodyMetricsForLabExport,
  detectNutritionAnomaliesFromDayLog,
} from '../lab/buildFocusLabDossier.js';
import { expandTrackerLogEntries, pickDayLogRaw } from '../normalize/expandTrackerDayLog.js';
import { getLogArray } from '../normalize/logUtils.js';
import {
  collectDayLogForNutritionWithQuality,
  normalizeFoodEvents,
} from '../normalize/normalizeFoodEvents.js';
import {
  classifyFocusActivity,
  isCardioWorkout,
  labelMatchesActivityPatterns,
  normalizeWorkoutEvents,
} from '../normalize/normalizeWorkoutEvents.js';
import { resolveFocusBodyWeight } from '../server/reader/resolveFocusProfileData.js';
import { ANALYSIS_DATE, PUBLICATION_DATE } from './fixtures/focusDayFixtures.js';

describe('P5.3.1 meal expansion', () => {
  it('riconosce pasti annidati con più alimenti e conserva nutrienti/orari', () => {
    const node = {
      data: ANALYSIS_DATE,
      mealTimes: { pranzo: 13.5 },
      log: [
        {
          type: 'meal',
          mealId: 'pranzo',
          items: [
            {
              id: 'f1',
              type: 'food',
              name: 'Riso',
              mealTime: 13.5,
              kcal: 200,
              prot: 5,
              carb: 40,
              fat: 1,
              fibre: 1,
              grams: 80,
            },
            {
              id: 'f2',
              type: 'food',
              name: 'Pollo',
              mealTime: 13.5,
              kcal: 250,
              prot: 40,
              carb: 0,
              fat: 8,
              fibre: 0,
              grams: 120,
            },
          ],
        },
      ],
    };

    const expanded = getLogArray(node);
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].type, 'food');
    assert.equal(expanded[0].mealType, 'pranzo');

    const focus = normalizeFoodEvents(node);
    assert.equal(focus.hasFood, true);
    assert.equal(focus.kentuTotals.kcal, 450);
    assert.equal(focus.kentuTotals.prot, 45);
    assert.equal(focus.nutrition.meals[0].itemCount, 2);

    const kentu = computeTotali(expanded);
    assert.equal(focus.kentuTotals.kcal, kentu.kcal);
    assert.equal(focus.kentuTotals.fibre, kentu.fibre);
  });

  it('compatibile con food/recipe piatti e non doppio-conta meal+flat stesso id', () => {
    const node = {
      log: [
        {
          type: 'meal',
          mealId: 'cena',
          items: [
            {
              id: 'same',
              type: 'food',
              name: 'Pasta',
              mealType: 'cena',
              kcal: 400,
              prot: 15,
              carb: 60,
              fat: 10,
              fibre: 3,
            },
          ],
        },
        {
          id: 'same',
          type: 'food',
          name: 'Pasta DUP',
          mealType: 'cena',
          kcal: 400,
          prot: 15,
          carb: 60,
          fat: 10,
          fibre: 3,
        },
        {
          id: 'r1',
          type: 'recipe',
          name: 'Zuppa',
          mealType: 'cena',
          kcal: 150,
          prot: 8,
          carb: 20,
          fat: 4,
          fibre: 2,
        },
      ],
    };
    const { dayLog, quality } = collectDayLogForNutritionWithQuality(node);
    const foods = dayLog.filter((e) => e.type === 'food' || e.type === 'recipe');
    assert.equal(foods.length, 2);
    assert.ok(quality.duplicatesRemoved >= 1);
    const focus = normalizeFoodEvents(node);
    assert.equal(focus.kentuTotals.kcal, 550);
  });

  it('legacy dati.log e zero vs missing', () => {
    assert.deepEqual(
      expandTrackerLogEntries(pickDayLogRaw({ dati: { log: [{ type: 'food', id: 'x', kcal: 10, mealType: 'snack' }] } })).map((e) => e.id),
      ['x'],
    );
    const empty = normalizeFoodEvents({ log: [] });
    assert.equal(empty.hasFood, false);
    assert.equal(empty.nutrition.totals.kcal.provenance, 'missing');

    const zeroFibre = normalizeFoodEvents({
      log: [{
        type: 'food', id: 'z', name: 'Olio', mealType: 'pranzo', kcal: 90, prot: 0, carb: 0, fat: 10, fibre: 0,
      }],
    });
    assert.equal(zeroFibre.hasFood, true);
    assert.equal(zeroFibre.kentuTotals.fibre, 0);
    assert.equal(zeroFibre.nutrition.totals.fiberG.value, 0);
  });

  it('esclude bozze unresolved', () => {
    const focus = normalizeFoodEvents({
      log: [
        {
          type: 'meal',
          mealId: 'pranzo',
          items: [
            {
              id: 'draft', type: 'food', name: 'Bozza', status: 'pending', kcal: 500, prot: 20, carb: 40, fat: 10,
            },
            {
              id: 'ok', type: 'food', name: 'Riso', kcal: 200, prot: 5, carb: 40, fat: 1, fibre: 1,
            },
          ],
        },
      ],
    });
    assert.equal(focus.kentuTotals.kcal, 200);
    assert.equal(focus.hasFood, true);
  });
});

describe('P5.3.1 activity classification', () => {
  it('bicipiti non è bici; strength precede aerobic', () => {
    const label = 'Sollevamento Pesi (bicipiti + tricipiti + avambracci)';
    assert.equal(labelMatchesActivityPatterns(label, ['bici']), false);
    assert.equal(isCardioWorkout({ name: label }), false);
    assert.equal(classifyFocusActivity({ name: label }).kind, 'strength');
  });

  it('camminata aerobic distinta da intensità moderata verificata', () => {
    const walk = normalizeWorkoutEvents({
      log: [{ type: 'workout', id: 'w', name: 'Camminata', duration: 40, kcal: 120 }],
    });
    assert.equal(walk.activity.aerobicMinutes.value, 40);
    assert.equal(walk.activity.walkingMinutes.value, 40);
    assert.equal(walk.activity.moderateIntensityMinutes.provenance, 'missing');
    assert.equal(walk.activity.moderateIntensityMinutes.value, null);

    const moderate = normalizeWorkoutEvents({
      log: [{
        type: 'workout', id: 'm', name: 'Corsa', duration: 30, kcal: 300, intensity: 'moderate',
      }],
    });
    assert.equal(moderate.activity.aerobicMinutes.value, 30);
    assert.equal(moderate.activity.moderateIntensityMinutes.value, 30);
    assert.equal(moderate.activity.moderateIntensityMinutes.provenance, 'recorded');

    const brief = buildDayBrief({
      date: ANALYSIS_DATE,
      dayNode: { log: [{ type: 'workout', id: 'w', name: 'Camminata', duration: 40 }] },
      sleepNode: null,
    });
    assert.equal(brief.activity.walkingMinutes, 40);
    assert.equal(brief.activity.moderateIntensityMinutes, null);
  });

  it('bici come parola intera resta aerobic', () => {
    assert.equal(classifyFocusActivity({ name: 'Bici indoor' }).kind, 'aerobic');
    assert.equal(classifyFocusActivity({ name: 'Yoga flow' }).kind, 'other_activity');
    assert.equal(classifyFocusActivity({}).kind, 'unclassified');
  });
});

describe('P5.3.1 body dedupe + nutrition flags', () => {
  it('collassa duplicati identici; conserva pesate stesso giorno diverse', () => {
    const list = [
      { id: 'a', date: '2026-10-10', timestamp: 1000, weight: 78.4 },
      { id: 'a', date: '2026-10-10', timestamp: 1000, weight: 78.4 },
      { id: 'b', date: '2026-10-10', timestamp: 1000, weight: 78.4 },
      { id: 'c', date: '2026-10-10', timestamp: 2000, weight: 78.5 },
      { id: 'd', date: '2026-10-11', timestamp: 1000, weight: 78.4 },
    ];
    const { entries, duplicatesCollapsed } = dedupeBodyMetricsForLabExport(list);
    assert.equal(duplicatesCollapsed, 2);
    assert.equal(entries.length, 3);

    const resolvedBefore = resolveFocusBodyWeight(list, null, '2026-10-16');
    const resolvedAfter = resolveFocusBodyWeight(entries, null, '2026-10-16');
    assert.equal(resolvedBefore.bodyWeightKg, resolvedAfter.bodyWeightKg);
    assert.equal(resolvedBefore.bodyMeasuredOn, resolvedAfter.bodyMeasuredOn);

    const dossier = buildFocusLabDossier({
      historyLoadState: 'ready',
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory: {
        [`trackerStorico_${ANALYSIS_DATE}`]: { log: [] },
        [`trackerStorico_${PUBLICATION_DATE}`]: { log: [] },
      },
      bodyMetrics: list,
    });
    assert.equal(dossier.body.measurements.length, 3);
    assert.equal(dossier.body.dedupe.duplicatesCollapsed, 2);
    assert.equal(
      dossier.body.resolvedForAnalysis.bodyWeightKg.value,
      resolvedBefore.bodyWeightKg,
    );
  });

  it('segnala fibra su nome pesce senza correggere', () => {
    const flags = detectNutritionAnomaliesFromDayLog([
      {
        type: 'food', id: 'p1', name: 'Salmone al forno', fibre: 2, kcal: 200, mealType: 'cena',
      },
    ], { fiberG: 2, hasFood: true });
    assert.ok(flags.some((f) => f.code === 'fibre_on_fish_like_name'));
    assert.equal(flags.find((f) => f.code === 'fibre_on_fish_like_name').fibreG, 2);
  });
});
