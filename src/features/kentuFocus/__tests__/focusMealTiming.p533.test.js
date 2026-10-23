/**
 * P5.3.3 — meal slots, timing, plausibilità nutrienti/biometria (offline).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeTotali } from '../../../utils/computeTotaliCore.js';
import {
  buildFocusLabDossier,
  detectNutritionAnomaliesFromDayLog,
} from '../lab/buildFocusLabDossier.js';
import {
  canonicalizeMealType,
  collectDayLogForNutrition,
  normalizeFoodEvents,
  resolveFocusMealIdentity,
  resolveFoodClockHour,
} from '../normalize/normalizeFoodEvents.js';
import { evaluateBodyMeasurementPlausibility } from '../normalize/focusBodyPlausibility.js';
import { ANALYSIS_DATE, PUBLICATION_DATE } from './fixtures/focusDayFixtures.js';

describe('P5.3.3 meal slots e timing', () => {
  it('canonicizza slot timestamp e alias; conserva slot distinti', () => {
    const pranzoTs = `pranzo_${Date.now()}`;
    const colTs = `colazione_${Date.now() - 1}`;
    const cenaTs = `cena_${Date.now() - 2}`;
    assert.equal(canonicalizeMealType(pranzoTs), 'pranzo');
    assert.equal(canonicalizeMealType('snack_2'), 'snack');
    assert.equal(canonicalizeMealType('merenda1'), 'colazione');
    assert.equal(resolveFocusMealIdentity({ mealType: 'snack_1' }).mealSlotId, 'snack_1');
    assert.equal(resolveFocusMealIdentity({ mealType: 'snack_2' }).mealSlotId, 'snack_2');

    const node = {
      mealTimes: {
        [colTs]: 8,
        [pranzoTs]: 13.25,
        snack_1: 11,
        snack_2: 16.5,
        [cenaTs]: 21.4,
      },
      log: [
        {
          type: 'meal',
          mealId: colTs,
          items: [{ id: 'a', type: 'food', name: 'Y', kcal: 100, prot: 10, carb: 10, fat: 2, fibre: 1 }],
        },
        {
          type: 'meal',
          mealId: pranzoTs,
          items: [{ id: 'b', type: 'food', name: 'R', kcal: 200, prot: 5, carb: 40, fat: 1, fibre: 2 }],
        },
        {
          type: 'meal',
          mealId: 'snack_1',
          items: [{ id: 's1', type: 'food', name: 'Mela', kcal: 80, prot: 0, carb: 20, fat: 0, fibre: 3 }],
        },
        {
          type: 'meal',
          mealId: 'snack_2',
          items: [{ id: 's2', type: 'food', name: 'Yogurt', kcal: 120, prot: 10, carb: 12, fat: 3, fibre: 0 }],
        },
        {
          type: 'meal',
          mealId: cenaTs,
          items: [{ id: 'c', type: 'food', name: 'P', kcal: 250, prot: 30, carb: 0, fat: 8, fibre: 1 }],
        },
        {
          type: 'meal',
          mealId: 'merenda1',
          items: [{ id: 'm1', type: 'food', name: 'Pane', kcal: 90, prot: 3, carb: 15, fat: 1, fibre: 1 }],
        },
      ],
    };

    const focus = normalizeFoodEvents(node);
    const slots = focus.nutrition.meals.map((m) => m.mealSlotId);
    assert.ok(slots.includes('snack_1'));
    assert.ok(slots.includes('snack_2'));
    assert.equal(focus.nutrition.meals.filter((m) => m.canonicalMealType === 'snack').length, 2);
    assert.equal(focus.nutrition.meals.find((m) => m.mealSlotId === pranzoTs)?.clockHour?.value, 13.25);
    assert.equal(focus.nutrition.meals.find((m) => m.mealSlotId === cenaTs)?.clockHour?.value, 21.4);
    assert.equal(focus.nutrition.firstMealHour.value, 8);
    assert.equal(focus.nutrition.lastMealHour.value, 21.4);
    // merenda1 senza mealTimes → orario missing: finestra parziale, non inventata
    assert.equal(focus.nutrition.timingCoverage.partial, true);
    assert.ok(focus.nutrition.meals.find((m) => m.mealSlotId === 'merenda1')?.clockHour?.provenance === 'missing');

    assert.equal(focus.kentuTotals.kcal, 100 + 200 + 80 + 120 + 250 + 90);
    assert.equal(focus.kentuTotals.prot, 10 + 5 + 0 + 10 + 30 + 3);
    assert.equal(focus.kentuTotals.kcal, computeTotali(collectDayLogForNutrition(node)).kcal);
  });

  it('non assegna orario cena ad altri pasti senza tempo', () => {
    const cenaTs = `cena_${Date.now()}`;
    const pranzoTs = `pranzo_${Date.now()}`;
    const node = {
      mealTimes: { [cenaTs]: 21.4 },
      log: [
        {
          type: 'meal',
          mealId: pranzoTs,
          items: [{ id: 'b', type: 'food', name: 'Riso', kcal: 200, prot: 5, carb: 40, fat: 1, fibre: 2 }],
        },
        {
          type: 'meal',
          mealId: cenaTs,
          items: [{ id: 'c', type: 'food', name: 'Pesce', kcal: 250, prot: 30, carb: 0, fat: 8, fibre: 1 }],
        },
      ],
    };
    const focus = normalizeFoodEvents(node);
    const pranzo = focus.nutrition.meals.find((m) => m.mealSlotId === pranzoTs);
    const cena = focus.nutrition.meals.find((m) => m.mealSlotId === cenaTs);
    assert.equal(pranzo.clockHour.provenance, 'missing');
    assert.equal(cena.clockHour.value, 21.4);
    assert.equal(focus.nutrition.firstMealHour.value, 21.4);
    assert.equal(focus.nutrition.lastMealHour.value, 21.4);
    assert.equal(focus.nutrition.timingCoverage.partial, true);
    assert.equal(focus.nutrition.timingCoverage.windowComplete, false);

    assert.equal(
      resolveFoodClockHour({ mealType: pranzoTs }, { [cenaTs]: 21.4 }),
      null,
    );
  });

  it('priorità mealTimes chiave esatta su base canonica', () => {
    const slot = 'snack_2';
    const hour = resolveFoodClockHour(
      { mealType: slot },
      { snack: 10, snack_2: 16.75 },
    );
    assert.equal(hour, 16.75);
  });
});

describe('P5.3.3 plausibilità', () => {
  it('fibra anomala segnalata senza modificare valore', () => {
    const node = {
      log: [{
        type: 'food',
        id: 'f',
        mealType: 'cena',
        name: 'Salmone',
        kcal: 200,
        prot: 30,
        carb: 0,
        fat: 8,
        fibre: 70,
      }],
    };
    const focus = normalizeFoodEvents(node);
    assert.equal(focus.kentuTotals.fibre, 70);
    assert.equal(focus.nutrition.plausibility.status, 'suspect');
    assert.equal(focus.nutrition.plausibility.reliableForJudgement, false);
    assert.ok(focus.nutrition.plausibility.flags.some((f) => f.code === 'daily_fiber_unusually_high'));
    assert.ok(focus.nutrition.plausibility.flags.some((f) => f.code === 'fibre_on_fish_like_name'));

    const flags = detectNutritionAnomaliesFromDayLog(node.log, { fiberG: 70, hasFood: true });
    assert.ok(flags.length >= 1);
  });

  it('lean > weight suspect; misura vecchia stale_for_current', () => {
    const suspect = evaluateBodyMeasurementPlausibility({
      date: '2026-10-18',
      weight: 70,
      leanMassKg: 75,
    }, { analysisDate: '2026-10-18' });
    assert.equal(suspect.status, 'suspect');
    assert.ok(suspect.reasons.includes('lean_mass_kg_exceeds_weight'));

    const stale = evaluateBodyMeasurementPlausibility({
      date: '2026-08-01',
      weight: 70,
    }, { analysisDate: '2026-10-18', recencyDays: 30 });
    assert.equal(stale.status, 'stale_for_current');
    assert.equal(stale.suitableForCurrentAnalysis, false);
    assert.equal(stale.historicalOk, true);

    const muscleOnly = evaluateBodyMeasurementPlausibility({
      date: '2026-10-18',
      weight: 70,
      muscle: 40,
    }, { analysisDate: '2026-10-18' });
    assert.equal(muscleOnly.leanMassKgUsed, null);
    assert.ok(muscleOnly.reasons.includes('muscle_field_unit_unspecified_not_used_as_lean_kg'));

    const dossier = buildFocusLabDossier({
      historyLoadState: 'ready',
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory: {
        [`trackerStorico_${ANALYSIS_DATE}`]: { log: [] },
        [`trackerStorico_${PUBLICATION_DATE}`]: { log: [] },
      },
      bodyMetrics: [
        { id: '1', date: '2026-08-01', timestamp: 1, weight: 70, leanMassKg: 80 },
        { id: '2', date: ANALYSIS_DATE, timestamp: 2, weight: 71 },
      ],
    });
    const old = dossier.body.measurements.find((m) => m.date === '2026-08-01');
    assert.equal(old.plausibility.status, 'suspect');
    const current = dossier.body.measurements.find((m) => m.date === ANALYSIS_DATE);
    assert.equal(current.plausibility.status, 'valid_for_analysis');
  });
});
