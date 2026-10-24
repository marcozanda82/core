/**
 * Usabilità nutrienti + privacy catalogRef.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNutritionCoachEvidence,
  mapAnomalyFlagsToUnusableNutrients,
  projectCatalogRefForExport,
  withUsability,
} from '../lab/focusLabNutritionUsability.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';

describe('focusLabNutritionUsability', () => {
  it('mappa fibre su pesce e giorno alto come non usabili', () => {
    const mapped = mapAnomalyFlagsToUnusableNutrients([
      { code: 'fibre_on_fish_like_name', itemId: 'fish1', fibreG: 70 },
      { code: 'daily_fiber_unusually_high', fiberG: 92.6 },
    ]);
    assert.ok(mapped.byItemId.get('fish1').has('fiberG'));
    assert.ok(mapped.dayNutrients.has('fiberG'));
    assert.ok(mapped.excludedFromAdvice.some((e) => e.reason === 'fibre_on_fish_like_name'));
  });

  it('projectCatalogRef redige foodDbKey senza consenso', () => {
    const full = projectCatalogRefForExport({
      foodDbKey: 'merluzzo_fresco',
      dbSource: 'kentu_it',
      dbSourceProvenance: FOCUS_PROVENANCE.recorded,
      nutrientPresenceEvidence: 'db_provided_keys',
    }, false);
    assert.equal(full.foodDbKey, null);
    assert.equal(full.foodDbKeyRedacted, true);
    assert.equal(full.dbSource, 'kentu_it');

    const deep = projectCatalogRefForExport({
      foodDbKey: 'merluzzo_fresco',
      dbSource: 'kentu_it',
      dbSourceProvenance: FOCUS_PROVENANCE.recorded,
      nutrientPresenceEvidence: 'db_provided_keys',
    }, true);
    assert.equal(deep.foodDbKey, 'merluzzo_fresco');
    assert.equal(deep.foodDbKeyRedacted, false);
  });

  it('coach evidence: no judgment, no false deficiency, labels opt-in', () => {
    const evidence = buildNutritionCoachEvidence({
      foods: [
        {
          id: 'a',
          name: 'Merluzzo SECRET',
          omega3: 0.5,
          dbProvidedNutrientKeys: ['omega3'],
          fibre: 40,
          type: 'food',
        },
        {
          id: 'b',
          name: 'Spinaci',
          k: 500,
          mg: 80,
          type: 'food',
        },
      ],
      meals: [{ mealSlotId: 'cena', mealType: 'cena', clockHour: { value: 20 }, items: [{}, {}] }],
      micronutrientTotals: {
        byKey: {
          omega3: {
            value: 0.5, unit: 'g', provenance: 'calculated',
            completenessRatio: 0.5, itemsKnown: 1, itemsTotal: 2,
          },
          k: {
            value: 500, unit: 'mg', provenance: 'calculated',
            completenessRatio: 0.5, itemsKnown: 1, itemsTotal: 2,
          },
          mg: {
            value: 80, unit: 'mg', provenance: 'calculated',
            completenessRatio: 0.5, itemsKnown: 1, itemsTotal: 2,
          },
          vitB12: {
            value: null, unit: 'µg', provenance: 'missing',
            completenessRatio: 0, itemsKnown: 0, itemsTotal: 2,
          },
        },
      },
      plausibility: {
        flags: [{ code: 'fibre_on_fish_like_name', itemId: 'a', fibreG: 40 }],
      },
      timingCoverage: {
        mealSlotsTotal: 1,
        mealSlotsWithTime: 1,
        windowComplete: true,
        partial: false,
      },
      includeFoodLabels: false,
    });

    assert.equal(evidence.policy.noDeficiencyClaims, true);
    assert.equal(evidence.micronutrients.vitB12.judgement, null);
    assert.equal(evidence.micronutrients.vitB12.usableForObservation, false);
    assert.equal(evidence.foodContributions.every((c) => c.name === null), true);
    assert.ok(evidence.excludedFromAdvice.some((e) => e.reason === 'fibre_on_fish_like_name'));

    const labeled = withUsability(
      { value: 40, provenance: FOCUS_PROVENANCE.recorded, unit: 'g' },
      false,
      'fibre_on_fish_like_name',
    );
    assert.equal(labeled.usableForJudgement, false);
    assert.equal(labeled.value, 40);
  });
});
